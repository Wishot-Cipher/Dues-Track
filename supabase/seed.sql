-- ============================================
-- SEED DATA FOR TESTING
-- ============================================
-- NOTE: For importing real students, see supabase/import_students.sql
--       and scripts/generate_password_hashes.js

-- Insert sample students (for testing only)
-- Default password for each student: their reg_number (e.g., CS/2021/001)
-- The hash below is for "changeme123" - in production, use actual reg_number hashes
-- Students will be forced to change password on first login
INSERT INTO students (id, reg_number, full_name, email, phone, level, department, section, password_hash, force_password_change) VALUES
('550e8400-e29b-41d4-a716-446655440001', 'CS/2021/001', 'John Doe', 'john.doe@email.com', '+234803123456', '200L', 'Computer Science', 'A', '$2a$10$N9qo8uLOickgx2ZMRZoMye1VYpqVQGVJQvrcNJVq6T0S6p4RLJZTa', true),
('550e8400-e29b-41d4-a716-446655440002', 'CS/2021/002', 'Jane Smith', 'jane.smith@email.com', '+234803123457', '200L', 'Computer Science', 'A', '$2a$10$N9qo8uLOickgx2ZMRZoMye1VYpqVQGVJQvrcNJVq6T0S6p4RLJZTa', true),
('550e8400-e29b-41d4-a716-446655440003', 'CS/2021/003', 'Mike Brown', 'mike.brown@email.com', '+234803123458', '200L', 'Computer Science', 'B', '$2a$10$N9qo8uLOickgx2ZMRZoMye1VYpqVQGVJQvrcNJVq6T0S6p4RLJZTa', true),
('550e8400-e29b-41d4-a716-446655440004', 'CS/2021/004', 'Sarah Lee', 'sarah.lee@email.com', '+234803123459', '200L', 'Computer Science', 'B', '$2a$10$N9qo8uLOickgx2ZMRZoMye1VYpqVQGVJQvrcNJVq6T0S6p4RLJZTa', true),
('550e8400-e29b-41d4-a716-446655440005', 'CS/2021/005', 'David Wilson', 'david.wilson@email.com', '+234803123460', '300L', 'Computer Science', 'A', '$2a$10$N9qo8uLOickgx2ZMRZoMye1VYpqVQGVJQvrcNJVq6T0S6p4RLJZTa', true);

-- Insert sample admins
INSERT INTO admins (id, student_id, role, can_create_payments, can_approve_payments, can_manage_students, can_view_analytics) VALUES
('650e8400-e29b-41d4-a716-446655440001', '550e8400-e29b-41d4-a716-446655440001', 'financial_secretary', true, true, true, true),
('650e8400-e29b-41d4-a716-446655440002', '550e8400-e29b-41d4-a716-446655440002', 'class_rep', true, true, false, false);

-- Insert sample payment types
INSERT INTO payment_types (id, title, description, category, amount, allow_partial, deadline, bank_name, account_name, account_number, created_by, approver_id, target_levels) VALUES
('750e8400-e29b-41d4-a716-446655440001', 'First Semester Dues 2024/2025', 'Mandatory semester dues for all 200L students', 'semester_dues', 5000.00, false, '2024-12-31', 'First Bank PLC', 'CS Dept Account', '1234567890', '650e8400-e29b-41d4-a716-446655440001', '650e8400-e29b-41d4-a716-446655440001', ARRAY['200L']),
('750e8400-e29b-41d4-a716-446655440002', 'CS 200L Project Materials', 'Payment for final year project materials', 'projects', 3500.00, true, '2024-12-15', 'First Bank PLC', 'CS 200L Class Rep', '9876543210', '650e8400-e29b-41d4-a716-446655440002', '650e8400-e29b-41d4-a716-446655440002', ARRAY['200L']);

-- Insert sample payments
INSERT INTO payments (student_id, payment_type_id, amount_paid, payment_method, transaction_ref, status, reviewed_by, reviewed_at) VALUES
('550e8400-e29b-41d4-a716-446655440001', '750e8400-e29b-41d4-a716-446655440001', 5000.00, 'bank_transfer', 'TRF/2024/001', 'approved', '650e8400-e29b-41d4-a716-446655440001', NOW()),
('550e8400-e29b-41d4-a716-446655440002', '750e8400-e29b-41d4-a716-446655440001', 5000.00, 'cash', 'CASH/2024/001', 'approved', '650e8400-e29b-41d4-a716-446655440001', NOW()),
('550e8400-e29b-41d4-a716-446655440003', '750e8400-e29b-41d4-a716-446655440002', 1750.00, 'bank_transfer', 'TRF/2024/002', 'partial', '650e8400-e29b-41d4-a716-446655440002', NOW());

-- Insert sample expenses
INSERT INTO expenses (payment_type_id, title, description, category, amount, expense_date, recorded_by) VALUES
('750e8400-e29b-41d4-a716-446655440002', 'Arduino Kits Purchase', 'Purchased 20 Arduino Uno kits for student projects', 'materials', 45000.00, '2024-11-12', '650e8400-e29b-41d4-a716-446655440002');
