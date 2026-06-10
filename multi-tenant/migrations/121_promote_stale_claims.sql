-- ============================================================
-- Migration 121: Time-based auto-promotion of stranded claims (#9)
--
-- The problem
-- -----------
-- A higher-role claim climbs: Layer 2 (setup) → Layer 3 (peers vote,
-- status 'votes_complete') → Layer 4 (a parent/org exec confirms,
-- unlocking money). The confirmer can already be the parent tier OR any
-- org-scope exec (confirm_claim_by_parent_exec walks up to org). But:
--   • brand-new orgs may have NO exec above to confirm, and
--   • an existing exec above may be inactive / unreachable ("phone
--     spoilt") and never tap confirm.
-- Either way the claimant is peer-verified but stuck at Layer 3 forever,
-- money locked.
--
-- The fix (user decision: walk-up-to-nearest + time/peer auto-promote)
-- ------------------------------------------------------------------
-- The walk-up is already covered (org-scope can confirm any claim). This
-- adds the safety net: a claim that PEERS already approved ('votes_
-- complete') and that has sat unconfirmed past a cool-off window
-- auto-promotes to Layer 4 — no human confirmer required. Peers + time
-- become the trust anchor when no one above acts.
--
-- 'votes_complete' inherently means the peer vote PASSED (a contested /
-- failed claim never reaches it), so this never promotes a disputed one.
-- Idempotent + safe to run on a schedule (see the cron wiring).
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.promote_stale_claims(p_window_days INT DEFAULT 7)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_claim        RECORD;
  v_target_gid   UUID;
  v_new_admin_id UUID;
  v_promoted     INT := 0;
BEGIN
  FOR v_claim IN
    SELECT *
    FROM public.claim_requests
    WHERE status = 'votes_complete'
      AND COALESCE(updated_at, created_at) < NOW() - (p_window_days || ' days')::interval
  LOOP
    v_target_gid := CASE
      WHEN v_claim.claimed_scope = 'group' THEN v_claim.claimed_group_id
      WHEN v_claim.claimed_scope = 'unit'  THEN v_claim.claimed_unit_group_id
      ELSE NULL
    END;

    BEGIN
      -- Promote to Layer 4 — same shape as confirm_claim_by_parent_exec,
      -- but confirmed_by_admin_id = NULL (system / time-based anchor).
      INSERT INTO public.member_admins (
        member_id, organization_id, group_id,
        role, role_label, scope_level,
        can_create_payments, can_approve_payments,
        can_manage_members, can_manage_admins,
        can_manage_expenses, can_view_analytics,
        can_export_data, can_manage_settings,
        verification_status, verification_method, verified_at,
        verification_layer, confirmed_by_admin_id,
        is_active, tenure_start
      ) VALUES (
        v_claim.claimant_user_id, v_claim.organization_id, v_target_gid,
        v_claim.claimed_role, v_claim.position_title, v_claim.claimed_scope,
        TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
        'admin_verified', 'admin', NOW(),
        4, NULL,
        TRUE, CURRENT_DATE
      )
      ON CONFLICT (member_id, organization_id, group_id, role) DO UPDATE
        SET verification_status = 'admin_verified',
            verification_layer  = GREATEST(member_admins.verification_layer, 4),
            verified_at         = NOW(),
            is_active           = TRUE,
            updated_at          = NOW()
      RETURNING id INTO v_new_admin_id;

      UPDATE public.claim_requests
      SET status              = 'approved',
          resulting_admin_id  = v_new_admin_id,
          current_layer       = GREATEST(current_layer, 4),
          reviewed_at         = NOW(),
          resolved_at         = NOW(),
          updated_at          = NOW()
      WHERE id = v_claim.id;

      UPDATE public.organizations
      SET org_state = 'active', orphaned_at = NULL,
          acting_started_at = NULL, acting_deadline_at = NULL, updated_at = NOW()
      WHERE id = v_claim.organization_id AND org_state IN ('acting','orphaned');

      INSERT INTO public.notifications (
        organization_id, member_id, group_id, type, title, message, link, related_type, related_id
      ) VALUES (
        v_claim.organization_id, v_claim.claimant_user_id, v_target_gid,
        'claim_approved', 'Your role is now active ✅',
        'Your members confirmed you and the waiting period passed, so your role is verified automatically — admin access is on and money is unlocked.',
        '/dashboard', 'claim_request', v_claim.id
      );

      v_promoted := v_promoted + 1;
    EXCEPTION WHEN OTHERS THEN
      -- One bad claim must not abort the whole sweep.
      CONTINUE;
    END;
  END LOOP;

  RETURN jsonb_build_object('ok', TRUE, 'promoted', v_promoted, 'window_days', p_window_days);
END;
$$;

GRANT EXECUTE ON FUNCTION public.promote_stale_claims(INT) TO service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 121 applied: promote_stale_claims() ready. Schedule it (cron) so peer-verified claims auto-confirm after the cool-off window when no exec above acts.';
END $$;

COMMIT;
