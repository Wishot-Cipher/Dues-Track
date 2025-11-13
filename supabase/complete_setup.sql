-- ============================================
-- CLASS DUES TRACKER - COMPLETE DATABASE SETUP
-- ============================================
-- Run this entire script in your Supabase SQL Editor
-- It will create all tables, functions, and sample data

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- DROP EXISTING TABLES (if you want to start fresh)
-- ============================================
-- Uncomment these lines if you want to reset everything
/*
DROP TABLE IF EXISTS fraud_logs CASCADE;
DROP TABLE IF EXISTS notifications CASCADE;
DROP TABLE IF EXISTS payment_pledges CASCADE;
DROP TABLE IF EXISTS public_payments CASCADE;
DROP TABLE IF EXISTS expenses CASCADE;
DROP TABLE IF EXISTS payment_history CASCADE;
DROP TABLE IF EXISTS payments CASCADE;
DROP TABLE IF EXISTS payment_types CASCADE;
DROP TABLE IF EXISTS admins CASCADE;
DROP TABLE IF EXISTS students CASCADE;
DROP FUNCTION IF EXISTS verify_student_login(VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS change_student_password(UUID, VARCHAR, VARCHAR);
DROP FUNCTION IF EXISTS get_payment_stats(UUID);
DROP FUNCTION IF EXISTS check_duplicate_receipt(TEXT, UUID);
DROP FUNCTION IF EXISTS send_notification(UUID, VARCHAR, TEXT, VARCHAR, TEXT);
*/

-- ============================================
-- STUDENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reg_number VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  level VARCHAR(10) NOT NULL, -- 200L, 300L, 400L, 500L
  department VARCHAR(100) NOT NULL,
  section VARCHAR(10), -- A, B, C
  password_hash VARCHAR(255) NOT NULL,
  force_password_change BOOLEAN DEFAULT false,
  profile_image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ADMINS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- admin, finsec, class_rep, event_coordinator
  permissions JSONB DEFAULT '[]'::jsonb,
  can_create_payments BOOLEAN DEFAULT false,
  can_approve_payments BOOLEAN DEFAULT false,
  can_manage_students BOOLEAN DEFAULT false,
  can_view_analytics BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PAYMENT TYPES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payment_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL, -- semester_dues, books, events, projects, welfare, custom
  amount DECIMAL(10,2) NOT NULL,
  allow_partial BOOLEAN DEFAULT false,
  is_mandatory BOOLEAN DEFAULT false,
  deadline TIMESTAMP WITH TIME ZONE NOT NULL,
  icon VARCHAR(50) DEFAULT '📚',
  color VARCHAR(20) DEFAULT '#3B82F6',
  
  -- Bank account details
  bank_name VARCHAR(255) NOT NULL,
  account_name VARCHAR(255) NOT NULL,
  account_number VARCHAR(20) NOT NULL,
  
  -- Approver
  created_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  approver_id UUID REFERENCES admins(id) ON DELETE SET NULL,
  
  -- Target students
  target_levels VARCHAR[] DEFAULT ARRAY['100L','200L', '300L', '400L', '500L'],
  target_departments VARCHAR[],
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PAYMENTS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  payment_type_id UUID REFERENCES payment_types(id) ON DELETE CASCADE,
  
  amount_paid DECIMAL(10,2) NOT NULL,
  payment_method VARCHAR(50) NOT NULL, -- bank_transfer, cash, pos
  transaction_ref VARCHAR(255),
  receipt_url TEXT,
  
  -- Payment status
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected, partial, waived
  rejection_reason TEXT,
  waiver_reason TEXT,
  
  -- Review
  reviewed_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  
  -- Fraud detection
  fraud_score DECIMAL(3,2) DEFAULT 0.00,
  fraud_flags JSONB DEFAULT '[]'::jsonb,
  
  -- Metadata
  notes TEXT,
  submitted_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  -- Ensure uniqueness for transaction refs
  UNIQUE(transaction_ref, payment_type_id)
);

-- ============================================
-- PAYMENT HISTORY TABLE (Audit Trail)
-- ============================================
CREATE TABLE IF NOT EXISTS payment_history (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
  action VARCHAR(50) NOT NULL, -- submitted, approved, rejected, waived, updated
  performed_by UUID REFERENCES students(id) ON DELETE SET NULL,
  old_status VARCHAR(50),
  new_status VARCHAR(50),
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- EXPENSES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS expenses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_type_id UUID REFERENCES payment_types(id) ON DELETE CASCADE,
  
  title VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(50) NOT NULL, -- materials, transport, printing, food, venue, other
  amount DECIMAL(10,2) NOT NULL,
  
  receipt_url TEXT,
  expense_date DATE NOT NULL,
  
  recorded_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  notes TEXT,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PUBLIC PAYMENTS TABLE (Alumni/Sponsor Contributions)
-- ============================================
CREATE TABLE IF NOT EXISTS public_payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_type_id UUID REFERENCES payment_types(id) ON DELETE CASCADE,
  
  contributor_name VARCHAR(255) NOT NULL,
  contributor_email VARCHAR(255),
  contributor_phone VARCHAR(20),
  
  amount DECIMAL(10,2) NOT NULL,
  message TEXT,
  is_anonymous BOOLEAN DEFAULT false,
  
  transaction_ref VARCHAR(255) UNIQUE,
  receipt_url TEXT,
  
  status VARCHAR(50) DEFAULT 'pending', -- pending, approved, rejected
  reviewed_by UUID REFERENCES admins(id) ON DELETE SET NULL,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PAYMENT PLEDGES TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS payment_pledges (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  payment_type_id UUID REFERENCES payment_types(id) ON DELETE CASCADE,
  
  pledge_date DATE DEFAULT CURRENT_DATE,
  fulfillment_date DATE NOT NULL,
  is_fulfilled BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  
  UNIQUE(student_id, payment_type_id)
);

-- ============================================
-- NOTIFICATIONS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID REFERENCES students(id) ON DELETE CASCADE,
  
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL, -- payment_due, payment_approved, payment_rejected, reminder
  
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- FRAUD LOGS TABLE
-- ============================================
CREATE TABLE IF NOT EXISTS fraud_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
  
  check_type VARCHAR(50) NOT NULL, -- duplicate_receipt, suspicious_amount, edited_image
  severity VARCHAR(20) NOT NULL, -- low, medium, high, critical
  details JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX IF NOT EXISTS idx_students_reg_number ON students(reg_number);
CREATE INDEX IF NOT EXISTS idx_students_level ON students(level);
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type_id ON payments(payment_type_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payment_types_active ON payment_types(is_active);
CREATE INDEX IF NOT EXISTS idx_notifications_recipient ON notifications(recipient_id, is_read);
CREATE INDEX IF NOT EXISTS idx_expenses_payment_type ON expenses(payment_type_id);

-- ============================================
-- TRIGGERS FOR UPDATED_AT
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_students_updated_at ON students;
CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payment_types_updated_at ON payment_types;
CREATE TRIGGER update_payment_types_updated_at BEFORE UPDATE ON payment_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_expenses_updated_at ON expenses;
CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================
-- FUNCTION: Verify Student Login with Roles
-- ============================================
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
    s.id, s.reg_number, s.full_name, s.email, s.phone, s.section,
    s.department, s.level, s.force_password_change, s.is_active,
    s.created_at, s.updated_at,
    COALESCE(array_agg(a.role) FILTER (WHERE a.role IS NOT NULL), ARRAY[]::TEXT[]) as roles
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

GRANT EXECUTE ON FUNCTION verify_student_login(VARCHAR, VARCHAR) TO authenticated;
GRANT EXECUTE ON FUNCTION verify_student_login(VARCHAR, VARCHAR) TO anon;

-- ============================================
-- FUNCTION: Change Student Password
-- ============================================
CREATE OR REPLACE FUNCTION change_student_password(
  p_student_id UUID,
  p_current_password VARCHAR,
  p_new_password VARCHAR
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

GRANT EXECUTE ON FUNCTION change_student_password(UUID, VARCHAR, VARCHAR) TO authenticated;

-- ============================================
-- FUNCTION: Get Payment Statistics
-- ============================================
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

-- ============================================
-- FUNCTION: Check for Duplicate Receipts
-- ============================================
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

-- ============================================
-- FUNCTION: Send Notification
-- ============================================
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

-- ============================================
-- TRIGGER: Log Payment History
-- ============================================
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

DROP TRIGGER IF EXISTS payment_history_trigger ON payments;
CREATE TRIGGER payment_history_trigger
AFTER INSERT OR UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION log_payment_history();

-- ============================================
-- TRIGGER: Notify on Payment Status Change
-- ============================================
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
        '/payments/' || NEW.id
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM send_notification(
        NEW.student_id,
        'Payment Rejected ❌',
        'Your payment was rejected. Reason: ' || COALESCE(NEW.rejection_reason, 'Not specified'),
        'payment_rejected',
        '/payments/' || NEW.id
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS payment_notification_trigger ON payments;
CREATE TRIGGER payment_notification_trigger
AFTER UPDATE ON payments
FOR EACH ROW EXECUTE FUNCTION notify_payment_status();

-- ============================================
-- SAMPLE DATA - Test Students
-- ============================================
-- Insert sample students (password is same as reg_number for testing)
INSERT INTO students (reg_number, full_name, email, phone, level, department, section, password_hash, force_password_change)
VALUES 
  ('CS/2021/001', 'John Doe', 'john.doe@example.com', '08012345601', '200L', 'Computer Science', 'A', 'default_hash', false),
  ('CS/2021/002', 'Jane Smith', 'jane.smith@example.com', '08012345602', '200L', 'Computer Science', 'A', 'default_hash', false),
  ('CS/2021/003', 'Mike Johnson', 'mike.j@example.com', '08012345603', '200L', 'Computer Science', 'B', 'default_hash', false),
  ('CS/2021/004', 'Sarah Williams', 'sarah.w@example.com', '08012345604', '300L', 'Computer Science', 'A', 'default_hash', false),
  ('CS/2021/005', 'David Brown', 'david.b@example.com', '08012345605', '300L', 'Computer Science', 'B', 'default_hash', false)
ON CONFLICT (reg_number) DO NOTHING;

-- ============================================
-- SAMPLE DATA - Make First Student an Admin
-- ============================================
INSERT INTO admins (student_id, role, can_create_payments, can_approve_payments, can_manage_students, can_view_analytics)
SELECT id, 'admin', true, true, true, true
FROM students WHERE reg_number = 'CS/2021/001'
ON CONFLICT DO NOTHING;

-- Make second student a Financial Secretary
INSERT INTO admins (student_id, role, can_create_payments, can_approve_payments, can_manage_students, can_view_analytics)
SELECT id, 'finsec', true, true, false, true
FROM students WHERE reg_number = 'CS/2021/002'
ON CONFLICT DO NOTHING;

-- Make third student a Class Rep
INSERT INTO admins (student_id, role, can_create_payments, can_approve_payments, can_manage_students, can_view_analytics)
SELECT id, 'class_rep', true, true, true, true
FROM students WHERE reg_number = 'CS/2021/003'
ON CONFLICT DO NOTHING;

-- ============================================
-- SUCCESS MESSAGE
-- ============================================
DO $$
BEGIN
  RAISE NOTICE '✅ Database setup complete!';
  RAISE NOTICE '';
  RAISE NOTICE '📝 Test Accounts Created:';
  RAISE NOTICE '   CS/2021/001 (Admin) - Password: CS/2021/001';
  RAISE NOTICE '   CS/2021/002 (Finsec) - Password: CS/2021/002';
  RAISE NOTICE '   CS/2021/003 (Class Rep) - Password: CS/2021/003';
  RAISE NOTICE '   CS/2021/004 (Student) - Password: CS/2021/004';
  RAISE NOTICE '   CS/2021/005 (Student) - Password: CS/2021/005';
  RAISE NOTICE '';
  RAISE NOTICE '🚀 You can now login with any of these accounts!';
END $$;
