-- ============================================================
-- Migration 014: member_admins verification + tenure
--
-- Goal:
-- Extend the existing member_admins table (created in mig 004) with
-- claim-flow verification metadata and tenure tracking. This is
-- what powers the trust chain: every admin row now records HOW
-- they were verified (email / member vote / document / invite code)
-- and WHEN their tenure starts and ends.
--
-- This migration is additive and idempotent.
--
-- Depends on: 004_rls_policies.sql (member_admins table)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Add verification columns
-- ------------------------------------------------------------
ALTER TABLE public.member_admins
  -- Verification trail
  ADD COLUMN IF NOT EXISTS verification_status TEXT NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS verification_method TEXT,
  ADD COLUMN IF NOT EXISTS verified_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS verified_by         UUID,           -- platform admin or auto-verifier ref

  -- Scope (org-wide vs unit-wide vs single group)
  ADD COLUMN IF NOT EXISTS scope_level TEXT NOT NULL DEFAULT 'group',

  -- Tenure (executives have terms)
  ADD COLUMN IF NOT EXISTS tenure_start DATE,
  ADD COLUMN IF NOT EXISTS tenure_end   DATE,

  -- Trust-chain linkage (who vouched for this admin)
  ADD COLUMN IF NOT EXISTS invited_by_admin_id UUID,

  -- Public display
  ADD COLUMN IF NOT EXISTS role_label TEXT,    -- friendly label e.g. "Financial Secretary"
  ADD COLUMN IF NOT EXISTS bio        TEXT;

-- ------------------------------------------------------------
-- 2) Constraints
-- ------------------------------------------------------------
DO $$
BEGIN
  -- verification_status
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='member_admins'
      AND constraint_name='chk_member_admins_verification_status'
  ) THEN
    ALTER TABLE public.member_admins
      ADD CONSTRAINT chk_member_admins_verification_status
      CHECK (verification_status IN (
        'pending',
        'email_verified',
        'member_confirmed',
        'document_verified',
        'admin_verified',
        'rejected',
        'revoked'
      ));
  END IF;

  -- verification_method
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='member_admins'
      AND constraint_name='chk_member_admins_verification_method'
  ) THEN
    ALTER TABLE public.member_admins
      ADD CONSTRAINT chk_member_admins_verification_method
      CHECK (verification_method IS NULL OR verification_method IN (
        'email','member_vote','document','invite_code','admin','legacy'
      ));
  END IF;

  -- scope_level
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='member_admins'
      AND constraint_name='chk_member_admins_scope_level'
  ) THEN
    ALTER TABLE public.member_admins
      ADD CONSTRAINT chk_member_admins_scope_level
      CHECK (scope_level IN ('org','unit','group'));
  END IF;

  -- self-FK for trust chain
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='member_admins'
      AND constraint_name='fk_member_admins_invited_by'
  ) THEN
    ALTER TABLE public.member_admins
      ADD CONSTRAINT fk_member_admins_invited_by
      FOREIGN KEY (invited_by_admin_id)
      REFERENCES public.member_admins(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3) Indexes
-- ------------------------------------------------------------
CREATE INDEX IF NOT EXISTS idx_member_admins_verification_status
  ON public.member_admins (organization_id, verification_status);

CREATE INDEX IF NOT EXISTS idx_member_admins_active_verified
  ON public.member_admins (organization_id, is_active, verification_status)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_member_admins_invited_by
  ON public.member_admins (invited_by_admin_id)
  WHERE invited_by_admin_id IS NOT NULL;

-- ------------------------------------------------------------
-- 4) Backfill existing rows
--
-- Every admin who existed before this migration was created via
-- the legacy platform-admin-only flow. Treat them as
-- admin_verified with method='legacy' so they keep working.
-- ------------------------------------------------------------
UPDATE public.member_admins
SET
  verification_status = 'admin_verified',
  verification_method = 'legacy',
  verified_at         = COALESCE(verified_at, created_at)
WHERE verification_status = 'pending'
  AND is_active = TRUE;

-- ------------------------------------------------------------
-- 5) Verification
-- ------------------------------------------------------------
DO $$
DECLARE
  total INTEGER;
  verified INTEGER;
BEGIN
  SELECT COUNT(*) INTO total FROM public.member_admins;
  SELECT COUNT(*) INTO verified FROM public.member_admins WHERE verification_status != 'pending';

  RAISE NOTICE 'Migration 014 complete: member_admins extended with verification trail.';
  RAISE NOTICE '  Total admin rows: %', total;
  RAISE NOTICE '  Verified (incl legacy backfill): %', verified;
END $$;

COMMIT;
