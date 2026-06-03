-- ============================================================
-- Migration 068: Add missing super_admins.updated_at
--
-- Console login failed with 42703 "column updated_at of relation super_admins
-- does not exist". The live table was created before mig 044's definition and
-- never got updated_at, but verify_super_admin / verify_admin_login_code do
-- `UPDATE super_admins SET ... updated_at = NOW()`. Add the column.
-- ============================================================

BEGIN;

ALTER TABLE public.super_admins
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

DO $$
BEGIN
  RAISE NOTICE 'Migration 068 complete: super_admins.updated_at ensured.';
END $$;

COMMIT;
