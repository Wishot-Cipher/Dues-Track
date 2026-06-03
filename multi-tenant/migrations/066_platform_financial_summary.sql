-- ============================================================
-- Migration 066: platform_financial_summary — console Financial Intelligence
--
-- One session-gated RPC returns the platform money picture:
--   • month-to-date gross volume, dues, platform fees, success/fail counts
--   • all-time platform fees
--   • pending (unsettled) platform earnings
--   • a recent transaction feed (with org + payer)
--   • top orgs by collected volume (month-to-date)
--
-- Amounts are kobo; the UI converts to naira.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.platform_financial_summary(p_session_token UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_admin    public.super_admins;
  v_month    TIMESTAMPTZ := date_trunc('month', NOW());
  v_summary  jsonb;
  v_recent   jsonb;
  v_top      jsonb;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_view_all_data THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  SELECT jsonb_build_object(
    'mtd_gross_kobo',   COALESCE(SUM(p.total_charged_kobo) FILTER (WHERE ok AND p.created_at >= v_month), 0),
    'mtd_dues_kobo',    COALESCE(SUM(p.dues_amount_kobo)   FILTER (WHERE ok AND p.created_at >= v_month), 0),
    'mtd_fees_kobo',    COALESCE(SUM(p.platform_fee_kobo)  FILTER (WHERE ok AND p.created_at >= v_month), 0),
    'mtd_success',      COALESCE(COUNT(*) FILTER (WHERE ok AND p.created_at >= v_month), 0),
    'mtd_failed',       COALESCE(COUNT(*) FILTER (WHERE p.status IN ('failed','abandoned') AND p.created_at >= v_month), 0),
    'alltime_fees_kobo',COALESCE(SUM(p.platform_fee_kobo)  FILTER (WHERE ok), 0)
  ) INTO v_summary
  FROM (
    SELECT p.*, (p.status IN ('approved','successful','paid')) AS ok
    FROM public.payments p
  ) p;

  -- Pending (unsettled) platform earnings
  v_summary := v_summary || jsonb_build_object(
    'pending_settlement_kobo',
      COALESCE((SELECT SUM(amount_kobo) FROM public.platform_earnings WHERE COALESCE(settled, FALSE) = FALSE), 0),
    'orgs_with_payout',
      (SELECT COUNT(*) FROM public.organizations WHERE paystack_subaccount_code IS NOT NULL)
  );

  -- Recent transaction feed
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_recent
  FROM (
    SELECT p.id, p.payer_name, p.total_charged_kobo, p.platform_fee_kobo, p.dues_amount_kobo,
           p.status, p.paystack_channel, p.created_at, o.name AS org_name, o.slug AS org_slug
    FROM public.payments p
    JOIN public.organizations o ON o.id = p.organization_id
    ORDER BY p.created_at DESC
    LIMIT 15
  ) t;

  -- Top orgs by MTD collected
  SELECT COALESCE(jsonb_agg(row_to_json(t)), '[]'::jsonb) INTO v_top
  FROM (
    SELECT o.name AS org_name, o.slug AS org_slug,
           SUM(p.dues_amount_kobo) AS collected_kobo,
           COUNT(*) AS txns
    FROM public.payments p
    JOIN public.organizations o ON o.id = p.organization_id
    WHERE p.status IN ('approved','successful','paid') AND p.created_at >= v_month
    GROUP BY o.name, o.slug
    ORDER BY collected_kobo DESC
    LIMIT 8
  ) t;

  RETURN jsonb_build_object('ok', TRUE, 'summary', v_summary, 'recent', v_recent, 'top_orgs', v_top);
END;
$$;

REVOKE ALL ON FUNCTION public.platform_financial_summary(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_financial_summary(UUID) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 066 complete: platform_financial_summary ready.';
END $$;

COMMIT;
