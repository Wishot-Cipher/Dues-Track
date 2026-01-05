-- ============================================================
-- Migration 001: Organizations & Departments
-- Multi-Tenant Foundation Tables
-- ============================================================

-- Create organizations table (top-level entity)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Basic Info
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    
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
    currency_code TEXT DEFAULT 'NGN',
    currency_symbol TEXT DEFAULT '₦',
    timezone TEXT DEFAULT 'Africa/Lagos',
    
    -- Subscription & Limits
    subscription_plan TEXT DEFAULT 'free' CHECK (subscription_plan IN ('free', 'starter', 'pro', 'enterprise')),
    max_departments INTEGER DEFAULT 1,
    max_students INTEGER DEFAULT 100,
    max_admins INTEGER DEFAULT 5,
    subscription_expires_at TIMESTAMPTZ,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    is_verified BOOLEAN DEFAULT false,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by UUID
);

-- Indexes for organizations
CREATE INDEX IF NOT EXISTS idx_organizations_slug ON organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_active ON organizations(is_active) WHERE is_active = true;

-- Create departments table
CREATE TABLE IF NOT EXISTS departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Basic Info
    name TEXT NOT NULL,
    short_name TEXT NOT NULL,
    code TEXT,
    
    -- Configuration
    levels TEXT[] DEFAULT ARRAY['100L', '200L', '300L', '400L', '500L'],
    sections TEXT[],
    
    -- Contact
    head_of_department TEXT,
    email TEXT,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT unique_dept_per_org UNIQUE(organization_id, short_name)
);

-- Indexes for departments
CREATE INDEX IF NOT EXISTS idx_departments_org ON departments(organization_id);
CREATE INDEX IF NOT EXISTS idx_departments_active ON departments(organization_id, is_active) WHERE is_active = true;

-- Create organization_settings table
CREATE TABLE IF NOT EXISTS organization_settings (
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
    current_session TEXT,
    current_semester TEXT,
    
    -- Custom Fields (JSON for flexibility)
    custom_settings JSONB DEFAULT '{}',
    
    -- Audit
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- Helper Functions
-- ============================================================

-- Function to generate URL-friendly slugs
CREATE OR REPLACE FUNCTION generate_slug(input_text TEXT)
RETURNS TEXT AS $$
BEGIN
    RETURN LOWER(
        REGEXP_REPLACE(
            REGEXP_REPLACE(input_text, '[^a-zA-Z0-9\s-]', '', 'g'),
            '\s+', '-', 'g'
        )
    );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Trigger to auto-generate slug if not provided
CREATE OR REPLACE FUNCTION auto_generate_org_slug()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.slug IS NULL OR NEW.slug = '' THEN
        NEW.slug := generate_slug(NEW.short_name);
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_auto_generate_org_slug
    BEFORE INSERT ON organizations
    FOR EACH ROW
    EXECUTE FUNCTION auto_generate_org_slug();

-- Trigger to auto-create settings when org is created
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
    FOR EACH ROW
    EXECUTE FUNCTION auto_create_org_settings();

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
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_departments_updated_at
    BEFORE UPDATE ON departments
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trigger_org_settings_updated_at
    BEFORE UPDATE ON organization_settings
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();

-- ============================================================
-- RLS Policies (Basic - Will be enhanced later)
-- ============================================================

ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE organization_settings ENABLE ROW LEVEL SECURITY;

-- For now, allow authenticated users to read orgs they belong to
-- These will be refined when we add the auth context

-- Service role bypass (for admin operations)
CREATE POLICY "service_role_all_orgs" ON organizations
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_role_all_depts" ON departments
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

CREATE POLICY "service_role_all_settings" ON organization_settings
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);

-- ============================================================
-- Sample Data (for development)
-- ============================================================

-- Insert sample organization (FUTO - current use case)
INSERT INTO organizations (
    name,
    short_name,
    slug,
    email,
    country,
    currency_code,
    currency_symbol,
    timezone,
    subscription_plan,
    max_departments,
    max_students,
    max_admins,
    is_active,
    is_verified
) VALUES (
    'Federal University of Technology, Owerri',
    'FUTO',
    'futo',
    'info@futo.edu.ng',
    'Nigeria',
    'NGN',
    '₦',
    'Africa/Lagos',
    'pro',
    10,
    5000,
    50,
    true,
    true
) ON CONFLICT (slug) DO NOTHING;

-- Insert ECE department for FUTO
INSERT INTO departments (
    organization_id,
    name,
    short_name,
    code,
    levels,
    is_active
)
SELECT 
    id,
    'Electrical & Computer Engineering',
    'ECE',
    'ENG/ECE',
    ARRAY['100L', '200L', '300L', '400L', '500L'],
    true
FROM organizations
WHERE slug = 'futo'
ON CONFLICT (organization_id, short_name) DO NOTHING;

-- ============================================================
-- Verification Queries
-- ============================================================

-- Verify setup
DO $$
DECLARE
    org_count INTEGER;
    dept_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO org_count FROM organizations;
    SELECT COUNT(*) INTO dept_count FROM departments;
    
    RAISE NOTICE 'Migration 001 complete:';
    RAISE NOTICE '  - Organizations: %', org_count;
    RAISE NOTICE '  - Departments: %', dept_count;
END $$;
