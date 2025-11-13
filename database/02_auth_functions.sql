-- Enable pgcrypto for bcrypt crypt() function
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Secure login verification using bcrypt in Postgres
CREATE OR REPLACE FUNCTION verify_student_login(
  p_reg_number text,
  p_password text
)
RETURNS students AS
$$
  SELECT s.*
  FROM students s
  WHERE s.reg_number = p_reg_number
    AND s.password_hash = crypt(p_password, s.password_hash)
  LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Secure password change (verifies current password first)
-- Returns the updated student record to avoid RLS issues
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

-- Optional: restrict execution with RLS-compatible wrapper policies as needed
