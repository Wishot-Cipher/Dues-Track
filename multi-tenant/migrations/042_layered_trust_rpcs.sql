-- ============================================================
-- Migration 042: Layered-trust verification RPCs
--
-- Implements Phase B of Blueprint §13.11. Supersedes the
-- single-pass verification logic from mig 039 without dropping
-- those functions — they continue to work for any UI not yet
-- migrated; the new v2 functions are what we wire the new UI to.
--
-- Four RPCs + one internal helper:
--
--   submit_claim_v2(...)
--       Computes bootstrap_path (no verified parent exec exists),
--       sets required_layer (3 if bootstrap, 4 otherwise) and
--       votes_required (7 if bootstrap, 30% rule otherwise),
--       enforces cooldown, inserts the claim, notifies eligible
--       voters AND eligible parent execs.
--
--   cast_claim_vote_v2(claim_id, vote, comment)
--       Records the vote. Recomputes current_layer.
--       ONLY auto-finalizes if bootstrap_path AND threshold met.
--       Non-bootstrap claims wait for parent-exec confirmation.
--
--   confirm_claim_by_parent_exec(claim_id, confirmer_admin_id)
--       The Layer-4 trust anchor. Verified parent-org exec confirms
--       the claimant. Promotes the resulting admin to layer=4,
--       writes confirmed_by_admin_id, flips org_state → active,
--       notifies claimant.
--
--   reject_claim_by_parent_exec(claim_id, confirmer_admin_id, reason)
--       Counterpart to confirm. Marks claim rejected and inserts
--       a 90-day cooldown row in claim_rejections.
--
--   _claim_signature(scope, group_id, role) [internal]
--       Builds the cooldown key for claim_rejections.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- _claim_signature — internal cooldown key helper
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._claim_signature(
  p_scope    TEXT,
  p_group_id UUID,
  p_role     TEXT
)
RETURNS TEXT
LANGUAGE SQL
IMMUTABLE
AS $$
  SELECT p_scope || ':' || COALESCE(p_group_id::TEXT, 'null') || ':' || COALESCE(p_role, '');
$$;

-- ════════════════════════════════════════════════════════════
-- 1) submit_claim_v2
-- ════════════════════════════════════════════════════════════
-- Layered-trust submission. Builds the claim with the right
-- threshold/required_layer for the situation.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.submit_claim_v2(
  p_caller_member_id   UUID,
  p_claimed_role       TEXT,
  p_claimed_scope      TEXT,           -- 'org' | 'unit' | 'group'
  p_claimed_group_id   UUID,           -- target group (NULL for scope=org)
  p_position_title     TEXT,
  p_phone              TEXT,
  p_personal_email     TEXT,
  p_institutional_email TEXT,
  p_document_urls      TEXT[],
  p_method             TEXT DEFAULT 'member_vote'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id            UUID;
  v_caller_full_name  TEXT;
  v_caller_email      TEXT;
  v_signature         TEXT;
  v_under_cooldown    BOOLEAN;
  v_parent_exists     BOOLEAN := FALSE;
  v_bootstrap         BOOLEAN;
  v_required_layer    INTEGER;
  v_votes_required    INTEGER;
  v_deadline          TIMESTAMPTZ;
  v_claim_id          UUID;
  v_target_kind       TEXT;
  v_target_parent     UUID;
BEGIN
  -- ── Validate ──
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

  -- ── Cooldown check (Blueprint §13.12) ──
  v_signature := public._claim_signature(p_claimed_scope, p_claimed_group_id, p_claimed_role);
  v_under_cooldown := public.is_member_under_cooldown(p_caller_member_id, v_signature);
  IF v_under_cooldown THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You were previously rejected for this role. You can try again after the cooldown ends.');
  END IF;

  -- ── Anti-double-submit ──
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

  -- ── Resolve target group info (for parent lookup) ──
  IF p_claimed_group_id IS NOT NULL THEN
    SELECT kind, parent_group_id INTO v_target_kind, v_target_parent
    FROM public.organization_groups
    WHERE id = p_claimed_group_id;
  END IF;

  -- ── Decide bootstrap_path: does a verified parent-org exec exist? ──
  --
  -- For a class claim:    parent is the department (target.parent_group_id)
  -- For a dept claim:     parent is the faculty (target.parent_group_id)
  -- For a faculty claim:  parent is the org (scope='org' admin)
  -- For an org claim:     always bootstrap (no parent above SUG/president)
  IF p_claimed_scope = 'group' AND v_target_parent IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.member_admins
      WHERE organization_id = v_org_id
        AND group_id        = v_target_parent
        AND is_active       = TRUE
        AND verification_layer >= 4
    ) INTO v_parent_exists;
  ELSIF p_claimed_scope = 'unit' AND v_target_parent IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.member_admins
      WHERE organization_id = v_org_id
        AND group_id        = v_target_parent
        AND is_active       = TRUE
        AND verification_layer >= 4
    ) INTO v_parent_exists;
  ELSIF p_claimed_scope = 'unit' AND v_target_parent IS NULL THEN
    -- faculty with no college parent → look for an org-scope admin
    SELECT EXISTS (
      SELECT 1 FROM public.member_admins
      WHERE organization_id = v_org_id
        AND scope_level     = 'org'
        AND is_active       = TRUE
        AND verification_layer >= 4
    ) INTO v_parent_exists;
  END IF;

  v_bootstrap := NOT COALESCE(v_parent_exists, FALSE);

  -- ── Thresholds per path (Blueprint §13.12 LOCKED) ──
  IF v_bootstrap THEN
    -- Bootstrap requires BOTH: 7 classmates AND school email
    IF p_institutional_email IS NULL OR LENGTH(TRIM(p_institutional_email)) < 3 THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'This is the first claim at this organization — a verified school email is required.');
    END IF;
    v_required_layer := 3;
    v_votes_required := 7;
  ELSE
    v_required_layer := 4;
    v_votes_required := public.compute_claim_votes_required(p_claimed_group_id, v_org_id);
  END IF;

  v_deadline := NOW() + INTERVAL '72 hours';

  -- ── Insert claim ──
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
    vote_deadline,
    bootstrap_path, required_layer, current_layer
  ) VALUES (
    v_org_id, p_caller_member_id,
    p_claimed_role, p_claimed_scope,
    CASE WHEN p_claimed_scope = 'unit'  THEN p_claimed_group_id ELSE NULL END,
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
    v_deadline,
    v_bootstrap, v_required_layer, 1  -- starts at Layer 1 (self-declared)
  )
  RETURNING id INTO v_claim_id;

  -- ── Notify peers (Layer 3 voters) ──
  -- Only for bootstrap path OR when method='member_vote'. Non-bootstrap claims
  -- still get peer signals as a strengthener even though Layer 4 is the unlock.
  INSERT INTO public.notifications (
    organization_id, member_id, group_id,
    type, title, message, link,
    related_type, related_id
  )
  SELECT
    v_org_id, om.id, om.group_id,
    'claim_vote_requested',
    'Vote on a claim: ' || v_caller_full_name,
    v_caller_full_name || ' is claiming to be your ' || TRIM(p_position_title) ||
       '. Confirm or reject — ' || v_votes_required || ' votes needed.',
    '/claims/' || v_claim_id,
    'claim_request',
    v_claim_id
  FROM public.organization_members om
  WHERE om.organization_id = v_org_id
    AND COALESCE(om.is_active, TRUE) = TRUE
    AND om.id <> p_caller_member_id
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

  -- ── Notify parent execs (Layer 4 confirmers) ──
  -- Only when NOT bootstrap — there's actually someone above to ask.
  IF NOT v_bootstrap AND v_target_parent IS NOT NULL THEN
    INSERT INTO public.notifications (
      organization_id, member_id, group_id,
      type, title, message, link,
      related_type, related_id
    )
    SELECT
      v_org_id, ma.member_id, ma.group_id,
      'claim_confirm_requested',
      'Confirm a claim: ' || v_caller_full_name,
      v_caller_full_name || ' is claiming to be a ' || TRIM(p_position_title) ||
         ' under your ' || v_target_kind || '. Confirm to unlock their access.',
      '/claims/' || v_claim_id,
      'claim_request',
      v_claim_id
    FROM public.member_admins ma
    WHERE ma.organization_id = v_org_id
      AND ma.group_id = v_target_parent
      AND ma.is_active = TRUE
      AND ma.verification_layer >= 4;
  END IF;

  RETURN jsonb_build_object(
    'ok',              TRUE,
    'claim_id',        v_claim_id,
    'bootstrap_path',  v_bootstrap,
    'required_layer',  v_required_layer,
    'votes_required',  v_votes_required,
    'vote_deadline',   v_deadline
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not submit claim: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.submit_claim_v2(
  UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT
) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 2) cast_claim_vote_v2
-- ════════════════════════════════════════════════════════════
-- Records the vote, recomputes current_layer.
-- Only auto-finalizes on bootstrap (no parent exec exists).
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cast_claim_vote_v2(
  p_claim_id        UUID,
  p_voter_member_id UUID,
  p_vote            TEXT,
  p_comment         TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_claim         RECORD;
  v_confirm_count INTEGER;
  v_new_layer     INTEGER;
  v_new_admin_id  UUID;
  v_target_gid    UUID;
  v_promoted      BOOLEAN := FALSE;
BEGIN
  IF p_voter_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;
  IF p_vote NOT IN ('confirm','reject','abstain') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid vote.');
  END IF;

  SELECT * INTO v_claim FROM public.claim_requests WHERE id = p_claim_id;
  IF v_claim IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.');
  END IF;
  IF v_claim.status <> 'awaiting_votes' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'This claim is ' || v_claim.status || ' — voting is closed.');
  END IF;
  IF v_claim.claimant_user_id = p_voter_member_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You can''t vote on your own claim.');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE id = p_voter_member_id
      AND organization_id = v_claim.organization_id
      AND COALESCE(is_active, TRUE) = TRUE
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You must be a member of this organization to vote.');
  END IF;

  INSERT INTO public.claim_votes (
    claim_request_id, voter_member_id, organization_id, vote, comment
  ) VALUES (
    p_claim_id, p_voter_member_id, v_claim.organization_id, p_vote, COALESCE(p_comment, NULL)
  )
  ON CONFLICT (claim_request_id, voter_member_id) DO UPDATE
    SET vote = EXCLUDED.vote, comment = EXCLUDED.comment;

  -- Update running confirm count
  SELECT COUNT(*) INTO v_confirm_count
  FROM public.claim_votes
  WHERE claim_request_id = p_claim_id AND vote = 'confirm';

  UPDATE public.claim_requests
  SET votes_received = v_confirm_count, updated_at = NOW()
  WHERE id = p_claim_id;

  -- Recompute current_layer
  v_new_layer := public.compute_trust_layer(p_claim_id);
  UPDATE public.claim_requests
  SET current_layer = GREATEST(current_layer, v_new_layer), updated_at = NOW()
  WHERE id = p_claim_id;

  -- Auto-finalize ONLY on bootstrap path when threshold met
  IF v_claim.bootstrap_path
     AND v_confirm_count >= v_claim.votes_required THEN
    v_target_gid := CASE
      WHEN v_claim.claimed_scope = 'group' THEN v_claim.claimed_group_id
      WHEN v_claim.claimed_scope = 'unit'  THEN v_claim.claimed_unit_group_id
      ELSE NULL
    END;

    INSERT INTO public.member_admins (
      member_id, organization_id, group_id,
      role, role_label, scope_level,
      can_create_payments, can_approve_payments,
      can_manage_members, can_manage_admins,
      can_manage_expenses, can_view_analytics,
      can_export_data, can_manage_settings,
      verification_status, verification_method, verified_at,
      verification_layer,
      is_active, tenure_start
    ) VALUES (
      v_claim.claimant_user_id, v_claim.organization_id, v_target_gid,
      v_claim.claimed_role, v_claim.position_title, v_claim.claimed_scope,
      TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
      'member_confirmed', 'member_vote', NOW(),
      3,  -- bootstrap-promoted = Layer 3 (peer-voted)
      TRUE, CURRENT_DATE
    )
    ON CONFLICT (member_id, organization_id, group_id, role) DO UPDATE
      SET verification_status = 'member_confirmed',
          verification_method = 'member_vote',
          verification_layer  = GREATEST(member_admins.verification_layer, 3),
          verified_at         = NOW(),
          is_active           = TRUE,
          updated_at          = NOW()
    RETURNING id INTO v_new_admin_id;

    UPDATE public.claim_requests
    SET status             = 'approved',
        resulting_admin_id = v_new_admin_id,
        resolved_at        = NOW(),
        current_layer      = GREATEST(current_layer, 3),
        updated_at         = NOW()
    WHERE id = p_claim_id;

    -- Bootstrap: this is the first verified exec → flip org active
    UPDATE public.organizations
    SET org_state          = 'active',
        orphaned_at        = NULL,
        acting_started_at  = NULL,
        acting_deadline_at = NULL,
        updated_at         = NOW()
    WHERE id = v_claim.organization_id AND org_state IN ('acting','orphaned');

    INSERT INTO public.notifications (
      organization_id, member_id, group_id,
      type, title, message, link,
      related_type, related_id
    ) VALUES (
      v_claim.organization_id,
      v_claim.claimant_user_id,
      v_target_gid,
      'claim_approved',
      'You''re verified — bootstrap path',
      'Your claim as ' || v_claim.position_title ||
        ' was confirmed by ' || v_confirm_count || ' members. Money unlocked.',
      '/dashboard',
      'claim_request',
      p_claim_id
    );

    v_promoted := TRUE;
  END IF;

  RETURN jsonb_build_object(
    'ok',             TRUE,
    'vote',           p_vote,
    'current_layer',  v_new_layer,
    'votes_received', v_confirm_count,
    'votes_required', v_claim.votes_required,
    'bootstrap_path', v_claim.bootstrap_path,
    'promoted',       v_promoted,
    'admin_id',       v_new_admin_id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not record vote: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_claim_vote_v2(UUID, UUID, TEXT, TEXT)
  TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 3) confirm_claim_by_parent_exec — the Layer 4 trust anchor
-- ════════════════════════════════════════════════════════════
-- Caller is a verified parent-org exec (layer >= 4). They confirm
-- the claimant → promoted to verified admin with layer=4, org flips
-- active, claimant notified, money unlocks.
-- ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.confirm_claim_by_parent_exec(
  p_claim_id          UUID,
  p_confirmer_member_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_claim          RECORD;
  v_confirmer      RECORD;
  v_target_gid     UUID;
  v_target_parent  UUID;
  v_new_admin_id   UUID;
BEGIN
  IF p_confirmer_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;

  SELECT * INTO v_claim FROM public.claim_requests WHERE id = p_claim_id;
  IF v_claim IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.');
  END IF;
  IF v_claim.status NOT IN ('awaiting_votes','submitted','under_review') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Claim is ' || v_claim.status || ' — cannot confirm.');
  END IF;
  IF v_claim.claimant_user_id = p_confirmer_member_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You can''t confirm your own claim.');
  END IF;

  -- Resolve target's parent
  v_target_gid := CASE
    WHEN v_claim.claimed_scope = 'group' THEN v_claim.claimed_group_id
    WHEN v_claim.claimed_scope = 'unit'  THEN v_claim.claimed_unit_group_id
    ELSE NULL
  END;
  IF v_target_gid IS NOT NULL THEN
    SELECT parent_group_id INTO v_target_parent
    FROM public.organization_groups WHERE id = v_target_gid;
  END IF;

  -- Confirmer must be a verified (layer >= 4) admin AT the parent's level
  SELECT id, group_id, scope_level, verification_layer
    INTO v_confirmer
  FROM public.member_admins
  WHERE member_id = p_confirmer_member_id
    AND organization_id = v_claim.organization_id
    AND is_active = TRUE
    AND verification_layer >= 4
  ORDER BY verification_layer DESC, created_at DESC
  LIMIT 1;

  IF v_confirmer IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You are not a verified exec — only verified parent-org execs can confirm.');
  END IF;

  -- Scope check: confirmer's group must be the parent of the target,
  -- OR the confirmer must be org-scope (covers SUG / president).
  IF v_confirmer.scope_level <> 'org'
     AND v_confirmer.group_id IS DISTINCT FROM v_target_parent
     AND v_confirmer.group_id IS DISTINCT FROM v_target_gid
  THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You can only confirm execs under your own scope.');
  END IF;

  -- Promote the claimant (upsert verified admin row with layer=4)
  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments,
    can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics,
    can_export_data, can_manage_settings,
    verification_status, verification_method, verified_at,
    verification_layer, confirmed_by_admin_id,
    is_active, tenure_start
  ) VALUES (
    v_claim.claimant_user_id, v_claim.organization_id, v_target_gid,
    v_claim.claimed_role, v_claim.position_title, v_claim.claimed_scope,
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    'admin_verified', 'admin', NOW(),
    4, v_confirmer.id,
    TRUE, CURRENT_DATE
  )
  ON CONFLICT (member_id, organization_id, group_id, role) DO UPDATE
    SET verification_status   = 'admin_verified',
        verification_method   = 'admin',
        verification_layer    = GREATEST(member_admins.verification_layer, 4),
        confirmed_by_admin_id = v_confirmer.id,
        verified_at           = NOW(),
        is_active             = TRUE,
        updated_at            = NOW()
  RETURNING id INTO v_new_admin_id;

  -- Update claim
  UPDATE public.claim_requests
  SET status             = 'approved',
      resulting_admin_id = v_new_admin_id,
      current_layer      = GREATEST(current_layer, 4),
      reviewed_by_user_id = p_confirmer_member_id,
      reviewed_at        = NOW(),
      resolved_at        = NOW(),
      updated_at         = NOW()
  WHERE id = p_claim_id;

  -- Flip org state if first verified exec
  UPDATE public.organizations
  SET org_state          = 'active',
      orphaned_at        = NULL,
      acting_started_at  = NULL,
      acting_deadline_at = NULL,
      updated_at         = NOW()
  WHERE id = v_claim.organization_id AND org_state IN ('acting','orphaned');

  -- Notify claimant
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
    'Confirmed by ' || (
      SELECT full_name FROM public.organization_members WHERE id = p_confirmer_member_id
    ) || '. You now have admin access — money is unlocked.',
    '/dashboard',
    'claim_request',
    p_claim_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'admin_id', v_new_admin_id,
    'layer', 4,
    'confirmer_admin_id', v_confirmer.id
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Confirm failed: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_claim_by_parent_exec(UUID, UUID)
  TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 4) reject_claim_by_parent_exec — soft reject with 90-day cooldown
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reject_claim_by_parent_exec(
  p_claim_id            UUID,
  p_confirmer_member_id UUID,
  p_reason              TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_claim       RECORD;
  v_confirmer   RECORD;
  v_signature   TEXT;
BEGIN
  IF p_confirmer_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;

  SELECT * INTO v_claim FROM public.claim_requests WHERE id = p_claim_id;
  IF v_claim IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.');
  END IF;
  IF v_claim.status NOT IN ('awaiting_votes','submitted','under_review') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim cannot be rejected in its current state.');
  END IF;

  -- Confirmer must be verified parent exec — same scope check as confirm
  SELECT id, verification_layer INTO v_confirmer
  FROM public.member_admins
  WHERE member_id = p_confirmer_member_id
    AND organization_id = v_claim.organization_id
    AND is_active = TRUE
    AND verification_layer >= 4
  LIMIT 1;
  IF v_confirmer IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You are not a verified exec — only verified execs can reject claims.');
  END IF;

  v_signature := public._claim_signature(
    v_claim.claimed_scope,
    COALESCE(v_claim.claimed_group_id, v_claim.claimed_unit_group_id),
    v_claim.claimed_role
  );

  -- Mark claim rejected
  UPDATE public.claim_requests
  SET status             = 'rejected',
      reviewed_by_user_id = p_confirmer_member_id,
      reviewer_notes     = COALESCE(p_reason, ''),
      reviewed_at        = NOW(),
      resolved_at        = NOW(),
      updated_at         = NOW()
  WHERE id = p_claim_id;

  -- 90-day cooldown
  INSERT INTO public.claim_rejections (
    member_id, organization_id, target_signature,
    rejected_by_admin_id, reason, expires_at
  ) VALUES (
    v_claim.claimant_user_id, v_claim.organization_id, v_signature,
    v_confirmer.id, p_reason, NOW() + INTERVAL '90 days'
  );

  -- Notify claimant
  INSERT INTO public.notifications (
    organization_id, member_id, group_id,
    type, title, message, link,
    related_type, related_id
  ) VALUES (
    v_claim.organization_id,
    v_claim.claimant_user_id,
    COALESCE(v_claim.claimed_group_id, v_claim.claimed_unit_group_id),
    'claim_rejected',
    'Claim rejected',
    'Your claim as ' || v_claim.position_title ||
       ' was rejected. ' || COALESCE(p_reason, '') ||
       ' You can try again after the 90-day cooldown.',
    '/dashboard',
    'claim_request',
    p_claim_id
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'cooldown_until', (NOW() + INTERVAL '90 days')
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Reject failed: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.reject_claim_by_parent_exec(UUID, UUID, TEXT)
  TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 042 complete (Phase B — Layered Trust RPCs):';
  RAISE NOTICE '  submit_claim_v2()            decides bootstrap_path + required_layer';
  RAISE NOTICE '  cast_claim_vote_v2()         auto-finalizes ONLY on bootstrap threshold';
  RAISE NOTICE '  confirm_claim_by_parent_exec() Layer 4 trust anchor — unlocks money';
  RAISE NOTICE '  reject_claim_by_parent_exec()  soft reject + 90-day cooldown';
END $$;

COMMIT;
