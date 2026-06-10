-- ============================================================
-- Migration 115: ROLLBACK for mig 114.
--
-- Apply this ONLY if mig 114 broke dues visibility (members can't see
-- or pay their dues, public checkout stopped showing events, etc.).
-- It restores the permissive USING(TRUE) SELECT policy from mig 028,
-- returning payment_types isolation to the application layer (which
-- is already correct via the own-tier scoping work).
--
-- Safe to run anytime; idempotent.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS payment_types_cascade_read ON public.payment_types;
DROP POLICY IF EXISTS payment_types_service_all  ON public.payment_types;

DROP POLICY IF EXISTS payment_types_open_read ON public.payment_types;
CREATE POLICY payment_types_open_read
  ON public.payment_types
  FOR SELECT
  USING (TRUE);

DO $$
BEGIN
  RAISE NOTICE 'Migration 115 applied: payment_types SELECT rolled back to permissive (app-layer isolation).';
END $$;

COMMIT;
