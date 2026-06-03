-- ============================================================
-- Migration 006: Production Uniqueness Constraints
--
-- Goal:
-- 1) Enforce unique organization contact emails (case-insensitive)
-- 2) Enforce unique group/department short codes per organization
-- 3) Enforce unique member emails per organization (case-insensitive)
--
-- This migration is idempotent and fails fast when duplicate data exists.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Organizations: unique contact email (case-insensitive)
-- ------------------------------------------------------------
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organizations'
  ) THEN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
      SELECT LOWER(email)
      FROM public.organizations
      WHERE email IS NOT NULL
      GROUP BY LOWER(email)
      HAVING COUNT(*) > 1
    ) dup;

    IF duplicate_count > 0 THEN
      RAISE EXCEPTION 'Cannot enforce unique organization emails: found % duplicate email value(s). Resolve duplicates first.', duplicate_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'idx_org_email_unique_ci'
    ) THEN
      CREATE UNIQUE INDEX idx_org_email_unique_ci
        ON public.organizations (LOWER(email))
        WHERE email IS NOT NULL;
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2) Groups: unique short_name per organization (case-insensitive)
-- ------------------------------------------------------------
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_groups'
  ) THEN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
      SELECT organization_id, LOWER(short_name)
      FROM public.organization_groups
      WHERE short_name IS NOT NULL
      GROUP BY organization_id, LOWER(short_name)
      HAVING COUNT(*) > 1
    ) dup;

    IF duplicate_count > 0 THEN
      RAISE EXCEPTION 'Cannot enforce unique group short names: found % duplicate org/short_name pair(s). Resolve duplicates first.', duplicate_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'idx_org_groups_org_short_name_unique_ci'
    ) THEN
      CREATE UNIQUE INDEX idx_org_groups_org_short_name_unique_ci
        ON public.organization_groups (organization_id, LOWER(short_name));
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3) Members: unique email per organization (case-insensitive)
-- ------------------------------------------------------------
DO $$
DECLARE
  duplicate_count INTEGER;
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_members'
  ) THEN
    SELECT COUNT(*) INTO duplicate_count
    FROM (
      SELECT organization_id, LOWER(email)
      FROM public.organization_members
      WHERE email IS NOT NULL
      GROUP BY organization_id, LOWER(email)
      HAVING COUNT(*) > 1
    ) dup;

    IF duplicate_count > 0 THEN
      RAISE EXCEPTION 'Cannot enforce unique member emails: found % duplicate org/email pair(s). Resolve duplicates first.', duplicate_count;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM pg_indexes
      WHERE schemaname = 'public'
        AND indexname = 'idx_org_members_org_email_unique_ci'
    ) THEN
      CREATE UNIQUE INDEX idx_org_members_org_email_unique_ci
        ON public.organization_members (organization_id, LOWER(email))
        WHERE email IS NOT NULL;
    END IF;
  END IF;
END $$;

DO $$
BEGIN
  RAISE NOTICE 'Migration 006 complete: uniqueness constraints added for org emails, group short names, and member emails.';
END $$;

COMMIT;
