-- Migration: Fix Notification Links
-- This migration updates the notify_payment_status function to use the correct route
-- The route should be /payment/{id} (singular) not /payments/{id} (plural)
-- Run this in your Supabase SQL Editor

-- Drop and recreate the function with correct links
CREATE OR REPLACE FUNCTION notify_payment_status()
RETURNS TRIGGER AS $$
BEGIN
  IF TG_OP = 'UPDATE' AND OLD.status != NEW.status THEN
    IF NEW.status = 'approved' THEN
      PERFORM send_notification(
        NEW.student_id,
        'Payment Approved! ✅',
        'Your payment has been approved and confirmed.',
        'payment_approved',
        '/payment/' || NEW.id  -- Fixed: was /payments/ now /payment/
      );
    ELSIF NEW.status = 'rejected' THEN
      PERFORM send_notification(
        NEW.student_id,
        'Payment Rejected ❌',
        'Your payment was rejected. Reason: ' || COALESCE(NEW.rejection_reason, 'Not specified'),
        'payment_rejected',
        '/payment/' || NEW.id  -- Fixed: was /payments/ now /payment/
      );
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Optional: Fix existing notification links in database
-- This updates any existing notifications that have the wrong link format
UPDATE notifications
SET link = REGEXP_REPLACE(link, '^/payments/([a-f0-9-]+)$', '/payment/\1')
WHERE link ~ '^/payments/[a-f0-9-]+$';

-- Verify the changes (optional - comment out if not needed)
-- SELECT id, link FROM notifications WHERE link LIKE '/payment%' LIMIT 10;
