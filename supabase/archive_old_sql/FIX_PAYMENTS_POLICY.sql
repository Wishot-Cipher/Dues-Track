-- Fix payments table RLS policies
-- Run this in your Supabase SQL Editor

-- Drop existing policies
DROP POLICY IF EXISTS "Students can create payments" ON payments;
DROP POLICY IF EXISTS "Students can view own payments" ON payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON payments;
DROP POLICY IF EXISTS "Admins can update payments" ON payments;

-- Create super permissive policies for testing (we'll lock down later)
CREATE POLICY "Anyone authenticated can insert payments"
ON payments FOR INSERT
TO authenticated
WITH CHECK (true);

CREATE POLICY "Anyone authenticated can view payments"
ON payments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Anyone authenticated can update payments"
ON payments FOR UPDATE
TO authenticated
USING (true);

-- Verify
SELECT tablename, policyname, cmd, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'payments'
ORDER BY policyname;
