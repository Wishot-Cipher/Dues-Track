-- Check if payments were successfully saved
-- Run this in your Supabase SQL Editor

-- View all payments
SELECT 
    id,
    student_id,
    payment_type_id,
    amount,
    transaction_ref,
    status,
    payment_method,
    created_at,
    receipt_url
FROM payments
ORDER BY created_at DESC
LIMIT 10;

-- Count total payments
SELECT 
    'Total Payments' as info,
    COUNT(*) as count,
    SUM(amount) as total_amount
FROM payments;

-- Count by status
SELECT 
    status,
    COUNT(*) as count,
    SUM(amount) as total_amount
FROM payments
GROUP BY status;
