-- Check RLS policies on expense_categories table
SELECT schemaname, tablename, policyname, permissive, roles, cmd, qual, with_check
FROM pg_policies
WHERE tablename = 'expense_categories';

-- Check if RLS is enabled
SELECT tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'expense_categories';

-- Try to select categories (should work if RLS allows)
SELECT id, name, description, icon, color, is_active
FROM expense_categories
WHERE is_active = true
ORDER BY name;
