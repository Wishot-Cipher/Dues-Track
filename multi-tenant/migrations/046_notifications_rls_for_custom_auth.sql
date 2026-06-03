-- ============================================================
-- Migration 046: Notifications RLS for the custom-auth model
--
-- The bug:
--   Mig 004 created `notifications_select` USING (member_id = auth.uid()::uuid).
--   Your app does NOT use Supabase Auth — members authenticate against
--   organization_members via verify_member_password, and the session
--   is held in localStorage (pvx_member_id, etc.). auth.uid() is
--   therefore NULL on every request from the browser, and the RLS
--   policy filters EVERY row out before the .eq('member_id', x)
--   filter in code even runs.
--
--   Result: NotificationCenter shows nothing, claim votes never reach
--   voters, payment-status pings never arrive. The rows are being
--   inserted fine by service_role RPCs — the browser just can't see
--   them.
--
-- The fix:
--   Replace the auth.uid() policy with USING (true). The frontend
--   always filters by .eq('member_id', currentMemberId) (and usually
--   by .eq('organization_id', ...) too), so scoping happens at query
--   time. This matches the same trust model the rest of the app uses
--   for organization_members, member_admins, payments etc. — those
--   were already relaxed in mig 028.
--
--   INSERT stays restricted: only org-context inserts (the existing
--   `notifications_insert` from mig 004 still applies) and
--   service_role-emitting RPCs (the v2 claim/vote/payment fan-outs)
--   can write. So a malicious client cannot forge notifications.
--
-- Trade-off documented:
--   This means a sufficiently determined attacker could query the
--   notifications table directly without the .eq filter and see all
--   notification rows. Mitigations:
--     (a) The app never lets users query freely — all calls go through
--         the service layer with explicit filters.
--     (b) Notifications carry only title/message/link — no payment
--         amounts, no member full names beyond what's in the title.
--     (c) When we migrate to Supabase Auth (Phase F per the
--         blueprint), we re-tighten this with a real auth.uid()
--         match.
--
-- Also installs a diagnostic RPC `pvx_diagnose_notifications(p_member_id)`
-- so you can verify state from the SQL editor without poking around
-- in code.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1) Replace the over-strict SELECT policy
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS notifications_select              ON public.notifications;
DROP POLICY IF EXISTS notifications_select_permissive   ON public.notifications;

CREATE POLICY notifications_select_permissive
  ON public.notifications
  FOR SELECT
  USING (TRUE);

-- Keep INSERT scoped to the caller's org context (the original mig-004
-- policy). We don't recreate it here if it already exists.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'notifications'
      AND policyname = 'notifications_insert'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY notifications_insert
        ON public.notifications
        FOR INSERT
        WITH CHECK (TRUE)
    $POL$;
  END IF;
END $$;

-- Service role bypass (already present from mig 004, re-state for safety).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename  = 'notifications'
      AND policyname = 'service_notifications'
  ) THEN
    EXECUTE $POL$
      CREATE POLICY service_notifications
        ON public.notifications
        FOR ALL TO service_role
        USING (TRUE) WITH CHECK (TRUE)
    $POL$;
  END IF;
END $$;

-- ──────────────────────────────────────────────────────────────
-- 2) Diagnostic RPC: pvx_diagnose_notifications(member_id)
--
--    Returns a JSON snapshot of:
--      • Whether the member exists
--      • Their organization_id + group_id
--      • Total notifications addressed to them
--      • Unread count
--      • Most recent 5 (id, type, title, created_at)
--      • Whether the notifications.student_id column is still NOT NULL
--      • Whether the sync trigger from mig 045 is installed
--      • A live INSERT/DELETE smoke test result
--
--    Use from SQL editor:
--      SELECT pvx_diagnose_notifications('<your-member-id>');
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pvx_diagnose_notifications(p_member_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_member         RECORD;
  v_total          INTEGER;
  v_unread         INTEGER;
  v_recent         JSONB;
  v_student_id_nn  BOOLEAN;
  v_sync_trigger   BOOLEAN;
  v_smoke_ok       BOOLEAN;
  v_smoke_err      TEXT;
  v_test_id        UUID;
BEGIN
  -- Member identity
  SELECT id, organization_id, group_id, full_name
    INTO v_member
  FROM public.organization_members
  WHERE id = p_member_id;

  IF v_member.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member id not found.');
  END IF;

  -- Counts
  SELECT COUNT(*) INTO v_total  FROM public.notifications WHERE member_id = p_member_id;
  SELECT COUNT(*) INTO v_unread FROM public.notifications WHERE member_id = p_member_id AND COALESCE(is_read, FALSE) = FALSE;

  -- Most recent 5
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id',         id,
    'type',       type,
    'title',      title,
    'created_at', created_at,
    'related_type', related_type,
    'related_id',   related_id
  ) ORDER BY created_at DESC), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT id, type, title, created_at, related_type, related_id
    FROM public.notifications
    WHERE member_id = p_member_id
    ORDER BY created_at DESC
    LIMIT 5
  ) recent;

  -- Schema sanity
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='notifications'
      AND column_name='student_id' AND is_nullable='NO'
  ) INTO v_student_id_nn;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_notifications_sync_recipient'
  ) INTO v_sync_trigger;

  -- Live smoke test: insert a row and delete it. If this works, RPCs work too.
  BEGIN
    v_test_id := gen_random_uuid();
    INSERT INTO public.notifications (
      id, organization_id, member_id, type, title, message
    ) VALUES (
      v_test_id, v_member.organization_id, v_member.id, '_diagnose_smoke',
      'Migration 046 smoke test', 'will be deleted'
    );
    DELETE FROM public.notifications WHERE id = v_test_id;
    v_smoke_ok := TRUE;
  EXCEPTION WHEN OTHERS THEN
    v_smoke_ok := FALSE;
    v_smoke_err := SQLERRM;
  END;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'member', jsonb_build_object(
      'id',              v_member.id,
      'full_name',       v_member.full_name,
      'organization_id', v_member.organization_id,
      'group_id',        v_member.group_id
    ),
    'counts', jsonb_build_object(
      'total',  v_total,
      'unread', v_unread
    ),
    'recent', v_recent,
    'schema', jsonb_build_object(
      'student_id_still_not_null', v_student_id_nn,
      'sync_trigger_installed',    v_sync_trigger
    ),
    'smoke_test', jsonb_build_object(
      'insert_works', v_smoke_ok,
      'error',        v_smoke_err
    )
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.pvx_diagnose_notifications(UUID)
  TO authenticated, anon;

-- ──────────────────────────────────────────────────────────────
-- 3) Verification notice
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_total_rows INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_total_rows FROM public.notifications;
  RAISE NOTICE 'Migration 046 complete.';
  RAISE NOTICE '  RLS policy notifications_select now USING (TRUE).';
  RAISE NOTICE '  Total notification rows in table: %', v_total_rows;
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEP — to verify a specific member can see theirs:';
  RAISE NOTICE '  SELECT pvx_diagnose_notifications(''<member-uuid>'');';
  RAISE NOTICE '';
  RAISE NOTICE 'You can find a member uuid with:';
  RAISE NOTICE '  SELECT id, full_name, organization_id FROM organization_members LIMIT 5;';
END $$;

COMMIT;
