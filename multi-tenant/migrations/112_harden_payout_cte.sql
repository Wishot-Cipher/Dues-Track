-- ============================================================
-- Migration 112: Depth-guard the payout permission CTE.
--
-- Bug (user): confirming the password on payout "keeps loading
-- without doing anything or any error." The request never returns.
--
-- Cause: can_member_manage_payout (mig 106) walks UP the group tree
-- with a RECURSIVE CTE that has NO depth guard. If the group
-- hierarchy contains a cycle (group A → parent B → parent A) — which
-- is possible after the F&D-tree churn + test-data create/delete
-- cycles — the recursion never terminates. The RPC hangs, the API
-- await hangs, and the payout modal spins forever with no error.
--
-- Fix: cap the ancestor walk at a sane depth (a tier tree is at most
-- org → faculty → dept → class = 4 levels; 10 is generous headroom).
-- A cycle now terminates at depth 10 instead of looping. Same result
-- for all well-formed trees.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.can_member_manage_payout(
  p_member_id UUID,
  p_group_id  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_ok BOOLEAN;
BEGIN
  IF p_member_id IS NULL THEN RETURN FALSE; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id = p_member_id
      AND ma.is_active = TRUE
      AND ma.can_manage_payout = TRUE
      AND COALESCE(ma.verification_layer, 0) >= 3
      AND (
        ma.scope_level = 'org'
        OR ma.group_id = p_group_id
        OR p_group_id IS NULL
        OR ma.group_id IN (
          WITH RECURSIVE up AS (
            SELECT id, parent_group_id, 1 AS depth
            FROM public.organization_groups WHERE id = p_group_id
            UNION ALL
            SELECT g.id, g.parent_group_id, up.depth + 1
            FROM public.organization_groups g
            JOIN up ON g.id = up.parent_group_id
            WHERE up.depth < 10           -- cycle / runaway guard
          )
          SELECT id FROM up
        )
      )
  ) INTO v_ok;

  RETURN COALESCE(v_ok, FALSE);
END;
$$;
GRANT EXECUTE ON FUNCTION public.can_member_manage_payout(UUID, UUID)
  TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 112 complete: can_member_manage_payout ancestor walk is now depth-guarded.';
END $$;

COMMIT;
