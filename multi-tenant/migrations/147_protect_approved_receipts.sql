-- ============================================================
-- Migration 147: Protect approved-payment receipts from deletion
--
-- The gap (found while designing account deletion)
-- ---------------------------------------------------------------
-- Migration 139 gave every signed-in member unconditional DELETE
-- on their own uploads in the `payment-receipts` bucket:
--
--   CREATE POLICY "payment_receipts_member_delete"
--     ON storage.objects FOR DELETE
--     USING (bucket_id = 'payment-receipts'
--            AND (auth.uid() IS NOT NULL OR auth.role() = 'service_role'));
--
-- That policy only checks "is this bucket, is someone signed in" —
-- it never checks whether the object is still evidence for an
-- APPROVED payment. Right now, independent of account deletion,
-- any member can open dev tools or call storage.remove() directly
-- and delete the receipt image backing a payment that's already
-- been approved into the org's books. That's the exact "unexplained
-- ₦5,000 in the financial record" problem from our design
-- conversation — except it doesn't even require deleting an
-- account; it's possible today, right now, on every approved manual
-- payment.
--
-- The fix
-- --------
-- Replace the DELETE policy so it also checks: is there a `payments`
-- row with status='approved' whose receipt_url OR receipt_pdf_url
-- matches this object's path? If yes, deletion is denied regardless
-- of who's asking — including the uploader themselves. Pending or
-- rejected payment receipts remain freely deletable (a member fixing
-- a blurry upload before review shouldn't be blocked).
--
-- Storage object → payments row matching
-- ----------------------------------------
-- receipt_url / receipt_pdf_url are stored as full public URLs
-- (getPublicUrl() output), not bare storage paths. We match by
-- checking whether the column VALUE ends with the object's
-- bucket-relative `name` (storage.objects.name), which is stable
-- regardless of the project's storage host prefix.
-- ============================================================

BEGIN;

-- ── Helper: is this storage object protected by an approved payment? ──
CREATE OR REPLACE FUNCTION public._receipt_object_is_approved(p_object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.payments p
    WHERE p.status = 'approved'
      AND (
        p.receipt_url     LIKE '%' || p_object_name
        OR p.receipt_pdf_url LIKE '%' || p_object_name
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public._receipt_object_is_approved(text) TO authenticated, anon, service_role;

-- ── Replace the DELETE policy with the approval-aware version ──
DROP POLICY IF EXISTS "payment_receipts_member_delete" ON storage.objects;
CREATE POLICY "payment_receipts_member_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'payment-receipts'
    AND (auth.uid() IS NOT NULL OR auth.role() = 'service_role')
    -- service_role (our own backend / admin tooling) can still bypass
    -- for legitimate cleanup of rejected/abandoned uploads; a member's
    -- own client-side request cannot delete anything backing an
    -- approved payment, full stop.
    AND (
      auth.role() = 'service_role'
      OR NOT public._receipt_object_is_approved(storage.objects.name)
    )
  );

-- ── Same guard on UPDATE (an upsert-as-replace should also be blocked
--    from silently swapping out an approved receipt's image data). ──
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
    AND (
      auth.role() = 'service_role'
      OR NOT public._receipt_object_is_approved(storage.objects.name)
    )
  );

DO $$
BEGIN
  RAISE NOTICE
    'Migration 147 applied: payment-receipts storage objects backing an '
    'approved payment (via receipt_url or receipt_pdf_url) can no longer '
    'be deleted or overwritten by a member, even their own upload. '
    'Pending/rejected receipts remain freely editable. service_role retains '
    'full access for legitimate backend cleanup.';
END $$;

COMMIT;