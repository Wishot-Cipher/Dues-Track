-- DEBUG: Test password verification for student 2024/274872

-- 1) Check current state
SELECT 
  reg_number,
  full_name,
  is_active,
  force_password_change,
  password_hash IS NOT NULL AS has_password,
  substring(password_hash, 1, 10) AS hash_preview,
  created_at,
  updated_at
FROM students
WHERE reg_number = '2024/274872';

-- 2) Test if OLD password (reg_number) works
SELECT 
  'Testing OLD password (2024/274872):' AS test,
  (password_hash = crypt('2024/274872', password_hash)) AS old_password_works
FROM students
WHERE reg_number = '2024/274872';

-- 3) Test if a NEW password works (if you changed it)
-- Replace 'MyNewPass123!' with whatever new password you set
SELECT 
  'Testing NEW password (MyNewPass123!):' AS test,
  (password_hash = crypt('MyNewPass123!', password_hash)) AS new_password_works
FROM students
WHERE reg_number = '2024/274872';

-- 4) Test the RPC directly with OLD password
SELECT (verify_student_login('2024/274872', '2024/274872')).* ;

-- 5) Test the RPC directly with NEW password (if applicable)
-- SELECT (verify_student_login('2024/274872', 'MyNewPass123!')).* ;

-- 6) If nothing works, RESET the password to the reg_number
UPDATE students
SET password_hash = crypt('2024/274872', gen_salt('bf', 10)),
    force_password_change = true
WHERE reg_number = '2024/274872'
RETURNING reg_number, full_name, 
  (password_hash = crypt('2024/274872', password_hash)) AS password_now_matches;
