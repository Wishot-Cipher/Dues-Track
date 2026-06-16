-- ============================================================
-- Migration 142: payout gate only applies to Paystack dues
--
-- Why
-- ---
-- create_due_with_scope_check (mig 094) blocked publishing ANY due
-- unless the tier/org had a Paystack subaccount on file ('no_payout').
-- That was correct when every due was online — but now a free-tier
-- class collects by MANUAL receipt (accepts_paystack = false, mig 141),
-- paying to the bank_name/account_number entered on the due itself, not
-- a Paystack subaccount. Under the old gate a free class could never
-- publish a due at all, which breaks the entire manual-first model.
--
-- This redefinition is BYTE-IDENTICAL to mig 094 except the payout
-- gate is now wrapped in `IF the due accepts Paystack`. Manual-only
-- dues skip the subaccount requirement; Paystack dues still require a
-- payout account exactly as before.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_due_with_scope_check(
  p_caller_member_id UUID,
  p_target_scope     TEXT,
  p_target_group_id  UUID,
  p_payload          JSONB
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id                UUID;
  v_caller_scope          TEXT;
  v_caller_group_id       UUID;
  v_caller_has_create     BOOLEAN;
  v_target_kind           TEXT;
  v_target_parent_id      UUID;
  v_resolved_group_id     UUID;
  v_payment_type_id       UUID;
  v_fanout_result         JSONB;
  v_subaccount            TEXT;
  v_org_subaccount        TEXT;
  v_wants_paystack        BOOLEAN;
BEGIN
  IF p_caller_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Caller member id is required.');
  END IF;

  IF p_target_scope NOT IN ('org','faculty','group') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid target scope.');
  END IF;

  -- Resolve caller's org + scope + group + create perm
  SELECT om.organization_id INTO v_org_id
  FROM public.organization_members om
  WHERE om.id = p_caller_member_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Caller is not a member of any org.');
  END IF;

  SELECT scope_level, group_id, COALESCE(can_create_payments, FALSE)
    INTO v_caller_scope, v_caller_group_id, v_caller_has_create
  FROM public.member_admins
  WHERE member_id = p_caller_member_id
    AND organization_id = v_org_id
    AND is_active = TRUE
  ORDER BY
    CASE scope_level
      WHEN 'org'   THEN 1
      WHEN 'unit'  THEN 2
      WHEN 'group' THEN 3
      ELSE 9
    END
  LIMIT 1;

  IF v_caller_scope IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You are not an admin in this organization.');
  END IF;
  IF NOT v_caller_has_create THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You do not have permission to create dues.');
  END IF;

  -- Resolve + authorise target
  IF p_target_scope = 'org' THEN
    IF v_caller_scope <> 'org' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Only an org-wide admin can create org-wide dues. Yours is ' || v_caller_scope || '-scope.');
    END IF;
    v_resolved_group_id := NULL;

  ELSIF p_target_scope IN ('faculty','group') THEN
    IF p_target_group_id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Target group is required for this scope.');
    END IF;

    SELECT kind, parent_group_id
      INTO v_target_kind, v_target_parent_id
    FROM public.organization_groups
    WHERE id = p_target_group_id
      AND organization_id = v_org_id;

    IF v_target_kind IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Target group not found in your organization.');
    END IF;

    IF v_caller_scope = 'org' THEN
      NULL;
    ELSIF v_caller_scope = 'unit' THEN
      IF p_target_group_id <> v_caller_group_id
         AND v_target_parent_id IS DISTINCT FROM v_caller_group_id THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'You can only publish dues to your faculty/dept or classes inside it.');
      END IF;
    ELSE
      IF p_target_group_id <> v_caller_group_id THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'You can only publish dues to your own class. Ask your faculty admin for cross-class dues.');
      END IF;
    END IF;

    v_resolved_group_id := p_target_group_id;
  END IF;

  -- ── PAYOUT GATE — ONLY for dues that actually accept Paystack ──
  -- A manual-only due (free tier) collects to the bank details on the
  -- due itself, not a Paystack subaccount, so it must not be blocked
  -- for lacking one. Paystack dues still require a payout account.
  v_wants_paystack := COALESCE((p_payload->>'accepts_paystack')::BOOLEAN, TRUE);
  IF v_wants_paystack THEN
    IF p_target_scope = 'org' THEN
      SELECT paystack_subaccount_code INTO v_org_subaccount
      FROM public.organizations WHERE id = v_org_id;
      IF v_org_subaccount IS NULL OR LENGTH(TRIM(v_org_subaccount)) = 0 THEN
        RETURN jsonb_build_object(
          'ok', FALSE, 'code', 'no_payout', 'scope', 'org',
          'detail', 'Set up the organization payout account before publishing org-wide online dues.'
        );
      END IF;
    ELSE
      SELECT paystack_subaccount_code INTO v_subaccount
      FROM public.organization_groups WHERE id = v_resolved_group_id;
      IF v_subaccount IS NULL OR LENGTH(TRIM(v_subaccount)) = 0 THEN
        RETURN jsonb_build_object(
          'ok', FALSE, 'code', 'no_payout',
          'scope', p_target_scope, 'group_id', v_resolved_group_id,
          'group_kind', v_target_kind,
          'detail', 'This tier has no payout account on file. Set it up first so members can pay online.'
        );
      END IF;
    END IF;
  END IF;

  -- ── Insert the payment_type ──────────────────────────────────
  INSERT INTO public.payment_types (
    organization_id, group_id,
    title, description, category, amount,
    icon, color,
    deadline, late_fee_per_day,
    is_mandatory, allow_partial, minimum_partial_amount, is_public,
    target_levels, target_sections,
    is_active,
    bank_name, account_name, account_number,
    accepts_paystack, accepts_manual,
    event_date, event_venue, event_cover_url, event_max_attendees,
    created_by
  ) VALUES (
    v_org_id, v_resolved_group_id,
    p_payload->>'title',
    p_payload->>'description',
    COALESCE(p_payload->>'category', 'dues'),
    COALESCE((p_payload->>'amount')::NUMERIC, 0),
    p_payload->>'icon',
    p_payload->>'color',
    NULLIF(p_payload->>'deadline','')::TIMESTAMPTZ,
    NULLIF(p_payload->>'late_fee_per_day','')::NUMERIC,
    COALESCE((p_payload->>'is_mandatory')::BOOLEAN, TRUE),
    COALESCE((p_payload->>'allow_partial')::BOOLEAN, FALSE),
    NULLIF(p_payload->>'minimum_partial_amount','')::NUMERIC,
    COALESCE((p_payload->>'is_public')::BOOLEAN, FALSE),
    CASE
      WHEN jsonb_typeof(p_payload->'target_levels') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'target_levels'))
      ELSE NULL
    END,
    CASE
      WHEN jsonb_typeof(p_payload->'target_sections') = 'array'
        THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'target_sections'))
      ELSE NULL
    END,
    TRUE,
    p_payload->>'bank_name',
    p_payload->>'account_name',
    p_payload->>'account_number',
    COALESCE((p_payload->>'accepts_paystack')::BOOLEAN, TRUE),
    COALESCE((p_payload->>'accepts_manual')::BOOLEAN, TRUE),
    NULLIF(p_payload->>'event_date','')::TIMESTAMPTZ,
    p_payload->>'event_venue',
    p_payload->>'event_cover_url',
    NULLIF(p_payload->>'event_max_attendees','')::INTEGER,
    p_caller_member_id
  )
  RETURNING id INTO v_payment_type_id;

  v_fanout_result := public.fanout_due_notifications(v_payment_type_id);

  RETURN jsonb_build_object(
    'ok',               TRUE,
    'payment_type_id',  v_payment_type_id,
    'target_scope',     p_target_scope,
    'target_group_id',  v_resolved_group_id,
    'caller_scope',     v_caller_scope,
    'notified_count',   COALESCE((v_fanout_result->>'notified_count')::INTEGER, 0)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_due_with_scope_check(UUID, TEXT, UUID, JSONB) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.create_due_with_scope_check(UUID, TEXT, UUID, JSONB) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 142 applied: due payout gate now only blocks Paystack dues. Free/manual-only dues publish without a subaccount.';
END $$;

COMMIT;
