/**
 * Organization Context
 * Manages organization and department state for multi-tenant support
 */

import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Organization, Department, OrganizationSettings } from '@/types/multiTenant';
import { supabase } from '@/config/supabase';

// ============================================================
// CONTEXT TYPES
// ============================================================

export interface OrganizationContextType {
  // Current organization & department
  organization: Organization | null;
  department: Department | null;
  settings: OrganizationSettings | null;
  
  // Available departments (for switching)
  departments: Department[];
  
  // Loading state
  loading: boolean;
  error: string | null;
  
  // Actions
  setOrganization: (org: Organization | null) => void;
  setDepartment: (dept: Department | null) => void;
  switchDepartment: (departmentId: string) => Promise<void>;
  fetchOrganizationBySlug: (slug: string) => Promise<Organization | null>;
  refreshOrganization: () => Promise<void>;
  clearOrganization: () => void;
  
  // Helpers
  formatCurrency: (amount: number) => string;
  getLevels: () => string[];
  getSections: () => string[];
  
  // Multi-tenant mode detection
  isMultiTenant: boolean;
}

const OrganizationContext = createContext<OrganizationContextType | null>(null);

// ============================================================
// STORAGE KEYS
// ============================================================

const STORAGE_KEYS = {
  ORGANIZATION: 'current_organization',
  DEPARTMENT: 'current_department',
  SETTINGS: 'organization_settings',
};

// ============================================================
// PROVIDER
// ============================================================

interface OrganizationProviderProps {
  children: ReactNode;
}

export function OrganizationProvider({ children }: OrganizationProviderProps) {
  const [organization, setOrganizationState] = useState<Organization | null>(null);
  const [department, setDepartmentState] = useState<Department | null>(null);
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detect if we're in multi-tenant mode based on env or database
  const isMultiTenant = Boolean(
    import.meta.env.VITE_MULTI_TENANT === 'true' || 
    organization !== null
  );

  // ============================================================
  // PERSISTENCE
  // ============================================================

  const saveToStorage = useCallback((key: string, value: unknown) => {
    try {
      if (value === null) {
        localStorage.removeItem(key);
      } else {
        localStorage.setItem(key, JSON.stringify(value));
      }
    } catch (e) {
      console.error('Error saving to localStorage:', e);
    }
  }, []);

  const loadFromStorage = useCallback(<T,>(key: string): T | null => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? JSON.parse(stored) : null;
    } catch (e) {
      console.error('Error loading from localStorage:', e);
      return null;
    }
  }, []);

  // ============================================================
  // SETTERS WITH PERSISTENCE
  // ============================================================

  const setOrganization = useCallback((org: Organization | null) => {
    setOrganizationState(org);
    saveToStorage(STORAGE_KEYS.ORGANIZATION, org);
  }, [saveToStorage]);

  const setDepartment = useCallback((dept: Department | null) => {
    setDepartmentState(dept);
    saveToStorage(STORAGE_KEYS.DEPARTMENT, dept);
  }, [saveToStorage]);

  const clearOrganization = useCallback(() => {
    setOrganizationState(null);
    setDepartmentState(null);
    setSettings(null);
    setDepartments([]);
    localStorage.removeItem(STORAGE_KEYS.ORGANIZATION);
    localStorage.removeItem(STORAGE_KEYS.DEPARTMENT);
    localStorage.removeItem(STORAGE_KEYS.SETTINGS);
  }, []);

  // ============================================================
  // DATA FETCHING
  // ============================================================

  const fetchOrganizationBySlug = useCallback(async (slug: string): Promise<Organization | null> => {
    try {
      setLoading(true);
      setError(null);

      const { data, error: fetchError } = await supabase
        .from('organizations')
        .select(`
          *,
          settings:organization_settings(*)
        `)
        .eq('slug', slug)
        .eq('is_active', true)
        .single();

      if (fetchError) {
        console.error('Error fetching organization:', fetchError);
        setError('Organization not found');
        return null;
      }

      const org = data as Organization;
      setOrganization(org);
      
      if (data.settings) {
        setSettings(data.settings as OrganizationSettings);
        saveToStorage(STORAGE_KEYS.SETTINGS, data.settings);
      }

      // Fetch departments for this organization
      const { data: depts } = await supabase
        .from('departments')
        .select('*')
        .eq('organization_id', org.id)
        .eq('is_active', true)
        .order('name');

      if (depts) {
        setDepartments(depts as Department[]);
      }

      return org;
    } catch (e) {
      console.error('Error in fetchOrganizationBySlug:', e);
      setError('Failed to load organization');
      return null;
    } finally {
      setLoading(false);
    }
  }, [setOrganization, saveToStorage]);

  const switchDepartment = useCallback(async (departmentId: string) => {
    const dept = departments.find(d => d.id === departmentId);
    if (dept) {
      setDepartment(dept);
    }
  }, [departments, setDepartment]);

  const refreshOrganization = useCallback(async () => {
    if (organization?.slug) {
      await fetchOrganizationBySlug(organization.slug);
    }
  }, [organization?.slug, fetchOrganizationBySlug]);

  // ============================================================
  // HELPERS
  // ============================================================

  const formatCurrency = useCallback((amount: number): string => {
    const symbol = organization?.currency_symbol || '₦';
    const code = organization?.currency_code || 'NGN';
    
    try {
      const formatted = new Intl.NumberFormat('en-NG', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount);
      
      // Replace currency code with symbol if needed
      return formatted.replace(code, symbol);
    } catch {
      // Fallback for unsupported currencies
      return `${symbol}${amount.toLocaleString()}`;
    }
  }, [organization?.currency_symbol, organization?.currency_code]);

  const getLevels = useCallback((): string[] => {
    // Department levels override org defaults
    if (department?.levels && department.levels.length > 0) {
      return department.levels;
    }
    // Default levels
    return ['100L', '200L', '300L', '400L', '500L'];
  }, [department?.levels]);

  const getSections = useCallback((): string[] => {
    if (department?.sections && department.sections.length > 0) {
      return department.sections;
    }
    return ['A', 'B', 'C'];
  }, [department?.sections]);

  // ============================================================
  // INITIALIZATION
  // ============================================================

  useEffect(() => {
    // Load persisted organization data on mount
    const storedOrg = loadFromStorage<Organization>(STORAGE_KEYS.ORGANIZATION);
    const storedDept = loadFromStorage<Department>(STORAGE_KEYS.DEPARTMENT);
    const storedSettings = loadFromStorage<OrganizationSettings>(STORAGE_KEYS.SETTINGS);

    if (storedOrg) {
      setOrganizationState(storedOrg);
      // Refresh in background to ensure data is current
      fetchOrganizationBySlug(storedOrg.slug).catch(console.error);
    }

    if (storedDept) {
      setDepartmentState(storedDept);
    }

    if (storedSettings) {
      setSettings(storedSettings);
    }

    setLoading(false);
  }, [loadFromStorage, fetchOrganizationBySlug]);

  // ============================================================
  // CONTEXT VALUE
  // ============================================================

  const value: OrganizationContextType = {
    organization,
    department,
    settings,
    departments,
    loading,
    error,
    setOrganization,
    setDepartment,
    switchDepartment,
    fetchOrganizationBySlug,
    refreshOrganization,
    clearOrganization,
    formatCurrency,
    getLevels,
    getSections,
    isMultiTenant,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}

// ============================================================
// HOOK
// ============================================================

export function useOrganization(): OrganizationContextType {
  const context = useContext(OrganizationContext);
  if (!context) {
    throw new Error('useOrganization must be used within an OrganizationProvider');
  }
  return context;
}

export default OrganizationContext;
