-- ============================================================
-- Migration 021: Faculty / Department Autonomy (Group Scoping)
--
-- Goal:
-- Enforce the rule the user emphasized: an admin's view is scoped
-- to THEIR faculty / department only. An org-wide admin (President,
-- Treasurer) sees everything in the org. A faculty admin sees only
-- their faculty and the classes under it. A class rep sees ONLY
-- their class — they cannot peek at another class's payments,
-- payment types, members, or expenses.
--
-- How it works:
--
-- 1. A new helper `can_access_group(group_id)` returns TRUE when
--    the caller's admin scope includes the given group:
--      • Platform admin       → always TRUE
--      • scope_level='org'    → always TRUE within the same org
--      • scope_level='unit'   → TRUE if target group is the unit
--                               itself OR a child of it
--      • scope_level='group'  → TRUE only if target == admin's group
--
-- 2. RESTRICTIVE RLS policies are layered on top of the existing
--    permissive policies (from mig 004 & 007). Restrictive policies
--    AND with all permissive ones, so a row is visible only if BOTH
--    the original "same org" check AND the new "in your scope"
--    check pass.
--
-- 3. Members ALWAYS see their own rows (payments, notifications,
--    membership) regardless of scope — the restrictive policy
--    explicitly allows the self path.
--
-- This migration is additive. Existing org-wide policies remain
-- in place; the new layer just narrows the visibility for
-- scope-restricted admins.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) Helper: can_access_group(group_id)
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_access_group(p_group_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_target_org_id UUID;
  v_target_parent_id UUID;
  v_admin RECORD;
BEGIN
  -- Platform admins see everything
  IF public.is_platform_admin() THEN
    RETURN TRUE;
  END IF;

  -- Service role bypasses (Edge Functions)
  IF auth.role() = 'service_role' THEN
    RETURN TRUE;
  END IF;

  -- Unscoped lookup (NULL group_id is treated as org-wide;
  -- only org-wide admins can access)
  IF p_group_id IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.is_active = TRUE
        AND ma.scope_level = 'org'
        AND ma.verification_status IN (
          'email_verified','member_confirmed','document_verified','admin_verified'
        )
    );
  END IF;

  -- Find the target group's org and parent (single lookup)
  SELECT organization_id, parent_group_id
    INTO v_target_org_id, v_target_parent_id
  FROM public.organization_groups
  WHERE id = p_group_id;

  IF v_target_org_id IS NULL THEN
    RETURN FALSE;
  END IF;

  -- Look at every active admin row the caller has for this org
  FOR v_admin IN
    SELECT scope_level, group_id AS admin_group_id
    FROM public.member_admins
    WHERE member_id::text = auth.uid()::text
      AND organization_id = v_target_org_id
      AND is_active = TRUE
      AND verification_status IN (
        'email_verified','member_confirmed','document_verified','admin_verified'
      )
  LOOP
    -- Org-wide admin
    IF v_admin.scope_level = 'org' THEN
      RETURN TRUE;
    END IF;

    -- Exact group match (class admin viewing their own class)
    IF v_admin.admin_group_id = p_group_id THEN
      RETURN TRUE;
    END IF;

    -- Unit (faculty) admin viewing a child class
    IF v_admin.scope_level = 'unit' AND v_target_parent_id = v_admin.admin_group_id THEN
      RETURN TRUE;
    END IF;
  END LOOP;

  RETURN FALSE;
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.can_access_group(UUID) TO authenticated, anon;

-- ============================================================
-- 2) Helper: is_self_member_row(member_id)
--
-- Convenience used by RESTRICTIVE policies on tables that have a
-- direct member_id column (payments, notifications). Returns TRUE
-- if the row belongs to the caller, so the scope check is skipped
-- for self-viewing.
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_self_member_row(p_member_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
  RETURN p_member_id IS NOT NULL
     AND p_member_id::text = auth.uid()::text;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

GRANT EXECUTE ON FUNCTION public.is_self_member_row(UUID) TO authenticated, anon;

-- ============================================================
-- 3) RESTRICTIVE policies on payments
--
-- Reading: own payment OR admin scope includes the row's group.
-- Writing: must be admin-scope for the target group (or it's the
--          payer themselves submitting their initial pending row).
-- ============================================================

DROP POLICY IF EXISTS payments_scope_select ON public.payments;
CREATE POLICY payments_scope_select
  ON public.payments
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.is_self_member_row(member_id)
    OR public.can_access_group(group_id)
  );

DROP POLICY IF EXISTS payments_scope_modify ON public.payments;
CREATE POLICY payments_scope_modify
  ON public.payments
  AS RESTRICTIVE
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.is_self_member_row(member_id)
    OR public.can_access_group(group_id)
  );

-- ============================================================
-- 4) RESTRICTIVE policies on payment_types
--
-- Members can SELECT payment types that apply to their group
-- (or org-wide types with NULL group_id). Admins can manage only
-- payment types within their scope.
-- ============================================================

DROP POLICY IF EXISTS payment_types_scope_select ON public.payment_types;
CREATE POLICY payment_types_scope_select
  ON public.payment_types
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR group_id IS NULL                           -- org-wide types: visible to all org members
    OR public.can_access_group(group_id)
    OR EXISTS (
      -- Members can see types that apply to their own group
      SELECT 1 FROM public.organization_members om
      WHERE om.id::text = auth.uid()::text
        AND om.group_id = payment_types.group_id
    )
  );

DROP POLICY IF EXISTS payment_types_scope_modify ON public.payment_types;
CREATE POLICY payment_types_scope_modify
  ON public.payment_types
  AS RESTRICTIVE
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR public.can_access_group(group_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.can_access_group(group_id)
  );

-- ============================================================
-- 5) RESTRICTIVE policies on expenses
--
-- Expense rows that have a group_id are scope-isolated.
-- Org-wide expenses (group_id IS NULL) follow the existing
-- permissive policy from mig 004 (which already checks
-- organization_id + admin permissions).
-- ============================================================

DROP POLICY IF EXISTS expenses_scope_select ON public.expenses;
CREATE POLICY expenses_scope_select
  ON public.expenses
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR group_id IS NULL
    OR public.can_access_group(group_id)
  );

DROP POLICY IF EXISTS expenses_scope_modify ON public.expenses;
CREATE POLICY expenses_scope_modify
  ON public.expenses
  AS RESTRICTIVE
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR group_id IS NULL
    OR public.can_access_group(group_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR group_id IS NULL
    OR public.can_access_group(group_id)
  );

-- ============================================================
-- 6) RESTRICTIVE policies on organization_members
--
-- Members can see themselves. Admins can see members within
-- their scope (their faculty's classes, their class, or the
-- whole org).
-- ============================================================

DROP POLICY IF EXISTS org_members_scope_select ON public.organization_members;
CREATE POLICY org_members_scope_select
  ON public.organization_members
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR id::text = auth.uid()::text          -- always see yourself
    OR public.can_access_group(group_id)
  );

DROP POLICY IF EXISTS org_members_scope_modify ON public.organization_members;
CREATE POLICY org_members_scope_modify
  ON public.organization_members
  AS RESTRICTIVE
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR id::text = auth.uid()::text
    OR public.can_access_group(group_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR id::text = auth.uid()::text
    OR public.can_access_group(group_id)
  );

-- ============================================================
-- 7) RESTRICTIVE policies on member_admins
--
-- A faculty admin should NOT be able to see / promote / demote
-- admins in another faculty. Use the can_access_group helper.
-- A group_id of NULL means org-level admin row; only org-scope
-- admins can see those.
-- ============================================================

DROP POLICY IF EXISTS member_admins_scope_select ON public.member_admins;
CREATE POLICY member_admins_scope_select
  ON public.member_admins
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR member_id::text = auth.uid()::text       -- always see your own admin rows
    OR (group_id IS NULL AND EXISTS (            -- org-wide admin rows: only org-scope can view
        SELECT 1 FROM public.member_admins ma
        WHERE ma.member_id::text = auth.uid()::text
          AND ma.organization_id = member_admins.organization_id
          AND ma.is_active = TRUE
          AND ma.scope_level = 'org'
      ))
    OR public.can_access_group(group_id)
  );

DROP POLICY IF EXISTS member_admins_scope_modify ON public.member_admins;
CREATE POLICY member_admins_scope_modify
  ON public.member_admins
  AS RESTRICTIVE
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR public.can_access_group(group_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.can_access_group(group_id)
  );

-- ============================================================
-- 8) RESTRICTIVE policies on organization_groups itself
--
-- Reading the list of groups is fine for any member of the org
-- (you need to know what classes / faculties exist).
-- Creating / editing / deleting a group requires admin-scope
-- access to the unit that contains it (or org scope).
-- ============================================================

DROP POLICY IF EXISTS org_groups_scope_modify ON public.organization_groups;
CREATE POLICY org_groups_scope_modify
  ON public.organization_groups
  AS RESTRICTIVE
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR public.can_access_group(id)
    OR public.can_access_group(parent_group_id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.can_access_group(id)
    OR public.can_access_group(parent_group_id)
  );

-- ============================================================
-- 9) Verification
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 021 complete: faculty/department autonomy enforced.';
  RAISE NOTICE '  - can_access_group(group_id) helper created';
  RAISE NOTICE '  - is_self_member_row(member_id) helper created';
  RAISE NOTICE '  - RESTRICTIVE scope policies layered on:';
  RAISE NOTICE '      payments, payment_types, expenses,';
  RAISE NOTICE '      organization_members, member_admins, organization_groups';
  RAISE NOTICE '';
  RAISE NOTICE 'After this migration, an admin scoped to one group cannot';
  RAISE NOTICE 'see another group''s data, even within the same org.';
END $$;

COMMIT;
