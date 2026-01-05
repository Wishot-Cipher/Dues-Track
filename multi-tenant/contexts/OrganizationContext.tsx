/**
 * Organization Context
 * 
 * Provides organization and department information throughout the app.
 * This is the foundation for multi-tenancy in the frontend.
 * 
 * NOTE: When integrating into the main app, update these imports:
 * - supabase: import from '@/lib/supabase'
 * - types: move to '@/types' or update path alias
 */

import React, { createContext, useState, useEffect, useCallback, useMemo } from 'react';
// TODO: Uncomment when integrating into main app
// import { supabase } from '@/lib/supabase';
import type { Organization, Department, OrganizationSettings, OrganizationContextType } from '../types';

/* eslint-disable @typescript-eslint/no-explicit-any */
// Temporary supabase mock for development - replace with real import when integrating
// When integrating: import { supabase } from '@/lib/supabase';
const supabase: any = {
  from: () => ({
    select: () => ({
      eq: () => ({
        eq: () => ({
          single: async () => ({ data: null, error: null })
        })
      })
    })
  })
};
/* eslint-enable @typescript-eslint/no-explicit-any */

const OrganizationContext = createContext<OrganizationContextType | null>(null);

interface OrganizationProviderProps {
  children: React.ReactNode;
  initialOrgSlug?: string;  // Can be passed from URL
}

export const OrganizationProvider: React.FC<OrganizationProviderProps> = ({ 
  children, 
  initialOrgSlug 
}) => {
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [department, setDepartment] = useState<Department | null>(null);
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Fetch organization by slug
  const fetchOrganization = useCallback(async (slug: string) => {
    try {
      setLoading(true);
      setError(null);

      // Fetch organization
      const { data: org, error: orgError } = await supabase
        .from('organizations')
        .select(`
          *,
          departments (*),
          organization_settings (*)
        `)
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (orgError) throw orgError;
      if (!org) throw new Error('Organization not found');

      // Type assertion for the joined data
      const orgData = org as Organization & {
        departments?: Department[];
        organization_settings?: OrganizationSettings[];
      };

      setOrganization(orgData);
      setSettings(orgData.organization_settings?.[0] || null);

      // Set default department (first active one)
      const activeDepts = orgData.departments?.filter((d: Department) => d.is_active) || [];
      if (activeDepts.length > 0) {
        setDepartment(activeDepts[0]);
      }

    } catch (err) {
      console.error('Error fetching organization:', err);
      setError(err instanceof Error ? err.message : 'Failed to load organization');
    } finally {
      setLoading(false);
    }
  }, []);

  // Switch to a different department
  const switchDepartment = useCallback(async (departmentId: string) => {
    if (!organization) return;

    const dept = organization.departments?.find((d: Department) => d.id === departmentId);
    if (dept) {
      setDepartment(dept);
      // Optionally save to localStorage for persistence
      localStorage.setItem(`org_${organization.id}_dept`, departmentId);
    }
  }, [organization]);

  // Refresh organization data
  const refreshOrganization = useCallback(async () => {
    if (organization?.slug) {
      await fetchOrganization(organization.slug);
    }
  }, [organization?.slug, fetchOrganization]);

  // Format currency based on organization settings
  const formatCurrency = useCallback((amount: number) => {
    const symbol = organization?.currency_symbol || '₦';
    const code = organization?.currency_code || 'NGN';
    
    try {
      return new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount);
    } catch {
      // Fallback for unsupported currencies
      return `${symbol}${amount.toLocaleString()}`;
    }
  }, [organization]);

  // Get available levels for current department
  const getLevels = useCallback(() => {
    return department?.levels || ['100L', '200L', '300L', '400L', '500L'];
  }, [department]);

  // Get available sections for current department
  const getSections = useCallback(() => {
    return department?.sections || [];
  }, [department]);

  // Load organization on mount
  useEffect(() => {
    if (initialOrgSlug) {
      fetchOrganization(initialOrgSlug);
    } else {
      // Try to get from localStorage or URL
      const savedSlug = localStorage.getItem('current_org_slug');
      if (savedSlug) {
        fetchOrganization(savedSlug);
      } else {
        // Default to 'futo' for backward compatibility
        fetchOrganization('futo');
      }
    }
  }, [initialOrgSlug, fetchOrganization]);

  // Save org slug to localStorage when it changes
  useEffect(() => {
    if (organization?.slug) {
      localStorage.setItem('current_org_slug', organization.slug);
    }
  }, [organization?.slug]);

  // Restore department preference
  useEffect(() => {
    if (organization?.id) {
      const savedDeptId = localStorage.getItem(`org_${organization.id}_dept`);
      if (savedDeptId) {
        const dept = organization.departments?.find((d: Department) => d.id === savedDeptId);
        if (dept && dept.is_active) {
          setDepartment(dept);
        }
      }
    }
  }, [organization]);

  const value = useMemo<OrganizationContextType>(() => ({
    organization,
    department,
    settings,
    loading,
    error,
    switchDepartment,
    refreshOrganization,
    formatCurrency,
    getLevels,
    getSections,
  }), [
    organization,
    department,
    settings,
    loading,
    error,
    switchDepartment,
    refreshOrganization,
    formatCurrency,
    getLevels,
    getSections,
  ]);

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
};

export default OrganizationContext;

// NOTE: Import hooks directly from './useOrganization' instead:
// import { useOrganization, useCurrency, useAcademicConfig } from './useOrganization';
