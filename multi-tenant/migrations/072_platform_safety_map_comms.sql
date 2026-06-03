-- ============================================================
-- Migration 072: Console — Trust & Safety, University Map, Communications RPCs
--   platform_set_member_suspended(token, member, suspend, reason)
--   platform_university_map(token)            -> per-org penetration stats
--   platform_broadcast(token, org|null, title, message) -> fan-out announcement
-- All session-gated (super-admin).
-- ============================================================

BEGIN;

-- ── Trust & Safety: suspend / reactivate a member ──
CREATE OR REPLACE FUNCTION public.platform_set_member_suspended(
  p_session_token UUID, p_member_id UUID, p_suspend BOOLEAN, p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_admin public.super_admins;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_manage_organizations THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  UPDATE public.organization_members
  SET is_suspended = p_suspend,
      suspension_reason = CASE WHEN p_suspend THEN p_reason ELSE NULL END,
      updated_at = NOW()
  WHERE id = p_member_id;

  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (v_admin.id, v_admin.email, CASE WHEN p_suspend THEN 'suspend_member' ELSE 'reactivate_member' END,
          'organization_member', p_member_id, jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('ok', TRUE);
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_member_suspended(UUID, UUID, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_set_member_suspended(UUID, UUID, BOOLEAN, TEXT) TO authenticated;

-- ── University map: one row per organization (= institution) ──
CREATE OR REPLACE FUNCTION public.platform_university_map(p_session_token UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_admin public.super_admins; v_rows jsonb;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_view_all_data THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.collected_kobo DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT o.id AS org_id, o.name AS org_name, o.slug AS org_slug,
           o.organization_type, COALESCE(o.org_state, 'active') AS org_state,
           (SELECT COUNT(*) FROM public.organization_members m WHERE m.organization_id = o.id) AS member_count,
           (SELECT COUNT(*) FROM public.organization_groups g WHERE g.organization_id = o.id) AS group_count,
           (SELECT COUNT(*) FROM public.member_admins a WHERE a.organization_id = o.id AND a.is_active = TRUE AND a.verification_layer >= 4) AS verified_execs,
           (SELECT COALESCE(SUM(p.dues_amount_kobo), 0) FROM public.payments p WHERE p.organization_id = o.id AND p.status IN ('approved','successful','paid')) AS collected_kobo
    FROM public.organizations o
  ) t;

  RETURN jsonb_build_object('ok', TRUE, 'rows', v_rows);
END; $$;
REVOKE ALL ON FUNCTION public.platform_university_map(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_university_map(UUID) TO authenticated;

-- ── Communications: broadcast an in-app announcement ──
CREATE OR REPLACE FUNCTION public.platform_broadcast(
  p_session_token UUID, p_org_id UUID, p_title TEXT, p_message TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_admin public.super_admins; v_count INTEGER := 0;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_manage_organizations THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;
  IF p_title IS NULL OR LENGTH(TRIM(p_title)) < 2 OR p_message IS NULL OR LENGTH(TRIM(p_message)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Title and message are required.');
  END IF;

  INSERT INTO public.notifications (organization_id, member_id, group_id, type, title, message, link)
  SELECT om.organization_id, om.id, om.group_id, 'announcement', TRIM(p_title), TRIM(p_message), '/dashboard'
  FROM public.organization_members om
  WHERE COALESCE(om.is_active, TRUE) = TRUE
    AND (p_org_id IS NULL OR om.organization_id = p_org_id);
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (v_admin.id, v_admin.email, 'broadcast', 'organization', p_org_id,
          jsonb_build_object('title', p_title, 'recipients', v_count));

  RETURN jsonb_build_object('ok', TRUE, 'notified', v_count);
END; $$;
REVOKE ALL ON FUNCTION public.platform_broadcast(UUID, UUID, TEXT, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_broadcast(UUID, UUID, TEXT, TEXT) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 072 complete: safety + university map + broadcast RPCs ready.';
END $$;

COMMIT;
