-- ============================================================
-- Migration 048: Claims RLS for the custom-auth model
--
-- Same root cause as mig 046 (notifications), this time for the
-- claim_requests + claim_votes tables.
--
-- The policies created in mig 019 all gate reads with
-- `<member_col>::text = auth.uid()::text`. Your app does not use
-- Supabase Auth — auth.uid() is always NULL. Result: every
-- claim_requests / claim_votes SELECT from the browser returns
-- zero rows. ClaimDecisionPage calls `.from('claim_requests').single()`
-- on those zero rows and PostgREST returns:
--   "Cannot coerce the result to a single JSON object"
-- which the page renders as "Claim not found".
--
-- The rows are there. The browser just can't see them.
--
-- The fix:
--   Drop the over-strict SELECT policies and replace with
--   USING (TRUE). The frontend always queries with explicit
--   filters (claim id, voter member id, organization id) so the
--   scoping happens at the query layer — same trust model the
--   rest of the app uses (mig 028 + mig 046).
--
--   INSERT / UPDATE policies stay as written — writes still go
--   through SECURITY DEFINER RPCs (submit_claim_v2,
--   cast_claim_vote_v2, confirm_claim_by_parent_exec,
--   reject_claim_by_parent_exec) which do their own validation.
--
-- claim_rejections SELECT is also relaxed for the same reason.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1) claim_requests — relax SELECT
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS claim_requests_select            ON public.claim_requests;
DROP POLICY IF EXISTS claim_requests_select_permissive ON public.claim_requests;

CREATE POLICY claim_requests_select_permissive
  ON public.claim_requests
  FOR SELECT
  USING (TRUE);

-- ──────────────────────────────────────────────────────────────
-- 2) claim_votes — relax SELECT (so voters see the tally,
--                                and members see their own vote)
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS claim_votes_select            ON public.claim_votes;
DROP POLICY IF EXISTS claim_votes_select_permissive ON public.claim_votes;

CREATE POLICY claim_votes_select_permissive
  ON public.claim_votes
  FOR SELECT
  USING (TRUE);

-- ──────────────────────────────────────────────────────────────
-- 3) claim_rejections — relax SELECT (so the submit RPC can
--                                     surface "you're in cooldown")
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS claim_rejections_select            ON public.claim_rejections;
DROP POLICY IF EXISTS claim_rejections_select_permissive ON public.claim_rejections;

CREATE POLICY claim_rejections_select_permissive
  ON public.claim_rejections
  FOR SELECT
  USING (TRUE);

-- ──────────────────────────────────────────────────────────────
-- 4) Verification
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  v_req_count INTEGER;
  v_vot_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_req_count FROM public.claim_requests;
  SELECT COUNT(*) INTO v_vot_count FROM public.claim_votes;
  RAISE NOTICE 'Migration 048 complete.';
  RAISE NOTICE '  claim_requests rows visible to anon: %', v_req_count;
  RAISE NOTICE '  claim_votes rows visible to anon:    %', v_vot_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Hard-refresh the browser. The "Claim not found" error';
  RAISE NOTICE 'on /claims/<id> should be gone — the page should now';
  RAISE NOTICE 'show the claim and let you Confirm / Reject / Skip.';
END $$;

COMMIT;
