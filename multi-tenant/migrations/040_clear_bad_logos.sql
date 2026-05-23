-- ============================================================
-- Migration 040: Clear unreliable Wikipedia logo URLs
--
-- The URLs I seeded in mig 038 were Wikipedia commons paths that
-- either 404, redirect, or get rate-limited. The OrgOverviewPage
-- header was showing the broken-image icon for every uni.
--
-- Fix: NULL them all. The header already has an initials fallback
-- (the first letter of the org's short_name on a brand-orange
-- gradient — actually looks great). Real logos should be uploaded
-- by org admins via Settings → Branding → Upload logo, which
-- stores to Supabase Storage and writes the public URL into
-- organizations.logo_url.
--
-- This migration is safe to re-run — it only nulls upload.wikimedia.org
-- URLs, leaving any admin-uploaded logos intact.
-- ============================================================

BEGIN;

-- Clear from seed_institutions
UPDATE public.seed_institutions
SET logo_url = NULL,
    updated_at = NOW()
WHERE logo_url LIKE 'https://upload.wikimedia.org/%';

-- Clear from orgs that inherited the bad URL via bring_school_online
UPDATE public.organizations
SET logo_url = NULL,
    updated_at = NOW()
WHERE logo_url LIKE 'https://upload.wikimedia.org/%';

DO $$
DECLARE
  cleared_seeds INTEGER;
  cleared_orgs  INTEGER;
BEGIN
  SELECT COUNT(*) INTO cleared_seeds FROM public.seed_institutions WHERE logo_url IS NULL;
  SELECT COUNT(*) INTO cleared_orgs  FROM public.organizations    WHERE logo_url IS NULL;
  RAISE NOTICE 'Migration 040 complete: cleared the bad Wikipedia URLs.';
  RAISE NOTICE '  Seeds without a logo (will fall back to initials): %', cleared_seeds;
  RAISE NOTICE '  Orgs without a logo  (will fall back to initials): %', cleared_orgs;
  RAISE NOTICE '';
  RAISE NOTICE 'Admins can upload real logos via Settings → Branding.';
END $$;

COMMIT;
