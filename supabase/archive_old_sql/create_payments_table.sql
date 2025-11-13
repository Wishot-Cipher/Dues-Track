-- Migration: Add payments table if it doesn't exist
-- Run this in Supabase SQL Editor

-- Create payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  student_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  payment_type_id UUID NOT NULL REFERENCES payment_types(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  transaction_ref TEXT NOT NULL,
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

-- Create indexes for better query performance
CREATE INDEX IF NOT EXISTS idx_payments_student_id ON payments(student_id);
CREATE INDEX IF NOT EXISTS idx_payments_payment_type_id ON payments(payment_type_id);
CREATE INDEX IF NOT EXISTS idx_payments_status ON payments(status);
CREATE INDEX IF NOT EXISTS idx_payments_created_at ON payments(created_at DESC);

-- Add unique constraint on transaction reference to prevent duplicates
CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_transaction_ref ON payments(transaction_ref);

-- Create updated_at trigger
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_payments_updated_at ON payments;
CREATE TRIGGER update_payments_updated_at
  BEFORE UPDATE ON payments
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Enable RLS (Row Level Security)
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Students can view their own payments" ON payments;
DROP POLICY IF EXISTS "Students can insert their own payments" ON payments;
DROP POLICY IF EXISTS "Admins can view all payments" ON payments;
DROP POLICY IF EXISTS "Admins can update payment status" ON payments;

-- Policy: Students can view their own payments
CREATE POLICY "Students can view their own payments"
ON payments FOR SELECT
TO authenticated
USING (student_id = auth.uid()::uuid);

-- Policy: Students can insert their own payments
CREATE POLICY "Students can insert their own payments"
ON payments FOR INSERT
TO authenticated
WITH CHECK (student_id = auth.uid()::uuid);

-- Policy: Admins can view all payments
CREATE POLICY "Admins can view all payments"
ON payments FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()::uuid
  )
);

-- Policy: Admins can update payment status (approve/reject)
CREATE POLICY "Admins can update payment status"
ON payments FOR UPDATE
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()::uuid
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM admins
    WHERE student_id = auth.uid()::uuid
  )
);

-- Grant permissions
GRANT SELECT, INSERT ON payments TO authenticated;
GRANT UPDATE ON payments TO authenticated;

-- Verification query
SELECT 
  table_name,
  column_name,
  data_type,
  is_nullable
FROM information_schema.columns
WHERE table_name = 'payments'
ORDER BY ordinal_position;

SELECT 'Payments table created successfully!' as message;
