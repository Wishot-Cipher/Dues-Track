-- ============================================================
-- Migration 128: Flip expenses SELECT to tier-aware RLS
-- (STEP 4 of the staged RLS restore). HIGHER RISK — apply
-- consciously and TEST before relying on it. mig 129 rolls it back
-- instantly if anything breaks.
--
-- Prerequisite: apply + PROVE migs 114 + 126 first. This step uses
-- can_access_group (mig 022), which is already OWN-TIER (no ancestor
-- walk), so it lines up with the payments flip and the client-side
-- own-tier scoping.
--
-- What this does
-- --------------
-- Replaces the permissive `expenses_open_read` (USING TRUE, from mig
-- 028) with an own-tier SELECT policy keyed on the expense's group:
--   can_access_group(group_id) is TRUE when the caller is —
--     • a MEMBER of that EXACT group (transparency: a class member
--       sees their class's spending), or
--     • a VERIFIED admin of that EXACT group (own tier — a dept exec
--       sees DEPT expenses, never the classes' below them), or
--     • an org-scope verified admin when group_id IS NULL (org-wide
--       expense), or
--     • platform admin / service role.
--
-- This mirrors the own-tier rule the app now enforces client-side on
-- ExpensesPage / ExpenseList / RecordExpense (a faculty/dept exec's
-- ledger + available balance is THEIR tier's money only). Server-side
-- RLS becomes defense-in-depth for the same boundary.
--
-- Writes are UNCHANGED here — expense create/approve flows run via
-- service role / SECURITY DEFINER paths, so this SELECT-only flip
-- can't break recording or approval.
--
-- ⚠️  TEST IMMEDIATELY AFTER APPLYING:
--   1. A class rep sees their class's expense ledger + balance.
--   2. A dept exec sees DEPT expenses only — NOT a class's expenses.
--   3. An org exec sees org-wide expenses (group_id IS NULL).
--   4. Members (where the app surfaces it) can still see their own
--      group's "where the money went" view.
--   If ANY of these fail → run mig 129 to roll back to USING(TRUE).
-- ============================================================

BEGIN;

ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS expenses_open_read ON public.expenses;
DROP POLICY IF EXISTS expenses_tier_read ON public.expenses;

CREATE POLICY expenses_tier_read
  ON public.expenses
  FOR SELECT
  USING (
    public.can_access_group(group_id)
  );

-- Keep a service_role escape hatch so server/API paths are never
-- blocked by the SELECT policy.
DROP POLICY IF EXISTS expenses_service_all ON public.expenses;
CREATE POLICY expenses_service_all
  ON public.expenses
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

DO $$
BEGIN
  RAISE NOTICE 'Migration 128 applied: expenses SELECT is now own-tier via can_access_group. TEST class/dept/org ledgers + member transparency view. Roll back with mig 129 if needed.';
END $$;

COMMIT;
