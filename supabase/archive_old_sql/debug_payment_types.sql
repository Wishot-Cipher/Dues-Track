-- ============================================
-- DEBUG: Check Payment Types
-- ============================================

-- See ALL payment types in the database
SELECT 
  id,
  title,
  amount,
  deadline,
  is_active,
  target_levels,
  created_at
FROM payment_types
ORDER BY created_at DESC;

-- Check if deadline is in the future
SELECT 
  id,
  title,
  deadline,
  deadline > NOW() as is_future,
  is_active,
  target_levels
FROM payment_types
ORDER BY created_at DESC;

-- Update payment type to have future deadline (if needed)
-- Replace 'PAYMENT_TYPE_TITLE' with your actual payment type title
UPDATE payment_types
SET 
  deadline = NOW() + INTERVAL '30 days',
  is_active = true
WHERE title = 'PAYMENT_TYPE_TITLE';

-- Or update ALL payment types to have future deadlines
UPDATE payment_types
SET 
  deadline = NOW() + INTERVAL '30 days',
  is_active = true;

-- Verify the update
SELECT 
  id,
  title,
  deadline,
  deadline > NOW() as is_future,
  is_active,
  target_levels
FROM payment_types
ORDER BY created_at DESC;
