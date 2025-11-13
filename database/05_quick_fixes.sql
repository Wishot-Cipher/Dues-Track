-- QUICK FIXES: Run these in Supabase SQL Editor to fix common issues

-- Fix 1: Activate ALL suspended accounts (if you want everyone active)
UPDATE students
SET is_active = true
WHERE is_active = false;

-- Fix 2: Ensure all students have valid password hashes
-- For matric students (reg_number contains '/'), set password = reg_number
UPDATE students
SET password_hash = crypt(reg_number, gen_salt('bf', 10))
WHERE reg_number LIKE '%/%'
  AND (password_hash IS NULL OR password_hash = '');

-- For non-matric/temp students, set password = 'TEMP2024'
UPDATE students
SET password_hash = crypt('TEMP2024', gen_salt('bf', 10))
WHERE reg_number NOT LIKE '%/%'
  AND (password_hash IS NULL OR password_hash = '');

-- Fix 3: Activate a specific student by reg number
-- UPDATE students
-- SET is_active = true
-- WHERE reg_number = '2024/274804';

-- Fix 4: Reset a specific student's password to their reg_number
-- UPDATE students
-- SET password_hash = crypt(reg_number, gen_salt('bf', 10)),
--     force_password_change = true
-- WHERE reg_number = '2024/274804';

-- Fix 5: Verify the fix worked - check a few students
SELECT 
  reg_number,
  full_name,
  is_active,
  force_password_change,
  password_hash IS NOT NULL AS has_password,
  substring(password_hash, 1, 10) AS hash_preview
FROM students
ORDER BY reg_number
LIMIT 10;

-- Fix 6: Test login verification for a specific student
-- Replace '2024/274804' with the reg_number you're testing
SELECT 
  reg_number,
  full_name,
  is_active,
  -- Test if the RPC would work
  (SELECT (verify_student_login('2024/274804', '2024/274804')).id IS NOT NULL) AS login_would_work,
  -- Test password hash directly
  (password_hash = crypt('2024/274804', password_hash)) AS password_matches,
  -- Show hash info
  password_hash IS NOT NULL AS has_hash,
  length(password_hash) AS hash_len
FROM students
WHERE reg_number = '2024/274804';

-- Fix 7: If password doesn't match, regenerate the hash
-- UPDATE students
-- SET password_hash = crypt(reg_number, gen_salt('bf', 10)),
--     force_password_change = true
-- WHERE reg_number = '2024/274804';
