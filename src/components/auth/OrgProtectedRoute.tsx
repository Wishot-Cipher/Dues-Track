/**
 * OrgProtectedRoute - Multi-tenant route guard
 * Protects /:orgSlug/* routes using useMultiTenantAuth
 */

import { type ReactNode } from 'react';
import { Navigate, useLocation, useParams } from 'react-router-dom';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import type { AggregatedPermissions } from '@/types/multiTenant';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface OrgProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requiredPermission?: keyof AggregatedPermissions;
}

const OrgProtectedRoute = ({
  children,
  requireAdmin = false,
  requiredPermission,
}: OrgProtectedRouteProps) => {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, loading, needsPasswordChange, isProfileComplete, hasPermission, isAnyAdmin } = useMultiTenantAuth();
  const location = useLocation();

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

  // Permission check
  if (requiredPermission) {
    if (!hasPermission(requiredPermission)) {
      return <Navigate to={`${basePath}/dashboard`} replace />;
    }
  } else if (requireAdmin) {
    if (!isAnyAdmin()) {
      return <Navigate to={`${basePath}/dashboard`} replace />;
    }
  }

  return <>{children}</>;
};

export default OrgProtectedRoute;
