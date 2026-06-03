-- ============================================================
-- Migration 005: Faculty Hierarchy + Academic Progression
--
-- Goal:
-- 1) Add faculty/class hierarchy support to organization_groups
-- 2) Add semester/session tables for controlled academic timing
-- 3) Add auditable promotion run tables (dry-run + commit workflow)
--
-- This migration is additive and idempotent.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 0) Safety helpers
-- ------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ------------------------------------------------------------
-- 1) Extend organization_groups for faculty/class hierarchy
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_groups'
  ) THEN
    ALTER TABLE public.organization_groups
      ADD COLUMN IF NOT EXISTS kind TEXT DEFAULT 'general',
      ADD COLUMN IF NOT EXISTS academic_year TEXT,
      ADD COLUMN IF NOT EXISTS level_order INTEGER,
      ADD COLUMN IF NOT EXISTS expected_member_count INTEGER,
      ADD COLUMN IF NOT EXISTS current_member_count INTEGER DEFAULT 0,
      ADD COLUMN IF NOT EXISTS invite_code TEXT,
      ADD COLUMN IF NOT EXISTS invite_enabled BOOLEAN DEFAULT true;

    -- Self-reference for hierarchy if missing
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema='public' AND table_name='organization_groups' AND column_name='parent_group_id'
    ) THEN
      ALTER TABLE public.organization_groups
        ADD COLUMN parent_group_id UUID;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema='public'
        AND tc.table_name='organization_groups'
        AND tc.constraint_name='fk_org_groups_parent'
    ) THEN
      ALTER TABLE public.organization_groups
        ADD CONSTRAINT fk_org_groups_parent
        FOREIGN KEY (parent_group_id)
        REFERENCES public.organization_groups(id)
        ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema='public'
        AND tc.table_name='organization_groups'
        AND tc.constraint_name='chk_org_group_kind'
    ) THEN
      ALTER TABLE public.organization_groups
        ADD CONSTRAINT chk_org_group_kind
        CHECK (kind IN ('faculty', 'class', 'general'));
    END IF;

    CREATE INDEX IF NOT EXISTS idx_org_groups_org_kind
      ON public.organization_groups(organization_id, kind);

    CREATE INDEX IF NOT EXISTS idx_org_groups_parent
      ON public.organization_groups(parent_group_id)
      WHERE parent_group_id IS NOT NULL;

    CREATE UNIQUE INDEX IF NOT EXISTS idx_org_groups_invite_code_unique
      ON public.organization_groups(invite_code)
      WHERE invite_code IS NOT NULL;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 2) Extend organization_settings for promotion controls
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_settings'
  ) THEN
    ALTER TABLE public.organization_settings
      ADD COLUMN IF NOT EXISTS auto_promotion_enabled BOOLEAN DEFAULT false,
      ADD COLUMN IF NOT EXISTS promotion_requires_approval BOOLEAN DEFAULT true,
      ADD COLUMN IF NOT EXISTS promotion_grace_days INTEGER DEFAULT 14;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 3) Extend organization_members for progression metadata
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'organization_members'
  ) THEN
    ALTER TABLE public.organization_members
      ADD COLUMN IF NOT EXISTS current_level_order INTEGER,
      ADD COLUMN IF NOT EXISTS next_level TEXT,
      ADD COLUMN IF NOT EXISTS promotion_status TEXT DEFAULT 'eligible';

    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.table_constraints tc
      WHERE tc.table_schema='public'
        AND tc.table_name='organization_members'
        AND tc.constraint_name='chk_org_members_promotion_status'
    ) THEN
      ALTER TABLE public.organization_members
        ADD CONSTRAINT chk_org_members_promotion_status
        CHECK (promotion_status IN ('eligible', 'retained', 'graduated', 'manual_override'));
    END IF;

    CREATE INDEX IF NOT EXISTS idx_org_members_org_level
      ON public.organization_members(organization_id, level);

    CREATE INDEX IF NOT EXISTS idx_org_members_org_promotion
      ON public.organization_members(organization_id, promotion_status);
  END IF;
END $$;

-- ------------------------------------------------------------
-- 4) Add faculty admin role support
-- ------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'member_admins'
  ) THEN
    -- Safely relax/redefine role check if it exists and excludes faculty_admin
    IF EXISTS (
      SELECT 1
      FROM information_schema.table_constraints
      WHERE table_schema='public'
        AND table_name='member_admins'
        AND constraint_type='CHECK'
        AND constraint_name='member_admins_role_check'
    ) THEN
      ALTER TABLE public.member_admins
        DROP CONSTRAINT member_admins_role_check;

      ALTER TABLE public.member_admins
        ADD CONSTRAINT member_admins_role_check
        CHECK (role IN (
          'super_admin',
          'org_owner',
          'org_admin',
          'faculty_admin',
          'group_admin',
          'treasurer',
          'secretary',
          'auditor',
          'moderator',
          'custom'
        ));
    END IF;
  END IF;
END $$;

-- ------------------------------------------------------------
-- 5) Academic sessions and terms
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.academic_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label TEXT NOT NULL,                             -- e.g. 2024/2025
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_active BOOLEAN DEFAULT false,
  is_locked BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_academic_session_dates CHECK (end_date >= start_date),
  CONSTRAINT uq_academic_session_label UNIQUE (organization_id, label)
);

CREATE INDEX IF NOT EXISTS idx_academic_sessions_org
  ON public.academic_sessions(organization_id);

CREATE INDEX IF NOT EXISTS idx_academic_sessions_active
  ON public.academic_sessions(organization_id, is_active)
  WHERE is_active = true;

CREATE TABLE IF NOT EXISTS public.academic_terms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.academic_sessions(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                              -- First Semester, Second Semester
  sequence INTEGER NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  promotion_window_starts_at TIMESTAMPTZ,
  promotion_window_ends_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'upcoming',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_academic_term_dates CHECK (end_date >= start_date),
  CONSTRAINT chk_academic_term_status CHECK (status IN ('upcoming', 'active', 'closing', 'closed')),
  CONSTRAINT uq_academic_term_sequence UNIQUE (session_id, sequence)
);

CREATE INDEX IF NOT EXISTS idx_academic_terms_org
  ON public.academic_terms(organization_id);

CREATE INDEX IF NOT EXISTS idx_academic_terms_session
  ON public.academic_terms(session_id);

CREATE INDEX IF NOT EXISTS idx_academic_terms_status
  ON public.academic_terms(organization_id, status);

-- ------------------------------------------------------------
-- 6) Class progression policies
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.class_progression_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.organization_groups(id) ON DELETE CASCADE,
  policy_name TEXT NOT NULL,
  level_sequence TEXT[] NOT NULL,
  terminal_level TEXT,
  allow_manual_override BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT uq_class_progression_policy_group UNIQUE (group_id)
);

CREATE INDEX IF NOT EXISTS idx_class_progression_policies_org
  ON public.class_progression_policies(organization_id);

-- ------------------------------------------------------------
-- 7) Promotion audit tables
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.promotion_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  term_id UUID NOT NULL REFERENCES public.academic_terms(id) ON DELETE CASCADE,
  group_id UUID REFERENCES public.organization_groups(id) ON DELETE SET NULL,
  triggered_by UUID,
  status TEXT NOT NULL DEFAULT 'queued',
  total_members INTEGER NOT NULL DEFAULT 0,
  promoted_members INTEGER NOT NULL DEFAULT 0,
  skipped_members INTEGER NOT NULL DEFAULT 0,
  dry_run BOOLEAN NOT NULL DEFAULT true,
  notes TEXT,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  CONSTRAINT chk_promotion_run_status CHECK (status IN ('queued', 'running', 'completed', 'failed', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS idx_promotion_runs_org
  ON public.promotion_runs(organization_id);

CREATE INDEX IF NOT EXISTS idx_promotion_runs_term
  ON public.promotion_runs(term_id);

CREATE INDEX IF NOT EXISTS idx_promotion_runs_group
  ON public.promotion_runs(group_id)
  WHERE group_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS public.promotion_decisions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  promotion_run_id UUID NOT NULL REFERENCES public.promotion_runs(id) ON DELETE CASCADE,
  member_id UUID NOT NULL,
  from_level TEXT,
  to_level TEXT,
  action TEXT NOT NULL,
  reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT chk_promotion_decision_action CHECK (action IN ('promote', 'retain', 'graduated', 'manual_override')),
  CONSTRAINT uq_promotion_member_decision UNIQUE (promotion_run_id, member_id)
);

CREATE INDEX IF NOT EXISTS idx_promotion_decisions_run
  ON public.promotion_decisions(promotion_run_id);

-- ------------------------------------------------------------
-- 8) Utility functions for progression
-- ------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.next_level_from_sequence(
  p_level_sequence TEXT[],
  p_current_level TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  idx INTEGER;
BEGIN
  IF p_level_sequence IS NULL OR array_length(p_level_sequence, 1) IS NULL THEN
    RETURN NULL;
  END IF;

  idx := array_position(p_level_sequence, p_current_level);
  IF idx IS NULL THEN
    RETURN NULL;
  END IF;

  IF idx >= array_length(p_level_sequence, 1) THEN
    RETURN NULL;
  END IF;

  RETURN p_level_sequence[idx + 1];
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_group_invite_code(
  p_group_name TEXT,
  p_level TEXT,
  p_year TEXT
)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  base_code TEXT;
  suffix TEXT;
BEGIN
  base_code := UPPER(
    REGEXP_REPLACE(
      LEFT(COALESCE(p_group_name, 'GRP'), 3) ||
      REGEXP_REPLACE(COALESCE(p_level, ''), '[^0-9A-Za-z]', '', 'g') ||
      RIGHT(COALESCE(p_year, ''), 2),
      '[^0-9A-Z]', '', 'g'
    )
  );

  suffix := UPPER(SUBSTRING(MD5(RANDOM()::TEXT) FROM 1 FOR 4));
  RETURN base_code || '-' || suffix;
END;
$$;

-- ------------------------------------------------------------
-- 9) updated_at triggers for new tables
-- ------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc WHERE proname = 'update_updated_at' AND pg_function_is_visible(oid)
  ) THEN
    CREATE OR REPLACE FUNCTION public.update_updated_at()
    RETURNS TRIGGER AS $f$
    BEGIN
      NEW.updated_at = NOW();
      RETURN NEW;
    END;
    $f$ LANGUAGE plpgsql;
  END IF;
END $$;

DROP TRIGGER IF EXISTS trigger_academic_sessions_updated_at ON public.academic_sessions;
CREATE TRIGGER trigger_academic_sessions_updated_at
  BEFORE UPDATE ON public.academic_sessions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trigger_academic_terms_updated_at ON public.academic_terms;
CREATE TRIGGER trigger_academic_terms_updated_at
  BEFORE UPDATE ON public.academic_terms
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trigger_class_progression_policies_updated_at ON public.class_progression_policies;
CREATE TRIGGER trigger_class_progression_policies_updated_at
  BEFORE UPDATE ON public.class_progression_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ------------------------------------------------------------
-- 10) Verification notice
-- ------------------------------------------------------------
DO $$
BEGIN
  RAISE NOTICE 'Migration 005 complete: faculty hierarchy and academic progression schema added.';
END $$;

COMMIT;
