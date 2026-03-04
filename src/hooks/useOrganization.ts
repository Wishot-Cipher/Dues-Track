/**
 * useOrganization hook
 * Extracted from OrganizationContext for React Fast Refresh compatibility
 */

import { useContext } from 'react';
import { OrganizationContext } from '@/contexts/OrganizationContext';
import type { OrganizationContextType } from '@/types/multiTenant';

export function useOrganization(): OrganizationContextType {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}
