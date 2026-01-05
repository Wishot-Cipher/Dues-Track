/**
 * Multi-Tenant Hooks
 * 
 * Custom hooks for common multi-tenant operations.
 */

import { useState, useEffect, useCallback } from 'react';
import { useOrganization } from '../contexts/useOrganization';
import { tenantQueries, TenantContext } from '../services/tenantQueries';

// ============================================================
// Hook: useTenantContext
// ============================================================

/**
 * Get the current tenant context for queries
 */
export function useTenantContext(): TenantContext | null {
  const { organization, department } = useOrganization();
  
  if (!organization) return null;
  
  return {
    organizationId: organization.id,
    departmentId: department?.id,
  };
}

// ============================================================
// Hook: useTenantQuery
// ============================================================

interface UseTenantQueryOptions<T> {
  queryFn: (context: TenantContext) => Promise<T>;
  enabled?: boolean;
  onSuccess?: (data: T) => void;
  onError?: (error: Error) => void;
}

interface UseTenantQueryResult<T> {
  data: T | null;
  loading: boolean;
  error: Error | null;
  refetch: () => Promise<void>;
}

/**
 * Execute a query with automatic tenant context
 */
export function useTenantQuery<T>(
  options: UseTenantQueryOptions<T>
): UseTenantQueryResult<T> {
  const context = useTenantContext();
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const { queryFn, enabled = true, onSuccess, onError } = options;

  const execute = useCallback(async () => {
    if (!context || !enabled) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      setError(null);
      const result = await queryFn(context);
      setData(result);
      onSuccess?.(result);
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Query failed');
      setError(error);
      onError?.(error);
    } finally {
      setLoading(false);
    }
  }, [context, enabled, queryFn, onSuccess, onError]);

  useEffect(() => {
    execute();
  }, [execute]);

  return { data, loading, error, refetch: execute };
}

// ============================================================
// Hook: useStudents
// ============================================================

/**
 * Get all students in the current department
 */
export function useStudents() {
  return useTenantQuery({
    queryFn: (ctx) => tenantQueries.students.getAll(ctx),
  });
}

/**
 * Search students
 */
export function useStudentSearch(searchTerm: string) {
  return useTenantQuery({
    queryFn: (ctx) => tenantQueries.students.search(ctx, searchTerm),
    enabled: searchTerm.length >= 2,
  });
}

// ============================================================
// Hook: usePaymentTypes
// ============================================================

/**
 * Get all payment types for the current department
 */
export function usePaymentTypes() {
  return useTenantQuery({
    queryFn: (ctx) => tenantQueries.payments.getPaymentTypes(ctx),
  });
}

// ============================================================
// Hook: usePayments
// ============================================================

/**
 * Get pending payments for approval
 */
export function usePendingPayments() {
  return useTenantQuery({
    queryFn: (ctx) => tenantQueries.payments.getPendingPayments(ctx),
  });
}

/**
 * Get payments for a specific student
 */
export function useStudentPayments(studentId: string) {
  return useTenantQuery({
    queryFn: (ctx) => tenantQueries.payments.getStudentPayments(ctx, studentId),
    enabled: !!studentId,
  });
}

/**
 * Get payment statistics
 */
export function usePaymentStats() {
  return useTenantQuery({
    queryFn: (ctx) => tenantQueries.payments.getStats(ctx),
  });
}

// ============================================================
// Hook: useExpenses
// ============================================================

/**
 * Get expense categories
 */
export function useExpenseCategories() {
  const { organization, department } = useOrganization();
  
  return useTenantQuery({
    queryFn: () => tenantQueries.expenses.getCategories(
      organization!.id, 
      department?.id
    ),
    enabled: !!organization,
  });
}

/**
 * Get expenses for the current department
 */
export function useExpenses(status?: string) {
  return useTenantQuery({
    queryFn: (ctx) => tenantQueries.expenses.getExpenses(ctx, status),
  });
}

/**
 * Get expense totals
 */
export function useExpenseTotals() {
  return useTenantQuery({
    queryFn: (ctx) => tenantQueries.expenses.getTotals(ctx),
  });
}

// ============================================================
// Hook: useNotifications
// ============================================================

/**
 * Get unread notifications for the current user
 */
export function useUnreadNotifications(studentId: string) {
  const { organization } = useOrganization();
  
  return useTenantQuery({
    queryFn: () => tenantQueries.notifications.getUnread(organization!.id, studentId),
    enabled: !!organization && !!studentId,
  });
}

// ============================================================
// Hook: useDepartmentSwitcher
// ============================================================

/**
 * Hook for switching between departments (for org admins)
 */
export function useDepartmentSwitcher() {
  const { organization, department, switchDepartment } = useOrganization();
  const [switching, setSwitching] = useState(false);

  const departments = organization?.departments || [];
  const currentDepartment = department;

  const handleSwitch = useCallback(async (departmentId: string) => {
    if (!departmentId || departmentId === currentDepartment?.id) return;
    
    try {
      setSwitching(true);
      await switchDepartment(departmentId);
    } finally {
      setSwitching(false);
    }
  }, [currentDepartment?.id, switchDepartment]);

  return {
    departments,
    currentDepartment,
    switchDepartment: handleSwitch,
    switching,
    canSwitch: departments.length > 1,
  };
}

// ============================================================
// Export
// ============================================================

export default {
  useTenantContext,
  useTenantQuery,
  useStudents,
  useStudentSearch,
  usePaymentTypes,
  usePendingPayments,
  useStudentPayments,
  usePaymentStats,
  useExpenseCategories,
  useExpenses,
  useExpenseTotals,
  useUnreadNotifications,
  useDepartmentSwitcher,
};
