/**
 * Platform Admin Service
 * Handles authentication and data access for Payvexo platform administrators.
 * This is completely separate from the org-level admin system.
 * 
 * @author Dev_Wishot
 * @copyright Dev_Wishot - @wishotstudio
 */

import { supabase } from '@/config/supabase';

// Storage key (deliberately vague name)
const PLATFORM_KEY = 'pvx_sys_ctx';

export interface PlatformAdmin {
  id: string;
  email: string;
  full_name: string;
  can_manage_organizations: boolean;
  can_manage_subscriptions: boolean;
  can_view_all_data: boolean;
  can_manage_platform_admins: boolean;
  is_active: boolean;
  last_login_at: string | null;
  // Session secret — required to call session-validated platform RPCs
  // (e.g. platform_grant_claim). Stored in sessionStorage only.
  session_token?: string | null;
  session_expires_at?: string | null;
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
  // Billing fields
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

export interface ConsoleCodeRequestResponse {
  ok: boolean;
  request_token?: string;
  expires_at?: string;
  sent?: boolean;
  debug?: string;
  error?: string;
}

function savePlatformSession(admin: PlatformAdmin): PlatformAdmin {
  const session = {
    id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    can_manage_organizations: admin.can_manage_organizations,
    can_manage_subscriptions: admin.can_manage_subscriptions,
    can_view_all_data: admin.can_view_all_data,
    can_manage_platform_admins: admin.can_manage_platform_admins,
    is_active: admin.is_active,
    last_login_at: admin.last_login_at,
    session_token: admin.session_token ?? null,
    session_expires_at: admin.session_expires_at ?? null,
    ts: Date.now(),
  };
  sessionStorage.setItem(PLATFORM_KEY, JSON.stringify(session));
  return session;
}

/**
 * Authenticate a platform admin via email + password
 * Uses bcrypt check against platform_admins table
 */
export async function platformAdminLogin(email: string, password: string): Promise<PlatformAdmin> {
  const normalizedEmail = email.toLowerCase().trim();

  const tryVerify = async (rpcName: 'verify_super_admin' | 'verify_platform_admin') => {
    const { data, error } = await supabase.rpc(rpcName, {
      p_email: normalizedEmail,
      p_password: password,
    });

    if (error) {
      if (error.message?.includes('Could not find the function') || error.code === '42883') {
        return null;
      }
      throw new Error(error.message || 'Authentication failed');
    }

    if (!data || (Array.isArray(data) && data.length === 0)) {
      return null;
    }

    return Array.isArray(data) ? data[0] : data;
  };

  const superAdmin = await tryVerify('verify_super_admin');
  const admin = superAdmin || await tryVerify('verify_platform_admin');

  if (!admin) {
    throw new Error('Invalid email or password');
  }

  if (!admin.is_active) throw new Error('Account is deactivated');

  return savePlatformSession({
    id: admin.id,
    email: admin.email,
    full_name: admin.full_name,
    can_manage_organizations: true,
    can_manage_subscriptions: true,
    can_view_all_data: true,
    can_manage_platform_admins: true,
    is_active: admin.is_active,
    last_login_at: admin.last_login_at,
  });
}

/**
 * Request a passwordless console sign-in code.
 */
export async function platformAdminRequestCode(email: string): Promise<ConsoleCodeRequestResponse> {
  const res = await fetch('/api/console/request-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email }),
  });

  const data = (await res.json().catch(() => ({}))) as ConsoleCodeRequestResponse;
  if (!res.ok || data.ok === false) {
    return {
      ok: false,
      error: data.error || 'Could not request a sign-in code.',
      debug: data.debug,
    };
  }

  return data;
}

/**
 * Verify the emailed console code and create a local platform session.
 */
export async function platformAdminVerifyCode(requestToken: string, code: string): Promise<PlatformAdmin> {
  const res = await fetch('/api/console/verify-code', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request_token: requestToken, code }),
  });

  const data = await res.json().catch(() => null) as {
    ok?: boolean;
    admin?: PlatformAdmin;
    platform_admin?: PlatformAdmin;
    error?: string;
  } | null;

  if (!res.ok || !data?.ok) {
    throw new Error(data?.error || 'Verification failed');
  }

  const admin = data.admin || data.platform_admin;
  if (!admin) {
    throw new Error('Verification succeeded but no admin data was returned');
  }

  return savePlatformSession(admin);
}

/**
 * Get current platform admin session (if any)
 */
export function getPlatformAdmin(): PlatformAdmin | null {
  try {
    const raw = sessionStorage.getItem(PLATFORM_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    // Expire after 4 hours
    if (Date.now() - session.ts > 4 * 60 * 60 * 1000) {
      sessionStorage.removeItem(PLATFORM_KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

/**
 * Verify the current platform admin session on page load / tab focus.
 *
 * The console currently relies on the cached session token stored in
 * sessionStorage, so verification means ensuring the cached payload is
 * still present and not expired. Returns null when the session is gone.
 */
export async function verifySession(): Promise<PlatformAdmin | null> {
  return getPlatformAdmin();
}

/**
 * Logout platform admin
 */
export function platformAdminLogout(): void {
  sessionStorage.removeItem(PLATFORM_KEY);
}

// ── Verification queue (graduated trust) ─────────────────────────

export interface PendingClaim {
  id: string;
  claimant_name: string;
  position_title: string;
  claimed_role: string;
  claimed_scope: string;
  votes_received: number;
  votes_required: number;
  current_layer: number;
  layer3_reached_at: string | null;
  platform_review_requested_at: string | null;
  has_financial_history: boolean;
  institutional_email: string | null;
  created_at: string;
  org_name: string;
  org_slug: string;
  organization_type: string;
  target_group_name: string | null;
  is_independent: boolean;
  dispute_count: number;
  higher_exec_exists: boolean;
}

/** Full verification queue — every in-flight claim with computed context. */
export async function listPendingClaims(): Promise<PendingClaim[]> {
  const admin = getPlatformAdmin();
  if (!admin?.session_token) throw new Error('Not authenticated');
  const { data, error } = await supabase.rpc('platform_list_pending_claims', { p_session_token: admin.session_token });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || 'Could not load the verification queue');
  return (data.claims || []) as PendingClaim[];
}

/** Path-D override: grant Layer 4 to a stuck claim (session-validated server-side). */
export async function grantClaimOverride(claimId: string): Promise<void> {
  const admin = getPlatformAdmin();
  if (!admin?.session_token) throw new Error('Not authenticated');
  const { data, error } = await supabase.rpc('platform_grant_claim', {
    p_session_token: admin.session_token,
    p_claim_id: claimId,
  });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || 'Grant failed');
}

/** Reject / dismiss an in-flight exec claim. */
export async function rejectClaim(claimId: string, reason?: string): Promise<void> {
  await callPlatformRpc('platform_reject_claim', { p_claim_id: claimId, p_reason: reason ?? null });
}

// ── Org admin management (revoke suspicious roles) ───────────────
export interface OrgAdminRow {
  admin_id: string;
  member_id: string;
  scope_level: string;
  role: string | null;
  role_label: string | null;
  is_active: boolean;
  verification_layer: number;
  verification_status: string | null;
  full_name: string;
  email: string | null;
  human_id: string | null;
  group_name: string | null;
}
export const listOrgAdmins = async (orgId: string) =>
  (await callPlatformRpc<{ ok: boolean; admins: OrgAdminRow[] }>('platform_list_org_admins', { p_org_id: orgId })).admins;

export async function setAdminActive(adminId: string, active: boolean, reason?: string): Promise<void> {
  await callPlatformRpc('platform_set_admin_active', { p_admin_id: adminId, p_active: active, p_reason: reason ?? null });
}

// ── Financial intelligence / audit / analytics ──────────────────

async function callPlatformRpc<T = Record<string, unknown>>(fn: string, extra: Record<string, unknown> = {}): Promise<T> {
  const admin = getPlatformAdmin();
  if (!admin?.session_token) throw new Error('Not authenticated');
  const { data, error } = await supabase.rpc(fn, { p_session_token: admin.session_token, ...extra });
  if (error) throw new Error(error.message);
  if (!data?.ok) throw new Error(data?.error || 'Request failed');
  return data as T;
}

export interface FinancialSummary {
  ok: boolean;
  summary: {
    mtd_gross_kobo: number; mtd_dues_kobo: number; mtd_fees_kobo: number;
    mtd_success: number; mtd_failed: number; alltime_fees_kobo: number;
    pending_settlement_kobo: number; orgs_with_payout: number;
  };
  recent: Array<{ id: string; payer_name: string | null; total_charged_kobo: number; platform_fee_kobo: number; dues_amount_kobo: number; status: string; paystack_channel: string | null; created_at: string; org_name: string; org_slug: string }>;
  top_orgs: Array<{ org_name: string; org_slug: string; collected_kobo: number; txns: number }>;
}

export const getFinancialSummary = () => callPlatformRpc<FinancialSummary>('platform_financial_summary');

export interface AuditEntry { id: number; admin_email: string; action: string; target_type: string | null; target_id: string | null; payload: Record<string, unknown>; created_at: string }
export const getAuditFeed = async (limit = 50) =>
  (await callPlatformRpc<{ ok: boolean; entries: AuditEntry[] }>('platform_audit_feed', { p_limit: limit })).entries;

export interface FunnelStage { stage: string; count: number }
export const getGrowthFunnel = async () =>
  (await callPlatformRpc<{ ok: boolean; funnel: FunnelStage[] }>('platform_growth_funnel')).funnel;

export interface PlatformSettings {
  fee_mode: string; fee_percent: number; fee_flat_kobo: number; fee_min_kobo: number; fee_cap_kobo: number;
  bootstrap_base_votes: number; bootstrap_escalated_votes: number; bootstrap_window_hours: number;
  independent_votes: number; platform_review_days: number;
}
export const getPlatformSettings = async () =>
  (await callPlatformRpc<{ ok: boolean; settings: PlatformSettings }>('platform_get_settings')).settings;
export async function updatePlatformSettings(patch: Partial<PlatformSettings> & { apply_fee_to_all_orgs?: boolean }): Promise<PlatformSettings> {
  const d = await callPlatformRpc<{ ok: boolean; settings: PlatformSettings }>('platform_update_settings', { p_patch: patch });
  return d.settings;
}

// ── Trust & Safety / University map / Communications ─────────────
export async function suspendMember(memberId: string, suspend: boolean, reason?: string): Promise<void> {
  await callPlatformRpc('platform_set_member_suspended', { p_member_id: memberId, p_suspend: suspend, p_reason: reason ?? null });
}

export interface UniRow { org_id: string; org_name: string; org_slug: string; organization_type: string; member_count: number; group_count: number; verified_execs: number; collected_kobo: number; org_state: string }
export const getUniversityMap = async () =>
  (await callPlatformRpc<{ ok: boolean; rows: UniRow[] }>('platform_university_map')).rows;

export async function broadcast(orgId: string | null, title: string, message: string): Promise<number> {
  const d = await callPlatformRpc<{ ok: boolean; notified: number }>('platform_broadcast', { p_org_id: orgId, p_title: title, p_message: message });
  return d.notified;
}

/**
 * Fetch all organizations with aggregated stats
 */
export async function fetchOrganizations(): Promise<OrgOverview[]> {
  const admin = getPlatformAdmin();
  if (!admin) throw new Error('Not authenticated');

  const { data: orgs, error } = await supabase
    .from('organizations')
    .select('id, name, slug, logo_url, is_active, created_at, subscription_plan, subscription_expires_at, is_on_trial, trial_ends_at, max_groups, max_members, max_admins, organization_type')
    .order('created_at', { ascending: false });

  if (error) throw error;
  if (!orgs) return [];

  // For each org, get member count and payment stats
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

/**
 * Fetch platform-wide statistics
 */
export async function fetchPlatformStats(): Promise<PlatformStats> {
  const orgs = await fetchOrganizations();

  const totalOrganizations = orgs.length;
  const activeOrganizations = orgs.filter(o => o.is_active).length;
  const totalMembers = orgs.reduce((sum, o) => sum + o.member_count, 0);
  const totalPayments = orgs.reduce((sum, o) => sum + o.payment_count, 0);
  const totalCollected = orgs.reduce((sum, o) => sum + o.total_collected, 0);

  return {
    totalOrganizations,
    activeOrganizations,
    totalMembers,
    totalPayments,
    totalCollected,
    recentOrgs: orgs.slice(0, 10),
  };
}

/**
 * Toggle org active status
 */
export async function toggleOrganizationStatus(orgId: string, isActive: boolean): Promise<void> {
  // set_organization_status takes (p_session_token, p_org_id, p_is_active) and
  // returns { ok } — callPlatformRpc injects the token and unwraps the result.
  await callPlatformRpc('set_organization_status', { p_org_id: orgId, p_is_active: isActive });
}

/**
 * Update an organization's subscription plan from the platform console
 */
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
  if (!admin?.can_manage_subscriptions) throw new Error('Insufficient permissions');

  // Plan defaults
  // Size is NEVER capped (free + unlimited model). Every plan is unlimited
  // members/groups/admins (-1); plans differ by value-add features + the
  // transaction fee, not by org size.
  const planLimits: Record<string, { max_groups: number; max_members: number; max_admins: number }> = {
    free:         { max_groups: -1, max_members: -1, max_admins: -1 },
    starter:      { max_groups: -1, max_members: -1, max_admins: -1 },
    professional: { max_groups: -1, max_members: -1, max_admins: -1 },
    enterprise:   { max_groups: -1, max_members: -1, max_admins: -1 },
  };

  const defaults = planLimits[plan];

  await callPlatformRpc('update_organization_subscription', {
    p_org_id: orgId,
    p_plan: plan,
    p_max_groups: options?.max_groups ?? defaults.max_groups,
    p_max_members: options?.max_members ?? defaults.max_members,
    p_max_admins: options?.max_admins ?? defaults.max_admins,
    p_subscription_expires_at: options?.subscription_expires_at ?? null,
    p_is_on_trial: options?.is_on_trial ?? false,
    p_trial_ends_at: options?.trial_ends_at ?? null,
  });
}

/**
 * Extend an organization's trial period
 */
export async function extendTrial(orgId: string, days: number): Promise<void> {
  await callPlatformRpc('extend_organization_trial', { p_org_id: orgId, p_days: days });
}

/**
 * Fetch billing transactions for a specific organization
 */
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

/**
 * Fetch all organizations (for billing view - returns full list not just top 10)
 */
export async function fetchAllOrganizations(): Promise<OrgOverview[]> {
  return fetchOrganizations();
}
