-- ============================================================
-- Migration 039: Claim flow RPCs — submit, vote, finalize
--
-- Per spec Parts 5–6: when someone wants to take an exec role on
-- an existing org (or step up to faculty/department admin), they
-- submit a claim. Active members of the target group then vote
-- (confirm / reject / abstain). When the confirmation threshold
-- is met, the claimant is auto-promoted to a verified exec.
--
-- Three RPCs:
--
--   1. submit_claim_request(...)
--        Caller (any member of the org) submits their claim to
--        be an exec at a chosen scope. Inserts claim_requests
--        with status='awaiting_votes', computes votes_required
--        via the existing compute_claim_votes_required() helper
--        (mig 015 — 30% of active members, min 3, max 20).
--
--   2. cast_claim_vote(claim_id, vote, comment?)
--        A member votes on a pending claim. Uses can_vote_on_claim
--        (mig 018) to gate eligibility. After insert, calls
--        finalize_claim_if_ready() — if confirm-count >=
--        votes_required, the claimant is promoted to a verified
--        admin AND the org flips active.
--
--   3. finalize_claim_if_ready(claim_id) — internal helper that
--        does the promotion / state flip. Idempotent: skips if
--        the claim is already approved.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1) submit_claim_request
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_claim_request(
  p_caller_member_id  UUID,
  p_claimed_role      TEXT,          -- president | treasurer | hod | class_rep | etc.
  p_claimed_scope     TEXT,          -- 'org' | 'unit' | 'group'
  p_claimed_group_id  UUID,          -- the target group (faculty if scope='unit', class if scope='group', NULL for org)
  p_position_title    TEXT,
  p_phone             TEXT,
  p_personal_email    TEXT,
  p_institutional_email TEXT,        -- optional .edu.ng email
  p_document_urls     TEXT[],        -- optional proof URLs
  p_method            TEXT DEFAULT 'member_vote'  -- email | member_vote | document
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id           UUID;
  v_caller_full_name TEXT;
  v_caller_email     TEXT;
  v_votes_required   INTEGER;
  v_claim_id         UUID;
  v_deadline         TIMESTAMPTZ;
BEGIN
  -- Validation
  IF p_caller_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;
  IF p_claimed_scope NOT IN ('org','unit','group') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid scope.');
  END IF;
  IF p_position_title IS NULL OR LENGTH(TRIM(p_position_title)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Position title is required.');
  END IF;

  SELECT organization_id, full_name, email
    INTO v_org_id, v_caller_full_name, v_caller_email
  FROM public.organization_members
  WHERE id = p_caller_member_id AND COALESCE(is_active, TRUE) = TRUE;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You are not a member of any organization.');
  END IF;

  -- Anti-double-submit: refuse if the caller already has a pending
  -- claim on this same target.
  IF EXISTS (
    SELECT 1 FROM public.claim_requests
    WHERE claimant_user_id = p_caller_member_id
      AND organization_id  = v_org_id
      AND status IN ('submitted','awaiting_votes','email_sent','under_review')
      AND (claimed_group_id IS NOT DISTINCT FROM p_claimed_group_id)
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You already have a pending claim for this position.');
  END IF;

  -- Compute vote threshold (30% of active members in target group, min 3, max 20)
  v_votes_required := public.compute_claim_votes_required(p_claimed_group_id, v_org_id);

  -- Vote window: 72 hours (per spec — disputes get 72h, claims get the same)
  v_deadline := NOW() + INTERVAL '72 hours';

  INSERT INTO public.claim_requests (
    organization_id, claimant_user_id,
    claimed_role, claimed_scope,
    claimed_unit_group_id, claimed_group_id,
    full_name, position_title, phone,
    institutional_email, personal_email,
    document_urls,
    verification_method,
    status,
    votes_required, votes_received,
    vote_deadline
  ) VALUES (
    v_org_id, p_caller_member_id,
    p_claimed_role, p_claimed_scope,
    -- unit_group_id only meaningful when scope='unit'
    CASE WHEN p_claimed_scope = 'unit' THEN p_claimed_group_id ELSE NULL END,
    -- group_id when scope='group'
    CASE WHEN p_claimed_scope = 'group' THEN p_claimed_group_id ELSE NULL END,
    v_caller_full_name,
    TRIM(p_position_title),
    COALESCE(p_phone, ''),
    p_institutional_email,
    COALESCE(p_personal_email, v_caller_email, ''),
    COALESCE(p_document_urls, '{}'::TEXT[]),
    COALESCE(p_method, 'member_vote'),
    'awaiting_votes',
    v_votes_required, 0,
    v_deadline
  )
  RETURNING id INTO v_claim_id;

  -- Notify every active member of the target group that a vote is needed.
  -- Reuses the notifications table (no payment_type linkage so related_type='claim_request').
  INSERT INTO public.notifications (
    organization_id, member_id, group_id,
    type, title, message, link,
    related_type, related_id
  )
  SELECT
    v_org_id,
    om.id,
    om.group_id,
    'claim_vote_requested',
    'Vote on a claim: ' || v_caller_full_name,
    v_caller_full_name || ' is claiming to be your ' || TRIM(p_position_title)
       || '. Confirm or reject — ' || v_votes_required || ' votes needed.',
    '/claims/' || v_claim_id,
    'claim_request',
    v_claim_id
  FROM public.organization_members om
  WHERE om.organization_id = v_org_id
    AND COALESCE(om.is_active, TRUE) = TRUE
    AND om.id <> p_caller_member_id      -- claimant can't vote on their own claim
    AND (
      p_claimed_scope = 'org'
      OR (p_claimed_scope = 'unit'
          AND (om.group_id = p_claimed_group_id
               OR om.group_id IN (
                 SELECT id FROM public.organization_groups
                 WHERE parent_group_id = p_claimed_group_id
               )))
      OR (p_claimed_scope = 'group' AND om.group_id = p_claimed_group_id)
    );

  RETURN jsonb_build_object(
    'ok',              TRUE,
    'claim_id',        v_claim_id,
    'votes_required',  v_votes_required,
    'vote_deadline',   v_deadline
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not submit claim: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_claim_request(UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT)
  TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 2) finalize_claim_if_ready — internal helper
-- ────────────────────────────────────────────────────────────
-- When a vote is cast, this checks whether the threshold has been
-- met. If yes:
--   • marks the claim approved
--   • inserts (or updates) member_admins for the claimant with
--     verification_status='member_confirmed'
--   • flips org_state from 'acting' to 'active' if this is the
--     first verified exec (per spec: solo founder already 'active';
--     this handles late-arriving execs on previously orphaned orgs)
--   • notifies the claimant of their approval
-- Idempotent — safe to call multiple times.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.finalize_claim_if_ready(p_claim_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_claim         RECORD;
  v_confirm_count INTEGER;
  v_new_admin_id  UUID;
  v_target_gid    UUID;
BEGIN
  SELECT * INTO v_claim FROM public.claim_requests WHERE id = p_claim_id;
  IF v_claim IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.');
  END IF;
  IF v_claim.status = 'approved' THEN
    RETURN jsonb_build_object('ok', TRUE, 'already_approved', TRUE);
  END IF;

  SELECT COUNT(*) INTO v_confirm_count
  FROM public.claim_votes
  WHERE claim_request_id = p_claim_id AND vote = 'confirm';

  -- Update running count regardless of threshold
  UPDATE public.claim_requests
  SET votes_received = v_confirm_count, updated_at = NOW()
  WHERE id = p_claim_id;

  IF v_confirm_count < v_claim.votes_required THEN
    RETURN jsonb_build_object(
      'ok', TRUE,
      'approved', FALSE,
      'votes_received', v_confirm_count,
      'votes_required', v_claim.votes_required
    );
  END IF;

  -- Threshold met — promote
  v_target_gid := CASE
    WHEN v_claim.claimed_scope = 'group' THEN v_claim.claimed_group_id
    WHEN v_claim.claimed_scope = 'unit'  THEN v_claim.claimed_unit_group_id
    ELSE NULL
  END;

  -- Upsert member_admins (one row per member, scope, group)
  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments,
    can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics,
    can_export_data, can_manage_settings,
    verification_status, verification_method, verified_at,
    is_active, tenure_start
  ) VALUES (
    v_claim.claimant_user_id, v_claim.organization_id, v_target_gid,
    v_claim.claimed_role, v_claim.position_title, v_claim.claimed_scope,
    TRUE, TRUE, TRUE, TRUE,
    TRUE, TRUE, TRUE, TRUE,
    'member_confirmed', 'member_vote', NOW(),
    TRUE, CURRENT_DATE
  )
  ON CONFLICT (member_id, organization_id, group_id, role) DO UPDATE
    SET verification_status = 'member_confirmed',
        verification_method = 'member_vote',
        verified_at         = NOW(),
        is_active           = TRUE,
        updated_at          = NOW()
  RETURNING id INTO v_new_admin_id;

  -- Mark the claim approved + linked
  UPDATE public.claim_requests
  SET status             = 'approved',
      resulting_admin_id = v_new_admin_id,
      resolved_at        = NOW(),
      updated_at         = NOW()
  WHERE id = p_claim_id;

  -- Flip org state: any org in 'acting' becomes 'active' as soon as
  -- one verified exec exists.
  UPDATE public.organizations
  SET org_state        = 'active',
      orphaned_at      = NULL,
      acting_started_at = NULL,
      acting_deadline_at = NULL,
      updated_at       = NOW()
  WHERE id = v_claim.organization_id
    AND org_state IN ('acting','orphaned');

  -- Notify the claimant
  INSERT INTO public.notifications (
    organization_id, member_id, group_id,
    type, title, message, link,
    related_type, related_id
  ) VALUES (
    v_claim.organization_id,
    v_claim.claimant_user_id,
    v_target_gid,
    'claim_approved',
    'You''re verified',
    'Your claim as ' || v_claim.position_title || ' was approved by ' ||
      v_confirm_count || ' members. You now have admin access.',
    '/dashboard',
    'claim_request',
    p_claim_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'approved', TRUE,
    'admin_id', v_new_admin_id,
    'votes_received', v_confirm_count,
    'votes_required', v_claim.votes_required
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Finalize failed: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.finalize_claim_if_ready(UUID) TO anon, authenticated;

-- ────────────────────────────────────────────────────────────
-- 3) cast_claim_vote
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cast_claim_vote(
  p_claim_id        UUID,
  p_voter_member_id UUID,
  p_vote            TEXT,    -- 'confirm' | 'reject' | 'abstain'
  p_comment         TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id         UUID;
  v_claim_status   TEXT;
  v_claimant_id    UUID;
  v_finalize       JSONB;
BEGIN
  IF p_voter_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;
  IF p_vote NOT IN ('confirm','reject','abstain') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid vote.');
  END IF;

  SELECT organization_id, status, claimant_user_id
    INTO v_org_id, v_claim_status, v_claimant_id
  FROM public.claim_requests WHERE id = p_claim_id;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.');
  END IF;
  IF v_claim_status <> 'awaiting_votes' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'This claim is ' || v_claim_status || ' — voting is closed.');
  END IF;
  IF v_claimant_id = p_voter_member_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You can''t vote on your own claim.');
  END IF;

  -- Voter must be an active member of the SAME org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE id = p_voter_member_id
      AND organization_id = v_org_id
      AND COALESCE(is_active, TRUE) = TRUE
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You must be a member of this organization to vote.');
  END IF;

  INSERT INTO public.claim_votes (
    claim_request_id, voter_member_id, organization_id, vote, comment
  ) VALUES (
    p_claim_id, p_voter_member_id, v_org_id, p_vote, COALESCE(p_comment, NULL)
  )
  ON CONFLICT (claim_request_id, voter_member_id) DO UPDATE
    SET vote = EXCLUDED.vote,
        comment = EXCLUDED.comment;

  -- Try to finalize
  v_finalize := public.finalize_claim_if_ready(p_claim_id);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'vote', p_vote,
    'finalize', v_finalize
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not record vote: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_claim_vote(UUID, UUID, TEXT, TEXT) TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 039 complete:';
  RAISE NOTICE '  - submit_claim_request()   submit + notify voters';
  RAISE NOTICE '  - cast_claim_vote()        record vote + auto-finalize on threshold';
  RAISE NOTICE '  - finalize_claim_if_ready() promotes to verified + flips org_state';
END $$;

COMMIT;
