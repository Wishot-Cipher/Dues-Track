-- ============================================================
-- Migration 127: ROLLBACK for mig 126.
--
-- Apply this ONLY if mig 126 broke payment visibility (members can't
-- see their receipts, execs can't see incoming collections, webhook
-- inserts started failing reads, etc.). It restores the permissive
-- USING(TRUE) SELECT policy from mig 028, returning payments
-- isolation to the application layer (already correct via the
-- own-tier scoping work on the collected / audit / expense pages).
--
-- Safe to run anytime; idempotent.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS payments_tier_read   ON public.payments;
DROP POLICY IF EXISTS payments_service_all ON public.payments;

DROP POLICY IF EXISTS payments_open_read ON public.payments;
CREATE POLICY payments_open_read
  ON public.payments
  FOR SELECT
  USING (TRUE);

DO $$
BEGIN
  RAISE NOTICE 'Migration 127 applied: payments SELECT rolled back to permissive (app-layer isolation).';
END $$;

COMMIT;
