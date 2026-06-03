-- ============================================================
-- Migration 029: add_faculty_to_org() RPC
--
-- Atomic creation of a new faculty (organization_groups row with
-- kind='faculty') inside an existing organization.
--
-- Distinct from add_department_to_faculty (mig 027) — this is
-- the parent-level entity, no parent_group_id. No founder member
-- is created because faculties don't have direct members.
--
-- Returns: jsonb { ok, error?, slug, org_id, faculty_id, faculty_short }
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.add_faculty_to_org(
  p_org_slug           TEXT,
  p_faculty_name       TEXT,
  p_faculty_short_name TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id        UUID;
  v_org_slug      TEXT;
  v_faculty_id    UUID;
  v_faculty_short TEXT;
BEGIN
  -- Validate
  IF p_org_slug IS NULL OR LENGTH(TRIM(p_org_slug)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization is missing.');
  END IF;
  IF p_faculty_name IS NULL OR LENGTH(TRIM(p_faculty_name)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Faculty name must be at least 2 characters.');
  END IF;

  -- Resolve org
  SELECT id, slug INTO v_org_id, v_org_slug
  FROM public.organizations
  WHERE slug = LOWER(TRIM(p_org_slug))
    AND is_active = TRUE;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization not found.');
  END IF;

  v_faculty_short := COALESCE(
    NULLIF(UPPER(TRIM(p_faculty_short_name)), ''),
    UPPER(LEFT(REGEXP_REPLACE(p_faculty_name, '[^a-zA-Z]', '', 'g'), 5))
  );

  -- Uniqueness check
  IF EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id
      AND LOWER(short_name) = LOWER(v_faculty_short)
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'A group with that short name already exists in this organization.');
  END IF;

  -- Create the faculty
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id,
    is_active, current_member_count
  ) VALUES (
    v_org_id,
    TRIM(p_faculty_name),
    v_faculty_short,
    'faculty',
    NULL,
    TRUE, 0
  )
  RETURNING id INTO v_faculty_id;

  -- Touch the org so it shows up as recently active
  UPDATE public.organizations
  SET last_activity_at = NOW(),
      updated_at       = NOW()
  WHERE id = v_org_id;

  RETURN jsonb_build_object(
    'ok',             TRUE,
    'slug',           v_org_slug,
    'org_id',         v_org_id,
    'faculty_id',     v_faculty_id,
    'faculty_short',  v_faculty_short
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'A group with that short name already exists.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Could not create the faculty: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_faculty_to_org(TEXT, TEXT, TEXT)
  TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 029 complete: add_faculty_to_org() RPC ready.';
END $$;

COMMIT;
