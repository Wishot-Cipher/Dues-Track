-- ============================================================
-- Migration 088: invite-status helper distinguishes Layer 2 vs Layer 4
--
-- Why:
--   The previous helper returned a single `caller_is_admin` flag that
--   was true for anyone with verification_layer >= 2. The UI used that
--   to route the founder to /admin/members — but that page is gated
--   on requireVerified (Layer 4). An email-verified Layer-2 founder
--   would land on /admin/members, get bounced back to /dashboard, and
--   end up with NO invite affordance at all (the bootstrap card had
--   hidden itself).
--
-- New shape:
--   • caller_is_acting_admin → verification_layer >= 2 (any verified admin)
--   • caller_is_full_admin   → verification_layer >= 4 (money/members unlocked)
--   • caller_is_admin        → kept for backwards-compat, aliased to acting
--
-- The UI uses caller_is_full_admin to decide whether to route to
-- /admin/members, and caller_is_acting_admin only as informational.
-- The founder bootstrap card stays visible across Layers 2 and 3.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_class_invite_status(
  p_caller_member_id UUID,
  p_group_id         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_founder              UUID;
  v_founder_name         TEXT;
  v_has_other_admin      BOOLEAN;
  v_caller_is_member     BOOLEAN;
  v_caller_is_founder    BOOLEAN;
  v_caller_acting        BOOLEAN;
  v_caller_full          BOOLEAN;
  v_org_id               UUID;
BEGIN
  SELECT organization_id, founder_member_id
    INTO v_org_id, v_founder
  FROM public.organization_groups WHERE id = p_group_id;

  SELECT om.full_name INTO v_founder_name
  FROM public.organization_members om WHERE om.id = v_founder;

  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE id = p_caller_member_id AND group_id = p_group_id
  ) INTO v_caller_is_member;

  v_caller_is_founder := v_caller_is_member
    AND v_founder IS NOT NULL
    AND v_founder = p_caller_member_id;

  v_has_other_admin := public._class_has_admin_other_than(p_group_id, v_founder);

  -- Acting admin = layer 2+, scope covers this class.
  SELECT EXISTS (
    SELECT 1
    FROM public.member_admins ma
    WHERE ma.member_id = p_caller_member_id
      AND COALESCE(ma.verification_layer, 0) >= 2
      AND (
        ma.group_id IS NULL
        OR COALESCE(ma.scope_level, '') = 'org'
        OR ma.group_id IN (SELECT id FROM public._group_ancestor_ids(p_group_id))
      )
  ) INTO v_caller_acting;

  -- Full admin = layer 4+, scope covers this class. This is the gate
  -- the /admin/members page uses (requireVerified). Only when this is
  -- TRUE should the UI route the founder to the full member tools;
  -- otherwise the bootstrap share card is their actual working path.
  SELECT EXISTS (
    SELECT 1
    FROM public.member_admins ma
    WHERE ma.member_id = p_caller_member_id
      AND COALESCE(ma.verification_layer, 0) >= 4
      AND (
        ma.group_id IS NULL
        OR COALESCE(ma.scope_level, '') = 'org'
        OR ma.group_id IN (SELECT id FROM public._group_ancestor_ids(p_group_id))
      )
  ) INTO v_caller_full;

  RETURN jsonb_build_object(
    'is_member',              v_caller_is_member,
    'is_founder',             v_caller_is_founder,
    'has_other_admin',        v_has_other_admin,
    'has_admin',              v_has_other_admin,
    -- New, layered flags:
    'caller_is_acting_admin', v_caller_acting,
    'caller_is_full_admin',   v_caller_full,
    -- Backwards-compat alias (was Layer 2+, kept that way):
    'caller_is_admin',        v_caller_acting,
    'founder_name',           v_founder_name,
    'can_share',              v_caller_is_founder AND NOT v_has_other_admin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_invite_status(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_class_invite_status(UUID, UUID) TO authenticated, anon;

COMMIT;
