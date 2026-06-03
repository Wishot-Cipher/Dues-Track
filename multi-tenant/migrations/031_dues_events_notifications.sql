-- ============================================================
-- Migration 031: Event-aware dues + notification preferences
--
-- Three things, all additive and idempotent:
--
-- 1. Event-specific columns on payment_types.
--    Reuses the existing 'event' category — no new table for
--    event ticketing. A payment_type with category='event' and
--    event_date populated IS an event ticket.
--
-- 2. Payment-method gating per due (paystack vs manual).
--    Admin can choose per-due whether members see card / bank /
--    USSD checkout, manual receipt upload, or both.
--
-- 3. Notification preferences (org default + per-member override).
--    Org-wide defaults live on organization_settings; individual
--    members can override their own channels via a JSONB field
--    on organization_members.
-- ============================================================

BEGIN;

-- ──────────────────────────────────────────────────────────────
-- 1) Event ticketing columns on payment_types
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.payment_types
  ADD COLUMN IF NOT EXISTS event_date          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS event_venue         TEXT,
  ADD COLUMN IF NOT EXISTS event_cover_url     TEXT,
  ADD COLUMN IF NOT EXISTS event_ticket_tiers  JSONB DEFAULT '[]'::jsonb,
                              -- e.g. [{"name":"Regular","amount_kobo":500000,"max_qty":200},
                              --       {"name":"VIP","amount_kobo":1500000,"max_qty":50}]
  ADD COLUMN IF NOT EXISTS event_max_attendees INTEGER,
  ADD COLUMN IF NOT EXISTS event_sold_count    INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_payment_types_event_date
  ON public.payment_types (event_date)
  WHERE event_date IS NOT NULL;

-- ──────────────────────────────────────────────────────────────
-- 2) Per-due payment-method gating
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.payment_types
  ADD COLUMN IF NOT EXISTS accepts_paystack    BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS accepts_manual      BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS paystack_redirect_url TEXT;   -- override default callback if needed

-- ──────────────────────────────────────────────────────────────
-- 3a) Org-wide default notification channels
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS default_notify_channels TEXT[] NOT NULL
    DEFAULT ARRAY['in_app','push']::TEXT[],
  ADD COLUMN IF NOT EXISTS allow_email_notifications BOOLEAN NOT NULL DEFAULT TRUE;

-- ──────────────────────────────────────────────────────────────
-- 3b) Per-member notification overrides
-- ──────────────────────────────────────────────────────────────
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS notification_prefs JSONB NOT NULL DEFAULT '{}'::jsonb;
  -- Shape: { "channels": ["in_app","push","email"], "muted_types": ["welfare"] }

-- ──────────────────────────────────────────────────────────────
-- Verification
-- ──────────────────────────────────────────────────────────────
DO $$
BEGIN
  RAISE NOTICE 'Migration 031 complete:';
  RAISE NOTICE '  payment_types  → event_date, event_venue, event_cover_url,';
  RAISE NOTICE '                    event_ticket_tiers, event_max_attendees,';
  RAISE NOTICE '                    event_sold_count, accepts_paystack,';
  RAISE NOTICE '                    accepts_manual, paystack_redirect_url';
  RAISE NOTICE '  organization_settings → default_notify_channels,';
  RAISE NOTICE '                          allow_email_notifications';
  RAISE NOTICE '  organization_members  → notification_prefs (jsonb)';
END $$;

COMMIT;
