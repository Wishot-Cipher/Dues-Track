-- ============================================================
-- Migration 143: per-GROUP billing RPCs
--
--   get_group_billing(group_id)
--     Read a tier's plan for the exec-facing subscription page: plan,
--     status, expiry, online-payments flag, group name/kind. Plan info
--     isn't sensitive, so any signed-in member may read it (the page
--     itself is admin-gated).
--
--   platform_set_group_plan(session_token, group_id, plan, expires_at)
--     The platform-console lever to upgrade/downgrade a CLASS (not the
--     org). Mirrors set_organization_status (mig 044): resolves the
--     super-admin session, requires can_manage_subscriptions, writes the
--     plan, audit-logs it. Pro/enterprise → that class can publish
--     Paystack dues (mig 141's group_online_payments_enabled).
-- ============================================================

BEGIN;

-- ── Read: a tier's billing snapshot ──────────────────────────
CREATE OR REPLACE FUNCTION public.get_group_billing(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_row public.organization_groups;
BEGIN
  SELECT * INTO v_row FROM public.organization_groups WHERE id = p_group_id;
  IF v_row.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Group not found.');
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'group_id', v_row.id,
    'name', v_row.name,
    'kind', v_row.kind,
    'plan', COALESCE(v_row.subscription_plan, 'free'),
    'status', COALESCE(v_row.subscription_status, 'active'),
    'expires_at', v_row.subscription_expires_at,
    'online_payments', public.group_online_payments_enabled(p_group_id)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_group_billing(UUID)
  TO anon, authenticated, service_role;

-- ── Write: platform admin sets a class's plan ────────────────
CREATE OR REPLACE FUNCTION public.platform_set_group_plan(
  p_session_token UUID,
  p_group_id      UUID,
  p_plan          TEXT,
  p_expires_at    TIMESTAMPTZ DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.super_admins;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Session expired or invalid. Please sign in again.');
  END IF;
  IF NOT v_admin.can_manage_subscriptions THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You don''t have permission to manage subscriptions.');
  END IF;
  IF p_plan NOT IN ('free', 'starter', 'pro', 'enterprise') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid plan.');
  END IF;

  UPDATE public.organization_groups
     SET subscription_plan       = p_plan,
         subscription_status     = 'active',
         subscription_expires_at = p_expires_at
   WHERE id = p_group_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Group not found.');
  END IF;

  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (v_admin.id, v_admin.email, 'set_group_plan', 'organization_group', p_group_id,
          jsonb_build_object('plan', p_plan, 'expires_at', p_expires_at));

  RETURN jsonb_build_object('ok', TRUE, 'group_id', p_group_id, 'plan', p_plan);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.platform_set_group_plan(UUID, UUID, TEXT, TIMESTAMPTZ) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.platform_set_group_plan(UUID, UUID, TEXT, TIMESTAMPTZ) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 143 applied: get_group_billing (exec read) + platform_set_group_plan (console upgrade/downgrade per class).';
END $$;

COMMIT;
