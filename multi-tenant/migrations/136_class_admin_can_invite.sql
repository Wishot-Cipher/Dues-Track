-- ============================================================
-- Migration 136: a verified class admin can mint a join code too.
--
-- create_member_join_invite was FOUNDER-ONLY (returns 'not_founder' for
-- anyone else, and 'admin_exists' for the founder once an exec takes
-- over). So once a class had a verified exec, the dashboard's "Share
-- class link" card could no longer generate a code from there — the exec
-- was sent to /admin/members instead, which kept bouncing.
--
-- New rule: a join code can be minted by EITHER
--   • a verified (layer >= 4), active admin whose scope covers this class
--     (the class exec — they run membership), OR
--   • the class FOUNDER during bootstrap (before any exec exists).
--
-- Everything else (org/group checks, existing-code reuse, the 20-use /
-- 14-day cap, code generation) is unchanged from mig 087.
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
  v_is_admin        BOOLEAN;
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

  -- Is the caller a verified admin whose scope covers this class?
  -- (own class, an ancestor tier, or org-scope). These run membership,
  -- so they can mint join codes from the dashboard card directly.
  v_is_admin := EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id = p_caller_member_id
      AND ma.is_active = TRUE
      AND COALESCE(ma.verification_layer, 0) >= 4
      AND (
        ma.group_id IS NULL
        OR COALESCE(ma.scope_level, '') = 'org'
        OR ma.group_id IN (SELECT id FROM public._group_ancestor_ids(p_group_id))
      )
  );

  IF NOT v_is_admin THEN
    -- Bootstrap path: the founder, only before an exec has taken over.
    IF v_founder IS NULL OR v_founder <> p_caller_member_id THEN
      RETURN jsonb_build_object('ok', false, 'code', 'not_authorized');
    END IF;
    IF public._class_has_admin_other_than(p_group_id, v_founder) THEN
      RETURN jsonb_build_object('ok', false, 'code', 'admin_exists');
    END IF;
  END IF;

  -- If the caller already has a live, unused invite for this class,
  -- return that one instead of erroring. Picks the most-recent.
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

DO $$
BEGIN
  RAISE NOTICE 'Migration 136 applied: verified class admins (not just the founder) can mint a class join code.';
END $$;

COMMIT;
