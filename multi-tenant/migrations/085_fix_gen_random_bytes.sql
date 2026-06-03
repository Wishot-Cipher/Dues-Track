-- ============================================================
-- Migration 085: fix gen_random_bytes lookup
--
-- The bug:
--   create_member_join_invite called gen_random_bytes(8) unqualified.
--   On Supabase, pgcrypto lives in the `extensions` schema (not
--   `public`), and the function's SET search_path = public, pg_temp
--   means the bare reference can't find it. Result: every invite
--   creation falls into the EXCEPTION block with detail
--   "function gen_random_bytes(integer) does not exist".
--
--   Mig 080's bootstrap_class_with_rep already calls
--   extensions.crypt(...) / extensions.gen_salt('bf'), so the
--   convention here is "qualify extension functions with the
--   extensions schema." This migration just brings 082's RPC in
--   line with that convention.
--
-- Idempotent: pure CREATE OR REPLACE.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_member_join_invite(
  p_caller_member_id UUID,
  p_group_id         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
-- Add `extensions` to search_path so the unqualified call resolves,
-- in addition to using the explicit prefix below. Belt + braces.
SET search_path = public, extensions, pg_temp
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
    -- Schema-qualified — works regardless of search_path edge cases.
    v_code := upper(substring(
      translate(encode(extensions.gen_random_bytes(8), 'base64'),
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

COMMIT;
