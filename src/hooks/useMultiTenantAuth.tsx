/**
 * Multi-Tenant Auth Hook
 * Provides authentication context scoped to organizations
 * Payvexo - Smart Payment & Dues Management
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import { multiTenantAuthService } from '@/services/multiTenantAuthService';
import type {
  OrganizationMember,
  MemberAdmin,
  Organization,
  OrganizationGroup,
  AggregatedPermissions,
  AdminRole,
  MultiTenantAuthContextType,
} from '@/types/multiTenant';

const MultiTenantAuthContext = createContext<MultiTenantAuthContextType | null>(null);

interface MultiTenantAuthProviderProps {
  children: ReactNode;
}

export function MultiTenantAuthProvider({ children }: MultiTenantAuthProviderProps) {
  const [user, setUser] = useState<OrganizationMember | null>(null);
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [group, setGroup] = useState<OrganizationGroup | null>(null);
  const [adminRecords, setAdminRecords] = useState<MemberAdmin[]>([]);
  const [loading, setLoading] = useState(true);

  const clearState = () => {
    setUser(null);
    setOrganization(null);
    setGroup(null);
    setAdminRecords([]);
  };

  // Tracks whether we've ever successfully populated state from the
  // server. Once true, we *never* clear state from a transient failure —
  // only from an explicit logout or a definitive "session is invalid"
  // response (returned as null from getCurrentMember).
  // This is the fix for the auto-logout-on-network-blip bug: previously
  // any caught exception would wipe state and bounce the user to login.
  const checkSession = useCallback(async () => {
    try {
      const result = await multiTenantAuthService.getCurrentMember();
      if (result) {
        setUser(result.member);
        setOrganization(result.organization);
        setGroup(result.group);
        setAdminRecords(result.adminRecords);
      } else {
        // Definitive: service told us the session is invalid (member
        // gone, deactivated, org gone, or no localStorage session).
        clearState();
      }
    } catch (error) {
      // Transient: network/RLS/schema. Keep whatever state we have.
      // On the very first mount (user state still null), retry once
      // after a short delay so a slow first request doesn't bounce
      // us to login; if that also throws, we leave the user signed-out
      // but we DON'T wipe localStorage, so a reload can recover.
      console.warn('Session check transient error — keeping state:', error);
      try {
        await new Promise((r) => setTimeout(r, 600));
        const retry = await multiTenantAuthService.getCurrentMember();
        if (retry) {
          setUser(retry.member);
          setOrganization(retry.organization);
          setGroup(retry.group);
          setAdminRecords(retry.adminRecords);
        }
        // If retry also threw, the catch below silently swallows it.
      } catch (retryErr) {
        console.warn('Session check retry also failed — leaving stored session intact:', retryErr);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  // ── Check stored session on mount ──
  useEffect(() => {
    checkSession();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'pvx_auth' && e.newValue === null) {
        clearState();
      } else if (e.key === 'pvx_member_id' && e.newValue) {
        checkSession();
      }
    };

    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, [checkSession]);

  // ── Login ──
  const login = useCallback(async (memberId: string, password: string, orgSlug?: string) => {
    if (!orgSlug) throw new Error('Organization is required');

    const result = await multiTenantAuthService.login(memberId, password, orgSlug);

    setUser(result.member);
    setOrganization(result.organization);
    setGroup(result.group);
    setAdminRecords(result.adminRecords);

    return {
      member: result.member,
      mustChangePassword: result.mustChangePassword,
    };
  }, []);

  // ── Logout ──
  const logout = useCallback(async () => {
    await multiTenantAuthService.logout();
    clearState();
  }, []);

  // ── Change Password ──
  const changePassword = useCallback(async (currentPassword: string, newPassword: string) => {
    if (!user) throw new Error('Not authenticated');
    const updated = await multiTenantAuthService.changePassword(user.id, currentPassword, newPassword);
    setUser(prev => prev ? { ...prev, ...updated, force_password_change: false } : null);
  }, [user]);

  // ── Update Profile ──
  const updateProfile = useCallback(async (profileData: Partial<OrganizationMember>) => {
    if (!user) throw new Error('Not authenticated');
    const updated = await multiTenantAuthService.updateProfile(user.id, profileData);
    setUser(prev => prev ? { ...prev, ...updated } : null);
    return updated;
  }, [user]);

  // ── Refresh Session ──
  const refreshSession = useCallback(async () => {
    await checkSession();
  }, [checkSession]);

  // ── Permission Helpers ──
  const hasPermission = useCallback((permission: keyof AggregatedPermissions): boolean => {
    return multiTenantAuthService.hasPermission(user, permission);
  }, [user]);

  const hasRole = useCallback((role: AdminRole): boolean => {
    return multiTenantAuthService.hasRole(user, role);
  }, [user]);

  const isOrgOwner = useCallback(() => hasRole('org_owner'), [hasRole]);
  const isOrgAdmin = useCallback(() => hasRole('org_admin') || hasRole('org_owner'), [hasRole]);
  const isGroupAdmin = useCallback(() => hasRole('group_admin') || isOrgAdmin(), [hasRole, isOrgAdmin]);
  const isAnyAdmin = useCallback(() => multiTenantAuthService.isAdmin(user), [user]);

  // ── Build context value ──
  const value: MultiTenantAuthContextType = {
    user,
    adminRecord: adminRecords.length > 0 ? adminRecords[0] : null,
    organization,
    group,
    loading,
    login,
    logout,
    changePassword,
    updateProfile,
    isAuthenticated: !!user,
    isProfileComplete: multiTenantAuthService.isProfileComplete(user),
    needsPasswordChange: user?.force_password_change || false,
    hasPermission,
    hasRole,
    isOrgOwner,
    isOrgAdmin,
    isGroupAdmin,
    isAnyAdmin,
    refreshSession,
  };

  return (
    <MultiTenantAuthContext.Provider value={value}>
      {children}
    </MultiTenantAuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useMultiTenantAuth(): MultiTenantAuthContextType {
  const context = useContext(MultiTenantAuthContext);
  if (!context) {
    throw new Error('useMultiTenantAuth must be used within a MultiTenantAuthProvider');
  }
  return context;
}
