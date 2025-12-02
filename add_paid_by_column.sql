-- Add paid_by column to payments table to track who paid on behalf of others
-- This helps with transparency and auditing of pay-for-others transactions

ALTER TABLE payments ADD COLUMN IF NOT EXISTS paid_by UUID REFERENCES students(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_payments_paid_by ON payments(paid_by);

-- Add comment for documentation
COMMENT ON COLUMN payments.paid_by IS 'Student ID of who paid this payment on behalf of the student (NULL if student paid for themselves)';
