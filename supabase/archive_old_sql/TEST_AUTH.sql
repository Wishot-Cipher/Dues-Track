-- Debug authentication and permissions
-- Run this in your Supabase SQL Editor while logged into your app

-- Check current auth status
SELECT 
    'Auth Check' as test,
    auth.uid() as user_id,
    auth.role() as current_role,
    CASE 
        WHEN auth.uid() IS NOT NULL THEN '✅ Authenticated'
        ELSE '❌ Not authenticated'
    END as status;

-- Check if storage policies see the user as authenticated
SELECT 
    'Role Check' as test,
    current_user as database_user,
    session_user as session_user;

-- Test the INSERT policy manually
-- This simulates what happens when you try to upload
SELECT 
    'Policy Test' as test,
    CASE 
        WHEN auth.role() = 'authenticated' THEN '✅ Role is authenticated'
        WHEN auth.role() = 'anon' THEN '⚠️ Role is anon (not logged in)'
        ELSE '❌ Unknown role: ' || COALESCE(auth.role()::text, 'NULL')
    END as policy_result;
