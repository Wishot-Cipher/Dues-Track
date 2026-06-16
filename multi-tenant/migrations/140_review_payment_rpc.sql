-- ============================================================
-- Migration 140: review_payment() — the sanctioned approve/reject path
--
-- The real cause of "approval doesn't work"
-- -----------------------------------------
-- AdminReviewPage approved a payment with a DIRECT client update:
--   supabase.from('payments').update({ status: 'approved', ... })
-- but mig 019's RESTRICTIVE policy `payments_no_paid_update_from_client`
-- forbids any non-service-role caller from setting status to
-- 'approved' / 'paid' / 'successful'. So the exec's Approve button hit
-- RLS and failed ("Failed to approve payment"). (Reject set status
-- 'rejected', which isn't blocked, so reject limped along — but its
-- authorization leaned entirely on RLS.)
--
-- The fix
-- -------
-- A SECURITY DEFINER RPC (the documented pattern for sensitive writes)
-- that:
--   • authorizes the caller with owns_payment_type() (mig 113) — a
--     VERIFIED layer>=3 exec of the due's EXACT tier, or an org-scope
--     exec for org-wide dues. Same own-tier boundary the Review queue
--     filters by client-side; now enforced server-side too.
--   • only acts on a still-'pending' row (idempotent — no double
--     processing, no flipping an already-approved/rejected payment).
--   • stamps status / approved_by / approved_at / rejection_reason and,
--     running as definer, is exempt from the client restriction above.
--
-- Notifications stay in the client (it already has the member + amount
-- in hand); this RPC just returns them so the caller can fan out.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.review_payment(
  p_payment_id        UUID,
  p_decision          TEXT,
  p_rejection_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pt       UUID;
  v_org      UUID;
  v_member   UUID;
  v_status   TEXT;
  v_amount   NUMERIC;
  v_title    TEXT;
  v_admin_id UUID;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid decision.');
  END IF;

  IF p_decision = 'rejected' AND COALESCE(btrim(p_rejection_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'A rejection reason is required.');
  END IF;

  SELECT pay.payment_type_id, pay.organization_id, pay.member_id, pay.status, pay.amount, pt.title
    INTO v_pt, v_org, v_member, v_status, v_amount, v_title
  FROM public.payments pay
  LEFT JOIN public.payment_types pt ON pt.id = pay.payment_type_id
  WHERE pay.id = p_payment_id;

  IF v_pt IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Payment not found.');
  END IF;

  -- Own-tier authorization: a verified exec of the due's tier (or an
  -- org-scope exec for org-wide dues). Reuses the exact RLS helper.
  IF NOT public.owns_payment_type(v_pt) THEN
    RETURN jsonb_build_object(
      'ok', FALSE, 'code', 'not_authorized',
      'error', 'You can only review payments toward dues your tier owns.'
    );
  END IF;

  -- Only a still-pending payment can be decided.
  IF v_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'ok', FALSE, 'code', 'not_pending',
      'error', 'This payment has already been processed.'
    );
  END IF;

  -- Resolve the caller's admin row for approved_by attribution.
  SELECT id INTO v_admin_id
  FROM public.member_admins
  WHERE member_id::text = auth.uid()::text
    AND organization_id = v_org
    AND is_active = TRUE
  LIMIT 1;

  UPDATE public.payments
     SET status           = p_decision,
         approved_by       = v_admin_id,
         approved_at       = now(),
         rejection_reason  = CASE WHEN p_decision = 'rejected'
                                  THEN btrim(p_rejection_reason)
                                  ELSE rejection_reason END
   WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'ok', TRUE,
    'status', p_decision,
    'payment_id', p_payment_id,
    'member_id', v_member,
    'amount', v_amount,
    'payment_type_id', v_pt,
    'title', v_title
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_payment(UUID, TEXT, TEXT)
  TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 140 applied: review_payment(payment_id, decision, reason) is the approve/reject path. Wire AdminReviewPage to it (direct client status=approved updates are blocked by mig 019).';
END $$;

COMMIT;
