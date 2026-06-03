-- ============================================================
-- Migration 047: Add missing columns the UI queries
--
-- The console errors were 400s from PostgREST, NOT from RLS.
-- The browser was selecting columns that don't exist:
--
--   notifications.metadata  — referenced by NotificationCenter SELECT
--   expenses.group_id       — filtered by every dashboard query
--   payments.paid_by        — filtered by AchievementSystem etc.
--                             (mig 020 dropped it; we restore as
--                              nullable so legacy code keeps working
--                              without bringing back the FK to the
--                              dead `students` table)
--
-- Each addition is `IF NOT EXISTS` and uses a sensible nullable
-- default, so this migration is safe whether you've previously run
-- mig 020 or not.
--
-- After this runs, the NotificationCenter should immediately start
-- showing the rows that ARE in your notifications table, and the
-- dashboard expense/payment queries should stop 400'ing.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1) notifications.metadata
-- ──────────────────────────────────────────────────────────────
-- The NotificationCenter selects this column. Defaults to {} so
-- existing rows are immediately readable.
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

-- ──────────────────────────────────────────────────────────────
-- 2) expenses.group_id
-- ──────────────────────────────────────────────────────────────
-- The new dashboard scopes every expense query by group_id (matches
-- the autonomy model from mig 022). If the column was never added,
-- the filter `group_id=eq.X` makes PostgREST 400.
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.organization_groups(id) ON DELETE SET NULL;

-- Backfill group_id from the legacy department_id if both exist and
-- group_id is null. If the legacy column was already dropped, skip.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='expenses' AND column_name='department_id'
  ) THEN
    EXECUTE 'UPDATE public.expenses SET group_id = department_id WHERE group_id IS NULL AND department_id IS NOT NULL';
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_expenses_group ON public.expenses (group_id);

-- ──────────────────────────────────────────────────────────────
-- 3) payments.paid_by
-- ──────────────────────────────────────────────────────────────
-- `AchievementSystem` and `OrgMembersPage` filter by paid_by to find
-- payments a member made on behalf of someone else. Re-add as a
-- nullable UUID with NO foreign key (the legacy FK pointed at
-- `students` which is dropped) — the value is set by the app to
-- the payer's organization_members.id.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS paid_by UUID;

CREATE INDEX IF NOT EXISTS idx_payments_paid_by ON public.payments (paid_by)
  WHERE paid_by IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- Verification
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_meta_ok  BOOLEAN;
  v_grp_ok   BOOLEAN;
  v_paid_ok  BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='metadata'
  ) INTO v_meta_ok;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='expenses' AND column_name='group_id'
  ) INTO v_grp_ok;
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='payments' AND column_name='paid_by'
  ) INTO v_paid_ok;

  RAISE NOTICE 'Migration 047 complete:';
  RAISE NOTICE '  notifications.metadata : %', v_meta_ok;
  RAISE NOTICE '  expenses.group_id      : %', v_grp_ok;
  RAISE NOTICE '  payments.paid_by       : %', v_paid_ok;

  IF v_meta_ok AND v_grp_ok AND v_paid_ok THEN
    RAISE NOTICE '';
    RAISE NOTICE 'All three columns are present. Refresh the browser — the';
    RAISE NOTICE 'NotificationCenter should now load the rows it''s been';
    RAISE NOTICE 'trying to fetch.';
  END IF;
END $$;

COMMIT;
