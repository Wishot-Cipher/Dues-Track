-- ============================================================
-- Migration 018: Extended RLS helper functions
--
-- Goal:
-- Add the helper functions needed by the new tables' RLS policies
-- (in mig 019). Reuses naming conventions already established by
-- migrations 004 and 007:
--   - get_current_user_org_id()    (mig 004)
--   - is_admin_for_org(org_id)     (mig 004)
--   - has_permission(perm_name)    (mig 004)
--   - get_current_member_org_id()  (mig 007)
--   - is_current_user_admin()      (mig 007)
--
-- New helpers added here are tightly scoped to the new tables:
--   - is_platform_admin()
--   - is_verified_org_admin(org_id)
--   - is_org_member(org_id)
--   - org_has_financial_history(org_id)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) is_platform_admin()
--
-- TRUE when the caller has an active row in super_admins.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_platform_admin()
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.super_admins
    WHERE id::text = auth.uid()::text
      AND is_active = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_platform_admin() TO authenticated, anon;

-- ------------------------------------------------------------
-- 2) is_verified_org_admin(org_id)
--
-- TRUE when the caller is an active member_admins row for the org
-- AND verification_status is one of the trusted states.
--
-- Use this for sensitive operations (creating dues, viewing
-- financials, generating invite codes). Do NOT use the generic
-- is_admin_for_org for those — that one allows pending admins.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_verified_org_admin(p_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id::text = auth.uid()::text
      AND ma.organization_id = p_org_id
      AND ma.is_active = TRUE
      AND ma.verification_status IN (
        'email_verified',
        'member_confirmed',
        'document_verified',
        'admin_verified'
      )
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_verified_org_admin(UUID) TO authenticated, anon;

-- ------------------------------------------------------------
-- 3) is_org_member(org_id)
--
-- TRUE when the caller has an active organization_members row
-- for the org.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.id::text = auth.uid()::text
      AND om.organization_id = p_org_id
      AND COALESCE(om.is_active, TRUE) = TRUE
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.is_org_member(UUID) TO authenticated, anon;

-- ------------------------------------------------------------
-- 4) org_has_financial_history(org_id)
--
-- TRUE when the org has at least one successful payment.
-- The claim flow uses this to enforce the financial protection
-- rule: when there's money on the line, member-vote alone is NOT
-- sufficient — email or document verification is mandatory.
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.org_has_financial_history(p_org_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM public.payments p
    WHERE p.organization_id = p_org_id
      AND p.status IN ('approved','successful','paid')
    LIMIT 1
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.org_has_financial_history(UUID) TO authenticated, anon;

-- ------------------------------------------------------------
-- 5) can_vote_on_claim(claim_id)
--
-- TRUE when the caller is allowed to cast a vote on this claim:
--   - claim is in awaiting_votes status
--   - caller is an active member of the org being claimed
--   - caller is not the claimant themselves
--   - caller has not already voted
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_vote_on_claim(p_claim_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_claim RECORD;
  v_has_voted BOOLEAN;
  v_is_member BOOLEAN;
BEGIN
  SELECT * INTO v_claim
  FROM public.claim_requests
  WHERE id = p_claim_id;

  IF v_claim IS NULL OR v_claim.status != 'awaiting_votes' THEN
    RETURN FALSE;
  END IF;

  IF v_claim.claimant_user_id::text = auth.uid()::text THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.id::text = auth.uid()::text
      AND om.organization_id = v_claim.organization_id
      AND COALESCE(om.is_active, TRUE) = TRUE
  ) INTO v_is_member;

  IF NOT v_is_member THEN
    RETURN FALSE;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.claim_votes cv
    WHERE cv.claim_request_id = p_claim_id
      AND cv.voter_member_id::text = auth.uid()::text
  ) INTO v_has_voted;

  RETURN NOT v_has_voted;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER STABLE;

GRANT EXECUTE ON FUNCTION public.can_vote_on_claim(UUID) TO authenticated;

-- ------------------------------------------------------------
-- 6) recompute_org_trust_level(org_id)
--
-- Computes and updates trust_level based on current state.
-- Called by triggers and by the nightly trust-recomputation job.
-- Promotion rules (in order):
--   official -> stays official (never demoted automatically)
--   verified  if  has verified admin AND has email_domain
--   recognized if has verified admin OR member_count >= 50
--   else community
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.recompute_org_trust_level(p_org_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_current TEXT;
  v_has_verified_admin BOOLEAN;
  v_has_email_domain BOOLEAN;
  v_member_count INTEGER;
  v_new_level TEXT;
BEGIN
  SELECT trust_level, (email_domain IS NOT NULL AND email_domain != ''), member_count
  INTO v_current, v_has_email_domain, v_member_count
  FROM public.organizations
  WHERE id = p_org_id;

  IF v_current IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_current = 'official' THEN
    RETURN 'official';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.organization_id = p_org_id
      AND ma.is_active = TRUE
      AND ma.verification_status IN ('email_verified','document_verified','admin_verified')
  ) INTO v_has_verified_admin;

  IF v_has_verified_admin AND v_has_email_domain THEN
    v_new_level := 'verified';
  ELSIF v_has_verified_admin OR v_member_count >= 50 THEN
    v_new_level := 'recognized';
  ELSE
    v_new_level := 'community';
  END IF;

  IF v_new_level != v_current THEN
    UPDATE public.organizations
    SET trust_level = v_new_level,
        updated_at = NOW()
    WHERE id = p_org_id;
  END IF;

  RETURN v_new_level;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER VOLATILE;

GRANT EXECUTE ON FUNCTION public.recompute_org_trust_level(UUID) TO authenticated;

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'Migration 018 complete: extended RLS helpers created.';
  RAISE NOTICE '  - is_platform_admin()';
  RAISE NOTICE '  - is_verified_org_admin(org_id)';
  RAISE NOTICE '  - is_org_member(org_id)';
  RAISE NOTICE '  - org_has_financial_history(org_id)';
  RAISE NOTICE '  - can_vote_on_claim(claim_id)';
  RAISE NOTICE '  - recompute_org_trust_level(org_id)';
END $$;

COMMIT;
