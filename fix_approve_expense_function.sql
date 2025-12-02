-- Fix approve_expense function to work without Supabase Auth
-- This version takes admin_id as a parameter instead of using auth.uid()

CREATE OR REPLACE FUNCTION approve_expense(
  p_expense_id UUID,
  p_approved BOOLEAN,
  p_admin_id UUID,
  p_reason TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_old_data JSONB;
BEGIN
  -- Store old data for audit
  SELECT row_to_json(expenses.*) INTO v_old_data 
  FROM expenses WHERE id = p_expense_id;
  
  -- Update expense status
  UPDATE expenses SET
    status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    approved_by = p_admin_id,
    approved_at = NOW(),
    rejection_reason = CASE WHEN NOT p_approved THEN p_reason ELSE NULL END,
    updated_at = NOW()
  WHERE id = p_expense_id;
  
  -- Log to audit trail
  INSERT INTO expense_audit_log (
    expense_id,
    action,
    performed_by,
    previous_data,
    new_data,
    reason
  ) VALUES (
    p_expense_id,
    CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    p_admin_id,
    v_old_data,
    (SELECT row_to_json(expenses.*) FROM expenses WHERE id = p_expense_id),
    p_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
