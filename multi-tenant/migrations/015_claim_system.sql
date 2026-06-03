-- ============================================================
-- Migration 015: Claim System
--
-- Goal:
-- Create the three tables that power the executive claim flow
-- (Flow C in the blueprint):
--   1. claim_requests          — a person claiming an exec role on an org
--   2. claim_votes             — members voting to confirm/reject a claim
--   3. executive_invite_codes  — verified execs inviting other execs
--
-- All tables are tenant-scoped via organization_id and protected
-- by RLS policies (added in mig 019).
--
-- Depends on: organizations, organization_groups, organization_members,
--             member_admins, profiles (auth.users)
-- ============================================================

BEGIN;

-- ============================================================
-- 1) claim_requests
-- ============================================================
CREATE TABLE IF NOT EXISTS public.claim_requests (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Who and what
  organization_id         UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  claimant_user_id        UUID NOT NULL,                                  -- = auth.uid()

  -- Scope of the claim
  claimed_role            TEXT NOT NULL,                                  -- president | treasurer | hod | class_rep | ...
  claimed_scope           TEXT NOT NULL DEFAULT 'group',                  -- org | unit | group
  claimed_unit_group_id   UUID REFERENCES public.organization_groups(id), -- if scope='unit', the faculty
  claimed_group_id        UUID REFERENCES public.organization_groups(id), -- if scope='group', the class/dept

  -- Submitted info
  full_name               TEXT NOT NULL,
  position_title          TEXT NOT NULL,
  phone                   TEXT NOT NULL,
  institutional_email     TEXT,                                           -- .edu.ng / school email
  personal_email          TEXT NOT NULL,
  document_urls           TEXT[] NOT NULL DEFAULT '{}',                   -- proof uploads
  social_links            JSONB NOT NULL DEFAULT '{}'::jsonb,

  -- Verification method chosen
  verification_method     TEXT NOT NULL,                                  -- email | member_vote | document | invite_code

  -- Status machine
  status                  TEXT NOT NULL DEFAULT 'submitted',
  has_financial_history   BOOLEAN NOT NULL DEFAULT FALSE,                 -- snapshot at submit-time (stricter path)

  -- Email verification
  email_token             TEXT,                                           -- random 32-byte hex
  email_token_expires     TIMESTAMPTZ,
  email_verified_at       TIMESTAMPTZ,

  -- Member-vote tracking
  votes_required          INTEGER NOT NULL DEFAULT 0,
  votes_received          INTEGER NOT NULL DEFAULT 0,
  vote_deadline           TIMESTAMPTZ,

  -- Admin review
  reviewed_by_user_id     UUID,
  reviewer_notes          TEXT,
  reviewed_at             TIMESTAMPTZ,

  -- Dispute trail
  disputed_by_user_id     UUID,
  dispute_reason          TEXT,
  disputed_at             TIMESTAMPTZ,

  -- Resolution
  resulting_admin_id      UUID REFERENCES public.member_admins(id) ON DELETE SET NULL,
  resolved_at             TIMESTAMPTZ,

  -- Audit
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_claim_status CHECK (status IN (
    'submitted',
    'email_sent',
    'awaiting_votes',
    'votes_complete',
    'under_review',
    'approved',
    'rejected',
    'disputed',
    'expired'
  )),
  CONSTRAINT chk_claim_scope CHECK (claimed_scope IN ('org','unit','group')),
  CONSTRAINT chk_claim_method CHECK (verification_method IN ('email','member_vote','document','invite_code'))
);

CREATE INDEX IF NOT EXISTS idx_claim_requests_org_status
  ON public.claim_requests (organization_id, status);

CREATE INDEX IF NOT EXISTS idx_claim_requests_claimant
  ON public.claim_requests (claimant_user_id);

CREATE INDEX IF NOT EXISTS idx_claim_requests_group
  ON public.claim_requests (claimed_group_id)
  WHERE claimed_group_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_claim_requests_pending_review
  ON public.claim_requests (created_at)
  WHERE status IN ('submitted','email_sent','awaiting_votes','under_review','disputed');

CREATE UNIQUE INDEX IF NOT EXISTS idx_claim_requests_email_token_unique
  ON public.claim_requests (email_token)
  WHERE email_token IS NOT NULL;

DROP TRIGGER IF EXISTS trigger_claim_requests_updated_at ON public.claim_requests;
CREATE TRIGGER trigger_claim_requests_updated_at
  BEFORE UPDATE ON public.claim_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ============================================================
-- 2) claim_votes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.claim_votes (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  claim_request_id   UUID NOT NULL REFERENCES public.claim_requests(id) ON DELETE CASCADE,
  voter_member_id    UUID NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  organization_id    UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,

  vote               TEXT NOT NULL,                       -- confirm | reject | abstain
  comment            TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_claim_vote_value CHECK (vote IN ('confirm','reject','abstain')),
  CONSTRAINT uq_claim_vote_per_voter UNIQUE (claim_request_id, voter_member_id)
);

CREATE INDEX IF NOT EXISTS idx_claim_votes_request
  ON public.claim_votes (claim_request_id, vote);

CREATE INDEX IF NOT EXISTS idx_claim_votes_voter
  ON public.claim_votes (voter_member_id);

-- ============================================================
-- 3) executive_invite_codes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.executive_invite_codes (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id     UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  generated_by_admin  UUID NOT NULL REFERENCES public.member_admins(id) ON DELETE CASCADE,

  -- What this code grants
  intended_role       TEXT NOT NULL,
  scope_level         TEXT NOT NULL DEFAULT 'group',
  unit_group_id       UUID REFERENCES public.organization_groups(id),
  group_id            UUID REFERENCES public.organization_groups(id),

  -- The code (8-char alphanumeric, generated server-side)
  code                TEXT NOT NULL,

  -- Usage
  max_uses            INTEGER NOT NULL DEFAULT 1,
  times_used          INTEGER NOT NULL DEFAULT 0,
  used_by_user_id     UUID,
  used_at             TIMESTAMPTZ,

  -- Lifecycle
  expires_at          TIMESTAMPTZ NOT NULL,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT chk_invite_code_scope CHECK (scope_level IN ('org','unit','group'))
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_executive_invite_codes_code_unique
  ON public.executive_invite_codes (code);

CREATE INDEX IF NOT EXISTS idx_executive_invite_codes_org_active
  ON public.executive_invite_codes (organization_id, is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_executive_invite_codes_expires
  ON public.executive_invite_codes (expires_at)
  WHERE is_active = TRUE;

-- ============================================================
-- 4) Helper function: generate an 8-char invite code (collision-safe)
-- ============================================================
CREATE OR REPLACE FUNCTION public.generate_executive_invite_code()
RETURNS TEXT AS $$
DECLARE
  candidate TEXT;
  collision INTEGER;
BEGIN
  LOOP
    -- 8 chars, A-Z + 2-9 (no ambiguous 0/O/1/I)
    candidate := UPPER(
      REPLACE(REPLACE(REPLACE(REPLACE(
        SUBSTRING(MD5(RANDOM()::TEXT || clock_timestamp()::TEXT) FROM 1 FOR 12),
        '0', '2'), '1', '3'), 'O', '4'), 'I', '5')
    );
    candidate := SUBSTRING(candidate FROM 1 FOR 8);

    SELECT COUNT(*) INTO collision
    FROM public.executive_invite_codes
    WHERE code = candidate;

    EXIT WHEN collision = 0;
  END LOOP;
  RETURN candidate;
END;
$$ LANGUAGE plpgsql VOLATILE;

-- ============================================================
-- 5) Helper function: compute required vote count for a claim
--
-- Returns max(3, ceil(0.30 * active_member_count), capped at 20).
-- Used when a claim is created with verification_method='member_vote'.
-- ============================================================
CREATE OR REPLACE FUNCTION public.compute_claim_votes_required(p_group_id UUID, p_org_id UUID)
RETURNS INTEGER AS $$
DECLARE
  active_count INTEGER;
  required INTEGER;
BEGIN
  IF p_group_id IS NOT NULL THEN
    SELECT COUNT(*) INTO active_count
    FROM public.organization_members
    WHERE group_id = p_group_id AND COALESCE(is_active, TRUE) = TRUE;
  ELSE
    SELECT COUNT(*) INTO active_count
    FROM public.organization_members
    WHERE organization_id = p_org_id AND COALESCE(is_active, TRUE) = TRUE;
  END IF;

  required := CEIL(active_count * 0.30)::INTEGER;
  IF required < 3 THEN required := 3; END IF;
  IF required > 20 THEN required := 20; END IF;
  RETURN required;
END;
$$ LANGUAGE plpgsql STABLE;

-- ============================================================
-- 6) Verification
-- ============================================================
DO $$
BEGIN
  RAISE NOTICE 'Migration 015 complete: claim system tables created.';
  RAISE NOTICE '  - claim_requests';
  RAISE NOTICE '  - claim_votes';
  RAISE NOTICE '  - executive_invite_codes';
  RAISE NOTICE '  - generate_executive_invite_code()';
  RAISE NOTICE '  - compute_claim_votes_required()';
END $$;

COMMIT;
