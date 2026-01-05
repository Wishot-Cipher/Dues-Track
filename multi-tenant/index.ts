/**
 * Multi-Tenant Module
 * 
 * This module provides all the infrastructure needed for multi-tenancy.
 * Import from this file to get access to contexts, hooks, services, and types.
 * 
 * Usage:
 * ```tsx
 * import { 
 *   OrganizationProvider, 
 *   useOrganization, 
 *   useCurrency,
 *   organizationService,
 *   departmentService,
 * } from '@/multi-tenant';
 * ```
 */

// ============================================================
// Contexts
// ============================================================

export { OrganizationProvider } from './contexts/OrganizationContext';
export { 
  useOrganization, 
  useCurrency, 
  useAcademicConfig 
} from './contexts/useOrganization';

// ============================================================
// Hooks
// ============================================================

export {
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
} from './hooks/useTenantData';

// ============================================================
// Services
// ============================================================

export { 
  organizationService,
  departmentService,
  auditService,
} from './services';

export {
  tenantQueries,
  tenantStudentQueries,
  tenantPaymentQueries,
  tenantExpenseQueries,
  tenantNotificationQueries,
} from './services/tenantQueries';

// ============================================================
// Types
// ============================================================

export type {
  Organization,
  Department,
  OrganizationSettings,
  OrganizationContextType,
  MultiTenantStudent,
  MultiTenantAdmin,
  MultiTenantPaymentType,
  MultiTenantPayment,
  MultiTenantExpense,
  MultiTenantExpenseCategory,
  MultiTenantNotification,
  MultiTenantAuthContextType,
  AdminRole,
  PaymentCategory,
  PaymentMethod,
  PaymentStatus,
  ExpenseStatus,
  NotificationType,
  AuditLogEntry,
  AuditAction,
  SubscriptionPlan,
} from './types';

export { SUBSCRIPTION_PLANS } from './types';

export type { TenantContext } from './services/tenantQueries';
export type { 
  CreateOrganizationInput, 
  UpdateOrganizationInput,
  OrganizationWithDetails,
} from './services/organizationService';
export type {
  CreateDepartmentInput,
  UpdateDepartmentInput,
  DepartmentWithStats,
} from './services/departmentService';
export type {
  CreateAuditLogInput,
  AuditLogFilter,
} from './services/auditService';
