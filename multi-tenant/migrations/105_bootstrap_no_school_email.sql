-- ============================================================
-- Migration 105: Drop the "verified school email" gate at bootstrap.
--
-- Bug
-- ---
-- A new dept/class founder fills the AddDepartmentPage wizard:
--   • Step 1: structure
--   • Step 2: their class
--   • Step 3: their account (name, member id, ONE email, password)
--   • Step 4: optional "claim a role" toggle
-- They submit. The bootstrap RPC routes their account email into the
-- members table as `personal_email`, then calls submit_claim_v2 with
-- p_institutional_email = NULL. submit_claim_v2's bootstrap branch
-- (mig 042 / 101) requires institutional_email to be non-null and
-- raises "This is the first claim at this organization — a verified
-- school email is required." The founder sees a generic error and
-- can't proceed.
--
-- Why the gate was friction without payoff
-- ----------------------------------------
-- The gate is a presence check only (length >= 3). It doesn't send a
-- code, doesn't verify ownership, doesn't validate the domain. The
-- real verification step is VerifyEmailPage on the post-bootstrap
-- dashboard, where a code is mailed and the user confirms. Forcing
-- two different emails at bootstrap just confused founders ("which
-- one is the school one?") with no security benefit.
--
-- Fix (committed with user, 2026-06-04)
-- -------------------------------------
-- The user said clearly: don't ask for a school email at creation;
-- ask for it on the claim side. This migration:
--   1) Forwards the founder's account email as institutional_email
--      when the bootstrap RPC submits its (optional) claim. The
--      bootstrap-path presence check passes silently.
--   2) Makes the claim submission OPTIONAL — when p_position_title
--      is null/empty/missing, we skip submit_claim_v2 entirely and
--      return claim_id = NULL. The founder is still inserted as a
--      regular class member with no exec powers. They can submit a
--      claim later via ClaimSubmitPage (which already asks for the
--      institutional email if they want a verified school one — G5b
--      autofill from user.email + optional override).
--
-- bootstrap_class_with_rep additionally relaxes its position_title
-- "required" gate so founders who untick the claim toggle can still
-- create a class for their own use.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1) bootstrap_department_with_class (replaces mig 100)
-- ════════════════════════════════════════════════════════════
-- Same signature as mig 100 (no p_is_staff — Office concept gone).
-- Differences from mig 100:
--   • institutional_email forwarded as v_email_norm
--   • claim submission gated on TRIM(p_position_title) <> ''
DROP FUNCTION IF EXISTS public.bootstrap_department_with_class(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

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

  -- ── Uniqueness ──
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

  -- ── Insert class ──
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count, levels
  ) VALUES (
    v_org_id, v_class_name, v_class_short, 'class', v_dept_id, TRUE, 0,
    CASE WHEN v_level IS NOT NULL THEN ARRAY[v_level] ELSE NULL END
  )
  RETURNING id INTO v_class_id;

  -- ── Founder lands in the class ──
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

  -- ── Optional claim (G5c "wantsClaim" toggle).
  -- If the founder didn't supply a position title, they're a regular
  -- class member; no claim is filed. If they DID supply one, we
  -- forward v_email_norm as institutional_email so the bootstrap-
  -- path presence check in submit_claim_v2 (mig 042/101) passes
  -- without us having to ask for a "second school email" at create
  -- time. The real ownership verification is the post-bootstrap
  -- VerifyEmailPage code flow. ──
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
    'claim_id',              v_claim_id,                   -- NULL when no claim filed
    'org_id',                v_org_id,
    'org_slug',              v_org_slug,
    'bootstrap_path',        COALESCE((v_claim->>'bootstrap_path')::BOOLEAN, FALSE),
    'votes_required',        COALESCE((v_claim->>'votes_required')::INTEGER, 0)
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
-- 2) bootstrap_class_with_rep (replaces mig 080's version)
-- ════════════════════════════════════════════════════════════
-- Same signature. Differences:
--   • position_title is now OPTIONAL (drops mig 080's "Your role
--     title is required" check) — matches the "claim a role"
--     opt-in toggle on AddDepartmentPage.
--   • When position is provided, forward v_email_norm as
--     institutional_email.
--   • When position is empty, skip the claim entirely.
DROP FUNCTION IF EXISTS public.bootstrap_class_with_rep(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

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
  -- NOTE: position_title is OPTIONAL in mig 105. mig 080 required
  -- it; that broke the wantsClaim=false path of the wizard.

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

  -- Optional claim — same opt-in logic as the dept RPC above.
  IF v_position IS NOT NULL THEN
    v_claim := public.submit_claim_v2(
      v_member_id,
      'group_admin',
      'group',
      v_class_id,
      v_position,
      NULL,           -- phone
      v_email_norm,   -- personal email
      v_email_norm,   -- institutional email
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
    'class_id',              v_class_id,
    'member_id',             v_member_id,
    'member_login_id',       v_member_norm,
    'claim_id',              v_claim_id,
    'org_id',                v_org_id,
    'org_slug',              v_org_slug,
    'bootstrap_path',        COALESCE((v_claim->>'bootstrap_path')::BOOLEAN, FALSE),
    'votes_required',        COALESCE((v_claim->>'votes_required')::INTEGER, 0)
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
  RAISE NOTICE 'Migration 105 complete: bootstrap RPCs no longer ask for a separate school email; claim is opt-in.';
END $$;

COMMIT;
