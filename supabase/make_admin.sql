-- Script to make a student an admin/finsec/class_rep
-- Replace 'YOUR_REG_NUMBER' with your actual registration number

-- Step 1: Find your student ID (check this first)
SELECT id, reg_number, full_name FROM students WHERE reg_number = 'YOUR_REG_NUMBER';

-- ============================================
-- OPTION 1: Make someone an ADMIN (Full Access)
-- ============================================
INSERT INTO admins (
  student_id, 
  role, 
  can_create_payments, 
  can_approve_payments, 
  can_manage_students, 
  can_view_analytics
)
SELECT 
  id,
  'admin',
  true,  -- can create payments
  true,  -- can approve payments
  true,  -- can manage students
  true   -- can view analytics
FROM students 
WHERE reg_number = 'YOUR_REG_NUMBER'
ON CONFLICT DO NOTHING;

-- ============================================
-- OPTION 2: Make someone a FINANCIAL SECRETARY
-- ============================================
/*
INSERT INTO admins (student_id, role, can_create_payments, can_approve_payments, can_manage_students, can_view_analytics)
SELECT id, 'finsec', true, true, false, true
FROM students WHERE reg_number = 'YOUR_REG_NUMBER'
ON CONFLICT DO NOTHING;
*/

-- ============================================
-- OPTION 3: Make someone a CLASS REP
-- ============================================
/*
INSERT INTO admins (student_id, role, can_create_payments, can_approve_payments, can_manage_students, can_view_analytics)
SELECT id, 'class_rep', true, true, true, true
FROM students WHERE reg_number = 'YOUR_REG_NUMBER'
ON CONFLICT DO NOTHING;
*/

-- ============================================
-- OPTION 4: Make someone an EVENT COORDINATOR
-- ============================================
/*
INSERT INTO admins (student_id, role, can_create_payments, can_approve_payments, can_manage_students, can_view_analytics)
SELECT id, 'event_coordinator', true, true, false, true
FROM students WHERE reg_number = 'YOUR_REG_NUMBER'
ON CONFLICT DO NOTHING;
*/

-- ============================================
-- VERIFY: Check if admin role was assigned
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
JOIN admins a ON s.id = a.student_id
WHERE s.reg_number = 'YOUR_REG_NUMBER';

-- ============================================
-- ASSIGN MULTIPLE PEOPLE AS ADMINS (Bulk)
-- ============================================
/*
INSERT INTO admins (student_id, role, can_create_payments, can_approve_payments, can_manage_students, can_view_analytics)
SELECT id, 'finsec', true, true, false, true
FROM students 
WHERE reg_number IN ('CS/2021/001', 'CS/2021/002', 'CS/2021/003')
ON CONFLICT DO NOTHING;
*/

-- ============================================
-- REMOVE ADMIN ROLE
-- ============================================
/*
DELETE FROM admins 
WHERE student_id IN (
  SELECT id FROM students WHERE reg_number = 'YOUR_REG_NUMBER'
);
*/
