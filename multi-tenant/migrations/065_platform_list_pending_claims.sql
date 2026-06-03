-- ============================================================
-- Migration 065: platform_list_pending_claims — full verification queue
--
-- 062's platform_list_review_claims only returns claims that requested a
-- platform review. The console Verification Queue needs ALL in-flight claims,
-- with enough computed context to categorise each (bootstrap / disputed /
-- escalated / independent / normal) without per-row side effects.
--
-- Session-token-gated (super-admin) like the other platform RPCs.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.platform_list_pending_claims(p_session_token UUID)
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

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      cr.id,
      cr.full_name              AS claimant_name,
      cr.position_title,
      cr.claimed_role,
      cr.claimed_scope,
      cr.votes_received,
      cr.votes_required,
      cr.current_layer,
      cr.layer3_reached_at,
      cr.platform_review_requested_at,
      cr.has_financial_history,
      cr.institutional_email,
      cr.created_at,
      o.name                    AS org_name,
      o.slug                    AS org_slug,
      o.organization_type,
      g.name                    AS target_group_name,
      public.org_is_independent(o.organization_type) AS is_independent,
      (SELECT COUNT(*) FROM public.claim_votes cv
        WHERE cv.claim_request_id = cr.id AND cv.vote = 'reject') AS dispute_count,
      CASE
        WHEN public.org_is_independent(o.organization_type) THEN FALSE
        ELSE EXISTS (
          SELECT 1 FROM public.member_admins ma
          WHERE ma.organization_id = cr.organization_id
            AND ma.is_active = TRUE
            AND ma.verification_layer >= 4
            AND ma.member_id <> cr.claimant_user_id
            AND (
              ma.group_id = (
                SELECT parent_group_id FROM public.organization_groups
                WHERE id = COALESCE(cr.claimed_group_id, cr.claimed_unit_group_id)
              )
              OR (cr.claimed_scope = 'unit' AND ma.scope_level = 'org')
            )
        )
      END AS higher_exec_exists
    FROM public.claim_requests cr
    JOIN public.organizations o ON o.id = cr.organization_id
    LEFT JOIN public.organization_groups g
      ON g.id = COALESCE(cr.claimed_group_id, cr.claimed_unit_group_id)
    WHERE cr.status IN ('submitted','awaiting_votes','votes_complete','under_review','email_sent')
  ) t;

  RETURN jsonb_build_object('ok', TRUE, 'claims', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_list_pending_claims(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_list_pending_claims(UUID) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 065 complete: platform_list_pending_claims ready.';
END $$;

COMMIT;
