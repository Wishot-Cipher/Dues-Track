/**
 * useAppNav - Org-aware navigation hook
 *
 * Provides navigate() and Link-path helpers that automatically prefix
 * /:orgSlug/ when inside an org-scoped route.
 *
 * Usage:
 *   const { go, path } = useAppNav();
 *   go('/dashboard');         // navigates to /dashboard or /futo/dashboard
 *   <Link to={path('/admin/review')}>  // "/admin/review" or "/futo/admin/review"
 */

import { useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

export function useAppNav() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  /**
   * Produce an org-prefixed path.
   * In multi-tenant mode: path('/dashboard') → '/futo/dashboard'
   * In single-tenant mode: path('/dashboard') → '/dashboard'
   */
  const path = useCallback(
    (relativePath: string): string => {
      const clean = relativePath.startsWith('/') ? relativePath : `/${relativePath}`;
      if (orgSlug) {
        return `/${orgSlug}${clean}`;
      }
      return clean;
    },
    [orgSlug],
  );

  /**
   * Navigate to an org-prefixed path.
   */
  const go = useCallback(
    (relativePath: string, options?: { replace?: boolean; state?: unknown }) => {
      navigate(path(relativePath), options);
    },
    [navigate, path],
  );

  return { go, path, orgSlug, navigate };
}

export default useAppNav;
