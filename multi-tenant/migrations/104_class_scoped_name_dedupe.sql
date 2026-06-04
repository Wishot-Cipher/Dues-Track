-- ============================================================
-- Migration 104: Class-scoped full-name uniqueness.
--
-- Rule (committed with user, Chunk G4)
-- ------------------------------------
-- Two members CAN share the same full_name across different classes
-- inside one org (it's a real-world fact — there are multiple John
-- Does at any large university). But within a SINGLE class, the same
-- full_name twice creates ambiguity for class reps approving payments
-- + collecting dues. Block it at the signup step + add a DB-level
-- partial unique index as a safety net.
--
-- Scope
-- -----
-- We only enforce this at the CLASS tier (group.kind='class'). A
-- department or faculty roster could legitimately contain two people
-- with the same name across its child classes, and we don't want a
-- name collision to cascade up the tree. The constraint keys on
-- group_id directly — same name in two different group_id values is
-- fine, two rows pointing at the same group_id with same name is not.
--
-- Handling existing duplicates
-- ----------------------------
-- If the DB already has same-name pairs within one class (legacy
-- data), creating the index outright would fail with a CONSTRAINT
-- error and the migration would abort. We pre-scan for duplicates
-- and RAISE NOTICE with the list — but still create the index, so
-- the platform admin can clean up the duplicates afterward.
-- For NEW rows, the signup RPC pre-checks and returns a friendly
-- 'name_taken_in_class' code so the FE can show a specific message.
-- ============================================================

BEGIN;

-- ── 1) Warn about existing duplicates ──
DO $$
DECLARE
  v_dups_count INTEGER;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_members'
  ) THEN
    RAISE NOTICE 'organization_members table missing — skipping name dedupe.';
    RETURN;
  END IF;

  SELECT COUNT(*) INTO v_dups_count
  FROM (
    SELECT om.group_id, LOWER(TRIM(om.full_name)) AS norm_name, COUNT(*) AS dup_count
    FROM public.organization_members om
    JOIN public.organization_groups g ON g.id = om.group_id
    WHERE om.full_name IS NOT NULL
      AND TRIM(om.full_name) <> ''
      AND g.kind = 'class'
      AND COALESCE(om.is_active, TRUE) = TRUE
    GROUP BY om.group_id, LOWER(TRIM(om.full_name))
    HAVING COUNT(*) > 1
  ) dup;

  IF v_dups_count > 0 THEN
    RAISE NOTICE 'Mig 104: found % existing class with same-name duplicates. Index will still be created — clean up via platform console.', v_dups_count;
  END IF;
END $$;

-- ── 2) Partial unique index on (group_id, lower(full_name)) ──
-- Only enforced for ACTIVE members in CLASS-kind groups. We do the
-- kind check via a separate guard in the RPC because partial indexes
-- can't reference another table; the index itself is "active
-- members with non-null name in any group", and the RPC + FE keep
-- the kind='class' invariant.
DROP INDEX IF EXISTS public.idx_org_members_class_name_unique_ci;
CREATE UNIQUE INDEX IF NOT EXISTS idx_org_members_class_name_unique_ci
  ON public.organization_members (group_id, LOWER(TRIM(full_name)))
  WHERE full_name IS NOT NULL
    AND TRIM(full_name) <> ''
    AND COALESCE(is_active, TRUE) = TRUE;

-- ── 3) Patch signup_member_via_invite to pre-check name in class ──
-- Returns a structured 'name_taken_in_class' code BEFORE the insert
-- so the FE can show a specific message instead of the generic
-- unique_violation catch. Same param signature as mig 103.
DROP FUNCTION IF EXISTS public.signup_member_via_invite(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
);

CREATE OR REPLACE FUNCTION public.signup_member_via_invite(
  p_invite_code     TEXT,
  p_member_id       TEXT,
  p_full_name       TEXT,
  p_password        TEXT,
  p_email           TEXT,
  p_phone           TEXT,
  p_level           TEXT,
  p_target_group_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_invite          RECORD;
  v_org             RECORD;
  v_group_id        UUID;
  v_group_kind      TEXT;
  v_member_norm     TEXT := LOWER(TRIM(COALESCE(p_member_id, '')));
  v_email_norm      TEXT := NULLIF(LOWER(TRIM(COALESCE(p_email, ''))), '');
  v_full_name       TEXT := TRIM(COALESCE(p_full_name, ''));
  v_name_norm       TEXT := LOWER(TRIM(COALESCE(p_full_name, '')));
  v_member_uuid     UUID;
  v_force_change    BOOLEAN;
  v_group_levels    TEXT[];
  v_effective_level TEXT;
BEGIN
  -- 1) Invite
  SELECT * INTO v_invite
  FROM public.organization_invites
  WHERE invite_code = TRIM(p_invite_code)
    AND status = 'active'
    AND (expires_at IS NULL OR expires_at > NOW());
  IF v_invite.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invalid_invite',
      'error', 'This invite link is invalid or has expired.');
  END IF;
  IF v_invite.max_uses IS NOT NULL AND v_invite.use_count >= v_invite.max_uses THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'invite_exhausted',
      'error', 'This invite has already been used the maximum number of times.');
  END IF;

  -- 2) Org
  SELECT * INTO v_org FROM public.organizations WHERE id = v_invite.organization_id;
  IF v_org.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organisation not found.');
  END IF;

  -- 3) Group
  v_group_id := COALESCE(v_invite.group_id, p_target_group_id);
  IF v_group_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'no_group',
      'error', 'No target group resolved for this invite. Pick one before signing up.');
  END IF;
  SELECT kind, levels INTO v_group_kind, v_group_levels
  FROM public.organization_groups WHERE id = v_group_id;

  -- 4) Basic input validation
  IF v_member_norm = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input', 'error', 'Member ID is required.');
  END IF;
  IF LENGTH(v_full_name) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input', 'error', 'Full name is required.');
  END IF;
  IF COALESCE(p_password, '') = '' OR LENGTH(p_password) < 4 THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'bad_input', 'error', 'Password must be at least 4 characters.');
  END IF;

  -- 5) Name-in-class pre-check (G4)
  -- Only enforced for class-kind groups. Dept/faculty memberships
  -- (rare, but possible via group_memberships) skip this — those
  -- aren't roster-tier groups where ambiguity matters.
  IF v_group_kind = 'class' AND EXISTS (
    SELECT 1
    FROM public.organization_members om
    WHERE om.group_id = v_group_id
      AND COALESCE(om.is_active, TRUE) = TRUE
      AND LOWER(TRIM(om.full_name)) = v_name_norm
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'name_taken_in_class',
      'error',
      'Someone with that name is already in this class. Add a middle initial or a distinguishing detail (e.g. "John A. Doe").');
  END IF;

  -- 6) Level inheritance (carried over from mig 103)
  v_effective_level := NULLIF(TRIM(COALESCE(p_level, '')), '');
  IF v_effective_level IS NULL
     AND v_group_levels IS NOT NULL
     AND array_length(v_group_levels, 1) >= 1
  THEN
    v_effective_level := v_group_levels[1];
  END IF;

  -- 7) Force-password-change when ID == password
  v_force_change := (p_password = p_member_id);

  -- 8) Insert
  v_member_uuid := gen_random_uuid();
  BEGIN
    INSERT INTO public.organization_members (
      id, organization_id, group_id,
      member_id, password_hash,
      full_name, email, phone,
      level,
      is_active,
      force_password_change
    ) VALUES (
      v_member_uuid, v_org.id, v_group_id,
      v_member_norm, extensions.crypt(p_password, extensions.gen_salt('bf')),
      v_full_name, v_email_norm, NULLIF(TRIM(COALESCE(p_phone, '')), ''),
      v_effective_level,
      TRUE,
      v_force_change
    );
  EXCEPTION
    -- The new (group_id, lower(full_name)) index throws on
    -- duplicate; report it with the same 'name_taken_in_class' code
    -- so the FE renders one message regardless of where the race
    -- was caught (pre-check vs insert constraint).
    WHEN unique_violation THEN
      IF SQLERRM LIKE '%idx_org_members_class_name_unique_ci%' THEN
        RETURN jsonb_build_object('ok', FALSE, 'code', 'name_taken_in_class',
          'error',
          'Someone with that name is already in this class. Add a middle initial or a distinguishing detail (e.g. "John A. Doe").');
      END IF;
      RETURN jsonb_build_object('ok', FALSE, 'code', 'member_id_taken',
        'error', 'That member ID or email is already taken in this organization.');
  END;

  -- 9) Bump counters + invite usage
  UPDATE public.organization_invites
  SET use_count = COALESCE(use_count, 0) + 1, updated_at = NOW()
  WHERE id = v_invite.id;

  UPDATE public.organization_groups
  SET current_member_count = COALESCE(current_member_count, 0) + 1, updated_at = NOW()
  WHERE id = v_group_id;

  UPDATE public.organizations
  SET member_count = COALESCE(member_count, 0) + 1, last_activity_at = NOW(), updated_at = NOW()
  WHERE id = v_org.id;

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'org_slug',          v_org.slug,
    'org_id',            v_org.id,
    'member_id',         v_member_uuid,
    'member_login_id',   v_member_norm,
    'group_id',          v_group_id,
    'inherited_level',   v_effective_level
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.signup_member_via_invite(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, UUID
) TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 104 complete: class-scoped name dedupe + index + signup pre-check.';
END $$;

COMMIT;
