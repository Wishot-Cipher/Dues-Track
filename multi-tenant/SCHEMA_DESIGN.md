# Multi-Tenant Database Schema Design

> **Version:** 1.0  
> **Date:** January 2026  
> **Purpose:** Transform Class Dues Tracker into a multi-university SaaS platform

---

## Overview

This schema supports:
- Multiple universities/institutions (organizations)
- Multiple departments per organization
- Complete data isolation between organizations
- Flexible configuration per organization (currency, levels, branding)
- Hierarchical admin roles

---

## Entity Relationship Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              ORGANIZATIONS                                   │
│  (Universities, Colleges, Polytechnics)                                     │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DEPARTMENTS                                     │
│  (ECE, Computer Science, etc.)                                              │
└─────────────────────────────────────────────────────────────────────────────┘
         │
         │ 1:N
         ▼
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│      STUDENTS       │     │    PAYMENT_TYPES    │     │  EXPENSE_CATEGORIES │
│                     │     │    (Dues/Fees)      │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
         │                           │                           │
         │ 1:N                       │ 1:N                       │ 1:N
         ▼                           ▼                           ▼
┌─────────────────────┐     ┌─────────────────────┐     ┌─────────────────────┐
│      PAYMENTS       │────▶│                     │     │      EXPENSES       │
│                     │     │                     │     │                     │
└─────────────────────┘     └─────────────────────┘     └─────────────────────┘
         │
         │
         ▼
┌─────────────────────┐
│   NOTIFICATIONS     │
└─────────────────────┘

Cross-cutting:
┌─────────────────────┐     ┌─────────────────────┐
│       ADMINS        │     │   ORG_SETTINGS      │
│  (Role-based)       │     │  (Config per org)   │
└─────────────────────┘     └─────────────────────┘
```

---

## Core Tables

### 1. `organizations` (NEW - Top Level)

The root entity. Each university/institution is an organization.

```sql
CREATE TABLE organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic Info
    name TEXT NOT NULL,                          -- "University of Lagos"
    short_name TEXT NOT NULL,                    -- "UNILAG"
    slug TEXT UNIQUE NOT NULL,                   -- "unilag" (for URLs)
    
    -- Branding
    logo_url TEXT,
    primary_color TEXT DEFAULT '#FF6B35',
    secondary_color TEXT DEFAULT '#1A0E09',
    
    -- Contact
    email TEXT,
    phone TEXT,
    website TEXT,
    address TEXT,
    country TEXT DEFAULT 'Nigeria',
    
    -- Configuration
    currency_code TEXT DEFAULT 'NGN',            -- ISO 4217
    currency_symbol TEXT DEFAULT '₦',
    timezone TEXT DEFAULT 'Africa/Lagos',
    
    -- Subscription & Limits
    subscription_plan TEXT DEFAULT 'free',       -- 'free', 'starter', 'pro', 'enterprise'
    max_departments INTEGER DEFAULT 1,
    max_students INTEGER DEFAULT 100,
    max_admins INTEGER DEFAULT 5,
    subscription_expires_at TIMESTAMPTZ,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,           -- Admin verified the org
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID                              -- Super admin who created
);

-- Indexes
CREATE INDEX idx_organizations_slug ON organizations(slug);
CREATE INDEX idx_organizations_active ON organizations(is_active) WHERE is_active = true;
```

---

### 2. `departments` (NEW)

Departments within an organization.

```sql
CREATE TABLE departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Basic Info
    name TEXT NOT NULL,                          -- "Electrical & Computer Engineering"
    short_name TEXT NOT NULL,                    -- "ECE"
    code TEXT,                                   -- "ENG/ECE"
    
    -- Configuration (can override org settings)
    levels TEXT[] DEFAULT ARRAY['100L', '200L', '300L', '400L', '500L'],
    sections TEXT[],                             -- ['A', 'B', 'C'] if applicable
    
    -- Contact
    head_of_department TEXT,
    email TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(organization_id, short_name)
);

-- Indexes
CREATE INDEX idx_departments_org ON departments(organization_id);
```

---

### 3. `students` (MODIFIED)

Added `organization_id` and `department_id`.

```sql
CREATE TABLE students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Multi-tenant keys (REQUIRED)
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    
    -- Identity
    full_name TEXT NOT NULL,
    reg_number TEXT NOT NULL,                    -- Unique within organization
    email TEXT,
    phone TEXT,
    
    -- Academic Info
    level TEXT,                                  -- '200L', '300L', etc.
    section TEXT,                                -- 'A', 'B', etc.
    admission_year INTEGER,
    
    -- Authentication
    password_hash TEXT NOT NULL,
    force_password_change BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    
    -- Profile
    avatar_url TEXT,
    date_of_birth DATE,
    gender TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_suspended BOOLEAN DEFAULT false,
    suspension_reason TEXT,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(organization_id, reg_number)          -- Reg number unique per org
);

-- Indexes
CREATE INDEX idx_students_org ON students(organization_id);
CREATE INDEX idx_students_dept ON students(department_id);
CREATE INDEX idx_students_org_reg ON students(organization_id, reg_number);
CREATE INDEX idx_students_active ON students(organization_id, is_active) WHERE is_active = true;
```

---

### 4. `admins` (MODIFIED)

Hierarchical admin system with scoped permissions.

```sql
CREATE TABLE admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    
    -- Scope (which level does this admin operate at?)
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,  -- NULL = org-level admin
    
    -- Role Hierarchy
    -- 'super_admin'     = Platform owner (us)
    -- 'org_admin'       = University admin (manages all depts)
    -- 'dept_admin'      = Department admin (manages one dept)
    -- 'class_rep'       = Class representative
    -- 'finsec'          = Financial secretary
    -- 'auditor'         = Read-only financial access
    role TEXT NOT NULL DEFAULT 'class_rep',
    
    -- Granular Permissions
    can_create_payments BOOLEAN DEFAULT false,
    can_approve_payments BOOLEAN DEFAULT false,
    can_manage_students BOOLEAN DEFAULT false,
    can_manage_admins BOOLEAN DEFAULT false,     -- NEW: Can they assign other admins?
    can_manage_expenses BOOLEAN DEFAULT false,
    can_view_analytics BOOLEAN DEFAULT false,
    can_export_data BOOLEAN DEFAULT false,
    can_manage_settings BOOLEAN DEFAULT false,   -- NEW: Org/dept settings
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    appointed_by UUID REFERENCES admins(id),
    
    -- Constraints
    UNIQUE(student_id, organization_id, department_id, role)
);

-- Indexes
CREATE INDEX idx_admins_org ON admins(organization_id);
CREATE INDEX idx_admins_dept ON admins(department_id);
CREATE INDEX idx_admins_student ON admins(student_id);
```

---

### 5. `payment_types` (MODIFIED)

Dues/fees scoped to department.

```sql
CREATE TABLE payment_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Multi-tenant keys
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    
    -- Basic Info
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL,                      -- 'semester_dues', 'books', 'events', etc.
    
    -- Amount
    amount DECIMAL(12,2) NOT NULL,
    allow_partial BOOLEAN DEFAULT false,
    minimum_partial_amount DECIMAL(12,2),
    
    -- Targeting
    target_levels TEXT[],                        -- ['200L', '300L'] or NULL for all
    target_sections TEXT[],                      -- ['A', 'B'] or NULL for all
    is_mandatory BOOLEAN DEFAULT false,
    
    -- Timeline
    deadline TIMESTAMPTZ,
    start_date TIMESTAMPTZ DEFAULT NOW(),
    
    -- Payment Details
    bank_name TEXT,
    account_name TEXT,
    account_number TEXT,
    
    -- Display
    icon TEXT DEFAULT '📚',
    color TEXT DEFAULT '#3B82F6',
    display_order INTEGER DEFAULT 0,
    
    -- Visibility
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false,             -- Visible to public (donations)
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES admins(id)
);

-- Indexes
CREATE INDEX idx_payment_types_org ON payment_types(organization_id);
CREATE INDEX idx_payment_types_dept ON payment_types(department_id);
CREATE INDEX idx_payment_types_active ON payment_types(department_id, is_active) WHERE is_active = true;
```

---

### 6. `payments` (MODIFIED)

Individual payment records.

```sql
CREATE TABLE payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Multi-tenant keys
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    
    -- Payment Info
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    payment_type_id UUID NOT NULL REFERENCES payment_types(id) ON DELETE CASCADE,
    
    -- Amount
    amount DECIMAL(12,2) NOT NULL,
    
    -- Payment Method
    payment_method TEXT NOT NULL,                -- 'bank_transfer', 'cash', 'pos', 'online'
    transaction_ref TEXT,
    
    -- Evidence
    receipt_url TEXT,
    notes TEXT,
    
    -- Status Workflow
    status TEXT DEFAULT 'pending',               -- 'pending', 'approved', 'rejected'
    rejection_reason TEXT,
    
    -- Pay for Others
    paid_by UUID REFERENCES students(id),        -- Who actually paid (if different)
    paid_for_note TEXT,                          -- "Paid by John for Mary"
    
    -- Approval
    approved_by UUID REFERENCES admins(id),
    approved_at TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_payments_org ON payments(organization_id);
CREATE INDEX idx_payments_dept ON payments(department_id);
CREATE INDEX idx_payments_student ON payments(student_id);
CREATE INDEX idx_payments_type ON payments(payment_type_id);
CREATE INDEX idx_payments_status ON payments(department_id, status);
CREATE INDEX idx_payments_pending ON payments(department_id, status) WHERE status = 'pending';
```

---

### 7. `expense_categories` (MODIFIED)

```sql
CREATE TABLE expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Multi-tenant keys
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,  -- NULL = org-wide category
    
    -- Info
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📦',
    color TEXT DEFAULT '#6B7280',
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    UNIQUE(organization_id, department_id, name)
);
```

---

### 8. `expenses` (MODIFIED)

```sql
CREATE TABLE expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Multi-tenant keys
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    
    -- Basic Info
    title TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(12,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    
    -- Categorization
    category_id UUID REFERENCES expense_categories(id),
    funded_by UUID REFERENCES payment_types(id), -- Which fund pays for this
    
    -- Evidence
    receipt_url TEXT,
    
    -- Status
    status TEXT DEFAULT 'pending',               -- 'pending', 'approved', 'rejected'
    rejection_reason TEXT,
    
    -- Approval
    created_by UUID NOT NULL REFERENCES admins(id),
    approved_by UUID REFERENCES admins(id),
    approved_at TIMESTAMPTZ,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_expenses_org ON expenses(organization_id);
CREATE INDEX idx_expenses_dept ON expenses(department_id);
CREATE INDEX idx_expenses_status ON expenses(department_id, status);
```

---

### 9. `notifications` (MODIFIED)

```sql
CREATE TABLE notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Multi-tenant
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Target
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    
    -- Content
    type TEXT NOT NULL,                          -- 'payment_approved', 'payment_rejected', etc.
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,                                   -- Deep link into app
    
    -- Status
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    
    -- Related Entity
    related_type TEXT,                           -- 'payment', 'expense', etc.
    related_id UUID,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_notifications_student ON notifications(student_id);
CREATE INDEX idx_notifications_unread ON notifications(student_id, is_read) WHERE is_read = false;
```

---

### 10. `organization_settings` (NEW)

Configurable settings per organization.

```sql
CREATE TABLE organization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Feature Flags
    allow_partial_payments BOOLEAN DEFAULT true,
    allow_pay_for_others BOOLEAN DEFAULT true,
    require_receipt_upload BOOLEAN DEFAULT true,
    allow_student_expense_view BOOLEAN DEFAULT true,
    
    -- Notification Settings
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT false,
    
    -- Display Settings
    show_payment_deadline_warnings BOOLEAN DEFAULT true,
    deadline_warning_days INTEGER DEFAULT 7,
    
    -- Academic Settings
    current_session TEXT,                        -- "2025/2026"
    current_semester TEXT,                       -- "First Semester"
    
    -- Custom Fields (JSON for flexibility)
    custom_settings JSONB DEFAULT '{}',
    
    -- Audit
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

### 11. `audit_logs` (NEW - Security)

Track sensitive actions for compliance.

```sql
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Context
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID,                                -- Student/Admin who performed action
    
    -- Action Details
    action TEXT NOT NULL,                        -- 'login', 'payment_approved', 'student_deleted', etc.
    entity_type TEXT,                            -- 'student', 'payment', 'expense'
    entity_id UUID,
    
    -- Details
    old_values JSONB,                            -- Before state
    new_values JSONB,                            -- After state
    ip_address INET,
    user_agent TEXT,
    
    -- Timestamp
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes (for querying audit history)
CREATE INDEX idx_audit_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_date ON audit_logs(created_at);
```

---

### 12. `super_admins` (NEW - Platform Level)

Platform administrators (your team).

```sql
CREATE TABLE super_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    
    -- Permissions
    can_manage_organizations BOOLEAN DEFAULT true,
    can_view_all_data BOOLEAN DEFAULT false,     -- GDPR consideration
    can_manage_super_admins BOOLEAN DEFAULT false,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);
```

---

## RLS Policy Pattern

Every table with `organization_id` needs this pattern:

```sql
-- Enable RLS
ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Helper function to get current user's org
CREATE OR REPLACE FUNCTION get_user_organization_id()
RETURNS UUID AS $$
BEGIN
    RETURN (
        SELECT organization_id 
        FROM students 
        WHERE id = auth.uid()
        LIMIT 1
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Policy: Users can only see their organization's data
CREATE POLICY "students_org_isolation" ON students
    FOR ALL
    USING (organization_id = get_user_organization_id());
```

---

## Migration Strategy

### From Current Schema → Multi-Tenant

1. **Create organization for ECE:**
```sql
INSERT INTO organizations (name, short_name, slug)
VALUES ('Federal University of Technology, Owerri', 'FUTO', 'futo');
```

2. **Create department:**
```sql
INSERT INTO departments (organization_id, name, short_name)
VALUES ('<org_id>', 'Electrical & Computer Engineering', 'ECE');
```

3. **Migrate existing students:**
```sql
ALTER TABLE students ADD COLUMN organization_id UUID;
ALTER TABLE students ADD COLUMN department_id UUID;

UPDATE students SET 
    organization_id = '<org_id>',
    department_id = '<dept_id>';

ALTER TABLE students ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE students ALTER COLUMN department_id SET NOT NULL;
```

4. **Repeat for all tables...**

---

## Storage Buckets (Multi-Tenant)

```
receipts/
  ├── {organization_id}/
  │   ├── payments/
  │   │   └── {payment_id}.jpg
  │   └── expenses/
  │       └── {expense_id}.jpg
  └── ...

avatars/
  ├── {organization_id}/
  │   └── {student_id}.jpg
  └── ...

logos/
  └── {organization_id}.png
```

---

## API Endpoints Pattern

All endpoints should include organization context:

```
# Current (single-tenant)
GET /api/students
GET /api/payments

# Multi-tenant (option A: header)
GET /api/students
X-Organization-ID: <uuid>

# Multi-tenant (option B: path - RECOMMENDED)
GET /api/orgs/{org_slug}/students
GET /api/orgs/{org_slug}/payments

# Examples
GET /api/orgs/futo/departments/ece/students
POST /api/orgs/futo/departments/ece/payments
```

---

## Next Steps

1. ✅ Schema design (this document)
2. ⬜ Create SQL migration files
3. ⬜ Set up new Supabase project for development
4. ⬜ Update TypeScript types
5. ⬜ Create organization context in React
6. ⬜ Update all components to use org context
7. ⬜ Rewrite RLS policies
8. ⬜ Test data isolation thoroughly

---

*Document Version: 1.0 | Last Updated: January 2026*
