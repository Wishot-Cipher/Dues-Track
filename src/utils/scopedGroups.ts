/**
 * scopedGroups — resolve the set of organization_groups.id a user can
 * read/manage based on their ACTIVE role.
 *
 * Strategic rule:
 *   • Org-scope active role        → null (no filter; see everything
 *                                    in the org)
 *   • Unit-scope active role       → that unit + all descendants
 *                                    (a faculty exec sees their
 *                                    faculty, every dept under it,
 *                                    every class under those)
 *   • Group-scope active role      → just that group
 *   • No active exec role          → null (no filter; class-rep /
 *                                    org-owner default flows use
 *                                    their own primary group_id
 *                                    elsewhere)
 *
 * Callers use the returned Set<string> as an IN() filter on
 * payment_types.group_id, organization_members.group_id, etc.
 *
 * Server-side RLS is the actual authority — this helper just shapes
 * the query so the UI doesn't pull payloads it can't display.
 */

import { supabase } from '@/config/supabase';

export interface ScopedGroupsInput {
  /** organizations.id — required so we can scope the descendant walk. */
  orgId: string;
  /**
   * The active role's group_id (from useActiveRole().activeRole.groupId).
   * Null when the user is acting org-wide or has no exec role yet.
   */
  activeGroupId: string | null;
  /**
   * The active role's scope_level. 'org' or undefined → no filter;
   * 'unit' / 'group' → descend from activeGroupId.
   */
  activeScopeLevel?: 'org' | 'unit' | 'group' | null;
}

/**
 * In-memory cache for the per-org organization_groups list. Used to
 * be refetched on every admin page mount that calls getScopedGroupIds
 * (ManageDuesPage, AdminReviewPage, WaivePaymentPage, OrgGroupsPage…
 * — every one of them spent a round-trip on the same handful of rows
 * before they could even start their real query). Group hierarchy is
 * stable per session; a 60-second TTL keeps the cache fresh enough
 * for the occasional add-a-class edit while saving 99% of the
 * repeated reads.
 */
const ORG_GROUPS_TTL_MS = 60_000;
type GroupRow = { id: string; parent_group_id: string | null };
const orgGroupsCache = new Map<string, { rows: GroupRow[]; at: number }>();

export function invalidateOrgGroupsCache(orgId?: string): void {
  if (orgId) {
    orgGroupsCache.delete(orgId);
    return;
  }
  orgGroupsCache.clear();
}

async function loadOrgGroups(orgId: string): Promise<GroupRow[] | null> {
  const hit = orgGroupsCache.get(orgId);
  if (hit && Date.now() - hit.at < ORG_GROUPS_TTL_MS) return hit.rows;

  const { data, error } = await supabase
    .from('organization_groups')
    .select('id, parent_group_id')
    .eq('organization_id', orgId);
  if (error || !data) return null;
  const rows = data as GroupRow[];
  orgGroupsCache.set(orgId, { rows, at: Date.now() });
  return rows;
}

/**
 * OwnedTierScope — the dues/expenses a tier exec actually OWNS.
 *
 * The tier-autonomy rule: each tier (class / department / faculty /
 * org) manages ONLY the dues IT created, never the dues of the tiers
 * below it. A department president sees + edits + waives department
 * dues; the class's own dues belong to the class rep / fin sec /
 * treasurer alone. This is DIFFERENT from getScopedGroupIds (which
 * walks the whole subtree) — that one is only for finding the MEMBERS
 * a tier-due applies to (the waive member-picker), never for the dues
 * list itself.
 *
 *   'org-wide'   org-scope exec → only org-wide dues (group_id IS NULL)
 *   'group'      class/dept/faculty exec → only that exact group's dues
 *   'unscoped'   no active exec role → don't add a tier filter
 *                (member/self views resolve their own scope elsewhere)
 */
export type OwnedTierScope =
  | { mode: 'org-wide' }
  | { mode: 'group'; groupId: string }
  | { mode: 'unscoped' };

export function getOwnedTierScope(input: {
  activeKind?: 'student' | 'exec' | null;
  activeGroupId?: string | null;
  activeScopeLevel?: 'org' | 'unit' | 'group' | null;
}): OwnedTierScope {
  const { activeKind, activeGroupId, activeScopeLevel } = input;
  if (activeKind !== 'exec' || !activeScopeLevel) return { mode: 'unscoped' };
  if (activeScopeLevel === 'org') return { mode: 'org-wide' };
  if (activeGroupId) return { mode: 'group', groupId: activeGroupId };
  return { mode: 'unscoped' };
}

/**
 * Apply an OwnedTierScope to a Supabase query builder on a table that
 * has a `group_id` column (payment_types, expenses). Centralizes the
 * three-way branch so every consumer stays consistent.
 *
 *   org-wide → .is('group_id', null)   (only the org's own dues)
 *   group    → .eq('group_id', id)     (only that tier's dues)
 *   unscoped → unchanged
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function applyOwnedTierScope<T extends { is: any; eq: any }>(
  query: T,
  scope: OwnedTierScope,
): T {
  if (scope.mode === 'org-wide') return query.is('group_id', null);
  if (scope.mode === 'group') return query.eq('group_id', scope.groupId);
  return query;
}

/**
 * Returns a Set of organization_groups.id the caller's active role
 * covers. Returns null when no filter should apply (org-scope or
 * missing role context).
 *
 * NOTE: subtree walker — use ONLY for finding members a tier-due
 * applies to (the waive member-picker). For the dues/expenses LIST,
 * use getOwnedTierScope (own tier only) instead, or a dept exec will
 * see the dues of every class below them.
 */
export async function getScopedGroupIds(
  input: ScopedGroupsInput,
): Promise<Set<string> | null> {
  const { orgId, activeGroupId, activeScopeLevel } = input;

  if (!orgId) return null;
  if (!activeScopeLevel || activeScopeLevel === 'org') return null;
  if (!activeGroupId) return null;

  const rows = await loadOrgGroups(orgId);
  if (!rows) return null;

  // BFS down from activeGroupId so we collect every descendant.
  const childrenByParent = new Map<string, string[]>();
  for (const g of rows) {
    if (!g.parent_group_id) continue;
    const list = childrenByParent.get(g.parent_group_id) || [];
    list.push(g.id);
    childrenByParent.set(g.parent_group_id, list);
  }

  const out = new Set<string>([activeGroupId]);
  const stack = [activeGroupId];
  while (stack.length) {
    const id = stack.pop()!;
    const kids = childrenByParent.get(id) || [];
    for (const k of kids) {
      if (!out.has(k)) {
        out.add(k);
        stack.push(k);
      }
    }
  }
  return out;
}
