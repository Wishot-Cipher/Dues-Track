-- ========================================
-- PAYMENT ISOLATION TEST QUERIES
-- Run these in your Supabase SQL Editor
-- ========================================

-- ==========================================
-- QUERY 1: See all students and their payment counts
-- ==========================================
SELECT 
  s.full_name,
  s.reg_number,
  s.level,
  COUNT(p.id) as payment_count,
  SUM(CASE WHEN p.status = 'approved' THEN p.amount ELSE 0 END) as total_approved,
  SUM(CASE WHEN p.status = 'pending' THEN p.amount ELSE 0 END) as total_pending
FROM students s
LEFT JOIN payments p ON s.id = p.student_id
GROUP BY s.id, s.full_name, s.reg_number, s.level
ORDER BY s.full_name;

-- ==========================================
-- QUERY 2: See ALL payments with student details
-- ==========================================
SELECT 
  p.id as payment_id,
  s.full_name as student_name,
  s.reg_number,
  pt.title as payment_type,
  p.amount,
  p.status,
  p.student_id,
  p.created_at
FROM payments p
JOIN students s ON p.student_id = s.id
JOIN payment_types pt ON p.payment_type_id = pt.id
ORDER BY p.created_at DESC;

-- ==========================================
-- QUERY 3: Check if any student sees other students' payments
-- (This should return 0 rows if isolation is working)
-- ==========================================
SELECT 
  p1.id,
  s1.full_name as payment_student,
  s2.full_name as different_student,
  p1.student_id,
  s2.id as other_student_id
FROM payments p1
JOIN students s1 ON p1.student_id = s1.id
CROSS JOIN students s2
WHERE s2.id != s1.id
  AND p1.student_id != s2.id;
-- If this returns rows, there's a problem!

-- ==========================================
-- QUERY 4: Get payment summary per student per payment type
-- ==========================================
SELECT 
  s.full_name,
  s.reg_number,
  pt.title as payment_type,
  COUNT(p.id) as number_of_payments,
  SUM(CASE WHEN p.status = 'approved' THEN p.amount ELSE 0 END) as total_paid,
  pt.amount as required_amount,
  pt.amount - SUM(CASE WHEN p.status = 'approved' THEN p.amount ELSE 0 END) as remaining
FROM students s
CROSS JOIN payment_types pt
LEFT JOIN payments p ON s.id = p.student_id AND pt.id = p.payment_type_id
WHERE pt.is_active = true
  AND pt.target_levels @> ARRAY[s.level]
GROUP BY s.id, s.full_name, s.reg_number, pt.id, pt.title, pt.amount
ORDER BY s.full_name, pt.title;

-- ==========================================
-- QUERY 5: Test specific student (REPLACE THE EMAIL)
-- ==========================================
SELECT 
  s.full_name,
  s.reg_number,
  s.email,
  pt.title as payment_type,
  p.amount,
  p.status,
  p.created_at
FROM students s
JOIN payments p ON s.id = p.student_id
JOIN payment_types pt ON p.payment_type_id = pt.id
WHERE s.email = 'REPLACE_WITH_STUDENT_EMAIL@example.com'  -- Change this!
ORDER BY p.created_at DESC;

-- ==========================================
-- QUERY 6: Verify payment isolation by student ID
-- ==========================================
SELECT 
  student_id,
  COUNT(*) as payment_count,
  COUNT(DISTINCT student_id) as unique_students  -- Should always be 1 per group
FROM payments
GROUP BY student_id
HAVING COUNT(DISTINCT student_id) > 1;  -- Should return 0 rows
-- If this returns rows, isolation is broken!

-- ==========================================
-- QUERY 7: See who has paid what (detailed breakdown)
-- ==========================================
SELECT 
  s.full_name,
  s.reg_number,
  json_agg(
    json_build_object(
      'payment_type', pt.title,
      'amount', p.amount,
      'status', p.status,
      'date', p.created_at
    ) ORDER BY p.created_at DESC
  ) as payments
FROM students s
LEFT JOIN payments p ON s.id = p.student_id
LEFT JOIN payment_types pt ON p.payment_type_id = pt.id
GROUP BY s.id, s.full_name, s.reg_number
ORDER BY s.full_name;
