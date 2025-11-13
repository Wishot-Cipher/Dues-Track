-- ============================================
-- FIX: Remove Duplicate Functions
-- ============================================
-- This script removes all versions of the functions and recreates them correctly

-- Drop all versions of verify_student_login
DROP FUNCTION IF EXISTS verify_student_login(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS verify_student_login(TEXT, TEXT);
DROP FUNCTION IF EXISTS verify_student_login(p_reg_number VARCHAR, p_password VARCHAR);
DROP FUNCTION IF EXISTS verify_student_login(p_reg_number TEXT, p_password TEXT);

-- Drop all versions of change_student_password
DROP FUNCTION IF EXISTS change_student_password(UUID, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS change_student_password(UUID, TEXT, TEXT);
DROP FUNCTION IF EXISTS change_student_password(p_student_id UUID, p_current_password VARCHAR, p_new_password VARCHAR);
DROP FUNCTION IF EXISTS change_student_password(p_student_id UUID, p_current_password TEXT, p_new_password TEXT);

-- ============================================
-- RECREATE: Verify Student Login with Roles
-- ============================================
CREATE OR REPLACE FUNCTION verify_student_login(
  p_reg_number TEXT,
  p_password TEXT
) RETURNS TABLE (
  id UUID,
  reg_number VARCHAR,
  full_name VARCHAR,
  email VARCHAR,
  phone VARCHAR,
  section VARCHAR,
  department VARCHAR,
  level VARCHAR,
  force_password_change BOOLEAN,
  is_active BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE,
  roles VARCHAR[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id, s.reg_number, s.full_name, s.email, s.phone, s.section,
    s.department, s.level, s.force_password_change, s.is_active,
    s.created_at, s.updated_at,
    COALESCE(array_agg(a.role) FILTER (WHERE a.role IS NOT NULL), ARRAY[]::VARCHAR[]) as roles
  FROM students s
  LEFT JOIN admins a ON s.id = a.student_id
  WHERE s.reg_number = p_reg_number
    AND (
      s.password_hash = crypt(p_password, s.password_hash)
      OR (s.password_hash = 'default_hash' AND (p_password = s.reg_number OR p_password = 'TEMP2024'))
    )
  GROUP BY s.id, s.reg_number, s.full_name, s.email, s.phone, s.section,
           s.department, s.level, s.force_password_change, s.is_active,
           s.created_at, s.updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION verify_student_login(TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_student_login(TEXT, TEXT) TO anon;

-- ============================================
-- RECREATE: Change Student Password
-- ============================================
CREATE OR REPLACE FUNCTION change_student_password(
  p_student_id UUID,
  p_current_password TEXT,
  p_new_password TEXT
) RETURNS TABLE (
  id UUID,
  reg_number VARCHAR,
  full_name VARCHAR,
  email VARCHAR,
  phone VARCHAR,
  section VARCHAR,
  department VARCHAR,
  level VARCHAR,
  force_password_change BOOLEAN,
  is_active BOOLEAN,
  created_at TIMESTAMP WITH TIME ZONE,
  updated_at TIMESTAMP WITH TIME ZONE
) AS $$
BEGIN
  -- Verify current password
  IF NOT EXISTS (
    SELECT 1 FROM students s
    WHERE s.id = p_student_id
      AND (
        s.password_hash = crypt(p_current_password, s.password_hash)
        OR (s.password_hash = 'default_hash' AND p_current_password = s.reg_number)
      )
  ) THEN
    RAISE EXCEPTION 'Current password is incorrect';
  END IF;

  -- Update password and remove force_password_change flag
  UPDATE students
  SET 
    password_hash = crypt(p_new_password, gen_salt('bf')),
    force_password_change = false,
    updated_at = NOW()
  WHERE students.id = p_student_id;

  -- Return updated student data
  RETURN QUERY
  SELECT s.id, s.reg_number, s.full_name, s.email, s.phone, s.section,
         s.department, s.level, s.force_password_change, s.is_active,
         s.created_at, s.updated_at
  FROM students s
  WHERE s.id = p_student_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant permissions
GRANT EXECUTE ON FUNCTION change_student_password(UUID, TEXT, TEXT) TO authenticated;

-- ============================================
-- VERIFICATION
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Functions recreated successfully!';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Verify the functions exist:';
  RAISE NOTICE '   Run: SELECT * FROM verify_student_login(''CS/2021/001'', ''CS/2021/001'');';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 You should now be able to login!';
END $$;
