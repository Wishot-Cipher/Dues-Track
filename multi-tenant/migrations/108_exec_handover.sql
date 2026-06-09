-- ============================================================
-- Migration 108: Exec handover — voluntary role succession.
--
-- The problem (user's spec)
-- -------------------------
-- An exec stepping down today has no clean path to pass the baton.
-- They want to: nominate a successor from their own tier, the
-- successor gets notified + a persistent claim prompt, the successor
-- goes through the normal vote, and on approval the role TRANSFERS —
-- the outgoing exec becomes a plain member.
--
-- Key design choices
-- ------------------
-- 1) The outgoing exec KEEPS their powers until the successor is
--    verified. No power vacuum during the vote — that's what makes
--    this a "handover" not a "resignation into chaos."
-- 2) The successor search is tier-scoped: faculty post → search the
--    whole faculty subtree; dept post → the dept's classes; class
--    post → that class. Reuses the ancestor/descendant walk.
-- 3) The nominee prompt is SERVER-DRIVEN, not a dismissible toast.
--    get_my_pending_handover() returns the open handover where
--    nominee = me, so the banner survives logout / dismiss until they
--    accept or decline. (The user's exact concern: a non-admin member
--    might dismiss a claim banner before realizing it's their
--    handover.)
-- 4) The transfer is ATOMIC and centralized: a trigger on
--    claim_requests fires when a handover-linked claim flips to
--    'approved'. It deactivates the outgoing exec's member_admins row
--    (is_active=FALSE, tenure_end=today) and completes the handover.
--    No patching of the two finalization RPCs (cast_claim_vote_v2 +
--    confirm_claim_by_parent_exec) — both paths trigger the same hook.
--    The outgoing exec's deactivated row also loses can_manage_payout
--    access automatically (can_member_manage_payout checks is_active).
--
-- Impeachment (member-initiated, adversarial removal) is NOT built
-- here — but the table is shaped so an 'initiated_by' = 'members'
-- variant can slot in later without a schema change.
-- ============================================================

BEGIN;

-- ── 1) Handover record ──
CREATE TABLE IF NOT EXISTS public.exec_handovers (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  group_id           UUID REFERENCES public.organization_groups(id) ON DELETE CASCADE,
  scope_level        TEXT NOT NULL,                 -- 'org' | 'unit' | 'group'
  role               TEXT,                          -- coarse role of the outgoing admin
  role_label         TEXT,                          -- friendly title ("Class Rep")
  outgoing_admin_id  UUID NOT NULL REFERENCES public.member_admins(id) ON DELETE CASCADE,
  outgoing_member_id UUID NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  nominee_member_id  UUID REFERENCES public.organization_members(id) ON DELETE SET NULL,
  reason             TEXT,
  initiated_by       TEXT NOT NULL DEFAULT 'outgoing_exec',  -- future: 'members' (impeachment)
  status             TEXT NOT NULL DEFAULT 'nominated'
                     CHECK (status IN ('nominated','accepted','completed','declined','cancelled','expired')),
  claim_id           UUID REFERENCES public.claim_requests(id) ON DELETE SET NULL,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  resolved_at        TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_handover_nominee  ON public.exec_handovers (nominee_member_id) WHERE status IN ('nominated','accepted');
CREATE INDEX IF NOT EXISTS idx_handover_outgoing ON public.exec_handovers (outgoing_member_id) WHERE status IN ('nominated','accepted');
CREATE INDEX IF NOT EXISTS idx_handover_org      ON public.exec_handovers (organization_id);

ALTER TABLE public.exec_handovers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS exec_handovers_service ON public.exec_handovers;
CREATE POLICY exec_handovers_service ON public.exec_handovers
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS exec_handovers_read ON public.exec_handovers;
CREATE POLICY exec_handovers_read ON public.exec_handovers FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR outgoing_member_id::text = auth.uid()::text
    OR nominee_member_id::text  = auth.uid()::text
    OR public.can_access_group(group_id)
  );
GRANT SELECT ON public.exec_handovers TO authenticated, anon, service_role;

-- ── 2) Link claims back to a handover ──
ALTER TABLE public.claim_requests
  ADD COLUMN IF NOT EXISTS handover_id UUID REFERENCES public.exec_handovers(id) ON DELETE SET NULL;

-- cancel_exec_handover withdraws an in-flight claim by setting
-- status='cancelled', but the mig 015 CHECK constraint doesn't list
-- it. Extend the constraint (drop + recreate with the same set + the
-- new value). Idempotent: the DROP is guarded by IF EXISTS.
ALTER TABLE public.claim_requests DROP CONSTRAINT IF EXISTS chk_claim_status;
ALTER TABLE public.claim_requests ADD CONSTRAINT chk_claim_status CHECK (status IN (
  'submitted', 'email_sent', 'awaiting_votes', 'votes_complete',
  'under_review', 'approved', 'rejected', 'disputed', 'expired', 'cancelled'
));

-- ════════════════════════════════════════════════════════════
-- 3) search_tier_members_for_handover
--    Members in the outgoing exec's scope subtree matching a name /
--    member-id query. The picker the outgoing exec uses to find a
--    successor. Excludes themselves.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.search_tier_members_for_handover(
  p_caller_member_id UUID,
  p_query            TEXT,
  p_group_id         UUID DEFAULT NULL   -- optional: which of caller's roles' tier
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org      UUID;
  v_scope    TEXT;
  v_group    UUID;
  v_q        TEXT := '%' || LOWER(TRIM(COALESCE(p_query, ''))) || '%';
  v_rows     jsonb;
BEGIN
  IF p_caller_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;

  SELECT organization_id INTO v_org
  FROM public.organization_members WHERE id = p_caller_member_id;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found.');
  END IF;

  -- Resolve the caller's exec scope. If p_group_id is given, use the
  -- matching active admin row; else take their highest-scope active row.
  SELECT scope_level, group_id INTO v_scope, v_group
  FROM public.member_admins
  WHERE member_id = p_caller_member_id
    AND organization_id = v_org
    AND is_active = TRUE
    AND verification_layer >= 3
    AND (p_group_id IS NULL OR group_id = p_group_id)
  ORDER BY CASE scope_level WHEN 'org' THEN 3 WHEN 'unit' THEN 2 ELSE 1 END DESC,
           verification_layer DESC
  LIMIT 1;

  IF v_scope IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You are not a verified exec.');
  END IF;

  -- Build the target group set: the caller's group + all descendants
  -- (org scope = whole org). Then return members in those groups.
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.full_name), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT om.id        AS member_id,
           om.full_name,
           om.member_id  AS human_id,
           g.name        AS group_name,
           g.short_name  AS group_short
    FROM public.organization_members om
    JOIN public.organization_groups g ON g.id = om.group_id
    WHERE om.organization_id = v_org
      AND COALESCE(om.is_active, TRUE) = TRUE
      AND om.id <> p_caller_member_id
      AND (LOWER(om.full_name) LIKE v_q OR LOWER(om.member_id) LIKE v_q)
      AND (
        v_scope = 'org'
        OR om.group_id IN (
          WITH RECURSIVE down AS (
            SELECT id FROM public.organization_groups WHERE id = v_group
            UNION ALL
            SELECT c.id FROM public.organization_groups c JOIN down ON c.parent_group_id = down.id
          )
          SELECT id FROM down
        )
      )
    LIMIT 25
  ) t;

  RETURN jsonb_build_object('ok', TRUE, 'scope', v_scope, 'members', v_rows);
END;
$$;
GRANT EXECUTE ON FUNCTION public.search_tier_members_for_handover(UUID, TEXT, UUID)
  TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 4) nominate_successor — outgoing exec starts the handover
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.nominate_successor(
  p_caller_member_id UUID,
  p_nominee_member_id UUID,
  p_group_id          UUID DEFAULT NULL,   -- which role's tier (null = highest)
  p_reason            TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org         UUID;
  v_admin       RECORD;
  v_nominee_org UUID;
  v_caller_name TEXT;
  v_handover_id UUID;
BEGIN
  IF p_caller_member_id IS NULL OR p_nominee_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Both you and a nominee are required.');
  END IF;
  IF p_caller_member_id = p_nominee_member_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You can''t nominate yourself.');
  END IF;

  SELECT organization_id, full_name INTO v_org, v_caller_name
  FROM public.organization_members WHERE id = p_caller_member_id;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found.');
  END IF;

  -- The role being handed over: the caller's active verified admin row.
  SELECT id, group_id, scope_level, role, role_label
    INTO v_admin
  FROM public.member_admins
  WHERE member_id = p_caller_member_id
    AND organization_id = v_org
    AND is_active = TRUE
    AND verification_layer >= 3
    AND (p_group_id IS NULL OR group_id = p_group_id)
  ORDER BY CASE scope_level WHEN 'org' THEN 3 WHEN 'unit' THEN 2 ELSE 1 END DESC,
           verification_layer DESC
  LIMIT 1;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You are not a verified exec, so there''s no role to hand over.');
  END IF;

  -- Nominee must be in the same org.
  SELECT organization_id INTO v_nominee_org
  FROM public.organization_members WHERE id = p_nominee_member_id;
  IF v_nominee_org IS DISTINCT FROM v_org THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'That person isn''t in your organisation.');
  END IF;

  -- Only one open handover per outgoing role at a time.
  IF EXISTS (
    SELECT 1 FROM public.exec_handovers
    WHERE outgoing_admin_id = v_admin.id AND status IN ('nominated','accepted')
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You already have a handover in progress for this role. Cancel it first to nominate someone else.');
  END IF;

  INSERT INTO public.exec_handovers (
    organization_id, group_id, scope_level, role, role_label,
    outgoing_admin_id, outgoing_member_id, nominee_member_id, reason, status
  ) VALUES (
    v_org, v_admin.group_id, v_admin.scope_level, v_admin.role, v_admin.role_label,
    v_admin.id, p_caller_member_id, p_nominee_member_id, NULLIF(TRIM(p_reason), ''), 'nominated'
  )
  RETURNING id INTO v_handover_id;

  -- Notify the nominee. This is the seed of the persistent banner —
  -- get_my_pending_handover() is the durable source, this is the
  -- one-time ping.
  INSERT INTO public.notifications (
    organization_id, member_id, group_id,
    type, title, message, link, related_type, related_id
  ) VALUES (
    v_org, p_nominee_member_id, v_admin.group_id,
    'handover_nominated',
    'You''ve been nominated as ' || COALESCE(v_admin.role_label, 'an exec'),
    COALESCE(v_caller_name, 'The current exec') || ' wants to hand over the role of ' ||
      COALESCE(v_admin.role_label, 'exec') || ' to you. Open it to accept and start verification.',
    '/profile',
    'exec_handover', v_handover_id
  );

  RETURN jsonb_build_object('ok', TRUE, 'handover_id', v_handover_id, 'role_label', v_admin.role_label);
END;
$$;
GRANT EXECUTE ON FUNCTION public.nominate_successor(UUID, UUID, UUID, TEXT)
  TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 5) get_my_pending_handover — durable banner source for the nominee
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_my_pending_handover(p_member_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_row jsonb;
BEGIN
  IF p_member_id IS NULL THEN RETURN jsonb_build_object('ok', TRUE, 'handover', NULL); END IF;

  SELECT row_to_json(t) INTO v_row
  FROM (
    SELECT h.id, h.role_label, h.scope_level, h.group_id, h.status, h.reason,
           g.name AS group_name,
           om.full_name AS from_name
    FROM public.exec_handovers h
    LEFT JOIN public.organization_groups g ON g.id = h.group_id
    LEFT JOIN public.organization_members om ON om.id = h.outgoing_member_id
    WHERE h.nominee_member_id = p_member_id
      AND h.status = 'nominated'
    ORDER BY h.created_at DESC
    LIMIT 1
  ) t;

  RETURN jsonb_build_object('ok', TRUE, 'handover', v_row);
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_my_pending_handover(UUID)
  TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 6) respond_to_handover — nominee accepts (→ auto-submit claim) or declines
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.respond_to_handover(
  p_nominee_member_id UUID,
  p_handover_id       UUID,
  p_accept            BOOLEAN
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_h        RECORD;
  v_email    TEXT;
  v_claim    jsonb;
  v_claim_id UUID;
  v_role     TEXT;
BEGIN
  SELECT * INTO v_h FROM public.exec_handovers
  WHERE id = p_handover_id AND nominee_member_id = p_nominee_member_id;
  IF v_h.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Handover not found.');
  END IF;
  IF v_h.status <> 'nominated' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This handover has already been responded to.');
  END IF;

  IF NOT p_accept THEN
    UPDATE public.exec_handovers
    SET status = 'declined', resolved_at = NOW()
    WHERE id = p_handover_id;
    -- Let the outgoing exec know.
    INSERT INTO public.notifications (organization_id, member_id, group_id, type, title, message, link, related_type, related_id)
    VALUES (v_h.organization_id, v_h.outgoing_member_id, v_h.group_id,
            'handover_declined', 'Your handover was declined',
            'The person you nominated declined. You keep your role — nominate someone else when ready.',
            '/profile', 'exec_handover', v_h.id);
    RETURN jsonb_build_object('ok', TRUE, 'status', 'declined');
  END IF;

  -- Accept → submit a claim for the SAME role/scope/group, linked to
  -- this handover. The normal vote runs; the trigger handles transfer
  -- on approval. Map the coarse scope to submit_claim_v2's role arg.
  v_role := CASE v_h.scope_level
              WHEN 'org'   THEN 'org_owner'
              WHEN 'unit'  THEN 'faculty_admin'
              ELSE 'group_admin'
            END;

  SELECT email INTO v_email FROM public.organization_members WHERE id = p_nominee_member_id;

  v_claim := public.submit_claim_v2(
    p_nominee_member_id,
    v_role,
    v_h.scope_level,
    v_h.group_id,
    COALESCE(v_h.role_label, 'Exec'),
    NULL,
    v_email,
    v_email,   -- institutional = account email (mig 105 convention)
    NULL,
    'member_vote'
  );

  IF NOT COALESCE((v_claim->>'ok')::BOOLEAN, FALSE) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      COALESCE(v_claim->>'error', 'Could not start verification for the handover.'));
  END IF;
  v_claim_id := (v_claim->>'claim_id')::UUID;

  UPDATE public.claim_requests SET handover_id = p_handover_id WHERE id = v_claim_id;
  UPDATE public.exec_handovers
  SET status = 'accepted', claim_id = v_claim_id
  WHERE id = p_handover_id;

  -- Tell the outgoing exec it's moving.
  INSERT INTO public.notifications (organization_id, member_id, group_id, type, title, message, link, related_type, related_id)
  VALUES (v_h.organization_id, v_h.outgoing_member_id, v_h.group_id,
          'handover_accepted', 'Your successor accepted',
          'They accepted and are now going through verification. Your role transfers to them once they''re confirmed.',
          '/profile', 'exec_handover', v_h.id);

  RETURN jsonb_build_object('ok', TRUE, 'status', 'accepted', 'claim_id', v_claim_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.respond_to_handover(UUID, UUID, BOOLEAN)
  TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 7) cancel_exec_handover — outgoing exec backs out (pre-completion)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.cancel_exec_handover(
  p_caller_member_id UUID,
  p_handover_id      UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_h RECORD;
BEGIN
  SELECT * INTO v_h FROM public.exec_handovers
  WHERE id = p_handover_id AND outgoing_member_id = p_caller_member_id;
  IF v_h.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Handover not found.');
  END IF;
  IF v_h.status NOT IN ('nominated','accepted') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This handover can no longer be cancelled.');
  END IF;

  UPDATE public.exec_handovers SET status = 'cancelled', resolved_at = NOW() WHERE id = p_handover_id;
  -- If a claim was already filed, withdraw it so it doesn't keep
  -- collecting votes for a cancelled handover.
  IF v_h.claim_id IS NOT NULL THEN
    UPDATE public.claim_requests
    SET status = 'cancelled', resolved_at = NOW(), updated_at = NOW()
    WHERE id = v_h.claim_id AND status IN ('submitted','awaiting_votes','email_sent','under_review');
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'status', 'cancelled');
END;
$$;
GRANT EXECUTE ON FUNCTION public.cancel_exec_handover(UUID, UUID)
  TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 8) The atomic transfer trigger
--    When a handover-linked claim flips to 'approved', deactivate the
--    outgoing exec's admin row + complete the handover. Both
--    finalization RPCs (vote + parent-confirm) set status='approved',
--    so this one trigger covers both paths.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.complete_handover_on_claim_approval()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_h RECORD;
BEGIN
  IF NEW.status = 'approved'
     AND COALESCE(OLD.status, '') <> 'approved'
     AND NEW.handover_id IS NOT NULL
  THEN
    SELECT * INTO v_h FROM public.exec_handovers WHERE id = NEW.handover_id;
    IF v_h.id IS NOT NULL AND v_h.status = 'accepted' THEN
      -- Deactivate the outgoing exec's specific role row. The mig 106
      -- can_manage_payout stays on the row but is_active=FALSE makes
      -- can_member_manage_payout return FALSE — payout access revoked.
      UPDATE public.member_admins
      SET is_active = FALSE, tenure_end = CURRENT_DATE, updated_at = NOW()
      WHERE id = v_h.outgoing_admin_id;

      UPDATE public.exec_handovers
      SET status = 'completed', resolved_at = NOW()
      WHERE id = v_h.id;

      -- Notify both parties.
      INSERT INTO public.notifications (organization_id, member_id, group_id, type, title, message, link, related_type, related_id)
      VALUES
        (v_h.organization_id, v_h.outgoing_member_id, v_h.group_id,
         'handover_completed', 'Handover complete',
         'Your successor is verified. Your role has transferred and you''re now a regular member. Thank you for your service.',
         '/dashboard', 'exec_handover', v_h.id),
        (v_h.organization_id, v_h.nominee_member_id, v_h.group_id,
         'handover_completed', 'You''re now the exec',
         'Verification passed — the role is officially yours. Your dashboard now has exec access.',
         '/admin/dashboard', 'exec_handover', v_h.id);
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_complete_handover ON public.claim_requests;
CREATE TRIGGER trg_complete_handover
  AFTER UPDATE OF status ON public.claim_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_handover_on_claim_approval();

DO $$
BEGIN
  RAISE NOTICE 'Migration 108 complete: exec_handovers + nominate/respond/cancel + search + atomic transfer trigger.';
END $$;

COMMIT;
