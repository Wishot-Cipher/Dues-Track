-- Check if expense_categories table exists and view its structure
SELECT table_name, column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'expense_categories'
ORDER BY ordinal_position;

-- Check if there are any categories already
SELECT * FROM expense_categories;
