/**
 * useAppContext - Universal Bridge Hook
 * 
 * Provides a single interface for ALL pages to use, whether in
 * single-tenant (legacy) or multi-tenant (Payvexo) mode.
 * 
 * This is the KEY to reusing the same UI across both flows:
 * - Same components, same layouts, same look & feel
 * - Different data sources depending on the mode
 * 
 * Usage:
 *   const { user, org, isAdmin, navigate, formatCurrency, ... } = useAppContext();
 */

import { useCallback, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useOrganization } from '@/hooks/useOrganization';
import { formatCurrency as singleFormatCurrency } from '@/utils/formatters';
import type { Student } from '@/types';
import type {
  OrganizationMember,
  Organization,
  OrganizationGroup,
  AggregatedPermissions,
} from '@/types/multiTenant';

// ============================================================
// Unified User Type (superset of both modes)
// ============================================================

export interface AppUser {
  id: string;
  fullName: string;
  memberId: string; // reg_number in single-tenant, member_id in multi
  email: string | null;
  phone: string | null;
  level: string | null;
  section: string | null;
  forcePasswordChange: boolean;
  isActive: boolean;
  isSuspended: boolean;
  avatarUrl?: string | null;
  // Raw references for pages that need them
  _raw_student?: Student;
  _raw_member?: OrganizationMember;
}

export interface AppContextValue {
  // ── Mode ──
  mode: 'single' | 'multi';
  isMultiTenant: boolean;

  // ── User ──
  user: AppUser | null;
  loading: boolean;
  isAuthenticated: boolean;
  needsPasswordChange: boolean;
  isProfileComplete: boolean;

  // ── Organization (multi-tenant only, null in single) ──
  organization: Organization | null;
  group: OrganizationGroup | null;
  orgSlug: string | null;

  // ── Permissions ──
  isAdmin: boolean;
  hasPermission: (permission: string) => boolean;

  // ── Navigation ──
  /** Returns an org-prefixed path in multi-tenant mode */
  appPath: (relativePath: string) => string;
  /** Navigate to an app path (auto-prefixed) */
  appNavigate: (relativePath: string, options?: { replace?: boolean }) => void;

  // ── Formatting ──
  formatCurrency: (amount: number) => string;
  currencySymbol: string;

  // ── Labels (dynamic per org type) ──
  memberLabel: string;
  memberLabelPlural: string;
  groupLabel: string;
  groupLabelPlural: string;
  paymentLabel: string;

  // ── Actions ──
  logout: () => Promise<void>;
  changePassword: (current: string, newPass: string) => Promise<void>;
  refreshSession: () => Promise<void>;

  // ── Raw contexts for edge cases ──
  _singleAuth: ReturnType<typeof useAuth>;
  _multiAuth: ReturnType<typeof useMultiTenantAuth>;
  _orgContext: ReturnType<typeof useOrganization>;
}

// ============================================================
// Hook
// ============================================================

export function useAppContext(): AppContextValue {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  // Both auth providers are always mounted, but only one is "active"
  const singleAuth = useAuth();
  const multiAuth = useMultiTenantAuth();
  const orgCtx = useOrganization();

  // Determine mode: if we're on an org-scoped route (/:orgSlug/*), it's multi
  const isMultiTenant = Boolean(orgSlug) || orgCtx.isMultiTenant;
  const mode = isMultiTenant ? 'multi' : 'single';

  // ── Build unified user ──
  const user = useMemo<AppUser | null>(() => {
    if (mode === 'multi') {
      const m = multiAuth.user;
      if (!m) return null;
      return {
        id: m.id,
        fullName: m.full_name,
        memberId: m.member_id,
        email: m.email || null,
        phone: m.phone || null,
        level: m.level || null,
        section: m.section || null,
        forcePasswordChange: m.force_password_change,
        isActive: m.is_active,
        isSuspended: m.is_suspended,
        avatarUrl: m.avatar_url,
        _raw_member: m,
      };
    } else {
      const s = singleAuth.user;
      if (!s) return null;
      return {
        id: s.id,
        fullName: s.full_name,
        memberId: s.reg_number,
        email: s.email,
        phone: s.phone,
        level: s.level || null,
        section: s.section || null,
        forcePasswordChange: s.force_password_change,
        isActive: s.is_active,
        isSuspended: false,
        avatarUrl: null,
        _raw_student: s,
      };
    }
  }, [mode, multiAuth.user, singleAuth.user]);

  // ── Loading ──
  const loading = mode === 'multi' ? multiAuth.loading : singleAuth.loading;

  // ── Auth status ──
  const isAuthenticated = mode === 'multi' ? multiAuth.isAuthenticated : singleAuth.isAuthenticated;
  const needsPasswordChange = mode === 'multi' ? multiAuth.needsPasswordChange : singleAuth.needsPasswordChange;
  const isProfileComplete = mode === 'multi' ? multiAuth.isProfileComplete : singleAuth.isProfileComplete;

  // ── Organization ──
  const organization = mode === 'multi' ? multiAuth.organization : null;
  const group = mode === 'multi' ? multiAuth.group : null;
  const currentOrgSlug = orgSlug || organization?.slug || null;

  // ── Permissions ──
  const isAdmin = mode === 'multi'
    ? multiAuth.isAnyAdmin()
    : singleAuth.hasPermission('can_approve_payments');

  const hasPermission = useCallback((permission: string) => {
    if (mode === 'multi') {
      return multiAuth.hasPermission(permission as keyof AggregatedPermissions);
    } else {
      // Map multi-tenant permission names to single-tenant ones
      const permMap: Record<string, 'can_create_payments' | 'can_approve_payments' | 'can_manage_students' | 'can_view_analytics'> = {
        can_create_payments: 'can_create_payments',
        can_approve_payments: 'can_approve_payments',
        can_manage_students: 'can_manage_students',
        can_manage_members: 'can_manage_students', // alias
        can_view_analytics: 'can_view_analytics',
        can_manage_expenses: 'can_approve_payments', // finsec maps here
        can_export_data: 'can_view_analytics',
        can_manage_admins: 'can_manage_students',
        can_manage_settings: 'can_manage_students',
      };
      const mapped = permMap[permission];
      if (!mapped) return isAdmin;
      return singleAuth.hasPermission(mapped);
    }
  }, [mode, multiAuth, singleAuth, isAdmin]);

  // ── Navigation helpers ──
  const appPath = useCallback((relativePath: string) => {
    if (mode === 'multi' && currentOrgSlug) {
      const clean = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
      return `/${currentOrgSlug}${clean}`;
    }
    return relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
  }, [mode, currentOrgSlug]);

  const appNavigate = useCallback((relativePath: string, options?: { replace?: boolean }) => {
    navigate(appPath(relativePath), options);
  }, [navigate, appPath]);

  // ── Currency ──
  const formatCurrency = useCallback((amount: number) => {
    if (mode === 'multi' && orgCtx.formatCurrency) {
      return orgCtx.formatCurrency(amount);
    }
    return singleFormatCurrency(amount);
  }, [mode, orgCtx]);

  const currencySymbol = organization?.currency_symbol || '₦';

  // ── Labels ──
  const memberLabel = mode === 'multi'
    ? (organization?.member_label || 'Member')
    : 'Student';
  const memberLabelPlural = mode === 'multi'
    ? (organization?.member_label_plural || 'Members')
    : 'Students';
  const groupLabel = mode === 'multi'
    ? (organization?.group_label || 'Group')
    : 'Department';
  const groupLabelPlural = mode === 'multi'
    ? (organization?.group_label_plural || 'Groups')
    : 'Departments';
  const paymentLabel = mode === 'multi'
    ? (organization?.payment_label || 'Payments')
    : 'Dues';

  // ── Actions ──
  const logout = useCallback(async () => {
    if (mode === 'multi') {
      await multiAuth.logout();
    } else {
      await singleAuth.logout();
    }
  }, [mode, multiAuth, singleAuth]);

  const changePassword = useCallback(async (current: string, newPass: string) => {
    if (mode === 'multi') {
      await multiAuth.changePassword(current, newPass);
    } else {
      if (!user?.id) throw new Error('Not authenticated');
      await singleAuth.changePassword(user.id, current, newPass);
    }
  }, [mode, multiAuth, singleAuth, user?.id]);

  const refreshSession = useCallback(async () => {
    if (mode === 'multi') {
      await multiAuth.refreshSession();
    } else {
      await singleAuth.refreshSession();
    }
  }, [mode, multiAuth, singleAuth]);

  return {
    mode,
    isMultiTenant,
    user,
    loading,
    isAuthenticated,
    needsPasswordChange,
    isProfileComplete,
    organization,
    group,
    orgSlug: currentOrgSlug,
    isAdmin,
    hasPermission,
    appPath,
    appNavigate,
    formatCurrency,
    currencySymbol,
    memberLabel,
    memberLabelPlural,
    groupLabel,
    groupLabelPlural,
    paymentLabel,
    logout,
    changePassword,
    refreshSession,
    _singleAuth: singleAuth,
    _multiAuth: multiAuth,
    _orgContext: orgCtx,
  };
}

export default useAppContext;
