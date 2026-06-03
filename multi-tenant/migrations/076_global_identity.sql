-- ============================================================
-- Migration 076: Global identity — one person, many organizations
--
-- Problem: a student already in one org couldn't create/own another, because
-- the organization CONTACT email is globally unique — and they reused their own
-- email. In real life one person legitimately runs/joins multiple orgs.
--
-- This migration:
--   1. Drops the global uniqueness on organizations.email (contact info, not a
--      personal identifier). Org name/slug stay unique.
--   2. Adds an `accounts` table = the global person identity, and links each
--      organization_members row to an account via account_id.
--   3. Backfills accounts from existing member emails (one account per email).
--   4. RPCs: get_or_create_account_for_member, get_my_memberships (the org
--      switcher feed), attach_member_to_my_account (link a freshly-created org's
--      founder to the caller's account).
--
-- The per-org organization_members.id stays the RLS/session unit (auth.uid()),
-- so isolation is unchanged — accounts only GROUP memberships for one login +
-- an org switcher.
-- ============================================================

BEGIN;

-- ── 1) Unblock: org contact email need not be globally unique ──
DROP INDEX IF EXISTS public.idx_org_email_unique_ci;

-- ── 2) accounts: the global person identity ──
CREATE TABLE IF NOT EXISTS public.accounts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email       TEXT,                       -- nullable; unique when present (CI)
  full_name   TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
-- Unique only among non-null emails (multiple NULLs allowed).
CREATE UNIQUE INDEX IF NOT EXISTS idx_accounts_email_ci
  ON public.accounts (LOWER(email)) WHERE email IS NOT NULL;

ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_org_members_account ON public.organization_members (account_id);

ALTER TABLE public.accounts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS accounts_service ON public.accounts;
CREATE POLICY accounts_service ON public.accounts FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
DROP POLICY IF EXISTS accounts_self ON public.accounts;
CREATE POLICY accounts_self ON public.accounts FOR SELECT
  USING (auth.role() = 'service_role'
         OR EXISTS (SELECT 1 FROM public.organization_members om
                    WHERE om.account_id = accounts.id AND om.id::text = auth.uid()::text));
GRANT SELECT ON public.accounts TO authenticated, anon, service_role;

-- ── 3) Backfill: one account per distinct member email ──
INSERT INTO public.accounts (email, full_name)
SELECT DISTINCT ON (LOWER(om.email)) om.email, om.full_name
FROM public.organization_members om
WHERE om.email IS NOT NULL AND TRIM(om.email) <> ''
  AND NOT EXISTS (SELECT 1 FROM public.accounts a WHERE LOWER(a.email) = LOWER(om.email))
ORDER BY LOWER(om.email), om.created_at NULLS LAST;

UPDATE public.organization_members om
SET account_id = a.id
FROM public.accounts a
WHERE om.account_id IS NULL
  AND om.email IS NOT NULL
  AND LOWER(a.email) = LOWER(om.email);

-- ── 4a) Resolve (or lazily create) the account for a member ──
CREATE OR REPLACE FUNCTION public.get_or_create_account_for_member(p_member_id UUID)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_account UUID;
  v_email   TEXT;
  v_name    TEXT;
BEGIN
  IF p_member_id IS NULL THEN RETURN NULL; END IF;

  SELECT account_id, email, full_name INTO v_account, v_email, v_name
  FROM public.organization_members WHERE id = p_member_id;
  IF v_account IS NOT NULL THEN RETURN v_account; END IF;

  -- Match an existing account by email first
  IF v_email IS NOT NULL AND TRIM(v_email) <> '' THEN
    SELECT id INTO v_account FROM public.accounts WHERE LOWER(email) = LOWER(v_email) LIMIT 1;
  END IF;

  IF v_account IS NULL THEN
    INSERT INTO public.accounts (email, full_name)
    VALUES (NULLIF(TRIM(v_email), ''), v_name)
    RETURNING id INTO v_account;
  END IF;

  UPDATE public.organization_members SET account_id = v_account WHERE id = p_member_id;
  RETURN v_account;
END; $$;
GRANT EXECUTE ON FUNCTION public.get_or_create_account_for_member(UUID) TO anon, authenticated, service_role;

-- ── 4b) get_my_memberships: every org this person belongs to (switcher feed) ──
CREATE OR REPLACE FUNCTION public.get_my_memberships(p_member_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_account UUID; v_rows jsonb;
BEGIN
  IF p_member_id IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.'); END IF;
  v_account := public.get_or_create_account_for_member(p_member_id);
  IF v_account IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found.'); END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.is_current DESC, t.org_name), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT om.id            AS member_id,
           om.member_id      AS human_id,
           o.id              AS org_id,
           o.name            AS org_name,
           o.slug            AS org_slug,
           o.logo_url,
           COALESCE(o.org_state, 'active') AS org_state,
           om.group_id,
           g.name            AS group_name,
           (om.id = p_member_id) AS is_current,
           EXISTS (SELECT 1 FROM public.member_admins ma
                   WHERE ma.member_id = om.id AND ma.is_active = TRUE) AS is_admin,
           COALESCE((SELECT ma.role_label FROM public.member_admins ma
                     WHERE ma.member_id = om.id AND ma.is_active = TRUE
                     ORDER BY ma.verification_layer DESC NULLS LAST LIMIT 1), NULL) AS role_label,
           COALESCE((SELECT MAX(ma.verification_layer) FROM public.member_admins ma
                     WHERE ma.member_id = om.id AND ma.is_active = TRUE), 0) AS verification_layer
    FROM public.organization_members om
    JOIN public.organizations o ON o.id = om.organization_id
    LEFT JOIN public.organization_groups g ON g.id = om.group_id
    WHERE om.account_id = v_account
      AND COALESCE(om.is_active, TRUE) = TRUE
  ) t;

  RETURN jsonb_build_object('ok', TRUE, 'account_id', v_account, 'memberships', v_rows);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_memberships(UUID) TO anon, authenticated, service_role;

-- ── 4c) Link a (freshly created) membership to the caller's account ──
-- Used right after a logged-in person creates a NEW org: the new founder row
-- starts with no account_id, so we attach it to the caller's existing account.
CREATE OR REPLACE FUNCTION public.attach_member_to_my_account(
  p_caller_member_id UUID, p_target_member_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_account UUID; v_target_account UUID;
BEGIN
  IF p_caller_member_id IS NULL OR p_target_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Both members are required.');
  END IF;

  v_account := public.get_or_create_account_for_member(p_caller_member_id);
  IF v_account IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Caller not found.'); END IF;

  SELECT account_id INTO v_target_account FROM public.organization_members WHERE id = p_target_member_id;
  -- Only claim a membership that isn't already owned by someone else.
  IF v_target_account IS NOT NULL AND v_target_account <> v_account THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'That membership already belongs to another account.');
  END IF;

  UPDATE public.organization_members SET account_id = v_account WHERE id = p_target_member_id;
  RETURN jsonb_build_object('ok', TRUE, 'account_id', v_account);
END; $$;
GRANT EXECUTE ON FUNCTION public.attach_member_to_my_account(UUID, UUID) TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 076 complete: global identity (accounts) + org-email unblock + switcher RPCs.';
END $$;

COMMIT;
