-- ============================================================
-- Migration 131: ROLLBACK for mig 130.
--
-- Restores the strict OWN-TIER member SELECT from mig 053 (no ancestor
-- read-down). Apply only if 130 caused a problem; note that with this in
-- place the dept/faculty/org "Unknown Member" + empty-waive symptoms
-- return, because member visibility is back to exact-group only.
--
-- Idempotent.
-- ============================================================

BEGIN;

DROP POLICY IF EXISTS org_members_select ON public.organization_members;
CREATE POLICY org_members_select
  ON public.organization_members
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR id::text = auth.uid()::text
    OR public.can_access_group(group_id)
  );

DO $$
BEGIN
  RAISE NOTICE 'Migration 131 applied: organization_members SELECT rolled back to strict own-tier (mig 053).';
END $$;

COMMIT;
