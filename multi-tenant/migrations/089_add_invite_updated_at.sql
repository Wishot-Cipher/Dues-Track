-- ============================================================
-- Migration 089: organization_invites.updated_at
--
-- Why:
--   signup_member_via_invite (mig 078) does:
--     UPDATE organization_invites
--     SET times_used = ..., updated_at = NOW()
--   …but `updated_at` was never declared on the table in this
--   project's migration set. Every accepted invite blew up with:
--     "column updated_at of relation organization_invites does not exist"
--   and the new member couldn't be created.
--
-- Fix:
--   Add the column with a sensible default + backfill so existing
--   rows aren't NULL. Idempotent — IF NOT EXISTS guards a re-run.
--
-- This is the smallest possible change. The alternative (recreate
-- the function without updated_at) loses an audit signal that's
-- harmless to keep.
-- ============================================================

BEGIN;

ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Backfill rows that pre-date the column (was just created with
-- DEFAULT NOW() above, but be explicit for clarity).
UPDATE public.organization_invites
   SET updated_at = COALESCE(updated_at, created_at, NOW())
 WHERE updated_at IS NULL;

COMMIT;
