-- Fix storage bucket policies for payment receipts
-- Run this in your Supabase SQL Editor

-- First, drop existing policies if any
DROP POLICY IF EXISTS "Students can upload their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Students can view their own receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can view all receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete receipts" ON storage.objects;

-- Ensure the bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Allow authenticated users to upload receipts
-- This allows uploads to paths like: receipts/user-id_timestamp.jpg OR user-id/filename.jpg
CREATE POLICY "Students can upload receipts"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'payment-receipts'
);

-- Allow authenticated users to view receipts (students see all for now, we'll filter in app)
CREATE POLICY "Students can view receipts"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'payment-receipts');

-- Allow authenticated users to update their receipts
CREATE POLICY "Students can update receipts"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'payment-receipts');

-- Allow admins to delete receipts
CREATE POLICY "Admins can delete receipts"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'payment-receipts' AND
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()::uuid
  )
);

-- Verify the policies
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage'
ORDER BY policyname;
