-- ============================================================
-- Migration 051: Scope guard for cast_claim_vote_v2
--
-- Ensures only members in the target scope can vote on a claim.
-- This closes the gap where any org member could vote, which
-- violates Blueprint 13 (peer votes are scoped to the target).
--
-- Rules:
--   scope='org'  - any active org member can vote
--   scope='group' - member must be in the target group OR a child
--   scope='unit'  - member must be in the unit or its child/grandchild
-- ============================================================

BEGIN;

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
  v_claim            RECORD;
  v_confirm_count    INTEGER;
  v_new_layer        INTEGER;
  v_new_admin_id     UUID;
  v_target_gid       UUID;
  v_promoted         BOOLEAN := FALSE;
  v_voter_group_id   UUID;
  v_voter_parent     UUID;
  v_voter_grandparent UUID;
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
      'This claim is ' || v_claim.status || ' - voting is closed.');
  END IF;
  IF v_claim.claimant_user_id = p_voter_member_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You can''t vote on your own claim.');
  END IF;

  -- Voter must be an active member of the SAME org
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE id = p_voter_member_id
      AND organization_id = v_claim.organization_id
      AND COALESCE(is_active, TRUE) = TRUE
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You must be a member of this organization to vote.');
  END IF;

  -- Resolve voter group and ancestry for scope checks
  SELECT group_id INTO v_voter_group_id
  FROM public.organization_members
  WHERE id = p_voter_member_id;

  IF v_voter_group_id IS NOT NULL THEN
    SELECT parent_group_id INTO v_voter_parent
    FROM public.organization_groups
    WHERE id = v_voter_group_id;

    IF v_voter_parent IS NOT NULL THEN
      SELECT parent_group_id INTO v_voter_grandparent
      FROM public.organization_groups
      WHERE id = v_voter_parent;
    END IF;
  END IF;

  IF v_claim.claimed_scope = 'group' THEN
    IF v_claim.claimed_group_id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim scope is missing a target group.');
    END IF;
    IF v_voter_group_id IS DISTINCT FROM v_claim.claimed_group_id
       AND v_voter_parent IS DISTINCT FROM v_claim.claimed_group_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Only members of this group can vote on this claim.');
    END IF;
  ELSIF v_claim.claimed_scope = 'unit' THEN
    IF v_claim.claimed_unit_group_id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim scope is missing a target unit.');
    END IF;
    IF v_voter_group_id IS DISTINCT FROM v_claim.claimed_unit_group_id
       AND v_voter_parent IS DISTINCT FROM v_claim.claimed_unit_group_id
       AND v_voter_grandparent IS DISTINCT FROM v_claim.claimed_unit_group_id THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Only members of this unit can vote on this claim.');
    END IF;
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

    -- Bootstrap: this is the first verified exec - flip org active
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
      'You''re verified - bootstrap path',
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

DO $$
BEGIN
  RAISE NOTICE 'Migration 051 complete: cast_claim_vote_v2 now enforces scope-based voting.';
END $$;

COMMIT;
