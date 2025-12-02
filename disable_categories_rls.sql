-- Disable RLS on expense_categories table
-- Since your app uses custom auth (not Supabase Auth), RLS blocks all queries
ALTER TABLE expense_categories DISABLE ROW LEVEL SECURITY;

-- Verify it's disabled
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename = 'expense_categories';