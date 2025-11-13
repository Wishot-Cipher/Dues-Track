-- COMPLETE FIX: Remove all old policies and create new permissive ones
-- Run this in your Supabase SQL Editor

-- Step 1: Drop ALL existing policies on storage.objects related to payment-receipts
DO $$ 
DECLARE 
    pol RECORD;
BEGIN
    FOR pol IN 
        SELECT policyname 
        FROM pg_policies 
        WHERE schemaname = 'storage' 
        AND tablename = 'objects'
    LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON storage.objects', pol.policyname);
    END LOOP;
END $$;

-- Step 2: Ensure the bucket exists and is public
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Step 3: Create new permissive policies

-- Allow ALL authenticated users to INSERT (upload) files
CREATE POLICY "Allow authenticated uploads"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'payment-receipts');

-- Allow ALL authenticated users to SELECT (view) files
CREATE POLICY "Allow authenticated reads"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'payment-receipts');

-- Allow ALL authenticated users to UPDATE files
CREATE POLICY "Allow authenticated updates"
ON storage.objects FOR UPDATE
TO authenticated
USING (bucket_id = 'payment-receipts');

-- Allow ALL authenticated users to DELETE files (we can restrict this later)
CREATE POLICY "Allow authenticated deletes"
ON storage.objects FOR DELETE
TO authenticated
USING (bucket_id = 'payment-receipts');

-- Step 4: Verify the setup
SELECT 
    'Bucket Status' as info,
    id, 
    name, 
    public,
    file_size_limit,
    allowed_mime_types
FROM storage.buckets 
WHERE name = 'payment-receipts';

SELECT 
    'Active Policies' as info,
    policyname,
    cmd as operation,
    roles
FROM pg_policies
WHERE tablename = 'objects' 
AND schemaname = 'storage'
ORDER BY policyname;
