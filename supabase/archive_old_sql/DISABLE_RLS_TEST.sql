-- NUCLEAR OPTION: Temporarily disable RLS on storage.objects to test
-- WARNING: This removes all security - ONLY for testing!
-- Run this in your Supabase SQL Editor

-- Check current RLS status
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'storage' AND tablename = 'objects';

-- Temporarily disable RLS (for testing only)
ALTER TABLE storage.objects DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'storage' AND tablename = 'objects';

-- Now try uploading in your app - it should work
-- After confirming upload works, come back and RE-ENABLE RLS:

-- ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
