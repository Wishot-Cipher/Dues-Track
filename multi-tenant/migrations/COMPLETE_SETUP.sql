-- ============================================================
-- COMPLETE MULTI-TENANT SETUP
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- ============================================================
-- PART 1: Create Organizations & Departments Tables
-- ============================================================

-- Create organizations table (top-level entity)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    logo_url TEXT,
    primary_color TEXT DEFAULT '#FF6B35',
    secondary_color TEXT DEFAULT '#1A0E09',
    email TEXT,
    phone TEXT,
    website TEXT,
    address TEXT,
    country TEXT DEFAULT 'Nigeria',
    currency_code TEXT DEFAULT 'NGN',
    currency_symbol TEXT DEFAULT '₦',
    timezone TEXT DEFAULT 'Africa/Lagos',
    subscription_plan TEXT DEFAULT 'free' CHECK (subscription_plan IN ('free', 'starter', 'pro', 'enterprise')),
    max_departments INTEGER DEFAULT 1,
    max_students INTEGER DEFAULT 100,
    max_admins INTEGER DEFAULT 5,
    subscription_expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON organizations(is_active) WHERE is_active = true;

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    code TEXT,
    levels TEXT[] DEFAULT ARRAY['100L', '200L', '300L', '400L', '500L'],
    sections TEXT[],
    head_of_department TEXT,
    email TEXT,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_dept_per_org UNIQUE(organization_id, short_name)
);

CREATE INDEX IF NOT EXISTS idx_departments_org ON departments(organization_id);

-- Create organization_settings table
CREATE TABLE IF NOT EXISTS organization_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID UNIQUE NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    allow_partial_payments BOOLEAN DEFAULT true,
    allow_pay_for_others BOOLEAN DEFAULT true,
    require_receipt_upload BOOLEAN DEFAULT true,
    allow_student_expense_view BOOLEAN DEFAULT true,
    email_notifications BOOLEAN DEFAULT true,
    sms_notifications BOOLEAN DEFAULT false,
    show_payment_deadline_warnings BOOLEAN DEFAULT true,
    deadline_warning_days INTEGER DEFAULT 7,
    current_session TEXT,
    current_semester TEXT,
    custom_settings JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create audit_logs table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID REFERENCES organizations(id) ON DELETE SET NULL,
    user_id UUID,
    action TEXT NOT NULL,
    entity_type TEXT,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);

-- Create super_admins table (platform level)
CREATE TABLE IF NOT EXISTS super_admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    password_hash TEXT NOT NULL,
    full_name TEXT NOT NULL,
    can_manage_organizations BOOLEAN DEFAULT true,
    can_view_all_data BOOLEAN DEFAULT false,
    can_manage_super_admins BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login_at TIMESTAMPTZ
);

-- ============================================================
-- PART 2: Create Students Table (Core Table)
-- ============================================================

CREATE TABLE IF NOT EXISTS students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    full_name TEXT NOT NULL,
    reg_number TEXT NOT NULL,
    email TEXT,
    phone TEXT,
    level TEXT,
    section TEXT,
    admission_year INTEGER,
    password_hash TEXT NOT NULL DEFAULT 'default_hash',
    force_password_change BOOLEAN DEFAULT true,
    last_login_at TIMESTAMPTZ,
    avatar_url TEXT,
    date_of_birth DATE,
    gender TEXT,
    is_active BOOLEAN DEFAULT true,
    is_suspended BOOLEAN DEFAULT false,
    suspension_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT unique_student_reg_per_org UNIQUE (organization_id, reg_number)
);

CREATE INDEX IF NOT EXISTS idx_students_org ON students(organization_id);
CREATE INDEX IF NOT EXISTS idx_students_dept ON students(department_id);
CREATE INDEX IF NOT EXISTS idx_students_reg ON students(organization_id, reg_number);

-- ============================================================
-- PART 3: Create Admins Table
-- ============================================================

CREATE TABLE IF NOT EXISTS admins (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'group_admin',
    can_create_payments BOOLEAN DEFAULT false,
    can_approve_payments BOOLEAN DEFAULT false,
    can_manage_students BOOLEAN DEFAULT false,
    can_manage_admins BOOLEAN DEFAULT false,
    can_manage_expenses BOOLEAN DEFAULT false,
    can_view_analytics BOOLEAN DEFAULT false,
    can_export_data BOOLEAN DEFAULT false,
    can_manage_settings BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    appointed_by UUID REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_admins_org ON admins(organization_id);
CREATE INDEX IF NOT EXISTS idx_admins_student ON admins(student_id);

-- ============================================================
-- PART 4: Create Payment Types Table
-- ============================================================

CREATE TABLE IF NOT EXISTS payment_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    category TEXT NOT NULL DEFAULT 'semester_dues',
    amount DECIMAL(12,2) NOT NULL,
    allow_partial BOOLEAN DEFAULT false,
    minimum_partial_amount DECIMAL(12,2),
    target_levels TEXT[],
    target_sections TEXT[],
    is_mandatory BOOLEAN DEFAULT false,
    deadline TIMESTAMPTZ,
    start_date TIMESTAMPTZ DEFAULT NOW(),
    bank_name TEXT,
    account_name TEXT,
    account_number TEXT,
    icon TEXT DEFAULT '📚',
    color TEXT DEFAULT '#3B82F6',
    display_order INTEGER DEFAULT 0,
    is_active BOOLEAN DEFAULT true,
    is_public BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID REFERENCES admins(id)
);

CREATE INDEX IF NOT EXISTS idx_payment_types_org ON payment_types(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_types_dept ON payment_types(department_id);

-- ============================================================
-- PART 5: Create Payments Table
-- ============================================================

CREATE TABLE IF NOT EXISTS payments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    payment_type_id UUID NOT NULL REFERENCES payment_types(id) ON DELETE CASCADE,
    amount DECIMAL(12,2) NOT NULL,
    payment_method TEXT NOT NULL,
    transaction_ref TEXT,
    receipt_url TEXT,
    notes TEXT,
    status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    paid_by UUID REFERENCES students(id),
    paid_for_note TEXT,
    approved_by UUID REFERENCES admins(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_student ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(department_id, status);

-- ============================================================
-- PART 6: Create Expense Tables
-- ============================================================

CREATE TABLE IF NOT EXISTS expense_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID REFERENCES departments(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    icon TEXT DEFAULT '📦',
    color TEXT DEFAULT '#6B7280',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_categories_org ON expense_categories(organization_id);

CREATE TABLE IF NOT EXISTS expenses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    department_id UUID NOT NULL REFERENCES departments(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    amount DECIMAL(12,2) NOT NULL,
    expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
    category_id UUID REFERENCES expense_categories(id),
    funded_by UUID REFERENCES payment_types(id),
    receipt_url TEXT,
    status TEXT DEFAULT 'pending',
    rejection_reason TEXT,
    created_by UUID NOT NULL REFERENCES admins(id),
    approved_by UUID REFERENCES admins(id),
    approved_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expenses_org ON expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_dept ON expenses(department_id);

-- ============================================================
-- PART 7: Create Notifications Table
-- ============================================================

CREATE TABLE IF NOT EXISTS notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    message TEXT NOT NULL,
    link TEXT,
    is_read BOOLEAN DEFAULT false,
    read_at TIMESTAMPTZ,
    related_type TEXT,
    related_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_student ON notifications(student_id);
CREATE INDEX IF NOT EXISTS idx_notifications_unread ON notifications(student_id, is_read) WHERE is_read = false;

-- ============================================================
-- PART 8: Helper Functions
-- ============================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply updated_at triggers
CREATE TRIGGER trigger_organizations_updated_at
    BEFORE UPDATE ON organizations
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_students_updated_at
    BEFORE UPDATE ON students
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_admins_updated_at
    BEFORE UPDATE ON admins
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_payment_types_updated_at
    BEFORE UPDATE ON payment_types
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_payments_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_expenses_updated_at
    BEFORE UPDATE ON expenses
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Auto-create org settings when org is created
CREATE OR REPLACE FUNCTION auto_create_org_settings()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO organization_settings (organization_id)
    VALUES (NEW.id)
    ON CONFLICT (organization_id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_create_org_settings
    AFTER INSERT ON organizations
    FOR EACH ROW EXECUTE FUNCTION auto_create_org_settings();

-- ============================================================
-- PART 9: Insert Sample Data (FUTO + ECE)
-- ============================================================

-- Insert FUTO organization
INSERT INTO organizations (
    name, short_name, slug, email, country,
    currency_code, currency_symbol, timezone,
    subscription_plan, max_departments, max_students, max_admins,
    is_active, is_verified
) VALUES (
    'Federal University of Technology, Owerri',
    'FUTO', 'futo', 'info@futo.edu.ng', 'Nigeria',
    'NGN', '₦', 'Africa/Lagos',
    'pro', 10, 5000, 50,
    true, true
) ON CONFLICT (slug) DO NOTHING;

-- Insert ECE Department
INSERT INTO departments (
    organization_id, name, short_name, code, levels, is_active
)
SELECT 
    id,
    'Electrical & Computer Engineering',
    'ECE',
    'ENG/ECE',
    ARRAY['100L', '200L', '300L', '400L', '500L'],
    true
FROM organizations WHERE slug = 'futo'
ON CONFLICT (organization_id, short_name) DO NOTHING;

-- Insert default expense categories
INSERT INTO expense_categories (organization_id, name, icon, color)
SELECT id, 'Transportation', '🚗', '#3B82F6' FROM organizations WHERE slug = 'futo'
ON CONFLICT DO NOTHING;

INSERT INTO expense_categories (organization_id, name, icon, color)
SELECT id, 'Printing & Stationery', '🖨️', '#10B981' FROM organizations WHERE slug = 'futo'
ON CONFLICT DO NOTHING;

INSERT INTO expense_categories (organization_id, name, icon, color)
SELECT id, 'Events', '🎉', '#F59E0B' FROM organizations WHERE slug = 'futo'
ON CONFLICT DO NOTHING;

INSERT INTO expense_categories (organization_id, name, icon, color)
SELECT id, 'Equipment', '🔧', '#6366F1' FROM organizations WHERE slug = 'futo'
ON CONFLICT DO NOTHING;

INSERT INTO expense_categories (organization_id, name, icon, color)
SELECT id, 'Refreshments', '🍕', '#EC4899' FROM organizations WHERE slug = 'futo'
ON CONFLICT DO NOTHING;

-- ============================================================
-- PART 10: Enable RLS (Row Level Security)
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- Service role bypass (for admin/server operations)
CREATE POLICY "service_role_all" ON organizations FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON departments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON organization_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON students FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON admins FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON payment_types FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON payments FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON expense_categories FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON expenses FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON notifications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON audit_logs FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Allow anon/authenticated to read active organizations (for login page)
CREATE POLICY "public_read_orgs" ON organizations FOR SELECT TO anon, authenticated USING (is_active = true);
CREATE POLICY "public_read_depts" ON departments FOR SELECT TO anon, authenticated USING (is_active = true);

-- ============================================================
-- VERIFICATION
-- ============================================================

DO $$
DECLARE
    org_count INTEGER;
    dept_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO org_count FROM organizations;
    SELECT COUNT(*) INTO dept_count FROM departments;
    
    RAISE NOTICE '✅ Multi-tenant setup complete!';
    RAISE NOTICE '   Organizations: %', org_count;
    RAISE NOTICE '   Departments: %', dept_count;
END $$;
