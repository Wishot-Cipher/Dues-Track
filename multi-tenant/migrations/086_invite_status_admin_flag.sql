-- ============================================================
-- Migration 086: surface "caller is a verified admin" in the
--                invite-status helper
--
-- Why:
--   The student dashboard card needs to make a 3-way decision:
--     • Founder, not yet admin       → bootstrap share card (20 cap)
--     • Verified admin (any scope)   → "use the admin members page"
--                                        — they have higher limits
--                                        + can invite admins/bulk
--     • Anyone else (no admin yet)   → "ask your founder" hint
--
-- get_class_invite_status today returns is_founder + has_admin
-- (other than founder). It doesn't tell the UI whether THE CALLER is
-- themselves a verified admin in scope. This migration adds that flag
-- without breaking existing callers.
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
  v_founder             UUID;
  v_founder_name        TEXT;
  v_has_other_admin     BOOLEAN;
  v_caller_is_member    BOOLEAN;
  v_caller_is_founder   BOOLEAN;
  v_caller_is_admin     BOOLEAN;
  v_org_id              UUID;
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

  -- Is THE CALLER themselves a verified admin whose scope covers this class?
  -- Reuses the "any admin in scope" logic via excluding=NULL, then filtering
  -- on member_id = caller. Cheaper to just inline:
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
  ) INTO v_caller_is_admin;

  RETURN jsonb_build_object(
    'is_member',           v_caller_is_member,
    'is_founder',          v_caller_is_founder,
    'has_other_admin',     v_has_other_admin,
    'has_admin',           v_has_other_admin,
    'caller_is_admin',     v_caller_is_admin,    -- NEW
    'founder_name',        v_founder_name,
    -- can_share unchanged: bootstrap stays open while no NON-FOUNDER
    -- admin has taken over. A founder who became admin keeps sharing.
    'can_share',           v_caller_is_founder AND NOT v_has_other_admin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_invite_status(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_class_invite_status(UUID, UUID) TO authenticated, anon;

COMMIT;
