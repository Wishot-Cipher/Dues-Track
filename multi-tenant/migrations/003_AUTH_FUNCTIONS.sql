-- ============================================================
-- AUTHENTICATION FUNCTIONS
-- Required for login to work
-- Run this after TEST_ACCOUNTS.sql
-- ============================================================

-- Enable pgcrypto for password hashing
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ============================================================
-- Login verification function
-- This is called by the frontend authService
-- ============================================================

CREATE OR REPLACE FUNCTION verify_student_login(
    p_reg_number TEXT,
    p_password TEXT
)
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    department_id UUID,
    reg_number TEXT,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    level TEXT,
    section TEXT,
    force_password_change BOOLEAN,
    is_active BOOLEAN,
    is_suspended BOOLEAN,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student RECORD;
BEGIN
    -- Find student by reg number
    SELECT s.* INTO v_student
    FROM students s
    WHERE LOWER(s.reg_number) = LOWER(p_reg_number)
    AND s.is_active = true
    LIMIT 1;
    
    -- Check if student exists
    IF v_student IS NULL THEN
        RETURN;  -- Return empty result
    END IF;
    
    -- Check password
    -- For 'default_hash', accept reg_number as password
    IF v_student.password_hash = 'default_hash' THEN
        IF LOWER(p_password) = LOWER(p_reg_number) OR p_password = 'TEMP2024' THEN
            -- Valid default password
            RETURN QUERY SELECT 
                v_student.id,
                v_student.organization_id,
                v_student.department_id,
                v_student.reg_number,
                v_student.full_name,
                v_student.email,
                v_student.phone,
                v_student.level,
                v_student.section,
                v_student.force_password_change,
                v_student.is_active,
                v_student.is_suspended,
                v_student.created_at;
            
            -- Update last login
            UPDATE students SET last_login_at = NOW() WHERE students.id = v_student.id;
            RETURN;
        END IF;
    ELSE
        -- Check hashed password using pgcrypto
        IF v_student.password_hash = crypt(p_password, v_student.password_hash) THEN
            RETURN QUERY SELECT 
                v_student.id,
                v_student.organization_id,
                v_student.department_id,
                v_student.reg_number,
                v_student.full_name,
                v_student.email,
                v_student.phone,
                v_student.level,
                v_student.section,
                v_student.force_password_change,
                v_student.is_active,
                v_student.is_suspended,
                v_student.created_at;
            
            -- Update last login
            UPDATE students SET last_login_at = NOW() WHERE students.id = v_student.id;
            RETURN;
        END IF;
    END IF;
    
    -- Password didn't match
    RETURN;
END;
$$;

-- ============================================================
-- Get student with admin permissions
-- ============================================================

CREATE OR REPLACE FUNCTION get_student_with_permissions(p_student_id UUID)
RETURNS TABLE (
    id UUID,
    organization_id UUID,
    department_id UUID,
    reg_number TEXT,
    full_name TEXT,
    email TEXT,
    phone TEXT,
    level TEXT,
    section TEXT,
    force_password_change BOOLEAN,
    is_active BOOLEAN,
    is_suspended BOOLEAN,
    admin_id UUID,
    admin_role TEXT,
    can_create_payments BOOLEAN,
    can_approve_payments BOOLEAN,
    can_manage_students BOOLEAN,
    can_manage_admins BOOLEAN,
    can_manage_expenses BOOLEAN,
    can_view_analytics BOOLEAN,
    can_export_data BOOLEAN,
    can_manage_settings BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        s.id,
        s.organization_id,
        s.department_id,
        s.reg_number,
        s.full_name,
        s.email,
        s.phone,
        s.level,
        s.section,
        s.force_password_change,
        s.is_active,
        s.is_suspended,
        a.id as admin_id,
        a.role as admin_role,
        COALESCE(a.can_create_payments, false),
        COALESCE(a.can_approve_payments, false),
        COALESCE(a.can_manage_students, false),
        COALESCE(a.can_manage_admins, false),
        COALESCE(a.can_manage_expenses, false),
        COALESCE(a.can_view_analytics, false),
        COALESCE(a.can_export_data, false),
        COALESCE(a.can_manage_settings, false)
    FROM students s
    LEFT JOIN admins a ON a.student_id = s.id AND a.is_active = true
    WHERE s.id = p_student_id;
END;
$$;

-- ============================================================
-- Change password function
-- ============================================================

CREATE OR REPLACE FUNCTION change_student_password(
    p_student_id UUID,
    p_current_password TEXT,
    p_new_password TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_student RECORD;
    v_password_valid BOOLEAN := false;
BEGIN
    -- Get student
    SELECT * INTO v_student FROM students WHERE id = p_student_id;
    
    IF v_student IS NULL THEN
        RETURN false;
    END IF;
    
    -- Verify current password
    IF v_student.password_hash = 'default_hash' THEN
        IF LOWER(p_current_password) = LOWER(v_student.reg_number) OR p_current_password = 'TEMP2024' THEN
            v_password_valid := true;
        END IF;
    ELSE
        IF v_student.password_hash = crypt(p_current_password, v_student.password_hash) THEN
            v_password_valid := true;
        END IF;
    END IF;
    
    IF NOT v_password_valid THEN
        RETURN false;
    END IF;
    
    -- Update password
    UPDATE students 
    SET 
        password_hash = crypt(p_new_password, gen_salt('bf')),
        force_password_change = false,
        updated_at = NOW()
    WHERE id = p_student_id;
    
    RETURN true;
END;
$$;

-- ============================================================
-- Grant permissions
-- ============================================================

GRANT EXECUTE ON FUNCTION verify_student_login TO anon, authenticated;
GRANT EXECUTE ON FUNCTION get_student_with_permissions TO anon, authenticated;
GRANT EXECUTE ON FUNCTION change_student_password TO authenticated;

-- ============================================================
-- Verification
-- ============================================================

DO $$
BEGIN
    RAISE NOTICE '✅ Authentication functions created!';
    RAISE NOTICE '';
    RAISE NOTICE 'You can now login with:';
    RAISE NOTICE '  Reg Number: 2020/TEST/001';
    RAISE NOTICE '  Password: 2020/TEST/001';
END $$;
