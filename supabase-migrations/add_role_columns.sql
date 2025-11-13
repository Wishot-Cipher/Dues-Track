-- Add is_admin and is_finsec columns to students table
-- Run this in your Supabase SQL Editor

-- Add the columns if they don't exist
ALTER TABLE students 
ADD COLUMN IF NOT EXISTS is_admin BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS is_finsec BOOLEAN DEFAULT FALSE;

-- Create an index for better query performance
CREATE INDEX IF NOT EXISTS idx_students_is_admin ON students(is_admin);
CREATE INDEX IF NOT EXISTS idx_students_is_finsec ON students(is_finsec);

-- Note: All existing students will have is_admin = FALSE and is_finsec = FALSE by default
-- You'll need to manually update admin and finsec users after running this migration
