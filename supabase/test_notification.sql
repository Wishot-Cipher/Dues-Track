-- Test Notification Creation
-- Run this in Supabase SQL Editor to create a test notification

-- First, get your student ID
-- Replace 'YOUR_EMAIL_HERE' with your actual email
WITH student_info AS (
  SELECT id, full_name FROM students WHERE email = 'YOUR_EMAIL_HERE'
)

-- Insert a test notification
INSERT INTO notifications (recipient_id, type, title, message, is_read)
SELECT 
  id,
  'payment_approved',
  '✅ Test Notification',
  'This is a test notification to verify your notification system is working! If you can see this, notifications are configured correctly.',
  false
FROM student_info;

-- Verify the notification was created
SELECT 
  n.id,
  n.title,
  n.message,
  n.type,
  n.is_read,
  n.created_at,
  s.full_name as recipient_name,
  s.email as recipient_email
FROM notifications n
JOIN students s ON s.id = n.recipient_id
WHERE s.email = 'YOUR_EMAIL_HERE'
ORDER BY n.created_at DESC
LIMIT 5;
