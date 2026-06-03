-- ============================================================
-- Migration 083: amend founder bootstrap so founder-who-verified
--                doesn't lose their own share button
--
-- The bug in 082's gate:
--   _class_has_verified_admin(group_id) returns TRUE the moment ANY
--   verified exec exists for the org. The founder themselves counts —
--   so once a founder claims and verifies, they immediately fail the
--   "admin_exists" check on their own RPC and get_class_invite_status
--   returns can_share=false. The card disappears for the one person
--   we most want it to keep working for.
--
-- The right rule (matches the strategic plan):
--   • Founder can ALWAYS share, even after they verify their role —
--     they were already the gatekeeper; verifying just makes it
--     official.
--   • Bootstrap closes only when a NON-FOUNDER admin exists. That's
--     when the class has a "real" exec other than the founder, and
--     the gatekeeper hand-off happens.
--
-- This migration:
--   1. Adds a new helper _class_has_admin_other_than(group_id, member_id)
--   2. Updates create_member_join_invite to use it
--   3. Updates get_class_invite_status to expose has_other_admin
--      so the UI can distinguish "founder is still the gatekeeper"
--      from "exec has taken over"
-- ============================================================

BEGIN;

-- ── -1. Drop the legacy 4-arg overload ───────────────────────
-- The first draft of 082 declared create_member_join_invite with
-- four parameters (uuid, uuid, int, int). The current 082 + this
-- amendment use the two-parameter form. CREATE OR REPLACE only
-- replaces same-signature functions, so the old overload survived
-- and Postgres now can't disambiguate the call — every RPC fails
-- with "Could not choose the best candidate function". Drop the
-- legacy signature explicitly. IF EXISTS keeps it idempotent.
DROP FUNCTION IF EXISTS public.create_member_join_invite(UUID, UUID, INT, INT);

-- ── 0. Defensive schema fix ──────────────────────────────────
-- Drop NOT NULL on organization_invites.created_by if it's set.
-- Reason: founder bootstrap invites are created by a member without
-- an admin row, so `created_by` (which references member_admins) is
-- NULL on the new path. If the column was declared NOT NULL by an
-- earlier migration, every founder INSERT raises a constraint error
-- inside the LOOP and the RPC returns its generic 'unknown' code.
-- This guard is idempotent — if the column is already nullable,
-- it's a no-op.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name   = 'organization_invites'
      AND column_name  = 'created_by'
      AND is_nullable  = 'NO'
  ) THEN
    EXECUTE 'ALTER TABLE public.organization_invites ALTER COLUMN created_by DROP NOT NULL';
  END IF;
END$$;

-- ── 1. New helper: admin exists *other than* the named member ────
CREATE OR REPLACE FUNCTION public._class_has_admin_other_than(
  p_group_id   UUID,
  p_excluding  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id UUID;
  v_count  INT;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.organization_groups WHERE id = p_group_id;

  IF v_org_id IS NULL THEN RETURN FALSE; END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.member_admins ma
  JOIN public.organization_members om ON om.id = ma.member_id
  WHERE om.organization_id = v_org_id
    AND COALESCE(ma.verification_layer, 0) >= 2
    AND (p_excluding IS NULL OR ma.member_id <> p_excluding);

  RETURN v_count > 0;
END;
$$;

-- ── 2. Updated bootstrap RPC ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_member_join_invite(
  p_caller_member_id UUID,
  p_group_id         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_org    UUID;
  v_group_org     UUID;
  v_founder       UUID;
  v_code          TEXT;
  v_attempts      INT := 0;
  v_active_count  INT;
  v_invite_id     UUID;
  v_expires_at    TIMESTAMPTZ;
  k_max_uses      CONSTANT INT := 20;
  k_expires_days  CONSTANT INT := 14;
BEGIN
  SELECT organization_id INTO v_caller_org
  FROM public.organization_members
  WHERE id = p_caller_member_id
    AND group_id = p_group_id;

  IF v_caller_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_a_member');
  END IF;

  SELECT organization_id, founder_member_id INTO v_group_org, v_founder
  FROM public.organization_groups
  WHERE id = p_group_id;

  IF v_group_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'group_invalid');
  END IF;

  IF v_group_org <> v_caller_org THEN
    RETURN jsonb_build_object('ok', false, 'code', 'org_mismatch');
  END IF;

  IF v_founder IS NULL OR v_founder <> p_caller_member_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_founder');
  END IF;

  -- KEY CHANGE: bootstrap only closes when a NON-FOUNDER exec exists.
  -- The founder verifying doesn't lock them out of their own button.
  IF public._class_has_admin_other_than(p_group_id, v_founder) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'admin_exists');
  END IF;

  SELECT COUNT(*) INTO v_active_count
  FROM public.organization_invites
  WHERE created_by_member_id = p_caller_member_id
    AND group_id = p_group_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND times_used < max_uses;

  IF v_active_count >= 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'too_many_active');
  END IF;

  v_expires_at := now() + (k_expires_days || ' days')::INTERVAL;

  LOOP
    v_attempts := v_attempts + 1;
    v_code := upper(substring(
      translate(encode(gen_random_bytes(8), 'base64'),
                '+/=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
                  'XX23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789')
      from 1 for 8));

    BEGIN
      INSERT INTO public.organization_invites (
        organization_id, group_id, invite_type, invite_code,
        max_uses, times_used, expires_at, is_active,
        created_by, created_by_member_id
      ) VALUES (
        v_caller_org, p_group_id, 'member', v_code,
        k_max_uses, 0, v_expires_at, true,
        NULL, p_caller_member_id
      )
      RETURNING id INTO v_invite_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempts >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'invite_code', v_code,
    'group_id', p_group_id,
    'expires_at', v_expires_at,
    'max_uses', k_max_uses
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'code', 'unknown', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_member_join_invite(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_member_join_invite(UUID, UUID) TO authenticated, anon;

-- ── 3. Updated status helper ─────────────────────────────────
-- Now exposes whether the gatekeeper is "founder (still bootstrap)"
-- or "someone else (admin has taken over)". The UI uses this to
-- decide between the founder share card and the "ask your exec" hint.
CREATE OR REPLACE FUNCTION public.get_class_invite_status(
  p_caller_member_id UUID,
  p_group_id         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_founder         UUID;
  v_founder_name    TEXT;
  v_has_other_admin BOOLEAN;
  v_caller_is_member BOOLEAN;
  v_caller_is_founder BOOLEAN;
BEGIN
  SELECT founder_member_id INTO v_founder
  FROM public.organization_groups WHERE id = p_group_id;

  SELECT om.full_name INTO v_founder_name
  FROM public.organization_members om WHERE om.id = v_founder;

  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE id = p_caller_member_id AND group_id = p_group_id
  ) INTO v_caller_is_member;

  v_caller_is_founder := v_caller_is_member AND v_founder IS NOT NULL AND v_founder = p_caller_member_id;
  v_has_other_admin   := public._class_has_admin_other_than(p_group_id, v_founder);

  RETURN jsonb_build_object(
    'is_member',         v_caller_is_member,
    'is_founder',        v_caller_is_founder,
    -- Renamed for clarity: it's specifically "an admin other than the founder."
    'has_other_admin',   v_has_other_admin,
    -- Kept for backwards-compat with the UI shipped today:
    'has_admin',         v_has_other_admin,
    'founder_name',      v_founder_name,
    -- Convenience flag the UI branches on. Founder is always allowed
    -- to share unless a non-founder admin has taken over.
    'can_share',         v_caller_is_founder AND NOT v_has_other_admin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_invite_status(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_class_invite_status(UUID, UUID) TO authenticated, anon;

COMMIT;
