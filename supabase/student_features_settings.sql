-- Student Features Visibility Settings Table
-- This allows admins to control which features students can see

CREATE TABLE IF NOT EXISTS student_feature_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  feature_key TEXT UNIQUE NOT NULL,
  is_enabled BOOLEAN DEFAULT true,
  display_name TEXT NOT NULL,
  description TEXT,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES admins(id)
);

-- Insert default settings for all 5 features
INSERT INTO student_feature_settings (feature_key, display_name, description, is_enabled) VALUES
  ('expense_transparency', 'Expense Transparency Dashboard', 'Shows students where class funds are being spent', true),
  ('achievements', 'Achievement System', 'Gamification badges and payment streaks', true),
  ('deadline_reminders', 'Smart Deadline Reminders', 'Proactive payment deadline notifications', true),
  ('class_progress', 'Class Progress Visualization', 'Shows percentage of class that has paid', true),
  ('payment_summary', 'Quick Payment Summary Export', 'Allow students to download/print payment records', true)
ON CONFLICT (feature_key) DO NOTHING;

-- Enable RLS
ALTER TABLE student_feature_settings ENABLE ROW LEVEL SECURITY;

-- Students can read all settings
CREATE POLICY "Students can view feature settings"
  ON student_feature_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Only admins with can_manage_students can update
CREATE POLICY "Admins can update feature settings"
  ON student_feature_settings
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.student_id = auth.uid()
      AND admins.can_manage_students = true
    )
  );

-- Create function to get enabled features
CREATE OR REPLACE FUNCTION get_enabled_student_features()
RETURNS TABLE (feature_key TEXT)
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT feature_key
  FROM student_feature_settings
  WHERE is_enabled = true;
$$;

COMMENT ON TABLE student_feature_settings IS 'Controls visibility of student-facing features';
COMMENT ON FUNCTION get_enabled_student_features() IS 'Returns list of enabled feature keys for students';
