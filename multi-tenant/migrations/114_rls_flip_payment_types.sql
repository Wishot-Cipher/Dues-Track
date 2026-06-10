-- ============================================================
-- Migration 114: Flip payment_types SELECT to tier-aware RLS
-- (STEP 2 of the staged RLS restore). HIGHER RISK — apply
-- consciously and TEST before relying on it. mig 115 rolls it back
-- instantly if anything breaks.
--
-- What this does
-- --------------
-- Replaces the permissive `payment_types_open_read` (USING TRUE, from
-- mig 028) with a cascade-aware SELECT policy:
--   • public dues/events (is_public = TRUE)  → visible to ANYONE
--     (anon), so public event checkout + unauthenticated landing
--     pages keep working.
--   • everything else → can_access_payment_type(id): a member sees a
--     due if it's org-wide or its group is an ancestor-or-self of the
--     member's group (the cascade); an exec sees their own tier's.
--
-- Writes are UNCHANGED here — dues are created/edited via the
-- create_due_with_scope_check RPC (SECURITY DEFINER, bypasses RLS),
-- so this SELECT-only flip can't break creation. We restore write
-- policies in a later step once reads are proven.
--
-- ⚠️  TEST IMMEDIATELY AFTER APPLYING:
--   1. A normal member can still SEE + pay their class/dept/faculty/
--      org dues on My Dues + dashboard.
--   2. Public event checkout (logged-out) still shows the event.
--   3. A dept exec sees dept + their own class dues, NOT sibling
--      classes' dues.
--   If ANY of these fail → run mig 115 to roll back to USING(TRUE).
-- ============================================================

BEGIN;

ALTER TABLE public.payment_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_types_open_read ON public.payment_types;
DROP POLICY IF EXISTS payment_types_cascade_read ON public.payment_types;

CREATE POLICY payment_types_cascade_read
  ON public.payment_types
  FOR SELECT
  USING (
    -- Public dues/events stay open (anon checkout + landing).
    COALESCE(is_public, FALSE) = TRUE
    -- Members (cascade) + the owning-tier exec.
    OR public.can_access_payment_type(id)
  );

-- Keep a service_role escape hatch so server/API paths are never
-- blocked by the SELECT policy.
DROP POLICY IF EXISTS payment_types_service_all ON public.payment_types;
CREATE POLICY payment_types_service_all
  ON public.payment_types
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

DO $$
BEGIN
  RAISE NOTICE 'Migration 114 applied: payment_types SELECT is now cascade-aware. TEST member dues visibility + public checkout. Roll back with mig 115 if needed.';
END $$;

COMMIT;
