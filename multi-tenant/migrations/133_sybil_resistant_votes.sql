-- ============================================================
-- Migration 133: Sybil-resistant claim votes — accounts conjured to
-- rubber-stamp a claim don't count toward its threshold.
--
-- The problem (user): "I know there's a vote but I don't think it'll
-- work." The attack: a bad actor claims a role, then spins up fake
-- members and self-confirms until the threshold is hit.
--
-- The gate (in cast_claim_vote_v2, which is where votes_received is set —
-- evaluate_claim only READS that column, so gating here is sufficient):
--   For an ESTABLISHED-org claim, only count confirm votes from members
--   who already existed when the claim was filed. An account created
--   AFTER the claim cannot have organically decided to confirm it, so it
--   doesn't count toward the threshold (the row is still recorded, just
--   not counted).
--
--   BOOTSTRAP claims are exempt: the first exec of a brand-new org is
--   anchored by a verified school email and the whole member base is
--   minutes old, so a join-time gate would starve a legitimate first
--   claim. The email verification is the anti-Sybil layer there.
--
-- This is ONE layer, not a silver bullet — it stops the easy "claim then
-- mint voters" attack but not a patient pre-seeded Sybil. It pairs with
-- the bank/Paystack KYC required to ever receive money and the first-
-- payout hold. Defense in depth.
-- ============================================================

BEGIN;

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

  -- ── Count ELIGIBLE confirm votes ──
  IF COALESCE(v_claim.bootstrap_path, FALSE) THEN
    -- Founding claim — email-anchored, brand-new member base. Count all.
    SELECT COUNT(*) INTO v_confirm_count
    FROM public.claim_votes
    WHERE claim_request_id = p_claim_id AND vote = 'confirm';
  ELSE
    -- Established org — only members who existed when the claim was filed
    -- count. Accounts minted after the claim can't pad it.
    SELECT COUNT(*) INTO v_confirm_count
    FROM public.claim_votes cv
    JOIN public.organization_members om ON om.id = cv.voter_member_id
    WHERE cv.claim_request_id = p_claim_id
      AND cv.vote = 'confirm'
      AND COALESCE(om.is_active, TRUE) = TRUE
      AND om.created_at <= v_claim.created_at;
  END IF;

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

DO $$
BEGIN
  RAISE NOTICE 'Migration 133 applied: established-org claim votes only count from members who predate the claim (bootstrap exempt).';
END $$;

COMMIT;
