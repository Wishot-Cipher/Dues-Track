/**
 * Organization Context
 * Manages organization and group state for Payvexo multi-tenant support
 * Supports: Universities, Churches, Clubs, Associations, Cooperatives, NGOs
 */

import { createContext, useState, useEffect, useCallback, type ReactNode } from 'react';
import type { Organization, OrganizationGroup, OrganizationSettings, OrganizationContextType } from '@/types/multiTenant';
import { ORG_TYPE_DEFAULTS } from '@/types/multiTenant';
import { supabase } from '@/config/supabase';

const OrganizationContext = createContext<OrganizationContextType | null>(null);

export { OrganizationContext };

// ============================================================
// STORAGE KEYS
// ============================================================

const STORAGE_KEYS = {
  ORGANIZATION: 'pvx_organization',
  GROUP: 'pvx_group',
  SETTINGS: 'pvx_settings',
};

// ============================================================
// PROVIDER
// ============================================================

interface OrganizationProviderProps {
  children: ReactNode;
}

export function OrganizationProvider({ children }: OrganizationProviderProps) {
  const [organization, setOrganizationState] = useState<Organization | null>(null);
  const [group, setGroupState] = useState<OrganizationGroup | null>(null);
  const [settings, setSettings] = useState<OrganizationSettings | null>(null);
  const [groups, setGroups] = useState<OrganizationGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Detect multi-tenant mode
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

  const setGroup = useCallback((grp: OrganizationGroup | null) => {
    setGroupState(grp);
    saveToStorage(STORAGE_KEYS.GROUP, grp);
  }, [saveToStorage]);

  const clearOrganization = useCallback(() => {
    setOrganizationState(null);
    setGroupState(null);
    setSettings(null);
    setGroups([]);
    localStorage.removeItem(STORAGE_KEYS.ORGANIZATION);
    localStorage.removeItem(STORAGE_KEYS.GROUP);
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
        .eq('slug', slug.toLowerCase())
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

      // Fetch groups for this organization
      const { data: orgGroups } = await supabase
        .from('organization_groups')
        .select('*')
        .eq('organization_id', org.id)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name');

      if (orgGroups) {
        setGroups(orgGroups as OrganizationGroup[]);
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

  const switchGroup = useCallback(async (groupId: string) => {
    const grp = groups.find(g => g.id === groupId);
    if (grp) {
      setGroup(grp);
    }
  }, [groups, setGroup]);

  const refreshOrganization = useCallback(async () => {
    if (organization?.slug) {
      await fetchOrganizationBySlug(organization.slug);
    }
  }, [organization?.slug, fetchOrganizationBySlug]);

  // ============================================================
  // HELPERS (context-aware, uses org terminology)
  // ============================================================

  const formatCurrency = useCallback((amount: number): string => {
    const symbol = organization?.currency_symbol || '₦';
    const code = organization?.currency_code || 'NGN';

    try {
      const formatted = new Intl.NumberFormat(organization?.locale || 'en-NG', {
        style: 'currency',
        currency: code,
        minimumFractionDigits: 0,
        maximumFractionDigits: 2,
      }).format(amount);

      return formatted.replace(code, symbol);
    } catch {
      return `${symbol}${amount.toLocaleString()}`;
    }
  }, [organization?.currency_symbol, organization?.currency_code, organization?.locale]);

  const getLevels = useCallback((): string[] => {
    let levels: string[];
    // Group levels override org-type defaults
    if (group?.levels && group.levels.length > 0) {
      levels = group.levels;
    } else if (organization?.organization_type) {
      // Fall back to org type defaults
      const defaults = ORG_TYPE_DEFAULTS[organization.organization_type];
      levels = defaults ? defaults.default_levels : ['Level 1', 'Level 2', 'Level 3'];
    } else {
      levels = ['Level 1', 'Level 2', 'Level 3'];
    }
    // Always deduplicate (trim + case-insensitive, preserve first casing)
    const seen = new Set<string>();
    return levels.filter(l => {
      const key = l.trim().toLowerCase();
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [group?.levels, organization?.organization_type]);

  const getSections = useCallback((): string[] => {
    if (group?.sections && group.sections.length > 0) {
      return group.sections;
    }
    return ['A', 'B', 'C'];
  }, [group?.sections]);

  const getMemberLabel = useCallback((plural = false): string => {
    if (plural) return organization?.member_label_plural || 'Members';
    return organization?.member_label || 'Member';
  }, [organization?.member_label, organization?.member_label_plural]);

  const getGroupLabel = useCallback((plural = false): string => {
    if (plural) return organization?.group_label_plural || 'Groups';
    return organization?.group_label || 'Group';
  }, [organization?.group_label, organization?.group_label_plural]);

  const getPaymentLabel = useCallback((): string => {
    return organization?.payment_label || 'Payments';
  }, [organization?.payment_label]);

  // ============================================================
  // INITIALIZATION
  // ============================================================

  useEffect(() => {
    const storedOrg = loadFromStorage<Organization>(STORAGE_KEYS.ORGANIZATION);
    const storedGroup = loadFromStorage<OrganizationGroup>(STORAGE_KEYS.GROUP);
    const storedSettings = loadFromStorage<OrganizationSettings>(STORAGE_KEYS.SETTINGS);

    if (storedOrg) {
      setOrganizationState(storedOrg);
      // Refresh in background
      fetchOrganizationBySlug(storedOrg.slug).catch(console.error);
    }

    if (storedGroup) {
      setGroupState(storedGroup);
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
    group,
    settings,
    groups,
    loading,
    error,
    setOrganization,
    setGroup,
    switchGroup,
    fetchOrganizationBySlug,
    refreshOrganization,
    clearOrganization,
    formatCurrency,
    getLevels,
    getSections,
    getMemberLabel,
    getGroupLabel,
    getPaymentLabel,
    isMultiTenant,
  };

  return (
    <OrganizationContext.Provider value={value}>
      {children}
    </OrganizationContext.Provider>
  );
}


export default OrganizationContext;
