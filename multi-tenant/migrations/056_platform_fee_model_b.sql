-- ============================================================
-- Migration 056: Platform fee = Model B (flat 2%, ₦50 floor, ₦500 cap)
--
-- The previous default (₦75 flat + 1.5%) was regressive on small dues —
-- ₦105 (5.25%) on a ₦2,000 due, ₦90 (9%) on ₦1,000. Model B is a simple
-- "2% service fee", floored at ₦50 and capped at ₦500, which is fair across
-- due sizes and easy to explain to students.
--
-- Amounts are in kobo. Sets the column defaults (new orgs) AND updates every
-- existing org so the whole platform is consistent.
-- ============================================================

BEGIN;

-- New-org defaults
ALTER TABLE public.organizations ALTER COLUMN platform_fee_mode    SET DEFAULT 'percent';
ALTER TABLE public.organizations ALTER COLUMN platform_fee_percent SET DEFAULT 2.00;
ALTER TABLE public.organizations ALTER COLUMN platform_fee_flat    SET DEFAULT 0;
ALTER TABLE public.organizations ALTER COLUMN platform_fee_min     SET DEFAULT 5000;   -- ₦50
ALTER TABLE public.organizations ALTER COLUMN platform_fee_cap     SET DEFAULT 50000;  -- ₦500

-- Apply to all existing orgs
UPDATE public.organizations SET
  platform_fee_mode    = 'percent',
  platform_fee_percent = 2.00,
  platform_fee_flat    = 0,
  platform_fee_min     = 5000,
  platform_fee_cap     = 50000,
  updated_at           = NOW();

DO $$
DECLARE n INTEGER;
BEGIN
  SELECT COUNT(*) INTO n FROM public.organizations;
  RAISE NOTICE 'Migration 056 complete: Model B fee (2%%, ₦50 floor, ₦500 cap) applied to % org(s).', n;
END $$;

COMMIT;
