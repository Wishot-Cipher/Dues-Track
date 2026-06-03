-- ============================================================
-- Migration 023: bring_school_online() RPC
--
-- Goal:
-- Atomically promote a search to a live organization. Called from
-- the BringMySchoolPage. Takes the founder's auth details + org
-- structure (org name, first faculty, first class) and creates:
--
--   1. organizations row             (trust_level='community')
--   2. organization_groups: faculty  (kind='faculty')           — optional
--   3. organization_groups: class    (kind='class', parent=faculty)
--   4. organization_members          (the founder, with hashed password)
--   5. member_admins                 (founder = pending exec, scope=group)
--   6. seed_institutions             (linked_org_id set, is_active=TRUE) — if from seed
--
-- Runs as SECURITY DEFINER because:
--   • the app uses a custom auth model (member_id + bcrypt), not Supabase Auth
--   • the new row needs to be inserted across multiple tables in one tx
--   • RLS for community-tier org creation would otherwise need auth.uid()
--
-- Returns: jsonb { ok, slug, org_id, group_id, faculty_id, member_id, error }
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.bring_school_online(
  -- Founder identity
  p_full_name        TEXT,
  p_email            TEXT,
  p_phone            TEXT,
  p_member_number    TEXT,     -- matric / staff / member ID
  p_password         TEXT,     -- plaintext; hashed inside the function

  -- Organization identity
  p_org_name         TEXT,
  p_org_short_name   TEXT,
  p_org_type         TEXT,     -- university | polytechnic | church | club | ...
  p_country_code     TEXT,     -- ISO 3166-1 alpha-2
  p_state            TEXT,
  p_city             TEXT,
  p_website          TEXT,

  -- Optional seed linkage (if user clicked a seed result)
  p_seed_id          UUID,

  -- First faculty / unit  (optional, but encouraged for universities)
  p_faculty_name     TEXT,
  p_faculty_short    TEXT,

  -- First class / leaf group (required — the founder must belong somewhere)
  p_group_name       TEXT,
  p_group_short      TEXT,
  p_group_kind       TEXT,     -- class | department | general | fellowship | ...
  p_user_level       TEXT      -- founder's level e.g. "200L"
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
  -- ── Validate ──
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

  -- ── Currency by country (matches blueprint §9) ──
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

  -- ── Slug: deterministic from short_name with collision guard ──
  v_slug_base := LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(COALESCE(NULLIF(p_org_short_name,''), p_org_name), '[^a-zA-Z0-9\s-]', '', 'g'),
      '\s+', '-', 'g'
    )
  );
  v_slug := v_slug_base;
  -- Up to 5 tries before bailing
  FOR i IN 1..5 LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug);
    v_slug := v_slug_base || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4);
  END LOOP;

  -- ── 1) Create the organization ──
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

  -- ── 2) Link the seed (if provided) ──
  IF p_seed_id IS NOT NULL THEN
    UPDATE public.seed_institutions
    SET linked_org_id = v_org_id,
        is_active     = TRUE,
        updated_at    = NOW()
    WHERE id = p_seed_id;
  END IF;

  -- ── 3) Create the faculty (optional) ──
  IF p_faculty_name IS NOT NULL AND LENGTH(TRIM(p_faculty_name)) >= 2 THEN
    INSERT INTO public.organization_groups (
      organization_id, name, short_name, kind, is_active, current_member_count
    ) VALUES (
      v_org_id,
      TRIM(p_faculty_name),
      COALESCE(NULLIF(p_faculty_short, ''), UPPER(LEFT(REGEXP_REPLACE(p_faculty_name, '[^a-zA-Z]', '', 'g'), 5))),
      'faculty',
      TRUE,
      1
    )
    RETURNING id INTO v_faculty_id;
  END IF;

  -- ── 4) Create the leaf group (the founder's class / department) ──
  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
  ) VALUES (
    v_org_id,
    TRIM(p_group_name),
    COALESCE(NULLIF(p_group_short, ''), UPPER(LEFT(REGEXP_REPLACE(p_group_name, '[^a-zA-Z]', '', 'g'), 5))),
    COALESCE(p_group_kind, 'class'),
    v_faculty_id,
    TRUE,
    1
  )
  RETURNING id INTO v_group_id;

  -- ── 5) Create the founder as an organization_members row ──
  --
  -- Schema notes (from migrations 001–008):
  --   id              uuid (we generate this)
  --   organization_id uuid
  --   group_id        uuid
  --   member_id       text (the matric/staff/member number; unique per org)
  --   password_hash   text (bcrypt via pgcrypto)
  --   full_name       text
  --   email           text
  --   phone           text
  --   level           text
  --   is_active       boolean
  --   force_password_change boolean
  --
  -- The pattern matches verify_member_password (mig 003 AUTH).
  v_member_id := gen_random_uuid();

  INSERT INTO public.organization_members (
    id, organization_id, group_id,
    member_id, password_hash,
    full_name, email, phone,
    level,
    is_active,
    force_password_change
  ) VALUES (
    v_member_id, v_org_id, v_group_id,
    v_member_norm, extensions.crypt(p_password, extensions.gen_salt('bf')),
    TRIM(p_full_name), v_email_norm, p_phone,
    p_user_level,
    TRUE,
    FALSE
  );

  -- ── 6) Mark them as the founding admin of the leaf group ──
  --
  -- They get scope='group' (the class they founded) with full permissions
  -- and verification_status='pending'. They still need to claim/verify
  -- through the claim flow (mig 015) before the trust system rewards
  -- them with a higher trust_level on the org.
  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments,
    can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics,
    can_export_data, can_manage_settings,
    verification_status, verification_method,
    is_active,
    bio
  ) VALUES (
    v_member_id, v_org_id, v_group_id,
    'org_owner', 'Founder', 'group',
    TRUE, TRUE,
    TRUE, TRUE,
    TRUE, TRUE,
    TRUE, TRUE,
    'pending', 'member_vote',
    TRUE,
    'Founding member of this organization on Payvexo.'
  );

  -- ── Success ──
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

-- ------------------------------------------------------------
-- Grants
-- ------------------------------------------------------------
GRANT EXECUTE ON FUNCTION public.bring_school_online(
  TEXT,TEXT,TEXT,TEXT,TEXT,
  TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,
  UUID,
  TEXT,TEXT,
  TEXT,TEXT,TEXT,TEXT
) TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 023 complete: bring_school_online() RPC ready.';
END $$;

COMMIT;
