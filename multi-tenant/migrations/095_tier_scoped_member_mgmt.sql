-- ============================================================
-- Migration 095: Tier-scoped "Manage Members"
--
-- Problem: claim approval (mig 060._finalize_claim_layer4),
-- department/faculty owner creation (organizationService.createDepartment)
-- and the manual role-grant in OrgMembersPage all blanket-set
-- can_manage_members = TRUE. That means a dept or faculty exec
-- earning Layer 4 also walks away with class-rep-level powers
-- over every student in every class beneath them, which is not
-- the design.
--
-- The user's intent: each tier owns its OWN powers. Members
-- management (add / edit / suspend / promote students) is a
-- CLASS-REP responsibility. Dept/faculty execs see aggregated
-- finances and publish dues at their own tier; they do not
-- reach inside classes to manage individual rosters.
--
-- This migration:
--   1) Updates _finalize_claim_layer4 so the granted admin row
--      ONLY carries can_manage_members when the claim's
--      scope is 'group' (class rep) or 'org' (org owner). A
--      'unit' (dept/faculty) claim lands without it.
--   2) Backfills existing rows: any active member_admins row
--      with scope_level='unit' has its can_manage_members
--      cleared. Class reps + org-tier rows are untouched.
--
-- Frontend already gates /admin/members on activeRole.scopeLevel
-- (App.tsx allowedScopes + OrgLayout maxScope). The DB grant +
-- backfill close the gap so refreshing the user/role won't
-- silently re-enable the permission for a unit-tier exec.
-- ============================================================

BEGIN;

-- ── 1) Backfill existing rows ───────────────────────────────
UPDATE public.member_admins
   SET can_manage_members = FALSE,
       updated_at         = NOW()
 WHERE scope_level = 'unit'
   AND can_manage_members = TRUE;

-- ── 2) Replace the claim finalizer with a tier-aware version ─
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
BEGIN
  SELECT * INTO v_claim FROM public.claim_requests WHERE id = p_claim_id;
  IF v_claim IS NULL THEN RETURN NULL; END IF;
  IF v_claim.status = 'approved' THEN RETURN v_claim.resulting_admin_id; END IF;

  v_target_gid := CASE v_claim.claimed_scope
    WHEN 'group' THEN v_claim.claimed_group_id
    WHEN 'unit'  THEN v_claim.claimed_unit_group_id
    ELSE NULL END;

  -- Tier-aware: members management lives at the class tier (and
  -- the org tier, where an owner can edit any roster). Dept and
  -- faculty execs (scope_level='unit') do NOT get it.
  v_can_manage_members := v_claim.claimed_scope IN ('group', 'org');

  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments, can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics, can_export_data, can_manage_settings,
    verification_status, verification_method, verified_at, verification_layer,
    confirmed_by_admin_id, is_active, tenure_start
  ) VALUES (
    v_claim.claimant_user_id, v_claim.organization_id, v_target_gid,
    v_claim.claimed_role, v_claim.position_title, v_claim.claimed_scope,
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
        -- Re-affirm tier-scoped permission on re-grant so a row
        -- that was previously over-permissioned gets corrected
        -- when the claimant comes back through the flow.
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
    'Your role as ' || v_claim.position_title || ' is now verified. You have full admin access — money is unlocked.',
    '/dashboard', 'claim_request', p_claim_id
  );

  RETURN v_admin_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public._finalize_claim_layer4(UUID, TEXT, UUID) TO authenticated, service_role;

COMMIT;
