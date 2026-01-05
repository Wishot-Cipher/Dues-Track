/**
 * Department Service
 * 
 * Handles CRUD operations for departments within organizations.
 * Each department belongs to exactly one organization.
 * 
 * NOTE: When integrating, update import to: import { supabase } from '@/lib/supabase';
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = null; // TODO: Replace with actual import when integrating
import type { Department } from '../types';

// ============================================================
// Types
// ============================================================

export interface CreateDepartmentInput {
  organization_id: string;
  name: string;
  short_name: string;
  code?: string;
  levels?: string[];
  sections?: string[];
  head_of_department?: string;
  email?: string;
}

export interface UpdateDepartmentInput extends Partial<Omit<CreateDepartmentInput, 'organization_id'>> {
  id: string;
}

export interface DepartmentWithStats extends Department {
  student_count?: number;
  admin_count?: number;
  payment_type_count?: number;
}

// ============================================================
// Department Service
// ============================================================

export const departmentService = {
  /**
   * Get all departments for an organization
   */
  async getByOrganization(orgId: string): Promise<Department[]> {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('[departmentService.getByOrganization] Error:', error);
      throw new Error('Failed to fetch departments');
    }

    return data || [];
  },

  /**
   * Get department by ID
   */
  async getById(id: string): Promise<Department | null> {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[departmentService.getById] Error:', error);
      throw new Error('Failed to fetch department');
    }

    return data;
  },

  /**
   * Get department by short name within an organization
   */
  async getByShortName(orgId: string, shortName: string): Promise<Department | null> {
    const { data, error } = await supabase
      .from('departments')
      .select('*')
      .eq('organization_id', orgId)
      .eq('short_name', shortName)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null;
      console.error('[departmentService.getByShortName] Error:', error);
      throw new Error('Failed to fetch department');
    }

    return data;
  },

  /**
   * Create a new department
   */
  async create(input: CreateDepartmentInput): Promise<Department> {
    // Default levels if not provided
    const levels = input.levels || ['100L', '200L', '300L', '400L', '500L'];

    const { data, error } = await supabase
      .from('departments')
      .insert({
        ...input,
        levels,
        is_active: true,
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        throw new Error('A department with this short name already exists in this organization');
      }
      console.error('[departmentService.create] Error:', error);
      throw new Error('Failed to create department');
    }

    return data;
  },

  /**
   * Update a department
   */
  async update(input: UpdateDepartmentInput): Promise<Department> {
    const { id, ...updates } = input;

    const { data, error } = await supabase
      .from('departments')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[departmentService.update] Error:', error);
      throw new Error('Failed to update department');
    }

    return data;
  },

  /**
   * Deactivate a department (soft delete)
   */
  async deactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('departments')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[departmentService.deactivate] Error:', error);
      throw new Error('Failed to deactivate department');
    }
  },

  /**
   * Reactivate a department
   */
  async reactivate(id: string): Promise<void> {
    const { error } = await supabase
      .from('departments')
      .update({ is_active: true, updated_at: new Date().toISOString() })
      .eq('id', id);

    if (error) {
      console.error('[departmentService.reactivate] Error:', error);
      throw new Error('Failed to reactivate department');
    }
  },

  /**
   * Get department statistics
   */
  async getStats(deptId: string): Promise<{
    studentCount: number;
    adminCount: number;
    paymentTypeCount: number;
    pendingPayments: number;
  }> {
    const [students, admins, paymentTypes, pendingPayments] = await Promise.all([
      supabase.from('students').select('id', { count: 'exact', head: true }).eq('department_id', deptId).eq('is_active', true),
      supabase.from('admins').select('id', { count: 'exact', head: true }).eq('department_id', deptId).eq('is_active', true),
      supabase.from('payment_types').select('id', { count: 'exact', head: true }).eq('department_id', deptId).eq('is_active', true),
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('department_id', deptId).eq('status', 'pending'),
    ]);

    return {
      studentCount: students.count || 0,
      adminCount: admins.count || 0,
      paymentTypeCount: paymentTypes.count || 0,
      pendingPayments: pendingPayments.count || 0,
    };
  },

  /**
   * Get all departments with stats for an organization
   */
  async getAllWithStats(orgId: string): Promise<DepartmentWithStats[]> {
    const departments = await this.getByOrganization(orgId);
    
    // Fetch stats for each department in parallel
    const statsPromises = departments.map(async (dept) => {
      const stats = await this.getStats(dept.id);
      return {
        ...dept,
        student_count: stats.studentCount,
        admin_count: stats.adminCount,
        payment_type_count: stats.paymentTypeCount,
      };
    });

    return Promise.all(statsPromises);
  },

  /**
   * Update department levels
   */
  async updateLevels(id: string, levels: string[]): Promise<Department> {
    const { data, error } = await supabase
      .from('departments')
      .update({ levels, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[departmentService.updateLevels] Error:', error);
      throw new Error('Failed to update levels');
    }

    return data;
  },

  /**
   * Update department sections
   */
  async updateSections(id: string, sections: string[]): Promise<Department> {
    const { data, error } = await supabase
      .from('departments')
      .update({ sections, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('[departmentService.updateSections] Error:', error);
      throw new Error('Failed to update sections');
    }

    return data;
  },

  /**
   * Check if short name is available within an organization
   */
  async isShortNameAvailable(orgId: string, shortName: string, excludeId?: string): Promise<boolean> {
    let query = supabase
      .from('departments')
      .select('id')
      .eq('organization_id', orgId)
      .eq('short_name', shortName);

    if (excludeId) {
      query = query.neq('id', excludeId);
    }

    const { data, error } = await query.single();

    if (error && error.code === 'PGRST116') return true;
    return !data;
  },
};

export default departmentService;
