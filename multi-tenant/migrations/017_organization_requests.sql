-- ============================================================
-- Migration 017: organization_requests
--
-- Goal:
-- Capture every "I want my school added" signal from the landing
-- page search. This is the lead engine: when search finds nothing,
-- the user submits this form. Most submissions auto-create the org
-- at trust_level='community', but the request row is kept anyway
-- so we know which schools have demand even if creation failed.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.organization_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who asked
  requested_by_user_id UUID NOT NULL,                                   -- = auth.uid()

  -- What they're asking for
  name            TEXT NOT NULL,
  short_name      TEXT,
  type            TEXT NOT NULL DEFAULT 'university',
  country_code    TEXT NOT NULL DEFAULT 'NG',
  state           TEXT,
  city            TEXT,
  website         TEXT,
  requester_role  TEXT,                                                  -- student | staff | exec | member

  -- Linkage when we resolved it
  status              TEXT NOT NULL DEFAULT 'pending',
  matched_seed_id     UUID REFERENCES public.seed_institutions(id),
  created_org_id      UUID REFERENCES public.organizations(id),

  -- Admin review (used only when auto-creation can't happen)
  reviewed_by_user_id UUID,
  reviewer_notes      TEXT,
  reviewed_at         TIMESTAMPTZ,

  -- Audit
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_org_request_status CHECK (status IN (
    'pending',
    'auto_created',
    'approved',
    'rejected',
    'duplicate'
  )),
  CONSTRAINT chk_org_request_type CHECK (type IN (
    'university','polytechnic','college_of_education','monotechnic',
    'seminary','church','club','association','ngo','company','other'
  ))
);

CREATE INDEX IF NOT EXISTS idx_organization_requests_status
  ON public.organization_requests (status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_organization_requests_user
  ON public.organization_requests (requested_by_user_id);

CREATE INDEX IF NOT EXISTS idx_organization_requests_country
  ON public.organization_requests (country_code, status);

CREATE INDEX IF NOT EXISTS idx_organization_requests_name_trgm
  ON public.organization_requests USING GIN (name gin_trgm_ops);

DROP TRIGGER IF EXISTS trigger_organization_requests_updated_at ON public.organization_requests;
CREATE TRIGGER trigger_organization_requests_updated_at
  BEFORE UPDATE ON public.organization_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DO $$
BEGIN
  RAISE NOTICE 'Migration 017 complete: organization_requests table created.';
END $$;

COMMIT;
