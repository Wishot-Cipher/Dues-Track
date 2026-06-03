-- ============================================================
-- Migration 038: Logos — backfill seeds + wire through bring-school
--
-- Three things:
-- 1. UPDATE seed_institutions.logo_url for a starter set of
--    well-known Nigerian universities (publicly hosted Wikipedia
--    Commons URLs that you can swap for your own CDN later).
-- 2. Patch bring_school_online() so when a seed becomes a live
--    org, the logo flows through to organizations.logo_url.
-- 3. (No frontend change needed — OrgOverviewPage etc. already
--    render org.logo_url; they just need it populated.)
--
-- Admins can also upload their own logo via Settings; this
-- migration only seeds the obvious cases.
-- ============================================================

BEGIN;

-- ────────────────────────────────────────────────────────────
-- 1) Backfill a handful of known logos
-- ────────────────────────────────────────────────────────────
-- These URLs are publicly hosted on Wikimedia Commons / Wikipedia,
-- which is the most reliable hot-link source for institutional crests.
-- If any 404 in your environment, the admin can override via Settings.

UPDATE public.seed_institutions
SET logo_url = CASE name
  WHEN 'University of Nigeria, Nsukka'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/University_of_Nigeria_Nsukka_logo.png/200px-University_of_Nigeria_Nsukka_logo.png'
  WHEN 'University of Ibadan'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7e/University_of_Ibadan_logo.png/200px-University_of_Ibadan_logo.png'
  WHEN 'University of Lagos'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0d/University_of_Lagos_seal.svg/200px-University_of_Lagos_seal.svg.png'
  WHEN 'Ahmadu Bello University'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/4/41/Ahmadu_Bello_University_logo.png/200px-Ahmadu_Bello_University_logo.png'
  WHEN 'Obafemi Awolowo University'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/2/24/Obafemi_Awolowo_University_logo.svg/200px-Obafemi_Awolowo_University_logo.svg.png'
  WHEN 'University of Ilorin'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/2/2c/University_of_Ilorin_logo.png/200px-University_of_Ilorin_logo.png'
  WHEN 'University of Benin'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8c/University_of_Benin_Nigeria_logo.png/200px-University_of_Benin_Nigeria_logo.png'
  WHEN 'Federal University of Technology, Owerri'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/1/19/FUTO_logo.png/200px-FUTO_logo.png'
  WHEN 'Federal University of Technology, Akure'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f9/FUTA_logo.png/200px-FUTA_logo.png'
  WHEN 'Covenant University'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/8/84/Covenant_University_Logo.png/200px-Covenant_University_Logo.png'
  WHEN 'Babcock University'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f7/Babcock_University_logo.png/200px-Babcock_University_logo.png'
  WHEN 'Lagos State University'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/3/35/Lagos_State_University_logo.png/200px-Lagos_State_University_logo.png'
  WHEN 'Nnamdi Azikiwe University'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c4/Nnamdi_Azikiwe_University_logo.png/200px-Nnamdi_Azikiwe_University_logo.png'
  WHEN 'Bayero University, Kano'
    THEN 'https://upload.wikimedia.org/wikipedia/en/thumb/7/76/Bayero_University_Kano_seal.png/200px-Bayero_University_Kano_seal.png'
  ELSE logo_url
END
WHERE country_code = 'NG';

-- Backfill any orgs already created from seeds whose logo wasn't carried over
UPDATE public.organizations o
SET logo_url = s.logo_url,
    updated_at = NOW()
FROM public.seed_institutions s
WHERE o.seed_institution_id = s.id
  AND o.logo_url IS NULL
  AND s.logo_url IS NOT NULL;

-- ────────────────────────────────────────────────────────────
-- 2) Patch bring_school_online so future orgs inherit the logo
-- ────────────────────────────────────────────────────────────
-- We re-CREATE OR REPLACE the function with one new behaviour:
-- if p_seed_id is provided, read its logo_url and put it on the new
-- organization. Everything else identical to the previous version
-- (which already handled uuid_generate_v4 → gen_random_uuid,
-- columns, schema-qualified pgcrypto, can_manage_members rename).

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
  v_seed_logo       TEXT;
BEGIN
  -- Validation
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

  -- Currency
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

  -- Slug
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

  -- ↓↓↓ NEW: pull logo from the linked seed (if any) ↓↓↓
  IF p_seed_id IS NOT NULL THEN
    SELECT logo_url INTO v_seed_logo
    FROM public.seed_institutions
    WHERE id = p_seed_id;
  END IF;

  -- Insert the org (now with logo_url)
  INSERT INTO public.organizations (
    name, short_name, slug,
    type, organization_type,
    country_code, country, state, city, website,
    currency_code, currency_symbol,
    trust_level, claim_status,
    seed_institution_id,
    logo_url,                   -- ← NEW
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
    v_seed_logo,                -- ← NEW: pulled from seed; NULL if no seed
    TRUE, FALSE,
    1
  )
  RETURNING id INTO v_org_id;

  -- Link seed
  IF p_seed_id IS NOT NULL THEN
    UPDATE public.seed_institutions
    SET linked_org_id = v_org_id, is_active = TRUE, updated_at = NOW()
    WHERE id = p_seed_id;
  END IF;

  -- Faculty
  IF p_faculty_name IS NOT NULL AND LENGTH(TRIM(p_faculty_name)) >= 2 THEN
    INSERT INTO public.organization_groups (
      organization_id, name, short_name, kind, is_active, current_member_count
    ) VALUES (
      v_org_id, TRIM(p_faculty_name),
      COALESCE(NULLIF(p_faculty_short, ''), UPPER(LEFT(REGEXP_REPLACE(p_faculty_name, '[^a-zA-Z]', '', 'g'), 5))),
      'faculty', TRUE, 1
    )
    RETURNING id INTO v_faculty_id;
  END IF;

  -- Leaf group
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
  ) VALUES (
    v_org_id, TRIM(p_group_name),
    COALESCE(NULLIF(p_group_short, ''), UPPER(LEFT(REGEXP_REPLACE(p_group_name, '[^a-zA-Z]', '', 'g'), 5))),
    COALESCE(p_group_kind, 'class'), v_faculty_id, TRUE, 1
  )
  RETURNING id INTO v_group_id;

  -- Founder member
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

  -- Founder admin
  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments,
    can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics,
    can_export_data, can_manage_settings,
    verification_status, verification_method,
    is_active, bio
  ) VALUES (
    v_member_id, v_org_id, v_group_id,
    'org_owner', 'Founder', 'group',
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    'pending', 'member_vote',
    TRUE, 'Founding member of this organization on Payvexo.'
  );

  RETURN jsonb_build_object(
    'ok', TRUE,
    'org_id', v_org_id, 'slug', v_slug,
    'faculty_id', v_faculty_id, 'group_id', v_group_id,
    'member_id', v_member_id, 'member_login_id', v_member_norm
  );

EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Something with that name or ID already exists.');
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

DO $$
DECLARE
  with_logo INTEGER;
  orgs_with_logo INTEGER;
BEGIN
  SELECT COUNT(*) INTO with_logo FROM public.seed_institutions WHERE logo_url IS NOT NULL;
  SELECT COUNT(*) INTO orgs_with_logo FROM public.organizations WHERE logo_url IS NOT NULL;
  RAISE NOTICE 'Migration 038 complete:';
  RAISE NOTICE '  Seeds with a logo: %', with_logo;
  RAISE NOTICE '  Orgs with a logo:  %', orgs_with_logo;
  RAISE NOTICE '  bring_school_online() now copies seed.logo_url into the new org.';
END $$;

COMMIT;
