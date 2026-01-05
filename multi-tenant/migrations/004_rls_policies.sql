-- ============================================================
-- Migration 004: Multi-Tenant RLS Policies
-- 
-- This migration creates Row Level Security policies that
-- ensure complete data isolation between organizations.
-- ============================================================

-- ============================================================
-- Helper Functions
-- ============================================================

-- Get the organization ID for the current authenticated user
CREATE OR REPLACE FUNCTION get_current_user_org_id()
RETURNS UUID AS $$
DECLARE
    org_id UUID;
BEGIN
    SELECT organization_id INTO org_id
    FROM students
    WHERE id = auth.uid();
    
    RETURN org_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Get the department ID for the current authenticated user
CREATE OR REPLACE FUNCTION get_current_user_dept_id()
RETURNS UUID AS $$
DECLARE
    dept_id UUID;
BEGIN
    SELECT department_id INTO dept_id
    FROM students
    WHERE id = auth.uid();
    
    RETURN dept_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user is an admin at org level or dept level
CREATE OR REPLACE FUNCTION is_admin_for_org(org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM admins
        WHERE student_id = auth.uid()
        AND organization_id = org_id
        AND is_active = true
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- Check if user has specific permission in their org
CREATE OR REPLACE FUNCTION has_permission(permission_name TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    has_perm BOOLEAN := false;
BEGIN
    EXECUTE format(
        'SELECT COALESCE(bool_or(%I), false) FROM admins WHERE student_id = $1 AND is_active = true',
        permission_name
    ) INTO has_perm USING auth.uid();
    
    RETURN has_perm;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

-- ============================================================
-- Students RLS Policies
-- ============================================================

ALTER TABLE students ENABLE ROW LEVEL SECURITY;

-- Drop existing policies
DROP POLICY IF EXISTS "students_select" ON students;
DROP POLICY IF EXISTS "students_insert" ON students;
DROP POLICY IF EXISTS "students_update" ON students;
DROP POLICY IF EXISTS "students_delete" ON students;

-- SELECT: Users can view students in their organization
CREATE POLICY "students_select" ON students
    FOR SELECT
    USING (organization_id = get_current_user_org_id());

-- INSERT: Only admins with can_manage_students can create students
CREATE POLICY "students_insert" ON students
    FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND has_permission('can_manage_students')
    );

-- UPDATE: Users can update themselves, admins can update others
CREATE POLICY "students_update" ON students
    FOR UPDATE
    USING (
        organization_id = get_current_user_org_id()
        AND (
            id = auth.uid()  -- Can update self
            OR has_permission('can_manage_students')
        )
    );

-- DELETE: Only admins with can_manage_students
CREATE POLICY "students_delete" ON students
    FOR DELETE
    USING (
        organization_id = get_current_user_org_id()
        AND has_permission('can_manage_students')
    );

-- ============================================================
-- Admins RLS Policies
-- ============================================================

ALTER TABLE admins ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins_select" ON admins;
DROP POLICY IF EXISTS "admins_insert" ON admins;
DROP POLICY IF EXISTS "admins_update" ON admins;
DROP POLICY IF EXISTS "admins_delete" ON admins;

-- SELECT: Users can view admins in their organization
CREATE POLICY "admins_select" ON admins
    FOR SELECT
    USING (organization_id = get_current_user_org_id());

-- INSERT: Only admins with can_manage_admins
CREATE POLICY "admins_insert" ON admins
    FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND has_permission('can_manage_admins')
    );

-- UPDATE: Only admins with can_manage_admins
CREATE POLICY "admins_update" ON admins
    FOR UPDATE
    USING (
        organization_id = get_current_user_org_id()
        AND has_permission('can_manage_admins')
    );

-- DELETE: Only admins with can_manage_admins
CREATE POLICY "admins_delete" ON admins
    FOR DELETE
    USING (
        organization_id = get_current_user_org_id()
        AND has_permission('can_manage_admins')
    );

-- ============================================================
-- Payment Types RLS Policies
-- ============================================================

ALTER TABLE payment_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payment_types_select" ON payment_types;
DROP POLICY IF EXISTS "payment_types_insert" ON payment_types;
DROP POLICY IF EXISTS "payment_types_update" ON payment_types;
DROP POLICY IF EXISTS "payment_types_delete" ON payment_types;

-- SELECT: All users can view payment types in their org
CREATE POLICY "payment_types_select" ON payment_types
    FOR SELECT
    USING (organization_id = get_current_user_org_id());

-- INSERT: Only admins with can_create_payments
CREATE POLICY "payment_types_insert" ON payment_types
    FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND has_permission('can_create_payments')
    );

-- UPDATE: Only admins with can_create_payments
CREATE POLICY "payment_types_update" ON payment_types
    FOR UPDATE
    USING (
        organization_id = get_current_user_org_id()
        AND has_permission('can_create_payments')
    );

-- DELETE: Only admins with can_create_payments
CREATE POLICY "payment_types_delete" ON payment_types
    FOR DELETE
    USING (
        organization_id = get_current_user_org_id()
        AND has_permission('can_create_payments')
    );

-- ============================================================
-- Payments RLS Policies
-- ============================================================

ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "payments_select" ON payments;
DROP POLICY IF EXISTS "payments_insert" ON payments;
DROP POLICY IF EXISTS "payments_update" ON payments;

-- SELECT: Users can view their own payments, admins can view all
CREATE POLICY "payments_select" ON payments
    FOR SELECT
    USING (
        organization_id = get_current_user_org_id()
        AND (
            student_id = auth.uid()
            OR has_permission('can_approve_payments')
            OR has_permission('can_view_analytics')
        )
    );

-- INSERT: Users can submit their own payments
CREATE POLICY "payments_insert" ON payments
    FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND (student_id = auth.uid() OR has_permission('can_create_payments'))
    );

-- UPDATE: Only admins with can_approve_payments
CREATE POLICY "payments_update" ON payments
    FOR UPDATE
    USING (
        organization_id = get_current_user_org_id()
        AND has_permission('can_approve_payments')
    );

-- ============================================================
-- Expense Categories RLS Policies
-- ============================================================

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expense_categories_select" ON expense_categories;
DROP POLICY IF EXISTS "expense_categories_insert" ON expense_categories;
DROP POLICY IF EXISTS "expense_categories_update" ON expense_categories;
DROP POLICY IF EXISTS "expense_categories_delete" ON expense_categories;

-- SELECT: All users in org can view
CREATE POLICY "expense_categories_select" ON expense_categories
    FOR SELECT
    USING (organization_id = get_current_user_org_id());

-- INSERT/UPDATE/DELETE: Only admins with can_manage_expenses
CREATE POLICY "expense_categories_insert" ON expense_categories
    FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND has_permission('can_manage_expenses')
    );

CREATE POLICY "expense_categories_update" ON expense_categories
    FOR UPDATE
    USING (
        organization_id = get_current_user_org_id()
        AND has_permission('can_manage_expenses')
    );

CREATE POLICY "expense_categories_delete" ON expense_categories
    FOR DELETE
    USING (
        organization_id = get_current_user_org_id()
        AND has_permission('can_manage_expenses')
    );

-- ============================================================
-- Expenses RLS Policies
-- ============================================================

ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "expenses_select" ON expenses;
DROP POLICY IF EXISTS "expenses_insert" ON expenses;
DROP POLICY IF EXISTS "expenses_update" ON expenses;

-- SELECT: Based on org settings, either all users or only admins
CREATE POLICY "expenses_select" ON expenses
    FOR SELECT
    USING (
        organization_id = get_current_user_org_id()
        AND (
            has_permission('can_manage_expenses')
            OR has_permission('can_view_analytics')
            -- Check org settings for student visibility
            OR EXISTS (
                SELECT 1 FROM organization_settings os
                WHERE os.organization_id = expenses.organization_id
                AND os.allow_student_expense_view = true
            )
        )
    );

-- INSERT: Only admins with can_manage_expenses
CREATE POLICY "expenses_insert" ON expenses
    FOR INSERT
    WITH CHECK (
        organization_id = get_current_user_org_id()
        AND has_permission('can_manage_expenses')
    );

-- UPDATE: Only admins with can_manage_expenses
CREATE POLICY "expenses_update" ON expenses
    FOR UPDATE
    USING (
        organization_id = get_current_user_org_id()
        AND has_permission('can_manage_expenses')
    );

-- ============================================================
-- Notifications RLS Policies
-- ============================================================

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "notifications_select" ON notifications;
DROP POLICY IF EXISTS "notifications_insert" ON notifications;
DROP POLICY IF EXISTS "notifications_update" ON notifications;

-- SELECT: Users can only see their own notifications
CREATE POLICY "notifications_select" ON notifications
    FOR SELECT
    USING (student_id = auth.uid());

-- INSERT: System/admins can create notifications for users in their org
CREATE POLICY "notifications_insert" ON notifications
    FOR INSERT
    WITH CHECK (organization_id = get_current_user_org_id());

-- UPDATE: Users can update (mark read) their own notifications
CREATE POLICY "notifications_update" ON notifications
    FOR UPDATE
    USING (student_id = auth.uid());

-- ============================================================
-- Audit Logs RLS Policies
-- ============================================================

ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_select" ON audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert" ON audit_logs;

-- SELECT: Only admins with can_view_analytics
CREATE POLICY "audit_logs_select" ON audit_logs
    FOR SELECT
    USING (
        organization_id = get_current_user_org_id()
        AND has_permission('can_view_analytics')
    );

-- INSERT: System can insert (via service role)
CREATE POLICY "audit_logs_insert" ON audit_logs
    FOR INSERT
    WITH CHECK (organization_id = get_current_user_org_id());

-- ============================================================
-- Service Role Bypass Policies
-- ============================================================

-- These allow the service role to bypass RLS for admin operations

CREATE POLICY "service_students" ON students
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_admins" ON admins
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_payment_types" ON payment_types
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_payments" ON payments
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_expense_categories" ON expense_categories
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_expenses" ON expenses
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_notifications" ON notifications
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

CREATE POLICY "service_audit_logs" ON audit_logs
    FOR ALL TO service_role
    USING (true) WITH CHECK (true);

-- ============================================================
-- Verification
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE 'Migration 004 complete: RLS policies created';
    RAISE NOTICE 'All tables now have multi-tenant data isolation';
END $$;
