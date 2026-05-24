/**
 * Platform Admin Service
 *
 * Authenticates platform operators (super admins) and proxies privileged
 * RPCs (org status toggle, subscription updates, trial extension) that
 * are gated by a server-side session token — see migration 044.
 *
 * Key invariants:
 *   • Session token + expiry come from the DB on login; we store both
 *     in sessionStorage as opaque values and pass the token back to
 *     every privileged RPC.
 *   • Permission flags (can_manage_organizations, ...) come from the
 *     DB row and are never overridden client-side. The RPCs re-check
 *     them server-side anyway, so client-side checks are advisory.
 *   • A stale / expired token causes every privileged RPC to return
 *     `{ ok: false, error: 'Session expired ...' }` and the UI should
 *     clear the session and redirect to login.
 *
 * NOTE: this service is completely separate from the org-level
 * member_admins system.
 */

import { supabase } from '@/config/supabase';

const PLATFORM_KEY = 'pvx_sys_ctx';

export interface PlatformAdmin {
  id: string;
  email: string;
  full_name: string;
  can_manage_organizations: boolean;
  can_manage_subscriptions: boolean;
  can_view_all_data: boolean;
  can_manage_platform_admins: boolean;
  can_impersonate: boolean;
  is_active: boolean;
  last_login_at: string | null;
  session_token: string;
  session_expires_at: string;
}

export interface OrgOverview {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  is_active: boolean;
  created_at: string;
  member_count: number;
  payment_count: number;
  total_collected: number;
  subscription_plan: string;
  subscription_expires_at: string | null;
  is_on_trial: boolean;
  trial_ends_at: string | null;
  max_groups: number;
  max_members: number;
  max_admins: number;
  organization_type: string;
}

export interface PlatformStats {
  totalOrganizations: number;
  activeOrganizations: number;
  totalMembers: number;
  totalPayments: number;
  totalCollected: number;
  recentOrgs: OrgOverview[];
}

interface AdminRpcRow {
  id: string;
  email: string;
  full_name: string;
  can_manage_organizations?: boolean | null;
  can_manage_subscriptions?: boolean | null;
  can_view_all_data?: boolean | null;
  can_manage_platform_admins?: boolean | null;
  can_impersonate?: boolean | null;
  is_active: boolean;
  last_login_at: string | null;
  session_token: string;
  session_expires_at: string;
}

function rowToAdmin(row: AdminRpcRow): PlatformAdmin {
  return {
    id: row.id,
    email: row.email,
    full_name: row.full_name,
    // Trust the DB row verbatim — older code overrode every flag to `true`
    // before mig 044. Null defaults to false (deny).
    can_manage_organizations:   row.can_manage_organizations   ?? false,
    can_manage_subscriptions:   row.can_manage_subscriptions   ?? false,
    can_view_all_data:          row.can_view_all_data          ?? false,
    can_manage_platform_admins: row.can_manage_platform_admins ?? false,
    can_impersonate:            row.can_impersonate            ?? false,
    is_active: row.is_active,
    last_login_at: row.last_login_at,
    session_token: row.session_token,
    session_expires_at: row.session_expires_at,
  };
}

function persistAdmin(admin: PlatformAdmin): void {
  sessionStorage.setItem(PLATFORM_KEY, JSON.stringify(admin));
}

/**
 * Authenticate a platform admin via email + password.
 * The server rotates the session token on every login.
 */
export async function platformAdminLogin(email: string, password: string): Promise<PlatformAdmin> {
  const normalizedEmail = email.toLowerCase().trim();

  const tryVerify = async (rpcName: 'verify_super_admin' | 'verify_platform_admin') => {
    const { data, error } = await supabase.rpc(rpcName, {
      p_email: normalizedEmail,
      p_password: password,
    });
    if (error) {
      // Function-not-found → try the alias; anything else is a real failure.
      if (error.message?.includes('Could not find the function') || error.code === '42883') {
        return null;
      }
      throw new Error(error.message || 'Authentication failed');
    }
    if (!data || (Array.isArray(data) && data.length === 0)) return null;
    return Array.isArray(data) ? data[0] : data;
  };

  const row =
    (await tryVerify('verify_super_admin')) ??
    (await tryVerify('verify_platform_admin'));

  if (!row) throw new Error('Invalid email or password');
  if (!row.is_active) throw new Error('Account is deactivated');
  if (!row.session_token) throw new Error('Server did not issue a session token. Run migration 044.');

  const admin = rowToAdmin(row as AdminRpcRow);
  persistAdmin(admin);
  return admin;
}

/**
 * Step 1 of passwordless email-code login (mig 050).
 *
 * Asks the server to issue a 6-digit code and email it to the
 * given admin email. Returns the request_token the user will pair
 * with the code in step 2. The code itself NEVER comes back to
 * the browser — the API emails it server-side and discards it.
 *
 * Anti-enumeration: the server returns the same shape regardless
 * of whether the email is a real admin. So a failed `sent:false`
 * does NOT necessarily mean the email was wrong — it might also
 * mean we're reusing a code issued <60s ago.
 */
export async function platformAdminRequestCode(email: string): Promise<{
  ok: boolean;
  request_token?: string;
  expires_at?: string;
  sent?: boolean;
  error?: string;
}> {
  const normalized = email.toLowerCase().trim();
  if (!normalized || !normalized.includes('@')) {
    return { ok: false, error: 'A valid email is required.' };
  }
  try {
    const res = await fetch('/api/console/request-code', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: normalized }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, error: json?.error || `Request failed (${res.status})` };
    }
    return json;
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Network error';
    return { ok: false, error: msg };
  }
}

/**
 * Step 2 of passwordless email-code login.
 *
 * Exchanges (request_token, code) for a session token via the
 * verify_admin_login_code RPC (mig 050). On success the admin is
 * cached in sessionStorage the same way password login does, so
 * the rest of the console code reads it unchanged.
 */
export async function platformAdminVerifyCode(
  requestToken: string,
  code: string,
): Promise<PlatformAdmin> {
  const trimmedCode = (code || '').replace(/\s+/g, '');
  if (!requestToken || !trimmedCode) {
    throw new Error('Both request token and code are required.');
  }

  const { data, error } = await supabase.rpc('verify_admin_login_code', {
    p_request_token: requestToken,
    p_code: trimmedCode,
  });

  if (error) {
    // Same fallback pattern as password login — function missing
    // means the migration hasn't been applied yet.
    if (error.message?.includes('Could not find the function') || error.code === '42883') {
      throw new Error('Email login is not yet enabled. Run migration 050.');
    }
    throw new Error(error.message || 'Verification failed');
  }
  if (!data || (Array.isArray(data) && data.length === 0)) {
    // RPC returns empty when code is wrong/expired/used/locked.
    throw new Error('That code is invalid, expired, or already used.');
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row.is_active) throw new Error('Account is deactivated');
  if (!row.session_token) throw new Error('Server did not issue a session token.');

  const admin = rowToAdmin(row as AdminRpcRow);
  persistAdmin(admin);
  return admin;
}

/**
 * Get the current cached platform admin (if any). This does NOT re-verify
 * the token with the server — callers should follow up with `verifySession()`
 * on mount and on tab focus.
 */
export function getPlatformAdmin(): PlatformAdmin | null {
  try {
    const raw = sessionStorage.getItem(PLATFORM_KEY);
    if (!raw) return null;
    const admin = JSON.parse(raw) as PlatformAdmin;
    if (admin.session_expires_at && new Date(admin.session_expires_at).getTime() < Date.now()) {
      sessionStorage.removeItem(PLATFORM_KEY);
      return null;
    }
    return admin;
  } catch {
    return null;
  }
}

/**
 * Re-verify the cached token against the server. Returns the fresh admin
 * row (if still valid) or null (caller should clear session and redirect).
 */
export async function verifySession(): Promise<PlatformAdmin | null> {
  const cached = getPlatformAdmin();
  if (!cached?.session_token) return null;

  const { data, error } = await supabase.rpc('verify_session_token', {
    p_token: cached.session_token,
  });
  if (error) {
    console.error('[Platform] verify_session_token error', error);
    return null;
  }
  if (!data || (Array.isArray(data) && data.length === 0)) {
    sessionStorage.removeItem(PLATFORM_KEY);
    return null;
  }
  const row = Array.isArray(data) ? data[0] : data;
  const admin = rowToAdmin(row as AdminRpcRow);
  persistAdmin(admin);
  return admin;
}

/**
 * Logout — invalidates the token server-side and clears the cache.
 */
export async function platformAdminLogout(): Promise<void> {
  const cached = getPlatformAdmin();
  sessionStorage.removeItem(PLATFORM_KEY);
  if (cached?.session_token) {
    try {
      await supabase.rpc('platform_logout', { p_token: cached.session_token });
    } catch (err) {
      console.warn('[Platform] platform_logout RPC failed (clearing local session anyway)', err);
    }
  }
}

/**
 * Surfaces session-expired errors from privileged RPC responses so the UI
 * can redirect to login.
 */
function unwrap<T extends { ok: boolean; error?: string }>(data: T | null): T {
  if (!data) throw new Error('Empty RPC response');
  if (!data.ok) {
    const msg = data.error || 'Unknown error';
    if (/session expired|sign in again/i.test(msg)) {
      sessionStorage.removeItem(PLATFORM_KEY);
    }
    throw new Error(msg);
  }
  return data;
}

/* ──────────────────────────────────────────────────────────────
 * Data fetching
 * ──────────────────────────────────────────────────────────── */

export async function fetchOrganizations(): Promise<OrgOverview[]> {
  const admin = getPlatformAdmin();
  if (!admin) throw new Error('Not authenticated');

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url, is_active, created_at, subscription_plan, subscription_expires_at, is_on_trial, trial_ends_at, max_groups, max_members, max_admins, organization_type')
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!orgs) return [];

  const results: OrgOverview[] = [];
  for (const org of orgs) {
    const [memberRes, paymentRes] = await Promise.all([
      supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.id),
      supabase
        .from('payments')
        .select('amount')
        .eq('organization_id', org.id)
        .eq('status', 'approved'),
    ]);

    const memberCount = memberRes.count || 0;
    const payments = paymentRes.data || [];
    const totalCollected = payments.reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

    results.push({
      ...org,
      member_count: memberCount,
      payment_count: payments.length,
      total_collected: totalCollected,
    });
  }

  return results;
}

export async function fetchPlatformStats(): Promise<PlatformStats> {
  const orgs = await fetchOrganizations();
  return {
    totalOrganizations: orgs.length,
    activeOrganizations: orgs.filter(o => o.is_active).length,
    totalMembers: orgs.reduce((sum, o) => sum + o.member_count, 0),
    totalPayments: orgs.reduce((sum, o) => sum + o.payment_count, 0),
    totalCollected: orgs.reduce((sum, o) => sum + o.total_collected, 0),
    recentOrgs: orgs.slice(0, 10),
  };
}

export async function fetchAllOrganizations(): Promise<OrgOverview[]> {
  return fetchOrganizations();
}

/* ──────────────────────────────────────────────────────────────
 * Privileged mutations — all token-gated by the RPC
 * ──────────────────────────────────────────────────────────── */

export async function toggleOrganizationStatus(orgId: string, isActive: boolean): Promise<void> {
  const admin = getPlatformAdmin();
  if (!admin) throw new Error('Not authenticated');

  const { data, error } = await supabase.rpc('set_organization_status', {
    p_session_token: admin.session_token,
    p_org_id: orgId,
    p_is_active: isActive,
  });
  if (error) throw new Error(error.message);
  unwrap(data as { ok: boolean; error?: string });
}

export async function updateOrgSubscription(
  orgId: string,
  plan: 'free' | 'starter' | 'professional' | 'enterprise',
  options?: {
    max_groups?: number;
    max_members?: number;
    max_admins?: number;
    subscription_expires_at?: string | null;
    is_on_trial?: boolean;
    trial_ends_at?: string | null;
  }
): Promise<void> {
  const admin = getPlatformAdmin();
  if (!admin) throw new Error('Not authenticated');

  const planLimits: Record<string, { max_groups: number; max_members: number; max_admins: number }> = {
    free:         { max_groups: 1,   max_members: 50,    max_admins: 3 },
    starter:      { max_groups: 3,   max_members: 300,   max_admins: 10 },
    professional: { max_groups: 20,  max_members: 5000,  max_admins: 50 },
    enterprise:   { max_groups: 999, max_members: 99999, max_admins: 999 },
  };
  const defaults = planLimits[plan];

  const { data, error } = await supabase.rpc('update_organization_subscription', {
    p_session_token: admin.session_token,
    p_org_id: orgId,
    p_plan: plan,
    p_max_groups: options?.max_groups ?? defaults.max_groups,
    p_max_members: options?.max_members ?? defaults.max_members,
    p_max_admins: options?.max_admins ?? defaults.max_admins,
    p_subscription_expires_at: options?.subscription_expires_at ?? null,
    p_is_on_trial: options?.is_on_trial ?? false,
    p_trial_ends_at: options?.trial_ends_at ?? null,
  });
  if (error) throw new Error(error.message);
  unwrap(data as { ok: boolean; error?: string });
}

export async function extendTrial(orgId: string, days: number): Promise<void> {
  const admin = getPlatformAdmin();
  if (!admin) throw new Error('Not authenticated');

  const { data, error } = await supabase.rpc('extend_organization_trial', {
    p_session_token: admin.session_token,
    p_org_id: orgId,
    p_days: days,
  });
  if (error) throw new Error(error.message);
  unwrap(data as { ok: boolean; error?: string });
}

/* ──────────────────────────────────────────────────────────────
 * Billing history (read-only)
 * ──────────────────────────────────────────────────────────── */

export interface BillingTransaction {
  id: string;
  organization_id: string;
  amount: number;
  currency: string;
  plan: string;
  billing_cycle: string;
  status: string;
  payment_reference: string | null;
  payment_provider: string | null;
  created_at: string;
}

export async function fetchOrgBillingHistory(orgId: string): Promise<BillingTransaction[]> {
  const admin = getPlatformAdmin();
  if (!admin?.can_view_all_data) throw new Error('Insufficient permissions');

  const { data, error } = await supabase
    .from('billing_transactions')
    .select('*')
    .eq('organization_id', orgId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    console.error('[Platform] Error fetching billing history:', error);
    return [];
  }
  return data || [];
}
