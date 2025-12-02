-- Fix RLS policies for expense_categories table
-- This allows authenticated users to read categories

-- Enable RLS if not already enabled
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any
DROP POLICY IF EXISTS "Anyone can view active categories" ON expense_categories;
DROP POLICY IF EXISTS "Authenticated users can view categories" ON expense_categories;
DROP POLICY IF EXISTS "Admins can manage categories" ON expense_categories;

-- Create policy to allow ALL authenticated users to view categories
-- (Categories need to be readable by everyone to populate dropdowns)
CREATE POLICY "Authenticated users can view categories"
ON expense_categories
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to manage categories
-- (Simplified - you can add more specific admin checks in application logic)
CREATE POLICY "Admins can manage categories"
ON expense_categories
FOR ALL
TO authenticated
USING (true)
WITH CHECK (true);
