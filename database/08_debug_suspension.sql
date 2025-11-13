-- DEBUG: Password Change Suspension Issue

-- 1) Check current state of a specific student
SELECT 
  id,
  reg_number,
  full_name,
  is_active,
  force_password_change,
  password_hash IS NOT NULL AS has_password,
  last_login,
  updated_at
FROM students
WHERE reg_number = '2024/274804'; -- Replace with your test user

-- 2) Check if password change inadvertently sets is_active to false
-- Let's trace what the RPC does
-- Manually simulate password change to see if is_active changes
BEGIN;
  -- Show before
  SELECT id, reg_number, is_active, force_password_change FROM students WHERE reg_number = '2024/274804';
  
  -- Simulate RPC update (don't actually run this, just check the function)
  -- The change_student_password function ONLY updates: password_hash, force_password_change, updated_at
  -- It should NOT touch is_active
  
  -- Show what the function would update
  SELECT 
    'Would update these fields:' AS info,
    'password_hash' AS field1,
    'force_password_change = FALSE' AS field2,
    'updated_at = NOW()' AS field3,
    'is_active should NOT change' AS field4;
ROLLBACK;

-- 3) Verify the RPC function doesn't touch is_active
-- Check the function source
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'change_student_password';

-- 4) THEORY: Maybe the issue is in the verify_student_login function
-- Let's check if it has a WHERE clause that filters by is_active
SELECT routine_name, routine_definition
FROM information_schema.routines
WHERE routine_name = 'verify_student_login';

-- 5) If a student appears suspended after password change, fix them:
UPDATE students
SET is_active = true,
    force_password_change = false
WHERE reg_number = '2024/274804'
  AND is_active = false;

-- 6) Bulk fix: Ensure ALL students are active
UPDATE students
SET is_active = true
WHERE is_active = false OR is_active IS NULL;

-- 7) Verify all are active now
SELECT 
  COUNT(*) FILTER (WHERE is_active = true) AS active_count,
  COUNT(*) FILTER (WHERE is_active = false) AS suspended_count,
  COUNT(*) FILTER (WHERE is_active IS NULL) AS null_count,
  COUNT(*) AS total
FROM students;
