-- Secure RLS Policies - Proper Setup
-- Run this in your Supabase SQL Editor

-- ============================================
-- 1. RE-ENABLE RLS on payments table
-- ============================================
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 2. Create Proper Policies for Payments Table
-- ============================================

-- Drop any existing policies
DROP POLICY IF EXISTS "Anyone authenticated can insert payments" ON payments;
DROP POLICY IF EXISTS "Anyone authenticated can view payments" ON payments;
DROP POLICY IF EXISTS "Anyone authenticated can update payments" ON payments;

-- Allow any authenticated user to INSERT payments
-- (We verify the student_id matches in the application layer)
CREATE POLICY "Authenticated users can insert payments"
ON payments FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow users to view their own payments
CREATE POLICY "Users can view own payments"
ON payments FOR SELECT
TO authenticated
USING (student_id = auth.uid());

-- Allow admins to view ALL payments
CREATE POLICY "Admins view all payments"
ON payments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
  )
);

-- Allow admins to UPDATE payments (approve/reject)
CREATE POLICY "Admins can update payments"
ON payments FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
  )
);

-- ============================================
-- 3. Secure Storage Policies
-- ============================================

-- Drop the "anyone" policies
DROP POLICY IF EXISTS "Anyone can upload to payment-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can read from payment-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can update in payment-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can delete from payment-receipts" ON storage.objects;

-- Create authenticated-only policies
CREATE POLICY "Authenticated users can upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-receipts');

CREATE POLICY "Authenticated users can view receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'payment-receipts');

-- Only admins can delete
CREATE POLICY "Admins can delete receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'payment-receipts' AND
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
  )
);

-- ============================================
-- 4. Verify Setup
-- ============================================

-- Check RLS is enabled
SELECT 
  'RLS Status' as check_type,
  tablename, 
  rowsecurity as rls_enabled
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'payments';

-- Check payment policies
SELECT 
  'Payment Policies' as check_type,
  policyname,
  cmd as operation,
  roles
FROM pg_policies
WHERE tablename = 'payments'
ORDER BY policyname;

-- Check storage policies
SELECT 
  'Storage Policies' as check_type,
  policyname,
  cmd as operation,
  roles
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage'
ORDER BY policyname;
