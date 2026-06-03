-- ============================================================
-- Migration 020: Drop Legacy Tables (students, admins, departments)
--
-- ⚠️ DESTRUCTIVE — read before running.
--
-- The audit (codebase grep across src/) confirmed that NO code
-- references the legacy tables students / admins / departments
-- anymore. The app fully runs on:
--   organization_members (replaces students)
--   member_admins        (replaces admins)
--   organization_groups  (replaces departments)
--
-- This migration removes the dead schema in three steps:
--   1. Drop FK constraints from active tables that still point
--      at the legacy tables.
--   2. Drop the now-orphan legacy columns (department_id,
--      student_id, etc.) from active tables.
--   3. Drop the legacy tables themselves.
--
-- Before running:
--   • Take a Supabase backup.
--   • Confirm src/ still has zero references:
--       grep -r "\.from('students'\|\.from('admins'\|\.from('departments'" src/
--     The output must be empty.
--
-- This migration is wrapped in a transaction. If any step fails,
-- nothing is dropped.
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1) Drop FK constraints pointing to legacy tables
-- ------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT tc.table_schema, tc.table_name, tc.constraint_name
    FROM information_schema.table_constraints tc
    JOIN information_schema.constraint_column_usage ccu
      ON ccu.constraint_name = tc.constraint_name
     AND ccu.table_schema = tc.table_schema
    WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
      AND ccu.table_name IN ('students','admins','departments')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.%I DROP CONSTRAINT IF EXISTS %I',
      r.table_schema, r.table_name, r.constraint_name
    );
    RAISE NOTICE '  dropped FK: %.% (%)', r.table_schema, r.table_name, r.constraint_name;
  END LOOP;
END $$;

-- ------------------------------------------------------------
-- 2) Drop orphan columns from active tables
--
-- These columns existed alongside their modern equivalents
-- (group_id, member_id, paid_by_member_id). Removing them
-- prevents future drift and shrinks rows.
-- ------------------------------------------------------------

-- payments
ALTER TABLE public.payments
  DROP COLUMN IF EXISTS department_id,
  DROP COLUMN IF EXISTS student_id,
  DROP COLUMN IF EXISTS paid_by,           -- legacy FK to students
  DROP COLUMN IF EXISTS approved_by;       -- legacy FK to admins

-- payment_types
ALTER TABLE public.payment_types
  DROP COLUMN IF EXISTS department_id,
  DROP COLUMN IF EXISTS created_by;        -- legacy FK to admins

-- expenses
ALTER TABLE public.expenses
  DROP COLUMN IF EXISTS department_id;

-- expense_categories
ALTER TABLE public.expense_categories
  DROP COLUMN IF EXISTS department_id;

-- notifications: legacy table may have had student_id; the new
-- table uses member_id, so drop the legacy column if present.
ALTER TABLE public.notifications
  DROP COLUMN IF EXISTS student_id;

-- ------------------------------------------------------------
-- 3) Drop the legacy tables
-- ------------------------------------------------------------
DROP TABLE IF EXISTS public.students   CASCADE;
DROP TABLE IF EXISTS public.admins     CASCADE;
DROP TABLE IF EXISTS public.departments CASCADE;

-- ------------------------------------------------------------
-- 4) Verification
-- ------------------------------------------------------------
DO $$
DECLARE
  remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM information_schema.tables
  WHERE table_schema = 'public'
    AND table_name IN ('students','admins','departments');

  IF remaining > 0 THEN
    RAISE EXCEPTION 'Migration 020 failed: % legacy table(s) still present.', remaining;
  END IF;

  RAISE NOTICE 'Migration 020 complete: legacy tables dropped.';
  RAISE NOTICE '  students   -> gone';
  RAISE NOTICE '  admins     -> gone';
  RAISE NOTICE '  departments -> gone';
END $$;

COMMIT;
