-- ============================================
-- MIGRATION: Add force_password_change column
-- ============================================
-- Run this if you already have the students table created

-- Add the force_password_change column if it doesn't exist
DO $$ 
BEGIN
    IF NOT EXISTS (
        SELECT 1 
        FROM information_schema.columns 
        WHERE table_name = 'students' 
        AND column_name = 'force_password_change'
    ) THEN
        ALTER TABLE students 
        ADD COLUMN force_password_change BOOLEAN DEFAULT false;
        
        -- Update comment
        COMMENT ON COLUMN students.force_password_change IS 'Forces user to change password on next login';
        
        RAISE NOTICE 'Column force_password_change added successfully';
    ELSE
        RAISE NOTICE 'Column force_password_change already exists';
    END IF;
END $$;

-- Verify the column was added
SELECT 
    column_name, 
    data_type, 
    column_default,
    is_nullable
FROM information_schema.columns
WHERE table_name = 'students' 
AND column_name = 'force_password_change';
