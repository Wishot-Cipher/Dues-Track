-- ============================================================
-- Migration 070: platform_settings — operator-controlled global policy
--
-- A single-row settings table the console edits and the verification engine
-- reads, so fee model + trust thresholds are tunable WITHOUT code changes.
--   • default fee model (mode/percent/flat/min/cap, kobo)
--   • bootstrap base / escalated vote counts + window hours
--   • independent-org auto vote count
--   • platform-review escalation days
--
-- RPCs (session-gated): platform_get_settings, platform_update_settings.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.platform_settings (
  id                        INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  fee_mode                  TEXT NOT NULL DEFAULT 'percent',
  fee_percent               NUMERIC(5,2) NOT NULL DEFAULT 2.00,
  fee_flat_kobo             INTEGER NOT NULL DEFAULT 0,
  fee_min_kobo              INTEGER NOT NULL DEFAULT 5000,
  fee_cap_kobo              INTEGER NOT NULL DEFAULT 50000,
  bootstrap_base_votes      INTEGER NOT NULL DEFAULT 7,
  bootstrap_escalated_votes INTEGER NOT NULL DEFAULT 15,
  bootstrap_window_hours    INTEGER NOT NULL DEFAULT 72,
  independent_votes         INTEGER NOT NULL DEFAULT 10,
  platform_review_days      INTEGER NOT NULL DEFAULT 7,
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO public.platform_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS platform_settings_service ON public.platform_settings;
CREATE POLICY platform_settings_service ON public.platform_settings FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
-- Verification RPCs read it via SECURITY DEFINER; allow authenticated read for the helper.
GRANT SELECT ON public.platform_settings TO authenticated, service_role;

-- Helper: read the singleton (used by evaluate_claim etc.)
CREATE OR REPLACE FUNCTION public._platform_settings()
RETURNS public.platform_settings
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT * FROM public.platform_settings WHERE id = 1 $$;

GRANT EXECUTE ON FUNCTION public._platform_settings() TO authenticated, service_role, anon;

-- ── Console: read settings ──
CREATE OR REPLACE FUNCTION public.platform_get_settings(p_session_token UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_admin public.super_admins; v_row public.platform_settings;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.'); END IF;
  SELECT * INTO v_row FROM public.platform_settings WHERE id = 1;
  RETURN jsonb_build_object('ok', TRUE, 'settings', row_to_json(v_row));
END; $$;
REVOKE ALL ON FUNCTION public.platform_get_settings(UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_get_settings(UUID) TO authenticated;

-- ── Console: update settings (only provided keys) ──
CREATE OR REPLACE FUNCTION public.platform_update_settings(p_session_token UUID, p_patch jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_admin public.super_admins; v_row public.platform_settings;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_manage_organizations THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  UPDATE public.platform_settings SET
    fee_mode                  = COALESCE(p_patch->>'fee_mode', fee_mode),
    fee_percent               = COALESCE((p_patch->>'fee_percent')::NUMERIC, fee_percent),
    fee_flat_kobo             = COALESCE((p_patch->>'fee_flat_kobo')::INTEGER, fee_flat_kobo),
    fee_min_kobo              = COALESCE((p_patch->>'fee_min_kobo')::INTEGER, fee_min_kobo),
    fee_cap_kobo              = COALESCE((p_patch->>'fee_cap_kobo')::INTEGER, fee_cap_kobo),
    bootstrap_base_votes      = COALESCE((p_patch->>'bootstrap_base_votes')::INTEGER, bootstrap_base_votes),
    bootstrap_escalated_votes = COALESCE((p_patch->>'bootstrap_escalated_votes')::INTEGER, bootstrap_escalated_votes),
    bootstrap_window_hours    = COALESCE((p_patch->>'bootstrap_window_hours')::INTEGER, bootstrap_window_hours),
    independent_votes         = COALESCE((p_patch->>'independent_votes')::INTEGER, independent_votes),
    platform_review_days      = COALESCE((p_patch->>'platform_review_days')::INTEGER, platform_review_days),
    updated_at                = NOW()
  WHERE id = 1
  RETURNING * INTO v_row;

  -- Optionally re-price ALL existing orgs to the new default fee
  IF COALESCE((p_patch->>'apply_fee_to_all_orgs')::BOOLEAN, FALSE) THEN
    UPDATE public.organizations SET
      platform_fee_mode = v_row.fee_mode, platform_fee_percent = v_row.fee_percent,
      platform_fee_flat = v_row.fee_flat_kobo, platform_fee_min = v_row.fee_min_kobo,
      platform_fee_cap = v_row.fee_cap_kobo, updated_at = NOW();
  END IF;

  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, target_type, payload)
  VALUES (v_admin.id, v_admin.email, 'update_platform_settings', 'platform_settings', p_patch);

  RETURN jsonb_build_object('ok', TRUE, 'settings', row_to_json(v_row));
END; $$;
REVOKE ALL ON FUNCTION public.platform_update_settings(UUID, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_update_settings(UUID, jsonb) TO authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 070 complete: platform_settings + get/update RPCs ready.';
END $$;

COMMIT;
