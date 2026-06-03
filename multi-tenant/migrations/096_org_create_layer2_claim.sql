-- ============================================================
-- Migration 096: Layer-2 founder + auto-submitted claim on org creation
--
-- Problem: whoever calls create_organization_with_owner today walks
-- away as a fully verified Layer-4 org_owner with money / payouts /
-- billing unlocked. There is NO verification — anyone could spin up
-- "University of Lagos" and start collecting fees the same minute.
--
-- The graduated-trust system (mig 060) already solves this for dept
-- and class founders (bootstrap_department_with_class etc): the
-- founder starts as a plain member, a CLAIM is submitted, and money
-- only unlocks after votes / parent-exec confirm / platform override.
-- This migration extends the same rule to the ORG tier.
--
-- New behaviour:
--   1. Org is created in org_state='acting' with a 72h deadline. The
--      claim has to reach Layer 4 in that window or it expires and
--      the org orphans (platform admin can rescue).
--   2. The founder member_admin row carries verification_layer=2.
--      Setup powers are ON (can_manage_admins / analytics / export /
--      settings) so the founder can build groups, set the logo, etc.
--      MONEY powers are OFF (can_create_payments, can_approve_payments,
--      can_manage_expenses, can_manage_members). They unlock when the
--      claim is approved by _finalize_claim_layer4.
--   3. A claim_requests row is auto-submitted for claimed_scope='org',
--      claimed_role='org_owner', status='awaiting_votes', current_layer=2.
--      The decision tree in evaluate_claim (mig 060/071) takes it from
--      there — 10 votes for an independent org, 15 votes + 72h for an
--      academic org, or platform override after 7 days.
--
-- Function signature matches the legacy RPC the TS client already
-- calls (organizationService.create line 1169), so no client change
-- needed. Return JSON shape:
--     { organization_id, slug, group_id, member_id }
-- ============================================================

BEGIN;

-- Drop any legacy variants of the signature so CREATE OR REPLACE
-- doesn't trip on a different argument list.
DROP FUNCTION IF EXISTS public.create_organization_with_owner(
  text, text, text, text, text, text, text, text, text
);
DROP FUNCTION IF EXISTS public.create_organization_with_owner(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
);

CREATE OR REPLACE FUNCTION public.create_organization_with_owner(
  p_org_name         TEXT,
  p_org_short_name   TEXT,
  p_org_slug         TEXT,
  p_org_type         TEXT,
  p_owner_name       TEXT,
  p_owner_member_id  TEXT,
  p_owner_password   TEXT,
  p_group_name       TEXT,
  p_group_short_name TEXT
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org_id      UUID;
  v_group_id    UUID;
  v_member_id   UUID;
  v_slug        TEXT;
  v_short_name  TEXT;
  v_pwd_hash    TEXT;
  v_group_kind  TEXT;
  v_claim_id    UUID;
  v_acting_deadline TIMESTAMPTZ := NOW() + INTERVAL '72 hours';
BEGIN
  -- ── Validation ──────────────────────────────────────────────
  IF COALESCE(TRIM(p_org_name), '') = '' THEN
    RAISE EXCEPTION 'Organisation name is required';
  END IF;
  IF COALESCE(TRIM(p_org_short_name), '') = '' THEN
    RAISE EXCEPTION 'Organisation short name is required';
  END IF;
  IF COALESCE(TRIM(p_org_slug), '') = '' OR LENGTH(TRIM(p_org_slug)) < 3 THEN
    RAISE EXCEPTION 'Slug must be at least 3 characters';
  END IF;
  IF COALESCE(TRIM(p_owner_name), '') = '' OR LENGTH(TRIM(p_owner_name)) < 2 THEN
    RAISE EXCEPTION 'Owner name is required';
  END IF;
  IF COALESCE(TRIM(p_owner_member_id), '') = '' THEN
    RAISE EXCEPTION 'Owner member id is required';
  END IF;
  IF COALESCE(p_owner_password, '') = '' OR LENGTH(p_owner_password) < 6 THEN
    RAISE EXCEPTION 'Password must be at least 6 characters';
  END IF;

  v_slug       := LOWER(TRIM(REGEXP_REPLACE(p_org_slug, '[^a-zA-Z0-9-]+', '-', 'g')));
  v_short_name := UPPER(TRIM(p_org_short_name));

  -- Slug uniqueness — surface a friendly error before the UNIQUE
  -- constraint trips, so the client can show a clean message.
  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Slug "%" is already taken', v_slug;
  END IF;

  -- ── 1) Create the org in 'acting' state ─────────────────────
  -- Layer 4 unlocks via votes (see mig 060 evaluate_claim). Until
  -- then the org is operational for SETUP only — no money, no
  -- members management. acting_deadline_at gives a 72h window
  -- before bootstrap_votes is even considered for academic orgs.
  INSERT INTO public.organizations (
    name, short_name, slug, organization_type,
    org_state, acting_started_at, acting_deadline_at,
    is_active, is_on_trial,
    trial_ends_at,
    created_at, updated_at
  ) VALUES (
    TRIM(p_org_name), v_short_name, v_slug, p_org_type,
    'acting', NOW(), v_acting_deadline,
    TRUE, TRUE,
    NOW() + INTERVAL '14 days',
    NOW(), NOW()
  )
  RETURNING id INTO v_org_id;

  -- ── 2) Create the first group (founder's home) ──────────────
  -- For academic orgs the initial group is a 'department' so the
  -- claim has a target scope to point at. For others it's the
  -- generic group kind. The kind doesn't affect Layer 4 logic;
  -- it just makes the tree readable in OrgGroupsPage.
  v_group_kind := CASE
    WHEN p_org_type IN ('university','polytechnic','college','school') THEN 'department'
    ELSE 'general'
  END;

  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, is_active, created_at, updated_at
  ) VALUES (
    v_org_id, TRIM(p_group_name), UPPER(TRIM(p_group_short_name)), v_group_kind,
    TRUE, NOW(), NOW()
  )
  RETURNING id INTO v_group_id;

  -- ── 3) Hash the password and create the founder member ─────
  v_pwd_hash := extensions.crypt(p_owner_password, extensions.gen_salt('bf'));

  INSERT INTO public.organization_members (
    organization_id, group_id,
    full_name, member_id, password_hash,
    is_active, force_password_change,
    created_at, updated_at
  ) VALUES (
    v_org_id, v_group_id,
    TRIM(p_owner_name), LOWER(TRIM(p_owner_member_id)), v_pwd_hash,
    TRUE, FALSE,
    NOW(), NOW()
  )
  RETURNING id INTO v_member_id;

  -- ── 4) Layer-2 admin row — SETUP yes, MONEY no ──────────────
  -- The legacy RPC blanket-set every permission to TRUE here. The
  -- new rule: can_X reflects what a Layer-2 acting org owner can
  -- actually do without verification.
  --   create_payments / approve_payments → NO (money, gated by Layer 4)
  --   manage_members                     → NO (per mig 095, this is class-tier anyway)
  --   manage_expenses                    → NO (money)
  --   manage_admins                      → YES (need to build their team)
  --   view_analytics / export_data       → YES (visibility is fine)
  --   manage_settings                    → YES (logo, theme, labels)
  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments, can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics, can_export_data, can_manage_settings,
    verification_status, verification_method, verification_layer,
    is_active, tenure_start,
    created_at, updated_at
  ) VALUES (
    v_member_id, v_org_id, NULL,
    'org_owner', 'Organisation owner', 'org',
    FALSE, FALSE, FALSE, TRUE,
    FALSE, TRUE, TRUE, TRUE,
    'email_pending', 'email', 2,
    TRUE, CURRENT_DATE,
    NOW(), NOW()
  );

  -- ── 5) Submit the claim that will eventually grant Layer 4 ─
  -- Stored at Layer 2 awaiting_votes. evaluate_claim (mig 060/071)
  -- handles the rest: 10 votes for independent orgs, 15 votes +
  -- 72h for academic, platform override after 7 days.
  INSERT INTO public.claim_requests (
    organization_id, claimant_user_id,
    claimed_role, claimed_scope,
    full_name, position_title, phone, institutional_email, personal_email,
    verification_method,
    status, current_layer,
    has_financial_history,
    created_at, updated_at
  ) VALUES (
    v_org_id, v_member_id,
    'org_owner', 'org',
    TRIM(p_owner_name), 'Organisation owner', '', NULL, '',
    'member_vote',
    'awaiting_votes', 2,
    FALSE,
    NOW(), NOW()
  )
  RETURNING id INTO v_claim_id;

  -- ── 6) First-touch notification so the founder sees the gate ─
  -- Explains why money is locked and how to unlock it. Links to
  -- /dashboard which already renders the org_state='acting'
  -- banner from existing UI work.
  INSERT INTO public.notifications (
    organization_id, member_id, group_id,
    type, title, message, link,
    related_type, related_id
  ) VALUES (
    v_org_id, v_member_id, v_group_id,
    'claim_submitted',
    'Welcome — finish verification to unlock money',
    'You can build your structure, invite people, and configure ' ||
    'the org now. Collecting dues, payouts, and billing unlock once ' ||
    'your founder claim is verified (peer votes or platform review).',
    '/dashboard',
    'claim_request', v_claim_id
  );

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'slug',            v_slug,
    'group_id',        v_group_id,
    'member_id',       v_member_id,
    'claim_id',        v_claim_id,
    'org_state',       'acting'
  );

EXCEPTION
  WHEN unique_violation THEN
    RAISE EXCEPTION 'That slug or member id is already in use';
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Could not create organisation: %', SQLERRM;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_organization_with_owner(
  TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT
) TO authenticated, service_role, anon;

COMMIT;
