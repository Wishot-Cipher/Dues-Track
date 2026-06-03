/**
 * OrgProtectedRoute - Multi-tenant route guard
 * Protects /:orgSlug/* routes using useMultiTenantAuth
 */

import { type ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { multiTenantAuthService } from '@/services/multiTenantAuthService';
import type { AggregatedPermissions } from '@/types/multiTenant';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface OrgProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requiredPermission?: keyof AggregatedPermissions;
  /**
   * Full verification (verification_layer >= 4). Use on every money/sensitive
   * route — collecting dues, managing members, payouts, billing. Email-only
   * (Layer 2) and peer-voted (Layer 3) execs are rejected. Mirrors the server
   * layer gate so the client never exposes an action the DB will reject.
   */
  requireVerified?: boolean;
  /**
   * Acting access (verification_layer >= 2). Use on non-money SETUP routes —
   * dashboard, org structure, calendar. A school-email-verified founder can
   * set things up here while still locked out of money until Layer 4.
   */
  requireActing?: boolean;
  /**
   * Tier gate. When set, the caller's ACTIVE role must be at one of the
   * listed scope levels. Use this on routes whose powers belong to a
   * specific tier — e.g. "Manage Students" is a class-rep page; a
   * faculty or dept exec should NOT land on it just because their
   * permissions row happens to include can_manage_members.
   *
   * - 'group' = class-tier (class rep)
   * - 'unit'  = dept or faculty
   * - 'org'   = org owner
   *
   * Members (kind !== 'exec') are always blocked when this is set.
   * No `activeRole` resolved yet (still loading) renders the spinner.
   */
  allowedScopes?: Array<'group' | 'unit' | 'org'>;
}

const OrgProtectedRoute = ({
  children,
  requireAdmin = false,
  requiredPermission,
  requireVerified = false,
  requireActing = false,
  allowedScopes,
}: OrgProtectedRouteProps) => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, organization, loading, needsPasswordChange, isProfileComplete, hasPermission, isAnyAdmin } = useMultiTenantAuth();
  const location = useLocation();
  // Read the active role so we can gate by tier without coupling to
  // every route file. Hook is called unconditionally to keep order
  // stable across re-renders; the result is only used when
  // allowedScopes is supplied.
  const { activeRole } = useActiveRole({
    orgId: organization?.id,
    memberId: user?.id,
  });

  const basePath = `/${orgSlug}`;

  if (loading) {
    return <LoadingSpinner fullScreen size="lg" />;
  }

  // Not authenticated → org login
  if (!user) {
    return <Navigate to={`${basePath}/login`} state={{ from: location }} replace />;
  }

  // Force password change
  if (needsPasswordChange && location.pathname !== `${basePath}/change-password`) {
    return <Navigate to={`${basePath}/change-password`} replace />;
  }

  // Profile completion (after password changed)
  if (
    !needsPasswordChange &&
    !isProfileComplete &&
    location.pathname !== `${basePath}/complete-profile`
  ) {
    return <Navigate to={`${basePath}/complete-profile`} replace />;
  }

  // Layer-aware access. Money/sensitive → full (Layer 4); setup → acting (Layer 2).
  if (requiredPermission) {
    const ok = requireVerified
      ? multiTenantAuthService.hasVerifiedPermission(user, requiredPermission)
      : hasPermission(requiredPermission);
    if (!ok) return <Navigate to={`${basePath}/dashboard`} replace />;
  } else if (requireVerified) {
    if (!multiTenantAuthService.isVerifiedAdmin(user)) return <Navigate to={`${basePath}/dashboard`} replace />;
  } else if (requireActing) {
    if (!multiTenantAuthService.isActingAdmin(user)) return <Navigate to={`${basePath}/dashboard`} replace />;
  } else if (requireAdmin) {
    if (!isAnyAdmin()) return <Navigate to={`${basePath}/dashboard`} replace />;
  }

  // Tier gate — applied AFTER permission checks so a missing permission
  // still wins. A plain member (activeRole.kind !== 'exec') is rejected
  // because every allowed scope here implies an exec context.
  // useActiveRole reads synchronously from localStorage, no loading
  // state — if the user hasn't picked a role yet, activeRole is null
  // and we treat that as "not an exec context."
  if (allowedScopes && allowedScopes.length > 0) {
    const isExec = activeRole?.kind === 'exec';
    const matches = isExec
      && activeRole?.scopeLevel
      && allowedScopes.includes(activeRole.scopeLevel as 'group' | 'unit' | 'org');
    if (!matches) return <Navigate to={`${basePath}/dashboard`} replace />;
  }

  return <>{children}</>;
};

export default OrgProtectedRoute;
