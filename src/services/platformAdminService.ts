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

/**
 * Authenticate a platform admin via email + password
 * Uses bcrypt check against platform_admins table
 */
export async function platformAdminLogin(email: string, password: string): Promise<PlatformAdmin> {
  // Use RPC to verify password via pgcrypto (same pattern as main auth)
  const { data, error } = await supabase.rpc('verify_platform_admin', {
    p_email: email.toLowerCase().trim(),
    p_password: password,
  });

  if (error) {
    console.error('[PVX Console] RPC error:', error.message, error.code);
    if (error.message?.includes('Could not find the function') || error.code === '42883') {
      throw new Error('Console not configured. Run the SQL setup first.');
    }
    throw new Error(error.message || 'Authentication failed');
  }
  if (!data || (Array.isArray(data) && data.length === 0)) {
    throw new Error('Invalid email or password');
  }

  const admin = Array.isArray(data) ? data[0] : data;
  if (!admin.is_active) throw new Error('Account is deactivated');

  // Store session (deliberately vague key)
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
    ts: Date.now(),
  };
  sessionStorage.setItem(PLATFORM_KEY, JSON.stringify(session));

  return session;
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
 * Logout platform admin
 */
export function platformAdminLogout(): void {
  sessionStorage.removeItem(PLATFORM_KEY);
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

  const { error } = await supabase
    .from('organizations')
    .update({ is_active: isActive })
    .eq('id', orgId);

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

  const { error } = await supabase
    .from('organizations')
    .update({
      subscription_plan: plan,
      max_groups: options?.max_groups ?? defaults.max_groups,
      max_members: options?.max_members ?? defaults.max_members,
      max_admins: options?.max_admins ?? defaults.max_admins,
      subscription_expires_at: options?.subscription_expires_at ?? null,
      is_on_trial: options?.is_on_trial ?? false,
      trial_ends_at: options?.trial_ends_at ?? null,
    })
    .eq('id', orgId);

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

  const { error } = await supabase
    .from('organizations')
    .update({
      is_on_trial: true,
      trial_ends_at: trialEnd.toISOString(),
    })
    .eq('id', orgId);

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
