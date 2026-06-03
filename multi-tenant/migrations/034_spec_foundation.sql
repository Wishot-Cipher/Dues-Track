-- ============================================================
-- Migration 034: Spec Foundation
--
-- Per the Payvexo Implementation Spec, Part 12 #3–5.
-- Decisions confirmed:
--   • Keep trust_level (search badges) AND add org_state (money gate)
--   • Solo founders go Active immediately; second exec onward
--     triggers the 5-vote bootstrap (enforced by a later RPC)
--
-- This migration does THREE things, all additive and idempotent:
--   1. Expand organization_groups.kind to support the full
--      Nigerian university hierarchy (College, Association, SUG,
--      University-wide units) + governance/dues capability flags.
--   2. Add org_state column + acting_started_at to organizations.
--   3. Add academic_session_id FK to payment_types and payments
--      so every record is session-scoped (Part 10 non-negotiable).
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PART 1 — Hierarchy: extend organization_groups
-- ════════════════════════════════════════════════════════════

-- The mig 005 CHECK constraint limits kind to (faculty, class, general).
-- The spec needs more tiers. Drop and re-add with the full set.
ALTER TABLE public.organization_groups
  DROP CONSTRAINT IF EXISTS chk_org_group_kind;

ALTER TABLE public.organization_groups
  ADD CONSTRAINT chk_org_group_kind
  CHECK (kind IN (
    -- hierarchical tiers
    'college',           -- optional mid-tier (UNN College of Engineering)
    'faculty',           -- mid-tier
    'department',        -- core financial unit
    'association',       -- departmental association (NIESS, NICE, NITES)
    'class',             -- 100L / 200L / 300L / etc.
    'level',             -- legacy alias for class
    -- non-hierarchical
    'sug',               -- Student Union Government (governance, no dues)
    'university_unit',   -- GSP, ICT Centre, SIWES (cross-faculty)
    'fellowship',        -- religious groups
    'chapter',           -- alumni / external chapters
    'general'            -- catch-all
  ));

-- Capability flags — encode which tiers CAN do what
ALTER TABLE public.organization_groups
  ADD COLUMN IF NOT EXISTS can_collect_dues  BOOLEAN NOT NULL DEFAULT TRUE,
  ADD COLUMN IF NOT EXISTS serves_whole_org  BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS admission_year    TEXT;
  -- admission_year applies to class groups: "2020/2021" → tells us
  -- which cohort. Combined with level it disambiguates carryover students.

-- SUG never collects dues directly (bursar does it, off-platform).
-- Backfill any existing rows whose kind is 'sug' to enforce the rule.
UPDATE public.organization_groups
SET can_collect_dues = FALSE
WHERE kind = 'sug';

-- University-wide units serve every member of the org
UPDATE public.organization_groups
SET serves_whole_org = TRUE
WHERE kind = 'university_unit';

-- ════════════════════════════════════════════════════════════
-- PART 2 — Org state machine on organizations
-- ════════════════════════════════════════════════════════════
--
-- Three states (orthogonal to trust_level):
--   active   — verified exec in place; money can flow
--   acting   — exec claimed but verification pending; ZERO naira
--   orphaned — no active exec; viewable but frozen
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS org_state           TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS acting_started_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS orphaned_at         TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS acting_deadline_at  TIMESTAMPTZ;
  -- acting_deadline_at = acting_started_at + interval '14 days'
  -- if reached without verification, cron flips to 'orphaned'

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='organizations'
      AND constraint_name='chk_org_state'
  ) THEN
    ALTER TABLE public.organizations
      ADD CONSTRAINT chk_org_state
      CHECK (org_state IN ('active','acting','orphaned'));
  END IF;
END $$;

-- Index for fast "any orgs that need attention?" admin queries
CREATE INDEX IF NOT EXISTS idx_organizations_org_state
  ON public.organizations (org_state)
  WHERE org_state IN ('acting','orphaned');

CREATE INDEX IF NOT EXISTS idx_organizations_acting_deadline
  ON public.organizations (acting_deadline_at)
  WHERE org_state = 'acting';

-- Per decision: solo founders go active. Existing orgs stay active.
-- No backfill needed — the DEFAULT 'active' handles new rows;
-- existing rows had no value so they take the default on first read.
UPDATE public.organizations
SET org_state = 'active'
WHERE org_state IS NULL OR org_state = '';

-- ════════════════════════════════════════════════════════════
-- PART 3 — Academic session scoping (Spec Part 10, non-negotiable)
-- ════════════════════════════════════════════════════════════

ALTER TABLE public.payment_types
  ADD COLUMN IF NOT EXISTS academic_session_id UUID
    REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS academic_session_label TEXT;
  -- label is denormalized for fast filtering without joins; if the
  -- FK row is deleted, the label still tells us which session it was.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS academic_session_id UUID
    REFERENCES public.academic_sessions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS academic_session_label TEXT;

CREATE INDEX IF NOT EXISTS idx_payment_types_session
  ON public.payment_types (academic_session_id)
  WHERE academic_session_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_payments_session
  ON public.payments (academic_session_id)
  WHERE academic_session_id IS NOT NULL;

-- Helper: resolve the org's currently-active academic session.
-- Returns NULL if no active session — caller decides whether to
-- block or proceed (e.g. dues should require, donations may not).
CREATE OR REPLACE FUNCTION public.current_session_for_org(p_org_id UUID)
RETURNS TABLE(session_id UUID, label TEXT)
LANGUAGE sql STABLE
AS $$
  SELECT id, label
  FROM public.academic_sessions
  WHERE organization_id = p_org_id
    AND is_active = TRUE
  ORDER BY start_date DESC
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.current_session_for_org(UUID) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- Verification
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  ng_kinds INTEGER;
  acting_orgs INTEGER;
BEGIN
  SELECT COUNT(DISTINCT kind) INTO ng_kinds FROM public.organization_groups;
  SELECT COUNT(*) INTO acting_orgs FROM public.organizations WHERE org_state = 'acting';

  RAISE NOTICE 'Migration 034 complete: spec foundation laid.';
  RAISE NOTICE '  organization_groups.kind values in use: %', ng_kinds;
  RAISE NOTICE '  organizations in acting state:           %', acting_orgs;
  RAISE NOTICE '';
  RAISE NOTICE 'Next steps (per spec Part 12):';
  RAISE NOTICE '  - Wire scope enforcement into CreateDuePage';
  RAISE NOTICE '  - Build claim / 5-vote bootstrap verification';
  RAISE NOTICE '  - Block dues publishing when org_state != active';
END $$;

COMMIT;
