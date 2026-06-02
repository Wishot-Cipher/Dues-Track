/**
 * Payvexo Multi-Tenant TypeScript Types
 * 
 * Universal type system supporting:
 * - Universities & Schools (departments, levels, semesters)
 * - Churches (ministries, groups, tithes/offerings)
 * - Clubs & Associations (chapters, memberships)  
 * - Cooperatives (savings groups, contributions)
 * - NGOs & General Organizations
 */

import type { OrganizationType } from '@/config/constants';

// ============================================================
// ORGANIZATION TYPES
// ============================================================

/**
 * Organization - Top-level tenant entity
 * Supports universities, churches, clubs, associations, cooperatives, NGOs
 */
export interface Organization {
  id: string;

  // Basic Info
  name: string;                              // "University of Lagos" | "Living Faith Church" | "Tech Hub NG"
  short_name: string;                        // "UNILAG" | "LFC" | "THN"
  slug: string;                              // "unilag" | "living-faith" | "tech-hub-ng"
  organization_type: OrganizationType;       // "university" | "church" | "club" | etc.

  // Branding
  logo_url?: string;
  cover_image_url?: string;
  primary_color: string;                     // "#FF6803" (Payvexo brand orange default)
  secondary_color: string;                   // "#1A0E09" (Payvexo brand dark)
  accent_color?: string;                     // Optional tertiary color

  // Contact
  email?: string;
  phone?: string;
  website?: string;
  address?: string;
  city?: string;
  state?: string;
  country: string;                           // "Nigeria"
  postal_code?: string;

  // Configuration
  currency_code: string;                     // ISO 4217: "NGN", "USD", "GBP", "KES"
  currency_symbol: string;                   // "₦", "$", "£", "KSh"
  timezone: string;                          // "Africa/Lagos"
  locale: string;                            // "en-NG"

  // Terminology (customizable labels per org type)
  member_label: string;                      // "Student" | "Member" | "Parishioner"
  member_label_plural: string;               // "Students" | "Members" | "Parishioners"
  group_label: string;                       // "Department" | "Ministry" | "Chapter"
  group_label_plural: string;                // "Departments" | "Ministries" | "Chapters"
  payment_label: string;                     // "Dues" | "Tithes" | "Contributions"
  admin_label: string;                       // "Admin" | "Pastor" | "Coordinator"

  // Subscription & Limits
  subscription_plan: SubscriptionTier;
  max_groups: number;                        // max departments/ministries/chapters
  max_members: number;                       // max students/members
  max_admins: number;
  subscription_expires_at?: string;
  trial_ends_at?: string;
  is_on_trial: boolean;

  // Status
  is_active: boolean;
  is_verified: boolean;                      // Platform admin verified
  verified_at?: string;
  deactivated_reason?: string;

  // Trust & claim system (mig 012)
  trust_level?: TrustLevel;                  // seed | community | recognized | verified | official
  claim_status?: ClaimStatus;                // unclaimed | pending | claimed | disputed | frozen
  verification_score?: number;
  email_domain?: string | null;
  type?: string;                             // new explicit type column ("university" | "church" | ...)
  description?: string | null;
  unit_label?: string;
  unit_label_plural?: string;
  founded_by_user_id?: string | null;
  seed_institution_id?: string | null;
  last_activity_at?: string | null;

  // Onboarding
  onboarding_completed: boolean;
  onboarding_step?: number;

  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;

  // Relations (when joined)
  groups?: OrganizationGroup[];
  settings?: OrganizationSettings;
  member_count?: number;
}

// ============================================================
// DISCOVERY LAYER (mig 011 + 012)
// ============================================================

/** Trust levels — gates feature access; see Section 7 of the blueprint. */
export type TrustLevel = 'seed' | 'community' | 'recognized' | 'verified' | 'official';

/** Claim status of an organization. */
export type ClaimStatus = 'unclaimed' | 'pending' | 'claimed' | 'disputed' | 'frozen';

/** A pre-loaded institution from NUC/NBTE/NCCE/Wikidata. Not yet a live org. */
export interface SeedInstitution {
  id: string;
  name: string;
  short_name?: string | null;
  aliases: string[];
  country_code: string;                      // ISO 3166-1 alpha-2 — "NG"
  state?: string | null;
  city?: string | null;
  type: 'university' | 'polytechnic' | 'college_of_education' | 'monotechnic' | 'seminary' | 'other';
  ownership?: 'federal' | 'state' | 'private' | null;
  website?: string | null;
  email_domain?: string | null;
  jamb_code?: string | null;
  wikidata_id?: string | null;
  logo_url?: string | null;
  is_active: boolean;
  linked_org_id?: string | null;
  source: 'nuc' | 'nbte' | 'ncce' | 'jamb' | 'wikidata' | 'manual';
  created_at: string;
  updated_at: string;
}

/** Unified result returned by the two-layer landing-page search. */
export type SearchResultKind = 'organization' | 'seed';

export interface SearchResult {
  kind: SearchResultKind;
  id: string;
  name: string;
  short_name: string | null;
  type: string;                              // "university" | "polytechnic" | "church" | ...
  trust_level: TrustLevel;                   // seeds report 'seed'; orgs report their level

  // Organization-only
  slug?: string;
  logo_url?: string | null;
  member_count?: number;
  claim_status?: ClaimStatus;

  // Seed-only
  state?: string | null;
  city?: string | null;
  ownership?: 'federal' | 'state' | 'private' | null;
  country_code?: string;
}

export type SubscriptionTier = 'free' | 'starter' | 'professional' | 'enterprise';

/**
 * Organization Group (generic: Department, Ministry, Chapter, etc.)
 * Replaces the old "Department" concept with a universal group
 */
export interface OrganizationGroup {
  id: string;
  organization_id: string;

  // Hierarchy role inside an institution
  kind?: GroupKind;                         // "faculty" | "class" | "general"

  // Basic Info
  name: string;                              // "Computer Science" | "Youth Ministry" | "Lagos Chapter"
  short_name: string;                        // "CS" | "YM" | "LG"
  code?: string;                             // "SCI/CS" | "MIN/YOUTH"
  description?: string;

  // Configuration (varies by org type)
  levels?: string[];                         // University: ["100L","200L",...] | Church: ["New Convert","Member","Worker"]
  sections?: string[];                       // ["A","B","C"] | ["Male","Female","Mixed"]
  
  // Contact
  leader_name?: string;                      // HOD | Pastor | Chapter Lead
  leader_title?: string;                     // "Head of Department" | "Pastor" | "Chapter President"
  email?: string;
  phone?: string;

  // Hierarchy (nested groups)
  parent_group_id?: string;                  // Class group can point to a faculty group

  // Display
  icon?: string;
  color?: string;
  display_order: number;

  // Status
  is_active: boolean;
  member_count?: number;

  // Audit
  created_at: string;
  updated_at: string;

  // Relations (when joined)
  organization?: Organization;
  parent_group?: OrganizationGroup;
  sub_groups?: OrganizationGroup[];
}

// Matches the CHECK constraint on organization_groups.kind (mig 005 + 034).
// Adding a kind here? Update the DB constraint too.
export type GroupKind =
  | 'faculty'           // top-level academic unit
  | 'college'           // optional tier above faculty (e.g. College of Engineering)
  | 'department'        // discipline within a faculty
  | 'association'       // student professional body inside a department (NIESS, NICE)
  | 'class'             // a single level inside a department (300L)
  | 'level'             // alias used in some seed data
  | 'sug'               // student union governance (no dues)
  | 'university_unit'   // GSP, ICT centre, SIWES — direct under university
  | 'fellowship'        // religious / interest group
  | 'chapter'           // alumni or branch chapter
  | 'year_group'        // cohort across departments
  | 'general';          // catch-all

/**
 * Organization Settings (configurable per org)
 */
export interface OrganizationSettings {
  id: string;
  organization_id: string;

  // Payment Features
  allow_partial_payments: boolean;
  allow_pay_for_others: boolean;
  require_receipt_upload: boolean;
  allow_online_payments: boolean;            // Paystack/Flutterwave integration
  auto_approve_online_payments: boolean;     // Auto-approve verified online payments
  
  // Expense Features
  allow_member_expense_view: boolean;
  require_expense_approval: boolean;
  max_expense_amount_without_approval?: number;

  // Notification Settings
  email_notifications: boolean;
  sms_notifications: boolean;
  push_notifications: boolean;
  whatsapp_notifications: boolean;

  // Display Settings
  show_payment_deadline_warnings: boolean;
  deadline_warning_days: number;
  show_member_balance: boolean;
  show_leaderboard: boolean;                 // Top payers (opt-in)
  
  // Privacy Settings
  hide_member_contact_info: boolean;
  allow_public_donation_page: boolean;
  show_org_in_directory: boolean;            // Show in Payvexo public directory

  // Session/Period Settings (flexible for all org types)
  current_period_label: string;              // "2025/2026 Session" | "2025 Fiscal Year" | "Q1 2026"
  current_sub_period_label?: string;         // "First Semester" | "January" | "Week 1"
  period_type: PeriodType;

  // Academic progression controls (mainly for universities)
  auto_promotion_enabled?: boolean;          // false by default for safety
  promotion_requires_approval?: boolean;     // recommended true
  promotion_grace_days?: number;             // e.g. 14 days after term end

  // Registration Settings
  allow_self_registration: boolean;          // Members can sign up themselves
  require_admin_approval: boolean;           // Admin must approve new members
  registration_fields: RegistrationField[];  // What fields to show on sign-up
  
  // Payment Gateway Settings
  payment_gateway?: PaymentGateway;
  gateway_public_key?: string;
  gateway_secret_key?: string;               // Encrypted, never exposed to frontend
  webhook_secret?: string;

  // Custom Settings (JSON for flexibility)
  custom_settings: Record<string, unknown>;

  // Audit
  created_at: string;
  updated_at: string;
}

export type PeriodType = 
  | 'academic_session'    // Universities: 2025/2026
  | 'fiscal_year'         // Most organizations
  | 'calendar_year'       // Simple yearly
  | 'quarterly'           // Q1, Q2, Q3, Q4
  | 'monthly'             // Month-by-month
  | 'custom';             // Custom periods

export type PaymentGateway = 'paystack' | 'flutterwave' | 'stripe' | 'manual_only';

export interface RegistrationField {
  key: string;                               // "reg_number", "phone", "gender", etc.
  label: string;                             // "Registration Number"
  type: 'text' | 'email' | 'phone' | 'select' | 'date' | 'number';
  required: boolean;
  options?: string[];                        // For select fields
  placeholder?: string;
}

// ============================================================
// MEMBER TYPES (Universal - replaces "Student")
// ============================================================

/**
 * OrganizationMember - Universal member entity
 * Represents: Student, Church Member, Club Member, etc.
 */
export interface OrganizationMember {
  id: string;

  // Multi-tenant keys
  organization_id: string;
  group_id: string;                          // Primary group (department/ministry/chapter)

  // Identity
  full_name: string;
  member_id: string;                         // Reg number / Member ID / unique within org
  email?: string;
  phone?: string;

  // Classification (context-dependent on org type)
  level?: string;                            // "200L" | "Worker" | "Gold Member"
  current_level_order?: number;              // normalized numeric rank (optional)
  next_level?: string;                       // preview during promotion window
  section?: string;                          // "A" | "Male" | "Team Alpha"
  role_in_group?: string;                    // "Student" | "Choir Member" | "Treasurer"
  
  // Academic/Membership Info
  admission_year?: number;                   // Uni: admission year
  membership_date?: string;                  // Church/Club: when they joined
  membership_type?: string;                  // "Regular" | "Associate" | "Honorary"

  // Authentication
  password_hash?: string;                    // Never exposed to frontend
  force_password_change: boolean;
  last_login_at?: string;
  login_count: number;

  // Profile
  avatar_url?: string;
  date_of_birth?: string;
  gender?: string;
  address?: string;

  // Status
  is_active: boolean;
  is_suspended: boolean;
  suspension_reason?: string;
  suspended_at?: string;
  suspended_by?: string;

  // Custom Fields (org-specific data)
  custom_fields?: Record<string, unknown>;

  // Audit
  created_at: string;
  updated_at: string;

  // Relations (when joined)
  organization?: Organization;
  group?: OrganizationGroup;
  admin_records?: MemberAdmin[];
  admin_permissions?: AggregatedPermissions;
}

// ============================================================
// ACADEMIC CALENDAR & PROGRESSION
// ============================================================

/**
 * Institution-level academic session (e.g. 2024/2025)
 */
export interface AcademicSession {
  id: string;
  organization_id: string;
  label: string;                             // "2024/2025"
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_locked: boolean;                        // prevents edits after closing
  created_at: string;
  updated_at: string;
}

/**
 * Sub-period inside a session (semester/trimester/term)
 */
export interface AcademicTerm {
  id: string;
  organization_id: string;
  session_id: string;
  name: string;                              // "First Semester"
  sequence: number;                          // 1, 2, 3...
  start_date: string;
  end_date: string;
  promotion_window_starts_at?: string;
  promotion_window_ends_at?: string;
  status: AcademicTermStatus;
  created_at: string;
  updated_at: string;
}

export type AcademicTermStatus = 'upcoming' | 'active' | 'closing' | 'closed';

/**
 * Class-group promotion policy (how levels advance)
 */
export interface ClassProgressionPolicy {
  id: string;
  organization_id: string;
  group_id: string;                          // class group
  policy_name: string;
  level_sequence: string[];                  // ["100L", "200L", ...]
  terminal_level?: string;                   // e.g. "500L"
  allow_manual_override: boolean;
  created_at: string;
  updated_at: string;
}

/**
 * Immutable audit record for one promotion execution.
 */
export interface PromotionRun {
  id: string;
  organization_id: string;
  term_id: string;
  group_id?: string;                         // null when org-wide run
  triggered_by: string;                      // member/admin id
  status: PromotionRunStatus;
  total_members: number;
  promoted_members: number;
  skipped_members: number;
  dry_run: boolean;
  notes?: string;
  started_at: string;
  completed_at?: string;
}

export type PromotionRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/**
 * Per-member promotion decision inside a run.
 */
export interface PromotionDecision {
  id: string;
  promotion_run_id: string;
  member_id: string;
  from_level?: string;
  to_level?: string;
  action: PromotionAction;
  reason?: string;
  created_at: string;
}

export type PromotionAction = 'promote' | 'retain' | 'graduated' | 'manual_override';

/**
 * Aggregated admin permissions (derived from admin records)
 */
export interface AggregatedPermissions {
  can_create_payments: boolean;
  can_approve_payments: boolean;
  can_manage_members: boolean;
  can_manage_admins: boolean;
  can_manage_expenses: boolean;
  can_view_analytics: boolean;
  can_export_data: boolean;
  can_manage_settings: boolean;
}

// ============================================================
// ADMIN / ROLE TYPES
// ============================================================

/**
 * MemberAdmin - Admin record linking member to a role with permissions
 */
export interface MemberAdmin {
  id: string;
  member_id: string;                         // FK to organization_members

  // Scope
  organization_id: string;
  group_id?: string;                         // NULL = org-level admin
  scope_level?: 'org' | 'unit' | 'group';

  // Role
  role: AdminRole;
  custom_role_name?: string;                 // For custom roles: "Welfare Secretary"
  role_label?: string;                       // Friendly label set during verification

  // Granular Permissions
  can_create_payments: boolean;
  can_approve_payments: boolean;
  can_manage_members: boolean;               // Renamed from can_manage_students
  can_manage_admins: boolean;
  can_manage_expenses: boolean;
  can_view_analytics: boolean;
  can_export_data: boolean;
  can_manage_settings: boolean;

  // Status
  is_active: boolean;
  verification_status?: string;
  verification_method?: string;
  verification_layer?: number;
  verified_at?: string;

  // Session lifecycle (mig 091): unit-scope (dept/faculty) admins
  // are seated for an academic session. tenure_start is set on
  // bootstrap; tenure_expires_at + academic_session are stamped by
  // _stamp_unit_admin_session() on insert. archive_expired_unit_admins
  // sweeps expired rows back to layer 0 / session_ended each rollover.
  tenure_start?: string;
  tenure_expires_at?: string;
  academic_session?: string;

  // Audit
  created_at: string;
  updated_at: string;
  appointed_by?: string;

  // Relations (when joined)
  member?: OrganizationMember;
}

export type AdminRole =
  | 'super_admin'       // Platform owner (Payvexo team)
  | 'org_owner'         // Organization creator/owner
  | 'org_admin'         // Organization administrator
  | 'faculty_admin'     // Faculty-level management (university mode)
  | 'group_admin'       // Group/department/ministry admin
  | 'treasurer'         // Financial secretary / treasurer
  | 'secretary'         // Secretary / class rep
  | 'auditor'           // Read-only financial access
  | 'moderator'         // Content/member moderation
  | 'custom';           // Custom role with specific permissions

/**
 * Role templates for quick role assignment
 */
export const ROLE_TEMPLATES: Record<AdminRole, { label: string; description: string; permissions: AggregatedPermissions }> = {
  super_admin: {
    label: 'Super Admin',
    description: 'Full platform access (Payvexo team only)',
    permissions: { can_create_payments: true, can_approve_payments: true, can_manage_members: true, can_manage_admins: true, can_manage_expenses: true, can_view_analytics: true, can_export_data: true, can_manage_settings: true },
  },
  org_owner: {
    label: 'Organization Owner',
    description: 'Full access to this organization',
    permissions: { can_create_payments: true, can_approve_payments: true, can_manage_members: true, can_manage_admins: true, can_manage_expenses: true, can_view_analytics: true, can_export_data: true, can_manage_settings: true },
  },
  org_admin: {
    label: 'Organization Admin',
    description: 'Manages organization operations',
    permissions: { can_create_payments: true, can_approve_payments: true, can_manage_members: true, can_manage_admins: false, can_manage_expenses: true, can_view_analytics: true, can_export_data: true, can_manage_settings: false },
  },
  faculty_admin: {
    label: 'Faculty Admin',
    description: 'Manages faculty groups and class reps within a faculty',
    permissions: { can_create_payments: true, can_approve_payments: true, can_manage_members: true, can_manage_admins: false, can_manage_expenses: true, can_view_analytics: true, can_export_data: true, can_manage_settings: false },
  },
  group_admin: {
    label: 'Group Admin',
    description: 'Manages a specific group/department',
    permissions: { can_create_payments: true, can_approve_payments: true, can_manage_members: true, can_manage_admins: false, can_manage_expenses: true, can_view_analytics: true, can_export_data: false, can_manage_settings: false },
  },
  treasurer: {
    label: 'Treasurer',
    description: 'Manages finances and approves payments',
    permissions: { can_create_payments: true, can_approve_payments: true, can_manage_members: false, can_manage_admins: false, can_manage_expenses: true, can_view_analytics: true, can_export_data: true, can_manage_settings: false },
  },
  secretary: {
    label: 'Secretary',
    description: 'Manages members and creates payment requests',
    permissions: { can_create_payments: true, can_approve_payments: false, can_manage_members: true, can_manage_admins: false, can_manage_expenses: false, can_view_analytics: true, can_export_data: false, can_manage_settings: false },
  },
  auditor: {
    label: 'Auditor',
    description: 'Read-only access to all financial data',
    permissions: { can_create_payments: false, can_approve_payments: false, can_manage_members: false, can_manage_admins: false, can_manage_expenses: false, can_view_analytics: true, can_export_data: true, can_manage_settings: false },
  },
  moderator: {
    label: 'Moderator',
    description: 'Manages members and content',
    permissions: { can_create_payments: false, can_approve_payments: false, can_manage_members: true, can_manage_admins: false, can_manage_expenses: false, can_view_analytics: false, can_export_data: false, can_manage_settings: false },
  },
  custom: {
    label: 'Custom Role',
    description: 'Custom permissions',
    permissions: { can_create_payments: false, can_approve_payments: false, can_manage_members: false, can_manage_admins: false, can_manage_expenses: false, can_view_analytics: false, can_export_data: false, can_manage_settings: false },
  },
};

// ============================================================
// PAYMENT TYPES
// ============================================================

/**
 * PaymentType - Dues/fees/contributions definition
 */
export interface PaymentType {
  id: string;

  // Multi-tenant keys
  organization_id: string;
  group_id: string;

  // Basic Info
  title: string;
  description?: string;
  category: PaymentCategory;

  // Amount
  amount: number;
  allow_partial: boolean;
  minimum_partial_amount?: number;

  // Targeting
  target_levels?: string[];                  // Which levels/tiers this applies to
  target_sections?: string[];
  is_mandatory: boolean;

  // Timeline
  deadline?: string;
  start_date?: string;
  late_fee_per_day?: number;

  // Payment Collection Details
  bank_name?: string;
  account_name?: string;
  account_number?: string;
  payment_instructions?: string;             // Custom instructions

  // Online Payment
  enable_online_payment: boolean;
  online_payment_fee_percent?: number;       // Who pays gateway fees

  // Display
  icon: string;
  color: string;
  display_order: number;

  // Visibility
  is_active: boolean;
  is_public: boolean;                        // Public donation page
  is_recurring: boolean;                     // Recurring payment (monthly tithes, etc.)
  recurrence_interval?: RecurrenceInterval;

  // Audit
  created_at: string;
  updated_at: string;
  created_by?: string;

  // Relations
  approver_id?: string;
}

export type PaymentCategory =
  | 'dues'             // General dues
  | 'fees'             // Fees (registration, exam, etc.)  
  | 'tithe'            // Church tithes
  | 'offering'         // Church offerings
  | 'donation'         // Open donations
  | 'contribution'     // Group contributions
  | 'levy'             // Special levies
  | 'subscription'     // Membership subscription
  | 'savings'          // Cooperative savings
  | 'welfare'          // Welfare fund
  | 'project'          // Project funding
  | 'event'            // Event tickets/fees
  | 'custom';          // Custom category

export type RecurrenceInterval = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

/**
 * Payment - Individual payment record
 */
export interface Payment {
  id: string;

  // Multi-tenant keys
  organization_id: string;
  group_id: string;

  // Payment Info
  member_id: string;
  payment_type_id: string;
  amount: number;

  // Payment Method
  payment_method: PaymentMethod;
  transaction_ref?: string;
  gateway_ref?: string;                      // Reference from payment gateway

  // Evidence
  receipt_url?: string;
  notes?: string;

  // Status
  status: PaymentStatus;
  rejection_reason?: string;
  waiver_reason?: string;

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
  member?: OrganizationMember;
  payment_type?: PaymentType;
}

export type PaymentMethod = 'bank_transfer' | 'cash' | 'pos' | 'online' | 'mobile_money' | 'cheque';
export type PaymentStatus = 'pending' | 'approved' | 'rejected' | 'partial' | 'waived';

// ============================================================
// EXPENSE TYPES
// ============================================================

export interface ExpenseCategory {
  id: string;
  organization_id: string;
  group_id?: string;

  name: string;
  icon: string;
  color: string;
  is_active: boolean;

  created_at: string;
}

export interface Expense {
  id: string;
  
  organization_id: string;
  group_id: string;

  title: string;
  description?: string;
  amount: number;
  expense_date: string;

  category_id?: string;
  funded_by?: string;

  receipt_url?: string;

  status: 'pending' | 'approved' | 'rejected';
  rejection_reason?: string;

  created_by: string;
  approved_by?: string;
  approved_at?: string;

  created_at: string;
  updated_at: string;

  // Relations
  category?: ExpenseCategory;
}

// ============================================================
// NOTIFICATION TYPES
// ============================================================

export interface Notification {
  id: string;
  organization_id: string;
  member_id: string;

  type: NotificationType;
  title: string;
  message: string;
  link?: string;

  is_read: boolean;
  read_at?: string;

  related_type?: 'payment' | 'expense' | 'announcement' | 'member';
  related_id?: string;

  created_at: string;
}

export type NotificationType =
  | 'payment_approved'
  | 'payment_rejected'
  | 'payment_reminder'
  | 'expense_approved'
  | 'expense_rejected'
  | 'dues_created'
  | 'deadline_reminder'
  | 'announcement'
  | 'welcome'
  | 'role_assigned'
  | 'role_revoked'
  | 'system';

// ============================================================
// INVITATION & ONBOARDING
// ============================================================

/**
 * Organization invite - for inviting members or admins
 */
export interface OrganizationInvite {
  id: string;
  organization_id: string;
  group_id?: string;

  // Invite details
  invite_code: string;                       // Unique invite code
  invite_type: 'member' | 'admin' | 'bulk';
  email?: string;                            // If specific invite
  role?: AdminRole;                          // If admin invite

  // Limits
  max_uses: number;
  times_used: number;
  expires_at?: string;

  // Status
  is_active: boolean;

  // Audit
  created_at: string;
  created_by: string;
}

// ============================================================
// AUTH CONTEXT TYPES
// ============================================================

/**
 * Multi-tenant Auth Context
 */
export interface MultiTenantAuthContextType {
  // User info
  user: OrganizationMember | null;
  adminRecord: MemberAdmin | null;

  // Organization context
  organization: Organization | null;
  group: OrganizationGroup | null;

  // Loading state
  loading: boolean;

  // Auth actions
  login: (memberId: string, password: string, orgSlug?: string, groupId?: string) => Promise<{
    member: OrganizationMember;
    mustChangePassword: boolean;
  }>;
  logout: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  updateProfile: (profileData: Partial<OrganizationMember>) => Promise<OrganizationMember>;

  // Status checks
  isAuthenticated: boolean;
  isProfileComplete: boolean;
  needsPasswordChange: boolean;

  // Permission checks (scoped to current org/group)
  hasPermission: (permission: keyof AggregatedPermissions) => boolean;
  hasRole: (role: AdminRole) => boolean;
  isOrgOwner: () => boolean;
  isOrgAdmin: () => boolean;
  isGroupAdmin: () => boolean;
  isAnyAdmin: () => boolean;

  // Session
  refreshSession: () => Promise<void>;
}

/**
 * Organization Context Type
 */
export interface OrganizationContextType {
  // Current state
  organization: Organization | null;
  group: OrganizationGroup | null;
  settings: OrganizationSettings | null;

  // Available groups
  groups: OrganizationGroup[];

  // Loading state
  loading: boolean;
  error: string | null;

  // Actions
  setOrganization: (org: Organization | null) => void;
  setGroup: (group: OrganizationGroup | null) => void;
  switchGroup: (groupId: string) => Promise<void>;
  fetchOrganizationBySlug: (slug: string) => Promise<Organization | null>;
  refreshOrganization: () => Promise<void>;
  clearOrganization: () => void;

  // Helpers
  formatCurrency: (amount: number) => string;
  getLevels: () => string[];
  getSections: () => string[];
  getMemberLabel: (plural?: boolean) => string;
  getGroupLabel: (plural?: boolean) => string;
  getPaymentLabel: () => string;

  // Multi-tenant detection
  isMultiTenant: boolean;
}

// ============================================================
// SUBSCRIPTION & BILLING
// ============================================================

export interface SubscriptionPlan {
  id: SubscriptionTier;
  name: string;
  tagline: string;
  price_monthly_ngn: number;
  price_yearly_ngn: number;
  price_monthly_usd: number;
  price_yearly_usd: number;

  // Limits
  max_groups: number;                        // -1 = unlimited
  max_members: number;
  max_admins: number;
  max_storage_gb: number;

  // Features
  features: SubscriptionFeatures;

  // Display
  is_popular: boolean;
  badge?: string;                            // "Most Popular", "Best Value"
}

export interface SubscriptionFeatures {
  custom_branding: boolean;
  email_notifications: boolean;
  sms_notifications: boolean;
  whatsapp_notifications: boolean;
  online_payments: boolean;
  api_access: boolean;
  data_export: boolean;
  advanced_analytics: boolean;
  audit_logs: boolean;
  priority_support: boolean;
  custom_domain: boolean;
  white_label: boolean;
  multi_currency: boolean;
  recurring_payments: boolean;
  bulk_import: boolean;
  public_donation_page: boolean;
}

export const SUBSCRIPTION_PLANS: Record<SubscriptionTier, SubscriptionPlan> = {
  free: {
    id: 'free',
    name: 'Free',
    tagline: 'Get started for free',
    price_monthly_ngn: 0,
    price_yearly_ngn: 0,
    price_monthly_usd: 0,
    price_yearly_usd: 0,
    max_groups: 1,
    max_members: 50,
    max_admins: 3,
    max_storage_gb: 0.5,
    is_popular: false,
    features: {
      custom_branding: false,
      email_notifications: false,
      sms_notifications: false,
      whatsapp_notifications: false,
      online_payments: false,
      api_access: false,
      data_export: false,
      advanced_analytics: false,
      audit_logs: false,
      priority_support: false,
      custom_domain: false,
      white_label: false,
      multi_currency: false,
      recurring_payments: false,
      bulk_import: false,
      public_donation_page: false,
    },
  },
  starter: {
    id: 'starter',
    name: 'Starter',
    tagline: 'For small groups & fellowships',
    price_monthly_ngn: 5000,
    price_yearly_ngn: 48000,
    price_monthly_usd: 5,
    price_yearly_usd: 48,
    max_groups: 3,
    max_members: 300,
    max_admins: 10,
    max_storage_gb: 5,
    is_popular: false,
    features: {
      custom_branding: true,
      email_notifications: true,
      sms_notifications: false,
      whatsapp_notifications: false,
      online_payments: false,
      api_access: false,
      data_export: true,
      advanced_analytics: false,
      audit_logs: false,
      priority_support: false,
      custom_domain: false,
      white_label: false,
      multi_currency: false,
      recurring_payments: true,
      bulk_import: true,
      public_donation_page: true,
    },
  },
  professional: {
    id: 'professional',
    name: 'Professional',
    tagline: 'For growing organizations',
    price_monthly_ngn: 15000,
    price_yearly_ngn: 144000,
    price_monthly_usd: 15,
    price_yearly_usd: 144,
    max_groups: 20,
    max_members: 5000,
    max_admins: 50,
    max_storage_gb: 50,
    is_popular: true,
    badge: 'Most Popular',
    features: {
      custom_branding: true,
      email_notifications: true,
      sms_notifications: true,
      whatsapp_notifications: true,
      online_payments: true,
      api_access: true,
      data_export: true,
      advanced_analytics: true,
      audit_logs: true,
      priority_support: false,
      custom_domain: false,
      white_label: false,
      multi_currency: true,
      recurring_payments: true,
      bulk_import: true,
      public_donation_page: true,
    },
  },
  enterprise: {
    id: 'enterprise',
    name: 'Enterprise',
    tagline: 'For large institutions',
    price_monthly_ngn: 0,           // Custom pricing
    price_yearly_ngn: 0,
    price_monthly_usd: 0,
    price_yearly_usd: 0,
    max_groups: -1,                 // Unlimited
    max_members: -1,
    max_admins: -1,
    max_storage_gb: -1,
    is_popular: false,
    badge: 'Custom',
    features: {
      custom_branding: true,
      email_notifications: true,
      sms_notifications: true,
      whatsapp_notifications: true,
      online_payments: true,
      api_access: true,
      data_export: true,
      advanced_analytics: true,
      audit_logs: true,
      priority_support: true,
      custom_domain: true,
      white_label: true,
      multi_currency: true,
      recurring_payments: true,
      bulk_import: true,
      public_donation_page: true,
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
  | 'member_created'
  | 'member_updated'
  | 'member_deleted'
  | 'member_suspended'
  | 'member_reactivated'
  | 'payment_submitted'
  | 'payment_approved'
  | 'payment_rejected'
  | 'payment_waived'
  | 'expense_created'
  | 'expense_approved'
  | 'expense_rejected'
  | 'admin_assigned'
  | 'admin_revoked'
  | 'settings_updated'
  | 'org_created'
  | 'org_updated'
  | 'group_created'
  | 'group_updated'
  | 'invite_created'
  | 'invite_used'
  | 'subscription_changed'
  | 'data_exported';

export interface AuditLogEntry {
  id: string;
  organization_id?: string;
  user_id?: string;
  user_name?: string;

  action: AuditAction;
  entity_type: string;
  entity_id?: string;

  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;

  created_at: string;
}

// ============================================================
// PLATFORM ADMIN (Payvexo Team)
// ============================================================

export interface PlatformAdmin {
  id: string;
  email: string;
  full_name: string;
  password_hash?: string;

  // Permissions
  can_manage_organizations: boolean;
  can_manage_subscriptions: boolean;
  can_view_all_data: boolean;
  can_manage_platform_admins: boolean;

  is_active: boolean;

  created_at: string;
  last_login_at?: string;
}

// ============================================================
// HELPER TYPES
// ============================================================

/**
 * Default terminology per organization type
 */
export const ORG_TYPE_DEFAULTS: Record<OrganizationType, {
  member_label: string;
  member_label_plural: string;
  group_label: string;
  group_label_plural: string;
  payment_label: string;
  admin_label: string;
  default_levels: string[];
  default_categories: PaymentCategory[];
}> = {
  university: {
    member_label: 'Student',
    member_label_plural: 'Students',
    group_label: 'Department',
    group_label_plural: 'Departments',
    payment_label: 'Dues',
    admin_label: 'Admin',
    default_levels: ['100L', '200L', '300L', '400L', '500L'],
    default_categories: ['dues', 'fees', 'welfare', 'project', 'event'],
  },
  church: {
    member_label: 'Member',
    member_label_plural: 'Members',
    group_label: 'Ministry',
    group_label_plural: 'Ministries',
    payment_label: 'Tithes & Offerings',
    admin_label: 'Pastor',
    default_levels: ['New Convert', 'Member', 'Worker', 'Deacon/Deaconess', 'Elder', 'Pastor'],
    default_categories: ['tithe', 'offering', 'donation', 'welfare', 'project'],
  },
  club: {
    member_label: 'Member',
    member_label_plural: 'Members',
    group_label: 'Chapter',
    group_label_plural: 'Chapters',
    payment_label: 'Dues',
    admin_label: 'Coordinator',
    default_levels: ['Bronze', 'Silver', 'Gold', 'Platinum'],
    default_categories: ['dues', 'subscription', 'event', 'welfare'],
  },
  association: {
    member_label: 'Member',
    member_label_plural: 'Members',
    group_label: 'Branch',
    group_label_plural: 'Branches',
    payment_label: 'Contributions',
    admin_label: 'Executive',
    default_levels: ['Associate', 'Full Member', 'Fellow'],
    default_categories: ['dues', 'levy', 'contribution', 'welfare', 'project'],
  },
  cooperative: {
    member_label: 'Member',
    member_label_plural: 'Members',
    group_label: 'Unit',
    group_label_plural: 'Units',
    payment_label: 'Savings',
    admin_label: 'Manager',
    default_levels: ['Regular', 'Premium'],
    default_categories: ['savings', 'contribution', 'levy', 'welfare'],
  },
  ngo: {
    member_label: 'Volunteer',
    member_label_plural: 'Volunteers',
    group_label: 'Program',
    group_label_plural: 'Programs',
    payment_label: 'Donations',
    admin_label: 'Coordinator',
    default_levels: ['Volunteer', 'Staff', 'Board Member'],
    default_categories: ['donation', 'contribution', 'project', 'event'],
  },
  school: {
    member_label: 'Student',
    member_label_plural: 'Students',
    group_label: 'Class',
    group_label_plural: 'Classes',
    payment_label: 'Fees',
    admin_label: 'Teacher',
    default_levels: ['JSS1', 'JSS2', 'JSS3', 'SS1', 'SS2', 'SS3'],
    default_categories: ['fees', 'dues', 'event', 'welfare'],
  },
  other: {
    member_label: 'Member',
    member_label_plural: 'Members',
    group_label: 'Group',
    group_label_plural: 'Groups',
    payment_label: 'Payments',
    admin_label: 'Admin',
    default_levels: ['Level 1', 'Level 2', 'Level 3'],
    default_categories: ['dues', 'contribution', 'donation', 'event'],
  },
};
