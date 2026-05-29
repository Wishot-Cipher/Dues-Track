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
  const admin = getPlatformAdmin();
  if (!admin?.can_manage_organizations) throw new Error('Insufficient permissions');

  const { error } = await supabase.rpc('set_organization_status', {
    p_org_id: orgId,
    p_is_active: isActive,
  });

  if (error) throw error;
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
  const planLimits: Record<string, { max_groups: number; max_members: number; max_admins: number }> = {
    free: { max_groups: 1, max_members: 50, max_admins: 3 },
    starter: { max_groups: 3, max_members: 300, max_admins: 10 },
    professional: { max_groups: 20, max_members: 5000, max_admins: 50 },
    enterprise: { max_groups: 999, max_members: 99999, max_admins: 999 },
  };

  const defaults = planLimits[plan];

  const { error } = await supabase.rpc('update_organization_subscription', {
    p_org_id: orgId,
    p_plan: plan,
    p_max_groups: options?.max_groups ?? defaults.max_groups,
    p_max_members: options?.max_members ?? defaults.max_members,
    p_max_admins: options?.max_admins ?? defaults.max_admins,
    p_subscription_expires_at: options?.subscription_expires_at ?? null,
    p_is_on_trial: options?.is_on_trial ?? false,
    p_trial_ends_at: options?.trial_ends_at ?? null,
  });

  if (error) throw error;
}

/**
 * Extend an organization's trial period
 */
export async function extendTrial(orgId: string, days: number): Promise<void> {
  const admin = getPlatformAdmin();
  if (!admin?.can_manage_subscriptions) throw new Error('Insufficient permissions');

  const trialEnd = new Date();
  trialEnd.setDate(trialEnd.getDate() + days);

  const { error } = await supabase.rpc('extend_organization_trial', {
    p_org_id: orgId,
    p_days: days,
  });

  if (error) throw error;
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
