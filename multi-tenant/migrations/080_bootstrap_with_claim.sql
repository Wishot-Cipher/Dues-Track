-- ============================================================
-- Migration 080: Bootstrap a department / class WITH a pending claim
--
-- The bug we're fixing: today, when a random person creates a department or
-- class, the legacy flow makes them an immediate verified admin. That's wrong
-- in real life — anyone can walk in and claim "I'm the Civil Eng president"
-- without verification.
--
-- The right model:
--
--   1. They create the structure (department, optionally a class) and become
--      a normal MEMBER of their own class. No exec powers yet.
--   2. We submit a CLAIM via submit_claim_v2 (mig 042 + 060). The claim must
--      go through graduated trust — peer votes OR a verified parent exec OR
--      the platform override — before any exec power lands.
--   3. Until the claim is approved, the founder is just a class member.
--      They can invite others (so peers can vote them in) but cannot collect
--      money or manage members (already enforced by the Layer-4 money gate).
--
-- Two SECURITY DEFINER RPCs:
--   bootstrap_department_with_class — /f/:short/new flow
--   bootstrap_class_with_rep         — /d/:short/new flow
--
-- Both are atomic: if claim submission fails, the whole thing rolls back so
-- no half-created structures pollute the org tree.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1) bootstrap_department_with_class
--    Creates: department (under a faculty) + class (under the dept, unless
--    p_is_staff = TRUE) + founder member (group_id = class for students,
--    dept for staff) + claim for "exec on this department".
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.bootstrap_department_with_class(
  p_org_slug             TEXT,
  p_parent_faculty_short TEXT,
  p_dept_name            TEXT,
  p_dept_short           TEXT,
  p_class_name           TEXT,    -- NULL when p_is_staff = TRUE
  p_class_short          TEXT,
  p_class_level          TEXT,
  p_founder_full_name    TEXT,
  p_founder_email        TEXT,
  p_founder_member_id    TEXT,
  p_founder_password     TEXT,
  p_position_title       TEXT,    -- e.g. "Departmental President"
  p_is_staff             BOOLEAN DEFAULT FALSE
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org_id        UUID;
  v_org_slug      TEXT;
  v_faculty_id    UUID;
  v_dept_id       UUID;
  v_class_id      UUID;
  v_member_id     UUID;
  v_claim         jsonb;
  v_claim_id      UUID;
  v_email_norm    TEXT := NULLIF(LOWER(TRIM(COALESCE(p_founder_email, ''))), '');
  v_member_norm   TEXT := LOWER(TRIM(COALESCE(p_founder_member_id, '')));
  v_dept_short    TEXT := UPPER(TRIM(COALESCE(p_dept_short, '')));
  v_class_short   TEXT := UPPER(TRIM(COALESCE(p_class_short, '')));
  v_level         TEXT := NULLIF(TRIM(COALESCE(p_class_level, '')), '');
BEGIN
  -- ── Input validation ──
  IF v_member_norm = '' OR LENGTH(v_member_norm) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'member_id_required', 'error', 'Your member ID is required.');
  END IF;
  IF TRIM(COALESCE(p_founder_full_name, '')) = '' OR LENGTH(TRIM(p_founder_full_name)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'name_required', 'error', 'Your full name is required.');
  END IF;
  IF COALESCE(p_founder_password, '') = '' OR LENGTH(p_founder_password) < 6 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'weak_password', 'error', 'Password must be at least 6 characters.');
  END IF;
  IF TRIM(COALESCE(p_dept_name, '')) = '' OR v_dept_short = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'dept_required', 'error', 'Department name and short name are required.');
  END IF;
  IF NOT p_is_staff THEN
    IF TRIM(COALESCE(p_class_name, '')) = '' THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'class_required',
        'error', 'Pick (or create) the class you belong to. Toggle "I''m staff / faculty" if you don''t have a class.');
    END IF;
  END IF;
  IF TRIM(COALESCE(p_position_title, '')) = '' OR LENGTH(TRIM(p_position_title)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'position_required', 'error', 'Your role title is required.');
  END IF;

  -- ── Resolve org + parent faculty ──
  SELECT id, slug INTO v_org_id, v_org_slug
  FROM public.organizations
  WHERE slug = LOWER(TRIM(p_org_slug)) AND COALESCE(is_active, TRUE);
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'org_not_found', 'error', 'Organization not found.');
  END IF;

  SELECT id INTO v_faculty_id
  FROM public.organization_groups
  WHERE organization_id = v_org_id
    AND LOWER(short_name) = LOWER(TRIM(p_parent_faculty_short))
    AND LOWER(kind) IN ('faculty', 'college')
    AND COALESCE(is_active, TRUE);
  IF v_faculty_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'faculty_not_found',
      'error', 'Parent faculty not found. Create the faculty first.');
  END IF;

  -- ── Uniqueness checks (friendlier than raw 23505) ──
  IF EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id AND LOWER(short_name) = LOWER(v_dept_short)
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'short_name_taken',
      'error', 'A group with the short name "' || v_dept_short || '" already exists in this organization.');
  END IF;

  IF NOT p_is_staff AND v_class_short <> '' AND EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id AND LOWER(short_name) = LOWER(v_class_short)
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'short_name_taken',
      'error', 'A group with the short name "' || v_class_short || '" already exists.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org_id
      AND (LOWER(member_id) = v_member_norm OR (v_email_norm IS NOT NULL AND LOWER(email) = v_email_norm))
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'member_id_taken',
      'error', 'A member with that ID or email already exists in this organization. Sign in instead.');
  END IF;

  -- ── Create the department (the hierarchy trigger validates parent kind) ──
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
  ) VALUES (
    v_org_id, TRIM(p_dept_name), v_dept_short, 'department', v_faculty_id, TRUE, 0
  )
  RETURNING id INTO v_dept_id;

  -- ── Create the class (skipped for staff) ──
  IF NOT p_is_staff THEN
    INSERT INTO public.organization_groups (
      organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count, levels
    ) VALUES (
      v_org_id, TRIM(p_class_name),
      COALESCE(NULLIF(v_class_short, ''), UPPER(LEFT(REGEXP_REPLACE(TRIM(p_class_name), '\s+', '', 'g'), 8))),
      'class', v_dept_id, TRUE, 0,
      CASE WHEN v_level IS NOT NULL THEN ARRAY[v_level] ELSE NULL END
    )
    RETURNING id INTO v_class_id;
  END IF;

  -- ── Create the founder member (in their class, or in the dept for staff) ──
  INSERT INTO public.organization_members (
    organization_id, group_id, member_id, password_hash,
    full_name, email, level, is_active, force_password_change
  ) VALUES (
    v_org_id, COALESCE(v_class_id, v_dept_id),
    v_member_norm, extensions.crypt(p_founder_password, extensions.gen_salt('bf')),
    TRIM(p_founder_full_name), v_email_norm, v_level, TRUE, FALSE
  )
  RETURNING id INTO v_member_id;

  -- ── Bump denormalised counters ──
  UPDATE public.organization_groups
  SET current_member_count = COALESCE(current_member_count, 0) + 1, updated_at = NOW()
  WHERE id = COALESCE(v_class_id, v_dept_id);
  UPDATE public.organizations
  SET member_count = COALESCE(member_count, 0) + 1, last_activity_at = NOW(), updated_at = NOW()
  WHERE id = v_org_id;

  -- ── Submit the claim for "exec on this department" via the graduated-trust
  --    pipeline. No member_admins row is inserted yet — that only happens
  --    when the claim is approved (peer votes / parent exec / platform). ──
  v_claim := public.submit_claim_v2(
    v_member_id,
    'faculty_admin',
    'unit',
    v_dept_id,
    TRIM(p_position_title),
    NULL,           -- phone
    v_email_norm,   -- personal email
    NULL,           -- institutional email
    NULL,           -- document urls
    'member_vote'
  );

  IF NOT COALESCE((v_claim->>'ok')::BOOLEAN, FALSE) THEN
    RAISE EXCEPTION 'Could not submit claim: %', COALESCE(v_claim->>'error', 'unknown');
  END IF;
  v_claim_id := (v_claim->>'claim_id')::UUID;

  RETURN jsonb_build_object(
    'ok',                    TRUE,
    'dept_id',               v_dept_id,
    'class_id',              v_class_id,        -- NULL when staff
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
) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 2) bootstrap_class_with_rep
--    Creates: class (under a department) + founder member (in that class) +
--    claim for "class rep / exec on this class". Same no-instant-admin rule.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.bootstrap_class_with_rep(
  p_org_slug          TEXT,
  p_parent_dept_short TEXT,
  p_class_name        TEXT,
  p_class_short       TEXT,
  p_class_level       TEXT,
  p_founder_full_name TEXT,
  p_founder_email     TEXT,
  p_founder_member_id TEXT,
  p_founder_password  TEXT,
  p_position_title    TEXT       -- e.g. "Class Rep", "Course Rep"
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org_id      UUID;
  v_org_slug    TEXT;
  v_dept_id     UUID;
  v_class_id    UUID;
  v_member_id   UUID;
  v_claim       jsonb;
  v_claim_id    UUID;
  v_email_norm  TEXT := NULLIF(LOWER(TRIM(COALESCE(p_founder_email, ''))), '');
  v_member_norm TEXT := LOWER(TRIM(COALESCE(p_founder_member_id, '')));
  v_class_short TEXT := UPPER(TRIM(COALESCE(p_class_short, '')));
  v_level       TEXT := NULLIF(TRIM(COALESCE(p_class_level, '')), '');
BEGIN
  IF v_member_norm = '' OR LENGTH(v_member_norm) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'member_id_required', 'error', 'Your member ID is required.');
  END IF;
  IF TRIM(COALESCE(p_founder_full_name, '')) = '' OR LENGTH(TRIM(p_founder_full_name)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'name_required', 'error', 'Your full name is required.');
  END IF;
  IF COALESCE(p_founder_password, '') = '' OR LENGTH(p_founder_password) < 6 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'weak_password', 'error', 'Password must be at least 6 characters.');
  END IF;
  IF TRIM(COALESCE(p_class_name, '')) = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'class_required', 'error', 'Class name is required.');
  END IF;
  IF TRIM(COALESCE(p_position_title, '')) = '' OR LENGTH(TRIM(p_position_title)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'position_required', 'error', 'Your role title is required.');
  END IF;

  SELECT id, slug INTO v_org_id, v_org_slug
  FROM public.organizations
  WHERE slug = LOWER(TRIM(p_org_slug)) AND COALESCE(is_active, TRUE);
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'org_not_found', 'error', 'Organization not found.');
  END IF;

  SELECT id INTO v_dept_id
  FROM public.organization_groups
  WHERE organization_id = v_org_id
    AND LOWER(short_name) = LOWER(TRIM(p_parent_dept_short))
    AND LOWER(kind) = 'department'
    AND COALESCE(is_active, TRUE);
  IF v_dept_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'dept_not_found',
      'error', 'Parent department not found. Create the department first.');
  END IF;

  IF v_class_short <> '' AND EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id AND LOWER(short_name) = LOWER(v_class_short)
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'short_name_taken',
      'error', 'A group with that short name already exists.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org_id
      AND (LOWER(member_id) = v_member_norm OR (v_email_norm IS NOT NULL AND LOWER(email) = v_email_norm))
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'member_id_taken',
      'error', 'A member with that ID or email already exists in this organization.');
  END IF;

  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count, levels
  ) VALUES (
    v_org_id, TRIM(p_class_name),
    COALESCE(NULLIF(v_class_short, ''), UPPER(LEFT(REGEXP_REPLACE(TRIM(p_class_name), '\s+', '', 'g'), 8))),
    'class', v_dept_id, TRUE, 0,
    CASE WHEN v_level IS NOT NULL THEN ARRAY[v_level] ELSE NULL END
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
    'group_admin',
    'group',
    v_class_id,
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
      'error', 'Could not start the class: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_class_with_rep(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 080 complete: bootstrap RPCs create structure + member + pending claim (no instant admin).';
END $$;

COMMIT;
