-- ============================================================
-- Migration 073: Allow the full payment lifecycle in payments.status
--
-- ROOT CAUSE of "paid due still shows as upcoming → student pays again":
-- the legacy payments_status_check only permitted a narrow set (in practice
-- 'pending' / 'approved'). So when the Paystack verify/webhook tried to mark a
-- payment 'failed' or 'abandoned', the UPDATE hit a 23514 CHECK violation and
-- was rejected — the row stayed 'pending' forever. A stuck 'pending' row makes
-- the due look payable again (double payment) and clutters the UI.
--
-- FIX: widen the constraint to the full lifecycle the app uses, so abandoned /
-- failed payments can actually be recorded as such. Existing rows are only
-- 'approved'/'pending', so no data migration is needed.
-- ============================================================

BEGIN;

ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_status_check;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_status_check
  CHECK (status IN (
    'pending',     -- created, awaiting completion/confirmation
    'approved',    -- confirmed (manual approval or Paystack success)
    'successful',  -- alias some flows use for a confirmed online payment
    'paid',        -- alias for confirmed
    'partial',     -- partially paid
    'failed',      -- Paystack reported failure
    'abandoned',   -- checkout left / never completed
    'reversed',    -- charge reversed
    'rejected',    -- admin rejected a manual submission
    'waived'       -- exec-waived
  ));

DO $$
BEGIN
  RAISE NOTICE 'Migration 073 complete: payments.status now covers the full lifecycle.';
END $$;

COMMIT;
