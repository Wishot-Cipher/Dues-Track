-- Fix Notifications Table and Policies
-- This ensures notifications work properly

-- 1. Enable RLS on notifications table
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;

-- 2. Drop existing policies if they exist
DROP POLICY IF EXISTS notifications_select_own ON notifications;
DROP POLICY IF EXISTS notifications_update_own ON notifications;
DROP POLICY IF EXISTS notifications_insert_admin ON notifications;
DROP POLICY IF EXISTS notifications_insert_system ON notifications;

-- 3. Create correct policies

-- Students can read their own notifications
CREATE POLICY notifications_select_own ON notifications
  FOR SELECT 
  USING (recipient_id = auth.uid());

-- Students can update their own notifications (mark as read)
CREATE POLICY notifications_update_own ON notifications
  FOR UPDATE 
  USING (recipient_id = auth.uid());

-- Admins can insert notifications for any user
CREATE POLICY notifications_insert_admin ON notifications
  FOR INSERT 
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM admins WHERE student_id = auth.uid()
    )
  );

-- System can insert notifications (for automated notifications)
CREATE POLICY notifications_insert_system ON notifications
  FOR INSERT 
  WITH CHECK (true);

-- 4. Verify RLS is enabled
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'notifications';

-- 5. List all policies
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies 
WHERE tablename = 'notifications';
