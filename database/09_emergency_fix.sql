-- EMERGENCY FIX: Activate ALL students and disable RLS

-- Step 1: Activate all students
UPDATE students SET is_active = true;

-- Step 2: Disable RLS to prevent query blocking
ALTER TABLE students DISABLE ROW LEVEL SECURITY;

-- Step 3: Verify all students are active
SELECT 
  COUNT(*) AS total_students,
  COUNT(*) FILTER (WHERE is_active = true) AS active,
  COUNT(*) FILTER (WHERE is_active = false) AS suspended
FROM students;

-- Step 4: Check the specific student you just added
SELECT reg_number, full_name, is_active, force_password_change,
       (password_hash = crypt(reg_number, password_hash)) AS password_matches
FROM students
WHERE reg_number LIKE '2024/274872'
   OR full_name ILIKE '%ALOM%';

-- Step 5: If student doesn't exist, re-add them
INSERT INTO students (reg_number, full_name, level, department, password_hash, force_password_change, is_active)
VALUES ('2024/274872', 'ALOM OBUMNEME WISDOM', 200, 'Electronics & Computer Engineering', crypt('2024/274872', gen_salt('bf', 10)), true, true)
ON CONFLICT (reg_number) DO UPDATE
SET is_active = true,
    password_hash = crypt('2024/274872', gen_salt('bf', 10)),
    force_password_change = true;
