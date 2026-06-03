-- ============================================================
-- Migration 011: seed_institutions (Discovery Layer)
--
-- Goal:
-- Create the discovery table that backs the landing-page search.
-- These are pre-loaded from NUC / NBTE / NCCE (Nigeria) and Wikidata
-- (global). Search queries this table when an org has not been
-- created yet so users can request to add their school.
--
-- This migration is additive and idempotent.
-- Depends on: 010_extensions.sql (pg_trgm)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) The seed_institutions table
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.seed_institutions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name            TEXT NOT NULL,
  short_name      TEXT,
  aliases         TEXT[] DEFAULT '{}',                  -- {"UNN","Nsukka","Lion University"}

  -- Location
  country_code    TEXT NOT NULL DEFAULT 'NG',           -- ISO 3166-1 alpha-2
  state           TEXT,
  city            TEXT,

  -- Classification
  type            TEXT NOT NULL DEFAULT 'university',   -- see CHECK below
  ownership       TEXT,                                 -- federal | state | private

  -- Contact + lookup
  website         TEXT,
  email_domain    TEXT,                                 -- 'unn.edu.ng' — used for auto exec verification
  logo_url        TEXT,

  -- External identifiers
  jamb_code       TEXT,
  wikidata_id     TEXT,                                 -- 'Q1067478' etc.

  -- Lifecycle
  is_active       BOOLEAN NOT NULL DEFAULT FALSE,       -- flips TRUE when an org is created from this seed
  linked_org_id   UUID,                                 -- FK to organizations.id, populated on link
  source          TEXT NOT NULL DEFAULT 'manual',       -- nuc | nbte | ncce | jamb | wikidata | manual

  -- Audit
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_seed_institution_type
    CHECK (type IN ('university','polytechnic','college_of_education','monotechnic','seminary','other')),
  CONSTRAINT chk_seed_institution_source
    CHECK (source IN ('nuc','nbte','ncce','jamb','wikidata','manual'))
);

-- ------------------------------------------------------------
-- 2) FK to organizations is added AFTER the table exists.
-- (organizations already exists from mig 001.)
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.table_constraints
    WHERE table_schema='public'
      AND table_name='seed_institutions'
      AND constraint_name='fk_seed_institution_linked_org'
  ) THEN
    ALTER TABLE public.seed_institutions
      ADD CONSTRAINT fk_seed_institution_linked_org
      FOREIGN KEY (linked_org_id)
      REFERENCES public.organizations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3) Indexes for search and lookups
-- ------------------------------------------------------------

-- Trigram index on name for fuzzy search ("UNN" matches "University of Nigeria")
CREATE INDEX IF NOT EXISTS idx_seed_institutions_name_trgm
  ON public.seed_institutions USING GIN (name gin_trgm_ops);

-- GIN index on aliases array
CREATE INDEX IF NOT EXISTS idx_seed_institutions_aliases_gin
  ON public.seed_institutions USING GIN (aliases);

-- Country / state filters
CREATE INDEX IF NOT EXISTS idx_seed_institutions_country
  ON public.seed_institutions (country_code);

CREATE INDEX IF NOT EXISTS idx_seed_institutions_state
  ON public.seed_institutions (state)
  WHERE state IS NOT NULL;

-- Email domain lookup (for school-email auto-verification in claim flow)
CREATE INDEX IF NOT EXISTS idx_seed_institutions_email_domain
  ON public.seed_institutions (email_domain)
  WHERE email_domain IS NOT NULL;

-- Active / not-yet-claimed seeds (the discovery layer hits this hot path)
CREATE INDEX IF NOT EXISTS idx_seed_institutions_not_linked
  ON public.seed_institutions (country_code, type)
  WHERE linked_org_id IS NULL;

-- ------------------------------------------------------------
-- 4) updated_at trigger (reuses the function from mig 001 / 005)
-- ------------------------------------------------------------
DROP TRIGGER IF EXISTS trigger_seed_institutions_updated_at
  ON public.seed_institutions;

CREATE TRIGGER trigger_seed_institutions_updated_at
  BEFORE UPDATE ON public.seed_institutions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ------------------------------------------------------------
-- 5) Row Level Security
--
-- Read: open to everyone (this is the public discovery layer).
-- Write: service_role only — the seeding job uses service key.
-- ------------------------------------------------------------
ALTER TABLE public.seed_institutions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seed_institutions_public_read ON public.seed_institutions;
CREATE POLICY seed_institutions_public_read
  ON public.seed_institutions
  FOR SELECT
  USING (true);

DROP POLICY IF EXISTS seed_institutions_service_write ON public.seed_institutions;
CREATE POLICY seed_institutions_service_write
  ON public.seed_institutions
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------
-- 6) Verification
-- ------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'Migration 011 complete: seed_institutions table created.';
  RAISE NOTICE 'Next: run scripts/seed-nigerian-institutions.ts to populate it.';
END $$;

COMMIT;
