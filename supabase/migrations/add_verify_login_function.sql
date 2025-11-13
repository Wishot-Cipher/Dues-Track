-- Migration: Add verify_student_login function with roles support
-- Run this in your Supabase SQL editor

-- Function to verify student login and return student data with roles
CREATE OR REPLACE FUNCTION verify_student_login(
  p_reg_number VARCHAR,
  p_password VARCHAR
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
  roles TEXT[]
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    s.id,
    s.reg_number,
    s.full_name,
    s.email,
    s.phone,
    s.section,
    s.department,
    s.level,
    s.force_password_change,
    s.is_active,
    s.created_at,
    s.updated_at,
    COALESCE(array_agg(a.role) FILTER (WHERE a.role IS NOT NULL), ARRAY[]::TEXT[]) as roles
  FROM students s
  LEFT JOIN admins a ON s.id = a.student_id
  WHERE s.reg_number = p_reg_number
    AND (
      -- Check if password matches using pgcrypto
      s.password_hash = crypt(p_password, s.password_hash)
      OR
      -- Fallback for development/testing (remove in production)
      (s.password_hash = 'default_hash' AND (p_password = s.reg_number OR p_password = 'TEMP2024'))
    )
  GROUP BY s.id, s.reg_number, s.full_name, s.email, s.phone, s.section, 
           s.department, s.level, s.force_password_change, s.is_active, 
           s.created_at, s.updated_at;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION verify_student_login(VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_student_login(VARCHAR, VARCHAR) TO anon;
