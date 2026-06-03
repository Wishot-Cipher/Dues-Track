-- ============================================================
-- Migration 055: Allow 'paystack' (and other channels) in payments.payment_method
--
-- BUG: Every Paystack payment failed with
--   "new row for relation \"payments\" violates check constraint
--    \"payments_payment_method_check\"" (SQLSTATE 23514)
-- which surfaced in the app as "Could not create payment record."
--
-- CAUSE: The original (single-tenant) schema added a CHECK constraint that
-- only permitted the manual methods (bank_transfer / cash / pos). The Paystack
-- init endpoint inserts payment_method='paystack', which the constraint rejects
-- — so no online payment could ever be created (dev or prod).
--
-- FIX: Replace the constraint with the full set of methods the app actually
-- uses, plus headroom for future channels, so adding a method never causes an
-- outage again. The payments table is empty, so there is no data to migrate.
-- ============================================================

BEGIN;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_payment_method_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_payment_method_check
  CHECK (
    payment_method IN (
      'bank_transfer',  -- manual: student uploads transfer receipt
      'cash',           -- manual: collected in person / waiver records
      'pos',            -- manual: POS terminal
      'paystack',       -- online: Paystack hosted checkout (the fix)
      'card',           -- online channel
      'transfer',       -- online channel (bank transfer via Paystack)
      'ussd',           -- online channel
      'manual',         -- generic manual fallback
      'waiver',         -- exec-waived dues
      'online'          -- generic online fallback
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'Migration 055 complete: payments.payment_method now allows paystack + channels.';
END $$;

COMMIT;
