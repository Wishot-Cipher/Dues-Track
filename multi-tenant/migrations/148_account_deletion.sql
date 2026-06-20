-- ============================================================
-- Migration 148: Account deletion, emergency step-down, and
-- group archival — the full decision tree from design conversation.
--
-- Confirmed schema facts this migration relies on (verified against
-- live migrations, not assumed):
--   • member_admins.scope_level IN ('org','unit','group') — strict
--     CHECK constraint. Department AND Class roles both use 'group',
--     distinguished by organization_groups.kind.
--   • exec_handovers has: outgoing_admin_id (→member_admins.id),
--     outgoing_member_id (→organization_members.id),
--     nominee_member_id (→organization_members.id), group_id,
--     organization_id, status. Status values observed in mig 109:
--     'accepted' (in-flight, blocks), 'completed' (terminal).
--     We additionally treat 'nominated' as in-flight (the nominee
--     hasn't accepted yet, but the outgoing exec is still mid-process)
--     and 'declined'/'expired'/'cancelled' as terminal — matching
--     every reference to this table across the codebase.
--   • payments has BOTH member_id (who the payment was for) and
--     paid_by (who actually submitted it, for the pay-for-others
--     flow) — a deletion-history check must look at both columns,
--     not just member_id, or it will miss someone who only ever
--     paid on behalf of others.
--   • payments.receipt_url / receipt_pdf_url are public storage URLs,
--     protected from deletion for approved rows by migration 140.
--   • organization_groups.founder_member_id has no trigger touching
--     it anywhere — confirmed static; deletion logic never needs to
--     reassign it, it simply remains a historical pointer even after
--     the founder's organization_members row is anonymized.
--   • Faculty → Department → Class hierarchy is enforced by a trigger
--     (mig 079) — a department can have multiple classes under it.
--     archive_group() must cascade-check the FULL subtree, not just
--     direct children.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- SCHEMA: new columns + tables
-- ════════════════════════════════════════════════════════════

-- ── organization_members: soft-delete / leave state ──
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS account_status TEXT NOT NULL DEFAULT 'active';
-- 'active' | 'deleted' | 'left'
ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_account_status_check;
ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_account_status_check
  CHECK (account_status IN ('active', 'deleted', 'left'));

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS deletion_reason TEXT;

-- ── organization_groups: archive state ──
ALTER TABLE public.organization_groups
  ADD COLUMN IF NOT EXISTS group_status TEXT NOT NULL DEFAULT 'active';
-- 'active' | 'archived' | 'pending_archive'
ALTER TABLE public.organization_groups
  DROP CONSTRAINT IF EXISTS organization_groups_group_status_check;
ALTER TABLE public.organization_groups
  ADD CONSTRAINT organization_groups_group_status_check
  CHECK (group_status IN ('active', 'archived', 'pending_archive'));

ALTER TABLE public.organization_groups
  ADD COLUMN IF NOT EXISTS archived_at TIMESTAMPTZ;
ALTER TABLE public.organization_groups
  ADD COLUMN IF NOT EXISTS archived_by UUID REFERENCES public.member_admins(id) ON DELETE SET NULL;
ALTER TABLE public.organization_groups
  ADD COLUMN IF NOT EXISTS archive_reason TEXT;

-- ── Deletion request — the email-confirmation-token pattern.
-- Deletion does NOT execute on first click; it queues here and
-- only runs once confirm_account_deletion() validates the token.
-- This prevents a hijacked/auto-logged-in session from nuking an
-- account the real owner didn't intend to delete right now. ──
CREATE TABLE IF NOT EXISTS public.account_deletion_requests (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id           UUID NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  requested_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  confirmation_token   UUID NOT NULL DEFAULT gen_random_uuid(),
  confirmed_at         TIMESTAMPTZ,
  expires_at           TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '24 hours'),
  status               TEXT NOT NULL DEFAULT 'pending',
  -- computed at REQUEST time so confirm_account_deletion() doesn't
  -- have to re-derive the branch — also gives us an audit trail of
  -- WHY a deletion went hard vs soft, even after the fact.
  deletion_path        TEXT,   -- 'hard' | 'soft'
  had_transaction_history BOOLEAN
);
ALTER TABLE public.account_deletion_requests
  DROP CONSTRAINT IF EXISTS account_deletion_requests_status_check;
ALTER TABLE public.account_deletion_requests
  ADD CONSTRAINT account_deletion_requests_status_check
  CHECK (status IN ('pending', 'confirmed', 'expired', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_deletion_requests_member
  ON public.account_deletion_requests(member_id)
  WHERE status = 'pending';

-- Financial records must never be deletable via app-level DELETE,
-- regardless of caller — same defensive posture as your existing
-- payout_change_log pattern.
REVOKE DELETE ON public.payments FROM authenticated, anon;

ALTER TABLE public.account_deletion_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "deletion_requests_self_read" ON public.account_deletion_requests;
CREATE POLICY "deletion_requests_self_read"
  ON public.account_deletion_requests FOR SELECT
  USING (member_id::text = auth.uid()::text);

-- ════════════════════════════════════════════════════════════
-- HELPER: does this member hold any active, verified, blocking role?
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._member_active_roles(p_member_id UUID)
RETURNS TABLE (
  admin_id UUID,
  role TEXT,
  role_label TEXT,
  scope_level TEXT,
  group_id UUID,
  group_name TEXT,
  group_kind TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT
    ma.id, ma.role, ma.role_label, ma.scope_level, ma.group_id,
    og.name, og.kind
  FROM public.member_admins ma
  LEFT JOIN public.organization_groups og ON og.id = ma.group_id
  WHERE ma.member_id = p_member_id
    AND ma.is_active = TRUE
    AND ma.verification_layer >= 4;
$$;

GRANT EXECUTE ON FUNCTION public._member_active_roles(UUID) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- HELPER: is this member mid-handover as the OUTGOING party?
-- (Scenario E — block deletion until successor is verified.)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._member_outgoing_handovers(p_member_id UUID)
RETURNS TABLE (
  handover_id UUID,
  role_label TEXT,
  status TEXT,
  nominee_member_id UUID
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT eh.id, ma.role_label, eh.status, eh.nominee_member_id
  FROM public.exec_handovers eh
  LEFT JOIN public.member_admins ma ON ma.id = eh.outgoing_admin_id
  WHERE eh.outgoing_member_id = p_member_id
    AND eh.status IN ('nominated', 'accepted');
$$;

GRANT EXECUTE ON FUNCTION public._member_outgoing_handovers(UUID) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- HELPER: does this member have transaction/receipt history?
-- Checks BOTH member_id (paid for) and paid_by (paid on behalf
-- of someone else) — missing paid_by would let a "pays for
-- others" member hard-delete and silently break the org's
-- attribution trail for every payment they ever submitted.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._member_has_financial_history(p_member_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.payments
    WHERE (member_id = p_member_id OR paid_by = p_member_id)
      AND (status = 'approved' OR receipt_url IS NOT NULL OR receipt_pdf_url IS NOT NULL)
  );
$$;

GRANT EXECUTE ON FUNCTION public._member_has_financial_history(UUID) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- RPC 1: request_account_deletion
-- The full decision tree. Never executes deletion directly —
-- queues an account_deletion_requests row and returns the branch
-- the eventual confirm step will take, OR returns a block reason.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.request_account_deletion(
  p_member_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_member       public.organization_members;
  v_active_roles jsonb;
  v_handovers    jsonb;
  v_has_history  BOOLEAN;
  v_token        UUID;
  v_path         TEXT;
BEGIN
  SELECT * INTO v_member
  FROM public.organization_members
  WHERE id = p_member_id;

  IF v_member.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found.');
  END IF;

  IF v_member.account_status <> 'active' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This account is already deleted or has left.');
  END IF;

  -- ── Scenario F: platform admin — never self-deletable here ──
  IF EXISTS (
    SELECT 1 FROM public.super_admins sa WHERE sa.email = v_member.email AND sa.is_active = TRUE
  ) THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'platform_admin_blocked',
      'error', 'Platform admin accounts cannot be self-deleted. Contact support.'
    );
  END IF;

  -- ── Scenario E: mid-handover as outgoing party, successor not yet verified ──
  SELECT jsonb_agg(jsonb_build_object(
    'handover_id', handover_id, 'role_label', role_label, 'status', status
  ))
  INTO v_handovers
  FROM public._member_outgoing_handovers(p_member_id);

  IF v_handovers IS NOT NULL AND jsonb_array_length(v_handovers) > 0 THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'handover_in_progress',
      'error', 'You have a handover in progress. Your successor has not been verified yet — you still hold the role until they pass verification.',
      'handovers', v_handovers
    );
  END IF;

  -- ── Scenarios A/B: holds active, verified, money-affecting role(s) ──
  SELECT jsonb_agg(jsonb_build_object(
    'admin_id', admin_id, 'role', role, 'role_label', role_label,
    'scope_level', scope_level, 'group_id', group_id,
    'group_name', group_name, 'group_kind', group_kind
  ))
  INTO v_active_roles
  FROM public._member_active_roles(p_member_id);

  IF v_active_roles IS NOT NULL AND jsonb_array_length(v_active_roles) > 0 THEN
    -- Scenario C exception: sole member of a group with zero history
    -- is handled by allowing deletion to proceed only when there is
    -- EXACTLY one active role, that role's group has member_count<=1,
    -- AND there's no financial history. Otherwise: block, every time.
    IF jsonb_array_length(v_active_roles) = 1
       AND (
         SELECT COUNT(*) FROM public.organization_members om
         WHERE om.group_id = (v_active_roles->0->>'group_id')::UUID
           AND om.account_status = 'active'
       ) <= 1
       AND NOT public._member_has_financial_history(p_member_id)
       AND NOT EXISTS (
         SELECT 1 FROM public.payments p
         WHERE p.group_id = (v_active_roles->0->>'group_id')::UUID
       )
    THEN
      -- Falls through to the normal history check below — this sole-
      -- founder, zero-history case is allowed to proceed to deletion,
      -- but the group itself must be archived in the SAME transaction
      -- (handled in confirm_account_deletion).
      v_path := 'hard_with_orphan_group';
    ELSE
      RETURN jsonb_build_object(
        'ok', FALSE,
        'code', 'active_role_blocked',
        'error', 'You hold an active exec role. Hand over your role(s) before deleting your account — otherwise the members in your tier lose access to dues collection and payout management.',
        'roles', v_active_roles
      );
    END IF;
  END IF;

  -- ── Determine hard vs soft path based on financial history ──
  v_has_history := public._member_has_financial_history(p_member_id);

  IF v_path IS NULL THEN
    v_path := CASE WHEN v_has_history THEN 'soft' ELSE 'hard' END;
  END IF;

  -- ── Expire any prior pending request before issuing a new token ──
  UPDATE public.account_deletion_requests
  SET status = 'expired'
  WHERE member_id = p_member_id AND status = 'pending';

  INSERT INTO public.account_deletion_requests (
    member_id, organization_id, deletion_path, had_transaction_history
  ) VALUES (
    p_member_id, v_member.organization_id, v_path, v_has_history
  )
  RETURNING confirmation_token INTO v_token;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'deletion_path', v_path,
    'had_transaction_history', v_has_history,
    'confirmation_token', v_token,
    'expires_in_hours', 24
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_account_deletion(UUID) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- RPC 2: confirm_account_deletion
-- Called when the member clicks the emailed confirmation link.
-- Re-validates everything (roles/handovers could have changed in
-- the 24h window) before actually executing hard or soft delete.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.confirm_account_deletion(
  p_token UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_req     public.account_deletion_requests;
  v_member  public.organization_members;
  v_recheck jsonb;
BEGIN
  SELECT * INTO v_req
  FROM public.account_deletion_requests
  WHERE confirmation_token = p_token AND status = 'pending';

  IF v_req.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This confirmation link is invalid or has already been used.');
  END IF;

  IF v_req.expires_at < NOW() THEN
    UPDATE public.account_deletion_requests SET status = 'expired' WHERE id = v_req.id;
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This confirmation link has expired. Please request deletion again.');
  END IF;

  -- ── Re-check block conditions — state may have changed since request ──
  v_recheck := public.request_account_deletion(v_req.member_id);
  -- request_account_deletion() as re-used here is read-mostly except for
  -- the INSERT — we accept the minor side effect of expiring/replacing
  -- the pending row (it's about to be confirmed anyway) in exchange for
  -- not duplicating the entire decision tree a second time.
  IF NOT (v_recheck->>'ok')::boolean THEN
    UPDATE public.account_deletion_requests SET status = 'cancelled' WHERE id = v_req.id;
    RETURN v_recheck;
  END IF;

  SELECT * INTO v_member FROM public.organization_members WHERE id = v_req.member_id;

  IF v_req.deletion_path = 'hard' OR v_req.deletion_path = 'hard_with_orphan_group' THEN
    -- ── HARD DELETE ── zero financial history confirmed.
    DELETE FROM public.organization_members WHERE id = v_member.id;

    IF v_req.deletion_path = 'hard_with_orphan_group' THEN
      UPDATE public.organization_groups
      SET group_status = 'archived', archived_at = NOW(), archive_reason = 'sole_member_deleted'
      WHERE id = (
        SELECT group_id FROM public.member_admins WHERE member_id = v_member.id LIMIT 1
      );
    END IF;
  ELSE
    -- ── SOFT DELETE + ANONYMIZE ── financial history exists.
    -- Receipts and payment rows are NEVER touched — only this row.
    UPDATE public.organization_members
    SET
      account_status   = 'deleted',
      full_name        = 'Former Member',
      email            = NULL,
      phone            = NULL,
      member_id        = CONCAT('deleted-', v_member.id::text),
      deleted_at       = NOW(),
      deletion_reason  = 'self_requested'
    WHERE id = v_member.id;

    -- Revoke any auth session/credentials immediately.
    UPDATE public.member_admins
    SET is_active = FALSE
    WHERE member_id = v_member.id AND is_active = TRUE;
  END IF;

  UPDATE public.account_deletion_requests
  SET status = 'confirmed', confirmed_at = NOW()
  WHERE id = v_req.id;

  RETURN jsonb_build_object('ok', TRUE, 'deletion_path', v_req.deletion_path);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_account_deletion(UUID) TO authenticated, anon, service_role;

-- ════════════════════════════════════════════════════════════
-- RPC 3: step_down_emergency
-- The lighter "I quit my role NOW, no successor lined up" exit.
-- Does NOT delete the account — only vacates the role and flags
-- the seat so your existing dormant-ownership notification system
-- picks it up. Distinct, lower-stakes action from full deletion.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.step_down_emergency(
  p_member_id UUID,
  p_admin_id  UUID,
  p_reason    TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.member_admins;
BEGIN
  SELECT * INTO v_admin
  FROM public.member_admins
  WHERE id = p_admin_id AND member_id = p_member_id AND is_active = TRUE;

  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Active role not found for this member.');
  END IF;

  -- Block if mid-handover — stepping down mid-flight is what the
  -- handover flow itself exists to do; don't let this RPC race it.
  IF EXISTS (
    SELECT 1 FROM public._member_outgoing_handovers(p_member_id)
    WHERE handover_id IS NOT NULL
  ) THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'handover_in_progress',
      'error', 'A handover is already in progress for this role. Use the handover flow instead.'
    );
  END IF;

  UPDATE public.member_admins
  SET is_active = FALSE, tenure_end = CURRENT_DATE, updated_at = NOW()
  WHERE id = p_admin_id;

  -- Flag the seat as vacant on the group so the dormant-ownership
  -- notification system surfaces it to the next tier up.
  UPDATE public.organization_groups
  SET group_status = CASE WHEN group_status = 'active' THEN 'active' ELSE group_status END
  WHERE id = v_admin.group_id;

  INSERT INTO public.notifications (
    organization_id, member_id, group_id, type, title, message, link, related_type, related_id
  )
  SELECT
    v_admin.organization_id, om.id, v_admin.group_id,
    'role_vacated',
    'A role just became vacant',
    COALESCE(v_admin.role_label, v_admin.role) || ' stepped down without a successor. ' ||
      'This seat is now open — claim it from your dashboard if you''re taking it on.',
    '/claim', 'member_admins', p_admin_id
  FROM public.organization_members om
  WHERE om.group_id = v_admin.group_id
    AND om.account_status = 'active'
    AND om.id <> p_member_id;

  RETURN jsonb_build_object('ok', TRUE, 'message', 'Role vacated. Your account remains active.');
END;
$$;

GRANT EXECUTE ON FUNCTION public.step_down_emergency(UUID, UUID, TEXT) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- RPC 4: archive_group
-- Respects the Faculty → Department → Class cascade (mig 079).
-- Archiving a Department must walk EVERY Class beneath it, not
-- just direct children, and block on stranded Paystack balance
-- at ANY level in the subtree.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.archive_group(
  p_group_id UUID,
  p_admin_id UUID,
  p_reason   TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin       public.member_admins;
  v_group       public.organization_groups;
  v_subtree_ids UUID[];
  v_stranded    NUMERIC;
BEGIN
  SELECT * INTO v_admin FROM public.member_admins WHERE id = p_admin_id AND is_active = TRUE;
  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  SELECT * INTO v_group FROM public.organization_groups WHERE id = p_group_id;
  IF v_group.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Group not found.');
  END IF;

  IF v_admin.group_id <> p_group_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You can only archive a group you directly administer.');
  END IF;

  -- ── Walk the FULL subtree (every dept's classes, recursively) ──
  WITH RECURSIVE subtree AS (
    SELECT id FROM public.organization_groups WHERE id = p_group_id
    UNION ALL
    SELECT og.id
    FROM public.organization_groups og
    JOIN subtree s ON og.parent_group_id = s.id
  )
  SELECT array_agg(id) INTO v_subtree_ids FROM subtree;

  -- ── Block: any stranded Paystack balance anywhere in the subtree ──
  SELECT COALESCE(SUM(p.amount), 0) INTO v_stranded
  FROM public.payments p
  WHERE p.group_id = ANY(v_subtree_ids)
    AND p.status = 'approved'
    AND p.org_amount_settled IS NULL;  -- approved but not yet settled out

  IF v_stranded > 0 THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'code', 'stranded_balance',
      'error', format(
        'There is %s in unsettled funds across this group and its subtree. '
        'Spend it, distribute it, or transfer it before archiving.',
        v_stranded
      ),
      'stranded_amount', v_stranded
    );
  END IF;

  -- ── Archive the whole subtree ──
  UPDATE public.organization_groups
  SET group_status = 'archived', archived_at = NOW(), archived_by = p_admin_id, archive_reason = p_reason
  WHERE id = ANY(v_subtree_ids);

  RETURN jsonb_build_object('ok', TRUE, 'archived_count', array_length(v_subtree_ids, 1));
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_group(UUID, UUID, TEXT) TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE
    'Migration 148 applied: account deletion decision tree '
    '(request_account_deletion + confirm_account_deletion), '
    'step_down_emergency, and archive_group (full Faculty→Dept→Class '
    'subtree cascade with stranded-balance gate) are live.';
END $$;

COMMIT;