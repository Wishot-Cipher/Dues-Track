-- ============================================================
-- Migration 024: signup_member_for_group() RPC
--
-- Goal:
-- Atomic self-signup into an existing organization + group.
-- This is the path for a student who:
--   1. Found their school/class via search
--   2. Clicked the class
--   3. Picked "I'm new — join this class"
--   4. Filled the inline signup form
--
-- Distinct from bring_school_online() (mig 023): that one CREATES
-- the org. This one ATTACHES a new member to an existing org.
--
-- Respects per-org gating:
--   • organization_settings.allow_self_registration MUST be TRUE
--   • organization_settings.require_admin_approval is honored:
--       - if TRUE  → member created but is_active=FALSE, is_suspended=TRUE
--                    (admin must approve in OrgMembersPage)
--       - if FALSE → member is active immediately
--
-- Returns: jsonb { ok, error?, slug, org_id, group_id, member_id, member_login_id, requires_approval }
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.signup_member_for_group(
  p_org_slug          TEXT,
  p_group_short_name  TEXT,
  p_full_name         TEXT,
  p_email             TEXT,
  p_phone             TEXT,
  p_member_number     TEXT,
  p_password          TEXT,
  p_level             TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id          UUID;
  v_org_slug        TEXT;
  v_group_id        UUID;
  v_member_id       UUID;
  v_allow_signup    BOOLEAN;
  v_require_approval BOOLEAN;
  v_email_norm      TEXT := LOWER(TRIM(p_email));
  v_member_norm     TEXT := LOWER(TRIM(p_member_number));
BEGIN
  -- ── Validate inputs ──
  IF p_org_slug IS NULL OR LENGTH(TRIM(p_org_slug)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization is missing.');
  END IF;
  IF p_group_short_name IS NULL OR LENGTH(TRIM(p_group_short_name)) < 1 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Class/group is missing.');
  END IF;
  IF p_full_name IS NULL OR LENGTH(TRIM(p_full_name)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Your name is required.');
  END IF;
  IF v_email_norm IS NULL OR v_email_norm NOT LIKE '%@%.%' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'A valid email is required.');
  END IF;
  IF p_password IS NULL OR LENGTH(p_password) < 6 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Password must be at least 6 characters.');
  END IF;
  IF v_member_norm IS NULL OR LENGTH(v_member_norm) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Your member ID is required.');
  END IF;

  -- ── Resolve org by slug ──
  SELECT id, slug INTO v_org_id, v_org_slug
  FROM public.organizations
  WHERE slug = LOWER(TRIM(p_org_slug))
    AND is_active = TRUE
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization not found.');
  END IF;

  -- ── Check org settings: must allow self-registration ──
  SELECT
    COALESCE(allow_self_registration, FALSE),
    COALESCE(require_admin_approval, FALSE)
  INTO v_allow_signup, v_require_approval
  FROM public.organization_settings
  WHERE organization_id = v_org_id
  LIMIT 1;

  IF NOT COALESCE(v_allow_signup, FALSE) THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'error', 'This organization requires an invite code to join. Ask your admin for one.'
    );
  END IF;

  -- ── Resolve group by short_name within org ──
  SELECT id INTO v_group_id
  FROM public.organization_groups
  WHERE organization_id = v_org_id
    AND LOWER(short_name) = LOWER(TRIM(p_group_short_name))
    AND is_active = TRUE
  LIMIT 1;

  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Class/group not found in this organization.');
  END IF;

  -- ── Uniqueness pre-check (gives a friendly error vs the FK violation) ──
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org_id
      AND (LOWER(member_id) = v_member_norm OR LOWER(email) = v_email_norm)
  ) THEN
    RETURN jsonb_build_object(
      'ok', FALSE,
      'error', 'A member with that ID or email already exists in this organization. Try signing in instead.'
    );
  END IF;

  -- ── Create the member ──
  v_member_id := gen_random_uuid();

  INSERT INTO public.organization_members (
    id, organization_id, group_id,
    member_id, password_hash,
    full_name, email, phone,
    level,
    is_active,
    force_password_change
  ) VALUES (
    v_member_id, v_org_id, v_group_id,
    v_member_norm, extensions.crypt(p_password, extensions.gen_salt('bf')),
    TRIM(p_full_name), v_email_norm, p_phone,
    p_level,
    NOT v_require_approval,        -- if approval required, member stays inactive until approved
    FALSE
  );

  -- ── Bump the group's member count (denormalized counter) ──
  UPDATE public.organization_groups
  SET current_member_count = COALESCE(current_member_count, 0) + 1,
      updated_at = NOW()
  WHERE id = v_group_id;

  UPDATE public.organizations
  SET member_count = COALESCE(member_count, 0) + 1,
      last_activity_at = NOW(),
      updated_at = NOW()
  WHERE id = v_org_id;

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'slug',              v_org_slug,
    'org_id',            v_org_id,
    'group_id',          v_group_id,
    'member_id',         v_member_id,
    'member_login_id',   v_member_norm,
    'requires_approval', v_require_approval
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'A member with that ID or email already exists in this organization.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not complete signup: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.signup_member_for_group(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 024 complete: signup_member_for_group() RPC ready.';
END $$;

COMMIT;
