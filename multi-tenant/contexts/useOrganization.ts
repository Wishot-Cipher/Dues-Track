/**
 * Organization Hooks
 * 
 * Custom hooks for accessing organization context.
 * Separated from the context provider to avoid fast refresh issues.
 */

import { useContext } from 'react';
import OrganizationContext from './OrganizationContext';
import type { OrganizationContextType } from '../types';

/**
 * Hook to use organization context
 * Must be used within an OrganizationProvider
 */
export const useOrganization = (): OrganizationContextType => {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
};

/**
 * Hook to get just the format currency function (common use case)
 */
export const useCurrency = () => {
  const { formatCurrency, organization } = useOrganization();
  return {
    formatCurrency,
    currencySymbol: organization?.currency_symbol || '₦',
    currencyCode: organization?.currency_code || 'NGN',
  };
};

/**
 * Hook to get levels and sections for the current department
 */
export const useAcademicConfig = () => {
  const { getLevels, getSections, department } = useOrganization();
  return {
    levels: getLevels(),
    sections: getSections(),
    departmentName: department?.name,
    departmentShortName: department?.short_name,
  };
};
