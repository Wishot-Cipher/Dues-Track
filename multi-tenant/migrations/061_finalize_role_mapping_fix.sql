-- ============================================================
-- Migration 061: Fix _finalize_claim_layer4 role mapping
--
-- BUG: granting a claim failed with member_admins_role_check (23514) because
-- the claim's human role (e.g. 'president') was written into member_admins.role,
-- which only permits SYSTEM roles
-- (super_admin/org_owner/org_admin/faculty_admin/group_admin/treasurer/
--  secretary/auditor/moderator/custom).
--
-- FIX: map the claim to a valid system role by scope (the human title is kept in
-- role_label). Centralised here, so every grant path (bootstrap/independent/
-- higher-exec/platform) is fixed at once.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._finalize_claim_layer4(
  p_claim_id           UUID,
  p_grant_method       TEXT,
  p_confirmer_admin_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_claim      RECORD;
  v_target_gid UUID;
  v_admin_id   UUID;
  v_sys_role   TEXT;
  v_label      TEXT;
BEGIN
  SELECT * INTO v_claim FROM public.claim_requests WHERE id = p_claim_id;
  IF v_claim IS NULL THEN RETURN NULL; END IF;
  IF v_claim.status = 'approved' THEN RETURN v_claim.resulting_admin_id; END IF;

  v_target_gid := CASE v_claim.claimed_scope
    WHEN 'group' THEN v_claim.claimed_group_id
    WHEN 'unit'  THEN v_claim.claimed_unit_group_id
    ELSE NULL END;

  -- Map claim role → a valid SYSTEM role; keep the human title in role_label.
  v_sys_role := CASE
    WHEN v_claim.claimed_role IN (
      'super_admin','org_owner','org_admin','faculty_admin','group_admin',
      'treasurer','secretary','auditor','moderator','custom'
    ) THEN v_claim.claimed_role
    WHEN v_claim.claimed_scope = 'org'  THEN 'org_admin'
    WHEN v_claim.claimed_scope = 'unit' THEN 'faculty_admin'
    ELSE 'group_admin'
  END;
  v_label := COALESCE(NULLIF(TRIM(v_claim.position_title), ''), v_claim.claimed_role);

  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments, can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics, can_export_data, can_manage_settings,
    verification_status, verification_method, verified_at, verification_layer,
    confirmed_by_admin_id, is_active, tenure_start
  ) VALUES (
    v_claim.claimant_user_id, v_claim.organization_id, v_target_gid,
    v_sys_role, v_label, v_claim.claimed_scope,
    TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE, TRUE,
    'admin_verified', 'admin', NOW(), 4,
    p_confirmer_admin_id, TRUE, CURRENT_DATE
  )
  ON CONFLICT (member_id, organization_id, group_id, role) DO UPDATE
    SET verification_status   = 'admin_verified',
        verification_layer    = GREATEST(member_admins.verification_layer, 4),
        confirmed_by_admin_id  = COALESCE(EXCLUDED.confirmed_by_admin_id, member_admins.confirmed_by_admin_id),
        role_label            = EXCLUDED.role_label,
        verified_at           = NOW(),
        is_active             = TRUE,
        updated_at            = NOW()
  RETURNING id INTO v_admin_id;

  UPDATE public.claim_requests
  SET status             = 'approved',
      resulting_admin_id = v_admin_id,
      current_layer      = 4,
      grant_method       = p_grant_method,
      resolved_at        = NOW(),
      updated_at         = NOW()
  WHERE id = p_claim_id;

  UPDATE public.organizations
  SET org_state = 'active', orphaned_at = NULL, acting_started_at = NULL, acting_deadline_at = NULL, updated_at = NOW()
  WHERE id = v_claim.organization_id AND org_state IN ('acting','orphaned');

  INSERT INTO public.notifications (
    organization_id, member_id, group_id, type, title, message, link, related_type, related_id
  ) VALUES (
    v_claim.organization_id, v_claim.claimant_user_id, v_target_gid,
    'claim_approved', 'You''re verified',
    'Your role as ' || v_label || ' is now verified. You have full admin access — money is unlocked.',
    '/dashboard', 'claim_request', p_claim_id
  );

  RETURN v_admin_id;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'Migration 061 complete: _finalize_claim_layer4 maps claim role -> system role.';
END $$;

COMMIT;
