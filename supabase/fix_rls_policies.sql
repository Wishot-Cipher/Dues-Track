-- Fix RLS Policies for Admin Settings Tables
-- Run this in Supabase SQL Editor to allow admins to manage settings

-- ============================================
-- FIX: student_feature_settings RLS
-- ============================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Students can view feature settings" ON student_feature_settings;
DROP POLICY IF EXISTS "Admins can update feature settings" ON student_feature_settings;

-- Allow everyone to SELECT (read settings)
CREATE POLICY "Anyone authenticated can view feature settings"
  ON student_feature_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow admins to UPDATE settings
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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.student_id = auth.uid()
      AND admins.can_manage_students = true
    )
  );

-- Allow admins to INSERT new settings (optional, for future features)
CREATE POLICY "Admins can insert feature settings"
  ON student_feature_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.student_id = auth.uid()
      AND admins.can_manage_students = true
    )
  );

-- ============================================
-- FIX: expense_visibility_settings RLS
-- ============================================

-- Drop existing restrictive policies
DROP POLICY IF EXISTS "Students can view expense visibility settings" ON expense_visibility_settings;
DROP POLICY IF EXISTS "Admins can update expense visibility settings" ON expense_visibility_settings;

-- Allow everyone to SELECT (read settings)
CREATE POLICY "Anyone authenticated can view expense visibility settings"
  ON expense_visibility_settings
  FOR SELECT
  TO authenticated
  USING (true);

-- Allow admins to UPDATE settings
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
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.student_id = auth.uid()
      AND admins.can_manage_students = true
    )
  );

-- Allow admins to INSERT new settings (optional, for future settings)
CREATE POLICY "Admins can insert expense visibility settings"
  ON expense_visibility_settings
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins
      WHERE admins.student_id = auth.uid()
      AND admins.can_manage_students = true
    )
  );

-- ============================================
-- VERIFY POLICIES
-- ============================================

-- Check student_feature_settings policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'student_feature_settings';

-- Check expense_visibility_settings policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies 
WHERE tablename = 'expense_visibility_settings';

-- ============================================
-- TEST YOUR ADMIN ACCESS
-- ============================================

-- Check if you're an admin with can_manage_students
SELECT 
  admins.id,
  admins.student_id,
  admins.can_manage_students,
  admins.role,
  students.full_name
FROM admins 
LEFT JOIN students ON students.id = admins.student_id
WHERE admins.student_id = auth.uid();

-- If the query above returns a row with can_manage_students = true, you're good!
-- If it returns nothing or can_manage_students = false, you need to grant yourself permission first.

-- ============================================
-- OPTIONAL: Grant yourself admin permissions if needed
-- ============================================

-- If you don't have can_manage_students permission, run this:
-- (Replace 'YOUR_USER_ID_HERE' with your actual student ID from auth.uid())

-- UPDATE admins 
-- SET can_manage_students = true 
-- WHERE student_id = 'YOUR_USER_ID_HERE';

-- Or grant all permissions:
-- UPDATE admins 
-- SET 
--   can_manage_students = true,
--   can_approve_payments = true,
--   can_create_payments = true,
--   can_view_analytics = true
-- WHERE student_id = auth.uid();

