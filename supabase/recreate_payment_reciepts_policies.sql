-- Recreate storage policies for the 'payment-receipts' bucket
-- Run this in Supabase SQL Editor to allow authenticated users to upload
-- their own payment receipts while keeping delete restricted to admins.

-- Allow any authenticated user to INSERT into payment-receipts (uploads)
CREATE POLICY "Authenticated users can upload payment-receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'payment-receipts'
  );

-- Allow owners (uploaders) or admins to SELECT objects in payment-receipts
CREATE POLICY "Owners or admins can select payment-receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'payment-receipts' AND (
      auth.uid()::uuid = owner
      OR EXISTS (
        SELECT 1 FROM public.admins a
        WHERE a.student_id = auth.uid()::uuid
      )
    )
  );

-- Allow owners or admins to UPDATE metadata
CREATE POLICY "Owners or admins can update payment-receipts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'payment-receipts' AND (
      auth.uid()::uuid = owner
      OR EXISTS (
        SELECT 1 FROM public.admins a
        WHERE a.student_id = auth.uid()::uuid
      )
    )
  )
  WITH CHECK (
    bucket_id = 'payment-receipts'
  );

-- Only admins can DELETE from payment-receipts
CREATE POLICY "Admins can delete payment-receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'payment-receipts' AND
    EXISTS (
      SELECT 1 FROM public.admins a
      WHERE a.student_id = auth.uid()::uuid
      AND (
        a.role IN ('finsec', 'class_rep', 'admin')
        OR a.can_create_payments = true
        OR a.can_manage_students = true
      )
    )
  );

-- Diagnostics
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;
