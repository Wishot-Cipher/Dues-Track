-- ============================================================
-- Migration 087: return existing active code instead of erroring
--
-- Why:
--   Today, when a founder taps "Share link" a second time, the RPC
--   sees they already have one active invite for that class and
--   returns `too_many_active`. The UI then shows "You already have
--   an active code — share that one, or wait for it to expire," and
--   the founder has no easy way TO actually see/share that code.
--
-- New rule:
--   If the caller is the class founder, bootstrap is still open
--   (no non-founder admin), AND they already have a live, unused
--   invite for this class, return THAT invite's details instead of
--   creating a new one. From the UI's perspective it looks like a
--   successful generation — same modal, same code, same template.
--
--   Hard cap unchanged: we never create a second active code. We
--   either return the existing one or create a fresh one.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_member_join_invite(
  p_caller_member_id UUID,
  p_group_id         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions, pg_temp
AS $$
DECLARE
  v_caller_org      UUID;
  v_group_org       UUID;
  v_founder         UUID;
  v_code            TEXT;
  v_attempts        INT := 0;
  v_invite_id       UUID;
  v_expires_at      TIMESTAMPTZ;
  v_existing_code   TEXT;
  v_existing_exp    TIMESTAMPTZ;
  v_existing_max    INT;
  k_max_uses        CONSTANT INT := 20;
  k_expires_days    CONSTANT INT := 14;
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

  -- If the founder already has a live, unused invite for this class,
  -- return that one instead of erroring. Picks the most-recent so a
  -- second tap surfaces their freshest code.
  SELECT invite_code, expires_at, max_uses
    INTO v_existing_code, v_existing_exp, v_existing_max
  FROM public.organization_invites
  WHERE created_by_member_id = p_caller_member_id
    AND group_id = p_group_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND times_used < max_uses
  ORDER BY created_at DESC
  LIMIT 1;

  IF v_existing_code IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'invite_code', v_existing_code,
      'group_id', p_group_id,
      'expires_at', v_existing_exp,
      'max_uses', v_existing_max,
      'reused', true
    );
  END IF;

  -- No active invite — mint a new one.
  v_expires_at := now() + (k_expires_days || ' days')::INTERVAL;

  LOOP
    v_attempts := v_attempts + 1;
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
    'max_uses', k_max_uses,
    'reused', false
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'code', 'unknown', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_member_join_invite(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_member_join_invite(UUID, UUID) TO authenticated, anon;

COMMIT;
