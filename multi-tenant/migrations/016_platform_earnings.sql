-- ============================================================
-- Migration 016: platform_earnings ledger
--
-- Goal:
-- Create the append-only ledger that records every kobo the
-- platform earned from a transaction. This is the source of truth
-- for "how much money has Payvexo made" — it lets us reconcile
-- against Paystack settlements and produce internal reports.
--
-- One row per successful payment that included a platform fee.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_earnings (
  id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source
  payment_id               UUID NOT NULL REFERENCES public.payments(id) ON DELETE RESTRICT,
  organization_id          UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,

  -- Money (all in smallest currency unit)
  amount_kobo              INTEGER NOT NULL CHECK (amount_kobo >= 0),
  currency_code            TEXT    NOT NULL DEFAULT 'NGN',

  -- Paystack reconciliation
  paystack_reference       TEXT,                             -- copy from payments for fast lookup
  paystack_settlement_id   TEXT,                             -- Paystack settlement batch ID
  paystack_settlement_date DATE,

  -- Settlement state
  settled                  BOOLEAN NOT NULL DEFAULT FALSE,
  settled_at               TIMESTAMPTZ,

  -- Refund tracking (if the parent payment is refunded, this earning is reversed)
  reversed                 BOOLEAN NOT NULL DEFAULT FALSE,
  reversed_at              TIMESTAMPTZ,
  reversal_reason          TEXT,

  -- Audit
  created_at               TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT uq_platform_earning_per_payment UNIQUE (payment_id)
);

-- Indexes for the dashboards we'll build later
CREATE INDEX IF NOT EXISTS idx_platform_earnings_org
  ON public.platform_earnings (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_platform_earnings_settled
  ON public.platform_earnings (settled, settled_at)
  WHERE reversed = FALSE;

CREATE INDEX IF NOT EXISTS idx_platform_earnings_paystack_ref
  ON public.platform_earnings (paystack_reference)
  WHERE paystack_reference IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_platform_earnings_created
  ON public.platform_earnings (created_at DESC);

-- ------------------------------------------------------------
-- Materialized totals view for the platform admin dashboard
-- (refreshed periodically — not on every read)
-- ------------------------------------------------------------
CREATE OR REPLACE VIEW public.platform_earnings_summary AS
SELECT
  organization_id,
  currency_code,
  COUNT(*)                                AS transactions,
  COALESCE(SUM(amount_kobo), 0)           AS gross_kobo,
  COALESCE(SUM(amount_kobo) FILTER (WHERE settled), 0) AS settled_kobo,
  COALESCE(SUM(amount_kobo) FILTER (WHERE NOT settled AND NOT reversed), 0) AS pending_kobo,
  COALESCE(SUM(amount_kobo) FILTER (WHERE reversed), 0) AS reversed_kobo,
  MIN(created_at) AS first_earning_at,
  MAX(created_at) AS last_earning_at
FROM public.platform_earnings
GROUP BY organization_id, currency_code;

-- ------------------------------------------------------------
-- RLS: ONLY platform admins (or service_role) may see these rows.
-- An org should never see how much the platform makes off of it.
-- ------------------------------------------------------------
ALTER TABLE public.platform_earnings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS platform_earnings_admin_read ON public.platform_earnings;
CREATE POLICY platform_earnings_admin_read
  ON public.platform_earnings
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.super_admins sa
      WHERE sa.id::text = auth.uid()::text AND sa.is_active = TRUE
    )
  );

DROP POLICY IF EXISTS platform_earnings_service_all ON public.platform_earnings;
CREATE POLICY platform_earnings_service_all
  ON public.platform_earnings
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- ------------------------------------------------------------
-- Verification
-- ------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'Migration 016 complete: platform_earnings ledger created.';
END $$;

COMMIT;
