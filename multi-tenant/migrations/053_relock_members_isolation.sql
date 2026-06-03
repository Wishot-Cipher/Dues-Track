-- ============================================================
-- Migration 053: Re-lock organization_members isolation (post-JWT)
--
-- CONTEXT:
-- Migration 028 disabled the strict autonomy policies (replacing them
-- with USING(TRUE)) because the app used a custom localStorage session
-- and auth.uid() was always NULL. The app now mints a Supabase-compatible
-- JWT at /api/auth/login (sub = organization_members.id), so auth.uid()
-- resolves server-side and RLS can enforce isolation again.
--
-- THIS MIGRATION re-locks the most sensitive table first:
-- organization_members (member personal info). It is the first step of a
-- staged re-lock — payments / expenses / member_admins follow in later
-- migrations, each verified independently.
--
-- VISIBILITY RULE (matches blueprint autonomy intent, §13.4 / mig 022):
--   A member row is visible to:
--     • the member themselves
--     • another member of the SAME group (class/department)
--     • a verified admin of the SAME group
--     • platform admins / service role
--   It is NOT visible to members or admins of a different class/department,
--   nor to org-wide ("president") admins. Each class/department is autonomous.
--
-- WRITES happen through SECURITY DEFINER RPCs (signup, founder creation,
-- profile update) that run as service_role and bypass RLS. Direct client
-- writes are limited to same-group verified admins and self-updates.
--
-- SAFE SEQUENCING: deploy /api/auth/login and confirm login works (a valid
-- token is issued) BEFORE running this migration. Without a token,
-- authenticated reads of this table will correctly return nothing.
--
-- Idempotent: drops ALL existing policies on the table first so no stale
-- permissive policy can OR-in broad access, then recreates the full set.
-- ============================================================

BEGIN;

ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- ── 1) Clear every existing policy (deterministic reset) ──
DO $$
DECLARE
  pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'organization_members'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.organization_members', pol.policyname);
  END LOOP;
END $$;

-- ── 2) SELECT — self, same-group, or service/platform ──
CREATE POLICY org_members_select
  ON public.organization_members
  FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR id::text = auth.uid()::text
    OR public.can_access_group(group_id)
  );

-- ── 3) INSERT — service/platform or a verified admin of the target group ──
-- (Normal signup / founder creation run as service_role via SECURITY DEFINER
--  RPCs and bypass this; this covers any direct admin-driven inserts.)
CREATE POLICY org_members_insert
  ON public.organization_members
  FOR INSERT
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = organization_members.organization_id
        AND ma.group_id = organization_members.group_id
        AND ma.is_active = TRUE
        AND ma.verification_status IN
            ('email_verified','member_confirmed','document_verified','admin_verified')
    )
  );

-- ── 4) UPDATE — self, a verified same-group admin, or service/platform ──
CREATE POLICY org_members_update
  ON public.organization_members
  FOR UPDATE
  USING (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR id::text = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = organization_members.organization_id
        AND ma.group_id = organization_members.group_id
        AND ma.is_active = TRUE
        AND ma.verification_status IN
            ('email_verified','member_confirmed','document_verified','admin_verified')
    )
  )
  WITH CHECK (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR id::text = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = organization_members.organization_id
        AND ma.group_id = organization_members.group_id
        AND ma.is_active = TRUE
        AND ma.verification_status IN
            ('email_verified','member_confirmed','document_verified','admin_verified')
    )
  );

-- ── 5) DELETE — verified same-group admin or service/platform ──
CREATE POLICY org_members_delete
  ON public.organization_members
  FOR DELETE
  USING (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = organization_members.organization_id
        AND ma.group_id = organization_members.group_id
        AND ma.is_active = TRUE
        AND ma.verification_status IN
            ('email_verified','member_confirmed','document_verified','admin_verified')
    )
  );

-- ── 6) Verification ──
DO $$
DECLARE
  policy_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO policy_count
  FROM pg_policies
  WHERE schemaname = 'public' AND tablename = 'organization_members';

  RAISE NOTICE 'Migration 053 complete: organization_members re-locked.';
  RAISE NOTICE '  Active policies on organization_members: %', policy_count;
  RAISE NOTICE '  Members are now visible only within their own class/department.';
  RAISE NOTICE '  Reminder: requires a valid member JWT (auth.uid()) — confirm login works first.';
END $$;

COMMIT;
