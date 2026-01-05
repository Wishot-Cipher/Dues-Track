-- ============================================================
-- Migration 003: Migrate Existing Data to Multi-Tenant Schema
-- 
-- This migration:
-- 1. Creates default organization (FUTO) if not exists
-- 2. Creates default department (ECE) if not exists
-- 3. Updates all existing records with organization_id and department_id
-- 4. Adds NOT NULL constraints after data migration
-- 5. Adds foreign key constraints
-- ============================================================

-- ============================================================
-- STEP 1: Ensure default organization exists
-- ============================================================

INSERT INTO organizations (
    id,
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
    '00000000-0000-0000-0000-000000000001',  -- Fixed UUID for migration
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
) ON CONFLICT (slug) DO UPDATE SET
    updated_at = NOW();

-- Get the org ID (might be different if already existed)
DO $$
DECLARE
    v_org_id UUID;
    v_dept_id UUID;
BEGIN
    -- Get organization ID
    SELECT id INTO v_org_id FROM organizations WHERE slug = 'futo';
    
    -- ============================================================
    -- STEP 2: Ensure default department exists
    -- ============================================================
    
    INSERT INTO departments (
        id,
        organization_id,
        name,
        short_name,
        code,
        levels,
        is_active
    ) VALUES (
        '00000000-0000-0000-0000-000000000002',  -- Fixed UUID for migration
        v_org_id,
        'Electrical & Computer Engineering',
        'ECE',
        'ENG/ECE',
        ARRAY['100L', '200L', '300L', '400L', '500L'],
        true
    ) ON CONFLICT (organization_id, short_name) DO UPDATE SET
        updated_at = NOW();
    
    -- Get department ID
    SELECT id INTO v_dept_id FROM departments 
    WHERE organization_id = v_org_id AND short_name = 'ECE';
    
    -- ============================================================
    -- STEP 3: Update all existing students
    -- ============================================================
    
    UPDATE students 
    SET 
        organization_id = v_org_id,
        department_id = v_dept_id
    WHERE organization_id IS NULL;
    
    RAISE NOTICE 'Updated students with org_id: %, dept_id: %', v_org_id, v_dept_id;
    
    -- ============================================================
    -- STEP 4: Update all existing admins
    -- ============================================================
    
    UPDATE admins
    SET 
        organization_id = v_org_id,
        department_id = v_dept_id
    WHERE organization_id IS NULL;
    
    -- ============================================================
    -- STEP 5: Update all existing payment_types
    -- ============================================================
    
    UPDATE payment_types
    SET 
        organization_id = v_org_id,
        department_id = v_dept_id
    WHERE organization_id IS NULL;
    
    -- ============================================================
    -- STEP 6: Update all existing payments
    -- ============================================================
    
    UPDATE payments
    SET 
        organization_id = v_org_id,
        department_id = v_dept_id
    WHERE organization_id IS NULL;
    
    -- ============================================================
    -- STEP 7: Update all existing expense_categories
    -- ============================================================
    
    UPDATE expense_categories
    SET 
        organization_id = v_org_id,
        department_id = v_dept_id
    WHERE organization_id IS NULL;
    
    -- ============================================================
    -- STEP 8: Update all existing expenses
    -- ============================================================
    
    UPDATE expenses
    SET 
        organization_id = v_org_id,
        department_id = v_dept_id
    WHERE organization_id IS NULL;
    
    -- ============================================================
    -- STEP 9: Update all existing notifications
    -- ============================================================
    
    UPDATE notifications
    SET organization_id = v_org_id
    WHERE organization_id IS NULL;

END $$;

-- ============================================================
-- STEP 10: Add NOT NULL constraints
-- ============================================================

-- Students
ALTER TABLE students 
    ALTER COLUMN organization_id SET NOT NULL,
    ALTER COLUMN department_id SET NOT NULL;

-- Admins
ALTER TABLE admins
    ALTER COLUMN organization_id SET NOT NULL;
    -- Note: department_id can be NULL for org-level admins

-- Payment Types
ALTER TABLE payment_types
    ALTER COLUMN organization_id SET NOT NULL,
    ALTER COLUMN department_id SET NOT NULL;

-- Payments
ALTER TABLE payments
    ALTER COLUMN organization_id SET NOT NULL,
    ALTER COLUMN department_id SET NOT NULL;

-- Expense Categories
ALTER TABLE expense_categories
    ALTER COLUMN organization_id SET NOT NULL;
    -- Note: department_id can be NULL for org-level categories

-- Expenses
ALTER TABLE expenses
    ALTER COLUMN organization_id SET NOT NULL,
    ALTER COLUMN department_id SET NOT NULL;

-- Notifications
ALTER TABLE notifications
    ALTER COLUMN organization_id SET NOT NULL;

-- ============================================================
-- STEP 11: Add foreign key constraints
-- ============================================================

-- Students
ALTER TABLE students
    ADD CONSTRAINT fk_students_org 
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_students_dept 
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;

-- Admins
ALTER TABLE admins
    ADD CONSTRAINT fk_admins_org 
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_admins_dept 
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;

-- Payment Types
ALTER TABLE payment_types
    ADD CONSTRAINT fk_payment_types_org 
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_payment_types_dept 
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;

-- Payments
ALTER TABLE payments
    ADD CONSTRAINT fk_payments_org 
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_payments_dept 
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;

-- Expense Categories
ALTER TABLE expense_categories
    ADD CONSTRAINT fk_expense_categories_org 
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_expense_categories_dept 
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE;

-- Expenses
ALTER TABLE expenses
    ADD CONSTRAINT fk_expenses_org 
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_expenses_dept 
    FOREIGN KEY (department_id) REFERENCES departments(id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_expenses_funded_by 
    FOREIGN KEY (funded_by) REFERENCES payment_types(id) ON DELETE SET NULL;

-- Notifications
ALTER TABLE notifications
    ADD CONSTRAINT fk_notifications_org 
    FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE;

-- ============================================================
-- STEP 12: Update unique constraints
-- ============================================================

-- Drop old unique constraint on reg_number (if exists)
ALTER TABLE students DROP CONSTRAINT IF EXISTS students_reg_number_key;

-- Add new unique constraint scoped to organization
ALTER TABLE students 
    ADD CONSTRAINT unique_student_reg_per_org UNIQUE (organization_id, reg_number);

-- ============================================================
-- Verification
-- ============================================================

DO $$
DECLARE
    org_count INTEGER;
    dept_count INTEGER;
    student_count INTEGER;
    payment_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO org_count FROM organizations;
    SELECT COUNT(*) INTO dept_count FROM departments;
    SELECT COUNT(*) INTO student_count FROM students WHERE organization_id IS NOT NULL;
    SELECT COUNT(*) INTO payment_count FROM payments WHERE organization_id IS NOT NULL;
    
    RAISE NOTICE 'Migration 003 complete:';
    RAISE NOTICE '  - Organizations: %', org_count;
    RAISE NOTICE '  - Departments: %', dept_count;
    RAISE NOTICE '  - Students migrated: %', student_count;
    RAISE NOTICE '  - Payments migrated: %', payment_count;
END $$;
