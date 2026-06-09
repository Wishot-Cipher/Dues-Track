-- ============================================================
-- Migration 110: Class rep counts as a finance role.
--
-- Bug (user-reported): a class rep ran migs 106-109 and still saw
-- "Payout is finance-only — only the president, treasurer or financial
-- secretary can manage payout." is_finance_role (mig 106) matched
-- president / treasurer / financial secretary / chairman / bursar /
-- director — but NOT "Class Rep". So the backfill set
-- can_manage_payout = FALSE for every class rep, locking them out of
-- their own class's payout.
--
-- The user's rule: at the CLASS tier the class rep / fin sec /
-- treasurer all manage class money — the class rep is the class's
-- chief exec, the class-tier equivalent of a president. So the
-- finance-eligible set must include rep / representative /
-- coordinator / governor (the various names for the elected class
-- leader), alongside the existing finance keywords.
--
-- This redefines is_finance_role and re-runs the backfill. After
-- applying, affected execs must re-login (or refresh their session)
-- so the new can_manage_payout flows into their JWT/admin_records on
-- the client.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.is_finance_role(
  p_role        TEXT,
  p_role_label  TEXT,
  p_scope_level TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql IMMUTABLE
AS $$
DECLARE
  v_role  TEXT := LOWER(TRIM(COALESCE(p_role, '')));
  v_label TEXT := LOWER(TRIM(COALESCE(p_role_label, '')));
  v_scope TEXT := LOWER(TRIM(COALESCE(p_scope_level, '')));
BEGIN
  -- Org-scope execs manage org-level payout.
  IF v_scope = 'org' THEN RETURN TRUE; END IF;
  IF v_role IN ('org_owner', 'org_admin') THEN RETURN TRUE; END IF;

  -- Finance + chief-exec keywords (any tier): president, treasurer,
  -- financial secretary / fin sec, chairman, bursar, director,
  -- governor. These manage money wherever they sit.
  IF v_role  ~ '(president|treasurer|financial|fin[_ ]?sec|finsec|chairman|bursar|director|governor)'
  OR v_label ~ '(president|treasurer|financial|fin[_ ]?sec|finsec|chairman|bursar|director|governor)'
  THEN
    RETURN TRUE;
  END IF;

  -- The class CHIEF exec — "Class Rep" / "Course Rep" / "Class
  -- Representative". Matched with a class/course/group prefix so a
  -- sub-officer like "Welfare Rep" or "Sports Rep" is NOT granted
  -- payout access (they're not the class's money-holder).
  IF v_role  ~ '(class|course|group)[ _-]?(rep|representative)'
  OR v_label ~ '(class|course|group)[ _-]?(rep|representative)'
  THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_finance_role(TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- Re-backfill every member_admins row against the widened definition.
-- The trigger (mig 106) handles future writes; this catches the rows
-- created before mig 110 (every existing class rep).
UPDATE public.member_admins
SET can_manage_payout = public.is_finance_role(role, role_label, scope_level),
    updated_at = NOW()
WHERE can_manage_payout IS DISTINCT FROM
      public.is_finance_role(role, role_label, scope_level);

DO $$
DECLARE v_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_count FROM public.member_admins WHERE can_manage_payout = TRUE;
  RAISE NOTICE 'Migration 110 complete: class reps are finance-eligible. % admin rows now hold can_manage_payout.', v_count;
END $$;

COMMIT;
