-- ============================================
-- CLEAN UP DUPLICATE ADMIN RECORDS
-- ============================================

-- Step 1: See all admin records for your student
SELECT 
  a.id,
  a.student_id,
  a.role,
  a.created_at,
  s.reg_number,
  s.full_name
FROM admins a
JOIN students s ON a.student_id = s.id
WHERE s.reg_number = '2024/274872'
ORDER BY a.created_at;

-- Step 2: Delete duplicate admin records (keep only the first one per student)
-- This keeps the oldest record for each student_id and deletes newer duplicates
DELETE FROM admins a1
USING admins a2
WHERE a1.id > a2.id 
  AND a1.student_id = a2.student_id
  AND a1.role = a2.role;

-- Step 3: Verify - should now have only 1 admin record
SELECT 
  a.id,
  a.student_id,
  a.role,
  a.created_at,
  s.reg_number,
  s.full_name
FROM admins a
JOIN students s ON a.student_id = s.id
WHERE s.reg_number = '2024/274872';

-- Step 4: Add unique constraint to prevent future duplicates
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
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Duplicate admin records cleaned up!';
  RAISE NOTICE '';
  RAISE NOTICE '🎯 The app should now work without errors!';
  RAISE NOTICE '   Try creating a payment type again.';
END $$;
