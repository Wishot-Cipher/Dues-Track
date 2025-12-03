-- WORKING RLS FIX: Use public role instead of authenticated
-- This fixes the issue where authenticated role wasn't working properly

-- ============================================
-- FIX: student_feature_settings RLS
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "allow_authenticated_select" ON student_feature_settings;
DROP POLICY IF EXISTS "allow_authenticated_update" ON student_feature_settings;
DROP POLICY IF EXISTS "allow_authenticated_insert" ON student_feature_settings;

-- Re-enable RLS
ALTER TABLE student_feature_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for public role (works with anon key + auth)
CREATE POLICY "allow_read_for_all"
  ON student_feature_settings
  FOR SELECT
  USING (true);

CREATE POLICY "allow_update_for_all"
  ON student_feature_settings
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_insert_for_all"
  ON student_feature_settings
  FOR INSERT
  WITH CHECK (true);

-- ============================================
-- FIX: expense_visibility_settings RLS
-- ============================================

-- Drop existing policies
DROP POLICY IF EXISTS "allow_authenticated_select" ON expense_visibility_settings;
DROP POLICY IF EXISTS "allow_authenticated_update" ON expense_visibility_settings;
DROP POLICY IF EXISTS "allow_authenticated_insert" ON expense_visibility_settings;

-- Re-enable RLS
ALTER TABLE expense_visibility_settings ENABLE ROW LEVEL SECURITY;

-- Create policies for public role (works with anon key + auth)
CREATE POLICY "allow_read_for_all"
  ON expense_visibility_settings
  FOR SELECT
  USING (true);

CREATE POLICY "allow_update_for_all"
  ON expense_visibility_settings
  FOR UPDATE
  USING (true)
  WITH CHECK (true);

CREATE POLICY "allow_insert_for_all"
  ON expense_visibility_settings
  FOR INSERT
  WITH CHECK (true);

-- ============================================
-- VERIFY
-- ============================================

SELECT 'student_feature_settings' as table_name, COUNT(*) as row_count FROM student_feature_settings
UNION ALL
SELECT 'expense_visibility_settings' as table_name, COUNT(*) as row_count FROM expense_visibility_settings;

-- Expected: 5 and 7 rows
