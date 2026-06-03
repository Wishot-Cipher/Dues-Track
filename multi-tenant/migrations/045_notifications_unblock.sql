-- ============================================================
-- Migration 045: Unblock notifications inserts
--
-- Root cause of "claim notifications never arrive":
--   COMPLETE_SETUP created notifications.student_id as NOT NULL.
--   Mig 043 added member_id, but did NOT drop the NOT NULL on
--   student_id. Every INSERT in mig 042 (which only writes
--   member_id) was failing with:
--     "null value in column student_id violates not-null constraint"
--   And because mig 042's RPCs swallow exceptions to return JSON,
--   the failure was invisible to the caller.
--
-- This migration:
--   1. Drops NOT NULL on notifications.student_id (if column exists)
--   2. Adds a BEFORE-INSERT trigger that auto-mirrors member_id
--      into student_id so any legacy reader that still expects
--      student_id keeps working
--   3. Backfills student_id from member_id on existing rows where
--      it is NULL
--
-- Safe / idempotent. Run AFTER mig 043.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1) Drop NOT NULL on student_id if the column is still there
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'notifications'
      AND column_name  = 'student_id'
      AND is_nullable  = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE public.notifications ALTER COLUMN student_id DROP NOT NULL';
    RAISE NOTICE '  notifications.student_id: NOT NULL dropped';
  ELSE
    RAISE NOTICE '  notifications.student_id: already nullable (or column dropped)';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 2) Mirror trigger: keep student_id ↔ member_id in sync so
--    legacy readers don't break.
--    Only fires when the column still exists.
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='student_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='member_id'
  ) THEN

    CREATE OR REPLACE FUNCTION public._notifications_sync_recipient()
    RETURNS TRIGGER
    LANGUAGE plpgsql
    AS $fn$
    BEGIN
      -- If only one of (student_id, member_id) is set, copy it to the other.
      IF NEW.member_id IS NULL AND NEW.student_id IS NOT NULL THEN
        NEW.member_id := NEW.student_id;
      ELSIF NEW.student_id IS NULL AND NEW.member_id IS NOT NULL THEN
        NEW.student_id := NEW.member_id;
      END IF;
      RETURN NEW;
    END;
    $fn$;

    DROP TRIGGER IF EXISTS trg_notifications_sync_recipient ON public.notifications;
    CREATE TRIGGER trg_notifications_sync_recipient
      BEFORE INSERT OR UPDATE ON public.notifications
      FOR EACH ROW EXECUTE FUNCTION public._notifications_sync_recipient();

    RAISE NOTICE '  trg_notifications_sync_recipient installed';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 3) Backfill: ensure every existing row has both columns set
-- ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='student_id'
  ) AND EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications' AND column_name='member_id'
  ) THEN
    EXECUTE 'UPDATE public.notifications SET student_id = member_id WHERE student_id IS NULL AND member_id IS NOT NULL';
    EXECUTE 'UPDATE public.notifications SET member_id  = student_id WHERE member_id IS NULL AND student_id IS NOT NULL';
  END IF;
END $$;

-- ────────────────────────────────────────────────────────────
-- 4) Sanity smoke test: a sample notifications insert
--    should now succeed. We do it inside a sub-transaction
--    we'll roll back so we don't leave junk behind.
-- ────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_member_id UUID;
  v_org_id    UUID;
BEGIN
  SELECT id, organization_id INTO v_member_id, v_org_id
  FROM public.organization_members
  WHERE COALESCE(is_active, TRUE) = TRUE
  LIMIT 1;

  IF v_member_id IS NULL THEN
    RAISE NOTICE '  Smoke test skipped: no organization_members rows.';
    RETURN;
  END IF;

  BEGIN
    INSERT INTO public.notifications (
      organization_id, member_id, type, title, message, link
    ) VALUES (
      v_org_id, v_member_id, '_smoke_test',
      'Migration 045 smoke', 'will be deleted', NULL
    );
    DELETE FROM public.notifications WHERE type = '_smoke_test';
    RAISE NOTICE '  Smoke test passed: notifications INSERT now works.';
  EXCEPTION WHEN OTHERS THEN
    RAISE NOTICE '  Smoke test FAILED — investigate: %', SQLERRM;
  END;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Migration 045 complete. Try submitting a claim again.';
END $$;

COMMIT;
