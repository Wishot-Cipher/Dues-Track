-- ============================================================
-- Migration 134: org billing plan (mechanism only).
--
-- The agreed model: the app stays FREE + unlimited members and earns the
-- per-transaction platform fee. A paid plan does NOT gate features or cap
-- members — it LOWERS the platform fee for big collectors (so paying
-- saves them money) and unlocks value-adds (reminders / analytics /
-- branding) later. This migration adds only the PLAN FLAG; the fee-
-- reducer is applied in the Paystack init handler, and there is no self-
-- serve subscription billing yet (plans are set manually for now).
--
-- The actual fee numbers live in code (api/paystack) as an editable
-- plan→multiplier map, so you can tune pricing without a migration.
-- ============================================================

BEGIN;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS billing_plan        TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN IF NOT EXISTS billing_plan_since  TIMESTAMPTZ;

-- Constrain to known plans (drop+add so it's idempotent).
ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_billing_plan_check;
ALTER TABLE public.organizations ADD CONSTRAINT organizations_billing_plan_check
  CHECK (billing_plan IN ('free','pro','enterprise'));

-- Set a plan for an org. Service-role only — the platform console / your
-- own tooling calls this; ordinary members can't change billing. (You can
-- also just UPDATE the column directly while toggling plans manually.)
CREATE OR REPLACE FUNCTION public.platform_set_org_plan(
  p_org_id UUID,
  p_plan   TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
BEGIN
  IF p_plan NOT IN ('free','pro','enterprise') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Unknown plan.');
  END IF;
  UPDATE public.organizations
  SET billing_plan = p_plan, billing_plan_since = NOW(), updated_at = NOW()
  WHERE id = p_org_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Organization not found.');
  END IF;
  RETURN jsonb_build_object('ok', TRUE, 'plan', p_plan);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_set_org_plan(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.platform_set_org_plan(UUID, TEXT) TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 134 applied: organizations.billing_plan added (free|pro|enterprise). Fee reducer is applied in the Paystack init handler.';
END $$;

COMMIT;
