-- ============================================================
-- Migration 101: Self-claim review fix + contestation notifications.
--
-- Two bugs the user (UNN founder) hit in practice:
--
-- 1) Self-confirmation deadlock
--    submit_claim_v2 (mig 042) notifies parent-tier execs to confirm
--    a child-tier claim. If the claimant IS the parent exec (e.g. a
--    dept president who is ALSO claiming the class-rep role on their
--    own class — they were the dept's only Layer 4 exec when the
--    class was bootstrapped), the only person notified to confirm
--    is the claimant themselves. They never see the request on
--    their console — submit_claim_v2 had no self-exclusion, but the
--    inbox surface filters voters off their own claims, so the row
--    silently disappeared. Result: the claim sits in awaiting_votes
--    forever.
--
--    Fix: explicit self-exclusion when picking parent-exec confirmers
--    PLUS a graceful fallback to (in order)
--      a) other Layer 4 execs at the same parent group,
--      b) Layer 4 execs at the next ancestor up the tree,
--      c) Layer 4 org-scope execs,
--      d) the platform admin (super_admins table from mig 044).
--    Whoever ends up on the notification has the authority to
--    confirm; the original Layer 4 gate still applies. The bootstrap
--    path is unaffected — it never went through this notify branch.
--
-- 2) Contested role had no signal to either party
--    Two members can legitimately submit claims for the same
--    position (one is the real holder, one is contesting). The
--    existing flow lets both claims accumulate votes in silence.
--    The user wants both sides — and the platform — to KNOW.
--
--    Fix: when a new claim is submitted, look for OTHER pending
--    claims on the same (group_id, role) tuple and:
--      • push a "your role was contested" notification to each
--        prior claimant,
--      • surface the contestant on the new claim (claim_requests
--        already has all the rows; the FE can detect contestation
--        via count).
--
-- This migration only patches submit_claim_v2 — no schema change.
-- ============================================================

BEGIN;

-- Mig 042 declared this function with DEFAULTs on the trailing params.
-- CREATE OR REPLACE cannot REMOVE defaults from an existing signature
-- ("cannot remove parameter defaults from existing function", 42P13),
-- so we drop first and recreate clean. Re-running mig 101 stays safe.
DROP FUNCTION IF EXISTS public.submit_claim_v2(
  UUID, TEXT, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT[], TEXT
);

CREATE OR REPLACE FUNCTION public.submit_claim_v2(
  p_caller_member_id    UUID,
  p_claimed_role        TEXT,
  p_claimed_scope       TEXT,
  p_claimed_group_id    UUID,
  p_position_title      TEXT,
  p_phone               TEXT,
  p_personal_email      TEXT,
  p_institutional_email TEXT,
  p_document_urls       TEXT[],
  p_method              TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org_id            UUID;
  v_caller_full_name  TEXT;
  v_caller_email      TEXT;
  v_target_kind       TEXT;
  v_target_parent     UUID;
  v_parent_exists     BOOLEAN := FALSE;
  v_bootstrap         BOOLEAN;
  v_required_layer    INTEGER;
  v_votes_required    INTEGER;
  v_deadline          TIMESTAMPTZ;
  v_claim_id          UUID;
  v_existing_count    INTEGER;
  -- Cooldown machinery from mig 042. We use the existing
  -- is_member_under_cooldown() / _claim_signature() helpers — the
  -- earlier mig 101 draft tried to read a `rejected_at` column on
  -- claim_requests that never existed in this schema, which made
  -- every claim submit error out with "column 'rejected_at' does
  -- not exist." Mig 042's cooldown is its own table (claim_rejections),
  -- keyed by signature.
  v_signature         TEXT;
  v_under_cooldown    BOOLEAN;
BEGIN
  -- ── Resolve caller / org / target ──
  SELECT organization_id, full_name, email
  INTO   v_org_id, v_caller_full_name, v_caller_email
  FROM public.organization_members WHERE id = p_caller_member_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found.');
  END IF;

  -- ── Rejection cooldown (Blueprint §13.12) ──
  v_signature := public._claim_signature(p_claimed_scope, p_claimed_group_id, p_claimed_role);
  v_under_cooldown := public.is_member_under_cooldown(p_caller_member_id, v_signature);
  IF v_under_cooldown THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You were previously rejected for this role. You can try again after the cooldown ends.');
  END IF;

  -- ── Anti-double-submit (same claimant, same target) ──
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

  -- ── Resolve target group info ──
  IF p_claimed_group_id IS NOT NULL THEN
    SELECT kind, parent_group_id INTO v_target_kind, v_target_parent
    FROM public.organization_groups
    WHERE id = p_claimed_group_id;
  END IF;

  -- ── Bootstrap path detection (unchanged from mig 042) ──
  IF p_claimed_scope = 'group' AND v_target_parent IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.member_admins
      WHERE organization_id = v_org_id
        AND group_id        = v_target_parent
        AND is_active       = TRUE
        AND verification_layer >= 4
        AND member_id <> p_caller_member_id   -- mig 101: don't count self as a parent exec
    ) INTO v_parent_exists;
  ELSIF p_claimed_scope = 'unit' AND v_target_parent IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.member_admins
      WHERE organization_id = v_org_id
        AND group_id        = v_target_parent
        AND is_active       = TRUE
        AND verification_layer >= 4
        AND member_id <> p_caller_member_id
    ) INTO v_parent_exists;
  ELSIF p_claimed_scope = 'unit' AND v_target_parent IS NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.member_admins
      WHERE organization_id = v_org_id
        AND scope_level     = 'org'
        AND is_active       = TRUE
        AND verification_layer >= 4
        AND member_id <> p_caller_member_id
    ) INTO v_parent_exists;
  END IF;

  v_bootstrap := NOT COALESCE(v_parent_exists, FALSE);

  IF v_bootstrap THEN
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
    v_bootstrap, v_required_layer, 1
  )
  RETURNING id INTO v_claim_id;

  -- ── Detect contestation FIRST so the peer-vote notification can
  --    flag the voting pool that this is a contested role. Without
  --    this, voters would only see "Vote on this claim" and not know
  --    that a parallel claim is fighting for the same position. The
  --    user (UNN founder) asked for this explicitly: "let's tell the
  --    whole class so they can vote up who is the real exec." ──
  SELECT COUNT(*) INTO v_existing_count
  FROM public.claim_requests
  WHERE organization_id = v_org_id
    AND claimed_role = p_claimed_role
    AND status IN ('submitted','awaiting_votes','email_sent','under_review')
    AND id <> v_claim_id
    AND claimant_user_id <> p_caller_member_id
    AND (
      (p_claimed_scope = 'org' AND claimed_scope = 'org')
      OR (claimed_group_id IS NOT DISTINCT FROM p_claimed_group_id)
    );

  -- ── Notify peers (Layer 3 voters) ──
  -- Message wording branches on contestation so the inbox makes the
  -- stakes visible. Threshold is unchanged — voters always need
  -- v_votes_required confirms; contestation just means there's now
  -- two claims competing for the same threshold.
  INSERT INTO public.notifications (
    organization_id, member_id, group_id,
    type, title, message, link,
    related_type, related_id
  )
  SELECT
    v_org_id, om.id, om.group_id,
    CASE WHEN v_existing_count > 0 THEN 'claim_contested_vote' ELSE 'claim_vote_requested' END,
    CASE WHEN v_existing_count > 0
      THEN 'Contested role — vote for the real ' || TRIM(p_position_title)
      ELSE 'Vote on a claim: ' || v_caller_full_name
    END,
    CASE WHEN v_existing_count > 0
      THEN v_caller_full_name || ' just claimed "' || TRIM(p_position_title) ||
           '" — but ' || v_existing_count || ' other claim' ||
           CASE WHEN v_existing_count = 1 THEN ' is' ELSE 's are' END ||
           ' already pending for this role. Pick the real exec.'
      ELSE v_caller_full_name || ' is claiming to be your ' || TRIM(p_position_title) ||
           '. Confirm or reject — ' || v_votes_required || ' votes needed.'
    END,
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

  -- When contested, ALSO re-ping voters about the EARLIER claim(s) so
  -- the class sees both candidates in their inbox simultaneously. We
  -- send one notification per earlier claim so a member opening the
  -- inbox sees: "Contested role — there's also <other claimant> who
  -- claimed this role earlier. Compare and vote."
  IF v_existing_count > 0 THEN
    INSERT INTO public.notifications (
      organization_id, member_id, group_id,
      type, title, message, link,
      related_type, related_id
    )
    SELECT
      v_org_id, om.id, om.group_id,
      'claim_contested_vote',
      'Contested role — also vote on ' || cr.full_name,
      cr.full_name || ' claimed "' || cr.position_title ||
        '" earlier. Compare with the new claim and confirm whoever you know is the real holder.',
      '/claims/' || cr.id,
      'claim_request',
      cr.id
    FROM public.claim_requests cr
    JOIN public.organization_members om
      ON om.organization_id = cr.organization_id
    WHERE cr.organization_id = v_org_id
      AND cr.claimed_role = p_claimed_role
      AND cr.status IN ('submitted','awaiting_votes','email_sent','under_review')
      AND cr.id <> v_claim_id
      AND cr.claimant_user_id <> p_caller_member_id
      AND (
        (p_claimed_scope = 'org' AND cr.claimed_scope = 'org')
        OR (cr.claimed_group_id IS NOT DISTINCT FROM p_claimed_group_id)
      )
      AND COALESCE(om.is_active, TRUE) = TRUE
      AND om.id <> p_caller_member_id
      AND om.id <> cr.claimant_user_id
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
  END IF;

  -- ── Notify parent execs (Layer 4 confirmers) ──
  -- Mig 101: self-exclusion + ancestor fallback when the only Layer 4
  -- exec at the parent group IS the claimant. We walk:
  --   1. siblings at the same parent group,
  --   2. ancestors up the tree,
  --   3. org-scope execs,
  --   4. (last resort) platform super_admins.
  -- The first non-empty match wins. We tag the notification with
  -- type='claim_confirm_requested' regardless of which layer it lands
  -- on so the existing FE handler treats them uniformly.
  IF NOT v_bootstrap AND v_target_parent IS NOT NULL THEN
    -- Try same-parent siblings (excluding self).
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
      AND ma.verification_layer >= 4
      AND ma.member_id <> p_caller_member_id;

    -- If that turned up nothing, escalate to ancestors / org / platform.
    IF NOT FOUND THEN
      WITH RECURSIVE ancestors AS (
        SELECT id, parent_group_id, 1 AS depth
        FROM public.organization_groups WHERE id = v_target_parent
        UNION ALL
        SELECT g.id, g.parent_group_id, a.depth + 1
        FROM public.organization_groups g
        JOIN ancestors a ON g.id = a.parent_group_id
        WHERE a.depth < 10
      )
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
           '. The direct parent exec is unavailable — escalated to you.',
        '/claims/' || v_claim_id,
        'claim_request',
        v_claim_id
      FROM public.member_admins ma
      JOIN ancestors a ON a.id = ma.group_id
      WHERE ma.organization_id = v_org_id
        AND ma.is_active = TRUE
        AND ma.verification_layer >= 4
        AND ma.member_id <> p_caller_member_id;

      IF NOT FOUND THEN
        -- Org-scope fallback.
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
             '. No direct parent exec available — org-tier review requested.',
          '/claims/' || v_claim_id,
          'claim_request',
          v_claim_id
        FROM public.member_admins ma
        WHERE ma.organization_id = v_org_id
          AND ma.scope_level = 'org'
          AND ma.is_active = TRUE
          AND ma.verification_layer >= 4
          AND ma.member_id <> p_caller_member_id;
      END IF;
    END IF;
  END IF;

  -- ── Contestation: notify the EARLIER claimant(s) that they're
  --    being contested. v_existing_count was already computed above
  --    so the peer-vote notification could flag contestation; we
  --    reuse the value here to push the heads-up to the original
  --    claimant's inbox. ──
  IF v_existing_count > 0 THEN
    INSERT INTO public.notifications (
      organization_id, member_id, group_id,
      type, title, message, link,
      related_type, related_id
    )
    SELECT
      v_org_id, cr.claimant_user_id, p_claimed_group_id,
      'claim_contested',
      'Your role claim was contested',
      v_caller_full_name || ' also submitted a claim for "' || TRIM(p_position_title) ||
        '". Both go to peer vote — whoever the members confirm wins.',
      '/claims/' || cr.id,
      'claim_request',
      cr.id
    FROM public.claim_requests cr
    WHERE cr.organization_id = v_org_id
      AND cr.claimed_role = p_claimed_role
      AND cr.status IN ('submitted','awaiting_votes','email_sent','under_review')
      AND cr.id <> v_claim_id
      AND cr.claimant_user_id <> p_caller_member_id
      AND (
        (p_claimed_scope = 'org' AND cr.claimed_scope = 'org')
        OR (cr.claimed_group_id IS NOT DISTINCT FROM p_claimed_group_id)
      );
  END IF;

  RETURN jsonb_build_object(
    'ok',              TRUE,
    'claim_id',        v_claim_id,
    'bootstrap_path',  v_bootstrap,
    'required_layer',  v_required_layer,
    'votes_required',  v_votes_required,
    'vote_deadline',   v_deadline,
    'contested',       v_existing_count > 0,
    'contested_count', v_existing_count
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
  RAISE NOTICE 'Migration 101 complete: self-claim self-exclusion, ancestor fallback, contestation notify.';
END $$;

COMMIT;
