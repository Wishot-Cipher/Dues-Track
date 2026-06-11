-- ============================================================
-- Migration 137: the same person can build nested structure.
--
-- The problem (user): "the same person who created the department and
-- wanted to create a group inside it is [treated] as 2 diff persons — it
-- doesn't allow the same info we used for creating the dept."
--
-- Both bootstrap RPCs (bootstrap_department_with_class /
-- bootstrap_class_with_rep) ERROR ('id_taken' / 'member_id_taken') when a
-- member with that ID/email already exists, then insert a brand-new
-- member. So a founder who created the department can't reuse their own
-- identity to add a class under it — they're forced to invent a second
-- member ID, becoming two people.
--
-- The fix: if a member with that ID/email already exists AND the password
-- matches, it's the SAME person building more structure. Reuse their
-- existing member row — don't duplicate them, and don't move them out of
-- their own class. The new group is created as STRUCTURE; the creator
-- keeps their original membership. (Wrong password → still rejected, so
-- the ID can't be hijacked.) A brand-new ID still creates a new member as
-- before.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1) bootstrap_department_with_class
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
  p_position_title       TEXT
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
  v_existing_id   UUID;
  v_existing_hash TEXT;
  v_reused      BOOLEAN := FALSE;
  v_member_norm TEXT := LOWER(TRIM(COALESCE(p_founder_member_id, '')));
  v_email_norm  TEXT := NULLIF(LOWER(TRIM(COALESCE(p_founder_email, ''))), '');
  v_dept_short  TEXT := UPPER(TRIM(COALESCE(p_dept_short, '')));
  v_level       TEXT := NULLIF(TRIM(COALESCE(p_class_level, '')), '');
  v_position    TEXT := NULLIF(TRIM(COALESCE(p_position_title, '')), '');
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

  v_class_name  := NULLIF(TRIM(p_class_name), '');
  v_class_short := NULLIF(UPPER(TRIM(p_class_short)), '');
  IF v_class_name IS NULL OR v_class_short IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input', 'error',
      'Class name and short code are required. Every founder must belong to a real class.');
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
    WHERE organization_id = v_org_id AND UPPER(short_name) = v_dept_short AND kind = 'department'
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'dept_exists', 'error',
      'A department with that short code already exists in this organisation.');
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id AND UPPER(short_name) = v_class_short
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'class_exists',
      'error', 'A group with that short code already exists in this organisation.');
  END IF;

  -- ── Same person, or a new one? ──
  SELECT id, password_hash INTO v_existing_id, v_existing_hash
  FROM public.organization_members
  WHERE organization_id = v_org_id
    AND (LOWER(member_id) = v_member_norm OR (v_email_norm IS NOT NULL AND LOWER(email) = v_email_norm))
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    -- Reuse only if the password proves it's really them.
    IF v_existing_hash IS NULL
       OR extensions.crypt(p_founder_password, v_existing_hash) <> v_existing_hash THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'id_taken',
        'error', 'That member ID is already in use. If it''s you, enter your existing password to reuse it.');
    END IF;
    v_member_id := v_existing_id;
    v_reused := TRUE;
  END IF;

  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
  ) VALUES (
    v_org_id, TRIM(p_dept_name), v_dept_short, 'department', v_faculty_id, TRUE, 0
  )
  RETURNING id INTO v_dept_id;

  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count, levels
  ) VALUES (
    v_org_id, v_class_name, v_class_short, 'class', v_dept_id, TRUE, 0,
    CASE WHEN v_level IS NOT NULL THEN ARRAY[v_level] ELSE NULL END
  )
  RETURNING id INTO v_class_id;

  -- New founder lands in the class; a reused member keeps their own class
  -- (they're building structure, not joining this new group).
  IF NOT v_reused THEN
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
  END IF;

  IF v_position IS NOT NULL THEN
    v_claim := public.submit_claim_v2(
      v_member_id, 'faculty_admin', 'unit', v_dept_id, v_position,
      NULL, v_email_norm, v_email_norm, NULL, 'member_vote'
    );
    IF NOT COALESCE((v_claim->>'ok')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'Could not submit claim: %', COALESCE(v_claim->>'error', 'unknown');
    END IF;
    v_claim_id := (v_claim->>'claim_id')::UUID;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE, 'dept_id', v_dept_id, 'class_id', v_class_id,
    'member_id', v_member_id, 'member_login_id', v_member_norm,
    'claim_id', v_claim_id, 'org_id', v_org_id, 'org_slug', v_org_slug,
    'reused_member', v_reused,
    'bootstrap_path', COALESCE((v_claim->>'bootstrap_path')::BOOLEAN, FALSE),
    'votes_required', COALESCE((v_claim->>'votes_required')::INTEGER, 0)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'unknown',
      'error', 'Could not start the department: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_department_with_class(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 2) bootstrap_class_with_rep
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
  p_position_title    TEXT
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
  v_existing_id   UUID;
  v_existing_hash TEXT;
  v_reused      BOOLEAN := FALSE;
  v_claim       jsonb;
  v_claim_id    UUID;
  v_email_norm  TEXT := NULLIF(LOWER(TRIM(COALESCE(p_founder_email, ''))), '');
  v_member_norm TEXT := LOWER(TRIM(COALESCE(p_founder_member_id, '')));
  v_class_short TEXT := UPPER(TRIM(COALESCE(p_class_short, '')));
  v_level       TEXT := NULLIF(TRIM(COALESCE(p_class_level, '')), '');
  v_position    TEXT := NULLIF(TRIM(COALESCE(p_position_title, '')), '');
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

  -- ── Same person, or a new one? ──
  SELECT id, password_hash INTO v_existing_id, v_existing_hash
  FROM public.organization_members
  WHERE organization_id = v_org_id
    AND (LOWER(member_id) = v_member_norm OR (v_email_norm IS NOT NULL AND LOWER(email) = v_email_norm))
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    IF v_existing_hash IS NULL
       OR extensions.crypt(p_founder_password, v_existing_hash) <> v_existing_hash THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'member_id_taken',
        'error', 'That member ID is already in use. If it''s you, enter your existing password to reuse it.');
    END IF;
    v_member_id := v_existing_id;
    v_reused := TRUE;
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

  IF NOT v_reused THEN
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
  END IF;

  IF v_position IS NOT NULL THEN
    v_claim := public.submit_claim_v2(
      v_member_id, 'group_admin', 'group', v_class_id, v_position,
      NULL, v_email_norm, v_email_norm, NULL, 'member_vote'
    );
    IF NOT COALESCE((v_claim->>'ok')::BOOLEAN, FALSE) THEN
      RAISE EXCEPTION 'Could not submit claim: %', COALESCE(v_claim->>'error', 'unknown');
    END IF;
    v_claim_id := (v_claim->>'claim_id')::UUID;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE, 'class_id', v_class_id, 'member_id', v_member_id,
    'member_login_id', v_member_norm, 'claim_id', v_claim_id,
    'org_id', v_org_id, 'org_slug', v_org_slug, 'reused_member', v_reused,
    'bootstrap_path', COALESCE((v_claim->>'bootstrap_path')::BOOLEAN, FALSE),
    'votes_required', COALESCE((v_claim->>'votes_required')::INTEGER, 0)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'unknown',
      'error', 'Could not start the class: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_class_with_rep(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 137 applied: the same person can reuse their identity (with password) to build nested structure — no more duplicate-member / id_taken wall.';
END $$;

COMMIT;
