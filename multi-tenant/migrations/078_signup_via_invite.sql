-- ============================================================
-- Migration 078: signup_member_via_invite() RPC
--
-- Why: the join-via-invite flow used a direct client INSERT into
-- organization_members as the anon role. RLS blocked it silently and the user
-- saw a generic "Failed to join" toast. It also auto-dumped joiners into the
-- FIRST group when the invite carried no group_id — people ended up in random
-- classes. This RPC runs the whole sign-up server-side, returns clear error
-- codes, hashes the password inline, and REFUSES to finalise without a real
-- target group.
--
-- Inputs:
--   p_invite_code     — 8-char invite code (case-insensitive)
--   p_member_id       — login ID the new member will use (matric / staff / etc.)
--   p_full_name       — display name
--   p_password        — plaintext (hashed here, never stored or logged)
--   p_email           — optional
--   p_phone           — optional
--   p_level           — optional ("200L", "SS2", "Member"…)
--   p_target_group_id — required ONLY when the invite itself has no group_id
--                       (org-wide invite → joiner picks a group)
--
-- Returns: jsonb { ok, code?, member_id, group_id, org_id, org_slug, member_login_id, force_password_change }
--   error codes: invite_invalid | invite_expired | invite_exhausted | weak_password
--                | member_id_required | member_id_taken | email_taken
--                | group_required | group_not_in_org | member_limit | unknown
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.signup_member_via_invite(
  p_invite_code     TEXT,
  p_member_id       TEXT,
  p_full_name       TEXT,
  p_password        TEXT,
  p_email           TEXT DEFAULT NULL,
  p_phone           TEXT DEFAULT NULL,
  p_level           TEXT DEFAULT NULL,
  p_target_group_id UUID DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_invite        RECORD;
  v_org           RECORD;
  v_group_id      UUID;
  v_group_org_id  UUID;
  v_member_uuid   UUID;
  v_member_norm   TEXT := LOWER(TRIM(COALESCE(p_member_id, '')));
  v_email_norm    TEXT := NULLIF(LOWER(TRIM(COALESCE(p_email, ''))), '');
  v_full_name     TEXT := TRIM(COALESCE(p_full_name, ''));
  v_force_change  BOOLEAN := FALSE;
BEGIN
  -- ── 1) Validate basic inputs ──
  IF v_member_norm = '' OR LENGTH(v_member_norm) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'member_id_required', 'error', 'Please enter your member ID.');
  END IF;
  IF v_full_name = '' OR LENGTH(v_full_name) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'full_name_required', 'error', 'Your full name is required.');
  END IF;
  IF p_password IS NULL OR LENGTH(p_password) < 4 THEN
    -- 4 because "use member ID as first password" allows short IDs; force_password_change kicks in below
    RETURN jsonb_build_object('ok', FALSE, 'code', 'weak_password', 'error', 'Password is too short.');
  END IF;

  -- ── 2) Resolve invite (case-insensitive) ──
  SELECT id, organization_id, group_id, invite_type, max_uses,
         COALESCE(times_used, 0) AS times_used,
         expires_at, COALESCE(is_active, TRUE) AS is_active
    INTO v_invite
  FROM public.organization_invites
  WHERE UPPER(invite_code) = UPPER(TRIM(p_invite_code))
  LIMIT 1;

  IF v_invite.id IS NULL OR NOT v_invite.is_active THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invite_invalid',
      'error', 'This invite code is invalid or has been deactivated.');
  END IF;
  IF v_invite.expires_at IS NOT NULL AND v_invite.expires_at < NOW() THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invite_expired',
      'error', 'This invite link has expired. Ask your admin for a new one.');
  END IF;
  IF v_invite.max_uses IS NOT NULL AND v_invite.times_used >= v_invite.max_uses THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invite_exhausted',
      'error', 'This invite has reached its maximum number of uses.');
  END IF;

  -- ── 3) Resolve org ──
  SELECT id, slug, name, is_active INTO v_org
  FROM public.organizations
  WHERE id = v_invite.organization_id
  LIMIT 1;
  IF v_org.id IS NULL OR NOT v_org.is_active THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invite_invalid',
      'error', 'The organization for this invite is not active.');
  END IF;

  -- ── 4) Resolve the target group ──
  --   Rule: never auto-pick. Invite carries one OR the joiner explicitly picks.
  IF v_invite.group_id IS NOT NULL THEN
    v_group_id := v_invite.group_id;
  ELSIF p_target_group_id IS NOT NULL THEN
    v_group_id := p_target_group_id;
  ELSE
    RETURN jsonb_build_object('ok', FALSE, 'code', 'group_required',
      'error', 'This invite is org-wide. Choose which class/group you''re joining.');
  END IF;

  SELECT organization_id INTO v_group_org_id
  FROM public.organization_groups
  WHERE id = v_group_id AND COALESCE(is_active, TRUE) = TRUE;
  IF v_group_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'group_not_in_org',
      'error', 'The selected group could not be found.');
  END IF;
  IF v_group_org_id <> v_org.id THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'group_not_in_org',
      'error', 'That group belongs to a different organization.');
  END IF;

  -- ── 5) Uniqueness inside this org (friendly error vs raw 23505) ──
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org.id AND LOWER(member_id) = v_member_norm
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'member_id_taken',
      'error', 'That member ID is already registered in this organization. Try signing in instead.');
  END IF;

  IF v_email_norm IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org.id AND LOWER(email) = v_email_norm
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'email_taken',
      'error', 'A member with that email already exists in this organization.');
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
      NULLIF(TRIM(COALESCE(p_level, '')), ''),
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
  SET times_used = COALESCE(times_used, 0) + 1, updated_at = NOW()
  WHERE id = v_invite.id;

  UPDATE public.organization_groups
  SET current_member_count = COALESCE(current_member_count, 0) + 1, updated_at = NOW()
  WHERE id = v_group_id;

  UPDATE public.organizations
  SET member_count = COALESCE(member_count, 0) + 1, last_activity_at = NOW(), updated_at = NOW()
  WHERE id = v_org.id;

  RETURN jsonb_build_object(
    'ok',                    TRUE,
    'member_id',             v_member_uuid,
    'member_login_id',       v_member_norm,
    'group_id',              v_group_id,
    'org_id',                v_org.id,
    'org_slug',              v_org.slug,
    'force_password_change', v_force_change
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'unknown',
      'error', 'Could not complete signup: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.signup_member_via_invite(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 078 complete: signup_member_via_invite() RPC ready.';
END $$;

COMMIT;
