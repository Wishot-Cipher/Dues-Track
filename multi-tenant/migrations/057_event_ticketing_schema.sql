-- ============================================================
-- Migration 057: Event ticketing schema
--
-- Events are payment_types with category='event' (+ event_date/venue/cover/
-- max_attendees, already present). This migration adds the ticketing layer so
-- an event is a real product you SELL, not a due you OWE:
--
--   event_ticket_tiers  — priced tiers per event (Regular / VIP / ...)
--   event_tickets       — a ticket issued after a successful payment, with a
--                         unique code + QR payload, checked in at the door
--   payments.event_tier_id — which tier a payment bought
--
-- Per-event public sale is handled by the existing payment_types.is_public
-- flag; sales-close uses the existing deadline column.
--
-- RLS (custom-auth / auth.uid() model, per migration 053):
--   tiers   — public SELECT (sale info); writes via service-role RPC only
--   tickets — SELECT by the buyer (member) or the event-group's execs;
--             all writes happen server-side (generation + check-in) as service_role
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1) event_ticket_tiers
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.event_ticket_tiers (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  payment_type_id  UUID NOT NULL REFERENCES public.payment_types(id) ON DELETE CASCADE,
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name             TEXT NOT NULL,                 -- 'Regular', 'VIP', 'Table for 5'
  description      TEXT,
  price            NUMERIC(12,2) NOT NULL DEFAULT 0,   -- naira, like payment_types.amount
  quantity         INTEGER,                       -- NULL = unlimited
  sold_count       INTEGER NOT NULL DEFAULT 0,
  sort_order       INTEGER NOT NULL DEFAULT 0,
  is_active        BOOLEAN NOT NULL DEFAULT TRUE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_tiers_payment_type ON public.event_ticket_tiers (payment_type_id);
CREATE INDEX IF NOT EXISTS idx_event_tiers_org          ON public.event_ticket_tiers (organization_id);

-- ════════════════════════════════════════════════════════════
-- 2) event_tickets
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.event_tickets (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  payment_id       UUID REFERENCES public.payments(id) ON DELETE SET NULL,
  payment_type_id  UUID NOT NULL REFERENCES public.payment_types(id) ON DELETE CASCADE,
  tier_id          UUID REFERENCES public.event_ticket_tiers(id) ON DELETE SET NULL,
  group_id         UUID REFERENCES public.organization_groups(id) ON DELETE SET NULL,
  member_id        UUID REFERENCES public.organization_members(id) ON DELETE SET NULL, -- NULL for public buyers
  buyer_name       TEXT,
  buyer_email      TEXT,
  ticket_code      TEXT UNIQUE NOT NULL,          -- e.g. PVX-TKT-AB12CD34
  tier_name        TEXT,                          -- denormalized for display
  price            NUMERIC(12,2),
  status           TEXT NOT NULL DEFAULT 'valid'
                   CHECK (status IN ('valid','used','cancelled','refunded')),
  checked_in_at    TIMESTAMPTZ,
  checked_in_by    UUID REFERENCES public.member_admins(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_event_tickets_org          ON public.event_tickets (organization_id);
CREATE INDEX IF NOT EXISTS idx_event_tickets_payment_type ON public.event_tickets (payment_type_id);
CREATE INDEX IF NOT EXISTS idx_event_tickets_member       ON public.event_tickets (member_id);
CREATE INDEX IF NOT EXISTS idx_event_tickets_code         ON public.event_tickets (ticket_code);

-- ════════════════════════════════════════════════════════════
-- 3) payments.event_tier_id — which tier a payment bought
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS event_tier_id UUID REFERENCES public.event_ticket_tiers(id) ON DELETE SET NULL;

-- ════════════════════════════════════════════════════════════
-- 4) RLS
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.event_ticket_tiers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.event_tickets      ENABLE ROW LEVEL SECURITY;

-- Tiers: public sale info → anyone may read; writes only via service-role RPC.
DROP POLICY IF EXISTS event_tiers_select ON public.event_ticket_tiers;
CREATE POLICY event_tiers_select ON public.event_ticket_tiers
  FOR SELECT USING (TRUE);

DROP POLICY IF EXISTS event_tiers_service ON public.event_ticket_tiers;
CREATE POLICY event_tiers_service ON public.event_ticket_tiers
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Tickets: buyer sees their own; the event group's verified execs see them all;
-- platform admin + service role full. All writes happen server-side.
DROP POLICY IF EXISTS event_tickets_select ON public.event_tickets;
CREATE POLICY event_tickets_select ON public.event_tickets
  FOR SELECT USING (
    auth.role() = 'service_role'
    OR public.is_platform_admin()
    OR member_id::text = auth.uid()::text
    OR public.can_access_group(group_id)
  );

DROP POLICY IF EXISTS event_tickets_service ON public.event_tickets;
CREATE POLICY event_tickets_service ON public.event_tickets
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- Grants
GRANT SELECT ON public.event_ticket_tiers TO anon, authenticated;
GRANT ALL    ON public.event_ticket_tiers TO service_role;
GRANT SELECT ON public.event_tickets      TO anon, authenticated;
GRANT ALL    ON public.event_tickets      TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 057 complete: event_ticket_tiers + event_tickets + payments.event_tier_id.';
END $$;

COMMIT;
