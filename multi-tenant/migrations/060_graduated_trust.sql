-- ============================================================
-- Migration 060: Graduated trust — the full Layer-4 decision tree
--
-- Solves the "no higher exec exists yet" lock-out. Four paths to Layer 4:
--   A. higher_exec_confirmed   — academic org, a verified parent exec confirms.
--   B. bootstrap_votes         — academic org, NO higher exec: after a 72h
--                                window, 15 confirm votes unlock it.
--   C. independent_org_auto    — church/club/NGO/etc.: 10 confirm votes auto-unlock
--                                (no hierarchy by design).
--   D. platform_override       — stuck 7+ days: claimant requests review, a
--                                platform admin grants it (via the console).
--
-- Thresholds:           Layer 3 (acting)     Layer 4 (money)
--   academic+higher          7 votes          parent-exec confirm
--   academic bootstrap       7 votes          15 votes AND >=72h since Layer 3
--   independent             10 votes          10 votes (auto)
--
-- Lazy evaluation: evaluate_claim() runs on every vote AND on every status
-- read, so the 72h escalation and the eventual grant happen without a cron.
-- Every grant records HOW it happened in claim_requests.grant_method (audit).
-- ============================================================

BEGIN;

-- ── 1) New columns ──────────────────────────────────────────
ALTER TABLE public.claim_requests
  ADD COLUMN IF NOT EXISTS grant_method TEXT,
  ADD COLUMN IF NOT EXISTS layer3_reached_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS platform_review_requested_at TIMESTAMPTZ;

-- ── 2) Org-type independence ────────────────────────────────
CREATE OR REPLACE FUNCTION public.org_is_independent(p_org_type TEXT)
RETURNS BOOLEAN LANGUAGE SQL IMMUTABLE AS $$
  SELECT COALESCE(p_org_type, '') NOT IN ('university','polytechnic','college','school');
$$;

-- ── 3) Internal finalizer — promote claimant to a verified (Layer 4) admin ──
CREATE OR REPLACE FUNCTION public._finalize_claim_layer4(
  p_claim_id           UUID,
  p_grant_method       TEXT,
  p_confirmer_admin_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_claim      RECORD;
  v_target_gid UUID;
  v_admin_id   UUID;
BEGIN
  SELECT * INTO v_claim FROM public.claim_requests WHERE id = p_claim_id;
  IF v_claim IS NULL THEN RETURN NULL; END IF;
  IF v_claim.status = 'approved' THEN RETURN v_claim.resulting_admin_id; END IF;

  v_target_gid := CASE v_claim.claimed_scope
    WHEN 'group' THEN v_claim.claimed_group_id
    WHEN 'unit'  THEN v_claim.claimed_unit_group_id
    ELSE NULL END;

  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments, can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics, can_export_data, can_manage_settings,
    verification_status, verification_method, verified_at, verification_layer,
    confirmed_by_admin_id, is_active, tenure_start
  ) VALUES (
    v_claim.claimant_user_id, v_claim.organization_id, v_target_gid,
    v_claim.claimed_role, v_claim.position_title, v_claim.claimed_scope,
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    'admin_verified', 'admin', NOW(), 4,
    p_confirmer_admin_id, TRUE, CURRENT_DATE
  )
  ON CONFLICT (member_id, organization_id, group_id, role) DO UPDATE
    SET verification_status   = 'admin_verified',
        verification_layer    = GREATEST(member_admins.verification_layer, 4),
        confirmed_by_admin_id  = COALESCE(EXCLUDED.confirmed_by_admin_id, member_admins.confirmed_by_admin_id),
        verified_at           = NOW(),
        is_active             = TRUE,
        updated_at            = NOW()
  RETURNING id INTO v_admin_id;

  UPDATE public.claim_requests
  SET status             = 'approved',
      resulting_admin_id = v_admin_id,
      current_layer      = 4,
      grant_method       = p_grant_method,
      resolved_at        = NOW(),
      updated_at         = NOW()
  WHERE id = p_claim_id;

  UPDATE public.organizations
  SET org_state = 'active', orphaned_at = NULL, acting_started_at = NULL, acting_deadline_at = NULL, updated_at = NOW()
  WHERE id = v_claim.organization_id AND org_state IN ('acting','orphaned');

  INSERT INTO public.notifications (
    organization_id, member_id, group_id, type, title, message, link, related_type, related_id
  ) VALUES (
    v_claim.organization_id, v_claim.claimant_user_id, v_target_gid,
    'claim_approved', 'You''re verified',
    'Your role as ' || v_claim.position_title || ' is now verified. You have full admin access — money is unlocked.',
    '/dashboard', 'claim_request', p_claim_id
  );

  RETURN v_admin_id;
END;
$$;

-- ── 4) evaluate_claim — the decision tree (idempotent, has grant side-effects) ──
CREATE OR REPLACE FUNCTION public.evaluate_claim(p_claim_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v               RECORD;
  v_org_type      TEXT;
  v_indep         BOOLEAN;
  v_higher        BOOLEAN := FALSE;
  v_target_gid    UUID;
  v_target_parent UUID;
  v_base          INTEGER;
  v_req           INTEGER;
  v_elapsed_h     NUMERIC := 0;
  v_path          TEXT;
  v_granted       BOOLEAN := FALSE;
  v_layer         INTEGER;
BEGIN
  SELECT * INTO v FROM public.claim_requests WHERE id = p_claim_id;
  IF v IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.'); END IF;

  IF v.status = 'approved' THEN
    RETURN jsonb_build_object('ok', TRUE, 'granted', TRUE, 'grant_method', v.grant_method, 'current_layer', 4, 'status', 'approved');
  END IF;
  IF v.status NOT IN ('awaiting_votes','submitted','under_review') THEN
    RETURN jsonb_build_object('ok', TRUE, 'granted', FALSE, 'status', v.status);
  END IF;

  SELECT organization_type INTO v_org_type FROM public.organizations WHERE id = v.organization_id;
  v_indep := public.org_is_independent(v_org_type);

  v_target_gid := CASE v.claimed_scope
    WHEN 'group' THEN v.claimed_group_id
    WHEN 'unit'  THEN v.claimed_unit_group_id
    ELSE NULL END;
  IF v_target_gid IS NOT NULL THEN
    SELECT parent_group_id INTO v_target_parent FROM public.organization_groups WHERE id = v_target_gid;
  END IF;

  -- Higher verified exec? (academic orgs only)
  IF NOT v_indep THEN
    IF v_target_parent IS NOT NULL THEN
      SELECT EXISTS (
        SELECT 1 FROM public.member_admins
        WHERE organization_id = v.organization_id AND group_id = v_target_parent
          AND is_active = TRUE AND verification_layer >= 4
      ) INTO v_higher;
    ELSE
      SELECT EXISTS (
        SELECT 1 FROM public.member_admins
        WHERE organization_id = v.organization_id AND scope_level = 'org'
          AND is_active = TRUE AND verification_layer >= 4
          AND member_id <> v.claimant_user_id
      ) INTO v_higher;
    END IF;
  END IF;

  -- Mark Layer 3 the first time the base vote threshold is met
  v_base := CASE WHEN v_indep THEN 10 ELSE 7 END;
  IF v.votes_received >= v_base AND v.layer3_reached_at IS NULL THEN
    UPDATE public.claim_requests
    SET layer3_reached_at = NOW(), current_layer = GREATEST(current_layer, 3), updated_at = NOW()
    WHERE id = p_claim_id;
    v.layer3_reached_at := NOW();
  END IF;

  IF v.layer3_reached_at IS NOT NULL THEN
    v_elapsed_h := EXTRACT(EPOCH FROM (NOW() - v.layer3_reached_at)) / 3600.0;
  END IF;

  -- Decide the path + requirement, granting Layer 4 where eligible
  IF v_indep THEN
    v_path := 'independent';
    v_req  := 10;
    IF v.votes_received >= v_req THEN
      PERFORM public._finalize_claim_layer4(p_claim_id, 'independent_org_auto', NULL);
      v_granted := TRUE;
    END IF;
  ELSIF v_higher THEN
    v_path := 'awaiting_higher_exec';
    v_req  := 7;  -- votes are a strengthener; a parent exec grants Layer 4
  ELSE
    v_path := 'bootstrap';
    v_req  := CASE WHEN v_elapsed_h >= 72 THEN 15 ELSE 7 END;
    IF v_elapsed_h >= 72 AND v.votes_received >= 15 THEN
      PERFORM public._finalize_claim_layer4(p_claim_id, 'bootstrap_votes', NULL);
      v_granted := TRUE;
    END IF;
  END IF;

  -- Keep votes_required current for the UI
  UPDATE public.claim_requests
  SET votes_required = v_req, updated_at = NOW()
  WHERE id = p_claim_id AND COALESCE(votes_required, 0) <> v_req;

  v_layer := CASE WHEN v_granted THEN 4
                  WHEN v.votes_received >= v_base THEN 3
                  ELSE GREATEST(COALESCE(v.current_layer, 1), 1) END;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'granted', v_granted,
    'path', v_path,
    'independent', v_indep,
    'higher_exec_exists', v_higher,
    'votes_received', v.votes_received,
    'votes_required', v_req,
    'base_threshold', v_base,
    'current_layer', v_layer,
    'layer3_reached_at', v.layer3_reached_at,
    'window_hours_elapsed', ROUND(v_elapsed_h, 1),
    'bootstrap_window_over', (v_path = 'bootstrap' AND v_elapsed_h >= 72),
    'can_request_platform_review', (
      v_path IN ('bootstrap','awaiting_higher_exec')
      AND v.layer3_reached_at IS NOT NULL
      AND v_elapsed_h >= 168            -- 7 days
      AND v.platform_review_requested_at IS NULL
    ),
    'platform_review_requested', (v.platform_review_requested_at IS NOT NULL)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.org_is_independent(TEXT) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.evaluate_claim(UUID) TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._finalize_claim_layer4(UUID, TEXT, UUID) TO service_role;

-- ── 5) Rewrite cast_claim_vote_v2 to funnel through evaluate_claim ──
CREATE OR REPLACE FUNCTION public.cast_claim_vote_v2(
  p_claim_id        UUID,
  p_voter_member_id UUID,
  p_vote            TEXT,
  p_comment         TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_claim         RECORD;
  v_confirm_count INTEGER;
  v_eval          jsonb;
BEGIN
  IF p_voter_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;
  IF p_vote NOT IN ('confirm','reject','abstain') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid vote.');
  END IF;

  SELECT * INTO v_claim FROM public.claim_requests WHERE id = p_claim_id;
  IF v_claim IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.'); END IF;
  IF v_claim.status <> 'awaiting_votes' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'This claim is ' || v_claim.status || ' — voting is closed.');
  END IF;
  IF v_claim.claimant_user_id = p_voter_member_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You can''t vote on your own claim.');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE id = p_voter_member_id AND organization_id = v_claim.organization_id AND COALESCE(is_active, TRUE) = TRUE
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You must be a member of this organization to vote.');
  END IF;

  INSERT INTO public.claim_votes (claim_request_id, voter_member_id, organization_id, vote, comment)
  VALUES (p_claim_id, p_voter_member_id, v_claim.organization_id, p_vote, COALESCE(p_comment, NULL))
  ON CONFLICT (claim_request_id, voter_member_id) DO UPDATE
    SET vote = EXCLUDED.vote, comment = EXCLUDED.comment;

  SELECT COUNT(*) INTO v_confirm_count
  FROM public.claim_votes WHERE claim_request_id = p_claim_id AND vote = 'confirm';

  UPDATE public.claim_requests SET votes_received = v_confirm_count, updated_at = NOW() WHERE id = p_claim_id;

  -- Run the decision tree (grants Layer 4 if now eligible)
  v_eval := public.evaluate_claim(p_claim_id);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'vote', p_vote,
    'votes_received', v_confirm_count,
    'evaluation', v_eval
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not record vote: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.cast_claim_vote_v2(UUID, UUID, TEXT, TEXT) TO anon, authenticated;

-- ── 6) confirm_claim_by_parent_exec → grant via _finalize (Path A) ──
CREATE OR REPLACE FUNCTION public.confirm_claim_by_parent_exec(
  p_claim_id            UUID,
  p_confirmer_member_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_claim         RECORD;
  v_confirmer     RECORD;
  v_target_gid    UUID;
  v_target_parent UUID;
  v_admin_id      UUID;
BEGIN
  IF p_confirmer_member_id IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.'); END IF;

  SELECT * INTO v_claim FROM public.claim_requests WHERE id = p_claim_id;
  IF v_claim IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.'); END IF;
  IF v_claim.status NOT IN ('awaiting_votes','submitted','under_review') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim is ' || v_claim.status || ' — cannot confirm.');
  END IF;
  IF v_claim.claimant_user_id = p_confirmer_member_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You can''t confirm your own claim.');
  END IF;

  v_target_gid := CASE v_claim.claimed_scope
    WHEN 'group' THEN v_claim.claimed_group_id
    WHEN 'unit'  THEN v_claim.claimed_unit_group_id
    ELSE NULL END;
  IF v_target_gid IS NOT NULL THEN
    SELECT parent_group_id INTO v_target_parent FROM public.organization_groups WHERE id = v_target_gid;
  END IF;

  SELECT id, group_id, scope_level INTO v_confirmer
  FROM public.member_admins
  WHERE member_id = p_confirmer_member_id AND organization_id = v_claim.organization_id
    AND is_active = TRUE AND verification_layer >= 4
  ORDER BY verification_layer DESC, created_at DESC
  LIMIT 1;

  IF v_confirmer IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only a verified parent-org exec can confirm.');
  END IF;
  IF v_confirmer.scope_level <> 'org'
     AND v_confirmer.group_id IS DISTINCT FROM v_target_parent
     AND v_confirmer.group_id IS DISTINCT FROM v_target_gid THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You can only confirm execs under your own scope.');
  END IF;

  v_admin_id := public._finalize_claim_layer4(p_claim_id, 'higher_exec_confirmed', v_confirmer.id);
  UPDATE public.claim_requests
  SET reviewed_by_user_id = p_confirmer_member_id, reviewed_at = NOW()
  WHERE id = p_claim_id;

  RETURN jsonb_build_object('ok', TRUE, 'admin_id', v_admin_id, 'layer', 4, 'grant_method', 'higher_exec_confirmed');
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Confirm failed: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.confirm_claim_by_parent_exec(UUID, UUID) TO anon, authenticated;

-- ── 7) request_platform_review — Path D escape valve (claimant-initiated) ──
CREATE OR REPLACE FUNCTION public.request_platform_review(
  p_claim_id        UUID,
  p_caller_member_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_claim RECORD;
  v_eval  jsonb;
BEGIN
  SELECT * INTO v_claim FROM public.claim_requests WHERE id = p_claim_id;
  IF v_claim IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.'); END IF;
  IF v_claim.claimant_user_id <> p_caller_member_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only the claimant can request a review.');
  END IF;
  IF v_claim.status = 'approved' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Already verified.');
  END IF;

  v_eval := public.evaluate_claim(p_claim_id);
  IF NOT COALESCE((v_eval->>'can_request_platform_review')::BOOLEAN, FALSE) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'A platform review can only be requested after 7 days without resolution.');
  END IF;

  UPDATE public.claim_requests
  SET platform_review_requested_at = NOW(), status = 'under_review', updated_at = NOW()
  WHERE id = p_claim_id;

  RETURN jsonb_build_object('ok', TRUE, 'requested_at', NOW());
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not request review: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.request_platform_review(UUID, UUID) TO anon, authenticated;

-- ── 8) platform_grant_claim — Path D grant (console / service-role only) ──
CREATE OR REPLACE FUNCTION public.platform_grant_claim(p_claim_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_admin_id UUID;
BEGIN
  v_admin_id := public._finalize_claim_layer4(p_claim_id, 'platform_override', NULL);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.');
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'admin_id', v_admin_id, 'grant_method', 'platform_override');
END;
$$;

-- Only the platform console (service role) may grant overrides.
REVOKE ALL ON FUNCTION public.platform_grant_claim(UUID) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.platform_grant_claim(UUID) TO service_role;

-- ── 9) get_claim_status — claimant-facing read (runs evaluate_claim lazily) ──
CREATE OR REPLACE FUNCTION public.get_claim_status(p_claim_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_eval jsonb;
  v RECORD;
BEGIN
  v_eval := public.evaluate_claim(p_claim_id);
  SELECT status, position_title, claimed_scope, grant_method, votes_received, votes_required,
         platform_review_requested_at
    INTO v
  FROM public.claim_requests WHERE id = p_claim_id;

  RETURN v_eval
    || jsonb_build_object(
      'status', v.status,
      'position_title', v.position_title,
      'grant_method', v.grant_method
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_claim_status(UUID) TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 060 complete: graduated-trust decision tree live.';
  RAISE NOTICE '  Paths: higher_exec_confirmed | bootstrap_votes | independent_org_auto | platform_override';
  RAISE NOTICE '  evaluate_claim() runs lazily on vote + status read (no cron needed).';
END $$;

COMMIT;
