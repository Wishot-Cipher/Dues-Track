-- ============================================================
-- Migration 098: Every dept founder must land in a CLASS, not the
-- department group itself.
--
-- Bug — what we shipped
-- ---------------------
-- bootstrap_department_with_class accepts p_is_staff = TRUE and,
-- when true, SKIPS class creation entirely. The founder member row
-- then writes:
--     group_id = COALESCE(v_class_id, v_dept_id)
-- → group_id = v_dept_id when staff. The "student in the department
-- group" the user spotted in production.
--
-- Why that breaks the tier model
-- ------------------------------
-- The strategic rule (per the user's design + every place we read
-- group_id in the app) is: every member belongs to a CLASS-tier
-- group. Exec roles ADD on top of class membership via
-- member_admins. Parking a row directly on a unit-tier group:
--   • duplicates the dept group's purpose (organisation_groups
--     rows of kind='department' are containers, not rosters);
--   • makes the dept's member_count drift away from "actual people
--     who belong here" (because it now mixes dept-only rows with
--     class rollups);
--   • lets a faculty/dept exec accidentally collect class-tier
--     dues that other admin rows would normally cascade up to.
--
-- Fix
-- ---
-- bootstrap_department_with_class now ALWAYS creates a class. In
-- staff mode it auto-creates one called "Office" (or the caller's
-- name if provided) — same shape as a student class, just labelled
-- for staff. The founder row writes group_id = that class id every
-- single time. p_is_staff stays in the signature for back-compat
-- with the existing UI, but its only effect is the default class
-- name + the absence of a level on the class.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.bootstrap_department_with_class(
  p_org_slug             TEXT,
  p_parent_faculty_short TEXT,
  p_dept_name            TEXT,
  p_dept_short           TEXT,
  p_class_name           TEXT,
  p_class_short          TEXT,
  p_class_level          TEXT,
  p_founder_full_name    TEXT,
  p_founder_email        TEXT,
  p_founder_member_id    TEXT,
  p_founder_password     TEXT,
  p_position_title       TEXT,
  p_is_staff             BOOLEAN DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org_id      UUID;
  v_org_slug    TEXT;
  v_faculty_id  UUID;
  v_dept_id     UUID;
  v_class_id    UUID;
  v_class_name  TEXT;
  v_class_short TEXT;
  v_member_id   UUID;
  v_member_norm TEXT := LOWER(TRIM(COALESCE(p_founder_member_id, '')));
  v_email_norm  TEXT := NULLIF(LOWER(TRIM(COALESCE(p_founder_email, ''))), '');
  v_dept_short  TEXT := UPPER(TRIM(COALESCE(p_dept_short, '')));
  v_level       TEXT := NULLIF(TRIM(COALESCE(p_class_level, '')), '');
  v_claim       JSONB;
  v_claim_id    UUID;
BEGIN
  -- ── Basic validation ──
  IF TRIM(COALESCE(p_founder_full_name, '')) = '' OR LENGTH(TRIM(p_founder_full_name)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input', 'error', 'Full name is required.');
  END IF;
  IF COALESCE(p_founder_password, '') = '' OR LENGTH(p_founder_password) < 6 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input', 'error', 'Password must be at least 6 characters.');
  END IF;
  IF v_member_norm = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input', 'error', 'Member ID is required.');
  END IF;
  IF TRIM(COALESCE(p_dept_name, '')) = '' OR v_dept_short = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input', 'error', 'Department name and short code are required.');
  END IF;

  -- ── Resolve org + parent faculty by short code ──
  SELECT o.id, o.slug INTO v_org_id, v_org_slug
  FROM public.organizations o
  WHERE LOWER(o.slug) = LOWER(p_org_slug);
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'no_org', 'error', 'Organisation not found.');
  END IF;

  SELECT g.id INTO v_faculty_id
  FROM public.organization_groups g
  WHERE g.organization_id = v_org_id
    AND UPPER(g.short_name) = UPPER(TRIM(COALESCE(p_parent_faculty_short, '')))
    AND g.kind IN ('faculty', 'college');
  IF v_faculty_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'no_faculty', 'error', 'Parent faculty not found.');
  END IF;

  -- ── Dept short code unique inside the org ──
  IF EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id
      AND UPPER(short_name) = v_dept_short
      AND kind = 'department'
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'dept_exists', 'error',
      'A department with that short code already exists in this organisation.');
  END IF;

  -- ── Decide the class's name + short code.
  --    Staff path: default to "Office" + dept-short + "-OFC" if the
  --    caller didn't pass one. Student path: use the caller's values.
  --    Either way, a class row IS created. v_class_id is always set
  --    when the INSERT below returns. ──
  v_class_name := COALESCE(NULLIF(TRIM(p_class_name), ''),
    CASE WHEN p_is_staff THEN 'Office' ELSE NULL END);
  v_class_short := COALESCE(NULLIF(UPPER(TRIM(p_class_short)), ''),
    CASE WHEN p_is_staff THEN v_dept_short || '-OFC' ELSE NULL END);

  IF v_class_name IS NULL OR v_class_short IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input',
      'error', 'Class name and short code are required.');
  END IF;

  -- ── Class short code unique inside the org ──
  IF EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id
      AND UPPER(short_name) = v_class_short
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'class_exists',
      'error', 'A group with that short code already exists in this organisation.');
  END IF;

  -- ── Member ID unique per org ──
  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org_id AND LOWER(member_id) = v_member_norm
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'id_taken',
      'error', 'That member ID is already in use in this organisation.');
  END IF;

  -- ── Insert dept ──
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
  ) VALUES (
    v_org_id, TRIM(p_dept_name), v_dept_short, 'department', v_faculty_id, TRUE, 0
  )
  RETURNING id INTO v_dept_id;

  -- ── Insert class (ALWAYS — even for staff). For staff the class
  --    is auto-named "Office" with short v_dept_short || '-OFC',
  --    levels omitted so the class doesn't get tied to a year. The
  --    founder member row writes this class_id, never the dept's id. ──
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count, levels
  ) VALUES (
    v_org_id, v_class_name, v_class_short, 'class', v_dept_id, TRUE, 0,
    CASE
      WHEN p_is_staff THEN NULL
      WHEN v_level IS NOT NULL THEN ARRAY[v_level]
      ELSE NULL
    END
  )
  RETURNING id INTO v_class_id;

  -- ── Founder member ALWAYS lands in the class, NEVER in the dept ──
  INSERT INTO public.organization_members (
    organization_id, group_id, member_id, password_hash,
    full_name, email, level, is_active, force_password_change
  ) VALUES (
    v_org_id, v_class_id,
    v_member_norm, extensions.crypt(p_founder_password, extensions.gen_salt('bf')),
    TRIM(p_founder_full_name), v_email_norm, v_level, TRUE, FALSE
  )
  RETURNING id INTO v_member_id;

  -- ── Bump counters on the class (where the row actually sits) ──
  UPDATE public.organization_groups
  SET current_member_count = COALESCE(current_member_count, 0) + 1, updated_at = NOW()
  WHERE id = v_class_id;
  UPDATE public.organizations
  SET member_count = COALESCE(member_count, 0) + 1, last_activity_at = NOW(), updated_at = NOW()
  WHERE id = v_org_id;

  -- ── Submit the claim targeting the DEPT (unit-tier exec), not the
  --    class. The claim grants member_admins.scope_level='unit' once
  --    approved — the founder remains a class member AND gains
  --    dept-exec powers. ──
  v_claim := public.submit_claim_v2(
    v_member_id,
    'faculty_admin',
    'unit',
    v_dept_id,
    TRIM(p_position_title),
    NULL,
    v_email_norm,
    NULL,
    NULL,
    'member_vote'
  );

  IF NOT COALESCE((v_claim->>'ok')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION 'Could not submit claim: %', COALESCE(v_claim->>'error', 'unknown');
  END IF;
  v_claim_id := (v_claim->>'claim_id')::UUID;

  RETURN jsonb_build_object(
    'ok',                    TRUE,
    'dept_id',               v_dept_id,
    'class_id',              v_class_id,
    'member_id',             v_member_id,
    'member_login_id',       v_member_norm,
    'claim_id',              v_claim_id,
    'org_id',                v_org_id,
    'org_slug',              v_org_slug,
    'bootstrap_path',        (v_claim->>'bootstrap_path')::BOOLEAN,
    'votes_required',        (v_claim->>'votes_required')::INTEGER
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'unknown',
      'error', 'Could not start the department: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_department_with_class(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN
) TO authenticated, service_role;

-- ── Backfill: any existing member row currently parked on a
--    department group (the legacy bug's footprint) gets re-homed
--    into an auto-created "Office" class under that dept. The
--    dept group itself stays — it's still the structural container.
DO $$
DECLARE
  v_dept RECORD;
  v_office_class_id UUID;
  v_short TEXT;
BEGIN
  FOR v_dept IN
    SELECT g.id AS dept_id, g.organization_id AS org_id, g.short_name AS dept_short
    FROM public.organization_groups g
    WHERE g.kind = 'department'
      AND EXISTS (
        SELECT 1 FROM public.organization_members m
        WHERE m.group_id = g.id
      )
  LOOP
    v_short := UPPER(v_dept.dept_short) || '-OFC';
    -- Re-use an existing Office class if one is already there.
    SELECT id INTO v_office_class_id
    FROM public.organization_groups
    WHERE organization_id = v_dept.org_id
      AND parent_group_id = v_dept.dept_id
      AND UPPER(short_name) = v_short
    LIMIT 1;

    -- Else create it.
    IF v_office_class_id IS NULL THEN
      INSERT INTO public.organization_groups (
        organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
      ) VALUES (
        v_dept.org_id, 'Office', v_short, 'class', v_dept.dept_id, TRUE, 0
      )
      RETURNING id INTO v_office_class_id;
    END IF;

    -- Move stray members into the Office class.
    UPDATE public.organization_members
       SET group_id = v_office_class_id, updated_at = NOW()
     WHERE group_id = v_dept.dept_id;

    -- Recompute member counts on both sides.
    UPDATE public.organization_groups
       SET current_member_count = (
         SELECT COUNT(*) FROM public.organization_members
         WHERE group_id = organization_groups.id AND is_active
       )
     WHERE id IN (v_dept.dept_id, v_office_class_id);
  END LOOP;
END $$;

COMMIT;
