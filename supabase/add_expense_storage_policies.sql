-- Add storage RLS policies for the 'expense-receipts' bucket
-- Run this in your Supabase SQL Editor (or via psql with the right credentials)

-- Drop any pre-existing policies for this bucket (safe to run)
DROP POLICY IF EXISTS "Authenticated users can insert expense-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can select expense-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete expense-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update expense-receipts" ON storage.objects;

-- Only allow admins (financial_secretary, class_rep, admin) or users with
-- explicit upload permission to insert objects into this bucket. This
-- restricts who can add expense receipts.
CREATE POLICY "Admins can insert expense-receipts"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'expense-receipts' AND
    EXISTS (
      SELECT 1 FROM admins a
      WHERE a.student_id = auth.uid()::uuid
      AND (
        -- specific roles
        a.role IN ('financial_secretary', 'class_rep', 'admin')
        -- OR explicit permission
        OR a.can_create_payments = true
        OR a.can_manage_students = true
      )
    )
  );

-- Allow admins (same check) to SELECT, and also allow the owner of the
-- object to read the file. This enables admins to view all receipts while
-- allowing uploaders to view what they uploaded.
CREATE POLICY "Admins (or owner) can select expense-receipts"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'expense-receipts' AND (
      auth.uid()::uuid = owner
      OR EXISTS (
        SELECT 1 FROM admins a
        WHERE a.student_id = auth.uid()::uuid
        AND (
          a.role IN ('financial_secretary', 'class_rep', 'admin')
          OR a.can_create_payments = true
          OR a.can_manage_students = true
        )
      )
    )
  );

-- Allow admins to update if they meet the same admin predicate, and allow
-- owners to update their own metadata.
CREATE POLICY "Admins (or owner) can update expense-receipts"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (
    bucket_id = 'expense-receipts' AND (
      auth.uid()::uuid = owner
      OR EXISTS (
        SELECT 1 FROM admins a
        WHERE a.student_id = auth.uid()::uuid
        AND (
          a.role IN ('financial_secretary', 'class_rep', 'admin')
          OR a.can_create_payments = true
          OR a.can_manage_students = true
        )
      )
    )
  )
  WITH CHECK (
    bucket_id = 'expense-receipts'
  );

CREATE POLICY "Admins can delete expense-receipts"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'expense-receipts' AND
    EXISTS (
      SELECT 1 FROM admins a
      WHERE a.student_id = auth.uid()::uuid
      AND (
        a.role IN ('financial_secretary', 'class_rep', 'admin')
        OR a.can_create_payments = true
        OR a.can_manage_students = true
      )
    )
  );

-- Optional: if you want users to be able to generate signed URLs from the client
-- keep the bucket private and ensure the client is authenticated; if the bucket
-- is public, remove these policies or make bucket public from the dashboard.

-- Reversion SQL (run to revert to original state)
-- DROP POLICY IF EXISTS "Authenticated users can insert expense-receipts" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated users can select expense-receipts" ON storage.objects;
-- DROP POLICY IF EXISTS "Admins can delete expense-receipts" ON storage.objects;
-- DROP POLICY IF EXISTS "Authenticated users can update expense-receipts" ON storage.objects;

-- Note: After making these changes, make sure your client sets a Supabase auth session
-- for the user (auth.uid()) before trying to upload or create signed URLs.
