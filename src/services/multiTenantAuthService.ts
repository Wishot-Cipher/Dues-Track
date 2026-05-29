/**
 * Multi-Tenant Auth Service
 * Handles authentication scoped to organizations
 * Payvexo - Smart Payment & Dues Management
 */

import { supabase, getStoredAccessToken } from '@/config/supabase';
import type { OrganizationMember, MemberAdmin, Organization, OrganizationGroup, AggregatedPermissions } from '@/types/multiTenant';

// ============================================================
// TYPES
// ============================================================

export interface MultiTenantLoginResponse {
  member: OrganizationMember;
  organization: Organization;
  group: OrganizationGroup;
  adminRecords: MemberAdmin[];
  mustChangePassword: boolean;
}

interface MemberProfileUpdateData {
  full_name?: string;
  email?: string | null;
  phone?: string | null;
  section?: string | null;
  level?: string | null;
  avatar_url?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  address?: string | null;
}

// ============================================================
// SESSION STORAGE KEYS
// ============================================================

const SESSION_KEYS = {
  AUTH_STATUS: 'pvx_auth',
  MEMBER_ID: 'pvx_member_id',
  ORG_ID: 'pvx_org_id',
  ORG_SLUG: 'pvx_org_slug',
  GROUP_ID: 'pvx_group_id',
  JWT: 'pvx_jwt',
};

// Verification states that count as "trusted". MUST match the server-side gate
// in migration 035 (create_due_with_scope_check). A 'pending' exec is NOT
// trusted and gets no admin powers in the UI — mirroring the database, so the
// client never offers an action the server will reject.
const TRUSTED_VERIFICATION = ['email_verified', 'document_verified', 'admin_verified', 'member_confirmed'];

// ============================================================
// SERVICE
// ============================================================

export const multiTenantAuthService = {
  /**
   * Login with member ID and password, scoped to an organization.
   *
   * Credential verification happens server-side at /api/auth/login, which
   * returns a signed session token (JWT). We store the token so every
   * subsequent Supabase request carries it and RLS can enforce isolation.
   */
  async login(memberId: string, password: string, orgSlug: string, groupId?: string): Promise<MultiTenantLoginResponse> {
    try {
      const trimmedId = memberId.trim();
      const trimmedSlug = orgSlug.trim().toLowerCase();

      if (!trimmedId) throw new Error('Please enter your ID');
      if (!password) throw new Error('Please enter your password');
      if (!trimmedSlug) throw new Error('Organization is required');

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ memberId: trimmedId, password, orgSlug: trimmedSlug, groupId: groupId?.trim() || undefined }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.error || 'Login failed. Please try again.');
      }

      const org = json.organization as Organization;
      const grp = json.group as OrganizationGroup;
      const admins = (json.adminRecords || []) as MemberAdmin[];

      const fullMember: OrganizationMember = {
        ...(json.member as OrganizationMember),
        organization: org,
        group: grp,
        admin_records: admins,
        admin_permissions: this.aggregatePermissions(admins),
      };
      delete (fullMember as unknown as Record<string, unknown>).password_hash;

      // Persist the session token first so subsequent requests are authenticated.
      if (json.token) localStorage.setItem(SESSION_KEYS.JWT, json.token as string);
      this.saveSession(fullMember, org);

      return {
        member: fullMember,
        organization: org,
        group: grp || ({ id: fullMember.group_id } as OrganizationGroup),
        adminRecords: admins,
        mustChangePassword: !!json.mustChangePassword,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Login failed. Please try again.';
      throw new Error(message);
    }
  },

  /**
   * Change password
   */
  async changePassword(memberId: string, currentPassword: string, newPassword: string): Promise<OrganizationMember> {
    try {
      if (!newPassword || newPassword.length < 6) {
        throw new Error('New password must be at least 6 characters');
      }

      const { data, error } = await supabase.rpc('change_member_password', {
        p_member_id: memberId,
        p_current_password: currentPassword,
        p_new_password: newPassword,
      });

      if (error) {
        if (error.message?.includes('incorrect')) {
          throw new Error('Current password is incorrect');
        }
        throw new Error('Failed to change password. Please try again.');
      }

      const updated = Array.isArray(data) && data.length > 0 ? data[0] : data;
      if (!updated) throw new Error('Failed to change password');

      return updated as OrganizationMember;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Failed to change password';
      throw new Error(message);
    }
  },

  /**
   * Update member profile
   */
  async updateProfile(memberId: string, profileData: MemberProfileUpdateData): Promise<OrganizationMember> {
    try {
      const { data, error } = await supabase.rpc('update_member_profile', {
        p_member_id: memberId,
        p_profile: {
          full_name: profileData.full_name ?? undefined,
          email: profileData.email ?? undefined,
          phone: profileData.phone ?? undefined,
          section: profileData.section ?? undefined,
          level: profileData.level ?? undefined,
          avatar_url: profileData.avatar_url ?? undefined,
          date_of_birth: profileData.date_of_birth ?? undefined,
          gender: profileData.gender ?? undefined,
          address: profileData.address ?? undefined,
        },
      });

      if (error) throw error;
      const updated = Array.isArray(data) && data.length > 0 ? data[0] : data;
      if (!updated) throw new Error('Failed to update profile');

      // Update session
      const currentOrgSlug = localStorage.getItem(SESSION_KEYS.ORG_SLUG);
      if (currentOrgSlug) {
        this.saveSession(updated as OrganizationMember, { slug: currentOrgSlug } as Organization);
      }

      return updated as OrganizationMember;
    } catch (error) {
      console.error('Update profile error:', error);
      throw error;
    }
  },

  /**
   * Check if profile is complete
   */
  isProfileComplete(member: OrganizationMember | null): boolean {
    if (!member) return false;
    return Boolean(member.email && member.phone);
  },

  /**
   * Logout
   */
  async logout(): Promise<void> {
    localStorage.removeItem(SESSION_KEYS.AUTH_STATUS);
    localStorage.removeItem(SESSION_KEYS.MEMBER_ID);
    localStorage.removeItem(SESSION_KEYS.ORG_ID);
    localStorage.removeItem(SESSION_KEYS.ORG_SLUG);
    localStorage.removeItem(SESSION_KEYS.GROUP_ID);
    localStorage.removeItem(SESSION_KEYS.JWT);
  },

  /**
   * Save session to localStorage (minimal data only)
   */
  saveSession(member: OrganizationMember, org: Organization): void {
    try {
      localStorage.setItem(SESSION_KEYS.AUTH_STATUS, 'active');
      localStorage.setItem(SESSION_KEYS.MEMBER_ID, member.id);
      localStorage.setItem(SESSION_KEYS.ORG_ID, member.organization_id);
      localStorage.setItem(SESSION_KEYS.ORG_SLUG, org.slug);
      localStorage.setItem(SESSION_KEYS.GROUP_ID, member.group_id || '');
    } catch (error) {
      console.error('Error saving session:', error);
    }
  },

  /**
   * Get current authenticated member
   */
  async getCurrentMember(): Promise<MultiTenantLoginResponse | null> {
    try {
      const authStatus = localStorage.getItem(SESSION_KEYS.AUTH_STATUS);
      if (authStatus !== 'active') return null;

      // The session token is the real credential. If it's missing or expired,
      // the session is definitively over — clear it and force re-login.
      if (!getStoredAccessToken()) {
        this.clearSession();
        return null;
      }

      const memberId = localStorage.getItem(SESSION_KEYS.MEMBER_ID);
      const orgId = localStorage.getItem(SESSION_KEYS.ORG_ID);
      if (!memberId || !orgId) return null;

      // Fetch member with relations
      const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .select('*')
        .eq('id', memberId)
        .eq('organization_id', orgId)
        .single();

      if (memberError || !member || !member.is_active) {
        this.clearSession();
        return null;
      }

      // Fetch org
      const { data: org } = await supabase
        .from('organizations')
        .select('*')
        .eq('id', orgId)
        .eq('is_active', true)
        .single();

      if (!org) {
        this.clearSession();
        return null;
      }

      // Fetch group
      const { data: grp } = await supabase
        .from('organization_groups')
        .select('*')
        .eq('id', member.group_id)
        .single();

      // Fetch admin records
      const { data: adminRecords } = await supabase
        .from('member_admins')
        .select('*')
        .eq('member_id', memberId)
        .eq('is_active', true);

      const admins = (adminRecords || []) as MemberAdmin[];
      const permissions = this.aggregatePermissions(admins);

      const fullMember: OrganizationMember = {
        ...(member as OrganizationMember),
        organization: org as Organization,
        group: grp as OrganizationGroup,
        admin_records: admins,
        admin_permissions: permissions,
      };

      delete (fullMember as unknown as Record<string, unknown>).password_hash;

      // Refresh session storage with group scope
      this.saveSession(fullMember, org as Organization);

      return {
        member: fullMember,
        organization: org as Organization,
        group: (grp as OrganizationGroup) || { id: member.group_id },
        adminRecords: admins,
        mustChangePassword: member.force_password_change,
      };
    } catch (error) {
      console.error('Get current member error:', error);
      this.clearSession();
      return null;
    }
  },

  /**
   * Clear session data
   */
  clearSession(): void {
    localStorage.removeItem(SESSION_KEYS.AUTH_STATUS);
    localStorage.removeItem(SESSION_KEYS.MEMBER_ID);
    localStorage.removeItem(SESSION_KEYS.ORG_ID);
    localStorage.removeItem(SESSION_KEYS.ORG_SLUG);
    localStorage.removeItem(SESSION_KEYS.GROUP_ID);
    localStorage.removeItem(SESSION_KEYS.JWT);
  },

  /**
   * Aggregate permissions from all admin records
   */
  aggregatePermissions(admins: MemberAdmin[]): AggregatedPermissions {
    if (!admins || admins.length === 0) {
      return {
        can_create_payments: false,
        can_approve_payments: false,
        can_manage_members: false,
        can_manage_admins: false,
        can_manage_expenses: false,
        can_view_analytics: false,
        can_export_data: false,
        can_manage_settings: false,
      };
    }

    return {
      can_create_payments: admins.some(a => a.can_create_payments),
      can_approve_payments: admins.some(a => a.can_approve_payments),
      can_manage_members: admins.some(a => a.can_manage_members),
      can_manage_admins: admins.some(a => a.can_manage_admins),
      can_manage_expenses: admins.some(a => a.can_manage_expenses),
      can_view_analytics: admins.some(a => a.can_view_analytics),
      can_export_data: admins.some(a => a.can_export_data),
      can_manage_settings: admins.some(a => a.can_manage_settings),
    };
  },

  /**
   * Check if member is any kind of admin
   */
  isAdmin(member: OrganizationMember | null): boolean {
    if (!member?.admin_records) return false;
    return member.admin_records.length > 0;
  },

  /**
   * Check if member has a specific role
   */
  hasRole(member: OrganizationMember | null, role: string): boolean {
    if (!member?.admin_records) return false;
    return member.admin_records.some(a => a.role === role);
  },

  /**
   * Check if member has a specific permission
   */
  hasPermission(member: OrganizationMember | null, permission: keyof AggregatedPermissions): boolean {
    if (!member?.admin_permissions) return false;
    return member.admin_permissions[permission] === true;
  },

  /**
   * Is the member a VERIFIED admin — an active admin record in a trusted
   * verification state? A pending founder/exec returns false, so they get
   * no admin access in the UI until they verify (mirrors the server gate).
   */
  isVerifiedAdmin(member: OrganizationMember | null): boolean {
    if (!member?.admin_records) return false;
    return member.admin_records.some(
      a => a.is_active && TRUSTED_VERIFICATION.includes(a.verification_status || '')
    );
  },

  /**
   * Does the member hold `permission` via a VERIFIED admin record?
   * Trust-aware counterpart to hasPermission — gates money/admin actions so
   * an unverified exec can never reach them (matches create_due_with_scope_check).
   */
  hasVerifiedPermission(member: OrganizationMember | null, permission: keyof AggregatedPermissions): boolean {
    if (!member?.admin_records) return false;
    return member.admin_records.some(
      a => a.is_active
        && TRUSTED_VERIFICATION.includes(a.verification_status || '')
        && (a as unknown as Record<string, boolean>)[permission] === true
    );
  },

  /**
   * School-email verification — request an OTP to the member's institutional email.
   */
  async requestSchoolEmailCode(
    memberId: string,
    email: string,
  ): Promise<{ ok: boolean; error?: string; sentTo?: string }> {
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'request', memberId, email }),
      });
      return await res.json().catch(() => ({ ok: false, error: 'Network error' }));
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  },

  /**
   * School-email verification — confirm the OTP; promotes the exec to verified.
   */
  async confirmSchoolEmailCode(
    memberId: string,
    code: string,
  ): Promise<{ ok: boolean; error?: string; message?: string; promoted?: number }> {
    try {
      const res = await fetch('/api/auth/verify-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirm', memberId, code }),
      });
      return await res.json().catch(() => ({ ok: false, error: 'Network error' }));
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : 'Network error' };
    }
  },
};

export default multiTenantAuthService;
