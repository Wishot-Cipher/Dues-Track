-- Temporarily disable RLS on payments table for testing
-- Run this in your Supabase SQL Editor

-- Disable RLS (for testing only!)
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE schemaname = 'public' AND tablename = 'payments';

-- Now try submitting a payment in your app
-- It should work!

-- After confirming it works, you can re-enable RLS later:
-- ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
