-- ============================================================
-- Migration 103: Class-level inheritance on signup-via-invite.
--
-- Product rule (committed with user, 2026-06-04)
-- -----------------------------------------------
-- A class owns ONE level (e.g. "300L"). Every member who joins the
-- class inherits THAT level automatically — they no longer type one
-- on the signup form. The class rep / founder is the only person
-- who edits the level (typically once a year when the cohort moves
-- up). Dues filtering already keys off target_levels on the
-- payment_types row, so changing the class's level cascades through
-- existing dues without per-member edits.
--
-- Schema check
-- ------------
-- `organization_groups.levels TEXT[]` (mig 005 / 034) already holds
-- the class's levels. We treat `levels[1]` (Postgres array is
-- 1-indexed) as the canonical current level for class-tier groups.
-- The array shape is preserved so multi-level groups (e.g. a fellowship
-- spanning multiple year-groups) keep working — only class-kind groups
-- collapse to a single current level.
--
-- What this migration does
-- ------------------------
-- Patch signup_member_via_invite: when p_level is NULL/blank AND the
-- resolved target group has a non-empty `levels` array, the inserted
-- member's level defaults to `levels[1]`. When p_level IS provided
-- it still wins (covers org-wide invites where the joiner picks
-- their own group later and we couldn't auto-resolve).
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.signup_member_via_invite(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
);

CREATE OR REPLACE FUNCTION public.signup_member_via_invite(
  p_invite_code     TEXT,
  p_member_id       TEXT,
  p_full_name       TEXT,
  p_password        TEXT,
  p_email           TEXT,
  p_phone           TEXT,
  p_level           TEXT,
  p_target_group_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_invite        RECORD;
  v_org           RECORD;
  v_group_id      UUID;
  v_member_norm   TEXT := LOWER(TRIM(COALESCE(p_member_id, '')));
  v_email_norm    TEXT := NULLIF(LOWER(TRIM(COALESCE(p_email, ''))), '');
  v_full_name     TEXT := TRIM(COALESCE(p_full_name, ''));
  v_member_uuid   UUID;
  v_force_change  BOOLEAN;
  v_group_levels  TEXT[];
  v_effective_level TEXT;
BEGIN
  -- ── 1) Validate the invite ──
  SELECT * INTO v_invite
  FROM public.organization_invites
  WHERE invite_code = TRIM(p_invite_code)
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW());
  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_invite',
      'error', 'This invite link is invalid or has expired.');
  END IF;
  IF v_invite.max_uses IS NOT NULL AND v_invite.use_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invite_exhausted',
      'error', 'This invite has already been used the maximum number of times.');
  END IF;

  -- ── 2) Resolve org ──
  SELECT * INTO v_org FROM public.organizations WHERE id = v_invite.organization_id;
  IF v_org.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organisation not found.');
  END IF;

  -- ── 3) Resolve target group ──
  v_group_id := COALESCE(v_invite.group_id, p_target_group_id);
  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'no_group',
      'error', 'No target group resolved for this invite. Pick one before signing up.');
  END IF;

  -- ── 4) Basic input validation ──
  IF v_member_norm = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input', 'error', 'Member ID is required.');
  END IF;
  IF LENGTH(v_full_name) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input', 'error', 'Full name is required.');
  END IF;
  IF COALESCE(p_password, '') = '' OR LENGTH(p_password) < 4 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input', 'error', 'Password must be at least 4 characters.');
  END IF;

  -- ── 5) Pull the group's levels for inheritance default ──
  -- Class-kind groups own ONE level (levels[1]); other kinds can have
  -- a longer array (e.g. fellowships) — for those we fall back to
  -- levels[1] when present, NULL otherwise. p_level still wins when
  -- the caller explicitly passes a value.
  SELECT levels INTO v_group_levels
  FROM public.organization_groups WHERE id = v_group_id;

  v_effective_level := NULLIF(TRIM(COALESCE(p_level, '')), '');
  IF v_effective_level IS NULL
     AND v_group_levels IS NOT NULL
     AND array_length(v_group_levels, 1) >= 1
  THEN
    v_effective_level := v_group_levels[1];
  END IF;

  -- ── 6) Force-password-change when the member used their ID as the password ──
  v_force_change := (p_password = p_member_id);

  -- ── 7) Insert the member ──
  v_member_uuid := gen_random_uuid();
  BEGIN
    INSERT INTO public.organization_members (
      id, organization_id, group_id,
      member_id, password_hash,
      full_name, email, phone,
      level,
      is_active,
      force_password_change
    ) VALUES (
      v_member_uuid, v_org.id, v_group_id,
      v_member_norm, extensions.crypt(p_password, extensions.gen_salt('bf')),
      v_full_name, v_email_norm, NULLIF(TRIM(COALESCE(p_phone, '')), ''),
      v_effective_level,
      TRUE,
      v_force_change
    );
  EXCEPTION
    WHEN unique_violation THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'member_id_taken',
        'error', 'That member ID or email is already taken in this organization.');
  END;

  -- ── 8) Bump invite usage + group counter + org last_activity ──
  UPDATE public.organization_invites
  SET use_count = COALESCE(use_count, 0) + 1, updated_at = NOW()
  WHERE id = v_invite.id;

  UPDATE public.organization_groups
  SET current_member_count = COALESCE(current_member_count, 0) + 1, updated_at = NOW()
  WHERE id = v_group_id;

  UPDATE public.organizations
  SET member_count = COALESCE(member_count, 0) + 1, last_activity_at = NOW(), updated_at = NOW()
  WHERE id = v_org.id;

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'org_slug',          v_org.slug,
    'org_id',            v_org.id,
    'member_id',         v_member_uuid,
    'member_login_id',   v_member_norm,
    'group_id',          v_group_id,
    'inherited_level',   v_effective_level
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.signup_member_via_invite(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 103 complete: signup_member_via_invite now inherits level from class.';
END $$;

COMMIT;
