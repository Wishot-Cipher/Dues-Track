-- ============================================================
-- Migration 030: Lock the brand-orange color defaults
--
-- The organizations table has primary_color / secondary_color
-- columns. At some point a purple default ('#6C3AED' or similar)
-- was set via the Supabase Studio UI, so newly created orgs
-- inherited purple unless an explicit color was passed.
--
-- This migration:
--   1. Sets the column DEFAULT to the brand orange (#FF6803)
--      and the brand dark for secondary so all NEW orgs are
--      orange unless explicitly overridden.
--   2. Backfills any existing rows that are still on a purple
--      value to the brand orange — including the variants the
--      earlier cleanup migration missed.
--
-- Safe / idempotent.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1) Column defaults
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.organizations
  ALTER COLUMN primary_color   SET DEFAULT '#FF6803';

-- Secondary is the dark surface, also part of the Payvexo brand
ALTER TABLE public.organizations
  ALTER COLUMN secondary_color SET DEFAULT '#1A0E09';

-- ──────────────────────────────────────────────────────────────
-- 2) Backfill any non-orange or purple values to brand orange
-- ──────────────────────────────────────────────────────────────
UPDATE public.organizations
SET primary_color = '#FF6803'
WHERE primary_color IS NULL
   OR LOWER(primary_color) IN (
        '#6c3aed',   -- legacy Payvexo purple
        '#8b5cf6',   -- tailwind purple-500
        '#8a2be2',   -- blueviolet
        '#7c3aed',   -- tailwind violet-600
        '#a855f7',   -- tailwind purple-500 alt
        '#6d28d9',   -- tailwind violet-700
        '#5b21b6',   -- tailwind violet-800
        '#4c1d95',   -- tailwind violet-900
        '#ff6b35'    -- old original orange (slightly off-brand)
      );

UPDATE public.organizations
SET secondary_color = '#1A0E09'
WHERE secondary_color IS NULL
   OR LOWER(secondary_color) IN (
        '#0a0118',   -- legacy Payvexo dark
        '#1e1b4b',   -- tailwind indigo-950
        '#000000'    -- pure black
      );

-- ──────────────────────────────────────────────────────────────
-- 3) Verification
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  total INTEGER;
  on_brand INTEGER;
BEGIN
  SELECT COUNT(*) INTO total    FROM public.organizations;
  SELECT COUNT(*) INTO on_brand FROM public.organizations
    WHERE LOWER(primary_color) = '#ff6803';
  RAISE NOTICE 'Migration 030 complete: brand orange locked in.';
  RAISE NOTICE '  Total orgs:       %', total;
  RAISE NOTICE '  Brand-orange now: %', on_brand;
END $$;

COMMIT;
