-- ============================================================
-- Migration 077: Event ticket check-in + read RPCs
--
-- The ticketing schema (057) and issuance (058, wired into Paystack
-- verify/webhook) already mint tickets after a successful event payment.
-- This adds the door side and convenient reads for the ticket UI:
--
--   check_in_ticket(code, admin_member_id) — validate a scanned ticket and
--     mark it used (idempotent: re-scanning a used ticket reports who/when).
--   get_ticket_by_code(code)               — resolve a ticket for the scanner
--     and the public ticket view (joins the event title/venue/date).
--   get_my_tickets(member_id)              — a buyer's tickets across events.
-- ============================================================

BEGIN;

-- ── Door check-in ──
CREATE OR REPLACE FUNCTION public.check_in_ticket(p_ticket_code TEXT, p_admin_member_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_ticket   RECORD;
  v_admin    RECORD;
  v_event    RECORD;
BEGIN
  IF p_ticket_code IS NULL OR TRIM(p_ticket_code) = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'No ticket code.');
  END IF;

  SELECT * INTO v_ticket FROM public.event_tickets
  WHERE UPPER(ticket_code) = UPPER(TRIM(p_ticket_code)) LIMIT 1;
  IF v_ticket.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Ticket not found.', 'result', 'invalid');
  END IF;

  -- The scanner must be an active exec in the ticket's organization.
  SELECT ma.id, ma.verification_layer, ma.can_approve_payments
    INTO v_admin
  FROM public.member_admins ma
  WHERE ma.member_id = p_admin_member_id
    AND ma.organization_id = v_ticket.organization_id
    AND COALESCE(ma.is_active, TRUE) = TRUE
  ORDER BY ma.verification_layer DESC NULLS LAST
  LIMIT 1;
  IF v_admin.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You are not an exec in this organization.', 'result', 'unauthorized');
  END IF;

  SELECT title, event_venue, event_date INTO v_event
  FROM public.payment_types WHERE id = v_ticket.payment_type_id;

  IF v_ticket.status = 'cancelled' OR v_ticket.status = 'refunded' THEN
    RETURN jsonb_build_object('ok', FALSE, 'result', v_ticket.status,
      'error', 'This ticket was ' || v_ticket.status || '.',
      'ticket', jsonb_build_object('code', v_ticket.ticket_code, 'buyer_name', v_ticket.buyer_name,
        'tier_name', v_ticket.tier_name, 'event_title', v_event.title));
  END IF;

  IF v_ticket.status = 'used' THEN
    RETURN jsonb_build_object('ok', TRUE, 'result', 'already_used',
      'checked_in_at', v_ticket.checked_in_at,
      'ticket', jsonb_build_object('code', v_ticket.ticket_code, 'buyer_name', v_ticket.buyer_name,
        'tier_name', v_ticket.tier_name, 'event_title', v_event.title));
  END IF;

  UPDATE public.event_tickets
  SET status = 'used', checked_in_at = NOW(), checked_in_by = v_admin.id, updated_at = NOW()
  WHERE id = v_ticket.id;

  RETURN jsonb_build_object('ok', TRUE, 'result', 'checked_in',
    'checked_in_at', NOW(),
    'ticket', jsonb_build_object('code', v_ticket.ticket_code, 'buyer_name', v_ticket.buyer_name,
      'tier_name', v_ticket.tier_name, 'price', v_ticket.price, 'event_title', v_event.title,
      'event_venue', v_event.event_venue, 'event_date', v_event.event_date));
END; $$;
GRANT EXECUTE ON FUNCTION public.check_in_ticket(TEXT, UUID) TO anon, authenticated, service_role;

-- ── Resolve a ticket by code (scanner + public ticket view) ──
CREATE OR REPLACE FUNCTION public.get_ticket_by_code(p_ticket_code TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_row jsonb;
BEGIN
  SELECT to_jsonb(t) INTO v_row FROM (
    SELECT et.id, et.ticket_code, et.status, et.tier_name, et.price,
           et.buyer_name, et.buyer_email, et.checked_in_at, et.created_at,
           et.organization_id, et.payment_type_id,
           pt.title AS event_title, pt.event_venue, pt.event_date, pt.icon, pt.color,
           o.name AS org_name, o.slug AS org_slug, o.logo_url,
           g.name AS group_name
    FROM public.event_tickets et
    JOIN public.payment_types pt ON pt.id = et.payment_type_id
    JOIN public.organizations o ON o.id = et.organization_id
    LEFT JOIN public.organization_groups g ON g.id = et.group_id
    WHERE UPPER(et.ticket_code) = UPPER(TRIM(p_ticket_code))
    LIMIT 1
  ) t;
  IF v_row IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Ticket not found.'); END IF;
  RETURN jsonb_build_object('ok', TRUE, 'ticket', v_row);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_ticket_by_code(TEXT) TO anon, authenticated, service_role;

-- ── A buyer's tickets across all events ──
CREATE OR REPLACE FUNCTION public.get_my_tickets(p_member_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_rows jsonb;
BEGIN
  IF p_member_id IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.'); END IF;
  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.created_at DESC), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT et.id, et.ticket_code, et.status, et.tier_name, et.price, et.created_at, et.checked_in_at,
           pt.title AS event_title, pt.event_venue, pt.event_date, pt.icon, pt.color
    FROM public.event_tickets et
    JOIN public.payment_types pt ON pt.id = et.payment_type_id
    WHERE et.member_id = p_member_id
  ) t;
  RETURN jsonb_build_object('ok', TRUE, 'tickets', v_rows);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_tickets(UUID) TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 077 complete: check_in_ticket + get_ticket_by_code + get_my_tickets.';
END $$;

COMMIT;
