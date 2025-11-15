import { type ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
// Removed unused import of Student to fix linter warning
import LoadingSpinner from "@/components/ui/LoadingSpinner";

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requiredPermission?: 'can_create_payments' | 'can_approve_payments' | 'can_manage_students' | 'can_view_analytics';
}

const ProtectedRoute = ({
  children,
  requireAdmin = false,
  requiredPermission,
}: ProtectedRouteProps) => {
  const { user, loading, needsPasswordChange, isProfileComplete, hasPermission } = useAuth();
  const location = useLocation();

  // Show loading spinner while checking authentication
  if (loading) {
    return <LoadingSpinner fullScreen size="lg" />;
  }

  // Redirect to login if not authenticated
  if (!user) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  // Force password change flow
  if (needsPasswordChange && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }

  // Profile completion flow (only after password is changed)
  if (
    !needsPasswordChange &&
    !isProfileComplete &&
    location.pathname !== "/complete-profile"
  ) {
    return <Navigate to="/complete-profile" replace />;
  }

  // Permission-based admin checks
  if (requiredPermission) {
    if (!hasPermission(requiredPermission)) {
      return <Navigate to="/dashboard" replace />;
    }
  } else if (requireAdmin) {
    const isAdmin =
      user.roles?.includes("admin") ||
      user.roles?.includes("finsec") ||
      user.roles?.includes("class_rep");

    if (!isAdmin) {
      return <Navigate to="/dashboard" replace />;
    }
  }

  // All checks passed, render children
  return <>{children}</>;
};

export default ProtectedRoute;
