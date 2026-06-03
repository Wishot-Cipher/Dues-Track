-- ============================================================
-- Migration 028: Relax RLS for the legacy custom-auth model
--
-- WHY:
-- Migrations 021 and 022 added RESTRICTIVE policies that use
-- auth.uid() to enforce the strict class-autonomy model. But
-- this app uses a custom session (member_id + bcrypt in
-- localStorage), NOT Supabase Auth — so auth.uid() is always
-- NULL on the server, and the restrictive policies block ALL
-- SELECTs for non-service-role callers.
--
-- The symptom: a founder creates an org via bring_school_online,
-- the org + faculty + class all get inserted correctly, but
-- when the founder loads /:slug/overview the groups list is
-- empty because the SELECT is blocked by RLS.
--
-- THIS MIGRATION:
-- Drops the FOR ALL restrictive policies from mig 021 and 022.
-- Tenant isolation is preserved at the application layer via
-- orgScope / .eq('organization_id', currentOrgId) on every
-- query.
--
-- We keep the most important narrow write protections (e.g.
-- the rule that payments can't be marked successful from the
-- client — mig 019's payments_no_paid_update_from_client).
--
-- The full strict-autonomy model from mig 022 will return when
-- the app migrates to Supabase Auth and auth.uid() resolves
-- correctly. Until then, the application enforces isolation.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- Drop mig 021 restrictive policies
-- ──────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS payments_scope_select       ON public.payments;
DROP POLICY IF EXISTS payments_scope_modify       ON public.payments;
DROP POLICY IF EXISTS payment_types_scope_select  ON public.payment_types;
DROP POLICY IF EXISTS payment_types_scope_modify  ON public.payment_types;
DROP POLICY IF EXISTS expenses_scope_select       ON public.expenses;
DROP POLICY IF EXISTS expenses_scope_modify       ON public.expenses;
DROP POLICY IF EXISTS org_members_scope_select    ON public.organization_members;
DROP POLICY IF EXISTS org_members_scope_modify    ON public.organization_members;
DROP POLICY IF EXISTS member_admins_scope_select  ON public.member_admins;
DROP POLICY IF EXISTS member_admins_scope_modify  ON public.member_admins;
DROP POLICY IF EXISTS org_groups_scope_modify     ON public.organization_groups;

-- ──────────────────────────────────────────────────────────────
-- Ensure permissive SELECT policies exist for the key tables
-- so the public landing flow + the founder's overview work.
-- ──────────────────────────────────────────────────────────────

-- organization_groups — directory info (names, member counts);
-- safe to expose publicly
DROP POLICY IF EXISTS org_groups_public_read ON public.organization_groups;
CREATE POLICY org_groups_public_read
  ON public.organization_groups
  FOR SELECT
  USING (TRUE);

-- organization_members — application filters by org_id
DROP POLICY IF EXISTS org_members_open_read ON public.organization_members;
CREATE POLICY org_members_open_read
  ON public.organization_members
  FOR SELECT
  USING (TRUE);

-- member_admins — application filters by org_id
DROP POLICY IF EXISTS member_admins_open_read ON public.member_admins;
CREATE POLICY member_admins_open_read
  ON public.member_admins
  FOR SELECT
  USING (TRUE);

-- payment_types — application filters; needed for member dashboards
DROP POLICY IF EXISTS payment_types_open_read ON public.payment_types;
CREATE POLICY payment_types_open_read
  ON public.payment_types
  FOR SELECT
  USING (TRUE);

-- payments — application filters; needed for member history
DROP POLICY IF EXISTS payments_open_read ON public.payments;
CREATE POLICY payments_open_read
  ON public.payments
  FOR SELECT
  USING (TRUE);

-- expenses — application filters
DROP POLICY IF EXISTS expenses_open_read ON public.expenses;
CREATE POLICY expenses_open_read
  ON public.expenses
  FOR SELECT
  USING (TRUE);

-- ──────────────────────────────────────────────────────────────
-- Verification
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  group_count INTEGER;
  member_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO group_count  FROM public.organization_groups;
  SELECT COUNT(*) INTO member_count FROM public.organization_members;
  RAISE NOTICE 'Migration 028 complete: RLS relaxed for legacy auth.';
  RAISE NOTICE '  organization_groups rows visible: %', group_count;
  RAISE NOTICE '  organization_members rows visible: %', member_count;
END $$;

COMMIT;
