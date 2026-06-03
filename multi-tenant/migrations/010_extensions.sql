-- ============================================================
-- Migration 010: Extensions for Discovery, Search, and Crypto
--
-- Goal:
-- Enable Postgres extensions required by later migrations:
--   - pg_trgm   : fuzzy / trigram similarity search (search bar)
--   - unaccent  : normalize accented characters in search
--   - pgcrypto  : already used in mig 005; ensure it stays enabled
--
-- This migration is additive, idempotent, and safe to re-run.
-- ============================================================

BEGIN;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- Verification
DO $$
BEGIN
  RAISE NOTICE 'Migration 010 complete: extensions enabled (uuid-ossp, pgcrypto, pg_trgm, unaccent)';
END $$;

COMMIT;
