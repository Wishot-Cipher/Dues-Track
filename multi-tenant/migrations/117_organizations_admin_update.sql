-- ============================================================
-- Migration 117: Allow org-scope admins to UPDATE their organization
-- (fixes "new row violates row-level security policy" on org logo /
-- org-profile updates).
--
-- The problem
-- -----------
-- organizations has RLS enabled with INSERT policies (mig 019) but NO
-- UPDATE policy. With RLS on and no permissive UPDATE policy, every
-- update is denied — so saving the org logo / org profile from the
-- Profile page failed with "new row violates row-level security
-- policy".
--
-- Who may manage the org profile
-- ------------------------------
-- An ACTIVE org-scope admin (member_admins.scope_level='org') of THAT
-- org: the SUG/org president, and the founder's setup steward
-- (org_setup, mig 111) — exactly the people responsible for the org's
-- public identity (name, logo, description shown on the landing
-- search). service_role + platform admins always allowed.
--
-- This is the minimal, correct gate. The richer "org profile owner +
-- succession" model (#11) builds on top of this policy later.
-- ============================================================

BEGIN;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS organizations_admin_update ON public.organizations;
CREATE POLICY organizations_admin_update
  ON public.organizations
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = organizations.id
        AND ma.scope_level = 'org'
        AND ma.is_active = TRUE
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = organizations.id
        AND ma.scope_level = 'org'
        AND ma.is_active = TRUE
    )
  );

DO $$
BEGIN
  RAISE NOTICE 'Migration 117 applied: org-scope admins can now update their organization (logo / profile).';
END $$;

COMMIT;
