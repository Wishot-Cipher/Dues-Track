-- ============================================
-- IMPORT REAL STUDENTS
-- ============================================
-- Instructions:
-- 1. Replace the sample data below with your actual student records
-- 2. The default password for all students is their reg_number (e.g., CS/2021/001)
-- 3. Students will be required to change password on first login
-- 4. Run this file in Supabase SQL Editor after running schema.sql

-- Default password hash for demo (password = "changeme123")
-- In production, each student should have their reg_number as initial password
-- You'll need to generate proper bcrypt hashes

-- ============================================
-- METHOD 1: Direct SQL Insert (Small batches)
-- ============================================
-- Copy and paste this pattern for each student:

INSERT INTO students (reg_number, full_name, email, phone, level, department, section, password_hash, force_password_change) VALUES
('CS/2021/001', 'John Doe', 'john.doe@email.com', NULL, '200L', 'Computer Science', 'A', '$2a$10$XXXXXXXXXXX', true),
('CS/2021/002', 'Jane Smith', 'jane.smith@email.com', NULL, '200L', 'Computer Science', 'A', '$2a$10$XXXXXXXXXXX', true),
('CS/2021/003', 'Mike Brown', NULL, NULL, '200L', 'Computer Science', 'B', '$2a$10$XXXXXXXXXXX', true);
-- Add more students following the same pattern...


-- ============================================
-- METHOD 2: Bulk Import from CSV
-- ============================================
-- Step 1: Prepare a CSV file named 'students.csv' with this format:
-- 
-- reg_number,full_name,email,phone,level,department,section
-- CS/2021/001,John Doe,john.doe@email.com,,200L,Computer Science,A
-- CS/2021/002,Jane Smith,jane.smith@email.com,,200L,Computer Science,A
-- CS/2021/003,Mike Brown,,,200L,Computer Science,B
--
-- Step 2: Use Supabase Dashboard:
-- - Go to Table Editor → students table
-- - Click "Insert" → "Import data from CSV"
-- - Upload your CSV file
-- - Map columns correctly
-- - Set password_hash to default value (we'll update it next)

-- Step 3: After CSV import, run this to set default passwords:
UPDATE students 
SET 
    password_hash = '$2a$10$XXXXXXXXXXX', -- This will be replaced by actual hash
    force_password_change = true,
    is_active = true
WHERE password_hash IS NULL;


-- ============================================
-- METHOD 3: Using a Temporary Table (Recommended for 100+ students)
-- ============================================

-- Step 1: Create temporary table for import
CREATE TEMP TABLE temp_student_import (
    reg_number VARCHAR(50),
    full_name VARCHAR(255),
    email VARCHAR(255),
    phone VARCHAR(20),
    level VARCHAR(10),
    department VARCHAR(100),
    section VARCHAR(5)
);

-- Step 2: Copy your data here (or use CSV import to temp table)
INSERT INTO temp_student_import (reg_number, full_name, email, phone, level, department, section) VALUES
('CS/2021/001', 'John Doe', 'john.doe@email.com', '+234803123456', '200L', 'Computer Science', 'A'),
('CS/2021/002', 'Jane Smith', 'jane.smith@email.com', '+234803123457', '200L', 'Computer Science', 'A'),
('CS/2021/003', 'Mike Brown', 'mike.brown@email.com', NULL, '200L', 'Computer Science', 'B');
-- Add all your students here...

-- Step 3: Insert into main students table with default password
INSERT INTO students (
    reg_number, 
    full_name, 
    email, 
    phone, 
    level, 
    department, 
    section, 
    password_hash,
    force_password_change,
    is_active
)
SELECT 
    reg_number,
    full_name,
    email,
    phone,
    level,
    department,
    section,
    '$2a$10$XXXXXXXXXXX', -- Default password hash (will be replaced)
    true, -- Force password change on first login
    true  -- Account is active
FROM temp_student_import;

-- Step 4: Clean up
DROP TABLE temp_student_import;


-- ============================================
-- VERIFY THE IMPORT
-- ============================================
-- Check how many students were imported
SELECT 
    level,
    section,
    COUNT(*) as student_count
FROM students
GROUP BY level, section
ORDER BY level, section;

-- View all imported students
SELECT 
    reg_number,
    full_name,
    email,
    level,
    section,
    is_active,
    force_password_change
FROM students
ORDER BY reg_number;


-- ============================================
-- IMPORTANT NOTES
-- ============================================
-- 1. Password Hashing:
--    The password_hash above is a placeholder ($2a$10$XXXXXXXXXXX)
--    You need to generate actual bcrypt hashes for each student
--    Default password = student's reg_number
--    
--    To generate proper hashes, use the hash generator script
--    (see: scripts/generate_password_hashes.js)

-- 2. Email Requirement:
--    Email is optional during import but recommended
--    Students can add/update email in their profile

-- 3. Phone Number:
--    Optional field, can be NULL

-- 4. Force Password Change:
--    All imported students will be required to change password
--    on their first login

-- 5. Duplicate Prevention:
--    If you run this multiple times, you may get duplicate errors
--    The reg_number field is unique, so duplicates will be rejected
