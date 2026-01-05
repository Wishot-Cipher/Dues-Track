-- ============================================================
-- TEST ACCOUNT SETUP
-- Run this after COMPLETE_SETUP.sql
-- ============================================================

-- Get the org and dept IDs
DO $$
DECLARE
    v_org_id UUID;
    v_dept_id UUID;
    v_student_id UUID;
    v_admin_id UUID;
BEGIN
    -- Get FUTO org ID
    SELECT id INTO v_org_id FROM organizations WHERE slug = 'futo';
    
    -- Get ECE dept ID
    SELECT id INTO v_dept_id FROM departments 
    WHERE organization_id = v_org_id AND short_name = 'ECE';
    
    RAISE NOTICE 'Organization ID: %', v_org_id;
    RAISE NOTICE 'Department ID: %', v_dept_id;
    
    -- Create test admin student
    INSERT INTO students (
        id,
        organization_id,
        department_id,
        full_name,
        reg_number,
        email,
        phone,
        level,
        section,
        password_hash,
        force_password_change,
        is_active
    ) VALUES (
        gen_random_uuid(),
        v_org_id,
        v_dept_id,
        'Test Admin User',
        '2020/TEST/001',
        'testadmin@example.com',
        '08012345678',
        '300L',
        'A',
        'default_hash',  -- Will use reg number as password
        false,
        true
    )
    ON CONFLICT (organization_id, reg_number) DO NOTHING
    RETURNING id INTO v_student_id;
    
    -- If student already exists, get their ID
    IF v_student_id IS NULL THEN
        SELECT id INTO v_student_id FROM students 
        WHERE organization_id = v_org_id AND reg_number = '2020/TEST/001';
    END IF;
    
    RAISE NOTICE 'Test Student ID: %', v_student_id;
    
    -- Make them an admin with full permissions
    INSERT INTO admins (
        student_id,
        organization_id,
        department_id,
        role,
        can_create_payments,
        can_approve_payments,
        can_manage_students,
        can_manage_admins,
        can_manage_expenses,
        can_view_analytics,
        can_export_data,
        can_manage_settings,
        is_active
    ) VALUES (
        v_student_id,
        v_org_id,
        v_dept_id,
        'dept_admin',
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true,
        true
    )
    ON CONFLICT DO NOTHING
    RETURNING id INTO v_admin_id;
    
    RAISE NOTICE 'Admin ID: %', v_admin_id;
    
    -- Create a regular test student
    INSERT INTO students (
        organization_id,
        department_id,
        full_name,
        reg_number,
        email,
        level,
        section,
        password_hash,
        force_password_change,
        is_active
    ) VALUES (
        v_org_id,
        v_dept_id,
        'Regular Student',
        '2020/TEST/002',
        'student@example.com',
        '200L',
        'B',
        'default_hash',
        false,
        true
    )
    ON CONFLICT (organization_id, reg_number) DO NOTHING;
    
    -- Create a test payment type
    INSERT INTO payment_types (
        organization_id,
        department_id,
        title,
        description,
        category,
        amount,
        allow_partial,
        target_levels,
        is_mandatory,
        deadline,
        bank_name,
        account_name,
        account_number,
        icon,
        color,
        is_active
    ) VALUES (
        v_org_id,
        v_dept_id,
        'First Semester Dues 2025/2026',
        'Departmental dues for first semester',
        'semester_dues',
        5000.00,
        true,
        ARRAY['200L', '300L', '400L', '500L'],
        true,
        NOW() + INTERVAL '30 days',
        'First Bank',
        'ECE Student Association',
        '1234567890',
        '💰',
        '#FF6B35',
        true
    )
    ON CONFLICT DO NOTHING;
    
    INSERT INTO payment_types (
        organization_id,
        department_id,
        title,
        description,
        category,
        amount,
        allow_partial,
        target_levels,
        is_mandatory,
        deadline,
        bank_name,
        account_name,
        account_number,
        icon,
        color,
        is_active
    ) VALUES (
        v_org_id,
        v_dept_id,
        'Departmental T-Shirt',
        'Official ECE department t-shirt',
        'custom',
        3500.00,
        false,
        NULL,  -- All levels
        false,
        NOW() + INTERVAL '60 days',
        'First Bank',
        'ECE Student Association',
        '1234567890',
        '👕',
        '#3B82F6',
        true
    )
    ON CONFLICT DO NOTHING;
    
    RAISE NOTICE '✅ Test accounts created successfully!';
    RAISE NOTICE '';
    RAISE NOTICE '🔑 LOGIN CREDENTIALS:';
    RAISE NOTICE '   Admin Account:';
    RAISE NOTICE '   - Reg Number: 2020/TEST/001';
    RAISE NOTICE '   - Password: 2020/TEST/001';
    RAISE NOTICE '';
    RAISE NOTICE '   Student Account:';
    RAISE NOTICE '   - Reg Number: 2020/TEST/002';
    RAISE NOTICE '   - Password: 2020/TEST/002';
    
END $$;

-- Verify the data
SELECT 'Organizations' as table_name, COUNT(*) as count FROM organizations
UNION ALL
SELECT 'Departments', COUNT(*) FROM departments
UNION ALL
SELECT 'Students', COUNT(*) FROM students
UNION ALL
SELECT 'Admins', COUNT(*) FROM admins
UNION ALL
SELECT 'Payment Types', COUNT(*) FROM payment_types
UNION ALL
SELECT 'Expense Categories', COUNT(*) FROM expense_categories;
