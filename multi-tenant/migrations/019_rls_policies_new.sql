-- ============================================================
-- Migration 019: RLS Policies for New Tables
--
-- Goal:
-- Add Row Level Security to the tables introduced in mig 015–017
-- (claim_requests, claim_votes, executive_invite_codes,
-- organization_requests). Also update RLS on organizations to
-- allow self-service creation at trust_level='community'.
--
-- Note: platform_earnings RLS is set up in mig 016.
--       seed_institutions RLS is set up in mig 011.
--
-- Depends on: 018_rls_helpers_extended.sql
-- ============================================================

BEGIN;

-- ============================================================
-- 1) claim_requests
-- ============================================================
ALTER TABLE public.claim_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: claimant, current org execs, members of the org, platform admins
DROP POLICY IF EXISTS claim_requests_select ON public.claim_requests;
CREATE POLICY claim_requests_select
  ON public.claim_requests
  FOR SELECT
  USING (
    claimant_user_id::text = auth.uid()::text
    OR public.is_platform_admin()
    OR public.is_org_member(organization_id)
    OR public.is_admin_for_org(organization_id)
  );

-- INSERT: any authenticated user can submit a claim for an org
DROP POLICY IF EXISTS claim_requests_insert ON public.claim_requests;
CREATE POLICY claim_requests_insert
  ON public.claim_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND claimant_user_id::text = auth.uid()::text
  );

-- UPDATE: only claimant (to add docs) OR platform admin (review/reject)
DROP POLICY IF EXISTS claim_requests_update ON public.claim_requests;
CREATE POLICY claim_requests_update
  ON public.claim_requests
  FOR UPDATE
  USING (
    claimant_user_id::text = auth.uid()::text
    OR public.is_platform_admin()
  )
  WITH CHECK (
    claimant_user_id::text = auth.uid()::text
    OR public.is_platform_admin()
  );

-- DELETE: forbidden from client. service_role only.
DROP POLICY IF EXISTS claim_requests_service ON public.claim_requests;
CREATE POLICY claim_requests_service
  ON public.claim_requests
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- 2) claim_votes
-- ============================================================
ALTER TABLE public.claim_votes ENABLE ROW LEVEL SECURITY;

-- SELECT: anyone in the org can see the tally (no individual vote disclosure beyond own)
DROP POLICY IF EXISTS claim_votes_select ON public.claim_votes;
CREATE POLICY claim_votes_select
  ON public.claim_votes
  FOR SELECT
  USING (
    voter_member_id::text = auth.uid()::text
    OR public.is_platform_admin()
    OR public.is_admin_for_org(organization_id)
  );

-- INSERT: must be eligible voter (function checks all conditions)
DROP POLICY IF EXISTS claim_votes_insert ON public.claim_votes;
CREATE POLICY claim_votes_insert
  ON public.claim_votes
  FOR INSERT
  WITH CHECK (
    voter_member_id::text = auth.uid()::text
    AND public.can_vote_on_claim(claim_request_id)
  );

-- UPDATE / DELETE: not allowed (a vote is permanent once cast)
DROP POLICY IF EXISTS claim_votes_service ON public.claim_votes;
CREATE POLICY claim_votes_service
  ON public.claim_votes
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- 3) executive_invite_codes
-- ============================================================
ALTER TABLE public.executive_invite_codes ENABLE ROW LEVEL SECURITY;

-- SELECT: generator + verified org admins + platform admins
DROP POLICY IF EXISTS executive_invite_codes_select ON public.executive_invite_codes;
CREATE POLICY executive_invite_codes_select
  ON public.executive_invite_codes
  FOR SELECT
  USING (
    public.is_verified_org_admin(organization_id)
    OR public.is_platform_admin()
  );

-- INSERT: must be a verified admin in that org with can_manage_admins
DROP POLICY IF EXISTS executive_invite_codes_insert ON public.executive_invite_codes;
CREATE POLICY executive_invite_codes_insert
  ON public.executive_invite_codes
  FOR INSERT
  WITH CHECK (
    public.is_verified_org_admin(organization_id)
    AND public.has_permission('can_manage_admins')
  );

-- UPDATE: only to mark used (handled via RPC/edge fn) or to deactivate
DROP POLICY IF EXISTS executive_invite_codes_update ON public.executive_invite_codes;
CREATE POLICY executive_invite_codes_update
  ON public.executive_invite_codes
  FOR UPDATE
  USING (
    public.is_verified_org_admin(organization_id)
    OR public.is_platform_admin()
  );

DROP POLICY IF EXISTS executive_invite_codes_service ON public.executive_invite_codes;
CREATE POLICY executive_invite_codes_service
  ON public.executive_invite_codes
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- 4) organization_requests
-- ============================================================
ALTER TABLE public.organization_requests ENABLE ROW LEVEL SECURITY;

-- SELECT: requester + platform admins
DROP POLICY IF EXISTS organization_requests_select ON public.organization_requests;
CREATE POLICY organization_requests_select
  ON public.organization_requests
  FOR SELECT
  USING (
    requested_by_user_id::text = auth.uid()::text
    OR public.is_platform_admin()
  );

-- INSERT: any authenticated user
DROP POLICY IF EXISTS organization_requests_insert ON public.organization_requests;
CREATE POLICY organization_requests_insert
  ON public.organization_requests
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND requested_by_user_id::text = auth.uid()::text
  );

-- UPDATE: only platform admin (reviewer)
DROP POLICY IF EXISTS organization_requests_update ON public.organization_requests;
CREATE POLICY organization_requests_update
  ON public.organization_requests
  FOR UPDATE
  USING (public.is_platform_admin())
  WITH CHECK (public.is_platform_admin());

DROP POLICY IF EXISTS organization_requests_service ON public.organization_requests;
CREATE POLICY organization_requests_service
  ON public.organization_requests
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ============================================================
-- 5) Relax organizations INSERT policy (self-service creation)
--
-- The existing policy from mig 007 already allows any authenticated
-- user to INSERT. We re-create it explicitly here to make the
-- contract obvious and enforce that the new row is created at a
-- non-privileged trust level.
-- ============================================================
DROP POLICY IF EXISTS org_create_policy ON public.organizations;
CREATE POLICY org_create_policy
  ON public.organizations
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND trust_level IN ('community', 'seed')        -- never let a client create at recognized+
    AND claim_status IN ('unclaimed', 'pending')
  );

-- Allow platform admins to create at any trust level
DROP POLICY IF EXISTS org_platform_admin_create ON public.organizations;
CREATE POLICY org_platform_admin_create
  ON public.organizations
  FOR INSERT
  WITH CHECK (public.is_platform_admin());

-- ============================================================
-- 6) payments — ensure webhook-only writes for paid status
--
-- Existing payments_insert policy from mig 004 lets a member
-- create their own payment row. That's fine for the initial
-- "pending" insert (frontend initiates Paystack and saves the
-- pending transaction). The CRITICAL rule is: only service_role
-- (the webhook Edge Function) may flip the row to 'successful'
-- or set webhook_verified=TRUE.
--
-- We layer an additional restrictive UPDATE policy here.
-- ============================================================
DROP POLICY IF EXISTS payments_no_paid_update_from_client ON public.payments;
CREATE POLICY payments_no_paid_update_from_client
  ON public.payments
  AS RESTRICTIVE
  FOR UPDATE
  USING (TRUE)
  WITH CHECK (
    -- Clients (anon, authenticated) may NEVER set webhook_verified
    -- or change status to a paid state.
    auth.role() = 'service_role'
    OR (
      webhook_verified = FALSE
      AND (status IS NULL OR status NOT IN ('successful','paid','approved'))
      AND paystack_status IS NULL
    )
  );

-- ============================================================
-- 7) Verification
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 019 complete: RLS policies for new tables.';
  RAISE NOTICE '  - claim_requests (4 policies)';
  RAISE NOTICE '  - claim_votes (3 policies)';
  RAISE NOTICE '  - executive_invite_codes (4 policies)';
  RAISE NOTICE '  - organization_requests (4 policies)';
  RAISE NOTICE '  - organizations: self-service create at community/seed';
  RAISE NOTICE '  - payments: restrictive policy blocks client from marking paid';
END $$;

COMMIT;
