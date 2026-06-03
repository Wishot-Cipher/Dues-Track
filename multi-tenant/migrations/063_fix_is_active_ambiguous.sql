-- ============================================================
-- Migration 063: Fix "column reference is_active is ambiguous" on console login
--
-- verify_super_admin and verify_admin_login_code both RETURN TABLE(... is_active ...)
-- and then filter `WHERE ... AND is_active = TRUE` unqualified. Postgres can't tell
-- the OUT column from super_admins.is_active -> 42702 ambiguous. Qualify the column.
-- Bodies are otherwise identical to migrations 044 / 050.
-- ============================================================

BEGIN;

-- ── Password login ──
CREATE OR REPLACE FUNCTION public.verify_super_admin(
  p_email    TEXT,
  p_password TEXT
)
RETURNS TABLE (
  id                          UUID,
  email                       TEXT,
  full_name                   TEXT,
  can_manage_organizations    BOOLEAN,
  can_manage_subscriptions    BOOLEAN,
  can_view_all_data           BOOLEAN,
  can_manage_platform_admins  BOOLEAN,
  can_impersonate             BOOLEAN,
  is_active                   BOOLEAN,
  last_login_at               TIMESTAMPTZ,
  session_token               UUID,
  session_expires_at          TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_admin       public.super_admins;
  v_new_token   UUID;
  v_expires_at  TIMESTAMPTZ;
BEGIN
  SELECT * INTO v_admin
  FROM public.super_admins
  WHERE LOWER(super_admins.email) = LOWER(p_email)
    AND super_admins.is_active = TRUE
    AND super_admins.password_hash = crypt(p_password, super_admins.password_hash)
  LIMIT 1;

  IF v_admin.id IS NULL THEN RETURN; END IF;

  v_new_token  := gen_random_uuid();
  v_expires_at := NOW() + INTERVAL '4 hours';

  UPDATE public.super_admins
  SET session_token = v_new_token, session_expires_at = v_expires_at,
      last_login_at = NOW(), updated_at = NOW()
  WHERE super_admins.id = v_admin.id
  RETURNING * INTO v_admin;

  RETURN QUERY SELECT
    v_admin.id, v_admin.email, v_admin.full_name,
    v_admin.can_manage_organizations, v_admin.can_manage_subscriptions,
    v_admin.can_view_all_data, v_admin.can_manage_platform_admins,
    v_admin.can_impersonate, v_admin.is_active, v_admin.last_login_at,
    v_admin.session_token, v_admin.session_expires_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_super_admin(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verify_super_admin(TEXT, TEXT) TO anon, authenticated;

-- ── Email-code login (the console flow) ──
CREATE OR REPLACE FUNCTION public.verify_admin_login_code(
  p_request_token UUID,
  p_code          TEXT
)
RETURNS TABLE (
  id                          UUID,
  email                       TEXT,
  full_name                   TEXT,
  can_manage_organizations    BOOLEAN,
  can_manage_subscriptions    BOOLEAN,
  can_view_all_data           BOOLEAN,
  can_manage_platform_admins  BOOLEAN,
  can_impersonate             BOOLEAN,
  is_active                   BOOLEAN,
  last_login_at               TIMESTAMPTZ,
  session_token               UUID,
  session_expires_at          TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_code_row    public.super_admin_login_codes;
  v_admin       public.super_admins;
  v_new_token   UUID;
  v_expires_at  TIMESTAMPTZ;
BEGIN
  IF p_request_token IS NULL OR p_code IS NULL THEN RETURN; END IF;
  p_code := REGEXP_REPLACE(p_code, '\s+', '', 'g');

  SELECT * INTO v_code_row
  FROM public.super_admin_login_codes
  WHERE request_token = p_request_token
  LIMIT 1;

  IF v_code_row.id IS NULL THEN PERFORM pg_sleep(0.2); RETURN; END IF;
  IF v_code_row.used_at IS NOT NULL THEN RETURN; END IF;
  IF v_code_row.expires_at < NOW() THEN RETURN; END IF;

  IF v_code_row.attempts >= 5 THEN
    UPDATE public.super_admin_login_codes SET used_at = NOW() WHERE id = v_code_row.id;
    RETURN;
  END IF;

  IF extensions.crypt(p_code, v_code_row.code_hash) <> v_code_row.code_hash THEN
    UPDATE public.super_admin_login_codes SET attempts = attempts + 1 WHERE id = v_code_row.id;
    PERFORM pg_sleep(0.2);
    RETURN;
  END IF;

  UPDATE public.super_admin_login_codes SET used_at = NOW() WHERE id = v_code_row.id;

  SELECT * INTO v_admin
  FROM public.super_admins
  WHERE super_admins.id = v_code_row.admin_id
    AND super_admins.is_active = TRUE
  LIMIT 1;

  IF v_admin.id IS NULL THEN RETURN; END IF;

  v_new_token  := gen_random_uuid();
  v_expires_at := NOW() + INTERVAL '4 hours';

  UPDATE public.super_admins
  SET session_token = v_new_token, session_expires_at = v_expires_at,
      last_login_at = NOW(), updated_at = NOW()
  WHERE super_admins.id = v_admin.id
  RETURNING * INTO v_admin;

  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, payload)
  VALUES (v_admin.id, v_admin.email, 'login_email_code',
          jsonb_build_object('request_token', p_request_token));

  RETURN QUERY SELECT
    v_admin.id, v_admin.email, v_admin.full_name,
    v_admin.can_manage_organizations, v_admin.can_manage_subscriptions,
    v_admin.can_view_all_data, v_admin.can_manage_platform_admins,
    v_admin.can_impersonate, v_admin.is_active, v_admin.last_login_at,
    v_admin.session_token, v_admin.session_expires_at;
END;
$$;
REVOKE EXECUTE ON FUNCTION public.verify_admin_login_code(UUID, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verify_admin_login_code(UUID, TEXT) TO authenticated, anon;

DO $$
BEGIN
  RAISE NOTICE 'Migration 063 complete: is_active qualified in console login RPCs.';
END $$;

COMMIT;
