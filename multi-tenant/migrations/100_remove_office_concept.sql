-- ============================================================
-- Migration 100: Remove the "Office" concept from bootstrap.
--
-- Background
-- ----------
-- Mig 098 forced every dept founder into a class, but mig 099 left a
-- staff escape hatch: p_is_staff=TRUE auto-created an "Office" class
-- and parked the founder there. That re-introduced the same bug —
-- staff founders couldn't later join their REAL class without being
-- told their ID was already taken in the org. The "Office" buckets
-- also polluted the audit/manage UI: a dept with three real classes
-- + one phantom "Office" class drifts the dept's member count and
-- shows up everywhere we display the class roster.
--
-- The new rule (committed with user, 2026-06-04): every founder
-- picks a real class on bootstrap. No exceptions. Staff founders who
-- legitimately have no class can pick whatever class their dept
-- chooses to label them under (or the dept admin invites them later
-- via a real class).
--
-- What this migration does
-- ------------------------
-- 1. Drops bootstrap_department_with_class(...,p_is_staff).
-- 2. Recreates it without p_is_staff — class name + short code are
--    REQUIRED. The Office auto-naming branch is gone.
-- 3. Adds move_member_to_class(p_member_id, p_target_class_id) so
--    legacy Office members can fix themselves via a one-time
--    dashboard gate (`is_staff_office=TRUE` still flags those groups
--    so the FE can detect "you're parked, please pick a real
--    class"). We do NOT drop is_staff_office yet — it's the gate
--    signal until the data is clean.
-- 4. Leaves existing Office classes in place. Deleting them would
--    orphan payments + dues. They sit empty after members move; a
--    later migration can sweep empties out.
-- ============================================================

BEGIN;

-- ── 1) Drop the old signature ──
DROP FUNCTION IF EXISTS public.bootstrap_department_with_class(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, BOOLEAN
);

-- ── 2) New signature: class info is REQUIRED ──
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

  -- ── Uniqueness: dept short code + class short code + member id ──
  IF EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id
      AND UPPER(short_name) = v_dept_short
      AND kind = 'department'
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'dept_exists', 'error',
      'A department with that short code already exists in this organisation.');
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

  -- ── Insert dept ──
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
  ) VALUES (
    v_org_id, TRIM(p_dept_name), v_dept_short, 'department', v_faculty_id, TRUE, 0
  )
  RETURNING id INTO v_dept_id;

  -- ── Insert class. Always a REAL class, never auto-Office.
  --    is_staff_office stays FALSE — the column exists only as the
  --    transitional gate signal for legacy Office members. ──
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

  -- ── Submit the dept-tier claim (unit scope) ──
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
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role;

-- ── 3) move_member_to_class: lets a member fix a legacy Office
--    parking (or any wrong class) by selecting a real class in
--    their org. Used by the dashboard gate. Counters on both groups
--    are kept in step. ──
CREATE OR REPLACE FUNCTION public.move_member_to_class(
  p_member_id      UUID,
  p_target_class_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org        UUID;
  v_old_group  UUID;
  v_t_org      UUID;
  v_t_kind     TEXT;
  v_t_office   BOOLEAN;
BEGIN
  IF p_member_id IS NULL OR p_target_class_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member and target class are required.');
  END IF;

  SELECT organization_id, group_id INTO v_org, v_old_group
  FROM public.organization_members WHERE id = p_member_id;
  IF v_org IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found.');
  END IF;

  SELECT organization_id, kind, COALESCE(is_staff_office, FALSE)
  INTO v_t_org, v_t_kind, v_t_office
  FROM public.organization_groups WHERE id = p_target_class_id;
  IF v_t_org IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Target class not found.');
  END IF;
  IF v_t_org <> v_org THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Target class is in a different organisation.');
  END IF;
  IF v_t_kind <> 'class' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Target must be a class, not a department or faculty.');
  END IF;
  IF v_t_office THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Pick a real class, not an Office bucket.');
  END IF;
  IF v_old_group = p_target_class_id THEN
    RETURN jsonb_build_object('ok', TRUE, 'no_change', TRUE);
  END IF;

  -- Move
  UPDATE public.organization_members
  SET group_id = p_target_class_id, updated_at = NOW()
  WHERE id = p_member_id;

  -- Counters
  IF v_old_group IS NOT NULL THEN
    UPDATE public.organization_groups
    SET current_member_count = GREATEST(0, COALESCE(current_member_count, 1) - 1),
        updated_at = NOW()
    WHERE id = v_old_group;
  END IF;
  UPDATE public.organization_groups
  SET current_member_count = COALESCE(current_member_count, 0) + 1,
      updated_at = NOW()
  WHERE id = p_target_class_id;

  RETURN jsonb_build_object('ok', TRUE, 'old_group_id', v_old_group, 'new_group_id', p_target_class_id);
END;
$$;
GRANT EXECUTE ON FUNCTION public.move_member_to_class(UUID, UUID)
  TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 100 complete: Office removed from bootstrap; move_member_to_class added.';
END $$;

COMMIT;
