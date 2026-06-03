-- ============================================================
-- Migration 052: Org-scope claim guard (highest role only)
--
-- Ensures org-wide claims are reserved for the highest executive
-- role for each org type (e.g. SUG President for universities).
-- Other execs should be invited by the verified exec.
-- ============================================================

BEGIN;

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
  v_org_type          TEXT;
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

  SELECT COALESCE(organization_type, type, 'other')
    INTO v_org_type
  FROM public.organizations
  WHERE id = v_org_id;

  -- Org-wide claims are reserved for the top exec role only.
  IF p_claimed_scope = 'org' THEN
    IF v_org_type IN ('university','school') THEN
      IF p_claimed_role <> 'president' THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'Org-wide claims are reserved for the SUG President. Ask the verified exec to invite you.');
      END IF;
    ELSIF v_org_type = 'church' THEN
      IF p_claimed_role <> 'pastor' THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'Org-wide claims are reserved for the lead Pastor. Ask the verified exec to invite you.');
      END IF;
    ELSIF v_org_type = 'cooperative' THEN
      IF p_claimed_role <> 'chairman' THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'Org-wide claims are reserved for the Chairman. Ask the verified exec to invite you.');
      END IF;
    ELSIF v_org_type = 'ngo' THEN
      IF p_claimed_role <> 'director' THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'Org-wide claims are reserved for the Director. Ask the verified exec to invite you.');
      END IF;
    ELSE
      IF p_claimed_role <> 'president' THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'Org-wide claims are reserved for the top executive role. Ask the verified exec to invite you.');
      END IF;
    END IF;
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

DO $$
BEGIN
  RAISE NOTICE 'Migration 052 complete: org-scope claims restricted to top roles.';
END $$;

COMMIT;
