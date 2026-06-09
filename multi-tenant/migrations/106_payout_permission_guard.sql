-- ============================================================
-- Migration 106: Payout security — Layer 1 (role eligibility).
--
-- Why
-- ---
-- PayoutSetupPage is currently gated by can_manage_settings + a
-- verified flag. That's too broad: ANY approved exec (a PRO, a
-- welfare officer, a secretary) can redirect where members' money
-- settles. Payout is the single most sensitive surface in the app —
-- if the wrong exec sets their own account, they drain the tier.
--
-- The user's rule (verbatim): "it is only the president, treasurer &
-- fin sec that has the right to create dues and also collect and
-- push money." So payout management must be a NARROW capability, not
-- a side effect of being any exec.
--
-- Design
-- ------
-- The existing finalization paths (mig 042 confirm + bootstrap, mig
-- 096 org-owner) grant ALL can_* permissions = TRUE to every approved
-- exec. Permissions aren't role-differentiated today. Rather than
-- patch every RPC to special-case payout, we:
--
--   1) Add can_manage_payout (default FALSE).
--   2) Add is_finance_role(role, role_label, scope_level) — the
--      single source of truth for "may this exec touch payout?".
--      TRUE when: org-scope (org owner / SUG president sit at the top
--      of the money tree), OR role/label matches a finance keyword
--      (president, treasurer, financial secretary, fin sec, chairman,
--      bursar, director).
--   3) Add a BEFORE INSERT/UPDATE trigger that sets
--      NEW.can_manage_payout from is_finance_role(). Centralized — so
--      every existing RPC, plus future handover transfers (mig 107),
--      land the right value with no per-RPC changes.
--   4) Backfill existing member_admins rows.
--
-- The FE (PayoutSetupPage) reads can_manage_payout off the active
-- role + adds Layer 2 (password re-verify) and Layer 3 (audit +
-- notify) in mig 106b / the UI patch. This migration is Layer 1 only.
-- ============================================================

BEGIN;

-- ── 1) Column ──
ALTER TABLE public.member_admins
  ADD COLUMN IF NOT EXISTS can_manage_payout BOOLEAN NOT NULL DEFAULT FALSE;

-- ── 2) Single source of truth for finance eligibility ──
-- Matches on BOTH the structured role enum and the free-text
-- role_label, case-insensitive, because claims store a free-text
-- position title ("Financial Secretary", "Class President", "Fin
-- Sec") alongside the coarse role ('group_admin' / 'org_owner' /...).
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
  -- Org-scope execs (org owner, SUG president) sit at the top of the
  -- money tree and manage org-level payout.
  IF v_scope = 'org' THEN
    RETURN TRUE;
  END IF;
  IF v_role IN ('org_owner', 'org_admin') THEN
    RETURN TRUE;
  END IF;

  -- Finance keywords on either the role or the friendly label.
  -- "president" is intentionally included — in Nigerian student
  -- bodies the class/dept president drives dues collection.
  IF v_role  ~ '(president|treasurer|financial|fin[_ ]?sec|finsec|chairman|bursar|director)'
  OR v_label ~ '(president|treasurer|financial|fin[_ ]?sec|finsec|chairman|bursar|director)'
  THEN
    RETURN TRUE;
  END IF;

  RETURN FALSE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.is_finance_role(TEXT, TEXT, TEXT)
  TO anon, authenticated, service_role;

-- ── 3) Trigger: derive can_manage_payout on every write ──
-- BEFORE so we set the column in-row without a second UPDATE. Fires
-- on INSERT and on UPDATE of role/role_label/scope_level so a role
-- change (or a handover transfer) re-derives correctly. is_active is
-- respected by the FE/RPC gate separately — an inactive finance row
-- still "could" manage payout if reactivated, which is fine.
CREATE OR REPLACE FUNCTION public.set_can_manage_payout()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.can_manage_payout := public.is_finance_role(NEW.role, NEW.role_label, NEW.scope_level);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_can_manage_payout ON public.member_admins;
CREATE TRIGGER trg_set_can_manage_payout
  BEFORE INSERT OR UPDATE OF role, role_label, scope_level
  ON public.member_admins
  FOR EACH ROW
  EXECUTE FUNCTION public.set_can_manage_payout();

-- ── 4) Backfill existing rows ──
UPDATE public.member_admins
SET can_manage_payout = public.is_finance_role(role, role_label, scope_level),
    updated_at = NOW()
WHERE can_manage_payout IS DISTINCT FROM
      public.is_finance_role(role, role_label, scope_level);

-- ── 5) Helper the FE / RLS can call to check the caller cleanly ──
-- Returns TRUE only for an ACTIVE, verified (layer>=3) finance exec
-- at the given group (or an org-scope finance exec, who covers all
-- groups). Used by the payout RPC guard in the UI patch.
CREATE OR REPLACE FUNCTION public.can_member_manage_payout(
  p_member_id UUID,
  p_group_id  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  IF p_member_id IS NULL THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id = p_member_id
      AND ma.is_active = TRUE
      AND ma.can_manage_payout = TRUE
      AND COALESCE(ma.verification_layer, 0) >= 3
      AND (
        ma.scope_level = 'org'                       -- org exec covers everything
        OR ma.group_id = p_group_id                  -- exact group match
        OR p_group_id IS NULL                         -- org-level payout check
        OR ma.group_id IN (                           -- ancestor exec covers descendants
          WITH RECURSIVE up AS (
            SELECT id, parent_group_id FROM public.organization_groups WHERE id = p_group_id
            UNION ALL
            SELECT g.id, g.parent_group_id
            FROM public.organization_groups g JOIN up ON g.id = up.parent_group_id
          )
          SELECT id FROM up
        )
      )
  ) INTO v_ok;

  RETURN COALESCE(v_ok, FALSE);
END;
$$;
GRANT EXECUTE ON FUNCTION public.can_member_manage_payout(UUID, UUID)
  TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 106 complete: can_manage_payout permission + finance-role trigger + backfill.';
END $$;

COMMIT;
