-- ============================================================
-- Migration 054: Roll back 053 (re-open organization_members)
--
-- WHY:
-- Migration 053 locked organization_members to require auth.uid() (a member
-- JWT). But the database is shared between local and PRODUCTION, and the
-- production frontend was still running the OLD code (anon key, no token).
-- Its login lookup (organization_members ... .single()) then matched zero
-- rows under RLS and PostgREST returned HTTP 406 — breaking production login.
--
-- This migration restores the open, application-layer-isolation state from
-- migration 028 so production works again.
--
-- 053 must only be re-applied AFTER the JWT login code (api/auth/login +
-- the token-sending Supabase client) is deployed to production and confirmed
-- to issue valid tokens. RLS goes last, once every environment can authenticate.
-- ============================================================

BEGIN;

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Remove the strict policies introduced by migration 053
DROP POLICY IF EXISTS org_members_select ON public.organization_members;
DROP POLICY IF EXISTS org_members_insert ON public.organization_members;
DROP POLICY IF EXISTS org_members_update ON public.organization_members;
DROP POLICY IF EXISTS org_members_delete ON public.organization_members;

-- Restore open access (pre-053 behavior; isolation handled at the app layer)
DROP POLICY IF EXISTS org_members_open_all ON public.organization_members;
CREATE POLICY org_members_open_all
  ON public.organization_members
  FOR ALL USING (TRUE) WITH CHECK (TRUE);

DO $$
BEGIN
  RAISE NOTICE 'Migration 054 complete: organization_members re-opened (053 rolled back).';
  RAISE NOTICE '  Re-apply 053 ONLY after the JWT login code is live in production.';
END $$;

COMMIT;
