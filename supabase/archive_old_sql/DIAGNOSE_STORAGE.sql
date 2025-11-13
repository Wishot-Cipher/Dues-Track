-- Simple diagnostic: What's actually blocking the upload?
-- Run this in your Supabase SQL Editor

-- 1. Check if bucket exists
SELECT 
    'BUCKET CHECK' as step,
    CASE 
        WHEN EXISTS (SELECT 1 FROM storage.buckets WHERE id = 'payment-receipts') 
        THEN '✅ Bucket exists' 
        ELSE '❌ Bucket missing - CREATE IT!' 
    END as status,
    (SELECT public FROM storage.buckets WHERE id = 'payment-receipts') as is_public;

-- 2. Check RLS status on storage.objects
SELECT 
    'RLS CHECK' as step,
    CASE 
        WHEN rowsecurity THEN '⚠️ RLS is ENABLED (policies required)' 
        ELSE '✅ RLS is DISABLED (no policies needed)' 
    END as status
FROM pg_tables 
WHERE schemaname = 'storage' AND tablename = 'objects';

-- 3. Check what policies exist
SELECT 
    'POLICY CHECK' as step,
    COUNT(*) as policy_count,
    string_agg(policyname, ', ') as policy_names
FROM pg_policies
WHERE tablename = 'objects' 
AND schemaname = 'storage';

-- 4. Show all policy details
SELECT 
    policyname,
    cmd as operation,
    qual as using_clause,
    with_check as check_clause
FROM pg_policies
WHERE tablename = 'objects' 
AND schemaname = 'storage'
ORDER BY policyname;
