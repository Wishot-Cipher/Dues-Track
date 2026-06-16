-- ============================================================
-- Migration 139: Storage RLS for the `payment-receipts` bucket
-- (fixes the MANUAL payment flow silently failing: "the submission
-- side isn't submitting").
--
-- The real cause
-- --------------
-- The manual bank-transfer / POS flow does TWO writes:
--   1) supabase.storage.from('payment-receipts').upload(...)  ← INSERT
--      into storage.objects   (PaymentDetailPage.submitPaymentWithData)
--   2) supabase.from('payments').insert(...)                  ← the row
-- The receipt upload runs FIRST and throws on failure, so if (1) is
-- denied the whole submission aborts before any payment row exists.
--
-- The `payment-receipts` bucket never had a write policy (mig 122 added
-- one for `profile-images` only). storage.objects has its OWN row-level
-- security per bucket, so with no INSERT policy every receipt upload was
-- denied ("new row violates row-level security policy") — which is
-- exactly why cash/QR payments (no upload) recorded fine while
-- upload-a-receipt submissions never went through. This adds the
-- policies, mirroring mig 122.
--
-- Who may write
-- -------------
-- Any signed-in member (auth.uid() resolves from the member JWT) may
-- upload a receipt. That's safe: a receipt image is a CLAIM, not money —
-- the sensitive action (APPROVING the payment) stays gated to the
-- owning-tier exec via the approval RPC / payments UPDATE policy.
--
-- Reads
-- -----
-- Public read, like profile-images. The client stores receipt_url as a
-- public URL (getPublicUrl) and renders it on the receipt page + admin
-- review; filenames are randomised (member id + timestamp + random) so
-- they're unguessable. (A future hardening pass can switch to private +
-- signed URLs without touching this submission fix.)
-- ============================================================

BEGIN;

-- ── Ensure the bucket exists (public-read) ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('payment-receipts', 'payment-receipts', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

-- ── Public read (receipt page + admin review render the image) ──
DROP POLICY IF EXISTS "payment_receipts_public_read" ON storage.objects;
CREATE POLICY "payment_receipts_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'payment-receipts');

-- ── Signed-in members may upload their proof ──
DROP POLICY IF EXISTS "payment_receipts_member_insert" ON storage.objects;
CREATE POLICY "payment_receipts_member_insert"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND (auth.uid() IS NOT NULL OR auth.role() = 'service_role')
  );

-- ── …replace (upsert uses UPDATE) ──
DROP POLICY IF EXISTS "payment_receipts_member_update" ON storage.objects;
CREATE POLICY "payment_receipts_member_update"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'payment-receipts'
    AND (auth.uid() IS NOT NULL OR auth.role() = 'service_role')
  )
  WITH CHECK (
    bucket_id = 'payment-receipts'
    AND (auth.uid() IS NOT NULL OR auth.role() = 'service_role')
  );

-- ── …and remove a mistaken upload ──
DROP POLICY IF EXISTS "payment_receipts_member_delete" ON storage.objects;
CREATE POLICY "payment_receipts_member_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'payment-receipts'
    AND (auth.uid() IS NOT NULL OR auth.role() = 'service_role')
  );

DO $$
BEGIN
  RAISE NOTICE 'Migration 139 applied: payment-receipts bucket is public-read + writable by signed-in members. Manual receipt-upload submissions will now succeed.';
END $$;

COMMIT;
