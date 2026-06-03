-- ============================================================
-- Migration 059: School-email verification codes
--
-- Supports the founder/exec "verify with your school email" flow (Blueprint
-- §13.2 Layer 2). A pending exec proves they hold an institutional email whose
-- domain matches the org (or its seed institution); on success their
-- member_admins row is promoted to verification_status='email_verified',
-- verification_layer >= 2 — which is what unlocks the admin surface and
-- dues/event creation in the route guard + create_due RPC.
--
-- The codes are short-lived OTPs handled entirely by the /api/auth/verify-email
-- serverless function (service role). No client ever reads this table.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.email_verifications (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id        UUID NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  email            TEXT NOT NULL,
  code             TEXT NOT NULL,
  purpose          TEXT NOT NULL DEFAULT 'exec_school_email',
  attempts         INTEGER NOT NULL DEFAULT 0,
  expires_at       TIMESTAMPTZ NOT NULL,
  consumed_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_email_verifications_member
  ON public.email_verifications (member_id, purpose, created_at DESC);

ALTER TABLE public.email_verifications ENABLE ROW LEVEL SECURITY;

-- Codes are secret — only the service-role API touches this table.
DROP POLICY IF EXISTS email_verifications_service ON public.email_verifications;
CREATE POLICY email_verifications_service
  ON public.email_verifications FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

GRANT ALL ON public.email_verifications TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 059 complete: email_verifications table ready.';
END $$;

COMMIT;
