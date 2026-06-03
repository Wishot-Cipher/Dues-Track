-- ============================================================
-- Migration 025: Fix table-level GRANTs for new objects
--
-- WHY:
-- Supabase RLS only enforces row visibility AFTER the role has
-- basic SQL privileges on the table. When a table is created via
-- raw SQL (instead of the Supabase Table Editor UI), no GRANTs
-- are issued to anon / authenticated. The result: even though
-- mig 011's `seed_institutions_public_read` policy says
-- `USING (true)`, the anon role still sees nothing — because
-- it doesn't have SELECT at the SQL level.
--
-- This migration adds the GRANTs that the Supabase UI would
-- have added automatically. It is idempotent.
--
-- Side effect: also re-grants on the views created in mig 012,
-- 016, 022 to make sure the landing page can read them without
-- auth.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- Tables created in mig 011, 015, 016, 017
-- ──────────────────────────────────────────────────────────────

-- seed_institutions — public discovery, anon can read
GRANT SELECT ON public.seed_institutions TO anon, authenticated;
-- service_role inserts via the seed script
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seed_institutions TO service_role;

-- claim_requests — claimant + org members + execs can read (RLS gates)
GRANT SELECT, INSERT, UPDATE ON public.claim_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_requests TO service_role;

-- claim_votes — voters insert, org execs read (RLS gates)
GRANT SELECT, INSERT ON public.claim_votes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_votes TO service_role;

-- executive_invite_codes — verified admins read/write, RLS gates
GRANT SELECT, INSERT, UPDATE ON public.executive_invite_codes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.executive_invite_codes TO service_role;

-- platform_earnings — RLS allows only super_admins; auth gets SELECT
-- (RLS will filter; no rows leak)
GRANT SELECT ON public.platform_earnings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.platform_earnings TO service_role;

-- organization_requests — anyone authenticated can create one
GRANT SELECT, INSERT ON public.organization_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_requests TO service_role;

-- ──────────────────────────────────────────────────────────────
-- Views created in mig 012, 016, 022
-- ──────────────────────────────────────────────────────────────

GRANT SELECT ON public.organizations_public      TO anon, authenticated;
GRANT SELECT ON public.org_group_summary         TO anon, authenticated;
-- platform_earnings_summary stays admin-only (selecting it goes through RLS on the base table)
GRANT SELECT ON public.platform_earnings_summary TO authenticated;

-- ──────────────────────────────────────────────────────────────
-- Belt-and-braces: ensure pre-existing tables still have grants
-- (these should already exist from initial setup, but re-stating
-- them is harmless and prevents drift)
-- ──────────────────────────────────────────────────────────────

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations         TO authenticated;
GRANT SELECT                          ON public.organizations         TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_groups   TO authenticated;
GRANT SELECT                          ON public.organization_groups   TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_members  TO authenticated;
GRANT SELECT                          ON public.organization_members  TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organization_settings TO authenticated;
GRANT SELECT                          ON public.organization_settings TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.member_admins         TO authenticated;
GRANT SELECT                          ON public.member_admins         TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payment_types         TO authenticated;
GRANT SELECT                          ON public.payment_types         TO anon;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payments              TO authenticated;
GRANT SELECT                          ON public.payments              TO anon;

-- ──────────────────────────────────────────────────────────────
-- Sequence usage — required for tables with DEFAULT nextval()
-- ──────────────────────────────────────────────────────────────
GRANT USAGE ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ──────────────────────────────────────────────────────────────
-- Verification
-- ──────────────────────────────────────────────────────────────
DO $$
DECLARE
  seed_count INTEGER;
  org_count INTEGER;
BEGIN
  -- Count rows visible to a hypothetical anon user
  EXECUTE 'SELECT COUNT(*) FROM public.seed_institutions' INTO seed_count;
  EXECUTE 'SELECT COUNT(*) FROM public.organizations WHERE is_active = TRUE' INTO org_count;

  RAISE NOTICE 'Migration 025 complete: GRANTs fixed.';
  RAISE NOTICE '  seed_institutions rows: %', seed_count;
  RAISE NOTICE '  active organizations:   %', org_count;
  IF seed_count = 0 THEN
    RAISE NOTICE '';
    RAISE NOTICE 'NOTE: seed_institutions is EMPTY.';
    RAISE NOTICE 'Run the seeder to populate it:';
    RAISE NOTICE '  SUPABASE_SERVICE_ROLE_KEY=... npm run seed:ng';
  END IF;
END $$;

COMMIT;
