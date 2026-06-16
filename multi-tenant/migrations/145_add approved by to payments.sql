-- ============================================================
-- Migration 141: Add approved_by to payments + fix review_payment RPC
--
-- Root cause of "column approved_by does not exist":
--   Migration 140 wrote review_payment() assuming approved_by (UUID)
--   existed on the payments table. It never did — the table only has
--   approved_at (TIMESTAMPTZ). The RPC crashed on every approve/reject.
--
-- Fix:
--   1. Add approved_by UUID → member_admins (nullable, SET NULL on
--      delete so historical approvals survive admin row removal).
--   2. Re-create review_payment() referencing the now-real column.
--      Logic is identical to mig 140 — just the UPDATE is fixed.
-- ============================================================

BEGIN;

-- ── 1. Add the missing column ──────────────────────────────────────
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS approved_by UUID
    REFERENCES public.member_admins(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.payments.approved_by IS
  'member_admins.id of the exec who approved or rejected this payment (mig 141).';

-- ── 2. Re-create the RPC with the column now guaranteed to exist ───
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
  -- ── Validate inputs ──────────────────────────────────────────────
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid decision.');
  END IF;

  IF p_decision = 'rejected' AND COALESCE(btrim(p_rejection_reason), '') = '' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'A rejection reason is required.');
  END IF;

  -- ── Fetch payment ────────────────────────────────────────────────
  SELECT pay.payment_type_id,
         pay.organization_id,
         pay.member_id,
         pay.status,
         pay.amount,
         pt.title
    INTO v_pt, v_org, v_member, v_status, v_amount, v_title
  FROM public.payments pay
  LEFT JOIN public.payment_types pt ON pt.id = pay.payment_type_id
  WHERE pay.id = p_payment_id;

  IF v_pt IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Payment not found.');
  END IF;

  -- ── Own-tier authorization ───────────────────────────────────────
  -- owns_payment_type() (mig 113): caller must be a verified exec
  -- (layer >= 3) of the due's exact tier, or an org-scope exec for
  -- org-wide dues. Matches the Review queue's client-side filter.
  IF NOT public.owns_payment_type(v_pt) THEN
    RETURN jsonb_build_object(
      'ok',    FALSE,
      'code',  'not_authorized',
      'error', 'You can only review payments toward dues your tier owns.'
    );
  END IF;

  -- ── Idempotency guard ────────────────────────────────────────────
  IF v_status IS DISTINCT FROM 'pending' THEN
    RETURN jsonb_build_object(
      'ok',    FALSE,
      'code',  'not_pending',
      'error', 'This payment has already been processed.'
    );
  END IF;

  -- ── Resolve reviewer's admin row for attribution ─────────────────
  SELECT id INTO v_admin_id
  FROM public.member_admins
  WHERE member_id::text = auth.uid()::text
    AND organization_id = v_org
    AND is_active = TRUE
  LIMIT 1;

  -- ── Write decision ───────────────────────────────────────────────
  UPDATE public.payments
     SET status           = p_decision,
         approved_by      = v_admin_id,          -- now exists (mig 141)
         approved_at      = now(),
         rejection_reason = CASE
                              WHEN p_decision = 'rejected'
                              THEN btrim(p_rejection_reason)
                              ELSE rejection_reason
                            END,
         updated_at       = now()
   WHERE id = p_payment_id;

  RETURN jsonb_build_object(
    'ok',             TRUE,
    'status',         p_decision,
    'payment_id',     p_payment_id,
    'member_id',      v_member,
    'amount',         v_amount,
    'payment_type_id', v_pt,
    'title',          v_title
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.review_payment(UUID, TEXT, TEXT)
  TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE
    'Migration 141 complete: approved_by UUID added to payments; '
    'review_payment() updated to reference the real column.';
END $$;

COMMIT;