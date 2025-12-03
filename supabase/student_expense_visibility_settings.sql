-- Enhanced Expense Visibility Settings
-- This allows admins to control what financial details students can see

CREATE TABLE IF NOT EXISTS expense_visibility_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  setting_key TEXT UNIQUE NOT NULL,
  is_visible BOOLEAN DEFAULT true,
  display_name TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES admins(id)
);

-- Insert granular expense visibility settings
INSERT INTO expense_visibility_settings (setting_key, display_name, description, is_visible) VALUES
  ('show_total_collected', 'Total Collected Amount', 'Show total money collected from all students', true),
  ('show_total_spent', 'Total Spent Amount', 'Show total money spent on expenses', true),
  ('show_remaining_balance', 'Remaining Balance', 'Show how much money is left', true),
  ('show_expense_categories', 'Expense Categories Breakdown', 'Show expenses grouped by category with percentages', true),
  ('show_recent_expenses', 'Recent Expenses List', 'Show list of recent expenses with amounts', true),
  ('show_expense_details', 'Full Expense Details', 'Allow expanding to see all expense details', false),
  ('show_budget_usage', 'Budget Usage Percentage', 'Show visual progress bar of budget used', true)
ON CONFLICT (setting_key) DO NOTHING;

-- Enable RLS
ALTER TABLE expense_visibility_settings ENABLE ROW LEVEL SECURITY;

-- Students can read all settings
CREATE POLICY "Students can view expense visibility settings"
  ON expense_visibility_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins with can_manage_students can update
CREATE POLICY "Admins can update expense visibility settings"
  ON expense_visibility_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.student_id = auth.uid()
      AND admins.can_manage_students = true
    )
  );

-- Create function to get visible expense settings
CREATE OR REPLACE FUNCTION get_visible_expense_settings()
RETURNS TABLE (setting_key TEXT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT setting_key
  FROM expense_visibility_settings
  WHERE is_visible = true;
$$;

COMMENT ON TABLE expense_visibility_settings IS 'Controls what financial details students can see in expense transparency';
COMMENT ON FUNCTION get_visible_expense_settings() IS 'Returns list of visible expense setting keys for students';
