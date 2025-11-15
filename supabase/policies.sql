-- ============================================
-- ROW LEVEL SECURITY POLICIES
-- ============================================

-- Enable RLS on all tables
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE admins ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE payment_pledges ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE fraud_logs ENABLE ROW LEVEL SECURITY;

-- ============================================
-- STUDENTS POLICIES
-- ============================================
-- Students can read their own data
CREATE POLICY students_select_own ON students
  FOR SELECT USING (auth.uid()::text = id::text);

-- Students can update their own profile
CREATE POLICY students_update_own ON students
  FOR UPDATE USING (auth.uid()::text = id::text);

-- Admins can read all students
CREATE POLICY admins_select_all_students ON students
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE student_id = auth.uid()
    )
  );

-- ============================================
-- ADMINS TABLE POLICIES
-- ============================================
-- Admins can view admin records (all admins or their own record)
CREATE POLICY admins_select_admins ON admins
  FOR SELECT USING (
    auth.uid()::text = student_id::text
    OR EXISTS (
      SELECT 1 FROM admins WHERE student_id = auth.uid()
    )
  );

-- Only admins with can_manage_students can insert admin records
CREATE POLICY admins_insert_management ON admins
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE student_id = auth.uid()
      AND can_manage_students = true
    )
  );

-- Only admins with can_manage_students can delete admin records
CREATE POLICY admins_delete_management ON admins
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE student_id = auth.uid()
      AND can_manage_students = true
    )
  );

-- Only admins with can_manage_students can update admin records
CREATE POLICY admins_update_management ON admins
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE student_id = auth.uid()
      AND can_manage_students = true
    )
  );

-- ============================================
-- PAYMENT TYPES POLICIES
-- ============================================
-- Anyone can read active payment types
CREATE POLICY payment_types_select_active ON payment_types
  FOR SELECT USING (is_active = true);

-- Only admins can create payment types
CREATE POLICY payment_types_insert_admin ON payment_types
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE student_id = auth.uid()
      AND can_create_payments = true
    )
  );

-- Only creator can update their payment types
CREATE POLICY payment_types_update_own ON payment_types
  FOR UPDATE USING (
    created_by IN (
      SELECT id FROM admins WHERE student_id = auth.uid()
    )
  );

-- ============================================
-- PAYMENTS POLICIES
-- ============================================
-- Students can read their own payments
CREATE POLICY payments_select_own ON payments
  FOR SELECT USING (student_id = auth.uid());

-- Students can insert their own payments
CREATE POLICY payments_insert_own ON payments
  FOR INSERT WITH CHECK (student_id = auth.uid());

-- Students can update their pending payments
CREATE POLICY payments_update_own ON payments
  FOR UPDATE USING (
    student_id = auth.uid()
    AND status = 'pending'
  );

-- Admins can read payments for payment types they manage
CREATE POLICY admins_select_payments ON payments
  FOR SELECT USING (
    (
      -- Payments where current admin is the approver
      payment_type_id IN (
        SELECT id FROM payment_types pt
        WHERE pt.approver_id IN (
          SELECT id FROM admins WHERE student_id = auth.uid()
        )
      )
      OR
      (
        -- OR class reps with permission can access payments in their department
        EXISTS (
          SELECT 1 FROM admins a JOIN students s ON s.id = payments.student_id
          WHERE a.student_id = auth.uid() AND a.role = 'class_rep' AND a.can_approve_payments = true
          AND s.department = (SELECT department FROM students WHERE id = auth.uid())
        )
      )
    )
  );

-- Additional: allow admins with explicit management/analytics privileges to view ALL payments
-- This is intentional: some admin roles (e.g., financial secretaries) need visibility across the board
CREATE POLICY admins_select_all_payments ON payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE student_id = auth.uid()
      AND (
        can_manage_students = true
        OR can_view_analytics = true
      )
    )
  );

-- Admins can update payments they're assigned to approve
CREATE POLICY admins_update_payments ON payments
  FOR UPDATE USING (
    (
      -- Payments where current admin is the approver
      payment_type_id IN (
        SELECT id FROM payment_types pt
        WHERE pt.approver_id IN (
          SELECT id FROM admins WHERE student_id = auth.uid()
        )
      )
      OR
      (
        -- OR class reps with permission can update payments in their department
        EXISTS (
          SELECT 1 FROM admins a JOIN students s ON s.id = payments.student_id
          WHERE a.student_id = auth.uid() AND a.role = 'class_rep' AND a.can_approve_payments = true
          AND s.department = (SELECT department FROM students WHERE id = auth.uid())
        )
      )
    )
  );

-- ============================================
-- EXPENSES POLICIES
-- ============================================
-- Students can read expenses for payment types they've paid
CREATE POLICY expenses_select_by_students ON expenses
  FOR SELECT USING (
    payment_type_id IN (
      SELECT payment_type_id FROM payments
      WHERE student_id = auth.uid()
      AND status IN ('approved', 'partial')
    )
  );

-- Public can read expenses for public payment types
CREATE POLICY expenses_select_public ON expenses
  FOR SELECT USING (
    payment_type_id IN (
      SELECT id FROM payment_types WHERE is_public = true
    )
  );

-- Only admins can insert expenses
CREATE POLICY expenses_insert_admin ON expenses
  FOR INSERT WITH CHECK (
    recorded_by IN (
      SELECT id FROM admins WHERE student_id = auth.uid()
    )
  );

-- ============================================
-- NOTIFICATIONS POLICIES
-- ============================================
-- Students can read their own notifications
CREATE POLICY notifications_select_own ON notifications
  FOR SELECT USING (recipient_id = auth.uid());

-- Students can update their own notifications (mark as read)
CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE USING (recipient_id = auth.uid());

-- Admins can insert notifications
CREATE POLICY notifications_insert_admin ON notifications
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins WHERE student_id = auth.uid()
    )
  );

-- ============================================
-- PUBLIC PAYMENTS POLICIES
-- ============================================
-- Anyone can insert public payments (no auth required)
CREATE POLICY public_payments_insert_anyone ON public_payments
  FOR INSERT WITH CHECK (true);

-- Anyone can read approved public payments
CREATE POLICY public_payments_select_approved ON public_payments
  FOR SELECT USING (status = 'approved' OR is_anonymous = false);

-- Admins can read all public payments
CREATE POLICY public_payments_select_admin ON public_payments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admins WHERE student_id = auth.uid()
    )
  );

-- Admins can update public payments
CREATE POLICY public_payments_update_admin ON public_payments
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admins WHERE student_id = auth.uid()
    )
  );
