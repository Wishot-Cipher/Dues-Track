-- ============================================================
-- Migration 096: Performance indexes on hot columns
--
-- What this fixes
-- ---------------
-- The user reported every list page felt slow — Manage Dues, the
-- student dashboard, the admin dashboard, the new audit view. The
-- code paths were already de-duplicated and parallelised, so the
-- remaining cost was on the DB itself: several extremely hot
-- columns had NO index, so every read became a sequential scan.
--
-- Audit of what's already indexed (mig 002, mig 047, COMPLETE_SETUP):
--   payments       — organization_id, department_id, paid_by
--   payment_types  — organization_id, department_id, session
--   org_members    — (whatever 002 set up)
--
-- Audit of what's missing (every one is in WHERE / IN of a hot query):
--   payments.group_id      — admin counts, review list, audit roll-up
--   payments.status        — every admin count partitions on status
--   payments.member_id     — student dashboard's "my payments" fetch
--   payments.payment_type_id — payment-type detail page joins on it
--   payment_types.group_id — ManageDues + scopedGroupIds IN(...) filter
--   payment_types.is_active — student dashboard + admin counts
--   event_ticket_tiers.payment_type_id — MakePayment + edit prefill
--
-- All indexes are CREATE INDEX IF NOT EXISTS so this is safe to
-- rerun. None block writes — they're built CONCURRENTLY would be
-- ideal but CONCURRENTLY can't run inside a transaction block, and
-- the migration runner expects single-transaction migrations. The
-- tables are small enough for the brief AccessExclusiveLock the
-- non-concurrent build takes to be acceptable.
-- ============================================================

BEGIN;

-- ── payments ────────────────────────────────────────────────
-- All four columns are partitioning columns for the hottest reads.
-- (organization_id, group_id) is the canonical "scope filter" pair
-- that the admin dashboard, ManageDues, AdminReview, Audit, and
-- WaivePayment all narrow on. A composite is better than two
-- single-column ones because Postgres can read both predicates
-- from one B-tree walk.
CREATE INDEX IF NOT EXISTS idx_payments_org_group
  ON public.payments (organization_id, group_id);

-- status is partition-like — pending / approved / rejected are a
-- tiny enum, so a single-column index is plenty selective when
-- combined with the org/group predicate. Postgres can intersect
-- the two indexes via bitmap scan.
CREATE INDEX IF NOT EXISTS idx_payments_status
  ON public.payments (status);

-- member_id powers "show me MY payments" — student dashboard fetch
-- and the PaymentDetailPage's existing-payments lookup.
CREATE INDEX IF NOT EXISTS idx_payments_member
  ON public.payments (member_id);

-- payment_type_id is used by every "did this member pay for that
-- due" join (MakePaymentPage, the student dashboard's enrich step).
CREATE INDEX IF NOT EXISTS idx_payments_payment_type
  ON public.payments (payment_type_id);

-- ── payment_types ───────────────────────────────────────────
-- group_id — ManageDues filters with IN(<scoped ids>); the IN list
-- can be ~10-30 ids for a faculty exec, so an index on group_id
-- makes the IN walk a single index scan instead of a seq scan.
CREATE INDEX IF NOT EXISTS idx_payment_types_group
  ON public.payment_types (group_id);

-- is_active is a partial index because 99% of reads ask for
-- is_active=true. A partial index is smaller, faster, and keeps
-- the planner honest about predicate selectivity.
CREATE INDEX IF NOT EXISTS idx_payment_types_active
  ON public.payment_types (organization_id)
  WHERE is_active = true;

-- ── event_ticket_tiers ──────────────────────────────────────
-- Sibling-table index. MakePayment fetches all tiers for a
-- payment_type_id, the edit prefill does the same. The previous
-- only-on-id PK doesn't help.
CREATE INDEX IF NOT EXISTS idx_event_ticket_tiers_payment_type
  ON public.event_ticket_tiers (payment_type_id);

COMMIT;
