-- ============================================================
-- Migration 130: let an ancestor-tier exec READ the members below them
-- (the dues cascade), without becoming the lower tier's manager.
--
-- The bug (reported)
-- ------------------
-- On a fresh org with the per-type hierarchy, a DEPARTMENT president who
-- creates a department due cannot:
--   • find the classes / members under the dept to WAIVE the due for,
--   • see the payer's name on the review page (shows "Unknown Member"),
--   • see those members / their payments on the financial pages.
--
-- Root cause
-- ----------
-- Mig 053 (re-lock) set organization_members SELECT to
-- can_access_group(group_id), which (mig 022) is OWN-TIER ONLY — a
-- member row is visible to the member, to same-group members, and to a
-- verified admin of that EXACT group. A department/faculty/org exec is
-- NOT a member or admin of the child CLASS, so they cannot read class
-- member rows at all.
--
-- But the dues model CASCADES DOWN: a due created at the dept applies to
-- every member of every class under it. The exec who OWNS that due must
-- be able to SEE those members — to waive it for specific people, to see
-- who paid (names on review), and to roll up collections. The app already
-- assumes this (WaivePaymentPage searches the active role's whole subtree;
-- AdminCollectedPage keys collected off the due, not the payer's group).
-- RLS was the missing half.
--
-- The fix
-- -------
-- Add an ancestor-aware READ path to the organization_members SELECT
-- policy: a verified, active exec may read a member row when their tier
-- is an ANCESTOR-OR-SELF of that member's group (their dues flow down to
-- them), and an org-scope verified exec may read every member in the org
-- (org-wide dues reach everyone).
--
-- This is READ ONLY. INSERT / UPDATE / DELETE ("manage students") stay
-- own-tier via the mig 053 policies — a dept exec still cannot edit or
-- remove a class member. They are not the class's exec; they just can't
-- be blind to the people their own due bills.
--
-- Reversible: mig 131 restores the strict own-tier SELECT from mig 053.
-- ============================================================

BEGIN;

-- Depth-guarded ancestor walk (idempotent — also defined in mig 113, but
-- redefined here so 130 stands alone whether or not the staged RLS set
-- was applied). Returns TRUE when p_ancestor is an ancestor-or-self of
-- p_group.
CREATE OR REPLACE FUNCTION public.group_is_ancestor_or_self(
  p_ancestor UUID,
  p_group    UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE up AS (
    SELECT id, parent_group_id, 1 AS depth
    FROM public.organization_groups WHERE id = p_group
    UNION ALL
    SELECT g.id, g.parent_group_id, up.depth + 1
    FROM public.organization_groups g
    JOIN up ON g.id = up.parent_group_id
    WHERE up.depth < 12
  )
  SELECT EXISTS (SELECT 1 FROM up WHERE id = p_ancestor);
$$;
GRANT EXECUTE ON FUNCTION public.group_is_ancestor_or_self(UUID, UUID)
  TO anon, authenticated, service_role;

-- An active, verified exec "covers" a member's group when their own tier
-- is an ancestor-or-self of it (the cascade), or they are an org-scope
-- exec (org-wide dues reach the whole org). Used for member READ only.
CREATE OR REPLACE FUNCTION public.exec_covers_member_group(p_member_group UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RETURN FALSE; END IF;

  -- Org-scope verified exec → sees every member (org-wide dues cascade
  -- to all). Mirrors the org-row branch of can_access_group.
  IF EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id::text = auth.uid()::text
      AND ma.is_active = TRUE
      AND ma.scope_level = 'org'
      AND ma.verification_status IN
          ('email_verified','member_confirmed','document_verified','admin_verified')
  ) THEN
    RETURN TRUE;
  END IF;

  IF p_member_group IS NULL THEN RETURN FALSE; END IF;

  -- A verified exec whose group is an ANCESTOR-OR-SELF of the member's
  -- group. Their dues flow down to this member, so they may read them.
  RETURN EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id::text = auth.uid()::text
      AND ma.is_active = TRUE
      AND ma.group_id IS NOT NULL
      AND ma.verification_status IN
          ('email_verified','member_confirmed','document_verified','admin_verified')
      AND public.group_is_ancestor_or_self(ma.group_id, p_member_group)
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.exec_covers_member_group(UUID)
  TO anon, authenticated, service_role;

-- Replace ONLY the SELECT policy (writes from mig 053 are untouched).
DROP POLICY IF EXISTS org_members_select ON public.organization_members;
CREATE POLICY org_members_select
  ON public.organization_members
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR id::text = auth.uid()::text
    OR public.can_access_group(group_id)        -- own tier (mig 022)
    OR public.exec_covers_member_group(group_id) -- ancestor exec read-down
  );

DO $$
BEGIN
  RAISE NOTICE 'Migration 130 applied: ancestor-tier execs can now READ members below them (dues cascade). Writes stay own-tier. Roll back with mig 131.';
END $$;

COMMIT;
