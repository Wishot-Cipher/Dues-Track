-- ============================================================
-- Migration 069: Publishing dues/events requires FULL verification (Layer 4)
--
-- Previously create_due_with_scope_check allowed any "trusted" verification
-- status — including 'email_verified' (Layer 2). Per the layered-trust model,
-- money only flows at Layer 4 (parent-exec confirmed / bootstrap-complete /
-- platform override). So an email-only "acting" exec must NOT be able to
-- publish money-collecting dues or event tickets, even by calling the RPC
-- directly. This recreates the function (from mig 058) with a layer >= 4 gate.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_due_with_scope_check(
  p_caller_member_id UUID,
  p_target_scope     TEXT,
  p_target_group_id  UUID,
  p_payload          JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id              UUID;
  v_org_state           TEXT;
  v_org_type            TEXT;
  v_category            TEXT;
  v_is_event            BOOLEAN;
  v_caller_scope        TEXT;
  v_caller_group_id     UUID;
  v_caller_can_create   BOOLEAN := FALSE;
  v_caller_layer        INTEGER := 0;
  v_target_kind         TEXT;
  v_target_parent_id    UUID;
  v_target_collects     BOOLEAN;
  v_resolved_group_id   UUID;
  v_session_id          UUID;
  v_session_label       TEXT;
  v_payment_type_id     UUID;
  v_fanout_result       JSONB;
  v_tier_count          INTEGER := 0;
BEGIN
  IF p_caller_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;
  IF p_target_scope NOT IN ('org','faculty','group') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid target scope.');
  END IF;

  v_category := COALESCE(p_payload->>'category', 'dues');
  v_is_event := (v_category = 'event');

  SELECT om.organization_id INTO v_org_id
  FROM public.organization_members om
  WHERE om.id = p_caller_member_id AND COALESCE(om.is_active, TRUE) = TRUE
  LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found or inactive.');
  END IF;

  SELECT org_state, organization_type INTO v_org_state, v_org_type
  FROM public.organizations WHERE id = v_org_id;

  IF v_org_state IS NULL OR v_org_state <> 'active' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'This organization is ' || COALESCE(v_org_state,'unknown') ||
      '. You can only publish when the organization is Active.');
  END IF;

  -- Caller's most permissive admin row (by scope), with its trust layer
  SELECT ma.scope_level, ma.group_id,
         COALESCE(ma.can_create_payments, FALSE),
         COALESCE(ma.verification_layer, 0)
    INTO v_caller_scope, v_caller_group_id, v_caller_can_create, v_caller_layer
  FROM public.member_admins ma
  WHERE ma.member_id = p_caller_member_id
    AND ma.organization_id = v_org_id
    AND COALESCE(ma.is_active, TRUE) = TRUE
  ORDER BY CASE ma.scope_level WHEN 'org' THEN 0 WHEN 'unit' THEN 1 WHEN 'group' THEN 2 ELSE 3 END,
           ma.created_at DESC
  LIMIT 1;

  IF v_caller_scope IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You are not an admin in this organization.');
  END IF;
  IF NOT v_caller_can_create THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Your role does not allow creating dues or events.');
  END IF;

  -- LAYERED TRUST: money only flows at Layer 4. Acting execs (email/peer) can't publish.
  IF v_caller_layer < 4 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Full verification (Layer 4) is required before publishing — money-collecting dues and event tickets unlock then. You are currently acting (Layer ' || v_caller_layer || ').');
  END IF;

  -- Bursar model: SUG (org scope) of an academic org cannot create DUES
  IF NOT v_is_event
     AND v_caller_scope = 'org'
     AND COALESCE(v_org_type,'') IN ('university','polytechnic','college','school') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'As an SUG/university-wide exec you can create events, but university-wide dues are collected by the bursar, not on Payvexo.');
  END IF;

  -- Validate the target
  IF p_target_scope = 'org' THEN
    IF v_caller_scope <> 'org' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Only an org-wide exec can target the whole organization. Your scope is ' || v_caller_scope || '.');
    END IF;
    v_resolved_group_id := NULL;

  ELSIF p_target_scope IN ('faculty','group') THEN
    IF p_target_group_id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Target group is required for this scope.');
    END IF;

    SELECT kind, parent_group_id, can_collect_dues
      INTO v_target_kind, v_target_parent_id, v_target_collects
    FROM public.organization_groups
    WHERE id = p_target_group_id AND organization_id = v_org_id;

    IF v_target_kind IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Target group not found in your organization.');
    END IF;

    IF NOT v_is_event AND COALESCE(v_target_collects, TRUE) = FALSE THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'This group is configured not to collect dues.');
    END IF;

    IF p_target_scope = 'faculty' AND v_target_kind NOT IN ('faculty','college') THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Faculty-scoped items must point at a faculty (or college) group.');
    END IF;

    IF v_caller_scope = 'org' THEN
      NULL;
    ELSIF v_caller_scope = 'unit' THEN
      IF p_target_group_id <> v_caller_group_id
         AND v_target_parent_id IS DISTINCT FROM v_caller_group_id THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'You can only publish to your faculty or classes inside it.');
      END IF;
    ELSE
      IF p_target_group_id <> v_caller_group_id THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'You can only publish to your own class. Ask your faculty exec for cross-class items.');
      END IF;
    END IF;

    v_resolved_group_id := p_target_group_id;
  END IF;

  SELECT id, label INTO v_session_id, v_session_label
  FROM public.academic_sessions
  WHERE organization_id = v_org_id AND is_active = TRUE
  ORDER BY start_date DESC LIMIT 1;

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
    academic_session_id, academic_session_label,
    created_by
  ) VALUES (
    v_org_id, v_resolved_group_id,
    p_payload->>'title',
    p_payload->>'description',
    v_category,
    COALESCE((p_payload->>'amount')::NUMERIC, 0),
    p_payload->>'icon',
    p_payload->>'color',
    NULLIF(p_payload->>'deadline','')::TIMESTAMPTZ,
    NULLIF(p_payload->>'late_fee_per_day','')::NUMERIC,
    CASE WHEN v_is_event THEN FALSE ELSE COALESCE((p_payload->>'is_mandatory')::BOOLEAN, TRUE) END,
    COALESCE((p_payload->>'allow_partial')::BOOLEAN, FALSE),
    NULLIF(p_payload->>'minimum_partial_amount','')::NUMERIC,
    COALESCE((p_payload->>'is_public')::BOOLEAN, FALSE),
    CASE WHEN p_payload ? 'target_levels'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'target_levels')) ELSE NULL END,
    CASE WHEN p_payload ? 'target_sections'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'target_sections')) ELSE NULL END,
    TRUE,
    p_payload->>'bank_name',
    p_payload->>'account_name',
    p_payload->>'account_number',
    COALESCE((p_payload->>'accepts_paystack')::BOOLEAN, TRUE),
    COALESCE((p_payload->>'accepts_manual')::BOOLEAN, NOT v_is_event),
    NULLIF(p_payload->>'event_date','')::TIMESTAMPTZ,
    p_payload->>'event_venue',
    p_payload->>'event_cover_url',
    NULLIF(p_payload->>'event_max_attendees','')::INTEGER,
    v_session_id, v_session_label,
    p_caller_member_id
  )
  RETURNING id INTO v_payment_type_id;

  IF v_is_event AND (p_payload ? 'tiers') THEN
    INSERT INTO public.event_ticket_tiers (
      payment_type_id, organization_id, name, description, price, quantity, sort_order
    )
    SELECT
      v_payment_type_id, v_org_id,
      COALESCE(NULLIF(t->>'name',''), 'Ticket'),
      NULLIF(t->>'description',''),
      COALESCE((t->>'price')::NUMERIC, 0),
      NULLIF(t->>'quantity','')::INTEGER,
      (ord - 1)::INTEGER
    FROM jsonb_array_elements(p_payload->'tiers') WITH ORDINALITY AS arr(t, ord)
    WHERE COALESCE(NULLIF(t->>'name',''), '') <> '' OR (t->>'price') IS NOT NULL;
    GET DIAGNOSTICS v_tier_count = ROW_COUNT;
  END IF;

  v_fanout_result := public.fanout_due_notifications(v_payment_type_id);

  RETURN jsonb_build_object(
    'ok',              TRUE,
    'payment_type_id', v_payment_type_id,
    'category',        v_category,
    'target_scope',    p_target_scope,
    'target_group_id', v_resolved_group_id,
    'caller_scope',    v_caller_scope,
    'session_label',   v_session_label,
    'tier_count',      v_tier_count,
    'notified_count',  COALESCE((v_fanout_result->>'notified_count')::INTEGER, 0),
    'target_count',    COALESCE((v_fanout_result->>'target_count')::INTEGER, 0)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not publish: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_due_with_scope_check(UUID, TEXT, UUID, JSONB)
  TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 069 complete: publishing dues/events now requires Layer 4.';
END $$;

COMMIT;
