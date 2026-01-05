/**
 * Organization Service
 * 
 * Handles CRUD operations for organizations (universities/institutions).
 * This is part of the multi-tenant infrastructure.
 * 
 * NOTE: When integrating, update import to: import { supabase } from '@/lib/supabase';
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = null; // TODO: Replace with actual import when integrating
import type { Organization, Department, OrganizationSettings } from '../types';

// ============================================================
// Types
// ============================================================

export interface CreateOrganizationInput {
  name: string;
  short_name: string;
  slug?: string;  // Auto-generated if not provided
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  country?: string;
  currency_code?: string;
  currency_symbol?: string;
  timezone?: string;
  logo_url?: string;
  primary_color?: string;
  secondary_color?: string;
}

export interface UpdateOrganizationInput extends Partial<CreateOrganizationInput> {
  id: string;
}

export interface OrganizationWithDetails extends Organization {
  departments?: Department[];
  settings?: OrganizationSettings;
  student_count?: number;
  admin_count?: number;
}

// ============================================================
// Organization Service
// ============================================================

export const organizationService = {
  /**
   * Get organization by slug (URL-friendly identifier)
   * Used for public routes like /futo/login
   */
  async getBySlug(slug: string): Promise<OrganizationWithDetails | null> {
    const { data, error } = await supabase
      .from('organizations')
      .select(`
        *,
        departments (*),
        organization_settings (*)
      `)
      .eq('slug', slug)
      .eq('is_active', true)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      console.error('[organizationService.getBySlug] Error:', error);
      throw new Error('Failed to fetch organization');
    }

    return {
      ...data,
      departments: data.departments || [],
      settings: data.organization_settings?.[0] || null,
    };
  },

  /**
   * Get organization by ID
   */
  async getById(id: string): Promise<OrganizationWithDetails | null> {
    const { data, error } = await supabase
      .from('organizations')
      .select(`
        *,
        departments (*),
        organization_settings (*)
      `)
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[organizationService.getById] Error:', error);
      throw new Error('Failed to fetch organization');
    }

    return {
      ...data,
      departments: data.departments || [],
      settings: data.organization_settings?.[0] || null,
    };
  },

  /**
   * Get all active organizations
   * Used for super admin dashboard and org selection
   */
  async getAll(): Promise<Organization[]> {
    const { data, error } = await supabase
      .from('organizations')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('[organizationService.getAll] Error:', error);
      throw new Error('Failed to fetch organizations');
    }

    return data || [];
  },

  /**
   * Create a new organization
   * Only callable by super admins
   */
  async create(input: CreateOrganizationInput): Promise<Organization> {
    // Generate slug from short_name if not provided
    const slug = input.slug || input.short_name.toLowerCase().replace(/[^a-z0-9]/g, '-');

    const { data, error } = await supabase
      .from('organizations')
      .insert({
        ...input,
        slug,
        is_active: true,
        is_verified: false,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('An organization with this name or slug already exists');
      }
      console.error('[organizationService.create] Error:', error);
      throw new Error('Failed to create organization');
    }

    return data;
  },

  /**
   * Update an organization
   */
  async update(input: UpdateOrganizationInput): Promise<Organization> {
    const { id, ...updates } = input;

    const { data, error } = await supabase
      .from('organizations')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[organizationService.update] Error:', error);
      throw new Error('Failed to update organization');
    }

    return data;
  },

  /**
   * Deactivate an organization (soft delete)
   */
  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('organizations')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[organizationService.deactivate] Error:', error);
      throw new Error('Failed to deactivate organization');
    }
  },

  /**
   * Get organization statistics
   */
  async getStats(orgId: string): Promise<{
    studentCount: number;
    adminCount: number;
    departmentCount: number;
    totalPayments: number;
    pendingPayments: number;
  }> {
    // Get counts using parallel queries
    const [students, admins, departments, payments, pendingPayments] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      supabase.from('admins').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
      supabase.from('departments').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('is_active', true),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('organization_id', orgId),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('organization_id', orgId).eq('status', 'pending'),
    ]);

    return {
      studentCount: students.count || 0,
      adminCount: admins.count || 0,
      departmentCount: departments.count || 0,
      totalPayments: payments.count || 0,
      pendingPayments: pendingPayments.count || 0,
    };
  },

  /**
   * Check if a slug is available
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('organizations')
      .select('id')
      .eq('slug', slug)
      .single();

    if (error && error.code === 'PGRST116') return true; // Not found = available
    return !data;
  },

  /**
   * Update organization settings
   */
  async updateSettings(
    orgId: string, 
    settings: Partial<Omit<OrganizationSettings, 'id' | 'organization_id' | 'created_at' | 'updated_at'>>
  ): Promise<OrganizationSettings> {
    const { data, error } = await supabase
      .from('organization_settings')
      .update({
        ...settings,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId)
      .select()
      .single();

    if (error) {
      console.error('[organizationService.updateSettings] Error:', error);
      throw new Error('Failed to update settings');
    }

    return data;
  },

  /**
   * Get organization settings
   */
  async getSettings(orgId: string): Promise<OrganizationSettings | null> {
    const { data, error } = await supabase
      .from('organization_settings')
      .select('*')
      .eq('organization_id', orgId)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[organizationService.getSettings] Error:', error);
      throw new Error('Failed to fetch settings');
    }

    return data;
  },
};

export default organizationService;
