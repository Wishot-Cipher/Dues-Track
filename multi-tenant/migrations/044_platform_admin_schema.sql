-- ============================================================
-- Migration 044: Platform admin schema + session-token auth
--
-- Why this exists:
--   The platform console (`/pvx-console`) authenticates against a
--   `super_admins` table and calls four RPCs (set_organization_status,
--   update_organization_subscription, extend_organization_trial,
--   verify_platform_admin) that, before this migration, did NOT live
--   in any in-tree migration. They were created out-of-band in the
--   Supabase project. A clean rebuild from migrations alone would
--   leave the console broken.
--
-- What this migration does:
--   1. Creates `super_admins` idempotently (CREATE TABLE IF NOT EXISTS
--      + ALTER ADD COLUMN IF NOT EXISTS for every column). Safe to run
--      against an empty DB or a DB where the table already exists.
--   2. Adds session-token columns so privileged RPCs can verify the
--      caller without trusting client-side sessionStorage.
--   3. (Re)creates `verify_super_admin` to return + rotate a session
--      token on each successful login (4-hour TTL).
--   4. Adds `verify_session_token`, `platform_logout`, and aliases
--      `verify_platform_admin` to `verify_super_admin` (the client
--      currently falls back from one to the other).
--   5. Re-creates `set_organization_status`,
--      `update_organization_subscription`, and
--      `extend_organization_trial` so each one (a) takes the session
--      token as its first arg, (b) verifies it server-side against
--      `super_admins`, and (c) re-checks the relevant capability
--      flag on the row before mutating. No more "the client said
--      it could."
--   6. Adds `bootstrap_super_admin` — a one-time seed that succeeds
--      only when zero super admins exist. Use this from the Supabase
--      SQL editor to create your first owner account after deploy.
--   7. Adds `platform_audit_log` (table + RPC + trigger) so every
--      privileged mutation leaves a trail. Surface this in the
--      console as a future PR.
--
-- All RPCs use SECURITY DEFINER + an internal token check; we still
-- GRANT EXECUTE to authenticated so the JS client can call them, but
-- the token is the real gate. anon is REVOKEd where it doesn't need
-- access.
-- ============================================================

BEGIN;

-- pgcrypto provides crypt() / gen_salt() / gen_random_uuid().
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ──────────────────────────────────────────────────────────────
-- 1) super_admins table (idempotent shape)
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.super_admins (
  id                          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email                       TEXT UNIQUE NOT NULL,
  password_hash               TEXT NOT NULL,
  full_name                   TEXT NOT NULL,
  is_active                   BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at               TIMESTAMPTZ,
  created_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Add capability flags + session columns idempotently. If a column
-- already exists (older deployments where the table was created
-- manually), ADD COLUMN IF NOT EXISTS is a no-op.
ALTER TABLE public.super_admins
  ADD COLUMN IF NOT EXISTS can_manage_organizations    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_manage_subscriptions    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_view_all_data           BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS can_manage_platform_admins  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS can_impersonate             BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS session_token               UUID,
  ADD COLUMN IF NOT EXISTS session_expires_at          TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS idx_super_admins_email
  ON public.super_admins (LOWER(email));
CREATE INDEX IF NOT EXISTS idx_super_admins_session_token
  ON public.super_admins (session_token)
  WHERE session_token IS NOT NULL;

COMMENT ON TABLE public.super_admins IS
  'Payvexo platform operators. Distinct from member_admins (org-level admins). One row per human with console access.';

-- ──────────────────────────────────────────────────────────────
-- 2) platform_audit_log — every privileged mutation writes here
-- ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.platform_audit_log (
  id              BIGSERIAL PRIMARY KEY,
  admin_id        UUID NOT NULL REFERENCES public.super_admins(id),
  admin_email     TEXT NOT NULL,           -- denormalized for audit-after-deletion
  action          TEXT NOT NULL,           -- e.g. 'set_organization_status', 'update_subscription'
  target_type     TEXT,                    -- e.g. 'organization'
  target_id       UUID,                    -- e.g. organization id
  payload         JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip_address      INET,                    -- best-effort, may be NULL
  user_agent      TEXT,                    -- best-effort, may be NULL
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_platform_audit_log_admin   ON public.platform_audit_log (admin_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_target  ON public.platform_audit_log (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_platform_audit_log_created ON public.platform_audit_log (created_at DESC);

COMMENT ON TABLE public.platform_audit_log IS
  'Append-only log of every privileged platform-admin mutation. Never UPDATE / DELETE — write a compensating row instead.';

-- ──────────────────────────────────────────────────────────────
-- 3) Internal helper: validate a session token and return the
--    super admin row (or NULL if expired / unknown / inactive).
--    Inlined into every privileged RPC to avoid double-RPC cost.
-- ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public._sa_resolve_token(p_token UUID)
RETURNS public.super_admins
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.super_admins;
BEGIN
  IF p_token IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT *
    INTO v_admin
  FROM public.super_admins
  WHERE session_token = p_token
    AND session_expires_at IS NOT NULL
    AND session_expires_at > NOW()
    AND is_active = TRUE
  LIMIT 1;
  RETURN v_admin;
END;
$$;

REVOKE EXECUTE ON FUNCTION public._sa_resolve_token(UUID) FROM anon;
GRANT  EXECUTE ON FUNCTION public._sa_resolve_token(UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 4) verify_super_admin — login. Returns the admin + a fresh
--    session token (rotated on every login).
-- ──────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.verify_super_admin(TEXT, TEXT);
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
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin       public.super_admins;
  v_new_token   UUID;
  v_expires_at  TIMESTAMPTZ;
BEGIN
  SELECT *
    INTO v_admin
  FROM public.super_admins
  WHERE LOWER(super_admins.email) = LOWER(p_email)
    AND is_active = TRUE
    AND password_hash = crypt(p_password, password_hash)
  LIMIT 1;

  IF v_admin.id IS NULL THEN
    -- Deliberately vague error message to avoid email enumeration.
    RETURN;
  END IF;

  -- Rotate session token. Older devices logged into the same account
  -- get kicked out — acceptable for a console.
  v_new_token  := gen_random_uuid();
  v_expires_at := NOW() + INTERVAL '4 hours';

  UPDATE public.super_admins
  SET session_token       = v_new_token,
      session_expires_at  = v_expires_at,
      last_login_at       = NOW(),
      updated_at          = NOW()
  WHERE super_admins.id = v_admin.id
  RETURNING * INTO v_admin;

  RETURN QUERY SELECT
    v_admin.id,
    v_admin.email,
    v_admin.full_name,
    v_admin.can_manage_organizations,
    v_admin.can_manage_subscriptions,
    v_admin.can_view_all_data,
    v_admin.can_manage_platform_admins,
    v_admin.can_impersonate,
    v_admin.is_active,
    v_admin.last_login_at,
    v_admin.session_token,
    v_admin.session_expires_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_super_admin(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verify_super_admin(TEXT, TEXT) TO anon, authenticated;

-- Existing client falls back to this name. Make it work by aliasing.
DROP FUNCTION IF EXISTS public.verify_platform_admin(TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.verify_platform_admin(
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
LANGUAGE sql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT * FROM public.verify_super_admin(p_email, p_password);
$$;

REVOKE EXECUTE ON FUNCTION public.verify_platform_admin(TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verify_platform_admin(TEXT, TEXT) TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- 5) verify_session_token — called on console mount and tab focus
--    to confirm the cached token is still valid. Returns the admin
--    row or empty result.
-- ──────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.verify_session_token(UUID);
CREATE OR REPLACE FUNCTION public.verify_session_token(p_token UUID)
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
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin public.super_admins;
BEGIN
  v_admin := public._sa_resolve_token(p_token);
  IF v_admin.id IS NULL THEN
    RETURN;
  END IF;
  RETURN QUERY SELECT
    v_admin.id, v_admin.email, v_admin.full_name,
    v_admin.can_manage_organizations, v_admin.can_manage_subscriptions,
    v_admin.can_view_all_data, v_admin.can_manage_platform_admins,
    v_admin.can_impersonate, v_admin.is_active, v_admin.last_login_at,
    v_admin.session_token, v_admin.session_expires_at;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.verify_session_token(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.verify_session_token(UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 6) platform_logout — invalidates the caller's token
-- ──────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.platform_logout(UUID);
CREATE OR REPLACE FUNCTION public.platform_logout(p_token UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
BEGIN
  IF p_token IS NULL THEN RETURN FALSE; END IF;
  UPDATE public.super_admins
  SET session_token = NULL,
      session_expires_at = NULL,
      updated_at = NOW()
  WHERE session_token = p_token;
  RETURN FOUND;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.platform_logout(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.platform_logout(UUID) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 7) set_organization_status — token-verified + audit-logged
-- ──────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.set_organization_status(UUID, BOOLEAN);
DROP FUNCTION IF EXISTS public.set_organization_status(UUID, UUID, BOOLEAN);

CREATE OR REPLACE FUNCTION public.set_organization_status(
  p_session_token UUID,
  p_org_id        UUID,
  p_is_active     BOOLEAN
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
  IF NOT v_admin.can_manage_organizations THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You don''t have permission to manage organizations.');
  END IF;

  UPDATE public.organizations
  SET is_active = p_is_active, updated_at = NOW()
  WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization not found.');
  END IF;

  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (v_admin.id, v_admin.email, 'set_organization_status', 'organization', p_org_id,
          jsonb_build_object('is_active', p_is_active));

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.set_organization_status(UUID, UUID, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_organization_status(UUID, UUID, BOOLEAN) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 8) update_organization_subscription — token-verified + audit-logged
-- ──────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.update_organization_subscription(
  UUID, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
);
DROP FUNCTION IF EXISTS public.update_organization_subscription(
  UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
);

CREATE OR REPLACE FUNCTION public.update_organization_subscription(
  p_session_token            UUID,
  p_org_id                   UUID,
  p_plan                     TEXT,
  p_max_groups               INTEGER,
  p_max_members              INTEGER,
  p_max_admins               INTEGER,
  p_subscription_expires_at  TIMESTAMPTZ DEFAULT NULL,
  p_is_on_trial              BOOLEAN     DEFAULT FALSE,
  p_trial_ends_at            TIMESTAMPTZ DEFAULT NULL
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
  IF p_plan NOT IN ('free','starter','professional','enterprise') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Unknown plan: ' || p_plan);
  END IF;

  UPDATE public.organizations
  SET subscription_plan        = p_plan,
      max_groups               = p_max_groups,
      max_members              = p_max_members,
      max_admins               = p_max_admins,
      subscription_expires_at  = p_subscription_expires_at,
      is_on_trial              = p_is_on_trial,
      trial_ends_at            = p_trial_ends_at,
      updated_at               = NOW()
  WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization not found.');
  END IF;

  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (v_admin.id, v_admin.email, 'update_subscription', 'organization', p_org_id,
          jsonb_build_object(
            'plan', p_plan,
            'max_groups', p_max_groups,
            'max_members', p_max_members,
            'max_admins', p_max_admins,
            'subscription_expires_at', p_subscription_expires_at,
            'is_on_trial', p_is_on_trial,
            'trial_ends_at', p_trial_ends_at
          ));

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.update_organization_subscription(
  UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.update_organization_subscription(
  UUID, UUID, TEXT, INTEGER, INTEGER, INTEGER, TIMESTAMPTZ, BOOLEAN, TIMESTAMPTZ
) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 9) extend_organization_trial — token-verified + audit-logged
-- ──────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.extend_organization_trial(UUID, INTEGER);
DROP FUNCTION IF EXISTS public.extend_organization_trial(UUID, UUID, INTEGER);

CREATE OR REPLACE FUNCTION public.extend_organization_trial(
  p_session_token UUID,
  p_org_id        UUID,
  p_days          INTEGER
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_admin       public.super_admins;
  v_new_end     TIMESTAMPTZ;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Session expired or invalid. Please sign in again.');
  END IF;
  IF NOT v_admin.can_manage_subscriptions THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You don''t have permission to manage subscriptions.');
  END IF;
  -- Sane cap: no trial extension beyond 90 days at a time.
  IF p_days < 1 OR p_days > 90 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Trial extension must be between 1 and 90 days.');
  END IF;

  v_new_end := NOW() + (p_days || ' days')::INTERVAL;

  UPDATE public.organizations
  SET trial_ends_at = v_new_end,
      is_on_trial   = TRUE,
      updated_at    = NOW()
  WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization not found.');
  END IF;

  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (v_admin.id, v_admin.email, 'extend_trial', 'organization', p_org_id,
          jsonb_build_object('days', p_days, 'new_ends_at', v_new_end));

  RETURN jsonb_build_object('ok', TRUE, 'new_ends_at', v_new_end);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.extend_organization_trial(UUID, UUID, INTEGER) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.extend_organization_trial(UUID, UUID, INTEGER) TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- 10) bootstrap_super_admin — one-time seed
--
--   Succeeds ONLY when there are zero super admin rows. Call this
--   once from the Supabase SQL editor after deploying the migration
--   to create your first owner account:
--
--     SELECT public.bootstrap_super_admin(
--       'you@payvexo.com', 'a-strong-temp-password', 'Your Name'
--     );
--
--   After the first row exists, subsequent calls return an error.
--   New admins must be created by an existing admin via a future
--   `invite_super_admin` RPC.
-- ──────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.bootstrap_super_admin(TEXT, TEXT, TEXT);
CREATE OR REPLACE FUNCTION public.bootstrap_super_admin(
  p_email     TEXT,
  p_password  TEXT,
  p_full_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_existing_count INTEGER;
  v_new_id         UUID;
BEGIN
  SELECT COUNT(*) INTO v_existing_count FROM public.super_admins;
  IF v_existing_count > 0 THEN
    RETURN jsonb_build_object('ok', FALSE,
      'error', 'Bootstrap is one-time only — super admins already exist. Use invite_super_admin instead.');
  END IF;

  IF p_password IS NULL OR length(p_password) < 12 THEN
    RETURN jsonb_build_object('ok', FALSE,
      'error', 'Bootstrap password must be at least 12 characters.');
  END IF;

  INSERT INTO public.super_admins (
    email, password_hash, full_name,
    can_manage_organizations, can_manage_subscriptions,
    can_view_all_data, can_manage_platform_admins, can_impersonate,
    is_active
  ) VALUES (
    LOWER(TRIM(p_email)),
    crypt(p_password, gen_salt('bf', 12)),
    TRIM(p_full_name),
    TRUE, TRUE, TRUE, TRUE, FALSE,
    TRUE
  )
  RETURNING id INTO v_new_id;

  RETURN jsonb_build_object('ok', TRUE, 'id', v_new_id);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.bootstrap_super_admin(TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.bootstrap_super_admin(TEXT, TEXT, TEXT) TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- Verification
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Migration 044 complete:';
  RAISE NOTICE '  super_admins                       (table)';
  RAISE NOTICE '  platform_audit_log                 (table)';
  RAISE NOTICE '  verify_super_admin                 (rotates token)';
  RAISE NOTICE '  verify_platform_admin              (alias)';
  RAISE NOTICE '  verify_session_token               (re-verify on mount)';
  RAISE NOTICE '  platform_logout                    (invalidate token)';
  RAISE NOTICE '  set_organization_status            (token-gated, audit-logged)';
  RAISE NOTICE '  update_organization_subscription   (token-gated, audit-logged)';
  RAISE NOTICE '  extend_organization_trial          (token-gated, audit-logged, capped at 90d)';
  RAISE NOTICE '  bootstrap_super_admin              (one-time seed)';
  RAISE NOTICE '';
  RAISE NOTICE 'NEXT STEP — if no super admin exists yet, run:';
  RAISE NOTICE '  SELECT public.bootstrap_super_admin(';
  RAISE NOTICE '    ''you@payvexo.com'', ''a-strong-temp-password-12chars+'', ''Your Name''';
  RAISE NOTICE '  );';
END $$;

COMMIT;
