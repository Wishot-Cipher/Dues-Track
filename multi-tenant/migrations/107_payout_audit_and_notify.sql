-- ============================================================
-- Migration 107: Payout security — Layer 3 (audit + notify) and a
-- tightened set_group_payout that requires can_manage_payout.
--
-- Builds on mig 106 (can_manage_payout permission). Two goals:
--
--   A) AUDIT — every payout change writes an append-only row
--      (who, when, masked old → new account). A thief can change the
--      account, but never silently: the trail always names them.
--
--   B) NOTIFY — on a CHANGE (not first-time setup), the OTHER finance
--      execs in that tier get a notification: "⚠️ The payout account
--      for <group> was changed by <name>." Silent redirection is the
--      dangerous attack; this makes every change loud.
--
-- Also tightens set_group_payout: in addition to the existing
-- Layer-4 + exact-group ownership checks (mig 092), the caller must
-- now have can_manage_payout = TRUE (president / treasurer / fin sec
-- — see is_finance_role in mig 106). A PRO or secretary with generic
-- settings access can no longer touch where money lands.
--
-- Layer 2 (password re-verification) lives at the API edge
-- (api/paystack) where the raw password travels over HTTPS — it
-- calls verify_member_password before invoking this RPC. We keep the
-- crypto out of this SECURITY DEFINER path on purpose.
-- ============================================================

BEGIN;

-- ── A) Audit table ──
CREATE TABLE IF NOT EXISTS public.payout_audit (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  group_id         UUID REFERENCES public.organization_groups(id) ON DELETE SET NULL,
  changed_by       UUID REFERENCES public.organization_members(id) ON DELETE SET NULL,
  changed_by_name  TEXT,
  action           TEXT NOT NULL,           -- 'setup' | 'change'
  old_account_last4 TEXT,
  new_account_last4 TEXT,
  old_bank_code    TEXT,
  new_bank_code    TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_payout_audit_org   ON public.payout_audit (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_payout_audit_group ON public.payout_audit (group_id, created_at DESC);

ALTER TABLE public.payout_audit ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS payout_audit_service ON public.payout_audit;
CREATE POLICY payout_audit_service ON public.payout_audit
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
-- Execs can read the audit trail for groups they can access.
DROP POLICY IF EXISTS payout_audit_read ON public.payout_audit;
CREATE POLICY payout_audit_read ON public.payout_audit FOR SELECT
  USING (
    auth.role() = 'service_role'
    OR public.can_access_group(group_id)
    OR EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = payout_audit.organization_id
        AND ma.is_active = TRUE
        AND ma.scope_level = 'org'
    )
  );
GRANT SELECT ON public.payout_audit TO authenticated, anon, service_role;

-- ── B) Tightened set_group_payout (replaces mig 092's version) ──
-- Same signature, so the API caller (api/paystack) is unchanged.
CREATE OR REPLACE FUNCTION public.set_group_payout(
  p_caller_member_id        UUID,
  p_group_id                UUID,
  p_paystack_subaccount_code TEXT,
  p_paystack_subaccount_id  TEXT,
  p_bank_name               TEXT,
  p_bank_code               TEXT,
  p_account_name            TEXT,
  p_account_number          TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group_org      UUID;
  v_caller_org     UUID;
  v_caller_scope   TEXT;
  v_caller_group   UUID;
  v_caller_layer   INT;
  v_caller_payout  BOOLEAN;
  v_caller_name    TEXT;
  v_authorized     BOOLEAN := FALSE;
  v_old_acct       TEXT;
  v_old_bank       TEXT;
  v_had_account    BOOLEAN;
  v_group_name     TEXT;
BEGIN
  IF COALESCE(TRIM(p_paystack_subaccount_code), '') = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_subaccount');
  END IF;
  IF COALESCE(TRIM(p_account_number), '') = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_account');
  END IF;

  SELECT organization_id, name, account_number, bank_code
    INTO v_group_org, v_group_name, v_old_acct, v_old_bank
  FROM public.organization_groups
  WHERE id = p_group_id;
  IF v_group_org IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'group_invalid');
  END IF;
  v_had_account := COALESCE(TRIM(v_old_acct), '') <> '';

  SELECT om.organization_id, om.full_name INTO v_caller_org, v_caller_name
  FROM public.organization_members om
  WHERE om.id = p_caller_member_id;
  IF v_caller_org IS NULL OR v_caller_org <> v_group_org THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'org_mismatch');
  END IF;

  -- Layer-4 verified admin whose scope covers this group, AND who
  -- holds the can_manage_payout finance capability (mig 106).
  SELECT scope_level, group_id, verification_layer, can_manage_payout
    INTO v_caller_scope, v_caller_group, v_caller_layer, v_caller_payout
  FROM public.member_admins
  WHERE member_id = p_caller_member_id
    AND organization_id = v_group_org
    AND is_active = TRUE
    AND COALESCE(verification_layer, 0) >= 4
  ORDER BY verification_layer DESC NULLS LAST
  LIMIT 1;

  IF v_caller_scope IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_verified_admin');
  END IF;
  IF NOT COALESCE(v_caller_payout, FALSE) THEN
    -- New gate: only finance roles may manage payout.
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_finance_role',
      'error', 'Only the president, treasurer or financial secretary can manage payout.');
  END IF;

  IF v_caller_scope = 'org' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'use_org_payout');
  END IF;

  IF v_caller_group IS NOT NULL AND v_caller_group = p_group_id THEN
    v_authorized := TRUE;
  END IF;
  IF NOT v_authorized THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_your_group');
  END IF;

  UPDATE public.organization_groups
     SET paystack_subaccount_code  = p_paystack_subaccount_code,
         paystack_subaccount_id    = p_paystack_subaccount_id,
         bank_name                 = p_bank_name,
         bank_code                 = p_bank_code,
         account_name              = p_account_name,
         account_number            = p_account_number,
         payout_setup_at           = NOW(),
         payout_setup_by_member_id = p_caller_member_id,
         updated_at                = NOW()
   WHERE id = p_group_id;

  -- ── Audit row (append-only; account stored as last-4 only) ──
  INSERT INTO public.payout_audit (
    organization_id, group_id, changed_by, changed_by_name,
    action, old_account_last4, new_account_last4, old_bank_code, new_bank_code
  ) VALUES (
    v_group_org, p_group_id, p_caller_member_id, v_caller_name,
    CASE WHEN v_had_account THEN 'change' ELSE 'setup' END,
    RIGHT(COALESCE(v_old_acct, ''), 4),
    RIGHT(COALESCE(p_account_number, ''), 4),
    v_old_bank, p_bank_code
  );

  -- ── Notify OTHER finance execs in this tier on a CHANGE ──
  -- (Not on first-time setup — there's nothing to warn about yet.)
  IF v_had_account THEN
    INSERT INTO public.notifications (
      organization_id, member_id, group_id,
      type, title, message, link, related_type, related_id
    )
    SELECT
      v_group_org, ma.member_id, p_group_id,
      'payout_changed',
      'Payout account changed',
      COALESCE(v_caller_name, 'An exec') || ' changed the payout account for ' ||
        COALESCE(v_group_name, 'your group') || ' (now ending ' ||
        RIGHT(COALESCE(p_account_number, ''), 4) || '). If this wasn''t expected, review it now.',
      '/admin/payout',
      'payout_audit', p_group_id
    FROM public.member_admins ma
    WHERE ma.organization_id = v_group_org
      AND ma.group_id = p_group_id
      AND ma.is_active = TRUE
      AND ma.can_manage_payout = TRUE
      AND ma.member_id <> p_caller_member_id;
  END IF;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'group_id', p_group_id,
    'subaccount_code', p_paystack_subaccount_code,
    'action', CASE WHEN v_had_account THEN 'change' ELSE 'setup' END
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_group_payout(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_group_payout(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 107 complete: payout_audit + change notifications + finance-role gate on set_group_payout.';
END $$;

COMMIT;
