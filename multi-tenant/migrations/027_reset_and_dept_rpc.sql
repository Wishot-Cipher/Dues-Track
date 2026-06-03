-- ============================================================
-- Migration 027: Reset previous orgs + add department-in-faculty RPC
--
-- ⚠️ DESTRUCTIVE FIRST SECTION:
-- Deletes every existing organization (and everything that
-- cascades from it — groups, members, payments, etc.) so we
-- have a clean slate matching the new hierarchical flow:
--   organization → faculty → department/class
--
-- Use this when your test data has orphan organizations with no
-- proper faculty/department structure. After running this you
-- should run 026 (the Nigerian seeds) and then test the flow
-- from /bring-school again.
--
-- ── SAFE second section: RPC add_department_to_faculty()
-- Atomic creation of a department inside an existing faculty.
-- Takes the founder's auth details + dept info, creates:
--   1. organization_groups row (kind='department', parent=faculty)
--   2. organization_members row (the founder)
--   3. member_admins row (founder = pending exec, scope=group)
-- Returns the same shape as bring_school_online for consistency.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PART 1 — Clean slate
-- ════════════════════════════════════════════════════════════

-- platform_earnings has RESTRICT on FK to payments → wipe first
DELETE FROM public.platform_earnings;

-- claim_votes → claim_requests cascade naturally; do them
-- explicitly to be safe in case something references org_id
DELETE FROM public.claim_votes;
DELETE FROM public.claim_requests;

-- organization_requests references seed and org
DELETE FROM public.organization_requests;

-- executive_invite_codes cascades from org, but be explicit
DELETE FROM public.executive_invite_codes;

-- Reset seed linkage so seeds re-appear as "Not yet on Payvexo"
UPDATE public.seed_institutions
SET linked_org_id = NULL,
    is_active     = FALSE,
    updated_at    = NOW()
WHERE linked_org_id IS NOT NULL;

-- The big one — this cascades to:
--   organization_groups, organization_members, member_admins,
--   organization_settings, payments, payment_types, expenses,
--   expense_categories, notifications, audit_logs (SET NULL),
--   academic_sessions, academic_terms, class_progression_policies,
--   promotion_runs, promotion_decisions
DELETE FROM public.organizations;

-- Verify nothing leaked
DO $$
DECLARE
  org_count INTEGER;
  group_count INTEGER;
  member_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO org_count    FROM public.organizations;
  SELECT COUNT(*) INTO group_count  FROM public.organization_groups;
  SELECT COUNT(*) INTO member_count FROM public.organization_members;
  RAISE NOTICE 'Clean slate:';
  RAISE NOTICE '  organizations:        %', org_count;
  RAISE NOTICE '  organization_groups:  %', group_count;
  RAISE NOTICE '  organization_members: %', member_count;
END $$;

-- ════════════════════════════════════════════════════════════
-- PART 2 — RPC: add_department_to_faculty()
-- ════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.add_department_to_faculty(
  -- Resolution
  p_org_slug              TEXT,
  p_faculty_short_name    TEXT,

  -- The department
  p_department_name       TEXT,
  p_department_short_name TEXT,
  p_department_kind       TEXT,   -- 'department' | 'class' | 'general'

  -- Founder identity (the person creating this department)
  p_full_name             TEXT,
  p_email                 TEXT,
  p_phone                 TEXT,
  p_member_number         TEXT,
  p_password              TEXT,
  p_user_level            TEXT
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
  v_group_id      UUID;
  v_member_id     UUID;
  v_email_norm    TEXT := LOWER(TRIM(p_email));
  v_member_norm   TEXT := LOWER(TRIM(p_member_number));
BEGIN
  -- ── Validate ──
  IF p_org_slug IS NULL OR LENGTH(TRIM(p_org_slug)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization is missing.');
  END IF;
  IF p_faculty_short_name IS NULL OR LENGTH(TRIM(p_faculty_short_name)) < 1 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Faculty is missing.');
  END IF;
  IF p_department_name IS NULL OR LENGTH(TRIM(p_department_name)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Department name must be at least 2 characters.');
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

  -- ── Resolve org + faculty ──
  SELECT id, slug INTO v_org_id, v_org_slug
  FROM public.organizations
  WHERE slug = LOWER(TRIM(p_org_slug))
    AND is_active = TRUE;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization not found.');
  END IF;

  SELECT id, short_name INTO v_faculty_id, v_faculty_short
  FROM public.organization_groups
  WHERE organization_id = v_org_id
    AND LOWER(short_name) = LOWER(TRIM(p_faculty_short_name))
    AND kind = 'faculty'
    AND is_active = TRUE;
  IF v_faculty_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Faculty not found in this organization.');
  END IF;

  -- ── Uniqueness checks ──
  IF EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id
      AND LOWER(short_name) = LOWER(TRIM(p_department_short_name))
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'A department with that short name already exists in this organization.');
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE organization_id = v_org_id
      AND (LOWER(member_id) = v_member_norm OR LOWER(email) = v_email_norm)
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'A member with that ID or email already exists in this organization. Try signing in instead.');
  END IF;

  -- ── 1) Create the department ──
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id,
    is_active, current_member_count
  ) VALUES (
    v_org_id,
    TRIM(p_department_name),
    COALESCE(NULLIF(p_department_short_name,''), UPPER(LEFT(REGEXP_REPLACE(p_department_name, '[^a-zA-Z]', '', 'g'), 5))),
    COALESCE(p_department_kind, 'department'),
    v_faculty_id,
    TRUE, 1
  )
  RETURNING id INTO v_group_id;

  -- ── 2) Create the founder member ──
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
    p_user_level,
    TRUE,
    FALSE
  );

  -- ── 3) Make them the founding admin of the new department ──
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
    v_member_id, v_org_id, v_group_id,
    'org_owner', 'Founder', 'group',
    TRUE, TRUE, TRUE, TRUE,
    TRUE, TRUE, TRUE, TRUE,
    'pending', 'member_vote',
    TRUE,
    'Founding member of this department.'
  );

  -- ── 4) Update counters on the parent faculty + org ──
  UPDATE public.organization_groups
  SET current_member_count = COALESCE(current_member_count, 0) + 1,
      updated_at = NOW()
  WHERE id = v_faculty_id;

  UPDATE public.organizations
  SET member_count    = COALESCE(member_count, 0) + 1,
      last_activity_at = NOW(),
      updated_at      = NOW()
  WHERE id = v_org_id;

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'org_id',            v_org_id,
    'slug',              v_org_slug,
    'faculty_id',        v_faculty_id,
    'faculty_short',     v_faculty_short,
    'group_id',          v_group_id,
    'group_short',       COALESCE(NULLIF(p_department_short_name,''), UPPER(LEFT(REGEXP_REPLACE(p_department_name, '[^a-zA-Z]', '', 'g'), 5))),
    'member_id',         v_member_id,
    'member_login_id',   v_member_norm
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'A department or member with that identifier already exists.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Could not create the department: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.add_department_to_faculty(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 027 complete: clean slate + add_department_to_faculty() RPC ready.';
  RAISE NOTICE 'Next steps:';
  RAISE NOTICE '  1. Run 026 to seed Nigerian institutions.';
  RAISE NOTICE '  2. Visit / and use Bring-my-school to create a fresh org.';
END $$;

COMMIT;
