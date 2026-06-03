-- ============================================================
-- Migration 090: exec eligibility constraints
--
-- Strategic rules the product asked for:
--
--   1. A student CANNOT be both a department exec AND a faculty exec
--      at the same time (within the same org). Two unit-scope roles
--      conflict — the person can't simultaneously serve their dept
--      AND the wider faculty without divided loyalty.
--
--   2. A student MUST be a member of a class WITHIN a department to
--      become that department's exec. (You can't run a class you
--      don't belong to.)
--
--   3. A student CAN be a faculty exec while sitting in any class /
--      department under that faculty (or no class at all). Faculty
--      exec is the umbrella role; class membership doesn't constrain
--      it the way it does for the dept exec.
--
-- Where these are enforced:
--   • At CLAIM SUBMISSION   — claim_requests gets a BEFORE INSERT
--     trigger that rejects ineligible claims with a clear error code.
--     This is the primary gate. The /claim form will surface the
--     error message inline.
--   • At ADMIN INSERTION    — member_admins gets the same trigger so
--     a platform admin trying to bypass via direct insert is also
--     blocked. Defense in depth.
--
-- Returns from the validators are exposed in jsonb error codes so the
-- UI can map them to friendly toast copy:
--   conflict_dept_faculty  — already exec at the other tier
--   not_in_dept            — claimed dept but not a member of any
--                             class under it
-- ============================================================

BEGIN;

-- ── Helper: is the member's current group inside this dept? ──────
-- "Inside" here means their organization_members.group_id either IS
-- the dept itself OR is one of the dept's direct children (classes).
-- We don't need full ancestor walking for this — dept exec eligibility
-- is one tier deep by definition.
CREATE OR REPLACE FUNCTION public._member_belongs_to_dept(
  p_member_id UUID,
  p_dept_id   UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_member_group UUID;
BEGIN
  SELECT group_id INTO v_member_group
  FROM public.organization_members
  WHERE id = p_member_id;

  IF v_member_group IS NULL THEN RETURN FALSE; END IF;
  IF v_member_group = p_dept_id THEN RETURN TRUE; END IF;

  -- Class under the dept?
  RETURN EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE id = v_member_group AND parent_group_id = p_dept_id
  );
END;
$$;

-- ── Helper: does this member already hold a verified or pending
-- exec record at the OTHER unit tier? "Other tier" =
--   dept claim ↔ faculty admin/claim
--   faculty claim ↔ dept admin/claim
-- We classify by group kind / position in the hierarchy.
CREATE OR REPLACE FUNCTION public._has_conflicting_unit_role(
  p_member_id   UUID,
  p_org_id      UUID,
  p_target_kind TEXT      -- 'dept' or 'faculty'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Check existing member_admins at the opposite tier
  IF p_target_kind = 'dept' THEN
    -- target is dept → conflict if an active faculty admin exists
    SELECT COUNT(*) INTO v_count
    FROM public.member_admins ma
    JOIN public.organization_groups g ON g.id = ma.group_id
    WHERE ma.member_id = p_member_id
      AND ma.organization_id = p_org_id
      AND ma.is_active = TRUE
      AND ma.scope_level = 'unit'
      AND (
        LOWER(COALESCE(g.kind, '')) IN ('faculty', 'college')
        OR g.parent_group_id IS NULL
      );
  ELSE
    -- target is faculty → conflict if an active dept admin exists
    SELECT COUNT(*) INTO v_count
    FROM public.member_admins ma
    JOIN public.organization_groups g ON g.id = ma.group_id
    WHERE ma.member_id = p_member_id
      AND ma.organization_id = p_org_id
      AND ma.is_active = TRUE
      AND ma.scope_level = 'unit'
      AND LOWER(COALESCE(g.kind, '')) NOT IN ('faculty', 'college')
      AND g.parent_group_id IS NOT NULL;
  END IF;
  IF v_count > 0 THEN RETURN TRUE; END IF;

  -- Same check against pending claims (so a person can't queue both
  -- claims at once and have one promote past the other quietly).
  IF p_target_kind = 'dept' THEN
    SELECT COUNT(*) INTO v_count
    FROM public.claim_requests cr
    JOIN public.organization_groups g
      ON g.id = COALESCE(cr.claimed_unit_group_id, cr.claimed_group_id)
    WHERE cr.claimant_user_id = p_member_id
      AND cr.organization_id  = p_org_id
      AND cr.status IN ('submitted', 'awaiting_votes', 'under_review', 'votes_complete')
      AND cr.claimed_scope = 'unit'
      AND (
        LOWER(COALESCE(g.kind, '')) IN ('faculty', 'college')
        OR g.parent_group_id IS NULL
      );
  ELSE
    SELECT COUNT(*) INTO v_count
    FROM public.claim_requests cr
    JOIN public.organization_groups g
      ON g.id = COALESCE(cr.claimed_unit_group_id, cr.claimed_group_id)
    WHERE cr.claimant_user_id = p_member_id
      AND cr.organization_id  = p_org_id
      AND cr.status IN ('submitted', 'awaiting_votes', 'under_review', 'votes_complete')
      AND cr.claimed_scope = 'unit'
      AND LOWER(COALESCE(g.kind, '')) NOT IN ('faculty', 'college')
      AND g.parent_group_id IS NOT NULL;
  END IF;

  RETURN v_count > 0;
END;
$$;

-- ── Validator (used by both triggers) ─────────────────────────────
-- Returns NULL when the claim/insert is eligible, or an error code
-- when it isn't. Callers raise EXCEPTION with the code so PostgREST
-- surfaces it cleanly to the client.
CREATE OR REPLACE FUNCTION public._validate_exec_eligibility(
  p_member_id     UUID,
  p_org_id        UUID,
  p_scope         TEXT,
  p_target_group  UUID
)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind         TEXT;
  v_parent       UUID;
  v_target_kind  TEXT;  -- 'dept' or 'faculty' for branching
BEGIN
  -- Only unit-scope claims/admins have hierarchy constraints.
  -- Group-scope (class rep) and org-scope (org owner) are unrelated.
  IF p_scope <> 'unit' OR p_target_group IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT kind, parent_group_id INTO v_kind, v_parent
  FROM public.organization_groups
  WHERE id = p_target_group;

  IF v_kind IS NULL AND v_parent IS NULL THEN
    -- Target group not found — let the caller surface that separately.
    RETURN NULL;
  END IF;

  v_target_kind := CASE
    WHEN LOWER(COALESCE(v_kind, '')) IN ('faculty', 'college') THEN 'faculty'
    WHEN v_parent IS NULL THEN 'faculty'
    ELSE 'dept'
  END;

  -- Rule 1: cross-tier conflict
  IF public._has_conflicting_unit_role(p_member_id, p_org_id, v_target_kind) THEN
    RETURN 'conflict_dept_faculty';
  END IF;

  -- Rule 2: dept exec must be a member of a class within the dept
  IF v_target_kind = 'dept' AND NOT public._member_belongs_to_dept(p_member_id, p_target_group) THEN
    RETURN 'not_in_dept';
  END IF;

  -- Faculty execs: no membership constraint (rule 3).
  RETURN NULL;
END;
$$;

-- ── Trigger on claim_requests ─────────────────────────────────────
CREATE OR REPLACE FUNCTION public._enforce_claim_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_err   TEXT;
  v_group UUID;
BEGIN
  v_group := COALESCE(NEW.claimed_unit_group_id, NEW.claimed_group_id);
  v_err := public._validate_exec_eligibility(
    NEW.claimant_user_id,
    NEW.organization_id,
    COALESCE(NEW.claimed_scope, 'group'),
    v_group
  );
  IF v_err IS NOT NULL THEN
    RAISE EXCEPTION 'EXEC_ELIGIBILITY: %', v_err
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_claim_eligibility ON public.claim_requests;
CREATE TRIGGER trg_enforce_claim_eligibility
  BEFORE INSERT ON public.claim_requests
  FOR EACH ROW
  EXECUTE FUNCTION public._enforce_claim_eligibility();

-- ── Trigger on member_admins ──────────────────────────────────────
-- Same validator on the destination table. Catches direct inserts
-- (e.g. a platform admin script) that bypass the claim path.
CREATE OR REPLACE FUNCTION public._enforce_member_admin_eligibility()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_err TEXT;
BEGIN
  -- Only validate fresh active rows. Promotions / status updates
  -- shouldn't re-fire this — once you're an admin, you're an admin.
  IF TG_OP = 'INSERT' AND NEW.is_active = TRUE THEN
    v_err := public._validate_exec_eligibility(
      NEW.member_id,
      NEW.organization_id,
      COALESCE(NEW.scope_level, 'group'),
      NEW.group_id
    );
    IF v_err IS NOT NULL THEN
      RAISE EXCEPTION 'EXEC_ELIGIBILITY: %', v_err
        USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_member_admin_eligibility ON public.member_admins;
CREATE TRIGGER trg_enforce_member_admin_eligibility
  BEFORE INSERT ON public.member_admins
  FOR EACH ROW
  EXECUTE FUNCTION public._enforce_member_admin_eligibility();

COMMIT;
