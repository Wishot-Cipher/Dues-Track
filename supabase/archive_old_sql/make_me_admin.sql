-- ============================================
-- QUICK ADMIN SETUP
-- ============================================
-- This script will make a student an admin
-- Replace 'YOUR_REG_NUMBER' with your actual registration number

-- First, let's see all students
SELECT id, reg_number, full_name, level FROM students;

-- ============================================
-- FIRST: Add unique constraint to admins table (if not exists)
-- ============================================
-- This prevents duplicate admin entries for the same student/role
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'admins_student_role_unique'
  ) THEN
    ALTER TABLE admins ADD CONSTRAINT admins_student_role_unique UNIQUE (student_id, role);
  END IF;
END $$;

-- ============================================
-- SECOND: Remove any duplicate admin entries
-- ============================================
-- Keep only the first entry for each student_id/role combination
DELETE FROM admins a1
USING admins a2
WHERE a1.id > a2.id 
  AND a1.student_id = a2.student_id 
  AND a1.role = a2.role;

-- ============================================
-- OPTION 1: Make yourself ADMIN (Full Access)
-- ============================================
-- Replace 'YOUR_REG_NUMBER' with your actual reg number
INSERT INTO admins (student_id, role, can_create_payments, can_approve_payments, can_manage_students, can_view_analytics)
SELECT id, 'admin', true, true, true, true
FROM students 
WHERE reg_number = '2024/274872'  -- ← CHANGE THIS!
ON CONFLICT (student_id, role) DO UPDATE
SET 
  can_create_payments = true,
  can_approve_payments = true,
  can_manage_students = true,
  can_view_analytics = true;

-- ============================================
-- VERIFY: Check your admin status
-- ============================================
SELECT 
  s.reg_number,
  s.full_name,
  a.role,
  a.can_create_payments,
  a.can_approve_payments,
  a.can_manage_students,
  a.can_view_analytics
FROM students s
LEFT JOIN admins a ON s.id = a.student_id
WHERE s.reg_number = '2024/274872';  -- ← CHANGE THIS!

-- ============================================
-- TEST: Login with roles
-- ============================================
-- Test if the login function returns your admin role
SELECT * FROM verify_student_login('2024/274872', 'Wisdom123');  -- ← CHANGE THIS!

-- ============================================
-- IMPORTANT: After running this
-- ============================================
-- 1. Clear your browser's localStorage:
--    - Open DevTools (F12)
--    - Console tab
--    - Run: localStorage.clear()
-- 2. Refresh the page
-- 3. Login again
-- 4. You should now see the floating + button as an admin!
