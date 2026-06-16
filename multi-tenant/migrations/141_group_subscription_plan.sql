-- ============================================================
-- Migration 141: Per-GROUP subscription plan (the class is the
-- billable unit, not the org).
--
-- Why
-- ---
-- Billing is per class/tier, not per organization: one department's
-- classes can be on different plans, and a faculty upgrading does not
-- upgrade its classes. The only plan column that existed was
-- organizations.subscription_plan (mig 001) — org-wide. This adds the
-- same notion to organization_groups so each tier owns its own plan.
--
-- Launch posture: every group defaults to 'free' → manual receipt
-- collection only. Online (Paystack) checkout is a Pro feature; a group
-- unlocks it by upgrading (billing UI, a later migration). Until then
-- the whole platform is manual-only, by design.
--
-- Columns
-- -------
--   subscription_plan        free | starter | pro | enterprise
--                            (mirrors the org column's allowed values)
--   subscription_status      active | expired | trialing
--   subscription_expires_at  per-semester expiry; NULL = no expiry
--
-- group_online_payments_enabled(group_id) — the single source of truth
-- the app uses to decide whether a tier may publish a Paystack due:
-- plan is pro/enterprise AND not expired. SECURITY DEFINER so the
-- client can call it without RLS on the billing columns.
-- ============================================================

BEGIN;

ALTER TABLE public.organization_groups
  ADD COLUMN IF NOT EXISTS subscription_plan       TEXT NOT NULL DEFAULT 'free'
    CHECK (subscription_plan IN ('free', 'starter', 'pro', 'enterprise')),
  ADD COLUMN IF NOT EXISTS subscription_status     TEXT NOT NULL DEFAULT 'active'
    CHECK (subscription_status IN ('active', 'expired', 'trialing')),
  ADD COLUMN IF NOT EXISTS subscription_expires_at TIMESTAMPTZ;

-- True when a group may collect online (Paystack). Pro/enterprise plan,
-- still within its paid window. Free/starter or an expired plan → FALSE
-- (manual receipt collection only).
CREATE OR REPLACE FUNCTION public.group_online_payments_enabled(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.organization_groups g
    WHERE g.id = p_group_id
      AND g.subscription_plan IN ('pro', 'enterprise')
      AND g.subscription_status <> 'expired'
      AND (g.subscription_expires_at IS NULL OR g.subscription_expires_at > now())
  );
$$;

GRANT EXECUTE ON FUNCTION public.group_online_payments_enabled(UUID)
  TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 141 applied: organization_groups now carries its own subscription_plan (default free = manual-only). Paystack is a Pro feature per group.';
END $$;

COMMIT;
