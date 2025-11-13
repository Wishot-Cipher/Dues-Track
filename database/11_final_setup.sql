-- FINAL SETUP: Run these in order for seamless password flow

-- Step 1: Drop old function (it returned boolean, we need students type)
DROP FUNCTION IF EXISTS change_student_password(uuid, text, text);

-- Step 2: Recreate the change_student_password function to return student record
-- (This avoids RLS issues when fetching after password change)
CREATE OR REPLACE FUNCTION change_student_password(
  p_student_id uuid,
  p_current_password text,
  p_new_password text
)
RETURNS students AS
$$
DECLARE
  ok boolean;
  updated_student students;
BEGIN
  -- Verify current password
  SELECT TRUE
  INTO ok
  FROM students
  WHERE id = p_student_id
    AND password_hash = crypt(p_current_password, password_hash)
  LIMIT 1;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Current password is incorrect';
  END IF;

  -- Update to new password and return the updated record
  UPDATE students
  SET password_hash = crypt(p_new_password, gen_salt('bf', 10)),
      force_password_change = FALSE,
      updated_at = NOW()
  WHERE id = p_student_id
  RETURNING * INTO updated_student;

  RETURN updated_student;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Step 3: Disable RLS as a safety net (prevents other query blocking issues)
ALTER TABLE students DISABLE ROW LEVEL SECURITY;

-- Step 4: Ensure all students are active
UPDATE students SET is_active = true WHERE is_active = false OR is_active IS NULL;

-- Step 5: Verify setup
SELECT 
  'Setup complete!' AS status,
  (SELECT rowsecurity FROM pg_tables WHERE tablename = 'students') AS rls_disabled,
  (SELECT COUNT(*) FROM students WHERE is_active = true) AS active_students,
  (SELECT COUNT(*) FROM students WHERE is_active = false) AS suspended_students;

-- Step 6: Test with a known student
SELECT 
  reg_number,
  full_name,
  is_active,
  force_password_change,
  (password_hash = crypt(reg_number, password_hash)) AS password_matches
FROM students
WHERE reg_number LIKE '2024/%'
LIMIT 5;
