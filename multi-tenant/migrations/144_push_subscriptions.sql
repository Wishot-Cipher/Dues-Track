-- ============================================================
-- Migration 144: push_subscriptions table (Web Push)
--
-- The table the push pipeline depends on was never in a migration — it
-- was created by hand in the dashboard, so a fresh database (or a rebuilt
-- one) has no `push_subscriptions` and the whole push path silently
-- breaks: saving a subscription 500s and notify-approvers finds nobody to
-- ping. This makes it reproducible.
--
-- Used by:
--   • api/notifications.ts (save-subscription)  → upsert onConflict user_id
--   • api/notify-approvers.ts, api/_lib/push.ts  → read by user_id
--   • src/services/pushNotificationService.ts     → save / remove
--
-- One row per member (latest device wins via the unique user_id + upsert).
-- Writes/reads run through the service-role API; the self policy is
-- defense-in-depth for any direct client call (e.g. unsubscribe).
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL,
  endpoint    TEXT NOT NULL,
  p256dh      TEXT NOT NULL,
  auth        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- One subscription per member — required for upsert(onConflict: 'user_id').
CREATE UNIQUE INDEX IF NOT EXISTS push_subscriptions_user_id_key
  ON public.push_subscriptions (user_id);

ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Service role (the API path that actually saves/reads) — full access.
DROP POLICY IF EXISTS push_subscriptions_service ON public.push_subscriptions;
CREATE POLICY push_subscriptions_service
  ON public.push_subscriptions
  FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- A member may manage their OWN subscription row (direct unsubscribe).
DROP POLICY IF EXISTS push_subscriptions_self ON public.push_subscriptions;
CREATE POLICY push_subscriptions_self
  ON public.push_subscriptions
  FOR ALL
  USING (public.is_self_member_row(user_id))
  WITH CHECK (public.is_self_member_row(user_id));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.push_subscriptions
  TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 144 applied: push_subscriptions table ready. Web Push (payment alerts) will persist + fan out.';
END $$;

COMMIT;
