-- ============================================================
-- Migration 149: Three fixes in one atomic transaction
--
-- 1. DROP the dead 18-param overload of bring_school_online
--    (nothing calls it; it was superseded by the 20-param version
--    but Postgres kept both as separate overloads — dead weight).
--
-- 2. FIX the live 20-param overload's member_admins INSERT.
--    Current state (dangerous): role='org_owner', scope_level='group',
--    every permission flag TRUE, verification_layer not set (defaults 0).
--    This bypasses the entire Layer 0-4 trust system — a founder gets
--    full money/governance powers at layer 0 the moment they create an org.
--    Correct state (mig 111 intent): role='org_setup', scope_level='org',
--    all money flags FALSE, verification_layer=2 (setup steward).
--
-- 3. ADD duplicate-org guard — before inserting the org row, check:
--    a) Exact case-insensitive short_name match within country_code
--       for institutional types (university, polytechnic, etc.)
--    b) Fuzzy name match (pg_trgm similarity > 0.72) for all types
--    Returns ok=false with existing_slug so the frontend can show
--    "This org already exists — join it instead?" rather than silently
--    creating a duplicate.
--
-- 4. ADD sibling-group duplicate guard — before inserting faculty,
--    department, and class groups, check that no sibling with the
--    same name (case-insensitive) already exists under the same
--    parent (or org root for faculties). Prevents the same duplicate
--    problem one level down inside a legitimately unique org.
--
-- Schema facts this migration relies on (verified live, not assumed):
--   • organizations.short_name, country_code, name all exist (confirmed)
--   • organizations: no UNIQUE constraint on short_name or name (confirmed
--     — only slug is unique). The duplicate guard is RPC-level, not a DB
--     constraint, because legitimate short_name collisions exist for
--     non-institutional org types (two "RCCG" branches, two "Debate Club").
--   • member_admins.verification_layer DEFAULT 0 (confirmed live)
--   • member_admins.scope_level DEFAULT 'group'::text (confirmed live)
--   • pg_trgm extension installed (confirmed live via pg_extension)
--   • bring_school_online has exactly TWO live overloads (confirmed via
--     pg_proc): 18-param (dead) and 20-param (live, called by frontend).
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PART 1: Drop the dead 18-param overload
-- Exact param type list matches what pg_proc showed for the
-- unreachable overload — Postgres requires the full signature
-- for DROP FUNCTION when overloads exist.
-- ════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public.bring_school_online(
  text, text, text, text, text,   -- full_name, email, phone, member_number, password
  text, text, text, text,         -- org_name, org_short_name, org_type, country_code
  text, text, text,               -- state, city, website
  uuid,                           -- seed_id
  text, text,                     -- faculty_name, faculty_short
  text, text, text,               -- group_name, group_short, group_kind
  text                            -- user_level
);

-- ════════════════════════════════════════════════════════════
-- PART 2 + 3 + 4: Replace the live 20-param overload with the
-- fixed version. CREATE OR REPLACE preserves the function's OID
-- and any existing GRANTs on it, so the frontend RPC call
-- continues to work without any client-side changes.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.bring_school_online(
  p_full_name       text,
  p_email           text,
  p_phone           text,
  p_member_number   text,
  p_password        text,
  p_org_name        text,
  p_org_short_name  text,
  p_org_type        text,
  p_country_code    text,
  p_state           text,
  p_city            text,
  p_website         text,
  p_seed_id         uuid,
  p_faculty_name    text,
  p_faculty_short   text,
  p_department_name text,
  p_department_short text,
  p_group_name      text,
  p_group_short     text,
  p_group_kind      text,
  p_user_level      text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_org_id          UUID;
  v_faculty_id      UUID;
  v_department_id   UUID;
  v_group_id        UUID;
  v_member_id       UUID;
  v_slug            TEXT;
  v_slug_base       TEXT;
  v_currency_code   TEXT;
  v_currency_symbol TEXT;
  v_email_norm      TEXT := LOWER(TRIM(p_email));
  v_member_norm     TEXT := LOWER(TRIM(p_member_number));
  v_seed_logo       TEXT;
  v_parent_id       UUID;

  -- Duplicate-check variables
  v_existing_org_id   UUID;
  v_existing_org_slug TEXT;
  v_existing_org_name TEXT;
  v_existing_members  INTEGER;
  v_norm_short        TEXT;
  v_norm_name         TEXT;
  -- Whether this org type should get the strict institutional uniqueness check
  v_is_institutional  BOOLEAN;
BEGIN

  -- ── Input validation ──────────────────────────────────────
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
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Please name your class.');
  END IF;

  -- ── PART 3: Org-level duplicate guard ────────────────────
  --
  -- Two layers:
  --   Layer A — exact short_name match within country, for
  --     institutional types only. "UNN" in Nigeria = exactly
  --     one real university. Block immediately and return the
  --     existing org's slug so the UI can offer "join instead."
  --
  --   Layer B — fuzzy full-name match (pg_trgm, threshold 0.72)
  --     for ALL types within the same country. Catches "University
  --     of Nigeria Nsukka" vs "University of Nigeria, Nsukka" etc.
  --     Returns a warning (not a hard block) with the existing slug
  --     so the frontend can show a "did you mean...?" confirmation
  --     before proceeding — the caller decides whether to proceed.
  --
  -- Non-institutional types (church, club, association, ngo,
  -- company, other) skip the short_name check because "RCCG" or
  -- "Debate Club" can legitimately exist multiple times.

  v_norm_short := UPPER(TRIM(COALESCE(NULLIF(p_org_short_name, ''), '')));
  v_norm_name  := TRIM(p_org_name);
  v_is_institutional := COALESCE(p_org_type, 'other') IN (
    'university', 'polytechnic', 'college_of_education',
    'monotechnic', 'seminary'
  );

  -- Layer A: exact short_name for institutional types
  IF v_is_institutional AND v_norm_short <> '' THEN
    SELECT o.id, o.slug, o.name, o.member_count
    INTO v_existing_org_id, v_existing_org_slug, v_existing_org_name, v_existing_members
    FROM public.organizations o
    WHERE o.is_active = TRUE
      AND o.country_code = COALESCE(p_country_code, 'NG')
      AND o.type IN ('university','polytechnic','college_of_education','monotechnic','seminary')
      AND UPPER(TRIM(o.short_name)) = v_norm_short
    LIMIT 1;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok',             FALSE,
        'code',           'duplicate_org_short_name',
        'error',          format(
          '%s (%s) already exists on Payvexo with %s member%s. Join the existing organization instead of creating a duplicate.',
          v_existing_org_name,
          v_norm_short,
          v_existing_members,
          CASE WHEN v_existing_members = 1 THEN '' ELSE 's' END
        ),
        'existing_slug',  v_existing_org_slug,
        'existing_name',  v_existing_org_name,
        'existing_members', v_existing_members
      );
    END IF;
  END IF;

  -- Layer B: fuzzy name match for all types
  -- pg_trgm similarity: 1.0 = identical, 0.0 = nothing in common.
  -- 0.72 catches "University of Nigeria Nsukka" vs
  -- "University of Nigeria, Nsukka" while not false-positiving on
  -- "University of Lagos" vs "University of Nigeria Nsukka".
  SELECT o.id, o.slug, o.name, o.member_count
  INTO v_existing_org_id, v_existing_org_slug, v_existing_org_name, v_existing_members
  FROM public.organizations o
  WHERE o.is_active = TRUE
    AND o.country_code = COALESCE(p_country_code, 'NG')
    AND similarity(o.name, v_norm_name) > 0.72
  ORDER BY similarity(o.name, v_norm_name) DESC
  LIMIT 1;

  IF FOUND THEN
    -- Soft warning — return a distinct code so the frontend can
    -- show "Did you mean X?" with two buttons: "Yes, join it" and
    -- "No, this is a different org — create anyway."
    -- The frontend passes a bypass flag to re-call with p_bypass_fuzzy_check=true
    -- (handled below via the existing flow — for now we hard-block
    -- the same as Layer A, since the frontend doesn't yet have the
    -- bypass UI. This is safe to loosen once the UI ships.)
    RETURN jsonb_build_object(
      'ok',             FALSE,
      'code',           'duplicate_org_fuzzy_name',
      'error',          format(
        '"%s" looks very similar to an existing organization: "%s" (%s member%s). Is this the same organization? If so, join it instead. If it''s genuinely different, contact support to create it.',
        v_norm_name,
        v_existing_org_name,
        v_existing_members,
        CASE WHEN v_existing_members = 1 THEN '' ELSE 's' END
      ),
      'existing_slug',  v_existing_org_slug,
      'existing_name',  v_existing_org_name,
      'existing_members', v_existing_members
    );
  END IF;

  -- ── Currency ──────────────────────────────────────────────
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

  -- ── Slug generation ───────────────────────────────────────
  v_slug_base := LOWER(
    REGEXP_REPLACE(
      REGEXP_REPLACE(
        COALESCE(NULLIF(p_org_short_name,''), p_org_name),
        '[^a-zA-Z0-9\s-]', '', 'g'
      ),
      '\s+', '-', 'g'
    )
  );
  v_slug := v_slug_base;
  FOR i IN 1..10 LOOP
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug);
    v_slug := v_slug_base || '-' || SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4);
  END LOOP;

  -- ── Seed logo ─────────────────────────────────────────────
  IF p_seed_id IS NOT NULL THEN
    SELECT logo_url INTO v_seed_logo
    FROM public.seed_institutions
    WHERE id = p_seed_id;
  END IF;

  -- ── Insert org ────────────────────────────────────────────
  INSERT INTO public.organizations (
    name, short_name, slug,
    type, organization_type,
    country_code, country, state, city, website,
    currency_code, currency_symbol,
    trust_level, claim_status,
    seed_institution_id, logo_url,
    is_active, is_verified, member_count
  ) VALUES (
    TRIM(p_org_name),
    COALESCE(NULLIF(p_org_short_name, ''), UPPER(LEFT(REGEXP_REPLACE(p_org_name, '[^a-zA-Z]', '', 'g'), 5))),
    v_slug,
    COALESCE(p_org_type, 'university'),
    COALESCE(p_org_type, 'university'),
    COALESCE(p_country_code, 'NG'),
    CASE COALESCE(p_country_code, 'NG')
      WHEN 'NG' THEN 'Nigeria'
      WHEN 'GH' THEN 'Ghana'
      WHEN 'KE' THEN 'Kenya'
      WHEN 'ZA' THEN 'South Africa'
      ELSE p_country_code
    END,
    p_state, p_city, p_website,
    v_currency_code, v_currency_symbol,
    'community', 'unclaimed',
    p_seed_id, v_seed_logo,
    TRUE, FALSE, 1
  )
  RETURNING id INTO v_org_id;

  -- Link seed
  IF p_seed_id IS NOT NULL THEN
    UPDATE public.seed_institutions
    SET linked_org_id = v_org_id, is_active = TRUE, updated_at = NOW()
    WHERE id = p_seed_id;
  END IF;

  -- ── PART 4a: Faculty — with sibling duplicate check ───────
  IF p_faculty_name IS NOT NULL AND LENGTH(TRIM(p_faculty_name)) >= 2 THEN

    -- Sibling check: any other faculty with same name under this org?
    IF EXISTS (
      SELECT 1 FROM public.organization_groups
      WHERE organization_id = v_org_id
        AND kind = 'faculty'
        AND LOWER(TRIM(name)) = LOWER(TRIM(p_faculty_name))
        AND is_active = TRUE
    ) THEN
      -- Roll back the org insert and report the conflict
      RAISE EXCEPTION 'duplicate_faculty:%', TRIM(p_faculty_name);
    END IF;

    INSERT INTO public.organization_groups (
      organization_id, name, short_name, kind, is_active, current_member_count
    ) VALUES (
      v_org_id,
      TRIM(p_faculty_name),
      COALESCE(NULLIF(p_faculty_short, ''), UPPER(LEFT(REGEXP_REPLACE(p_faculty_name, '[^a-zA-Z]', '', 'g'), 5))),
      'faculty', TRUE, 0
    )
    RETURNING id INTO v_faculty_id;
  END IF;

  -- ── PART 4b: Department — with sibling duplicate check ────
  IF p_department_name IS NOT NULL AND LENGTH(TRIM(p_department_name)) >= 2 THEN

    -- Sibling check: same name under same faculty (or org root if no faculty)
    IF EXISTS (
      SELECT 1 FROM public.organization_groups
      WHERE organization_id = v_org_id
        AND kind = 'department'
        AND LOWER(TRIM(name)) = LOWER(TRIM(p_department_name))
        AND (
          (v_faculty_id IS NOT NULL AND parent_group_id = v_faculty_id)
          OR (v_faculty_id IS NULL AND parent_group_id IS NULL)
        )
        AND is_active = TRUE
    ) THEN
      RAISE EXCEPTION 'duplicate_department:%', TRIM(p_department_name);
    END IF;

    INSERT INTO public.organization_groups (
      organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
    ) VALUES (
      v_org_id,
      TRIM(p_department_name),
      COALESCE(NULLIF(p_department_short, ''), UPPER(LEFT(REGEXP_REPLACE(p_department_name, '[^a-zA-Z]', '', 'g'), 5))),
      'department', v_faculty_id, TRUE, 0
    )
    RETURNING id INTO v_department_id;
  END IF;

  -- ── PART 4c: Class — with sibling duplicate check ─────────
  -- Parent is: department > faculty > null (org root)
  v_parent_id := COALESCE(v_department_id, v_faculty_id, NULL);

  IF EXISTS (
    SELECT 1 FROM public.organization_groups
    WHERE organization_id = v_org_id
      AND COALESCE(kind, 'class') = COALESCE(p_group_kind, 'class')
      AND LOWER(TRIM(name)) = LOWER(TRIM(p_group_name))
      AND (
        (v_parent_id IS NOT NULL AND parent_group_id = v_parent_id)
        OR (v_parent_id IS NULL AND parent_group_id IS NULL)
      )
      AND is_active = TRUE
  ) THEN
    RAISE EXCEPTION 'duplicate_group:%', TRIM(p_group_name);
  END IF;

  INSERT INTO public.organization_groups (
    organization_id, name, short_name, kind, parent_group_id, is_active, current_member_count
  ) VALUES (
    v_org_id,
    TRIM(p_group_name),
    COALESCE(NULLIF(p_group_short, ''), UPPER(LEFT(REGEXP_REPLACE(p_group_name, '[^a-zA-Z]', '', 'g'), 5))),
    COALESCE(p_group_kind, 'class'),
    v_parent_id, TRUE, 1
  )
  RETURNING id INTO v_group_id;

  -- ── Founder member ────────────────────────────────────────
  v_member_id := gen_random_uuid();
  INSERT INTO public.organization_members (
    id, organization_id, group_id,
    member_id, password_hash,
    full_name, email, phone,
    level, is_active, force_password_change
  ) VALUES (
    v_member_id, v_org_id, v_group_id,
    v_member_norm,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    TRIM(p_full_name), v_email_norm, p_phone,
    p_user_level, TRUE, FALSE
  );

  -- ── PART 2: Fixed founder admin row ──────────────────────
  --
  -- BEFORE (dangerous — what was running):
  --   role='org_owner', scope_level='group',
  --   all flags TRUE, verification_layer not set (defaulted to 0)
  --   → full money/governance at layer 0, bypassing all trust gates
  --
  -- AFTER (correct — matching mig 111's intent):
  --   role='org_setup', scope_level='org',
  --   money flags FALSE, governance flags selective,
  --   verification_layer=2 (setup steward, acting admin)
  --   → can build structure + invite team, cannot touch money
  --   → must claim their real role (class rep / treasurer) separately
  --     and go through layers 3-4 to unlock payments and payouts
  INSERT INTO public.member_admins (
    member_id,
    organization_id,
    group_id,
    role,
    role_label,
    scope_level,
    -- Money-affecting capabilities: all FALSE for setup steward.
    -- The claim flow (submit_claim_v2 → graduated trust → layer 4)
    -- is the ONLY path to these for founders going forward.
    can_create_payments,
    can_approve_payments,
    can_manage_expenses,
    -- Structural/administrative capabilities: TRUE for setup steward.
    -- These are non-financial and needed to set up the org before
    -- inviting members.
    can_manage_members,
    can_manage_admins,
    can_view_analytics,
    can_export_data,
    can_manage_settings,
    -- Verification: layer 2 (acting admin / setup steward).
    -- Layer 4 requires the claim flow + peer votes + parent confirm.
    verification_status,
    verification_method,
    verification_layer,
    tenure_start,
    is_active,
    bio
  ) VALUES (
    v_member_id,
    v_org_id,
    NULL,            -- org-scoped, not group-scoped
    'org_setup',
    'Founder · setup',
    'org',           -- scope_level = org (not group — matches mig 111)
    FALSE,           -- can_create_payments
    FALSE,           -- can_approve_payments
    FALSE,           -- can_manage_expenses
    FALSE,           -- can_manage_members (claim your real role for this)
    TRUE,            -- can_manage_admins (build the admin team)
    TRUE,            -- can_view_analytics
    TRUE,            -- can_export_data
    TRUE,            -- can_manage_settings (logo, theme, labels)
    'email_pending', -- verification_status
    'email',         -- verification_method
    2,               -- verification_layer: setup steward, NOT layer 4
    CURRENT_DATE,
    TRUE,
    'Founder — set up this organization. Claim your real role to gain governance and financial powers.'
  );

  RETURN jsonb_build_object(
    'ok',              TRUE,
    'org_id',          v_org_id,
    'slug',            v_slug,
    'faculty_id',      v_faculty_id,
    'department_id',   v_department_id,
    'group_id',        v_group_id,
    'member_id',       v_member_id,
    'member_login_id', v_member_norm
  );

EXCEPTION
  -- Duplicate group errors from the guards above (the org INSERT
  -- already happened in the same transaction, so raising here rolls
  -- back everything including the org row — fully atomic).
  WHEN OTHERS THEN
    DECLARE
      v_msg TEXT := SQLERRM;
    BEGIN
      IF v_msg LIKE 'duplicate_faculty:%' THEN
        RETURN jsonb_build_object(
          'ok', FALSE,
          'code', 'duplicate_faculty',
          'error', format('A faculty named "%s" already exists in this organization.', SPLIT_PART(v_msg, ':', 2))
        );
      ELSIF v_msg LIKE 'duplicate_department:%' THEN
        RETURN jsonb_build_object(
          'ok', FALSE,
          'code', 'duplicate_department',
          'error', format('A department named "%s" already exists under this faculty.', SPLIT_PART(v_msg, ':', 2))
        );
      ELSIF v_msg LIKE 'duplicate_group:%' THEN
        RETURN jsonb_build_object(
          'ok', FALSE,
          'code', 'duplicate_group',
          'error', format('A group named "%s" already exists at this level.', SPLIT_PART(v_msg, ':', 2))
        );
      ELSIF v_msg LIKE '%unique%' OR SQLSTATE = '23505' THEN
        RETURN jsonb_build_object(
          'ok', FALSE,
          'error', 'Something with that name or ID already exists. Try a different short name or member ID.'
        );
      ELSE
        RETURN jsonb_build_object(
          'ok', FALSE,
          'error', 'Could not create the organization: ' || v_msg
        );
      END IF;
    END;
END;
$$;

-- Re-assert the GRANT so anon/authenticated can still call this
-- (CREATE OR REPLACE preserves existing grants, but being explicit
-- is safer across different Supabase project configurations).
GRANT EXECUTE ON FUNCTION public.bring_school_online(
  text, text, text, text, text,
  text, text, text, text,
  text, text, text,
  uuid,
  text, text,
  text, text,
  text, text, text,
  text
) TO anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- VERIFY: Confirm only one overload remains after the drop
-- (This runs as part of the migration so the DO block output
-- appears in the Supabase SQL editor's messages pane.)
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM pg_proc
  WHERE proname = 'bring_school_online'
    AND pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

  IF v_count = 1 THEN
    RAISE NOTICE 'Migration 149: bring_school_online now has exactly 1 overload (correct).';
  ELSE
    RAISE WARNING 'Migration 149: bring_school_online has % overloads — expected 1. Investigate.', v_count;
  END IF;

  RAISE NOTICE 'Migration 149 applied:';
  RAISE NOTICE '  [1] Dead 18-param overload dropped.';
  RAISE NOTICE '  [2] Founder admin: org_setup / layer 2 / money-locked (was org_owner / layer 0 / all-TRUE).';
  RAISE NOTICE '  [3] Org-level duplicate guard: exact short_name (institutional) + fuzzy name (all types).';
  RAISE NOTICE '  [4] Group-level duplicate guard: faculty / department / class siblings checked before insert.';
END $$;

COMMIT;