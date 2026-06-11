-- ============================================================
-- Migration 129: ROLLBACK for mig 128.
--
-- Apply this ONLY if mig 128 broke expense visibility (an exec can't
-- see their tier's ledger / balance, members lost the "where the
-- money went" view, etc.). It restores the permissive USING(TRUE)
-- SELECT policy from mig 028, returning expenses isolation to the
-- application layer (already correct via the own-tier scoping work).
--
-- Safe to run anytime; idempotent.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS expenses_tier_read   ON public.expenses;
DROP POLICY IF EXISTS expenses_service_all ON public.expenses;

DROP POLICY IF EXISTS expenses_open_read ON public.expenses;
CREATE POLICY expenses_open_read
  ON public.expenses
  FOR SELECT
  USING (TRUE);

DO $$
BEGIN
  RAISE NOTICE 'Migration 129 applied: expenses SELECT rolled back to permissive (app-layer isolation).';
END $$;

COMMIT;
