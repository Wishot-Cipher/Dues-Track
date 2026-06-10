-- ============================================================
-- Migration 118: Drop the dept↔faculty cross-tier conflict rule
-- (fixes "EXEC_ELIGIBILITY: conflict_dept_faculty" blocking claims +
-- handover acceptance).
--
-- The old rule (mig 090) rejected anyone holding/claiming a DEPARTMENT
-- unit role if they already held a FACULTY unit role, and vice versa —
-- to prevent cross-tier power concentration.
--
-- Why we're relaxing it
-- ---------------------
-- With tier autonomy now fully in place, every exec role manages ONLY
-- its own tier's dues + members (a dept exec can't touch faculty or
-- class money, and vice versa). So one person legitimately holding a
-- dept role AND a faculty role is no different from holding two
-- unrelated mandates — each is independently verified and independently
-- scoped. Meanwhile the rule was blocking real handovers: accepting a
-- successor nomination raised conflict_dept_faculty and the incoming
-- exec was stuck.
--
-- What we KEEP
-- ------------
--   • Rule 2 (not_in_dept): a department exec must still be a member of
--     a class within that department — that's a real integrity rule.
--   • Same-target duplicate prevention stays handled elsewhere.
-- We only drop Rule 1 (the cross-tier conflict).
-- ============================================================

BEGIN;

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
  IF p_scope <> 'unit' OR p_target_group IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT kind, parent_group_id INTO v_kind, v_parent
  FROM public.organization_groups
  WHERE id = p_target_group;

  IF v_kind IS NULL AND v_parent IS NULL THEN
    RETURN NULL;
  END IF;

  v_target_kind := CASE
    WHEN LOWER(COALESCE(v_kind, '')) IN ('faculty', 'college') THEN 'faculty'
    WHEN v_parent IS NULL THEN 'faculty'
    ELSE 'dept'
  END;

  -- Rule 1 (cross-tier dept↔faculty conflict) REMOVED — see migration
  -- header. Holding both a dept and a faculty role is allowed now that
  -- each role is strictly own-tier scoped.

  -- Rule 2: a department exec must be a member of a class within the
  -- department (kept — genuine integrity constraint).
  IF v_target_kind = 'dept' AND NOT public._member_belongs_to_dept(p_member_id, p_target_group) THEN
    RETURN 'not_in_dept';
  END IF;

  RETURN NULL;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'Migration 118 applied: dept<->faculty cross-tier conflict dropped; handovers + multi-tier claims no longer blocked. Dept-membership rule retained.';
END $$;

COMMIT;
