-- Comprehensive Notification System Test
-- Run this step by step in Supabase SQL Editor

-- STEP 1: Check if notifications table exists and has correct structure
SELECT 
  column_name, 
  data_type, 
  is_nullable
FROM information_schema.columns
WHERE table_name = 'notifications'
ORDER BY ordinal_position;

-- STEP 2: Check if RLS is enabled
SELECT 
  tablename,
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' 
  AND tablename = 'notifications';

-- STEP 3: List all notification policies
SELECT 
  policyname,
  permissive,
  cmd as command_type,
  qual as using_expression,
  with_check as with_check_expression
FROM pg_policies 
WHERE tablename = 'notifications';

-- STEP 4: Count existing notifications
SELECT COUNT(*) as total_notifications FROM notifications;

-- STEP 5: Count notifications by type
SELECT 
  type,
  COUNT(*) as count,
  COUNT(CASE WHEN is_read THEN 1 END) as read_count,
  COUNT(CASE WHEN NOT is_read THEN 1 END) as unread_count
FROM notifications
GROUP BY type
ORDER BY count DESC;

-- STEP 6: View recent notifications with student info
SELECT 
  n.id,
  n.title,
  n.message,
  n.type,
  n.is_read,
  n.created_at,
  s.full_name as recipient_name,
  s.email as recipient_email,
  s.reg_number
FROM notifications n
JOIN students s ON s.id = n.recipient_id
ORDER BY n.created_at DESC
LIMIT 10;

-- STEP 7: Check for orphaned notifications (recipient doesn't exist)
SELECT COUNT(*) as orphaned_notifications
FROM notifications n
LEFT JOIN students s ON s.id = n.recipient_id
WHERE s.id IS NULL;
