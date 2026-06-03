-- ============================================================
-- Migration 037: add_subgroup_to_parent() RPC
--
-- Generic version of mig 027's `add_department_to_faculty` —
-- works for any parent → child relationship in the hierarchy:
--
--   parent kind 'faculty' or 'college' → child can be 'department'
--   parent kind 'department'           → child can be 'class' / 'level' / 'association'
--   parent kind 'class'                → child can be 'general' (rare)
--
-- The RPC auto-derives the default child kind from the parent's
-- kind, but the caller may override (e.g. a faculty admin creating
-- a 'fellowship' instead of a 'department').
--
-- Also creates the founder member + admin row, same pattern as
-- bring_school_online and add_department_to_faculty.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.add_subgroup_to_parent(
  -- Resolution
  p_org_slug             TEXT,
  p_parent_short_name    TEXT,

  -- The new subgroup
  p_subgroup_name        TEXT,
  p_subgroup_short_name  TEXT,
  p_subgroup_kind        TEXT,   -- 'department' | 'class' | 'level' | 'association' | 'general' (NULL = auto)

  -- Founder identity (the person creating)
  p_full_name            TEXT,
  p_email                TEXT,
  p_phone                TEXT,
  p_member_number        TEXT,
  p_password             TEXT,
  p_user_level           TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id          UUID;
  v_org_slug        TEXT;
  v_parent_id       UUID;
  v_parent_kind     TEXT;
  v_parent_short    TEXT;
  v_child_kind      TEXT;
  v_subgroup_id     UUID;
  v_subgroup_short  TEXT;
  v_member_id       UUID;
  v_email_norm      TEXT := LOWER(TRIM(p_email));
  v_member_norm     TEXT := LOWER(TRIM(p_member_number));
BEGIN
  -- ── Validate ──
  IF p_org_slug IS NULL OR LENGTH(TRIM(p_org_slug)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization is missing.');
  END IF;
  IF p_parent_short_name IS NULL OR LENGTH(TRIM(p_parent_short_name)) < 1 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Parent group is missing.');
  END IF;
  IF p_subgroup_name IS NULL OR LENGTH(TRIM(p_subgroup_name)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Subgroup name must be at least 2 characters.');
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

  -- ── Resolve org + parent ──
  SELECT id, slug INTO v_org_id, v_org_slug
  FROM public.organizations
  WHERE slug = LOWER(TRIM(p_org_slug)) AND is_active = TRUE;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization not found.');
  END IF;

  SELECT id, kind, short_name INTO v_parent_id, v_parent_kind, v_parent_short
  FROM public.organization_groups
  WHERE organization_id = v_org_id
    AND LOWER(short_name) = LOWER(TRIM(p_parent_short_name))
    AND is_active = TRUE;
  IF v_parent_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Parent group not found in this organization.');
  END IF;

  -- ── Derive valid child kind from parent kind ──
  v_child_kind := CASE
    WHEN p_subgroup_kind IS NOT NULL AND p_subgroup_kind <> '' THEN p_subgroup_kind
    WHEN v_parent_kind IN ('faculty','college') THEN 'department'
    WHEN v_parent_kind = 'department' THEN 'class'
    ELSE 'general'
  END;

  -- Sanity-check the parent → child pairing
  IF v_parent_kind IN ('class','level') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Classes are leaf nodes — they cannot have subgroups.');
  END IF;
  IF v_parent_kind = 'sug' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'SUG is a governance-only group and does not have subgroups.');
  END IF;

  -- ── Uniqueness checks ──
  v_subgroup_short := COALESCE(
    NULLIF(UPPER(TRIM(p_subgroup_short_name)),''),
    UPPER(LEFT(REGEXP_REPLACE(p_subgroup_name, '[^a-zA-Z]', '', 'g'), 5))
  );

  IF EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id
      AND LOWER(short_name) = LOWER(v_subgroup_short)
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'A group with that short name already exists in this organization.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org_id
      AND (LOWER(member_id) = v_member_norm OR LOWER(email) = v_email_norm)
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'A member with that ID or email already exists in this organization. Try signing in instead.');
  END IF;

  -- ── 1) Create the subgroup ──
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id,
    is_active, current_member_count
  ) VALUES (
    v_org_id,
    TRIM(p_subgroup_name),
    v_subgroup_short,
    v_child_kind,
    v_parent_id,
    TRUE, 1
  )
  RETURNING id INTO v_subgroup_id;

  -- ── 2) Founder member ──
  v_member_id := gen_random_uuid();
  INSERT INTO public.organization_members (
    id, organization_id, group_id,
    member_id, password_hash,
    full_name, email, phone,
    level,
    is_active, force_password_change
  ) VALUES (
    v_member_id, v_org_id, v_subgroup_id,
    v_member_norm, extensions.crypt(p_password, extensions.gen_salt('bf')),
    TRIM(p_full_name), v_email_norm, p_phone,
    p_user_level,
    TRUE, FALSE
  );

  -- ── 3) Founder = pending admin of the new subgroup ──
  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments,
    can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics,
    can_export_data, can_manage_settings,
    verification_status, verification_method,
    is_active,
    bio
  ) VALUES (
    v_member_id, v_org_id, v_subgroup_id,
    'org_owner', 'Founder', 'group',
    TRUE, TRUE, TRUE, TRUE,
    TRUE, TRUE, TRUE, TRUE,
    'pending', 'member_vote',
    TRUE,
    'Founding member of this ' || v_child_kind || '.'
  );

  -- ── 4) Bump counters ──
  UPDATE public.organization_groups
  SET current_member_count = COALESCE(current_member_count,0) + 1,
      updated_at = NOW()
  WHERE id = v_parent_id;

  UPDATE public.organizations
  SET member_count = COALESCE(member_count, 0) + 1,
      last_activity_at = NOW(),
      updated_at = NOW()
  WHERE id = v_org_id;

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'org_id',            v_org_id,
    'slug',              v_org_slug,
    'parent_id',         v_parent_id,
    'parent_short',      v_parent_short,
    'parent_kind',       v_parent_kind,
    'group_id',          v_subgroup_id,
    'group_short',       v_subgroup_short,
    'group_kind',        v_child_kind,
    'member_id',         v_member_id,
    'member_login_id',   v_member_norm
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'A group or member with that identifier already exists.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Could not create the subgroup: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_subgroup_to_parent(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 037 complete: add_subgroup_to_parent() RPC ready.';
  RAISE NOTICE 'Use this for adding departments to faculties AND classes to departments.';
END $$;

COMMIT;
