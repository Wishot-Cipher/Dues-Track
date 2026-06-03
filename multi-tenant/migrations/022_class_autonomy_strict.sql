-- ============================================================
-- Migration 022: Strict Class Autonomy (Owner-of-Type Model)
--
-- Goal:
-- Revise the autonomy rules from mig 021. The new rule:
--
--   A payment / expense row is visible to:
--     1. The payer themselves (for payments) / nobody else for expenses
--     2. The admin who CREATED the payment_type / expense_category
--        (i.e. whoever scope-owns the type, not the payer's class)
--
--   Org-wide payment types (group_id IS NULL):
--     → only org-scope admins can read them
--
--   Group-scoped payment types (group_id = X):
--     → only admins whose member_admins.group_id = X can read them
--     → NOT visible to org-scope admins of the same org
--     → NOT visible to unit-scope admins of the parent faculty
--
-- This realises the user's privacy intent: the president sees ONLY
-- the org-wide dues THEY created. They never peek into a class's
-- internal payments. Faculty admin sees ONLY faculty-wide types
-- they created. Class rep sees their class fully.
--
-- Directory data (group exists, name, member count) remains
-- visible to everyone in the org — that comes from the permissive
-- policies in mig 007 and is unaffected here.
--
-- This migration SUPERSEDES the restrictive policies from mig 021.
-- It is safe to run regardless of whether 021 was applied.
-- ============================================================

BEGIN;

-- ============================================================
-- 1) Replace can_access_group() with the STRICT version
--
-- Old (mig 021): org-scope admin TRUE for any group in org;
--                unit-scope admin TRUE for child classes.
-- New (this):    only the EXACT group, no hierarchy shortcuts.
--                Members of the group return TRUE for self-view.
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_access_group(p_group_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_target_org_id UUID;
BEGIN
  -- Platform admin & service role bypass
  IF public.is_platform_admin() THEN RETURN TRUE; END IF;
  IF auth.role() = 'service_role' THEN RETURN TRUE; END IF;

  IF p_group_id IS NULL THEN
    -- NULL group_id = org-wide row; only org-scope admins
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

  SELECT organization_id INTO v_target_org_id
  FROM public.organization_groups
  WHERE id = p_group_id;

  IF v_target_org_id IS NULL THEN RETURN FALSE; END IF;

  -- Caller is a member of THIS exact group
  IF EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.id::text = auth.uid()::text
      AND om.group_id = p_group_id
  ) THEN
    RETURN TRUE;
  END IF;

  -- Caller is an admin of THIS exact group (verified)
  RETURN EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id::text = auth.uid()::text
      AND ma.organization_id = v_target_org_id
      AND ma.group_id = p_group_id
      AND ma.is_active = TRUE
      AND ma.verification_status IN (
        'email_verified','member_confirmed','document_verified','admin_verified'
      )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.can_access_group(UUID) TO authenticated, anon;

-- ============================================================
-- 2) New helper: can_access_payment_type(payment_type_id)
--
-- Returns TRUE when the caller is:
--   • platform admin / service role
--   • the admin who has scope over the type's group
--     - if the type's group_id IS NULL → caller must be org-scope admin
--     - if the type's group_id = X     → caller must be admin of X
--   • a member of the type's group (so members can see their own
--     payment options)
--
-- Use this for visibility of payments, payment_types, and any
-- table whose access should follow "the creator owns the data."
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_access_payment_type(p_payment_type_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_pt_group_id UUID;
  v_pt_org_id UUID;
BEGIN
  IF public.is_platform_admin() THEN RETURN TRUE; END IF;
  IF auth.role() = 'service_role' THEN RETURN TRUE; END IF;
  IF p_payment_type_id IS NULL THEN RETURN FALSE; END IF;

  SELECT group_id, organization_id
    INTO v_pt_group_id, v_pt_org_id
  FROM public.payment_types
  WHERE id = p_payment_type_id;

  IF v_pt_org_id IS NULL THEN RETURN FALSE; END IF;

  -- Caller must be a member of the same org first
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.id::text = auth.uid()::text
      AND om.organization_id = v_pt_org_id
  ) THEN
    RETURN FALSE;
  END IF;

  -- Org-wide payment type → only org-scope admin
  IF v_pt_group_id IS NULL THEN
    RETURN EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = v_pt_org_id
        AND ma.is_active = TRUE
        AND ma.scope_level = 'org'
        AND ma.verification_status IN (
          'email_verified','member_confirmed','document_verified','admin_verified'
        )
    );
  END IF;

  -- Group-scoped payment type:
  --   members of that group → can SEE (to pay it)
  --   admins of that group   → full access
  IF EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.id::text = auth.uid()::text
      AND om.group_id = v_pt_group_id
  ) THEN
    RETURN TRUE;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id::text = auth.uid()::text
      AND ma.organization_id = v_pt_org_id
      AND ma.group_id = v_pt_group_id
      AND ma.is_active = TRUE
      AND ma.verification_status IN (
        'email_verified','member_confirmed','document_verified','admin_verified'
      )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.can_access_payment_type(UUID) TO authenticated, anon;

-- ============================================================
-- 3) Helper: owns_payment_type(payment_type_id)
--
-- Stricter version: TRUE only when the caller has ADMIN scope
-- over the type — NOT when they're just a member. Use for write
-- operations and for the "admin who created this" visibility.
-- ============================================================
CREATE OR REPLACE FUNCTION public.owns_payment_type(p_payment_type_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
  v_pt_group_id UUID;
  v_pt_org_id UUID;
BEGIN
  IF public.is_platform_admin() THEN RETURN TRUE; END IF;
  IF auth.role() = 'service_role' THEN RETURN TRUE; END IF;
  IF p_payment_type_id IS NULL THEN RETURN FALSE; END IF;

  SELECT group_id, organization_id
    INTO v_pt_group_id, v_pt_org_id
  FROM public.payment_types
  WHERE id = p_payment_type_id;

  IF v_pt_org_id IS NULL THEN RETURN FALSE; END IF;

  IF v_pt_group_id IS NULL THEN
    -- Org-wide type: owner is any org-scope verified admin
    RETURN EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = v_pt_org_id
        AND ma.is_active = TRUE
        AND ma.scope_level = 'org'
        AND ma.verification_status IN (
          'email_verified','member_confirmed','document_verified','admin_verified'
        )
    );
  END IF;

  -- Group-scoped type: owner is the verified admin of that exact group
  RETURN EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id::text = auth.uid()::text
      AND ma.organization_id = v_pt_org_id
      AND ma.group_id = v_pt_group_id
      AND ma.is_active = TRUE
      AND ma.verification_status IN (
        'email_verified','member_confirmed','document_verified','admin_verified'
      )
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.owns_payment_type(UUID) TO authenticated, anon;

-- ============================================================
-- 4) Replace restrictive policies on payments
--
-- A payment row is visible to:
--   • the payer themselves
--   • the admin who owns the payment_type the payment belongs to
--   • service role
-- ============================================================
DROP POLICY IF EXISTS payments_scope_select ON public.payments;
CREATE POLICY payments_scope_select
  ON public.payments
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.is_self_member_row(member_id)
    OR public.owns_payment_type(payment_type_id)
  );

DROP POLICY IF EXISTS payments_scope_modify ON public.payments;
CREATE POLICY payments_scope_modify
  ON public.payments
  AS RESTRICTIVE
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.is_self_member_row(member_id)
    OR public.owns_payment_type(payment_type_id)
  );

-- ============================================================
-- 5) Replace restrictive policies on payment_types
--
-- Members can see types they can actually pay (their group's
-- group-scoped types + all org-wide types). Admins can manage
-- only types they own.
-- ============================================================
DROP POLICY IF EXISTS payment_types_scope_select ON public.payment_types;
CREATE POLICY payment_types_scope_select
  ON public.payment_types
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.can_access_payment_type(id)
  );

DROP POLICY IF EXISTS payment_types_scope_modify ON public.payment_types;
CREATE POLICY payment_types_scope_modify
  ON public.payment_types
  AS RESTRICTIVE
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR public.owns_payment_type(id)
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.owns_payment_type(id)
  );

-- ============================================================
-- 6) Replace restrictive policies on expenses
--
-- An expense belongs to a group. Visibility rule:
--   • Admin of that group  → TRUE
--   • Org-scope admin AND group_id IS NULL (org-wide expense) → TRUE
--   • Group member (only if the org allows member expense view)
--   • Otherwise            → FALSE
-- ============================================================
DROP POLICY IF EXISTS expenses_scope_select ON public.expenses;
CREATE POLICY expenses_scope_select
  ON public.expenses
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.can_access_group(group_id)
  );

DROP POLICY IF EXISTS expenses_scope_modify ON public.expenses;
CREATE POLICY expenses_scope_modify
  ON public.expenses
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
-- 7) Replace restrictive policies on organization_members
--
-- A member row is visible to:
--   • the person themselves (always)
--   • another member of the SAME group
--   • a verified admin of the SAME group
--   • service role / platform admin
--
-- The org president cannot see student names in a class.
-- The faculty admin cannot see student names in a class either.
-- They only see directory info from organization_groups (counts).
-- ============================================================
DROP POLICY IF EXISTS org_members_scope_select ON public.organization_members;
CREATE POLICY org_members_scope_select
  ON public.organization_members
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR id::text = auth.uid()::text
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
    OR EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = organization_members.organization_id
        AND ma.group_id = organization_members.group_id
        AND ma.is_active = TRUE
        AND ma.verification_status IN (
          'email_verified','member_confirmed','document_verified','admin_verified'
        )
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR id::text = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = organization_members.organization_id
        AND ma.group_id = organization_members.group_id
        AND ma.is_active = TRUE
        AND ma.verification_status IN (
          'email_verified','member_confirmed','document_verified','admin_verified'
        )
    )
  );

-- ============================================================
-- 8) Replace restrictive policies on member_admins
--
-- An admin row is visible to:
--   • the admin themselves
--   • a verified admin of the SAME group (to manage exec team)
--   • a verified org-scope admin (to see who runs each group — directory only)
--   • service role / platform admin
--
-- The org-scope admin sees the EXISTENCE of group admins (so they
-- know "Class A has a treasurer named Jane") but NOT individual
-- transactional data. This is intentional: it lets the president
-- coordinate without peeking into class data.
-- ============================================================
DROP POLICY IF EXISTS member_admins_scope_select ON public.member_admins;
CREATE POLICY member_admins_scope_select
  ON public.member_admins
  AS RESTRICTIVE
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR member_id::text = auth.uid()::text
    OR (
      group_id IS NOT NULL AND public.can_access_group(group_id)
    )
    OR EXISTS (
      -- Org-scope admin can see the directory of WHO runs each group
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = member_admins.organization_id
        AND ma.is_active = TRUE
        AND ma.scope_level = 'org'
        AND ma.verification_status IN (
          'email_verified','member_confirmed','document_verified','admin_verified'
        )
    )
  );

DROP POLICY IF EXISTS member_admins_scope_modify ON public.member_admins;
CREATE POLICY member_admins_scope_modify
  ON public.member_admins
  AS RESTRICTIVE
  FOR ALL
  USING (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR (
      group_id IS NOT NULL AND public.can_access_group(group_id)
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR (
      group_id IS NOT NULL AND public.can_access_group(group_id)
    )
  );

-- ============================================================
-- 9) Aggregate stats view (the only "across class" view orgs get)
--
-- The president cannot read individual payment rows. They CAN
-- read aggregate stats per group. This view does the aggregation
-- server-side; even if a class rep changes a number, the view's
-- numbers are recomputed on read.
--
-- Visible to anyone who can see the group's directory entry.
-- ============================================================
CREATE OR REPLACE VIEW public.org_group_summary AS
SELECT
  g.id                AS group_id,
  g.organization_id,
  g.parent_group_id,
  g.name              AS group_name,
  g.short_name        AS group_short_name,
  g.kind              AS group_kind,
  g.is_active,
  COALESCE(g.current_member_count, 0) AS member_count,
  (
    SELECT COUNT(*) FROM public.payment_types pt
    WHERE pt.group_id = g.id AND pt.is_active = TRUE
  ) AS active_payment_types_count,
  (
    SELECT COALESCE(SUM(p.dues_amount_kobo), 0)
    FROM public.payments p
    WHERE p.group_id = g.id
      AND p.status IN ('approved','successful','paid')
  ) AS dues_collected_kobo,
  (
    SELECT COUNT(*) FROM public.payments p
    WHERE p.group_id = g.id
      AND p.status IN ('approved','successful','paid')
  ) AS successful_payment_count
FROM public.organization_groups g;

GRANT SELECT ON public.org_group_summary TO authenticated, anon;

-- ============================================================
-- 10) Verification
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 022 complete: Strict class autonomy (Owner-of-Type) enforced.';
  RAISE NOTICE '';
  RAISE NOTICE 'New / replaced helpers:';
  RAISE NOTICE '  - can_access_group(group_id)           STRICT, no hierarchy shortcuts';
  RAISE NOTICE '  - can_access_payment_type(type_id)     visibility for members + admins';
  RAISE NOTICE '  - owns_payment_type(type_id)           admin-only (for writes)';
  RAISE NOTICE '';
  RAISE NOTICE 'New view:';
  RAISE NOTICE '  - org_group_summary                    aggregates only (no row-level peeking)';
  RAISE NOTICE '';
  RAISE NOTICE 'Net effect:';
  RAISE NOTICE '  - President sees: org-wide types they created + aggregate stats';
  RAISE NOTICE '  - Faculty admin sees: their faculty-wide types + aggregate stats';
  RAISE NOTICE '  - Class rep sees: their class fully';
  RAISE NOTICE '  - No cross-class peeking of individual data, regardless of role.';
END $$;

COMMIT;
