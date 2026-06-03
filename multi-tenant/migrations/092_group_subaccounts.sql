-- ============================================================
-- Migration 092: per-tier payout subaccounts on organization_groups
--
-- Strategic decision (the user's words):
--   "we're treating these people autonomously. let's guide the exec
--    of each tier to set their subaccount to collect money. If money
--    enters the parent they won't see it again."
--
-- Translation into schema:
--   • Every organization_groups row may carry its OWN Paystack
--     subaccount + bank details.
--   • NO CASCADE. When a class publishes a due, money must hit the
--     CLASS's subaccount; if not set, the publish is blocked.
--   • Same for dept, faculty, org.
--
-- The dues-creation RPC enforces the rule (see mig 093). This
-- migration just lays the columns + ergonomics down.
--
-- Permissions:
--   • Each tier's verified exec configures their own group's payout.
--   • A higher tier CAN'T override a lower tier's account (the
--     RPC enforces this).
-- ============================================================

BEGIN;

-- ── 1. Schema ────────────────────────────────────────────────
ALTER TABLE public.organization_groups
  ADD COLUMN IF NOT EXISTS paystack_subaccount_code TEXT,
  ADD COLUMN IF NOT EXISTS paystack_subaccount_id   TEXT,
  ADD COLUMN IF NOT EXISTS bank_name                TEXT,
  ADD COLUMN IF NOT EXISTS bank_code                TEXT,
  ADD COLUMN IF NOT EXISTS account_name             TEXT,
  ADD COLUMN IF NOT EXISTS account_number           TEXT,
  ADD COLUMN IF NOT EXISTS payout_setup_at          TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payout_setup_by_member_id UUID;

CREATE INDEX IF NOT EXISTS organization_groups_subaccount_idx
  ON public.organization_groups (paystack_subaccount_code)
  WHERE paystack_subaccount_code IS NOT NULL;

-- ── 2. Setter RPC ────────────────────────────────────────────
-- A tier's verified exec calls this to attach their bank account.
-- Validations:
--   • Caller must hold a Layer-4 admin record over the target group
--     (group-scope for class, unit-scope for dept/faculty matching
--     the group_id).
--   • Subaccount + bank fields are required (we don't half-set).
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
  v_authorized     BOOLEAN := FALSE;
BEGIN
  -- Required fields
  IF COALESCE(TRIM(p_paystack_subaccount_code), '') = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_subaccount');
  END IF;
  IF COALESCE(TRIM(p_account_number), '') = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'missing_account');
  END IF;

  SELECT organization_id INTO v_group_org
  FROM public.organization_groups
  WHERE id = p_group_id;
  IF v_group_org IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'group_invalid');
  END IF;

  -- Caller must be a verified admin (Layer 4) whose scope covers
  -- this exact group_id. NO higher-tier override — autonomy is the
  -- whole point of this design.
  SELECT om.organization_id INTO v_caller_org
  FROM public.organization_members om
  WHERE om.id = p_caller_member_id;
  IF v_caller_org IS NULL OR v_caller_org <> v_group_org THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'org_mismatch');
  END IF;

  SELECT scope_level, group_id, verification_layer
    INTO v_caller_scope, v_caller_group, v_caller_layer
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

  -- Org scope can only set the ORG's own subaccount (which is on
  -- organizations, not here — keeps this RPC focused on the group
  -- tiers). Reject org-scope callers attempting to set a group.
  IF v_caller_scope = 'org' THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'use_org_payout');
  END IF;

  -- Unit / group scope can only set THEIR OWN group's subaccount.
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

  RETURN jsonb_build_object(
    'ok', TRUE,
    'group_id', p_group_id,
    'subaccount_code', p_paystack_subaccount_code
  );
END;
$$;

REVOKE ALL ON FUNCTION public.set_group_payout(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.set_group_payout(UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO authenticated;

-- ── 3. Read-side helper ──────────────────────────────────────
-- Used by the UI's first-due flow to know whether the target group
-- has a payout configured before showing the modal.
CREATE OR REPLACE FUNCTION public.get_group_payout_status(p_group_id UUID)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_row RECORD;
BEGIN
  SELECT
    paystack_subaccount_code,
    bank_name,
    account_name,
    -- Account number is sensitive; surface only the last 4 so the UI
    -- can show "**** **** **89" without exposing the full number.
    RIGHT(COALESCE(account_number, ''), 4) AS account_last4,
    payout_setup_at,
    name,
    kind
  INTO v_row
  FROM public.organization_groups
  WHERE id = p_group_id;

  IF v_row IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'group_invalid');
  END IF;

  RETURN jsonb_build_object(
    'ok',              TRUE,
    'has_payout',      v_row.paystack_subaccount_code IS NOT NULL,
    'subaccount_code', v_row.paystack_subaccount_code,
    'bank_name',       v_row.bank_name,
    'account_name',    v_row.account_name,
    'account_last4',   v_row.account_last4,
    'configured_at',   v_row.payout_setup_at,
    'group_name',      v_row.name,
    'group_kind',      v_row.kind
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_group_payout_status(UUID) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.get_group_payout_status(UUID) TO authenticated, anon;

COMMIT;
