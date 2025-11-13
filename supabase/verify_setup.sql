-- Verification Script: Check Payment Submission Setup
-- Run this to verify everything is configured correctly

-- 1. Check if payments table exists
SELECT 
  'Payments table exists: ' || 
  CASE WHEN EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'payments'
  ) THEN '✅ YES' ELSE '❌ NO - Run create_payments_table.sql' END as status;

-- 2. Check payments table columns
SELECT 
  'Payments table has ' || COUNT(*) || ' columns' as column_count
FROM information_schema.columns
WHERE table_name = 'payments';

-- 3. List all columns in payments table
SELECT 
  column_name,
  data_type,
  is_nullable,
  column_default
FROM information_schema.columns
WHERE table_name = 'payments'
ORDER BY ordinal_position;

-- 4. Check if storage bucket exists
SELECT 
  'Storage bucket exists: ' ||
  CASE WHEN EXISTS (
    SELECT 1 FROM storage.buckets 
    WHERE id = 'payment-receipts'
  ) THEN '✅ YES' ELSE '❌ NO - Run create_storage_bucket.sql' END as status;

-- 5. Check storage bucket is public
SELECT 
  id,
  name,
  public as is_public,
  created_at
FROM storage.buckets
WHERE id = 'payment-receipts';

-- 6. Check RLS policies on payments table
SELECT 
  schemaname,
  tablename,
  policyname,
  permissive,
  roles,
  cmd
FROM pg_policies
WHERE tablename = 'payments'
ORDER BY policyname;

-- 7. Count existing payments
SELECT 
  'Total payments in database: ' || COUNT(*) as count
FROM payments;

-- 8. Count pending payments
SELECT 
  'Pending payments: ' || COUNT(*) as count
FROM payments
WHERE status = 'pending';

-- 9. Check payment_types exist and are active
SELECT 
  'Active payment types: ' || COUNT(*) as count
FROM payment_types
WHERE is_active = true;

-- 10. List active payment types
SELECT 
  id,
  title,
  amount,
  deadline,
  target_levels,
  is_active,
  created_at
FROM payment_types
WHERE is_active = true
ORDER BY created_at DESC;

-- 11. Check if current user has any payments
SELECT 
  'Your payments: ' || COUNT(*) as count
FROM payments
WHERE student_id = auth.uid()::uuid;

-- 12. Check admins table (for approval)
SELECT 
  'Admin users: ' || COUNT(*) as count
FROM admins;

-- Final Summary
SELECT 
  '═══════════════════════════════════════' as separator
UNION ALL
SELECT 'SETUP VERIFICATION COMPLETE!' as separator
UNION ALL
SELECT '═══════════════════════════════════════' as separator
UNION ALL
SELECT 'If all checks show ✅, you are ready to test!' as separator
UNION ALL
SELECT 'If any checks show ❌, run the corresponding SQL file' as separator;

-- Show next steps
SELECT 
  '📝 Next Steps:' as next_steps
UNION ALL
SELECT '1. Login to the app' as next_steps
UNION ALL
SELECT '2. View dashboard' as next_steps
UNION ALL
SELECT '3. Click PAY NOW on a payment' as next_steps
UNION ALL
SELECT '4. Fill form and upload receipt' as next_steps
UNION ALL
SELECT '5. Submit payment' as next_steps
UNION ALL
SELECT '6. Check payments table for new record' as next_steps;
