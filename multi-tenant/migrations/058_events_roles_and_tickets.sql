-- ============================================================
-- Migration 058: Event roles + tier creation + ticket issuing
--
-- 1) Rewrites create_due_with_scope_check (from mig 035) to:
--      a. Branch on category. For category='event' the dues-only gates
--         (can_collect_dues, "SUG can't collect") are relaxed — any verified
--         exec at their scope may sell events.
--      b. Enforce the bursar model: for DUES, an org-scope (SUG) exec of an
--         academic org (university/polytechnic/college/school) may NOT create
--         org-wide dues — those are the bursar's, off-platform. Class / dept /
--         faculty dues are unaffected. Non-academic orgs (church/club/...) keep
--         org-wide dues.
--      c. When category='event' and the payload carries a `tiers` array,
--         insert the event_ticket_tiers rows.
--
-- 2) Adds issue_event_ticket(payment_id): called server-side after a successful
--    event payment to mint a unique ticket (idempotent) and bump tier sold_count.
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
  v_caller_verified     TEXT;
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

  -- ── Resolve caller's org ──
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

  -- ── Caller's most permissive verified admin row ──
  SELECT ma.scope_level, ma.group_id,
         COALESCE(ma.can_create_payments, FALSE), ma.verification_status
    INTO v_caller_scope, v_caller_group_id, v_caller_can_create, v_caller_verified
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
  IF v_caller_verified IS NULL
     OR v_caller_verified NOT IN ('email_verified','document_verified','admin_verified','member_confirmed') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Your exec status is ' || COALESCE(v_caller_verified,'pending') ||
      '. Complete verification before publishing.');
  END IF;

  -- ── Bursar model: SUG (org scope) of an academic org cannot create DUES ──
  IF NOT v_is_event
     AND v_caller_scope = 'org'
     AND COALESCE(v_org_type,'') IN ('university','polytechnic','college','school') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'As an SUG/university-wide exec you can create events, but university-wide dues are collected by the bursar, not on Payvexo.');
  END IF;

  -- ── Validate the target ──
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

    -- can_collect_dues only restricts DUES. Events may be sold by any group.
    IF NOT v_is_event AND COALESCE(v_target_collects, TRUE) = FALSE THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'This group is configured not to collect dues.');
    END IF;

    IF p_target_scope = 'faculty' AND v_target_kind NOT IN ('faculty','college') THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Faculty-scoped items must point at a faculty (or college) group.');
    END IF;

    -- Scope-based authorization
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

  -- ── Bind to current academic session (optional) ──
  SELECT id, label INTO v_session_id, v_session_label
  FROM public.academic_sessions
  WHERE organization_id = v_org_id AND is_active = TRUE
  ORDER BY start_date DESC LIMIT 1;

  -- ── Insert the payment_type (due or event) ──
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
    -- Events are never mandatory; dues default to mandatory
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

  -- ── Insert ticket tiers for events ──
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

  -- ── Fan out notifications (dues notify members; events announce to scope) ──
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

-- ════════════════════════════════════════════════════════════
-- issue_event_ticket — mint a ticket after a successful event payment
-- Idempotent: returns the existing ticket if already issued for this payment.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.issue_event_ticket(p_payment_id UUID)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pay        RECORD;
  v_pt         RECORD;
  v_tier       RECORD;
  v_code       TEXT;
  v_ticket_id  UUID;
  v_existing   UUID;
BEGIN
  SELECT id, organization_id, group_id, member_id, payment_type_id, event_tier_id,
         payer_name, payer_email, amount, status, paystack_status
    INTO v_pay
  FROM public.payments WHERE id = p_payment_id;
  IF v_pay IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Payment not found.');
  END IF;
  IF v_pay.status NOT IN ('approved','successful','paid') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Payment is not successful yet.');
  END IF;

  SELECT id, category, title INTO v_pt
  FROM public.payment_types WHERE id = v_pay.payment_type_id;
  IF v_pt IS NULL OR v_pt.category <> 'event' THEN
    RETURN jsonb_build_object('ok', TRUE, 'skipped', 'not an event');
  END IF;

  -- Idempotency: one ticket per payment (v1)
  SELECT id INTO v_existing FROM public.event_tickets WHERE payment_id = p_payment_id LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object('ok', TRUE, 'ticket_id', v_existing, 'already', TRUE);
  END IF;

  IF v_pay.event_tier_id IS NOT NULL THEN
    SELECT id, name, price INTO v_tier FROM public.event_ticket_tiers WHERE id = v_pay.event_tier_id;
  END IF;

  -- Unique code
  LOOP
    v_code := 'PVX-TKT-' || UPPER(SUBSTRING(MD5(RANDOM()::TEXT || clock_timestamp()::TEXT) FROM 1 FOR 8));
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.event_tickets WHERE ticket_code = v_code);
  END LOOP;

  INSERT INTO public.event_tickets (
    organization_id, payment_id, payment_type_id, tier_id, group_id, member_id,
    buyer_name, buyer_email, ticket_code, tier_name, price, status
  ) VALUES (
    v_pay.organization_id, v_pay.id, v_pay.payment_type_id, v_pay.event_tier_id, v_pay.group_id, v_pay.member_id,
    v_pay.payer_name, v_pay.payer_email, v_code,
    COALESCE(v_tier.name, 'General'), COALESCE(v_tier.price, v_pay.amount), 'valid'
  )
  RETURNING id INTO v_ticket_id;

  IF v_pay.event_tier_id IS NOT NULL THEN
    UPDATE public.event_ticket_tiers
    SET sold_count = sold_count + 1, updated_at = NOW()
    WHERE id = v_pay.event_tier_id;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'ticket_id', v_ticket_id, 'ticket_code', v_code);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not issue ticket: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.issue_event_ticket(UUID) TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 058 complete: event roles + tier creation + issue_event_ticket().';
END $$;

COMMIT;
