/* eslint-disable @typescript-eslint/no-unused-vars */
/**
 * Organization Service
 * API service for fetching organization and department data
 */

import { supabase } from '@/config/supabase';
import type { Organization, Department } from '@/types/multiTenant';

export interface OrganizationWithDepartments extends Organization {
    departments: Department[];
}

export const organizationService = {
    /**
     * Fetch organization by URL slug
     */
    async getBySlug(slug: string): Promise<Organization | null> {
        try {
            const { data, error } = await supabase
                .from('organizations')
                .select(`
          *,
          settings:organization_settings(*)
        `)
                .eq('slug', slug.toLowerCase())
                .eq('is_active', true)
                .single();

            if (error) {
                console.error('Error fetching organization:', error);
                return null;
            }

            return data as Organization;
        } catch (error) {
            console.error('Error in getBySlug:', error);
            return null;
        }
    },

    /**
     * Fetch all active organizations (for selector page)
     */
    async getAll(): Promise<Organization[]> {
        try {
            const { data, error } = await supabase
                .from('organizations')
                .select('id, name, short_name, slug, logo_url, primary_color')
                .eq('is_active', true)
                .order('name');

            if (error) {
                console.error('Error fetching organizations:', error);
                return [];
            }

            return data as Organization[];
        } catch (error) {
            console.error('Error in getAll:', error);
            return [];
        }
    },

    /**
     * Search organizations by name
     */
    async search(query: string): Promise<Organization[]> {
        try {
            const { data, error } = await supabase
                .from('organizations')
                .select('id, name, short_name, slug, logo_url, primary_color')
                .eq('is_active', true)
                .or(`name.ilike.%${query}%,short_name.ilike.%${query}%`)
                .limit(10);

            if (error) {
                console.error('Error searching organizations:', error);
                return [];
            }

            return data as Organization[];
        } catch (error) {
            console.error('Error in search:', error);
            return [];
        }
    },

    /**
     * Fetch departments for an organization
     */
    async getDepartments(organizationId: string): Promise<Department[]> {
        try {
            const { data, error } = await supabase
                .from('departments')
                .select('*')
                .eq('organization_id', organizationId)
                .eq('is_active', true)
                .order('name');

            if (error) {
                console.error('Error fetching departments:', error);
                return [];
            }

            return data as Department[];
        } catch (error) {
            console.error('Error in getDepartments:', error);
            return [];
        }
    },

    /**
     * Fetch a single department by ID
     */
    async getDepartmentById(departmentId: string): Promise<Department | null> {
        try {
            const { data, error } = await supabase
                .from('departments')
                .select('*')
                .eq('id', departmentId)
                .single();

            if (error) {
                console.error('Error fetching department:', error);
                return null;
            }

            return data as Department;
        } catch (error) {
            console.error('Error in getDepartmentById:', error);
            return null;
        }
    },

    /**
     * Find organizations that a student belongs to (by reg number pattern)
     * This is used for "smart login" where we auto-detect the org
     */
    async findByRegNumber(_regNumber: string): Promise<Organization[]> {
        // For now, just return all orgs - can be enhanced to match patterns
        return this.getAll();
    },

    /**
     * Get the default organization (for backwards compatibility)
     * This returns the first org if only one exists (single-tenant mode)
     */
    async getDefault(): Promise<Organization | null> {
        try {
            const { data, error } = await supabase
                .from('organizations')
                .select('*', { count: 'exact' })
                .eq('is_active', true)
                .limit(1)
                .single();

            if (error || !data) {
                return null;
            }

            return data as Organization;
        } catch (error) {
            console.error('Error in getDefault:', error);
            return null;
        }
    },

    /**
     * Check if system is in multi-tenant mode
     * (more than one organization exists)
     */
    async isMultiTenant(): Promise<boolean> {
        try {
            const { count, error } = await supabase
                .from('organizations')
                .select('id', { count: 'exact', head: true })
                .eq('is_active', true);

            if (error) {
                return false;
            }

            return (count ?? 0) > 1;
        } catch (error) {
            console.error('Error checking multi-tenant:', error);
            return false;
        }
    },
};

export default organizationService;
