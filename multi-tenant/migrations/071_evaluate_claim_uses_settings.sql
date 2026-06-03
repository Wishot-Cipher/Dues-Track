-- ============================================================
-- Migration 071: evaluate_claim reads thresholds from platform_settings
--
-- Makes the graduated-trust thresholds operator-controlled (set in the console
-- Config section). Falls back to sensible defaults if the settings row is
-- missing. Logic is otherwise identical to migration 060.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.evaluate_claim(p_claim_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v               RECORD;
  v_cfg           public.platform_settings;
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
  v_base_boot     INTEGER;
  v_esc           INTEGER;
  v_window        INTEGER;
  v_indep_votes   INTEGER;
  v_review_h      NUMERIC;
BEGIN
  SELECT * INTO v FROM public.claim_requests WHERE id = p_claim_id;
  IF v IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.'); END IF;

  IF v.status = 'approved' THEN
    RETURN jsonb_build_object('ok', TRUE, 'granted', TRUE, 'grant_method', v.grant_method, 'current_layer', 4, 'status', 'approved');
  END IF;
  IF v.status NOT IN ('awaiting_votes','submitted','under_review') THEN
    RETURN jsonb_build_object('ok', TRUE, 'granted', FALSE, 'status', v.status);
  END IF;

  v_cfg := public._platform_settings();
  v_base_boot   := COALESCE(v_cfg.bootstrap_base_votes, 7);
  v_esc         := COALESCE(v_cfg.bootstrap_escalated_votes, 15);
  v_window      := COALESCE(v_cfg.bootstrap_window_hours, 72);
  v_indep_votes := COALESCE(v_cfg.independent_votes, 10);
  v_review_h    := COALESCE(v_cfg.platform_review_days, 7) * 24.0;

  SELECT organization_type INTO v_org_type FROM public.organizations WHERE id = v.organization_id;
  v_indep := public.org_is_independent(v_org_type);

  v_target_gid := CASE v.claimed_scope
    WHEN 'group' THEN v.claimed_group_id
    WHEN 'unit'  THEN v.claimed_unit_group_id
    ELSE NULL END;
  IF v_target_gid IS NOT NULL THEN
    SELECT parent_group_id INTO v_target_parent FROM public.organization_groups WHERE id = v_target_gid;
  END IF;

  IF NOT v_indep THEN
    IF v_target_parent IS NOT NULL THEN
      SELECT EXISTS (SELECT 1 FROM public.member_admins
        WHERE organization_id = v.organization_id AND group_id = v_target_parent
          AND is_active = TRUE AND verification_layer >= 4) INTO v_higher;
    ELSE
      SELECT EXISTS (SELECT 1 FROM public.member_admins
        WHERE organization_id = v.organization_id AND scope_level = 'org'
          AND is_active = TRUE AND verification_layer >= 4
          AND member_id <> v.claimant_user_id) INTO v_higher;
    END IF;
  END IF;

  v_base := CASE WHEN v_indep THEN v_indep_votes ELSE v_base_boot END;
  IF v.votes_received >= v_base AND v.layer3_reached_at IS NULL THEN
    UPDATE public.claim_requests
    SET layer3_reached_at = NOW(), current_layer = GREATEST(current_layer, 3), updated_at = NOW()
    WHERE id = p_claim_id;
    v.layer3_reached_at := NOW();
  END IF;

  IF v.layer3_reached_at IS NOT NULL THEN
    v_elapsed_h := EXTRACT(EPOCH FROM (NOW() - v.layer3_reached_at)) / 3600.0;
  END IF;

  IF v_indep THEN
    v_path := 'independent';
    v_req  := v_indep_votes;
    IF v.votes_received >= v_req THEN
      PERFORM public._finalize_claim_layer4(p_claim_id, 'independent_org_auto', NULL);
      v_granted := TRUE;
    END IF;
  ELSIF v_higher THEN
    v_path := 'awaiting_higher_exec';
    v_req  := v_base_boot;
  ELSE
    v_path := 'bootstrap';
    v_req  := CASE WHEN v_elapsed_h >= v_window THEN v_esc ELSE v_base_boot END;
    IF v_elapsed_h >= v_window AND v.votes_received >= v_esc THEN
      PERFORM public._finalize_claim_layer4(p_claim_id, 'bootstrap_votes', NULL);
      v_granted := TRUE;
    END IF;
  END IF;

  UPDATE public.claim_requests
  SET votes_required = v_req, updated_at = NOW()
  WHERE id = p_claim_id AND COALESCE(votes_required, 0) <> v_req;

  v_layer := CASE WHEN v_granted THEN 4
                  WHEN v.votes_received >= v_base THEN 3
                  ELSE GREATEST(COALESCE(v.current_layer, 1), 1) END;

  RETURN jsonb_build_object(
    'ok', TRUE, 'granted', v_granted, 'path', v_path, 'independent', v_indep,
    'higher_exec_exists', v_higher, 'votes_received', v.votes_received, 'votes_required', v_req,
    'base_threshold', v_base, 'current_layer', v_layer, 'layer3_reached_at', v.layer3_reached_at,
    'window_hours_elapsed', ROUND(v_elapsed_h, 1),
    'bootstrap_window_over', (v_path = 'bootstrap' AND v_elapsed_h >= v_window),
    'can_request_platform_review', (
      v_path IN ('bootstrap','awaiting_higher_exec')
      AND v.layer3_reached_at IS NOT NULL
      AND v_elapsed_h >= v_review_h
      AND v.platform_review_requested_at IS NULL
    ),
    'platform_review_requested', (v.platform_review_requested_at IS NOT NULL)
  );
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'Migration 071 complete: evaluate_claim reads platform_settings thresholds.';
END $$;

COMMIT;
