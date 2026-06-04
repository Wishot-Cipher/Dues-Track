-- ============================================================
-- Migration 102: Per-tier ticket check-in.
--
-- Bug
-- ---
-- check_in_ticket (mig 077) only validates that the scanner is an
-- active exec somewhere in the ticket's organization. A class rep
-- could therefore scan tickets for a FACULTY-tier event (or any
-- other tier) — the comment from the user (UNN founder): "a class
-- rep can't verify the event code of another tier exec — each tier
-- verifies their own thing."
--
-- The product rule
-- ----------------
-- Each tier scans only what belongs to its own subtree:
--   scope_level='group'  →  ticket.group_id MUST equal scanner.group_id
--   scope_level='unit'   →  ticket.group_id IS scanner.group_id OR
--                            scanner.group_id is an ancestor of ticket.group_id
--   scope_level='org'    →  any ticket in the org
--
-- An exec with multiple admin rows passes if ANY of them covers the
-- ticket — same person, two roles, either is sufficient.
-- A scanner whose tier doesn't cover the ticket gets result='scope_mismatch'
-- so the FE can render "this ticket belongs to a different tier — ask
-- the X exec to scan it." Existing 'unauthorized' is reserved for
-- "not an exec at all."
-- ============================================================

BEGIN;

DROP FUNCTION IF EXISTS public.check_in_ticket(TEXT, UUID);

CREATE OR REPLACE FUNCTION public.check_in_ticket(p_ticket_code TEXT, p_admin_member_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_ticket   RECORD;
  v_admin    RECORD;
  v_event    RECORD;
  v_covers   BOOLEAN := FALSE;
BEGIN
  IF p_ticket_code IS NULL OR TRIM(p_ticket_code) = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'No ticket code.');
  END IF;

  SELECT * INTO v_ticket FROM public.event_tickets
  WHERE UPPER(ticket_code) = UPPER(TRIM(p_ticket_code)) LIMIT 1;
  IF v_ticket.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Ticket not found.', 'result', 'invalid');
  END IF;

  -- Any active admin row in this org. We pick the highest-layer one
  -- as a stable identity for `checked_in_by`, but the tier-coverage
  -- check below scans ALL the scanner's admin rows so a class-rep
  -- who is ALSO a dept exec can scan both class AND dept tickets.
  SELECT ma.id, ma.verification_layer
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

  -- ── Tier coverage check ─────────────────────────────────────────
  -- Compare each of the scanner's admin rows against the ticket's
  -- group_id. As soon as one row covers, we accept. An org-scoped
  -- ticket (group_id IS NULL) is covered ONLY by scope_level='org'
  -- admins — a class rep cannot validate an org-wide event.
  --
  -- For unit-tier scanners we walk the ticket's group ancestor chain:
  -- the scanner's group must equal the ticket's group OR be an
  -- ancestor (dept exec covers her dept + every class under).
  WITH RECURSIVE ancestors AS (
    SELECT id, parent_group_id
    FROM public.organization_groups
    WHERE v_ticket.group_id IS NOT NULL
      AND id = v_ticket.group_id
    UNION ALL
    SELECT g.id, g.parent_group_id
    FROM public.organization_groups g
    JOIN ancestors a ON g.id = a.parent_group_id
  ),
  scanner_rows AS (
    SELECT scope_level, group_id
    FROM public.member_admins
    WHERE member_id = p_admin_member_id
      AND organization_id = v_ticket.organization_id
      AND COALESCE(is_active, TRUE) = TRUE
  )
  SELECT EXISTS (
    SELECT 1 FROM scanner_rows sr
    WHERE sr.scope_level = 'org'
       OR (sr.scope_level = 'group' AND sr.group_id = v_ticket.group_id)
       OR (sr.scope_level = 'unit'  AND sr.group_id IN (SELECT id FROM ancestors))
  ) INTO v_covers;

  IF NOT v_covers THEN
    RETURN jsonb_build_object('ok', FALSE,
      'error', 'This ticket belongs to a different tier. The relevant tier exec scans it.',
      'result', 'scope_mismatch');
  END IF;

  -- ── Standard status branches ───────────────────────────────────
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
END;
$$;

GRANT EXECUTE ON FUNCTION public.check_in_ticket(TEXT, UUID)
  TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 102 complete: check_in_ticket now enforces tier coverage.';
END $$;

COMMIT;
