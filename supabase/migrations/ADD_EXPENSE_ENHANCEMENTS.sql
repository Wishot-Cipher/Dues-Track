-- ================================================================
-- INCREMENTAL MIGRATION: EXPENSE MANAGEMENT ENHANCEMENTS
-- ================================================================
-- Run this AFTER your existing schema.sql and policies.sql
-- This adds ONLY the missing tables/columns for expense features
-- ================================================================

-- ================================================================
-- STEP 1: ADD NEW COLUMNS TO EXISTING EXPENSES TABLE
-- ================================================================

-- Add approval workflow columns (if not exist)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS status TEXT DEFAULT 'pending';
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_by UUID REFERENCES admins(id);
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add category and fund tracking (if not exist)
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS category_id UUID;
ALTER TABLE expenses ADD COLUMN IF NOT EXISTS funded_by UUID REFERENCES payment_types(id);

-- Add check constraint for valid statuses
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'valid_expense_status'
  ) THEN
    ALTER TABLE expenses ADD CONSTRAINT valid_expense_status 
      CHECK (status IN ('pending', 'approved', 'rejected'));
  END IF;
END $$;

-- Add indexes for performance (if not exist)
CREATE INDEX IF NOT EXISTS idx_expenses_status ON expenses(status);
CREATE INDEX IF NOT EXISTS idx_expenses_approved_by ON expenses(approved_by);
CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);
CREATE INDEX IF NOT EXISTS idx_expenses_funded_by ON expenses(funded_by);

-- Update existing expenses to 'approved' status (backward compatibility)
UPDATE expenses SET status = 'approved' WHERE status IS NULL OR status = '';

-- ================================================================
-- STEP 2: CREATE EXPENSE CATEGORIES TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL UNIQUE,
  description TEXT,
  icon TEXT, -- Lucide icon name or emoji
  color TEXT, -- Hex color code
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES admins(id)
);

-- Add foreign key constraint now that table exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'expenses_category_id_fkey'
  ) THEN
    ALTER TABLE expenses ADD CONSTRAINT expenses_category_id_fkey 
      FOREIGN KEY (category_id) REFERENCES expense_categories(id);
  END IF;
END $$;

-- Insert default categories
INSERT INTO expense_categories (name, description, icon, color) VALUES
  ('Academic Materials', 'Books, supplies, and learning resources', 'BookOpen', '#3B82F6'),
  ('Events & Activities', 'Excursions, social events, celebrations', 'PartyPopper', '#8B5CF6'),
  ('Infrastructure', 'Facility improvements and upgrades', 'Building2', '#10B981'),
  ('Administrative', 'Office supplies, administrative fees', 'Briefcase', '#6366F1'),
  ('Awards & Recognition', 'Prizes, certificates, trophies', 'Award', '#F59E0B'),
  ('Maintenance & Repairs', 'Facility and equipment maintenance', 'Wrench', '#EF4444'),
  ('Donations & Charity', 'Charitable contributions', 'Heart', '#EC4899'),
  ('Technology & Equipment', 'Computers, software, tech gear', 'Laptop', '#06B6D4'),
  ('Refreshments & Catering', 'Food and beverages for events', 'Coffee', '#84CC16'),
  ('Miscellaneous', 'Other expenses not categorized', 'MoreHorizontal', '#6B7280')
ON CONFLICT (name) DO NOTHING;

-- ================================================================
-- STEP 3: CREATE EXPENSE AUDIT LOG TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS expense_audit_log (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  action TEXT NOT NULL, -- 'created', 'updated', 'deleted', 'approved', 'rejected'
  performed_by UUID REFERENCES admins(id),
  previous_data JSONB, -- Snapshot of data before change
  new_data JSONB, -- Snapshot after change
  reason TEXT, -- Why the change was made
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_audit_log ON expense_audit_log(expense_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_expense_audit_performed_by ON expense_audit_log(performed_by);

-- ================================================================
-- STEP 4: CREATE EXPENSE BUDGETS TABLE
-- ================================================================

CREATE TABLE IF NOT EXISTS expense_budgets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  category_id UUID REFERENCES expense_categories(id),
  payment_type_id UUID REFERENCES payment_types(id), -- Which fund
  budget_amount DECIMAL(10,2) NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  notes TEXT,
  created_by UUID REFERENCES admins(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Ensure unique budgets per category/fund/period
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'unique_budget_period'
  ) THEN
    ALTER TABLE expense_budgets ADD CONSTRAINT unique_budget_period
      UNIQUE (category_id, payment_type_id, period_start, period_end);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_budgets_period ON expense_budgets(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_budgets_category ON expense_budgets(category_id);

-- ================================================================
-- STEP 5: CREATE EXPENSE RECEIPTS TABLE (Multiple receipts support)
-- ================================================================

CREATE TABLE IF NOT EXISTS expense_receipts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  expense_id UUID REFERENCES expenses(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  file_name TEXT,
  file_size INTEGER, -- in bytes
  mime_type TEXT,
  uploaded_by UUID REFERENCES admins(id),
  uploaded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_expense_receipts ON expense_receipts(expense_id);

-- ================================================================
-- STEP 6: ENABLE RLS ON NEW TABLES
-- ================================================================

ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE expense_receipts ENABLE ROW LEVEL SECURITY;

-- ================================================================
-- STEP 7: CREATE RLS POLICIES FOR NEW TABLES
-- ================================================================

-- EXPENSE CATEGORIES POLICIES
DROP POLICY IF EXISTS "Everyone can view expense categories" ON expense_categories;
CREATE POLICY "Everyone can view expense categories"
ON expense_categories FOR SELECT
TO authenticated
USING (is_active = true);

DROP POLICY IF EXISTS "Senior admins can manage expense categories" ON expense_categories;
CREATE POLICY "Senior admins can manage expense categories"
ON expense_categories FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
    AND can_manage_students = true
  )
);

-- EXPENSE AUDIT LOG POLICIES
DROP POLICY IF EXISTS "Admins can view audit log" ON expense_audit_log;
CREATE POLICY "Admins can view audit log"
ON expense_audit_log FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "System can insert audit log" ON expense_audit_log;
CREATE POLICY "System can insert audit log"
ON expense_audit_log FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
  )
);

-- EXPENSE BUDGETS POLICIES
DROP POLICY IF EXISTS "Admins can view budgets" ON expense_budgets;
CREATE POLICY "Admins can view budgets"
ON expense_budgets FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Senior admins can manage budgets" ON expense_budgets;
CREATE POLICY "Senior admins can manage budgets"
ON expense_budgets FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
    AND can_manage_students = true
  )
);

-- EXPENSE RECEIPTS POLICIES
DROP POLICY IF EXISTS "Admins can view expense receipts" ON expense_receipts;
CREATE POLICY "Admins can view expense receipts"
ON expense_receipts FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Admins can upload expense receipts" ON expense_receipts;
CREATE POLICY "Admins can upload expense receipts"
ON expense_receipts FOR INSERT
TO authenticated
WITH CHECK (
  uploaded_by IN (
    SELECT id FROM admins WHERE student_id = auth.uid()
  )
);

-- ================================================================
-- STEP 8: UPDATE EXISTING EXPENSE POLICIES
-- ================================================================

-- Drop old expense policies (we'll recreate them with enhanced logic)
DROP POLICY IF EXISTS "Students can view approved expenses" ON expenses;
DROP POLICY IF EXISTS "Admins can view all expenses" ON expenses;
DROP POLICY IF EXISTS "Admins can create expenses" ON expenses;
DROP POLICY IF EXISTS "Senior admins can approve expenses" ON expenses;

-- Students can view approved expenses only
CREATE POLICY "Students can view approved expenses"
ON expenses FOR SELECT
TO authenticated
USING (status = 'approved');

-- Admins can view all expenses
CREATE POLICY "Admins can view all expenses"
ON expenses FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
  )
);

-- Admins can create expenses (pending by default)
CREATE POLICY "Admins can create expenses"
ON expenses FOR INSERT
TO authenticated
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
    AND (can_create_payments = true OR can_manage_students = true)
  )
);

-- Only senior admins can approve/reject expenses
CREATE POLICY "Senior admins can approve expenses"
ON expenses FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
    AND can_manage_students = true
  )
)
WITH CHECK (
  status IN ('approved', 'rejected', 'pending')
);

-- ================================================================
-- STEP 9: CREATE SECURE RPC FUNCTIONS
-- ================================================================

-- Function: Approve/Reject Expense
CREATE OR REPLACE FUNCTION approve_expense(
  p_expense_id UUID,
  p_approved BOOLEAN,
  p_reason TEXT DEFAULT NULL
) RETURNS void AS $$
DECLARE
  v_admin_id UUID;
  v_old_data JSONB;
BEGIN
  -- Verify admin has permission (senior admins only)
  SELECT id INTO v_admin_id FROM admins 
  WHERE student_id = auth.uid() 
  AND can_manage_students = true;
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Senior admin permission required for expense approval';
  END IF;
  
  -- Store old data for audit
  SELECT row_to_json(expenses.*) INTO v_old_data 
  FROM expenses WHERE id = p_expense_id;
  
  -- Update expense status
  UPDATE expenses SET
    status = CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    approved_by = v_admin_id,
    approved_at = NOW(),
    rejection_reason = CASE WHEN NOT p_approved THEN p_reason ELSE NULL END,
    updated_at = NOW()
  WHERE id = p_expense_id;
  
  -- Log the action
  INSERT INTO expense_audit_log (expense_id, action, performed_by, previous_data, new_data, reason)
  VALUES (
    p_expense_id,
    CASE WHEN p_approved THEN 'approved' ELSE 'rejected' END,
    v_admin_id,
    v_old_data,
    (SELECT row_to_json(expenses.*) FROM expenses WHERE id = p_expense_id),
    p_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Update Expense with Audit Trail
CREATE OR REPLACE FUNCTION update_expense_with_audit(
  p_expense_id UUID,
  p_description TEXT,
  p_amount DECIMAL,
  p_category_id UUID,
  p_funded_by UUID,
  p_reason TEXT
) RETURNS void AS $$
DECLARE
  v_admin_id UUID;
  v_old_data JSONB;
BEGIN
  -- Verify admin permissions
  SELECT id INTO v_admin_id FROM admins 
  WHERE student_id = auth.uid() 
  AND (can_create_payments = true OR can_manage_students = true);
  
  IF v_admin_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Admin permission required';
  END IF;
  
  -- Store old data
  SELECT row_to_json(expenses.*) INTO v_old_data 
  FROM expenses WHERE id = p_expense_id;
  
  -- Update expense
  UPDATE expenses SET
    description = p_description,
    amount = p_amount,
    category_id = p_category_id,
    funded_by = p_funded_by,
    updated_at = NOW()
  WHERE id = p_expense_id;
  
  -- Log the change
  INSERT INTO expense_audit_log (expense_id, action, performed_by, previous_data, new_data, reason)
  VALUES (
    p_expense_id,
    'updated',
    v_admin_id,
    v_old_data,
    (SELECT row_to_json(expenses.*) FROM expenses WHERE id = p_expense_id),
    p_reason
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get Approved Expenses Summary (for student transparency)
CREATE OR REPLACE FUNCTION get_approved_expenses_summary(
  p_start_date DATE DEFAULT NULL,
  p_end_date DATE DEFAULT NULL
) RETURNS TABLE (
  total_spent DECIMAL,
  total_count INTEGER,
  by_category JSONB,
  by_month JSONB,
  recent_expenses JSONB
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COALESCE(SUM(e.amount), 0)::DECIMAL as total_spent,
    COUNT(*)::INTEGER as total_count,
    
    -- Spending by category
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'category', ec.name,
      'color', ec.color,
      'icon', ec.icon,
      'total', cat_totals.total,
      'count', cat_totals.count
    )), '[]'::jsonb)
     FROM (
       SELECT category_id, SUM(amount) as total, COUNT(*) as count
       FROM expenses 
       WHERE status = 'approved'
         AND (p_start_date IS NULL OR expense_date >= p_start_date)
         AND (p_end_date IS NULL OR expense_date <= p_end_date)
       GROUP BY category_id
     ) cat_totals
     LEFT JOIN expense_categories ec ON cat_totals.category_id = ec.id
    ) as by_category,
    
    -- Spending by month
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'month', TO_CHAR(month_totals.month, 'YYYY-MM'),
      'total', month_totals.total,
      'count', month_totals.count
    )), '[]'::jsonb)
     FROM (
       SELECT 
         DATE_TRUNC('month', expense_date) as month, 
         SUM(amount) as total,
         COUNT(*) as count
       FROM expenses
       WHERE status = 'approved'
         AND (p_start_date IS NULL OR expense_date >= p_start_date)
         AND (p_end_date IS NULL OR expense_date <= p_end_date)
       GROUP BY month
       ORDER BY month DESC
       LIMIT 12
     ) month_totals
    ) as by_month,
    
    -- Recent expenses
    (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', e.id,
      'title', e.title,
      'description', e.description,
      'amount', e.amount,
      'expense_date', e.expense_date,
      'category_name', ec.name,
      'category_color', ec.color,
      'category_icon', ec.icon
    )), '[]'::jsonb)
     FROM (
       SELECT e.*, ec.name, ec.color, ec.icon
       FROM expenses e
       LEFT JOIN expense_categories ec ON e.category_id = ec.id
       WHERE e.status = 'approved'
         AND (p_start_date IS NULL OR e.expense_date >= p_start_date)
         AND (p_end_date IS NULL OR e.expense_date <= p_end_date)
       ORDER BY e.expense_date DESC, e.created_at DESC
       LIMIT 20
     ) e
    ) as recent_expenses
    
  FROM expenses e
  WHERE e.status = 'approved'
    AND (p_start_date IS NULL OR e.expense_date >= p_start_date)
    AND (p_end_date IS NULL OR e.expense_date <= p_end_date);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Function: Get Budget Health (spending vs budget)
CREATE OR REPLACE FUNCTION get_budget_health()
RETURNS TABLE (
  category_name TEXT,
  category_color TEXT,
  budget_amount DECIMAL,
  spent_amount DECIMAL,
  remaining DECIMAL,
  percentage_used DECIMAL,
  period_start DATE,
  period_end DATE
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    ec.name as category_name,
    ec.color as category_color,
    eb.budget_amount,
    COALESCE(SUM(e.amount), 0)::DECIMAL as spent_amount,
    (eb.budget_amount - COALESCE(SUM(e.amount), 0))::DECIMAL as remaining,
    CASE 
      WHEN eb.budget_amount > 0 THEN 
        ROUND((COALESCE(SUM(e.amount), 0) / eb.budget_amount * 100)::numeric, 2)
      ELSE 0 
    END as percentage_used,
    eb.period_start,
    eb.period_end
  FROM expense_budgets eb
  LEFT JOIN expense_categories ec ON eb.category_id = ec.id
  LEFT JOIN expenses e ON e.category_id = eb.category_id 
    AND e.status = 'approved'
    AND e.expense_date BETWEEN eb.period_start AND eb.period_end
  WHERE eb.period_end >= CURRENT_DATE
  GROUP BY ec.name, ec.color, eb.budget_amount, eb.period_start, eb.period_end
  ORDER BY percentage_used DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ================================================================
-- STEP 10: ADD TRIGGER FOR EXPENSE BUDGETS
-- ================================================================

CREATE TRIGGER update_expense_budgets_updated_at 
BEFORE UPDATE ON expense_budgets
FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ================================================================
-- STEP 11: ADD HELPFUL COMMENTS
-- ================================================================

COMMENT ON TABLE expense_categories IS 'Categories for organizing expenses (Academic, Events, etc.)';
COMMENT ON TABLE expense_audit_log IS 'Complete audit trail for all expense modifications';
COMMENT ON TABLE expense_budgets IS 'Budget allocations for expense categories per fund';
COMMENT ON TABLE expense_receipts IS 'Multiple receipt support for each expense';
COMMENT ON COLUMN expenses.status IS 'Expense approval status: pending, approved, or rejected';
COMMENT ON COLUMN expenses.category_id IS 'Link to expense_categories table';
COMMENT ON COLUMN expenses.funded_by IS 'Which payment_type funded this expense';
COMMENT ON FUNCTION approve_expense IS 'Securely approve or reject an expense (senior admins only)';
COMMENT ON FUNCTION update_expense_with_audit IS 'Update expense with automatic audit logging';
COMMENT ON FUNCTION get_approved_expenses_summary IS 'Public-facing expense summary for students';
COMMENT ON FUNCTION get_budget_health IS 'Budget vs actual spending analysis';

-- ================================================================
-- MIGRATION COMPLETE ✅
-- ================================================================
-- Next steps:
-- 1. Run this migration in your Supabase SQL Editor
-- 2. Configure storage policies for expense-receipts bucket (see IMPLEMENTATION_SUMMARY.md)
-- 3. Test expense creation and approval workflow
-- 4. Build UI components for expense approval queue
-- ================================================================
