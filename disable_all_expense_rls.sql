-- Disable RLS on all expense-related tables
ALTER TABLE expense_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE expense_audit_log DISABLE ROW LEVEL SECURITY;
ALTER TABLE expense_budgets DISABLE ROW LEVEL SECURITY;

-- Verify
SELECT tablename, rowsecurity 
FROM pg_tables 
WHERE tablename IN ('expense_categories', 'expenses', 'expense_audit_log', 'expense_budgets');