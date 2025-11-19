-- Drop storage policies related to the 'expense-receipts' bucket
-- Run this in Supabase SQL Editor to remove any policies preventing
-- authenticated uploads/reads/updates/deletes for that bucket.

-- Safely drop known policy names (no-op if they don't exist)
DROP POLICY IF EXISTS "Admins can insert expense-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins (or owner) can select expense-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins (or owner) can update expense-receipts" ON storage.objects;
DROP POLICY IF EXISTS "Admins can delete expense-receipts" ON storage.objects;

-- Also drop any policy on storage.objects whose name contains 'expense-receipts'
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname ILIKE '%expense-receipts%'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects;', r.policyname);
  END LOOP;
END$$;

-- Helpful diagnostics: list remaining policies on storage.objects
SELECT policyname, cmd, roles
FROM pg_policies
WHERE schemaname = 'storage' AND tablename = 'objects'
ORDER BY policyname;

-- IMPORTANT:
-- Dropping these policies opens the bucket to the default behavior determined by
-- Supabase storage and Postgres permissions. After making changes you should re-create
-- secure policies that restrict INSERT/SELECT/UPDATE/DELETE to the intended admin roles.
