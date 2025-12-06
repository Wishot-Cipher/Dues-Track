-- ============================================
-- ADMIN ROLE MANAGEMENT FUNCTIONS
-- These functions run with SECURITY DEFINER to bypass RLS
-- ============================================

-- Function to remove an admin role
CREATE OR REPLACE FUNCTION remove_admin_role(
  p_admin_id UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM admins WHERE id = p_admin_id;
  RETURN FOUND;
END;
$$;

-- Function to add an admin role
CREATE OR REPLACE FUNCTION add_admin_role(
  p_student_id UUID,
  p_role TEXT,
  p_can_create_payments BOOLEAN DEFAULT false,
  p_can_approve_payments BOOLEAN DEFAULT false,
  p_can_manage_students BOOLEAN DEFAULT false,
  p_can_view_analytics BOOLEAN DEFAULT false
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  INSERT INTO admins (
    student_id,
    role,
    permissions,
    can_create_payments,
    can_approve_payments,
    can_manage_students,
    can_view_analytics
  ) VALUES (
    p_student_id,
    p_role,
    '[]'::jsonb,
    p_can_create_payments,
    p_can_approve_payments,
    p_can_manage_students,
    p_can_view_analytics
  )
  RETURNING id INTO v_admin_id;
  
  RETURN v_admin_id;
END;
$$;

-- Function to check if a student has a specific role
CREATE OR REPLACE FUNCTION has_admin_role(
  p_student_id UUID,
  p_role TEXT
)
RETURNS TABLE(admin_id UUID)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT id FROM admins 
  WHERE student_id = p_student_id AND role = p_role
  LIMIT 1;
END;
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION remove_admin_role(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION add_admin_role(UUID, TEXT, BOOLEAN, BOOLEAN, BOOLEAN, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION has_admin_role(UUID, TEXT) TO authenticated;
