-- ============================================================
-- Migration 081: Make the role claim OPTIONAL on bootstrap
--
-- The bug: today's mig 080 RPCs assume the founder will claim a role and force
-- a `position_title`. That actively recruits the wrong person — any random
-- visitor adding a missing department gets pushed into "claim Departmental
-- President" by default.
--
-- New rule: creating structure and claiming a role are TWO separate, deliberate
-- actions. If the caller passes an empty/null position_title the RPC creates
-- the structure + member only — no claim, no exec request. The founder lands
-- on the dashboard as a regular class member; the dashboard's role-claim card
-- is the only place where they can later opt in.
--
-- Both bootstrap RPCs are recreated with the new semantics.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1) bootstrap_department_with_class — position_title now nullable
-- ════════════════════════════════════════════════════════════
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
  p_position_title       TEXT,    -- empty/null = NO claim (just structure + member)
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
  v_position      TEXT := NULLIF(TRIM(COALESCE(p_position_title, '')), '');
  v_email_norm    TEXT := NULLIF(LOWER(TRIM(COALESCE(p_founder_email, ''))), '');
  v_member_norm   TEXT := LOWER(TRIM(COALESCE(p_founder_member_id, '')));
  v_dept_short    TEXT := UPPER(TRIM(COALESCE(p_dept_short, '')));
  v_class_short   TEXT := UPPER(TRIM(COALESCE(p_class_short, '')));
  v_level         TEXT := NULLIF(TRIM(COALESCE(p_class_level, '')), '');
BEGIN
  -- ── Input validation (claim title is OPTIONAL now) ──
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
  IF NOT p_is_staff AND TRIM(COALESCE(p_class_name, '')) = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'class_required',
      'error', 'Pick (or create) the class you belong to. Toggle "I''m staff / faculty" if you don''t have one.');
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

  -- ── Uniqueness checks ──
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

  -- ── Create the department ──
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

  -- ── Create the founder member ──
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

  -- ── Submit claim ONLY when the caller opted in (non-empty position_title).
  --    Skipping means the founder is just a regular class member; they can
  --    opt into a claim later from their dashboard. ──
  IF v_position IS NOT NULL THEN
    v_claim := public.submit_claim_v2(
      v_member_id,
      'faculty_admin',
      'unit',
      v_dept_id,
      v_position,
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
  END IF;

  RETURN jsonb_build_object(
    'ok',                    TRUE,
    'dept_id',               v_dept_id,
    'class_id',              v_class_id,
    'member_id',             v_member_id,
    'member_login_id',       v_member_norm,
    'claim_id',              v_claim_id,              -- NULL when no claim was submitted
    'claim_submitted',       (v_claim_id IS NOT NULL),
    'org_id',                v_org_id,
    'org_slug',              v_org_slug,
    'bootstrap_path',        CASE WHEN v_claim IS NULL THEN NULL ELSE (v_claim->>'bootstrap_path')::BOOLEAN END,
    'votes_required',        CASE WHEN v_claim IS NULL THEN NULL ELSE (v_claim->>'votes_required')::INTEGER END
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
-- 2) bootstrap_class_with_rep — position_title now optional
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
  p_position_title    TEXT       -- empty/null = NO claim
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
  v_position    TEXT := NULLIF(TRIM(COALESCE(p_position_title, '')), '');
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

  IF v_position IS NOT NULL THEN
    v_claim := public.submit_claim_v2(
      v_member_id, 'group_admin', 'group', v_class_id, v_position,
      NULL, v_email_norm, NULL, NULL, 'member_vote'
    );
    IF NOT COALESCE((v_claim->>'ok')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'Could not submit claim: %', COALESCE(v_claim->>'error', 'unknown');
    END IF;
    v_claim_id := (v_claim->>'claim_id')::UUID;
  END IF;

  RETURN jsonb_build_object(
    'ok',                    TRUE,
    'class_id',              v_class_id,
    'member_id',             v_member_id,
    'member_login_id',       v_member_norm,
    'claim_id',              v_claim_id,
    'claim_submitted',       (v_claim_id IS NOT NULL),
    'org_id',                v_org_id,
    'org_slug',              v_org_slug,
    'bootstrap_path',        CASE WHEN v_claim IS NULL THEN NULL ELSE (v_claim->>'bootstrap_path')::BOOLEAN END,
    'votes_required',        CASE WHEN v_claim IS NULL THEN NULL ELSE (v_claim->>'votes_required')::INTEGER END
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
  RAISE NOTICE 'Migration 081 complete: bootstrap RPCs treat empty position_title as "skip claim".';
END $$;

COMMIT;
