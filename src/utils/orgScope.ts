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

/**
 * Every localStorage key that holds IDENTITY, SESSION, CONTEXT or
 * CACHED FINANCIAL data. These MUST be wiped on logout / session
 * invalidation — otherwise, on a shared or public device, the next
 * person can read the previous user's token, role, org context, or
 * cached dashboard/payments. (Pure UX prefs — theme, settings — are
 * deliberately NOT here; they're not sensitive and survive logout.)
 */
const SENSITIVE_STORAGE_KEYS: readonly string[] = [
  // Auth + identity
  'pvx_jwt', 'pvx_auth', 'pvx_member_id', 'pvx_org_id', 'pvx_org_slug',
  'pvx_group_id', 'pvx_group',
  // Role + org/system context
  'pvx_active_role', 'pvx_organization', 'pvx_sys_ctx', 'pvx_privacy_mask',
  // Cached financial data (the real leak)
  'offline_pending_payments', 'cached_payment_types', 'cached_dashboard_data',
  'last_sync_timestamp',
  // Legacy single-tenant auth keys
  'current_user_id', 'auth_session',
];

/**
 * Wipe all sensitive app storage. Call on every logout path + on
 * session invalidation. Idempotent and failure-tolerant.
 */
export function clearAppStorage(): void {
  try {
    for (const k of SENSITIVE_STORAGE_KEYS) {
      localStorage.removeItem(k);
    }
    // Defensive sweep: any future pvx_/cached_/offline_ key we forgot
    // to enumerate still gets cleared, while UX prefs (pvx_theme,
    // pvx_settings) are explicitly preserved.
    const preserve = new Set(['pvx_theme', 'pvx_settings']);
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const key = localStorage.key(i);
      if (!key) continue;
      if (preserve.has(key)) continue;
      if (key.startsWith('pvx_') || key.startsWith('cached_') || key.startsWith('offline_')) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    /* storage unavailable — nothing to clear */
  }
}

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
