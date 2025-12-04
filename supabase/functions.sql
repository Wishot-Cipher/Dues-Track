-- ============================================
-- DATABASE FUNCTIONS
-- ============================================

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

-- Function to get payment statistics
CREATE OR REPLACE FUNCTION get_payment_stats(p_payment_type_id UUID)
RETURNS TABLE (
  total_students BIGINT,
  paid_count BIGINT,
  pending_count BIGINT,
  unpaid_count BIGINT,
  total_collected DECIMAL,
  total_expected DECIMAL,
  completion_percentage DECIMAL
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(DISTINCT s.id)::BIGINT as total_students,
    COUNT(DISTINCT CASE WHEN p.status = 'approved' THEN p.student_id END)::BIGINT as paid_count,
    COUNT(DISTINCT CASE WHEN p.status = 'pending' THEN p.student_id END)::BIGINT as pending_count,
    COUNT(DISTINCT CASE WHEN p.id IS NULL OR p.status NOT IN ('approved', 'pending', 'partial') THEN s.id END)::BIGINT as unpaid_count,
    COALESCE(SUM(CASE WHEN p.status IN ('approved', 'partial') THEN p.amount_paid ELSE 0 END), 0) as total_collected,
    (SELECT amount FROM payment_types WHERE id = p_payment_type_id) * COUNT(DISTINCT s.id) as total_expected,
    ROUND((COALESCE(SUM(CASE WHEN p.status IN ('approved', 'partial') THEN p.amount_paid ELSE 0 END), 0) / 
           NULLIF((SELECT amount FROM payment_types WHERE id = p_payment_type_id) * COUNT(DISTINCT s.id), 0)) * 100, 2) as completion_percentage
  FROM students s
  LEFT JOIN payments p ON s.id = p.student_id AND p.payment_type_id = p_payment_type_id
  WHERE s.is_active = true;
END;
$$ LANGUAGE plpgsql;

-- Function to check for duplicate receipts (fraud detection)
CREATE OR REPLACE FUNCTION check_duplicate_receipt(p_receipt_url TEXT, p_payment_type_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM payments
    WHERE receipt_url = p_receipt_url
    AND payment_type_id = p_payment_type_id
    AND status IN ('approved', 'pending')
  );
END;
$$ LANGUAGE plpgsql;

-- Function to send notification
CREATE OR REPLACE FUNCTION send_notification(
  p_recipient_id UUID,
  p_title VARCHAR,
  p_message TEXT,
  p_type VARCHAR,
  p_link TEXT DEFAULT NULL
) RETURNS UUID AS $$
DECLARE
  notification_id UUID;
BEGIN
  INSERT INTO notifications (recipient_id, title, message, type, link)
  VALUES (p_recipient_id, p_title, p_message, p_type, p_link)
  RETURNING id INTO notification_id;
  
  RETURN notification_id;
END;
$$ LANGUAGE plpgsql;

-- Trigger to log payment history
CREATE OR REPLACE FUNCTION log_payment_history()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO payment_history (payment_id, action, performed_by, new_status)
    VALUES (NEW.id, 'submitted', NEW.student_id, NEW.status);
  ELSIF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    INSERT INTO payment_history (payment_id, action, performed_by, old_status, new_status)
    VALUES (NEW.id, 'status_changed', NEW.reviewed_by, OLD.status, NEW.status);
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_history_trigger
AFTER INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION log_payment_history();

-- Trigger to notify on payment approval/rejection
CREATE OR REPLACE FUNCTION notify_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM send_notification(
        NEW.student_id,
        'Payment Approved! ✅',
        'Your payment has been approved and confirmed.',
        'payment_approved',
        '/payment/' || NEW.id
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM send_notification(
        NEW.student_id,
        'Payment Rejected ❌',
        'Your payment was rejected. Reason: ' || COALESCE(NEW.rejection_reason, 'Not specified'),
        'payment_rejected',
        '/payment/' || NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER payment_notification_trigger
AFTER UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION notify_payment_status();
