-- ============================================================
-- Migration 067: platform_audit_feed + platform_growth_funnel
--
-- Two session-gated read RPCs for the console:
--   platform_audit_feed(token, limit)  -> recent platform_audit_log entries
--   platform_growth_funnel(token)      -> org acquisition/activation funnel
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.platform_audit_feed(p_session_token UUID, p_limit INTEGER DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.super_admins;
  v_rows  jsonb;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_view_all_data THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT id, admin_email, action, target_type, target_id, payload, created_at
    FROM public.platform_audit_log
    ORDER BY created_at DESC
    LIMIT LEAST(GREATEST(COALESCE(p_limit, 50), 1), 200)
  ) t;

  RETURN jsonb_build_object('ok', TRUE, 'entries', v_rows);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_audit_feed(UUID, INTEGER) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_audit_feed(UUID, INTEGER) TO authenticated;

-- ── Growth funnel: orgs that reached each stage ──
CREATE OR REPLACE FUNCTION public.platform_growth_funnel(p_session_token UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.super_admins;
  v_total INTEGER;
  v_l2 INTEGER; v_l3 INTEGER; v_l4 INTEGER; v_due INTEGER; v_paid INTEGER;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_view_all_data THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  SELECT COUNT(*) INTO v_total FROM public.organizations;

  SELECT COUNT(DISTINCT organization_id) INTO v_l2
    FROM public.member_admins WHERE is_active = TRUE AND verification_layer >= 2;
  SELECT COUNT(DISTINCT organization_id) INTO v_l3
    FROM public.member_admins WHERE is_active = TRUE AND verification_layer >= 3;
  SELECT COUNT(DISTINCT organization_id) INTO v_l4
    FROM public.member_admins WHERE is_active = TRUE AND verification_layer >= 4;
  SELECT COUNT(DISTINCT organization_id) INTO v_due
    FROM public.payment_types;
  SELECT COUNT(DISTINCT organization_id) INTO v_paid
    FROM public.payments WHERE status IN ('approved','successful','paid');

  RETURN jsonb_build_object('ok', TRUE, 'funnel', jsonb_build_array(
    jsonb_build_object('stage', 'Orgs created',      'count', v_total),
    jsonb_build_object('stage', 'Verified exec (L2+)','count', v_l2),
    jsonb_build_object('stage', 'Peer-voted (L3+)',   'count', v_l3),
    jsonb_build_object('stage', 'Fully verified (L4)', 'count', v_l4),
    jsonb_build_object('stage', 'Created a due/event', 'count', v_due),
    jsonb_build_object('stage', 'Received a payment',  'count', v_paid)
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.platform_growth_funnel(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_growth_funnel(UUID) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 067 complete: platform_audit_feed + platform_growth_funnel ready.';
END $$;

COMMIT;
