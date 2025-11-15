-- Migration: Add unique constraint to admins table to prevent duplicate roles per student

ALTER TABLE admins
  ADD CONSTRAINT unique_admin_role_per_student
  UNIQUE (student_id, role);

-- Optional: Ensure no existing duplicates before applying; if duplicates exist, this migration will fail.
-- Check and handle duplicates accordingly before running this migration in production.
