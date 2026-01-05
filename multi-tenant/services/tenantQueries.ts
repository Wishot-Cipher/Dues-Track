/**
 * Multi-Tenant Query Helpers
 * 
 * These utilities help add organization/department filtering to existing queries.
 * They wrap around existing service calls to enforce tenant isolation.
 * 
 * NOTE: When integrating, update import to: import { supabase } from '@/lib/supabase';
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = null; // TODO: Replace with actual import when integrating

// ============================================================
// Types
// ============================================================

export interface TenantContext {
  organizationId: string;
  departmentId?: string;
}

// ============================================================
// Query Builder Helpers
// ============================================================

// Generic query type for Supabase-like queries
interface SupabaseQuery {
  eq: (column: string, value: string | boolean) => SupabaseQuery;
}

/**
 * Create a base query with organization filter
 */
export function withOrgFilter(
  query: SupabaseQuery,
  orgId: string
): SupabaseQuery {
  return query.eq('organization_id', orgId);
}

/**
 * Create a base query with organization and department filter
 */
export function withTenantFilter(
  query: SupabaseQuery,
  context: TenantContext
): SupabaseQuery {
  let filtered = query.eq('organization_id', context.organizationId);
  if (context.departmentId) {
    filtered = filtered.eq('department_id', context.departmentId);
  }
  return filtered;
}

// ============================================================
// Student Query Helpers
// ============================================================

export const tenantStudentQueries = {
  /**
   * Get all students in a department
   */
  async getAll(context: TenantContext) {
    let query = supabase
      .from('students')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('is_active', true)
      .order('full_name');

    if (context.departmentId) {
      query = query.eq('department_id', context.departmentId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /**
   * Search students within tenant
   */
  async search(context: TenantContext, searchTerm: string) {
    let query = supabase
      .from('students')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('is_active', true)
      .or(`full_name.ilike.%${searchTerm}%,reg_number.ilike.%${searchTerm}%`)
      .order('full_name')
      .limit(20);

    if (context.departmentId) {
      query = query.eq('department_id', context.departmentId);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /**
   * Get student by reg number within organization
   */
  async getByRegNumber(orgId: string, regNumber: string) {
    const { data, error } = await supabase
      .from('students')
      .select('*')
      .eq('organization_id', orgId)
      .eq('reg_number', regNumber)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    return data;
  },
};

// ============================================================
// Payment Query Helpers
// ============================================================

export const tenantPaymentQueries = {
  /**
   * Get all payment types for a department
   */
  async getPaymentTypes(context: TenantContext) {
    const { data, error } = await supabase
      .from('payment_types')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('department_id', context.departmentId)
      .eq('is_active', true)
      .order('display_order', { ascending: true });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get payments for a student
   */
  async getStudentPayments(context: TenantContext, studentId: string) {
    const { data, error } = await supabase
      .from('payments')
      .select('*, payment_types(*)')
      .eq('organization_id', context.organizationId)
      .eq('student_id', studentId)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get pending payments for a department
   */
  async getPendingPayments(context: TenantContext) {
    const { data, error } = await supabase
      .from('payments')
      .select('*, students(*), payment_types(*)')
      .eq('organization_id', context.organizationId)
      .eq('department_id', context.departmentId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Get payment statistics for a department
   */
  async getStats(context: TenantContext) {
    const [totalPaid, pendingCount, approvedCount] = await Promise.all([
      supabase
        .from('payments')
        .select('amount')
        .eq('organization_id', context.organizationId)
        .eq('department_id', context.departmentId)
        .eq('status', 'approved'),
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .eq('department_id', context.departmentId)
        .eq('status', 'pending'),
      supabase
        .from('payments')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .eq('department_id', context.departmentId)
        .eq('status', 'approved'),
    ]);

    const total = (totalPaid.data || []).reduce((sum: number, p: { amount?: number }) => sum + (p.amount || 0), 0);

    return {
      totalCollected: total,
      pendingCount: pendingCount.count || 0,
      approvedCount: approvedCount.count || 0,
    };
  },
};

// ============================================================
// Expense Query Helpers
// ============================================================

export const tenantExpenseQueries = {
  /**
   * Get expense categories
   */
  async getCategories(orgId: string, deptId?: string) {
    let query = supabase
      .from('expense_categories')
      .select('*')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .order('name');

    // Include org-wide categories (null department_id) and dept-specific
    if (deptId) {
      query = query.or(`department_id.is.null,department_id.eq.${deptId}`);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /**
   * Get expenses for a department
   */
  async getExpenses(context: TenantContext, status?: string) {
    let query = supabase
      .from('expenses')
      .select('*, expense_categories(*)')
      .eq('organization_id', context.organizationId)
      .eq('department_id', context.departmentId)
      .order('expense_date', { ascending: false });

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;
    return data || [];
  },

  /**
   * Get expense totals
   */
  async getTotals(context: TenantContext) {
    const { data, error } = await supabase
      .from('expenses')
      .select('amount, status')
      .eq('organization_id', context.organizationId)
      .eq('department_id', context.departmentId);

    if (error) throw error;

    const expenses = data || [];
    return {
      total: expenses.filter((e: { status: string }) => e.status === 'approved').reduce((sum: number, e: { amount: number }) => sum + e.amount, 0),
      pending: expenses.filter((e: { status: string }) => e.status === 'pending').reduce((sum: number, e: { amount: number }) => sum + e.amount, 0),
      count: expenses.length,
    };
  },
};

// ============================================================
// Notification Query Helpers
// ============================================================

export const tenantNotificationQueries = {
  /**
   * Get unread notifications for a student
   */
  async getUnread(orgId: string, studentId: string) {
    const { data, error } = await supabase
      .from('notifications')
      .select('*')
      .eq('organization_id', orgId)
      .eq('student_id', studentId)
      .eq('is_read', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return data || [];
  },

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string) {
    const { error } = await supabase
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })
      .eq('id', notificationId);

    if (error) throw error;
  },

  /**
   * Create a notification
   */
  async create(orgId: string, studentId: string, notification: {
    type: string;
    title: string;
    message: string;
    link?: string;
    related_type?: string;
    related_id?: string;
  }) {
    const { error } = await supabase
      .from('notifications')
      .insert({
        organization_id: orgId,
        student_id: studentId,
        ...notification,
      });

    if (error) throw error;
  },
};

// ============================================================
// Export all helpers
// ============================================================

export const tenantQueries = {
  students: tenantStudentQueries,
  payments: tenantPaymentQueries,
  expenses: tenantExpenseQueries,
  notifications: tenantNotificationQueries,
};

export default tenantQueries;
