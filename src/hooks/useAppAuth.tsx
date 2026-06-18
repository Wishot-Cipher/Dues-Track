/**
 * useAppAuth - Drop-in replacement for useAuth that works in both modes
 *
 * Returns the EXACT same AuthContextType interface as useAuth().
 * When rendered inside an /:orgSlug/* route, it reads from useMultiTenantAuth.
 * When rendered on a legacy route (/dashboard, /admin/*), it reads from useAuth.
 *
 * Usage: Replace every `import { useAuth } from '@/hooks/useAuth'`
 *        with   `import { useAppAuth as useAuth } from '@/hooks/useAppAuth'`
 *
 * This is the SINGLE change needed per file to make the same UI work everywhere.
 */

import { useCallback, useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import type { AuthContextType, Student } from '@/types';

export function useAppAuth(): AuthContextType {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const singleAuth = useAuth();
  const multiAuth = useMultiTenantAuth();

  // If we're on an org-scoped route → multi-tenant mode
  const isMulti = Boolean(orgSlug);

  // ── Map OrganizationMember → Student ──
  const user = useMemo<Student | null>(() => {
    if (!isMulti) return singleAuth.user;

    const m = multiAuth.user;
    if (!m) return null;

    // Build an admin array from multi-tenant admin_permissions
    const perms = m.admin_permissions;
    // Build an admin array from the REAL member_admins rows (m.admin_records),
// not a synthetic record. Each row's own `id` is the actual member_admins.id
// — required by RPCs like approve_expense/reset_member_password that look
// up admin permissions by that exact ID. Using m.id here (the member's own
// organization_members.id) was the bug: it passed member-level lookups but
// failed any check against member_admins.
const adminRecords = (m.admin_records && m.admin_records.length > 0)
  ? m.admin_records.map((ar) => ({
      id: ar.id,
      role: ar.role,
      can_create_payments: ar.can_create_payments ?? false,
      can_approve_payments: ar.can_approve_payments ?? false,
      can_manage_students: ar.can_manage_members ?? false,
      can_view_analytics: ar.can_view_analytics ?? false,
    }))
  : [];

    // Map role names for compatibility
    const roles: string[] = [];
    if (m.admin_records && m.admin_records.length > 0) {
      m.admin_records.forEach((ar) => {
        if (['org_owner', 'org_admin', 'super_admin'].includes(ar.role)) roles.push('admin');
        if (['group_admin'].includes(ar.role)) roles.push('class_rep');
        if (['treasurer'].includes(ar.role)) roles.push('finsec');
        roles.push(ar.role);
      });
    }

    return {
      id: m.id,
      reg_number: m.member_id,
      full_name: m.full_name,
      email: m.email || null,
      phone: m.phone || null,
      section: m.section || null,
      department: m.group?.name || '',
      level: m.level || '',
      force_password_change: m.force_password_change,
      is_active: m.is_active,
      roles: roles.length > 0 ? roles : undefined,
      admins: adminRecords.length > 0 ? adminRecords : undefined,
      admin_permissions: perms
        ? {
            can_create_payments: perms.can_create_payments,
            can_approve_payments: perms.can_approve_payments,
            can_manage_students: perms.can_manage_members,
            can_view_analytics: perms.can_view_analytics,
          }
        : undefined,
      created_at: m.created_at,
      updated_at: m.updated_at,
    };
  }, [isMulti, singleAuth.user, multiAuth.user]);

  // ── Loading ──
  const loading = isMulti ? multiAuth.loading : singleAuth.loading;

  // ── Auth status ──
  const isAuthenticated = isMulti ? multiAuth.isAuthenticated : singleAuth.isAuthenticated;
  const needsPasswordChange = isMulti ? multiAuth.needsPasswordChange : singleAuth.needsPasswordChange;
  const isProfileComplete = isMulti
    ? multiAuth.isProfileComplete
    : singleAuth.isProfileComplete;

  // ── Login (only used by LoginPage which is mode-specific) ──
  const login = useCallback(
    async (regNumber: string, password: string) => {
      if (isMulti) {
        // Multi-tenant login requires orgSlug — handled by OrgLoginPage directly
        // This path shouldn't normally be called but we handle it gracefully
        const res = await multiAuth.login(regNumber, password, orgSlug);
        return {
          student: {
            id: res.member.id,
            reg_number: res.member.member_id,
            full_name: res.member.full_name,
            email: res.member.email || null,
            phone: res.member.phone || null,
            section: res.member.section || null,
            department: '',
            level: res.member.level || '',
            force_password_change: res.member.force_password_change,
            is_active: res.member.is_active,
          } as Student,
          mustChangePassword: res.mustChangePassword,
        };
      }
      return singleAuth.login(regNumber, password);
    },
    [isMulti, multiAuth, singleAuth, orgSlug],
  );

  // ── Logout ──
  const logout = useCallback(async () => {
    if (isMulti) {
      await multiAuth.logout();
    } else {
      await singleAuth.logout();
    }
  }, [isMulti, multiAuth, singleAuth]);

  // ── Change Password ──
  const changePassword = useCallback(
    async (studentId: string, currentPassword: string, newPassword: string) => {
      if (isMulti) {
        await multiAuth.changePassword(currentPassword, newPassword);
      } else {
        await singleAuth.changePassword(studentId, currentPassword, newPassword);
      }
    },
    [isMulti, multiAuth, singleAuth],
  );

  // ── Update Profile ──
  const updateProfile = useCallback(
    async (profileData: Partial<Student>) => {
      if (isMulti) {
        const updated = await multiAuth.updateProfile(profileData as Partial<import('@/types/multiTenant').OrganizationMember>);
        // Re-map to Student type
        return {
          id: updated.id,
          reg_number: updated.member_id,
          full_name: updated.full_name,
          email: updated.email || null,
          phone: updated.phone || null,
          section: updated.section || null,
          department: '',
          level: updated.level || '',
          force_password_change: updated.force_password_change,
          is_active: updated.is_active,
        } as Student;
      }
      return singleAuth.updateProfile(profileData);
    },
    [isMulti, multiAuth, singleAuth],
  );

  // ── Permissions ──
  const hasPermission = useCallback(
    (permission: 'can_create_payments' | 'can_approve_payments' | 'can_manage_students' | 'can_view_analytics') => {
      if (isMulti) {
        // Map single-tenant permission names to multi-tenant
        const map: Record<string, string> = {
          can_create_payments: 'can_create_payments',
          can_approve_payments: 'can_approve_payments',
          can_manage_students: 'can_manage_members',
          can_view_analytics: 'can_view_analytics',
        };
        const mapped = map[permission] || permission;
        return multiAuth.hasPermission(mapped as 'can_create_payments' | 'can_approve_payments' | 'can_manage_members' | 'can_view_analytics' | 'can_manage_admins' | 'can_manage_expenses' | 'can_export_data' | 'can_manage_settings');
      }
      return singleAuth.hasPermission(permission);
    },
    [isMulti, multiAuth, singleAuth],
  );

  // ── Refresh ──
  const refreshSession = useCallback(async () => {
    if (isMulti) {
      await multiAuth.refreshSession();
    } else {
      await singleAuth.refreshSession();
    }
  }, [isMulti, multiAuth, singleAuth]);

  return {
    user,
    loading,
    login,
    logout,
    changePassword,
    updateProfile,
    isAuthenticated,
    isProfileComplete,
    needsPasswordChange,
    hasPermission,
    refreshSession,
  };
}

// Re-export as useAuth so files can do:
//   import { useAuth } from '@/hooks/useAppAuth'
export { useAppAuth as useAuth };

export default useAppAuth;
