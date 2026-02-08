/**
 * Multi-Tenant TypeScript Types
 * 
 * Core types for multi-tenant support including organizations,
 * departments, and extended entity types.
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
// ADMIN ROLE TYPES
// ============================================================

export type AdminRole =
    | 'super_admin'     // Platform owner
    | 'org_admin'       // University admin
    | 'dept_admin'      // Department admin
    | 'class_rep'       // Class representative
    | 'finsec'          // Financial secretary
    | 'auditor';        // Read-only financial

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
