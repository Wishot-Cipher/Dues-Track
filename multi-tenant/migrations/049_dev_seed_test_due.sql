-- ============================================================
-- Migration 049: Dev-only test-due seeder
--
-- Unblocks Payment P1 testing without needing the admin UI built.
--
-- Usage from Supabase SQL Editor (replace the UUID with a real
-- organization_members.id of a member you want the due to apply to):
--
--   SELECT pvx_seed_test_due(
--     '<member-uuid>',     -- the caller's member id
--     200000,              -- amount in kobo (₦2,000)
--     'Test SUG Levy'      -- optional title
--   );
--
-- Returns: { ok, payment_type_id, organization_id, group_id, slug,
--            url } so you can paste the url into the browser and
-- exercise the Paystack flow immediately.
--
-- Safe / idempotent against the same title: re-running returns the
-- existing row instead of creating duplicates.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.pvx_seed_test_due(
  p_member_id  UUID,
  p_amount_kobo INTEGER DEFAULT 200000,
  p_title      TEXT     DEFAULT 'Test Due (delete me)'
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_member  RECORD;
  v_org     RECORD;
  v_amount  NUMERIC;
  v_pt_id   UUID;
BEGIN
  -- Caller exists?
  SELECT id, organization_id, group_id, full_name
    INTO v_member
  FROM public.organization_members
  WHERE id = p_member_id;
  IF v_member.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'member_id not found.');
  END IF;

  SELECT id, slug, name INTO v_org
  FROM public.organizations WHERE id = v_member.organization_id;

  v_amount := COALESCE(p_amount_kobo, 200000) / 100.0;

  -- Reuse the existing row if a test due with this title already exists in this org
  SELECT id INTO v_pt_id
  FROM public.payment_types
  WHERE organization_id = v_member.organization_id
    AND title = TRIM(p_title)
  LIMIT 1;

  IF v_pt_id IS NULL THEN
    INSERT INTO public.payment_types (
      organization_id, group_id, title, description, category,
      amount, is_mandatory, is_active, accepts_paystack,
      currency_code,
      created_by
    ) VALUES (
      v_member.organization_id,
      v_member.group_id,
      TRIM(p_title),
      'Auto-seeded by pvx_seed_test_due — safe to delete.',
      'dues',
      v_amount,
      TRUE,
      TRUE,
      TRUE,
      'NGN',
      v_member.id
    )
    RETURNING id INTO v_pt_id;
  END IF;

  RETURN jsonb_build_object(
    'ok',               TRUE,
    'payment_type_id',  v_pt_id,
    'organization_id',  v_org.id,
    'organization_slug',v_org.slug,
    'group_id',         v_member.group_id,
    'amount_naira',     v_amount,
    'url',              '/' || v_org.slug || '/payment/' || v_pt_id,
    'tip',              'Open the url in your app while signed in as ' || v_member.full_name || '.'
  );
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.pvx_seed_test_due(UUID, INTEGER, TEXT)
  TO authenticated, anon;

DO $$
BEGIN
  RAISE NOTICE 'Migration 049 ready. To seed a test due:';
  RAISE NOTICE '  1. Find a member uuid: SELECT id, full_name FROM organization_members LIMIT 5;';
  RAISE NOTICE '  2. SELECT pvx_seed_test_due(''<uuid>'');';
  RAISE NOTICE '  3. Open the returned url in your app and click "Pay now".';
END $$;

COMMIT;
