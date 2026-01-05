-- ============================================
-- STUDENT MANAGEMENT FUNCTIONS
-- These functions run with SECURITY DEFINER to bypass RLS
-- Only admins and class_reps can use these (not finsec)
-- ============================================

-- ============================================
-- 1. UPDATE STUDENT (Admin Only)
-- ============================================
CREATE OR REPLACE FUNCTION admin_update_student(
  p_student_id UUID,
  p_full_name TEXT DEFAULT NULL,
  p_reg_number TEXT DEFAULT NULL,
  p_email TEXT DEFAULT NULL,
  p_phone TEXT DEFAULT NULL,
  p_level TEXT DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_section TEXT DEFAULT NULL,
  p_force_password_change BOOLEAN DEFAULT NULL,
  p_is_active BOOLEAN DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL -- The admin performing the action
)
RETURNS TABLE(success BOOLEAN, message TEXT, student_data JSONB)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_record RECORD;
  v_updated_student RECORD;
BEGIN
  -- Check if the caller is an admin or class_rep with can_manage_students permission
  SELECT * INTO v_admin_record FROM admins 
  WHERE student_id = p_admin_id 
    AND (role IN ('admin', 'class_rep') OR can_manage_students = true)
  LIMIT 1;
  
  IF v_admin_record IS NULL THEN
    RETURN QUERY SELECT false, 'Permission denied: You do not have permission to manage students'::TEXT, NULL::JSONB;
    RETURN;
  END IF;
  
  -- Check for duplicate reg_number if being updated
  IF p_reg_number IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM students WHERE reg_number = p_reg_number AND id != p_student_id) THEN
      RETURN QUERY SELECT false, 'Registration number already exists'::TEXT, NULL::JSONB;
      RETURN;
    END IF;
  END IF;
  
  -- Update the student
  UPDATE students
  SET
    full_name = COALESCE(p_full_name, full_name),
    reg_number = COALESCE(p_reg_number, reg_number),
    email = COALESCE(p_email, email),
    phone = COALESCE(p_phone, phone),
    level = COALESCE(p_level, level),
    department = COALESCE(p_department, department),
    section = COALESCE(p_section, section),
    force_password_change = COALESCE(p_force_password_change, force_password_change),
    is_active = COALESCE(p_is_active, is_active),
    updated_at = NOW()
  WHERE id = p_student_id
  RETURNING * INTO v_updated_student;
  
  IF v_updated_student IS NULL THEN
    RETURN QUERY SELECT false, 'Student not found'::TEXT, NULL::JSONB;
    RETURN;
  END IF;
  
  RETURN QUERY SELECT true, 'Student updated successfully'::TEXT, row_to_json(v_updated_student)::JSONB;
END;
$$;

-- ============================================
-- 2. DELETE STUDENT (Admin Only)
-- ============================================
CREATE OR REPLACE FUNCTION admin_delete_student(
  p_student_id UUID,
  p_admin_id UUID -- The admin performing the action
)
RETURNS TABLE(success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_record RECORD;
  v_student_name TEXT;
BEGIN
  -- Check if the caller is an admin or class_rep with can_manage_students permission
  SELECT * INTO v_admin_record FROM admins 
  WHERE student_id = p_admin_id 
    AND (role IN ('admin', 'class_rep') OR can_manage_students = true)
  LIMIT 1;
  
  IF v_admin_record IS NULL THEN
    RETURN QUERY SELECT false, 'Permission denied: You do not have permission to delete students'::TEXT;
    RETURN;
  END IF;
  
  -- Get student name for confirmation message
  SELECT full_name INTO v_student_name FROM students WHERE id = p_student_id;
  
  IF v_student_name IS NULL THEN
    RETURN QUERY SELECT false, 'Student not found'::TEXT;
    RETURN;
  END IF;
  
  -- Delete admin records first (if any)
  DELETE FROM admins WHERE student_id = p_student_id;
  
  -- Delete notifications
  DELETE FROM notifications WHERE recipient_id = p_student_id;
  
  -- Delete payments (or you might want to keep these for records)
  -- DELETE FROM payments WHERE student_id = p_student_id;
  
  -- Finally delete the student
  DELETE FROM students WHERE id = p_student_id;
  
  RETURN QUERY SELECT true, ('Student "' || v_student_name || '" deleted successfully')::TEXT;
END;
$$;

-- ============================================
-- 3. TOGGLE STUDENT STATUS (Admin Only)
-- ============================================
CREATE OR REPLACE FUNCTION admin_toggle_student_status(
  p_student_id UUID,
  p_admin_id UUID -- The admin performing the action
)
RETURNS TABLE(success BOOLEAN, message TEXT, new_status BOOLEAN)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_record RECORD;
  v_current_status BOOLEAN;
  v_student_name TEXT;
BEGIN
  -- Check if the caller is an admin or class_rep with can_manage_students permission
  SELECT * INTO v_admin_record FROM admins 
  WHERE student_id = p_admin_id 
    AND (role IN ('admin', 'class_rep') OR can_manage_students = true)
  LIMIT 1;
  
  IF v_admin_record IS NULL THEN
    RETURN QUERY SELECT false, 'Permission denied: You do not have permission to manage student status'::TEXT, NULL::BOOLEAN;
    RETURN;
  END IF;
  
  -- Get current status
  SELECT is_active, full_name INTO v_current_status, v_student_name 
  FROM students WHERE id = p_student_id;
  
  IF v_student_name IS NULL THEN
    RETURN QUERY SELECT false, 'Student not found'::TEXT, NULL::BOOLEAN;
    RETURN;
  END IF;
  
  -- Toggle the status
  UPDATE students
  SET is_active = NOT v_current_status, updated_at = NOW()
  WHERE id = p_student_id;
  
  IF NOT v_current_status THEN
    RETURN QUERY SELECT true, ('Student "' || v_student_name || '" activated successfully')::TEXT, true;
  ELSE
    RETURN QUERY SELECT true, ('Student "' || v_student_name || '" deactivated successfully')::TEXT, false;
  END IF;
END;
$$;

-- ============================================
-- 4. BULK UPDATE STUDENTS (Admin Only)
-- ============================================
CREATE OR REPLACE FUNCTION admin_bulk_update_students(
  p_student_ids UUID[],
  p_is_active BOOLEAN DEFAULT NULL,
  p_level TEXT DEFAULT NULL,
  p_section TEXT DEFAULT NULL,
  p_admin_id UUID DEFAULT NULL -- The admin performing the action
)
RETURNS TABLE(success BOOLEAN, message TEXT, affected_count INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin_record RECORD;
  v_count INTEGER;
BEGIN
  -- Check if the caller is an admin or class_rep with can_manage_students permission
  SELECT * INTO v_admin_record FROM admins 
  WHERE student_id = p_admin_id 
    AND (role IN ('admin', 'class_rep') OR can_manage_students = true)
  LIMIT 1;
  
  IF v_admin_record IS NULL THEN
    RETURN QUERY SELECT false, 'Permission denied: You do not have permission to manage students'::TEXT, 0;
    RETURN;
  END IF;
  
  -- Update students
  UPDATE students
  SET
    is_active = COALESCE(p_is_active, is_active),
    level = COALESCE(p_level, level),
    section = COALESCE(p_section, section),
    updated_at = NOW()
  WHERE id = ANY(p_student_ids);
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  RETURN QUERY SELECT true, (v_count::TEXT || ' students updated successfully')::TEXT, v_count;
END;
$$;

-- ============================================
-- GRANT PERMISSIONS
-- ============================================
GRANT EXECUTE ON FUNCTION admin_update_student TO authenticated;
GRANT EXECUTE ON FUNCTION admin_delete_student TO authenticated;
GRANT EXECUTE ON FUNCTION admin_toggle_student_status TO authenticated;
GRANT EXECUTE ON FUNCTION admin_bulk_update_students TO authenticated;

-- ============================================
-- COMMENTS
-- ============================================
COMMENT ON FUNCTION admin_update_student IS 'Allows admins and class_reps to update student information. Uses SECURITY DEFINER to bypass RLS.';
COMMENT ON FUNCTION admin_delete_student IS 'Allows admins and class_reps to delete students. Uses SECURITY DEFINER to bypass RLS.';
COMMENT ON FUNCTION admin_toggle_student_status IS 'Allows admins and class_reps to activate/deactivate students. Uses SECURITY DEFINER to bypass RLS.';
COMMENT ON FUNCTION admin_bulk_update_students IS 'Allows admins and class_reps to bulk update students. Uses SECURITY DEFINER to bypass RLS.';
