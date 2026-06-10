-- ============================================================
-- Migration 111: Founding ≠ owning — founder becomes a money-locked
-- SETUP STEWARD, not an auto-granted org owner.
--
-- The problem (user): "we are not giving out any role on creation
-- like org owner or founder or anything — anyone can found an org."
-- Today the LIVE academic path bring_school_online (mig 023) grants
-- the founder role='org_owner', scope='group', with EVERY permission
-- TRUE — full money powers (create/approve payments, expenses) and,
-- via is_finance_role, payout access. Founding literally made you the
-- owner with the keys to the money.
--
-- The model (agreed):
--   • Founding creates the STRUCTURE and grants NO governance role.
--   • The founder gets a money-locked SETUP STEWARD capability so the
--     org isn't inert — they can add faculties/depts/classes, invite
--     people, set the logo/theme. NO collecting, NO payouts, NO
--     governance label.
--   • They claim their REAL role (class rep / SUG president / etc.)
--     through the normal per-tier claim flow and get peer-verified.
--   • The org sits in org_state='acting' (setup mode) until its first
--     verified exec flips it to 'active' (mig 042 already does this on
--     any claim approval). No cron enforces acting_deadline, so an
--     untimed 'acting' is safe — we null the deadline to be clean.
--
-- Existing orgs are untouched: their role='org_owner' founders stay
-- finance-eligible (kept in the explicit list below). Only NEW org
-- creation changes.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1) is_finance_role — stop blanket-granting org scope
-- ════════════════════════════════════════════════════════════
-- A setup steward is scope='org' but must NOT manage payout. The
-- mig 106/110 versions returned TRUE for ANY scope='org' row, which
-- would hand the steward payout access. Drop that blanket: org-tier
-- finance must come from a real governance/finance role (president /
-- treasurer / org_owner / org_admin), never from merely being
-- org-scoped. Everything else (keywords, class-rep) is unchanged.
CREATE OR REPLACE FUNCTION public.is_finance_role(
  p_role        TEXT,
  p_role_label  TEXT,
  p_scope_level TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_role  TEXT := LOWER(TRIM(COALESCE(p_role, '')));
  v_label TEXT := LOWER(TRIM(COALESCE(p_role_label, '')));
BEGIN
  -- Explicit governance roles (existing live founders keep payout).
  -- 'org_setup' is deliberately NOT here — a setup steward is not
  -- finance, even though it's org-scoped.
  IF v_role IN ('org_owner', 'org_admin') THEN RETURN TRUE; END IF;

  -- Finance + chief-exec keywords (any tier).
  IF v_role  ~ '(president|treasurer|financial|fin[_ ]?sec|finsec|chairman|bursar|director|governor)'
  OR v_label ~ '(president|treasurer|financial|fin[_ ]?sec|finsec|chairman|bursar|director|governor)'
  THEN
    RETURN TRUE;
  END IF;

  -- Class chief exec (class/course rep), excluding sub-officers.
  IF v_role  ~ '(class|course|group)[ _-]?(rep|representative)'
  OR v_label ~ '(class|course|group)[ _-]?(rep|representative)'
  THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_finance_role(TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- Re-backfill. org_setup stewards (if any already exist) lose payout;
-- everyone else is unchanged from mig 110.
UPDATE public.member_admins
SET can_manage_payout = public.is_finance_role(role, role_label, scope_level),
    updated_at = NOW()
WHERE can_manage_payout IS DISTINCT FROM
      public.is_finance_role(role, role_label, scope_level);

-- ════════════════════════════════════════════════════════════
-- 2) bring_school_online — founder = money-locked setup steward
-- ════════════════════════════════════════════════════════════
-- Recreated verbatim from mig 023 EXCEPT step 6 (the founder admin
-- grant). Everything else — validation, currency, slug, org/faculty/
-- class/member creation, return shape — is byte-for-byte the same.
CREATE OR REPLACE FUNCTION public.bring_school_online(
  p_full_name        TEXT,
  p_email            TEXT,
  p_phone            TEXT,
  p_member_number    TEXT,
  p_password         TEXT,
  p_org_name         TEXT,
  p_org_short_name   TEXT,
  p_org_type         TEXT,
  p_country_code     TEXT,
  p_state            TEXT,
  p_city             TEXT,
  p_website          TEXT,
  p_seed_id          UUID,
  p_faculty_name     TEXT,
  p_faculty_short    TEXT,
  p_group_name       TEXT,
  p_group_short      TEXT,
  p_group_kind       TEXT,
  p_user_level       TEXT
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id          UUID;
  v_faculty_id      UUID;
  v_group_id        UUID;
  v_member_id       UUID;
  v_slug            TEXT;
  v_slug_base       TEXT;
  v_currency_code   TEXT;
  v_currency_symbol TEXT;
  v_email_norm      TEXT := LOWER(TRIM(p_email));
  v_member_norm     TEXT := LOWER(TRIM(p_member_number));
BEGIN
  IF p_org_name IS NULL OR LENGTH(TRIM(p_org_name)) < 3 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization name must be at least 3 characters.');
  END IF;
  IF p_full_name IS NULL OR LENGTH(TRIM(p_full_name)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Your name is required.');
  END IF;
  IF v_email_norm IS NULL OR v_email_norm NOT LIKE '%@%.%' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'A valid email is required.');
  END IF;
  IF p_password IS NULL OR LENGTH(p_password) < 6 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Password must be at least 6 characters.');
  END IF;
  IF v_member_norm IS NULL OR LENGTH(v_member_norm) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Your member ID (matric/staff number) is required.');
  END IF;
  IF p_group_name IS NULL OR LENGTH(TRIM(p_group_name)) < 2 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Please name your first class/department.');
  END IF;

  CASE COALESCE(p_country_code, 'NG')
    WHEN 'NG' THEN v_currency_code := 'NGN'; v_currency_symbol := '₦';
    WHEN 'GH' THEN v_currency_code := 'GHS'; v_currency_symbol := 'GH₵';
    WHEN 'KE' THEN v_currency_code := 'KES'; v_currency_symbol := 'KSh';
    WHEN 'ZA' THEN v_currency_code := 'ZAR'; v_currency_symbol := 'R';
    WHEN 'EG' THEN v_currency_code := 'EGP'; v_currency_symbol := 'E£';
    WHEN 'US' THEN v_currency_code := 'USD'; v_currency_symbol := '$';
    WHEN 'GB' THEN v_currency_code := 'GBP'; v_currency_symbol := '£';
    ELSE          v_currency_code := 'USD'; v_currency_symbol := '$';
  END CASE;

  v_slug_base := LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(COALESCE(NULLIF(p_org_short_name,''), p_org_name), '[^a-zA-Z0-9\s-]', '', 'g'),
      '\s+', '-', 'g'
    )
  );
  v_slug := v_slug_base;
  FOR i IN 1..5 LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug);
    v_slug := v_slug_base || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4);
  END LOOP;

  INSERT INTO public.organizations (
    name, short_name, slug,
    type, organization_type,
    country_code, country, state, city, website,
    currency_code, currency_symbol,
    trust_level, claim_status,
    seed_institution_id,
    is_active, is_verified,
    member_count
  ) VALUES (
    TRIM(p_org_name),
    COALESCE(NULLIF(p_org_short_name, ''), UPPER(LEFT(REGEXP_REPLACE(p_org_name, '[^a-zA-Z]', '', 'g'), 5))),
    v_slug,
    COALESCE(p_org_type, 'university'),
    COALESCE(p_org_type, 'university'),
    COALESCE(p_country_code, 'NG'),
    COALESCE(p_country_code, 'Nigeria'),
    p_state, p_city, p_website,
    v_currency_code, v_currency_symbol,
    'community', 'unclaimed',
    p_seed_id,
    TRUE, FALSE,
    1
  )
  RETURNING id INTO v_org_id;

  IF p_seed_id IS NOT NULL THEN
    UPDATE public.seed_institutions
    SET linked_org_id = v_org_id, is_active = TRUE, updated_at = NOW()
    WHERE id = p_seed_id;
  END IF;

  IF p_faculty_name IS NOT NULL AND LENGTH(TRIM(p_faculty_name)) >= 2 THEN
    INSERT INTO public.organization_groups (
      organization_id, name, short_name, kind, is_active, current_member_count
    ) VALUES (
      v_org_id,
      TRIM(p_faculty_name),
      COALESCE(NULLIF(p_faculty_short, ''), UPPER(LEFT(REGEXP_REPLACE(p_faculty_name, '[^a-zA-Z]', '', 'g'), 5))),
      'faculty', TRUE, 1
    )
    RETURNING id INTO v_faculty_id;
  END IF;

  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
  ) VALUES (
    v_org_id,
    TRIM(p_group_name),
    COALESCE(NULLIF(p_group_short, ''), UPPER(LEFT(REGEXP_REPLACE(p_group_name, '[^a-zA-Z]', '', 'g'), 5))),
    COALESCE(p_group_kind, 'class'),
    v_faculty_id, TRUE, 1
  )
  RETURNING id INTO v_group_id;

  v_member_id := gen_random_uuid();
  INSERT INTO public.organization_members (
    id, organization_id, group_id,
    member_id, password_hash,
    full_name, email, phone,
    level, is_active, force_password_change
  ) VALUES (
    v_member_id, v_org_id, v_group_id,
    v_member_norm, extensions.crypt(p_password, extensions.gen_salt('bf')),
    TRIM(p_full_name), v_email_norm, p_phone,
    p_user_level, TRUE, FALSE
  );

  -- ── 6) Founder = money-locked SETUP STEWARD (CHANGED in mig 111) ──
  -- Was: role='org_owner', scope='group', every permission TRUE.
  -- Now: a neutral, org-scoped setup capability. Build structure +
  -- invite + settings; NO money, NO governance label, NO payout
  -- (is_finance_role returns FALSE for 'org_setup'). The founder
  -- claims their real role (class rep / SUG president) separately.
  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments,
    can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics,
    can_export_data, can_manage_settings,
    verification_status, verification_method,
    verification_layer, tenure_start,
    is_active,
    bio
  ) VALUES (
    v_member_id, v_org_id, NULL,
    'org_setup', 'Founder · setup', 'org',
    FALSE, FALSE,              -- no collecting / approving money
    FALSE, TRUE,              -- no member roster mgmt; CAN build the admin team
    FALSE, TRUE,              -- no expenses; CAN view analytics
    TRUE,  TRUE,              -- CAN export + manage settings (logo/theme/labels)
    'email_pending', 'email',
    2, CURRENT_DATE,          -- Layer 2 setup steward
    TRUE,
    'Founder — set up this organization. Claim your real role to gain governance powers.'
  );

  RETURN jsonb_build_object(
    'ok',         TRUE,
    'org_id',     v_org_id,
    'slug',       v_slug,
    'faculty_id', v_faculty_id,
    'group_id',   v_group_id,
    'member_id',  v_member_id,
    'member_login_id', v_member_norm
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Something with that name or ID already exists. Try a different short name or member ID.');
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not create the organization: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.bring_school_online(
  TEXT,TEXT,TEXT,TEXT,TEXT,
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,
  UUID,
  TEXT,TEXT,
  TEXT,TEXT,TEXT,TEXT
) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 3) create_organization_with_owner — same steward, drop the claim
-- ════════════════════════════════════════════════════════════
-- Recreated from mig 096 EXCEPT: the founder admin row becomes the
-- 'org_setup' steward (was money-locked 'org_owner'), and the auto
-- org_owner CLAIM is dropped (founding doesn't auto-claim the
-- presidency). org_state stays 'acting' but with a NULL deadline.
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
BEGIN
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

  IF EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) THEN
    RAISE EXCEPTION 'Slug "%" is already taken', v_slug;
  END IF;

  -- 'acting' setup mode, no deadline (nothing enforces it; the org
  -- flips to 'active' on its first verified exec via mig 042).
  INSERT INTO public.organizations (
    name, short_name, slug, organization_type,
    org_state, acting_started_at, acting_deadline_at,
    is_active, is_on_trial, trial_ends_at,
    created_at, updated_at
  ) VALUES (
    TRIM(p_org_name), v_short_name, v_slug, p_org_type,
    'acting', NOW(), NULL,
    TRUE, TRUE, NOW() + INTERVAL '14 days',
    NOW(), NOW()
  )
  RETURNING id INTO v_org_id;

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

  v_pwd_hash := extensions.crypt(p_owner_password, extensions.gen_salt('bf'));
  INSERT INTO public.organization_members (
    organization_id, group_id,
    full_name, member_id, password_hash,
    is_active, force_password_change, created_at, updated_at
  ) VALUES (
    v_org_id, v_group_id,
    TRIM(p_owner_name), LOWER(TRIM(p_owner_member_id)), v_pwd_hash,
    TRUE, FALSE, NOW(), NOW()
  )
  RETURNING id INTO v_member_id;

  -- Founder = money-locked setup steward (no auto org_owner claim).
  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments, can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics, can_export_data, can_manage_settings,
    verification_status, verification_method, verification_layer,
    is_active, tenure_start, created_at, updated_at
  ) VALUES (
    v_member_id, v_org_id, NULL,
    'org_setup', 'Founder · setup', 'org',
    FALSE, FALSE, FALSE, TRUE,
    FALSE, TRUE, TRUE, TRUE,
    'email_pending', 'email', 2,
    TRUE, CURRENT_DATE, NOW(), NOW()
  );

  -- Welcome notification — no claim reference now; points them at
  -- claiming their real role to unlock governance + money.
  INSERT INTO public.notifications (
    organization_id, member_id, group_id,
    type, title, message, link
  ) VALUES (
    v_org_id, v_member_id, v_group_id,
    'org_created',
    'Welcome — your organization is ready to set up',
    'Build your structure, invite people, and configure the org now. '
    'To collect dues and manage money, claim your real role (e.g. '
    'class rep or president) and get verified by your members.',
    '/dashboard'
  );

  RETURN jsonb_build_object(
    'organization_id', v_org_id,
    'slug',            v_slug,
    'group_id',        v_group_id,
    'member_id',       v_member_id,
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

DO $$
BEGIN
  RAISE NOTICE 'Migration 111 complete: founders are money-locked setup stewards; no auto org_owner role/claim.';
END $$;

COMMIT;
