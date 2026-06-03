-- ============================================================
-- Migration 084: scope the bootstrap admin check to the class
--
-- The bug (reported in the wild):
--   _class_has_admin_other_than(group, founder) returned TRUE if ANY
--   verified admin existed anywhere in the org — including admins of
--   different classes inside the same university. That meant the
--   moment any other group in UNN had a verified exec, every other
--   class's founder bootstrap was killed even though those classes
--   still had no exec of their own.
--
-- The right rule:
--   A class's bootstrap closes when an admin whose scope ACTUALLY
--   COVERS THE CLASS verifies. That means one of:
--     • Org-level admin (member_admins.group_id IS NULL OR
--       scope_level = 'org')   — they admin the whole org
--     • Class-level admin matching this exact group
--     • Ancestor admin (a faculty/department admin whose group is
--       an ancestor of this class in organization_groups)
--
--   And — same as before — the founder themselves doesn't count
--   even if they verify.
--
-- This migration:
--   1. Replaces _class_has_admin_other_than with the scoped version
--   2. Adds _group_ancestor_ids(group_id) helper that walks up
--      the parent_group_id chain (matches the hierarchy enforced
--      by mig 079)
--   3. Leaves create_member_join_invite + get_class_invite_status
--      alone — they consume the helper, so they automatically pick
--      up the fix.
-- ============================================================

BEGIN;

-- ── 1. Ancestor helper ───────────────────────────────────────
-- Returns the group's own id plus the ids of every group it sits
-- under (department, faculty, etc.), walking via parent_group_id.
-- Uses a recursive CTE — safe because the trigger in mig 079
-- prevents cycles by enforcing the kind hierarchy.
CREATE OR REPLACE FUNCTION public._group_ancestor_ids(p_group_id UUID)
RETURNS TABLE (id UUID)
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$
  WITH RECURSIVE chain AS (
    SELECT g.id, g.parent_group_id
      FROM public.organization_groups g
     WHERE g.id = p_group_id
    UNION ALL
    SELECT g.id, g.parent_group_id
      FROM public.organization_groups g
      JOIN chain c ON c.parent_group_id = g.id
  )
  SELECT id FROM chain;
$$;

-- ── 2. Scoped admin check ────────────────────────────────────
CREATE OR REPLACE FUNCTION public._class_has_admin_other_than(
  p_group_id   UUID,
  p_excluding  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id UUID;
  v_count  INT;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.organization_groups WHERE id = p_group_id;

  IF v_org_id IS NULL THEN RETURN FALSE; END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.member_admins ma
  JOIN public.organization_members om ON om.id = ma.member_id
  WHERE om.organization_id = v_org_id
    AND COALESCE(ma.verification_layer, 0) >= 2
    AND (p_excluding IS NULL OR ma.member_id <> p_excluding)
    AND (
      -- Org-level admins always count (their scope blankets everything).
      ma.group_id IS NULL
      OR COALESCE(ma.scope_level, '') = 'org'
      -- Anyone with group_id at the class itself or above it.
      OR ma.group_id IN (SELECT id FROM public._group_ancestor_ids(p_group_id))
    );

  RETURN v_count > 0;
END;
$$;

COMMIT;
