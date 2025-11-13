-- ============================================
-- DEBUG & FIX: Complete Admin Setup Verification
-- ============================================

-- ============================================
-- STEP 1: Check if the student exists
-- ============================================
SELECT 
  id, 
  reg_number, 
  full_name, 
  level,
  is_active
FROM students 
WHERE reg_number = '2024/274872';

-- ============================================
-- STEP 2: Check if admin record exists
-- ============================================
SELECT 
  a.id,
  a.student_id,
  a.role,
  a.can_create_payments,
  a.can_approve_payments,
  s.reg_number,
  s.full_name
FROM admins a
JOIN students s ON a.student_id = s.id
WHERE s.reg_number = '2024/274872';

-- ============================================
-- STEP 3: Test the login function (should return roles)
-- ============================================
SELECT * FROM verify_student_login('2024/274872', 'Wisdom123');

-- ============================================
-- STEP 4: Force create/update admin record
-- ============================================
-- First, remove unique constraint check and just use DELETE
DELETE FROM admins 
WHERE student_id IN (SELECT id FROM students WHERE reg_number = '2024/274872');

-- Now insert fresh admin record
INSERT INTO admins (student_id, role, can_create_payments, can_approve_payments, can_manage_students, can_view_analytics)
SELECT 
  id, 
  'admin', 
  true, 
  true, 
  true, 
  true
FROM students 
WHERE reg_number = '2024/274872';

-- ============================================
-- STEP 5: Verify admin was created
-- ============================================
SELECT 
  a.id as admin_id,
  a.student_id,
  a.role,
  a.can_create_payments,
  a.can_approve_payments,
  a.can_manage_students,
  a.can_view_analytics,
  s.reg_number,
  s.full_name
FROM admins a
JOIN students s ON a.student_id = s.id
WHERE s.reg_number = '2024/274872';

-- ============================================
-- STEP 6: Test login again (should now have roles)
-- ============================================
SELECT 
  id,
  reg_number,
  full_name,
  email,
  roles
FROM verify_student_login('2024/274872', 'Wisdom123');

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Admin setup complete!';
  RAISE NOTICE '';
  RAISE NOTICE '🔑 CRITICAL NEXT STEPS:';
  RAISE NOTICE '1. Open browser DevTools (F12)';
  RAISE NOTICE '2. Go to Console tab';
  RAISE NOTICE '3. Run: localStorage.clear()';
  RAISE NOTICE '4. Refresh the page';
  RAISE NOTICE '5. Login again with: 2024/274872 / Wisdom123';
  RAISE NOTICE '';
  RAISE NOTICE '✨ You should now see the floating + button!';
END $$;
