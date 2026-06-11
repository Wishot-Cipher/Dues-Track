-- ============================================================
-- Migration 135: first-payout hold — withhold the bank split for a new
-- org's first few active days so early collections are recoverable if
-- the org turns out to be fraudulent.
--
-- Money settles DIRECTLY to each org's Paystack subaccount at
-- transaction time (no withdrawal step). So the only way to "hold" is to
-- NOT split during the cooldown — those payments settle to the PLATFORM
-- account instead, flagged platform_held, and get released (transferred)
-- to the org once the cooldown passes. Release is operational (a Paystack
-- transfer) and done manually for now; this migration just provides the
-- anchor + the flag.
--
-- Anchor: organizations.activated_at = the moment the org first became
-- 'active' (its first verified exec was approved). The cooldown runs from
-- there. The split gate itself lives in the Paystack init handler.
-- ============================================================

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ;

-- Backfill: existing active orgs are past any cooldown — anchor them to
-- their best-known start so they're never re-held.
UPDATE public.organizations
SET activated_at = COALESCE(acting_started_at, created_at)
WHERE org_state = 'active' AND activated_at IS NULL;

-- Stamp activated_at the FIRST time an org flips to 'active' (covers every
-- path that activates an org, not just claim approval).
CREATE OR REPLACE FUNCTION public._stamp_org_activated()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.org_state = 'active'
     AND COALESCE(OLD.org_state, '') <> 'active'
     AND NEW.activated_at IS NULL
  THEN
    NEW.activated_at := NOW();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_org_activated ON public.organizations;
CREATE TRIGGER trg_stamp_org_activated
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public._stamp_org_activated();

-- Flag payments whose bank split was withheld during the cooldown. These
-- are the funds to release (transfer to the org's subaccount) once the
-- org clears the hold.
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS platform_held BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_payments_platform_held
  ON public.payments (organization_id) WHERE platform_held = TRUE;

DO $$
BEGIN
  RAISE NOTICE 'Migration 135 applied: organizations.activated_at + payments.platform_held. The split gate is in the Paystack init handler; held funds are released manually for now.';
END $$;

COMMIT;
