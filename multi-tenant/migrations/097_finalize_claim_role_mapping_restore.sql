-- ============================================================
-- Migration 097: Restore role mapping in _finalize_claim_layer4
--
-- Regression — the bug we just shipped
-- ------------------------------------
-- Migration 061 fixed the original "claim's human role written
-- straight into member_admins.role" bug by mapping the claim's
-- claimed_role (e.g. 'president', 'treasurer-elect', a free-text
-- title) to one of the SYSTEM roles allowed by the
-- member_admins_role_check constraint. The human title was kept
-- in role_label.
--
-- Migration 095 (tier-scoped member management) replaced
-- _finalize_claim_layer4 to make can_manage_members tier-aware,
-- but copied the BASE function body — not the mig-061 patched
-- version. The role mapping disappeared. As a result, confirming
-- any claim with a non-system human role failed with:
--   ERROR 23514: new row for relation "member_admins" violates
--   check constraint "member_admins_role_check"
-- The platform console super-admin AND the org-level confirmer
-- both hit it because they exercise the same RPC path.
--
-- Fix
-- ---
-- Re-apply the same CASE expression mig 061 used, on top of mig
-- 095's tier-aware can_manage_members. role_label keeps the human
-- title verbatim so the UI still displays "President" / "Course
-- Rep" / etc. The system-role write is now constraint-safe again.
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
  v_can_manage_members BOOLEAN;
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

  -- Tier-aware members-management permission (kept from mig 095).
  v_can_manage_members := v_claim.claimed_scope IN ('group', 'org');

  -- Role mapping (restored from mig 061). Map the claim's human
  -- title to a SYSTEM role that satisfies member_admins_role_check.
  -- The original human title is preserved in role_label so UI
  -- surfaces still show "President", "Class Rep", etc.
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
    TRUE, TRUE, v_can_manage_members, TRUE, TRUE, TRUE, TRUE, TRUE,
    'admin_verified', 'admin', NOW(), 4,
    p_confirmer_admin_id, TRUE, CURRENT_DATE
  )
  ON CONFLICT (member_id, organization_id, group_id, role) DO UPDATE
    SET verification_status   = 'admin_verified',
        verification_layer    = GREATEST(member_admins.verification_layer, 4),
        confirmed_by_admin_id  = COALESCE(EXCLUDED.confirmed_by_admin_id, member_admins.confirmed_by_admin_id),
        verified_at           = NOW(),
        is_active             = TRUE,
        role_label            = COALESCE(NULLIF(EXCLUDED.role_label, ''), member_admins.role_label),
        can_manage_members    = v_can_manage_members,
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

GRANT EXECUTE ON FUNCTION public._finalize_claim_layer4(UUID, TEXT, UUID) TO authenticated, service_role;

COMMIT;
