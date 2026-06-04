-- ============================================================
-- Migration 099: Mark auto-created Office classes as staff buckets.
--
-- Context
-- -------
-- Mig 098 ensures every dept founder lands in a CLASS-tier group
-- (never directly on a department group). For "staff" founders we
-- auto-create a class named "Office" with short code <DEPT>-OFC.
-- That preserves the "every member has a class" invariant, but it
-- also pollutes audit / listing surfaces — Office rows hold zero
-- dues by design and shouldn't show up alongside student classes
-- in payment audits. The user's verbatim guidance:
--   "i dont see any need auditing them since they dont pay dues
--    nah … this is mostly student app not entirely staff app"
--
-- This migration
-- --------------
-- Adds an explicit `is_staff_office` BOOLEAN on organization_groups.
-- Future bootstraps set it to TRUE when the class is auto-created
-- in staff mode; existing Office rows from the mig-098 backfill get
-- the flag set retroactively. Consumers (AuditPage, Audit PDF,
-- ManageDues count, etc.) filter these out so they don't muddy the
-- student-facing surfaces.
-- ============================================================

BEGIN;

ALTER TABLE public.organization_groups
  ADD COLUMN IF NOT EXISTS is_staff_office BOOLEAN NOT NULL DEFAULT FALSE;

-- Backfill: any class that matches the auto-naming pattern
-- (name='Office' AND short_name ends with '-OFC' AND parent is a
-- department) gets flagged. The double match keeps us from
-- accidentally flagging a real student class some org happened
-- to name "Office".
UPDATE public.organization_groups c
   SET is_staff_office = TRUE
  FROM public.organization_groups p
 WHERE c.kind = 'class'
   AND c.parent_group_id = p.id
   AND p.kind = 'department'
   AND c.name = 'Office'
   AND UPPER(c.short_name) LIKE '%-OFC';

-- Refresh the dept-bootstrap function so future calls in staff mode
-- set the flag at insert time. Only the class INSERT changes; the
-- rest of the function is identical to mig 098.
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

  IF EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id
      AND UPPER(short_name) = v_dept_short
      AND kind = 'department'
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'dept_exists', 'error',
      'A department with that short code already exists in this organisation.');
  END IF;

  v_class_name := COALESCE(NULLIF(TRIM(p_class_name), ''),
    CASE WHEN p_is_staff THEN 'Office' ELSE NULL END);
  v_class_short := COALESCE(NULLIF(UPPER(TRIM(p_class_short)), ''),
    CASE WHEN p_is_staff THEN v_dept_short || '-OFC' ELSE NULL END);

  IF v_class_name IS NULL OR v_class_short IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input',
      'error', 'Class name and short code are required.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id
      AND UPPER(short_name) = v_class_short
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'class_exists',
      'error', 'A group with that short code already exists in this organisation.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org_id AND LOWER(member_id) = v_member_norm
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'id_taken',
      'error', 'That member ID is already in use in this organisation.');
  END IF;

  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
  ) VALUES (
    v_org_id, TRIM(p_dept_name), v_dept_short, 'department', v_faculty_id, TRUE, 0
  )
  RETURNING id INTO v_dept_id;

  -- The class. is_staff_office=TRUE marks this row as the
  -- auto-created staff bucket so downstream audit / listing
  -- surfaces can filter it out.
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count, levels, is_staff_office
  ) VALUES (
    v_org_id, v_class_name, v_class_short, 'class', v_dept_id, TRUE, 0,
    CASE
      WHEN p_is_staff THEN NULL
      WHEN v_level IS NOT NULL THEN ARRAY[v_level]
      ELSE NULL
    END,
    p_is_staff
  )
  RETURNING id INTO v_class_id;

  INSERT INTO public.organization_members (
    organization_id, group_id, member_id, password_hash,
    full_name, email, level, is_active, force_password_change
  ) VALUES (
    v_org_id, v_class_id,
    v_member_norm, extensions.crypt(p_founder_password, extensions.gen_salt('bf')),
    TRIM(p_founder_full_name), v_email_norm, v_level, TRUE, FALSE
  )
  RETURNING id INTO v_member_id;

  UPDATE public.organization_groups
  SET current_member_count = COALESCE(current_member_count, 0) + 1, updated_at = NOW()
  WHERE id = v_class_id;
  UPDATE public.organizations
  SET member_count = COALESCE(member_count, 0) + 1, last_activity_at = NOW(), updated_at = NOW()
  WHERE id = v_org_id;

  v_claim := public.submit_claim_v2(
    v_member_id,
    'faculty_admin',
    'unit',
    v_dept_id,
    TRIM(p_position_title),
    NULL, v_email_norm, NULL, NULL,
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

COMMIT;
