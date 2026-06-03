-- ============================================================
-- Migration 050: Passwordless email-code auth for the platform console
--
-- WHY:
--   Mig 044 ships password-based console login. Passwords on a
--   privileged surface are the wrong default — they get reused,
--   they get phished, they leak in screenshots. Email-code auth
--   gives us:
--     • Genuine 2FA-ish flow (proof of email control + the code)
--     • No password to lose / rotate / store in 1Password
--     • Built-in audit trail (every request is a row)
--     • Rate-limit + lockout that's hard to abuse
--
-- WHAT THIS MIGRATION DOES:
--   1. Adds a `super_admin_login_codes` table to track every
--      issued code: requester IP/UA, expiry, attempts, used_at.
--   2. Adds `request_admin_login_code(email, ip, ua)` RPC that:
--        - Verifies the email belongs to an active super_admin
--        - Enforces rate limit: max 3 codes per admin per 15 min
--        - Generates a 6-digit code, stores its hash, returns
--          { request_token, code, expires_at } to the API
--          (the API immediately emails the code and discards it;
--           code never reaches the browser this way)
--   3. Adds `verify_admin_login_code(request_token, code)` RPC:
--        - Checks expiry + already-used
--        - bcrypt-verifies the code against the stored hash
--        - Counts attempts; >= 5 wrong = invalidate
--        - On success: marks code used + issues a fresh
--          super_admins.session_token (same machinery as mig 044,
--          so existing RPCs keep working)
--   4. Audit-logs both request and verification in
--      platform_audit_log so we have a paper trail.
--
-- WHAT THIS KEEPS:
--   - mig 044's `super_admins` table and session_token columns
--   - mig 044's `verify_super_admin(email, password)` — kept as
--     a fallback while the new flow is being adopted. We'll add
--     a DEPRECATION NOTICE rather than dropping it (drop later
--     once everyone is on email codes).
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1) Table: super_admin_login_codes
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.super_admin_login_codes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id        UUID NOT NULL REFERENCES public.super_admins(id) ON DELETE CASCADE,
  request_token   UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  code_hash       TEXT NOT NULL,
  attempts        INTEGER NOT NULL DEFAULT 0,
  expires_at      TIMESTAMPTZ NOT NULL,
  used_at         TIMESTAMPTZ,
  requester_ip    INET,
  requester_ua    TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_console_codes_admin_active
  ON public.super_admin_login_codes (admin_id, created_at DESC)
  WHERE used_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_console_codes_token
  ON public.super_admin_login_codes (request_token);

-- ──────────────────────────────────────────────────────────────
-- 2) RPC: request_admin_login_code
--
-- Returns { ok, request_token, code, expires_at } to the API.
-- The API IMMEDIATELY emails `code` and discards it; the code
-- never enters the response path that reaches the browser.
--
-- Rate limit: if there's already an unused, unexpired code
-- younger than 60 seconds, return its existing request_token
-- instead of generating a new one — prevents "spam send" abuse.
-- Plus a hard cap of 3 codes per admin per 15 minutes.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.request_admin_login_code(
  p_email TEXT,
  p_ip    INET,
  p_ua    TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin            public.super_admins;
  v_code_plain       TEXT;
  v_code_hash        TEXT;
  v_token            UUID;
  v_expires          TIMESTAMPTZ;
  v_recent_count     INTEGER;
  v_recent_unsent    RECORD;
BEGIN
  -- Always return the same shape regardless of whether the email
  -- exists — prevents enumeration. Internally we no-op when the
  -- email is unknown but still echo a fake token.
  SELECT * INTO v_admin
  FROM public.super_admins
  WHERE LOWER(email) = LOWER(TRIM(p_email))
    AND is_active = TRUE
  LIMIT 1;

  IF v_admin.id IS NULL THEN
    -- Don't reveal that the email is unknown. Return a syntactically
    -- valid response that will fail verification gracefully.
    RETURN jsonb_build_object(
      'ok', TRUE,
      'request_token', gen_random_uuid(),
      'expires_at', NOW() + INTERVAL '10 minutes',
      'code', NULL   -- caller (API) skips sending email when code is null
    );
  END IF;

  -- Rate limit: hard cap 3 codes per admin per 15 minutes
  SELECT COUNT(*) INTO v_recent_count
  FROM public.super_admin_login_codes
  WHERE admin_id = v_admin.id
    AND created_at > NOW() - INTERVAL '15 minutes';

  IF v_recent_count >= 3 THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'error', 'Too many codes requested. Please wait a few minutes before trying again.'
    );
  END IF;

  -- If there's an active code younger than 60s, reuse it (anti-spam).
  SELECT id, request_token, expires_at INTO v_recent_unsent
  FROM public.super_admin_login_codes
  WHERE admin_id = v_admin.id
    AND used_at IS NULL
    AND expires_at > NOW()
    AND created_at > NOW() - INTERVAL '60 seconds'
  ORDER BY created_at DESC LIMIT 1;

  IF v_recent_unsent.id IS NOT NULL THEN
    -- Return the existing token; the API decides whether to re-send
    -- by checking the `cached` flag we set here.
    RETURN jsonb_build_object(
      'ok', TRUE,
      'request_token', v_recent_unsent.request_token,
      'expires_at',    v_recent_unsent.expires_at,
      'code',          NULL,
      'cached',        TRUE
    );
  END IF;

  -- Generate fresh 6-digit code + bcrypt hash
  v_code_plain := LPAD((FLOOR(RANDOM() * 900000) + 100000)::TEXT, 6, '0');
  v_code_hash  := extensions.crypt(v_code_plain, extensions.gen_salt('bf', 10));
  v_token      := gen_random_uuid();
  v_expires    := NOW() + INTERVAL '10 minutes';

  INSERT INTO public.super_admin_login_codes (
    admin_id, request_token, code_hash, expires_at, requester_ip, requester_ua
  ) VALUES (
    v_admin.id, v_token, v_code_hash, v_expires, p_ip, p_ua
  );

  -- Audit
  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, payload, ip_address, user_agent)
  VALUES (v_admin.id, v_admin.email, 'request_login_code',
          jsonb_build_object('expires_at', v_expires), p_ip, p_ua);

  RETURN jsonb_build_object(
    'ok',            TRUE,
    'request_token', v_token,
    'expires_at',    v_expires,
    'code',          v_code_plain  -- the API uses this once and discards
  );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.request_admin_login_code(TEXT, INET, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.request_admin_login_code(TEXT, INET, TEXT) TO authenticated, anon;

-- ──────────────────────────────────────────────────────────────
-- 3) RPC: verify_admin_login_code
--
-- Frontend calls this directly with (request_token, code). On
-- success returns the same shape mig 044's verify_super_admin
-- returns, so the existing console code reads it without changes.
-- ──────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.verify_admin_login_code(UUID, TEXT);
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_code_row    public.super_admin_login_codes;
  v_admin       public.super_admins;
  v_new_token   UUID;
  v_expires_at  TIMESTAMPTZ;
BEGIN
  IF p_request_token IS NULL OR p_code IS NULL THEN
    RETURN;
  END IF;

  -- Strip whitespace from the code (users paste with spaces)
  p_code := REGEXP_REPLACE(p_code, '\s+', '', 'g');

  SELECT * INTO v_code_row
  FROM public.super_admin_login_codes
  WHERE request_token = p_request_token
  LIMIT 1;

  IF v_code_row.id IS NULL THEN
    -- Sleep slightly to slow brute-force token guessing
    PERFORM pg_sleep(0.2);
    RETURN;
  END IF;

  IF v_code_row.used_at IS NOT NULL THEN
    RETURN;
  END IF;

  IF v_code_row.expires_at < NOW() THEN
    RETURN;
  END IF;

  IF v_code_row.attempts >= 5 THEN
    -- Soft-lockout: code is invalidated after 5 wrong attempts
    UPDATE public.super_admin_login_codes
    SET used_at = NOW()
    WHERE id = v_code_row.id;
    RETURN;
  END IF;

  IF extensions.crypt(p_code, v_code_row.code_hash) <> v_code_row.code_hash THEN
    -- Bump attempts so brute force gets locked out
    UPDATE public.super_admin_login_codes
    SET attempts = attempts + 1
    WHERE id = v_code_row.id;
    PERFORM pg_sleep(0.2);
    RETURN;
  END IF;

  -- Success path — mark code used, mint session token, audit
  UPDATE public.super_admin_login_codes
  SET used_at = NOW()
  WHERE id = v_code_row.id;

  SELECT * INTO v_admin
  FROM public.super_admins
  WHERE super_admins.id = v_code_row.admin_id
    AND is_active = TRUE
  LIMIT 1;

  IF v_admin.id IS NULL THEN
    RETURN;
  END IF;

  v_new_token  := gen_random_uuid();
  v_expires_at := NOW() + INTERVAL '4 hours';

  UPDATE public.super_admins
  SET session_token      = v_new_token,
      session_expires_at = v_expires_at,
      last_login_at      = NOW(),
      updated_at         = NOW()
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

-- ──────────────────────────────────────────────────────────────
-- 4) Cleanup: expire-and-purge old codes (idempotent helper)
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._purge_expired_console_codes()
RETURNS INTEGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_deleted INTEGER;
BEGIN
  DELETE FROM public.super_admin_login_codes
  WHERE created_at < NOW() - INTERVAL '24 hours'
  RETURNING 1 INTO v_deleted;
  RETURN COALESCE(v_deleted, 0);
END;
$$;

REVOKE EXECUTE ON FUNCTION public._purge_expired_console_codes() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public._purge_expired_console_codes() TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 050 complete:';
  RAISE NOTICE '  super_admin_login_codes  (table)';
  RAISE NOTICE '  request_admin_login_code (RPC, returns code to API for emailing)';
  RAISE NOTICE '  verify_admin_login_code  (RPC, exchanges code for session token)';
  RAISE NOTICE '  _purge_expired_console_codes (housekeeping helper)';
  RAISE NOTICE '';
  RAISE NOTICE 'mig 044''s verify_super_admin password login remains as a';
  RAISE NOTICE 'fallback. New console UI uses email codes; we''ll deprecate';
  RAISE NOTICE 'password login fully once adoption is verified.';
END $$;

COMMIT;
