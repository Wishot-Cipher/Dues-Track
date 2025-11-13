-- Fresh setup for payments table
-- Run this in your Supabase SQL Editor

-- First, check if the table exists
SELECT 
    'Table Check' as test,
    CASE 
        WHEN EXISTS (
            SELECT 1 FROM information_schema.tables 
            WHERE table_schema = 'public' 
            AND table_name = 'payments'
        ) THEN '✅ Table exists'
        ELSE '❌ Table does not exist - need to create it'
    END as status;

-- If table exists, show its columns
SELECT 
    'Column Check' as test,
    column_name, 
    data_type,
    is_nullable
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'payments'
ORDER BY ordinal_position;

-- Drop and recreate the table (CAREFUL: This deletes existing data!)
DROP TABLE IF EXISTS payments CASCADE;

-- Create payments table with all required columns
CREATE TABLE payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  payment_type_id UUID NOT NULL REFERENCES payment_types(id) ON DELETE CASCADE,
  amount DECIMAL(10,2) NOT NULL CHECK (amount > 0),
  transaction_ref TEXT NOT NULL UNIQUE,
  receipt_url TEXT NOT NULL,
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  payment_method TEXT NOT NULL DEFAULT 'bank_transfer' CHECK (payment_method IN ('bank_transfer', 'cash', 'pos')),
  approved_by UUID REFERENCES students(id),
  approved_at TIMESTAMPTZ,
  rejection_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes
CREATE INDEX idx_payments_student_id ON payments(student_id);
CREATE INDEX idx_payments_payment_type_id ON payments(payment_type_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_created_at ON payments(created_at DESC);

-- Enable RLS
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Allow students to insert their own payments
CREATE POLICY "Students can create payments"
ON payments FOR INSERT
WITH CHECK (student_id = auth.uid());

-- Allow students to view their own payments
CREATE POLICY "Students can view own payments"
ON payments FOR SELECT
USING (student_id = auth.uid());

-- Allow admins to view all payments
CREATE POLICY "Admins can view all payments"
ON payments FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
  )
);

-- Allow admins to update payments (approve/reject)
CREATE POLICY "Admins can update payments"
ON payments FOR UPDATE
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()
  )
);

-- Verify the table was created
SELECT 
    'Final Check' as test,
    column_name, 
    data_type
FROM information_schema.columns
WHERE table_schema = 'public' 
AND table_name = 'payments'
ORDER BY ordinal_position;
