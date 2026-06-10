-- ============================================================
-- Migration 116: Dept bootstrap reuses an existing membership
-- instead of inserting a duplicate (fixes the
-- idx_org_members_org_email_unique_ci violation on dept creation).
--
-- The problem
-- -----------
-- bootstrap_department_with_class always INSERTed a fresh
-- organization_members row for the founder. If that person was already
-- a member of the org (a leftover from a prior attempt, or a genuine
-- existing member founding a new dept), the per-org unique email index
-- tripped: "duplicate key value violates idx_org_members_org_email_
-- unique_ci". Raw, scary, and it blocked dept creation entirely.
--
-- The fix (user decision: "reuse + move")
-- ---------------------------------------
-- One person = one membership. When the founder already exists in the
-- org (matched by member_id OR email), we REUSE that membership and
-- MOVE it into the new department's class (they're declaring it their
-- home as founder), then file the dept claim on it — no duplicate row.
--
-- Security: reusing a membership by email/id is an account takeover
-- vector, so we REQUIRE the supplied password to match the existing
-- member's password_hash before reusing. Wrong password → a clear
-- 'account_exists' error, never a silent takeover.
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
  v_member_norm TEXT := LOWER(TRIM(COALESCE(p_founder_member_id, '')));
  v_email_norm  TEXT := NULLIF(LOWER(TRIM(COALESCE(p_founder_email, ''))), '');
  v_dept_short  TEXT := UPPER(TRIM(COALESCE(p_dept_short, '')));
  v_level       TEXT := NULLIF(TRIM(COALESCE(p_class_level, '')), '');
  v_position    TEXT := NULLIF(TRIM(COALESCE(p_position_title, '')), '');
  v_claim       JSONB;
  v_claim_id    UUID;
  -- Reuse bookkeeping.
  v_existing_id      UUID;   -- member matched by member_id
  v_existing_email   UUID;   -- member matched by email
  v_reuse_member     UUID;   -- the membership we'll reuse, if any
  v_reuse_pw_hash    TEXT;
  v_reuse_old_group  UUID;
  v_reused           BOOLEAN := FALSE;
BEGIN
  -- ── Validation ──
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

  -- ── Resolve org + parent faculty ──
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

  -- ── Group short-code uniqueness (structure must not collide) ──
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

  -- ── Identity resolution (reuse instead of duplicate) ──
  -- A person is ONE membership. If the founder already exists in this
  -- org, we reuse that row rather than insert a colliding one.
  SELECT id, password_hash, group_id INTO v_existing_id, v_reuse_pw_hash, v_reuse_old_group
  FROM public.organization_members
  WHERE organization_id = v_org_id AND LOWER(member_id) = v_member_norm
  LIMIT 1;

  IF v_email_norm IS NOT NULL THEN
    SELECT id INTO v_existing_email
    FROM public.organization_members
    WHERE organization_id = v_org_id AND LOWER(email) = v_email_norm
    LIMIT 1;
  END IF;

  -- member_id and email point at two DIFFERENT people → genuine clash.
  IF v_existing_id IS NOT NULL AND v_existing_email IS NOT NULL
     AND v_existing_id <> v_existing_email THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'identity_conflict', 'error',
      'That member ID and email belong to two different members. Use details that match one account.');
  END IF;

  v_reuse_member := COALESCE(v_existing_id, v_existing_email);

  IF v_reuse_member IS NOT NULL THEN
    -- An account already exists. Reuse ONLY if the supplied password
    -- proves ownership — never silently take over someone's email/id.
    IF v_reuse_pw_hash IS NULL THEN
      SELECT password_hash, group_id INTO v_reuse_pw_hash, v_reuse_old_group
      FROM public.organization_members WHERE id = v_reuse_member;
    END IF;
    IF v_reuse_pw_hash IS NULL
       OR extensions.crypt(p_founder_password, v_reuse_pw_hash) <> v_reuse_pw_hash THEN
      RETURN jsonb_build_object('ok', FALSE, 'code', 'account_exists', 'error',
        'An account with that member ID or email already exists in this organisation. '
        || 'If it is yours, use its password to found the department; otherwise use different details.');
    END IF;
    v_reused := TRUE;
    v_member_id := v_reuse_member;
  END IF;

  -- ── Insert dept ──
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
  ) VALUES (
    v_org_id, TRIM(p_dept_name), v_dept_short, 'department', v_faculty_id, TRUE, 0
  )
  RETURNING id INTO v_dept_id;

  -- ── Insert class ──
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count, levels
  ) VALUES (
    v_org_id, v_class_name, v_class_short, 'class', v_dept_id, TRUE, 0,
    CASE WHEN v_level IS NOT NULL THEN ARRAY[v_level] ELSE NULL END
  )
  RETURNING id INTO v_class_id;

  IF v_reused THEN
    -- ── Reuse: MOVE the existing membership into the new class ──
    UPDATE public.organization_members
    SET group_id = v_class_id,
        level = COALESCE(v_level, level),
        is_active = TRUE,
        updated_at = NOW()
    WHERE id = v_member_id;

    -- Adjust counters: leave the old class, join the new one. Org
    -- member_count is unchanged (they were already counted).
    IF v_reuse_old_group IS NOT NULL AND v_reuse_old_group <> v_class_id THEN
      UPDATE public.organization_groups
      SET current_member_count = GREATEST(COALESCE(current_member_count, 1) - 1, 0), updated_at = NOW()
      WHERE id = v_reuse_old_group;
    END IF;
    UPDATE public.organization_groups
    SET current_member_count = COALESCE(current_member_count, 0) + 1, updated_at = NOW()
    WHERE id = v_class_id;
    UPDATE public.organizations
    SET last_activity_at = NOW(), updated_at = NOW()
    WHERE id = v_org_id;
  ELSE
    -- ── New founder: create the membership in the class ──
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

  -- ── Optional claim (founder supplied a position title) ──
  IF v_position IS NOT NULL THEN
    v_claim := public.submit_claim_v2(
      v_member_id,
      'faculty_admin',
      'unit',
      v_dept_id,
      v_position,
      NULL,           -- phone
      v_email_norm,   -- personal email
      v_email_norm,   -- institutional email (same address; verified later)
      NULL,           -- document urls
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
    'reused_membership',     v_reused,
    'claim_id',              v_claim_id,
    'org_id',                v_org_id,
    'org_slug',              v_org_slug,
    'bootstrap_path',        COALESCE((v_claim->>'bootstrap_path')::BOOLEAN, FALSE),
    'votes_required',        COALESCE((v_claim->>'votes_required')::INTEGER, 0)
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.bootstrap_department_with_class(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 116 applied: dept bootstrap now reuses an existing membership (password-verified) and moves it into the new class — no more duplicate-email failures.';
END $$;

COMMIT;
