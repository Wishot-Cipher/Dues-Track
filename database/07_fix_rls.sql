-- CHECK AND FIX RLS (Row Level Security) ISSUES

-- 1) Check if RLS is enabled on students table
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'students';

-- 2) List all RLS policies on students table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'students';

-- 3) TEMPORARY FIX: Disable RLS on students table
-- WARNING: This removes row-level security. Only do this for development/testing.
ALTER TABLE students DISABLE ROW LEVEL SECURITY;

-- 4) Verify RLS is now disabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'students';

-- 5) Test: Can we now fetch a student by ID?
-- Replace with the actual UUID from your error log
SELECT id, reg_number, full_name, is_active
FROM students
WHERE id = '8ea172ad-9e87-4eb2-aa80-1f747fc2e82d';

-- 6) ALTERNATIVE: If you want to keep RLS enabled, create permissive policies
-- (Uncomment if you prefer this over disabling RLS)
/*
-- Drop existing restrictive policies if any
DROP POLICY IF EXISTS students_select_policy ON students;
DROP POLICY IF EXISTS students_update_policy ON students;

-- Create permissive policies that allow all operations
CREATE POLICY students_select_policy ON students
  FOR SELECT
  USING (true);

CREATE POLICY students_update_policy ON students
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY students_insert_policy ON students
  FOR INSERT
  WITH CHECK (true);
*/
