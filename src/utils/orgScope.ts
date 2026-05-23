/**
 * Organization Scoping Utility
 * Provides the current org context for data isolation in multi-tenant mode.
 *
 * Usage in services:
 *   import { getOrgScope } from '@/utils/orgScope';
 *
 *   const scope = getOrgScope();          // { orgId, orgSlug } | null
 *   if (scope) {
 *     query = query.eq('organization_id', scope.orgId);
 *   }
 *
 * SECURITY: Every Supabase query that touches shared tables (payments,
 * payment_types, expenses, notifications, etc.) MUST filter by
 * organization_id and group_id when running in multi-tenant mode.
 */

const SESSION_KEYS = {
  ORG_ID: 'pvx_org_id',
  ORG_SLUG: 'pvx_org_slug',
  AUTH: 'pvx_auth',
  MEMBER_ID: 'pvx_member_id',
  GROUP_ID: 'pvx_group_id',
} as const;

export interface OrgScope {
  orgId: string;
  orgSlug: string;
  memberId: string;
  groupId: string;
}

/**
 * Get the current organization scope from the session.
 * Returns null when running in single-tenant (legacy) mode
 * or when no multi-tenant session is active.
 */
export function getOrgScope(): OrgScope | null {
  try {
    const auth = localStorage.getItem(SESSION_KEYS.AUTH);
    if (auth !== 'active') return null;

    const orgId = localStorage.getItem(SESSION_KEYS.ORG_ID);
    const orgSlug = localStorage.getItem(SESSION_KEYS.ORG_SLUG);
    const memberId = localStorage.getItem(SESSION_KEYS.MEMBER_ID);
    const groupId = localStorage.getItem(SESSION_KEYS.GROUP_ID);

    if (!orgId || !orgSlug || !memberId || !groupId) return null;

    return { orgId, orgSlug, memberId, groupId };
  } catch {
    return null;
  }
}

/**
 * Get the org ID or throw — for use in services that REQUIRE org context.
 */
export function requireOrgScope(): OrgScope {
  const scope = getOrgScope();
  if (!scope) {
    throw new Error('Organization context is required. Please log in to an organization.');
  }
  return scope;
}

/**
 * Check if we're currently in multi-tenant mode.
 */
export function isMultiTenantMode(): boolean {
  return getOrgScope() !== null;
}
