-- ============================================================
-- Migration 126: Flip payments SELECT to tier-aware RLS
-- (STEP 3 of the staged RLS restore). HIGHER RISK — apply
-- consciously and TEST before relying on it. mig 127 rolls it back
-- instantly if anything breaks.
--
-- Prerequisite: apply + PROVE mig 114 (payment_types flip) first.
-- This step reuses the same cascade helpers (mig 113) and the same
-- staging discipline. Do not apply until 114's reads are confirmed
-- working in production.
--
-- What this does
-- --------------
-- Replaces the permissive `payments_open_read` (USING TRUE, from mig
-- 028) with an own-tier SELECT policy:
--   • the payer themselves      → is_self_member_row(member_id)
--   • the owning-tier exec       → owns_payment_type(payment_type_id)
--     (mig 113: a VERIFIED layer>=3 admin of the due's EXACT group,
--     or an org-scope admin for org-wide dues — never an ancestor
--     reaching DOWN into a child class's payments).
--   • service role               → escape hatch (webhooks, API paths)
--
-- This is exactly the own-tier boundary the app now enforces
-- client-side (AdminCollectedPage / AuditPage / ExpensesPage): a dept
-- president sees payments against DEPT dues, never a class's
-- collections. Server-side RLS becomes defense-in-depth for the same
-- rule.
--
-- Writes are UNCHANGED here. Payment status is still gated by mig
-- 019's payments_no_paid_update_from_client; recording/approval flows
-- run through SECURITY DEFINER RPCs / service role. This SELECT-only
-- flip cannot break creation or approval.
--
-- ⚠️  TEST IMMEDIATELY AFTER APPLYING:
--   1. A normal member can still SEE their own payment history on
--      My Dues / receipts.
--   2. A class rep / fin sec sees their class's incoming payments;
--      a dept exec sees DEPT-due payments, NOT sibling classes'.
--   3. Public event checkout + Paystack webhook still record
--      payments (service role path).
--   If ANY of these fail → run mig 127 to roll back to USING(TRUE).
-- ============================================================

BEGIN;

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payments_open_read  ON public.payments;
DROP POLICY IF EXISTS payments_tier_read  ON public.payments;

CREATE POLICY payments_tier_read
  ON public.payments
  FOR SELECT
  USING (
    -- The payer sees their own rows.
    public.is_self_member_row(member_id)
    -- The owning-tier exec sees payments against dues they own.
    OR public.owns_payment_type(payment_type_id)
  );

-- Keep a service_role escape hatch so server/API/webhook paths are
-- never blocked by the SELECT policy.
DROP POLICY IF EXISTS payments_service_all ON public.payments;
CREATE POLICY payments_service_all
  ON public.payments
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

DO $$
BEGIN
  RAISE NOTICE 'Migration 126 applied: payments SELECT is now own-tier (payer + owning-tier exec). TEST member receipts + exec collections + webhook. Roll back with mig 127 if needed.';
END $$;

COMMIT;
