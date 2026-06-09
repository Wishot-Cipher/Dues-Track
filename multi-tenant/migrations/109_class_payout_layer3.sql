-- ============================================================
-- Migration 109: Class-tier payout at Layer 3 (peer-voted).
--
-- The autonomy gap (user-reported): "the class roles are not there"
-- on payout. set_group_payout (mig 092/107) requires the caller to be
-- verification_layer >= 4. But a class rep / fin sec / treasurer is
-- usually peer-voted to Layer 3 (member_confirmed) and never reaches
-- Layer 4, because Layer 4 needs a PARENT exec to confirm them — and
-- a brand-new class often has no dept/faculty exec above it yet. So an
-- autonomous, legitimately-elected class finance exec could NEVER set
-- their own class's bank account. The money was unreachable for the
-- exact tier that collects the most day-to-day dues.
--
-- Decision (with user): a CLASS sets its own payout at Layer 3
-- (peer-voted is enough for class autonomy). Department / faculty /
-- org keep Layer 4 — bigger money pools warrant the parent-confirm
-- anchor. The threshold is now derived from the TARGET group's kind.
--
-- Everything else from mig 107 (finance-role gate, audit row, change
-- notification, exact-group ownership) is unchanged.
-- ============================================================

BEGIN;

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
  v_group_kind     TEXT;
  v_min_layer      INT;
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

  SELECT organization_id, name, account_number, bank_code, kind
    INTO v_group_org, v_group_name, v_old_acct, v_old_bank, v_group_kind
  FROM public.organization_groups
  WHERE id = p_group_id;
  IF v_group_org IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'group_invalid');
  END IF;
  v_had_account := COALESCE(TRIM(v_old_acct), '') <> '';

  -- Tier-aware trust floor: a class can set its own payout once its
  -- finance exec is peer-voted (Layer 3); higher tiers need the
  -- Layer-4 parent-confirm anchor.
  v_min_layer := CASE WHEN LOWER(COALESCE(v_group_kind, '')) IN ('class', 'level')
                      THEN 3 ELSE 4 END;

  SELECT om.organization_id, om.full_name INTO v_caller_org, v_caller_name
  FROM public.organization_members om
  WHERE om.id = p_caller_member_id;
  IF v_caller_org IS NULL OR v_caller_org <> v_group_org THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'org_mismatch');
  END IF;

  SELECT scope_level, group_id, verification_layer, can_manage_payout
    INTO v_caller_scope, v_caller_group, v_caller_layer, v_caller_payout
  FROM public.member_admins
  WHERE member_id = p_caller_member_id
    AND organization_id = v_group_org
    AND is_active = TRUE
    AND COALESCE(verification_layer, 0) >= v_min_layer
  ORDER BY verification_layer DESC NULLS LAST
  LIMIT 1;

  IF v_caller_scope IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'not_verified_admin',
      'error', CASE WHEN v_min_layer = 3
                    THEN 'You need to be a peer-verified class exec to set payout.'
                    ELSE 'You need to be a verified exec (confirmed by a parent exec) to set payout.' END);
  END IF;
  IF NOT COALESCE(v_caller_payout, FALSE) THEN
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

-- can_member_manage_payout (mig 106) gates the UI/API check. It uses
-- verification_layer >= 3 already, which is correct for classes; the
-- per-tier Layer-4 floor for higher tiers is enforced in
-- set_group_payout above (the authoritative write path).

DO $$
BEGIN
  RAISE NOTICE 'Migration 109 complete: class-tier payout unlocks at Layer 3; dept/faculty stay Layer 4.';
END $$;

COMMIT;
