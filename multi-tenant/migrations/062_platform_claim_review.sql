-- ============================================================
-- Migration 062: Platform claim-review queue + secure grant (Path D)
--
-- The platform-override grant is sensitive (it hands out Layer 4). Unlike the
-- other platform RPCs that are only client-gated, these validate the caller's
-- super-admin session token server-side via _sa_resolve_token (mig 044), so an
-- ordinary member can't call them even with a forged request.
--
--   platform_list_review_claims(session_token) -> claims awaiting platform review
--   platform_grant_claim(session_token, claim_id) -> grants Layer 4 + audit log
-- ============================================================

BEGIN;

-- Replace the service-role-only stub from mig 060 with a session-gated version.
DROP FUNCTION IF EXISTS public.platform_grant_claim(UUID);

-- ── List claims that have requested a platform review ──
CREATE OR REPLACE FUNCTION public.platform_list_review_claims(p_session_token UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.super_admins;
  v_rows  jsonb;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_manage_organizations THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      cr.id,
      cr.full_name        AS claimant_name,
      cr.position_title,
      cr.claimed_role,
      cr.claimed_scope,
      cr.votes_received,
      cr.votes_required,
      cr.has_financial_history,
      cr.layer3_reached_at,
      cr.platform_review_requested_at,
      cr.created_at,
      o.name              AS org_name,
      o.slug              AS org_slug,
      o.organization_type,
      g.name              AS target_group_name
    FROM public.claim_requests cr
    JOIN public.organizations o ON o.id = cr.organization_id
    LEFT JOIN public.organization_groups g
      ON g.id = COALESCE(cr.claimed_group_id, cr.claimed_unit_group_id)
    WHERE cr.platform_review_requested_at IS NOT NULL
      AND cr.status NOT IN ('approved','rejected')
    ORDER BY cr.platform_review_requested_at ASC
  ) t;

  RETURN jsonb_build_object('ok', TRUE, 'claims', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_review_claims(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_list_review_claims(UUID) TO authenticated;

-- ── Grant Layer 4 via platform override (session-validated) ──
CREATE OR REPLACE FUNCTION public.platform_grant_claim(
  p_session_token UUID,
  p_claim_id      UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_admin    public.super_admins;
  v_admin_id UUID;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_manage_organizations THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  v_admin_id := public._finalize_claim_layer4(p_claim_id, 'platform_override', NULL);
  IF v_admin_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found.');
  END IF;

  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (v_admin.id, v_admin.email, 'grant_claim_override', 'claim_request', p_claim_id,
          jsonb_build_object('grant_method', 'platform_override', 'resulting_admin_id', v_admin_id));

  RETURN jsonb_build_object('ok', TRUE, 'admin_id', v_admin_id, 'grant_method', 'platform_override');
END;
$$;

REVOKE ALL ON FUNCTION public.platform_grant_claim(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_grant_claim(UUID, UUID) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 062 complete: platform claim-review queue + session-gated grant.';
END $$;

COMMIT;
