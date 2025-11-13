-- ============================================
-- CLASS DUES TRACKER - DATABASE SCHEMA
-- ============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- STUDENTS TABLE
-- ============================================
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  reg_number VARCHAR(50) UNIQUE NOT NULL,
  full_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) UNIQUE,
  phone VARCHAR(20),
  level VARCHAR(10) NOT NULL, -- 200L, 300L, 400L
  department VARCHAR(100) NOT NULL,
  section VARCHAR(10), -- A, B, C
  password_hash VARCHAR(255) NOT NULL,
  force_password_change BOOLEAN DEFAULT false, -- Forces user to change password on next login
  profile_image_url TEXT,
  is_active BOOLEAN DEFAULT true,
  last_login TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- ADMINS TABLE
-- ============================================
CREATE TABLE admins (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID REFERENCES students(id) ON DELETE CASCADE,
  role VARCHAR(50) NOT NULL, -- financial_secretary, class_rep, event_coordinator, custom
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
CREATE TABLE payment_types (
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
  target_levels VARCHAR[] DEFAULT ARRAY['200L', '300L', '400L'],
  target_departments VARCHAR[],
  
  -- Status
  is_active BOOLEAN DEFAULT true,
  is_public BOOLEAN DEFAULT false, -- For public contributions
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- PAYMENTS TABLE
-- ============================================
CREATE TABLE payments (
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
CREATE TABLE payment_history (
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
CREATE TABLE expenses (
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
CREATE TABLE public_payments (
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
CREATE TABLE payment_pledges (
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
CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  recipient_id UUID REFERENCES students(id) ON DELETE CASCADE,
  
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type VARCHAR(50) NOT NULL, -- payment_due, payment_approved, payment_rejected, reminder, expense_report
  
  link TEXT,
  is_read BOOLEAN DEFAULT false,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- FRAUD LOGS TABLE
-- ============================================
CREATE TABLE fraud_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,
  
  check_type VARCHAR(50) NOT NULL, -- duplicate_receipt, suspicious_amount, edited_image, invalid_date
  severity VARCHAR(20) NOT NULL, -- low, medium, high, critical
  details JSONB,
  
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- INDEXES FOR PERFORMANCE
-- ============================================
CREATE INDEX idx_students_reg_number ON students(reg_number);
CREATE INDEX idx_students_level ON students(level);
CREATE INDEX idx_payments_student_id ON payments(student_id);
CREATE INDEX idx_payments_payment_type_id ON payments(payment_type_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payment_types_active ON payment_types(is_active);
CREATE INDEX idx_notifications_recipient ON notifications(recipient_id, is_read);
CREATE INDEX idx_expenses_payment_type ON expenses(payment_type_id);

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

CREATE TRIGGER update_students_updated_at BEFORE UPDATE ON students
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payment_types_updated_at BEFORE UPDATE ON payment_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_payments_updated_at BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_expenses_updated_at BEFORE UPDATE ON expenses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
