-- Check storage bucket setup
-- Run this in your Supabase SQL Editor to diagnose the issue

-- 1. Check if bucket exists and is public
SELECT id, name, public, file_size_limit, allowed_mime_types
FROM storage.buckets 
WHERE name = 'payment-receipts';

-- 2. Check all policies on storage.objects
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'objects' AND schemaname = 'storage'
ORDER BY policyname;

-- 3. Check if RLS is enabled on storage.objects (it should be)
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'storage' AND tablename = 'objects';
