/**
 * Multi-Tenant TypeScript Types
 * 
 * These types extend the existing types with multi-tenancy support.
 * The `organization_id` and `department_id` fields are added to scoped entities.
 */

// ============================================================
// ORGANIZATION TYPES
// ============================================================

/**
 * Organization (University/Institution)
 * Top-level entity in the multi-tenant hierarchy
 */
export interface Organization {
  id: string;
  
  // Basic Info
  name: string;                    // "Federal University of Technology, Owerri"
  short_name: string;              // "FUTO"
  slug: string;                    // "futo" (URL-friendly)
  
  // Branding
  logo_url?: string;
  primary_color: string;           // "#FF6B35"
  secondary_color: string;         // "#1A0E09"
  
  // Contact
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  country: string;                 // "Nigeria"
  
  // Configuration
  currency_code: string;           // "NGN"
  currency_symbol: string;         // "₦"
  timezone: string;                // "Africa/Lagos"
  
  // Subscription
  subscription_plan: 'free' | 'starter' | 'pro' | 'enterprise';
  max_departments: number;
  max_students: number;
  max_admins: number;
  subscription_expires_at?: string;
  
  // Status
  is_active: boolean;
  is_verified: boolean;
  
  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
  
  // Relations (when joined)
  departments?: Department[];
  settings?: OrganizationSettings;
}

/**
 * Department within an Organization
 */
export interface Department {
  id: string;
  organization_id: string;
  
  // Basic Info
  name: string;                    // "Electrical & Computer Engineering"
  short_name: string;              // "ECE"
  code?: string;                   // "ENG/ECE"
  
  // Configuration
  levels: string[];                // ["100L", "200L", "300L", "400L", "500L"]
  sections?: string[];             // ["A", "B", "C"]
  
  // Contact
  head_of_department?: string;
  email?: string;
  
  // Status
  is_active: boolean;
  
  // Audit
  created_at: string;
  updated_at: string;
  
  // Relations (when joined)
  organization?: Organization;
}

/**
 * Organization Settings (configurable per org)
 */
export interface OrganizationSettings {
  id: string;
  organization_id: string;
  
  // Feature Flags
  allow_partial_payments: boolean;
  allow_pay_for_others: boolean;
  require_receipt_upload: boolean;
  allow_student_expense_view: boolean;
  
  // Notification Settings
  email_notifications: boolean;
  sms_notifications: boolean;
  
  // Display Settings
  show_payment_deadline_warnings: boolean;
  deadline_warning_days: number;
  
  // Academic Settings
  current_session?: string;        // "2025/2026"
  current_semester?: string;       // "First Semester"
  
  // Custom Settings (JSON)
  custom_settings: Record<string, unknown>;
  
  // Audit
  created_at: string;
  updated_at: string;
}

// ============================================================
// MULTI-TENANT ENTITY TYPES
// ============================================================

/**
 * Multi-tenant Student
 * Extended with organization_id and department_id
 */
export interface MultiTenantStudent {
  id: string;
  
  // Multi-tenant keys
  organization_id: string;
  department_id: string;
  
  // Identity
  full_name: string;
  reg_number: string;              // Unique within organization
  email?: string;
  phone?: string;
  
  // Academic Info
  level: string;                   // "200L"
  section?: string;                // "A"
  admission_year?: number;
  
  // Authentication
  password_hash?: string;          // Never exposed to frontend
  force_password_change: boolean;
  last_login_at?: string;
  
  // Profile
  avatar_url?: string;
  date_of_birth?: string;
  gender?: string;
  
  // Status
  is_active: boolean;
  is_suspended: boolean;
  suspension_reason?: string;
  
  // Audit
  created_at: string;
  updated_at: string;
  
  // Relations (when joined)
  organization?: Organization;
  department?: Department;
  admins?: MultiTenantAdmin[];
}

/**
 * Multi-tenant Admin
 * Hierarchical roles with scoped permissions
 */
export interface MultiTenantAdmin {
  id: string;
  student_id: string;
  
  // Scope
  organization_id: string;
  department_id?: string;          // NULL = org-level admin
  
  // Role
  role: AdminRole;
  
  // Granular Permissions
  can_create_payments: boolean;
  can_approve_payments: boolean;
  can_manage_students: boolean;
  can_manage_admins: boolean;
  can_manage_expenses: boolean;
  can_view_analytics: boolean;
  can_export_data: boolean;
  can_manage_settings: boolean;
  
  // Status
  is_active: boolean;
  
  // Audit
  created_at: string;
  updated_at: string;
  appointed_by?: string;
  
  // Relations (when joined)
  student?: MultiTenantStudent;
}

export type AdminRole = 
  | 'super_admin'     // Platform owner
  | 'org_admin'       // University admin
  | 'dept_admin'      // Department admin
  | 'class_rep'       // Class representative
  | 'finsec'          // Financial secretary
  | 'auditor';        // Read-only financial

/**
 * Multi-tenant Payment Type (Dues)
 */
export interface MultiTenantPaymentType {
  id: string;
  
  // Multi-tenant keys
  organization_id: string;
  department_id: string;
  
  // Basic Info
  title: string;
  description?: string;
  category: PaymentCategory;
  
  // Amount
  amount: number;
  allow_partial: boolean;
  minimum_partial_amount?: number;
  
  // Targeting
  target_levels?: string[];
  target_sections?: string[];
  is_mandatory: boolean;
  
  // Timeline
  deadline?: string;
  start_date?: string;
  
  // Payment Details
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  
  // Display
  icon: string;
  color: string;
  display_order: number;
  
  // Visibility
  is_active: boolean;
  is_public: boolean;
  
  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;
}

export type PaymentCategory = 
  | 'semester_dues'
  | 'books'
  | 'events'
  | 'projects'
  | 'welfare'
  | 'donations'
  | 'custom';

/**
 * Multi-tenant Payment
 */
export interface MultiTenantPayment {
  id: string;
  
  // Multi-tenant keys
  organization_id: string;
  department_id: string;
  
  // Payment Info
  student_id: string;
  payment_type_id: string;
  amount: number;
  
  // Payment Method
  payment_method: PaymentMethod;
  transaction_ref?: string;
  
  // Evidence
  receipt_url?: string;
  notes?: string;
  
  // Status
  status: PaymentStatus;
  rejection_reason?: string;
  
  // Pay for Others
  paid_by?: string;
  paid_for_note?: string;
  
  // Approval
  approved_by?: string;
  approved_at?: string;
  
  // Audit
  created_at: string;
  updated_at: string;
  
  // Relations (when joined)
  student?: MultiTenantStudent;
  payment_type?: MultiTenantPaymentType;
}

export type PaymentMethod = 'bank_transfer' | 'cash' | 'pos' | 'online';
export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'partial' | 'waived';

/**
 * Multi-tenant Expense Category
 */
export interface MultiTenantExpenseCategory {
  id: string;
  
  // Multi-tenant keys
  organization_id: string;
  department_id?: string;          // NULL = org-wide category
  
  // Info
  name: string;
  icon: string;
  color: string;
  
  // Status
  is_active: boolean;
  
  // Audit
  created_at: string;
}

/**
 * Multi-tenant Expense
 */
export interface MultiTenantExpense {
  id: string;
  
  // Multi-tenant keys
  organization_id: string;
  department_id: string;
  
  // Basic Info
  title: string;
  description?: string;
  amount: number;
  expense_date: string;
  
  // Categorization
  category_id?: string;
  funded_by?: string;              // Which payment type funds this
  
  // Evidence
  receipt_url?: string;
  
  // Status
  status: ExpenseStatus;
  rejection_reason?: string;
  
  // Approval
  created_by: string;
  approved_by?: string;
  approved_at?: string;
  
  // Audit
  created_at: string;
  updated_at: string;
  
  // Relations (when joined)
  category?: MultiTenantExpenseCategory;
}

export type ExpenseStatus = 'pending' | 'approved' | 'rejected';

/**
 * Multi-tenant Notification
 */
export interface MultiTenantNotification {
  id: string;
  
  // Multi-tenant
  organization_id: string;
  
  // Target
  student_id: string;
  
  // Content
  type: NotificationType;
  title: string;
  message: string;
  link?: string;
  
  // Status
  is_read: boolean;
  read_at?: string;
  
  // Related Entity
  related_type?: 'payment' | 'expense' | 'announcement';
  related_id?: string;
  
  // Audit
  created_at: string;
}

export type NotificationType = 
  | 'payment_approved'
  | 'payment_rejected'
  | 'expense_approved'
  | 'expense_rejected'
  | 'dues_created'
  | 'deadline_reminder'
  | 'announcement'
  | 'system';

// ============================================================
// CONTEXT TYPES
// ============================================================

/**
 * Organization Context
 * Available throughout the app via React Context
 */
export interface OrganizationContextType {
  // Current organization
  organization: Organization | null;
  department: Department | null;
  settings: OrganizationSettings | null;
  
  // Loading state
  loading: boolean;
  error: string | null;
  
  // Actions
  switchDepartment: (departmentId: string) => Promise<void>;
  refreshOrganization: () => Promise<void>;
  
  // Helpers
  formatCurrency: (amount: number) => string;
  getLevels: () => string[];
  getSections: () => string[];
}

/**
 * Multi-tenant Auth Context
 * Extended with organization awareness
 */
export interface MultiTenantAuthContextType {
  // User info
  user: MultiTenantStudent | null;
  adminRecord: MultiTenantAdmin | null;
  
  // Organization context
  organization: Organization | null;
  department: Department | null;
  
  // Loading state
  loading: boolean;
  
  // Auth actions
  login: (regNumber: string, password: string, orgSlug?: string) => Promise<{
    student: MultiTenantStudent;
    mustChangePassword: boolean;
  }>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  
  // Status checks
  isAuthenticated: boolean;
  needsPasswordChange: boolean;
  
  // Permission checks (scoped to current org/dept)
  hasPermission: (permission: keyof MultiTenantAdmin) => boolean;
  hasRole: (role: AdminRole) => boolean;
  isOrgAdmin: () => boolean;
  isDeptAdmin: () => boolean;
}

// ============================================================
// SUBSCRIPTION TYPES
// ============================================================

export interface SubscriptionPlan {
  id: 'free' | 'starter' | 'pro' | 'enterprise';
  name: string;
  price_monthly: number;
  price_yearly: number;
  
  // Limits
  max_departments: number;
  max_students: number;
  max_admins: number;
  max_storage_gb: number;
  
  // Features
  features: {
    custom_branding: boolean;
    email_notifications: boolean;
    sms_notifications: boolean;
    api_access: boolean;
    data_export: boolean;
    analytics: boolean;
    audit_logs: boolean;
    priority_support: boolean;
  };
}

export const SUBSCRIPTION_PLANS: Record<string, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    price_monthly: 0,
    price_yearly: 0,
    max_departments: 1,
    max_students: 100,
    max_admins: 3,
    max_storage_gb: 1,
    features: {
      custom_branding: false,
      email_notifications: false,
      sms_notifications: false,
      api_access: false,
      data_export: false,
      analytics: false,
      audit_logs: false,
      priority_support: false,
    },
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    price_monthly: 5000,    // NGN
    price_yearly: 50000,
    max_departments: 3,
    max_students: 500,
    max_admins: 10,
    max_storage_gb: 5,
    features: {
      custom_branding: true,
      email_notifications: true,
      sms_notifications: false,
      api_access: false,
      data_export: true,
      analytics: true,
      audit_logs: false,
      priority_support: false,
    },
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    price_monthly: 15000,
    price_yearly: 150000,
    max_departments: 10,
    max_students: 5000,
    max_admins: 50,
    max_storage_gb: 25,
    features: {
      custom_branding: true,
      email_notifications: true,
      sms_notifications: true,
      api_access: true,
      data_export: true,
      analytics: true,
      audit_logs: true,
      priority_support: false,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    price_monthly: 0,       // Custom pricing
    price_yearly: 0,
    max_departments: -1,    // Unlimited
    max_students: -1,
    max_admins: -1,
    max_storage_gb: -1,
    features: {
      custom_branding: true,
      email_notifications: true,
      sms_notifications: true,
      api_access: true,
      data_export: true,
      analytics: true,
      audit_logs: true,
      priority_support: true,
    },
  },
};

// ============================================================
// AUDIT TYPES
// ============================================================

/**
 * Audit Log Entry
 */
export interface AuditLogEntry {
  id: string;
  organization_id?: string;
  user_id?: string;
  
  // Action
  action: AuditAction;
  entity_type: string;
  entity_id?: string;
  
  // Details
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
  
  // Timestamp
  created_at: string;
}

export type AuditAction =
  | 'login'
  | 'logout'
  | 'login_failed'
  | 'password_changed'
  | 'student_created'
  | 'student_updated'
  | 'student_deleted'
  | 'payment_submitted'
  | 'payment_approved'
  | 'payment_rejected'
  | 'expense_created'
  | 'expense_approved'
  | 'expense_rejected'
  | 'admin_assigned'
  | 'admin_revoked'
  | 'settings_updated';
