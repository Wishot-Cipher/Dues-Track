-- Function to allow students to update their own profile
-- This bypasses RLS since we use custom authentication (not Supabase Auth)

CREATE OR REPLACE FUNCTION update_student_profile(
  p_student_id UUID,
  p_full_name TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_section TEXT DEFAULT NULL
)
RETURNS SETOF students
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Update the student's profile
  UPDATE students
  SET
    full_name = COALESCE(p_full_name, full_name),
    email = COALESCE(p_email, email),
    phone = COALESCE(p_phone, phone),
    section = COALESCE(p_section, section),
    updated_at = NOW()
  WHERE id = p_student_id
    AND is_active = true; -- Only allow active students to update

  -- Return the updated student record
  RETURN QUERY
  SELECT *
  FROM students
  WHERE id = p_student_id;
END;
$$;

-- Grant execute permission to anon and authenticated roles
GRANT EXECUTE ON FUNCTION update_student_profile TO anon;
GRANT EXECUTE ON FUNCTION update_student_profile TO authenticated;

COMMENT ON FUNCTION update_student_profile IS 'Allows students to update their own profile fields (full_name, email, phone, section). Uses SECURITY DEFINER to bypass RLS.';
