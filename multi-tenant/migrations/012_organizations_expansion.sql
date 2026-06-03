-- ============================================================
-- Migration 012: Expand organizations table
--
-- Goal:
-- Add trust/claim system, terminology labels, platform fee config,
-- Paystack subaccount config, and seed-institution linkage to
-- the existing organizations table.
--
-- This migration is additive and idempotent. It does NOT drop
-- or rename any existing columns.
--
-- Depends on: 001_organizations.sql, 011_seed_institutions.sql
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Add new columns to organizations
-- ------------------------------------------------------------
ALTER TABLE public.organizations
  -- Trust & verification system
  ADD COLUMN IF NOT EXISTS trust_level TEXT NOT NULL DEFAULT 'community',
  ADD COLUMN IF NOT EXISTS claim_status TEXT NOT NULL DEFAULT 'unclaimed',
  ADD COLUMN IF NOT EXISTS verification_score INTEGER NOT NULL DEFAULT 0,

  -- Identity / discovery
  ADD COLUMN IF NOT EXISTS description TEXT,
  ADD COLUMN IF NOT EXISTS email_domain TEXT,
  ADD COLUMN IF NOT EXISTS seed_institution_id UUID,
  ADD COLUMN IF NOT EXISTS founded_by_user_id UUID,

  -- Classification (organization "type" — the existing schema only has subscription_plan)
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'university',
  ADD COLUMN IF NOT EXISTS country_code TEXT NOT NULL DEFAULT 'NG',
  ADD COLUMN IF NOT EXISTS state TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,

  -- Org-chosen terminology
  ADD COLUMN IF NOT EXISTS unit_label         TEXT NOT NULL DEFAULT 'Faculty',
  ADD COLUMN IF NOT EXISTS unit_label_plural  TEXT NOT NULL DEFAULT 'Faculties',
  ADD COLUMN IF NOT EXISTS group_label        TEXT NOT NULL DEFAULT 'Department',
  ADD COLUMN IF NOT EXISTS group_label_plural TEXT NOT NULL DEFAULT 'Departments',
  ADD COLUMN IF NOT EXISTS member_label       TEXT NOT NULL DEFAULT 'Student',
  ADD COLUMN IF NOT EXISTS member_label_plural TEXT NOT NULL DEFAULT 'Students',
  ADD COLUMN IF NOT EXISTS payment_label      TEXT NOT NULL DEFAULT 'Dues',
  ADD COLUMN IF NOT EXISTS admin_label        TEXT NOT NULL DEFAULT 'Executive',

  -- Platform fee config (all amounts in smallest currency unit; for NGN that's kobo)
  ADD COLUMN IF NOT EXISTS platform_fee_mode    TEXT NOT NULL DEFAULT 'hybrid',
  ADD COLUMN IF NOT EXISTS platform_fee_flat    INTEGER NOT NULL DEFAULT 7500,    -- ₦75
  ADD COLUMN IF NOT EXISTS platform_fee_percent NUMERIC(5,2) NOT NULL DEFAULT 1.50,
  ADD COLUMN IF NOT EXISTS platform_fee_min     INTEGER NOT NULL DEFAULT 5000,    -- ₦50
  ADD COLUMN IF NOT EXISTS platform_fee_cap     INTEGER NOT NULL DEFAULT 50000,   -- ₦500

  -- Paystack split-payment integration
  ADD COLUMN IF NOT EXISTS paystack_subaccount_code   TEXT,
  ADD COLUMN IF NOT EXISTS paystack_business_name     TEXT,
  ADD COLUMN IF NOT EXISTS paystack_settlement_bank   TEXT,
  ADD COLUMN IF NOT EXISTS paystack_account_number    TEXT,
  ADD COLUMN IF NOT EXISTS paystack_account_name      TEXT,
  ADD COLUMN IF NOT EXISTS paystack_verified          BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS paystack_percentage_charge NUMERIC(5,2),               -- percent of split going to org

  -- Denormalized counts (for fast cards on the explore page)
  ADD COLUMN IF NOT EXISTS member_count INTEGER NOT NULL DEFAULT 0,

  -- Activity for dormancy detection
  ADD COLUMN IF NOT EXISTS last_activity_at TIMESTAMPTZ;

-- ------------------------------------------------------------
-- 2) CHECK constraints (added conditionally so reruns don't fail)
-- ------------------------------------------------------------
DO $$
BEGIN
  -- trust_level
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='organizations'
      AND constraint_name='chk_org_trust_level'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT chk_org_trust_level
      CHECK (trust_level IN ('seed','community','recognized','verified','official'));
  END IF;

  -- claim_status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='organizations'
      AND constraint_name='chk_org_claim_status'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT chk_org_claim_status
      CHECK (claim_status IN ('unclaimed','pending','claimed','disputed','frozen'));
  END IF;

  -- type
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='organizations'
      AND constraint_name='chk_org_type'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT chk_org_type
      CHECK (type IN (
        'university','polytechnic','college_of_education','monotechnic',
        'seminary','church','club','association','ngo','company','other'
      ));
  END IF;

  -- platform_fee_mode
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='organizations'
      AND constraint_name='chk_org_fee_mode'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT chk_org_fee_mode
      CHECK (platform_fee_mode IN ('flat','percent','hybrid'));
  END IF;

  -- seed_institution_id FK
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='organizations'
      AND constraint_name='fk_org_seed_institution'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT fk_org_seed_institution
      FOREIGN KEY (seed_institution_id)
      REFERENCES public.seed_institutions(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3) Indexes for the new columns
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_organizations_trust_level
  ON public.organizations (trust_level);

CREATE INDEX IF NOT EXISTS idx_organizations_claim_status
  ON public.organizations (claim_status);

CREATE INDEX IF NOT EXISTS idx_organizations_type
  ON public.organizations (type);

CREATE INDEX IF NOT EXISTS idx_organizations_country
  ON public.organizations (country_code);

CREATE INDEX IF NOT EXISTS idx_organizations_email_domain
  ON public.organizations (email_domain)
  WHERE email_domain IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_seed_institution
  ON public.organizations (seed_institution_id)
  WHERE seed_institution_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_organizations_name_trgm
  ON public.organizations USING GIN (name gin_trgm_ops);

-- ------------------------------------------------------------
-- 4) Backfill existing rows with sane defaults
--
-- All orgs that already exist (e.g. FUTO seed) were created by the
-- platform admin under the legacy "only admin can create" rule, so
-- treat them as verified + claimed by default. New orgs created
-- after this migration will start at trust_level='community'
-- per the column DEFAULT.
-- ------------------------------------------------------------
UPDATE public.organizations
SET
  trust_level = COALESCE(NULLIF(trust_level,''), 'verified'),
  claim_status = COALESCE(NULLIF(claim_status,''), 'claimed'),
  verification_score = GREATEST(verification_score, 75),
  type = COALESCE(NULLIF(type,''), 'university')
WHERE is_verified = TRUE
  AND (trust_level = 'community' OR trust_level IS NULL);

-- ------------------------------------------------------------
-- 5) Public-facing org view (used by search results)
-- Returns only fields safe to expose without auth.
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.organizations_public AS
SELECT
  id, name, short_name, slug, description, logo_url,
  type, country_code, state, city,
  trust_level, claim_status,
  unit_label, unit_label_plural,
  group_label, group_label_plural,
  member_label, member_label_plural,
  payment_label, admin_label,
  member_count, last_activity_at,
  is_active, created_at
FROM public.organizations
WHERE is_active = TRUE;

GRANT SELECT ON public.organizations_public TO anon, authenticated;

-- ------------------------------------------------------------
-- 6) Verification
-- ------------------------------------------------------------
DO $$
DECLARE
  org_count INTEGER;
  promoted_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO org_count FROM public.organizations;
  SELECT COUNT(*) INTO promoted_count FROM public.organizations WHERE trust_level = 'verified';
  RAISE NOTICE 'Migration 012 complete: organizations expanded.';
  RAISE NOTICE '  Total organizations:    %', org_count;
  RAISE NOTICE '  Promoted to verified:   %', promoted_count;
END $$;

COMMIT;
