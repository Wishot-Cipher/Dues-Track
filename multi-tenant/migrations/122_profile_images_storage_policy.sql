-- ============================================================
-- Migration 122: Storage RLS for the `profile-images` bucket
-- (fixes "new row violates row-level security policy" when
-- uploading an org logo or profile photo).
--
-- The real cause
-- --------------
-- The org-logo flow does TWO writes:
--   1) supabase.storage.from('profile-images').upload(...)   ← INSERT
--      into storage.objects
--   2) UPDATE organizations.logo_url                          ← mig 117
-- mig 117 only fixed (2). Step (1) is an INSERT into storage.objects,
-- which has its OWN row-level security on the bucket — and with no
-- write policy for the bucket, every upload was denied ("new row
-- violates RLS"). This adds the storage policies.
--
-- Who may write
-- -------------
-- Any signed-in member (auth.uid() resolves from the member JWT) may
-- upload / replace / remove files in the `profile-images` bucket. That
-- is safe: choosing an image is harmless; the SENSITIVE action —
-- setting it as the org's official logo — is the organizations UPDATE,
-- still gated to org-scope admins by mig 117. Reads are public so the
-- logo renders on the public org card + everywhere else.
-- ============================================================

BEGIN;

-- ── Ensure the bucket exists and is publicly readable ──
INSERT INTO storage.buckets (id, name, public)
VALUES ('profile-images', 'profile-images', TRUE)
ON CONFLICT (id) DO UPDATE SET public = TRUE;

-- ── Public read (so logos/avatars load anywhere, incl. the landing) ──
DROP POLICY IF EXISTS "profile_images_public_read" ON storage.objects;
CREATE POLICY "profile_images_public_read"
  ON storage.objects
  FOR SELECT
  USING (bucket_id = 'profile-images');

-- ── Signed-in members may upload ──
DROP POLICY IF EXISTS "profile_images_member_insert" ON storage.objects;
CREATE POLICY "profile_images_member_insert"
  ON storage.objects
  FOR INSERT
  WITH CHECK (
    bucket_id = 'profile-images'
    AND (auth.uid() IS NOT NULL OR auth.role() = 'service_role')
  );

-- ── …replace (upsert uses UPDATE) ──
DROP POLICY IF EXISTS "profile_images_member_update" ON storage.objects;
CREATE POLICY "profile_images_member_update"
  ON storage.objects
  FOR UPDATE
  USING (
    bucket_id = 'profile-images'
    AND (auth.uid() IS NOT NULL OR auth.role() = 'service_role')
  )
  WITH CHECK (
    bucket_id = 'profile-images'
    AND (auth.uid() IS NOT NULL OR auth.role() = 'service_role')
  );

-- ── …and remove their old file ──
DROP POLICY IF EXISTS "profile_images_member_delete" ON storage.objects;
CREATE POLICY "profile_images_member_delete"
  ON storage.objects
  FOR DELETE
  USING (
    bucket_id = 'profile-images'
    AND (auth.uid() IS NOT NULL OR auth.role() = 'service_role')
  );

DO $$
BEGIN
  RAISE NOTICE 'Migration 122 applied: profile-images bucket is public-read + writable by signed-in members. Org-logo uploads will now succeed (org-logo ASSIGNMENT still gated to org admins by mig 117).';
END $$;

COMMIT;
