-- SIMPLIFIED FIX: Allow both authenticated and anon users
-- Run this in your Supabase SQL Editor

-- Drop the restrictive policies
DROP POLICY IF EXISTS "Allow authenticated uploads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated reads" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated updates" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated deletes" ON storage.objects;

-- Create SUPER permissive policies (for testing)
CREATE POLICY "Anyone can upload to payment-receipts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'payment-receipts');

CREATE POLICY "Anyone can read from payment-receipts"
ON storage.objects FOR SELECT
USING (bucket_id = 'payment-receipts');

CREATE POLICY "Anyone can update in payment-receipts"
ON storage.objects FOR UPDATE
USING (bucket_id = 'payment-receipts');

CREATE POLICY "Anyone can delete from payment-receipts"
ON storage.objects FOR DELETE
USING (bucket_id = 'payment-receipts');

-- Verify
SELECT policyname, cmd, roles
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage';
