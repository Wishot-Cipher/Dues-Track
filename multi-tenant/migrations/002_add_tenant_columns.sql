-- ============================================================
-- Migration 002: Add Multi-Tenant Columns to Existing Tables
-- 
-- This migration adds organization_id and department_id to all
-- existing tables without breaking the current schema.
-- ============================================================

-- ============================================================
-- STEP 1: Add columns to students table
-- ============================================================

-- Add multi-tenant columns (nullable initially for migration)
ALTER TABLE students 
    ADD COLUMN IF NOT EXISTS organization_id UUID,
    ADD COLUMN IF NOT EXISTS department_id UUID;

-- Add foreign key constraints (deferred until data is migrated)
-- We'll add these after the data migration

-- Add new columns for enhanced functionality
ALTER TABLE students
    ADD COLUMN IF NOT EXISTS admission_year INTEGER,
    ADD COLUMN IF NOT EXISTS avatar_url TEXT,
    ADD COLUMN IF NOT EXISTS date_of_birth DATE,
    ADD COLUMN IF NOT EXISTS gender TEXT,
    ADD COLUMN IF NOT EXISTS is_suspended BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS suspension_reason TEXT,
    ADD COLUMN IF NOT EXISTS last_login_at TIMESTAMPTZ;

-- ============================================================
-- STEP 2: Add columns to admins table
-- ============================================================

ALTER TABLE admins
    ADD COLUMN IF NOT EXISTS organization_id UUID,
    ADD COLUMN IF NOT EXISTS department_id UUID,
    ADD COLUMN IF NOT EXISTS can_manage_admins BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS can_manage_settings BOOLEAN DEFAULT false,
    ADD COLUMN IF NOT EXISTS appointed_by UUID;

-- Update role to support new hierarchy
-- (existing values remain valid)

-- ============================================================
-- STEP 3: Add columns to payment_types table
-- ============================================================

ALTER TABLE payment_types
    ADD COLUMN IF NOT EXISTS organization_id UUID,
    ADD COLUMN IF NOT EXISTS department_id UUID,
    ADD COLUMN IF NOT EXISTS minimum_partial_amount DECIMAL(12,2),
    ADD COLUMN IF NOT EXISTS target_sections TEXT[],
    ADD COLUMN IF NOT EXISTS start_date TIMESTAMPTZ DEFAULT NOW(),
    ADD COLUMN IF NOT EXISTS display_order INTEGER DEFAULT 0;

-- ============================================================
-- STEP 4: Add columns to payments table
-- ============================================================

ALTER TABLE payments
    ADD COLUMN IF NOT EXISTS organization_id UUID,
    ADD COLUMN IF NOT EXISTS department_id UUID;

-- ============================================================
-- STEP 5: Add columns to expense_categories table
-- ============================================================

ALTER TABLE expense_categories
    ADD COLUMN IF NOT EXISTS organization_id UUID,
    ADD COLUMN IF NOT EXISTS department_id UUID;

-- ============================================================
-- STEP 6: Add columns to expenses table
-- ============================================================

ALTER TABLE expenses
    ADD COLUMN IF NOT EXISTS organization_id UUID,
    ADD COLUMN IF NOT EXISTS department_id UUID,
    ADD COLUMN IF NOT EXISTS funded_by UUID;  -- Reference to payment_type that funds this

-- ============================================================
-- STEP 7: Add columns to notifications table
-- ============================================================

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS organization_id UUID,
    ADD COLUMN IF NOT EXISTS link TEXT,
    ADD COLUMN IF NOT EXISTS related_type TEXT,
    ADD COLUMN IF NOT EXISTS related_id UUID;

-- ============================================================
-- STEP 8: Create audit_logs table
-- ============================================================

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
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);

-- ============================================================
-- STEP 9: Create super_admins table (platform level)
-- ============================================================

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
-- Create indexes for new columns
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_students_org ON students(organization_id);
CREATE INDEX IF NOT EXISTS idx_students_dept ON students(department_id);
CREATE INDEX IF NOT EXISTS idx_admins_org ON admins(organization_id);
CREATE INDEX IF NOT EXISTS idx_admins_dept ON admins(department_id);
CREATE INDEX IF NOT EXISTS idx_payment_types_org ON payment_types(organization_id);
CREATE INDEX IF NOT EXISTS idx_payment_types_dept ON payment_types(department_id);
CREATE INDEX IF NOT EXISTS idx_payments_org ON payments(organization_id);
CREATE INDEX IF NOT EXISTS idx_payments_dept ON payments(department_id);
CREATE INDEX IF NOT EXISTS idx_expense_categories_org ON expense_categories(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_org ON expenses(organization_id);
CREATE INDEX IF NOT EXISTS idx_expenses_dept ON expenses(department_id);
CREATE INDEX IF NOT EXISTS idx_notifications_org ON notifications(organization_id);

-- ============================================================
-- Verification
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 002 complete: Multi-tenant columns added';
    RAISE NOTICE 'Next step: Run migration 003 to migrate existing data';
END $$;
