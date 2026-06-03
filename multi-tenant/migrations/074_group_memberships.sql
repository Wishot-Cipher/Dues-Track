-- ============================================================
-- Migration 074: group_memberships — multi-group membership within an org
--
-- A member's primary group still lives on organization_members.group_id (so all
-- existing queries keep working). This table records EVERY group a member
-- belongs to inside their org — their class (primary) PLUS any departmental
-- association, club, fellowship, etc. "My Dues" then spans all of them.
--
-- Seeded from each member's current primary group. Writes go through the
-- SECURITY DEFINER RPCs below; reads of "my groups" come from get_my_groups.
-- ============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS public.group_memberships (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  member_id       UUID NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  group_id        UUID NOT NULL REFERENCES public.organization_groups(id) ON DELETE CASCADE,
  is_primary      BOOLEAN NOT NULL DEFAULT FALSE,
  status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','inactive','left')),
  joined_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (member_id, group_id)
);
CREATE INDEX IF NOT EXISTS idx_group_memberships_member ON public.group_memberships (member_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_group_memberships_group  ON public.group_memberships (group_id)  WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_group_memberships_org    ON public.group_memberships (organization_id);

-- Seed: every existing member's current group becomes their primary membership.
INSERT INTO public.group_memberships (organization_id, member_id, group_id, is_primary)
SELECT om.organization_id, om.id, om.group_id, TRUE
FROM public.organization_members om
WHERE om.group_id IS NOT NULL
ON CONFLICT (member_id, group_id) DO NOTHING;

ALTER TABLE public.group_memberships ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS group_memberships_self ON public.group_memberships;
CREATE POLICY group_memberships_self ON public.group_memberships FOR SELECT
  USING (auth.role() = 'service_role' OR member_id::text = auth.uid()::text OR public.can_access_group(group_id));
DROP POLICY IF EXISTS group_memberships_service ON public.group_memberships;
CREATE POLICY group_memberships_service ON public.group_memberships FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);
GRANT SELECT ON public.group_memberships TO authenticated, anon, service_role;

-- ── get_my_groups: every group the caller belongs to (+ whether they're exec there) ──
CREATE OR REPLACE FUNCTION public.get_my_groups(p_member_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_org UUID; v_rows jsonb;
BEGIN
  IF p_member_id IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.'); END IF;
  SELECT organization_id INTO v_org FROM public.organization_members WHERE id = p_member_id;
  IF v_org IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found.'); END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.is_primary DESC, t.name), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT g.id AS group_id, g.name, g.short_name, g.kind, g.parent_group_id,
           gm.is_primary,
           EXISTS (
             SELECT 1 FROM public.member_admins ma
             WHERE ma.member_id = p_member_id AND ma.group_id = g.id
               AND ma.is_active = TRUE AND ma.verification_layer >= 4
           ) AS is_verified_exec
    FROM public.group_memberships gm
    JOIN public.organization_groups g ON g.id = gm.group_id
    WHERE gm.member_id = p_member_id AND gm.status = 'active'
  ) t;

  RETURN jsonb_build_object('ok', TRUE, 'groups', v_rows);
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_groups(UUID) TO anon, authenticated, service_role;

-- ── join_group: add the caller to another group in their org ──
CREATE OR REPLACE FUNCTION public.join_group(p_member_id UUID, p_group_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_org UUID; v_g_org UUID; v_kind TEXT;
BEGIN
  IF p_member_id IS NULL OR p_group_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member and group are required.');
  END IF;
  SELECT organization_id INTO v_org FROM public.organization_members WHERE id = p_member_id;
  IF v_org IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found.'); END IF;

  SELECT organization_id, kind INTO v_g_org, v_kind FROM public.organization_groups WHERE id = p_group_id;
  IF v_g_org IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Group not found.'); END IF;
  IF v_g_org <> v_org THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'That group is in a different organization.');
  END IF;

  INSERT INTO public.group_memberships (organization_id, member_id, group_id, is_primary, status)
  VALUES (v_org, p_member_id, p_group_id, FALSE, 'active')
  ON CONFLICT (member_id, group_id) DO UPDATE SET status = 'active';

  -- keep the group's denormalized counter roughly in step
  UPDATE public.organization_groups
  SET current_member_count = COALESCE(current_member_count, 0) + 1
  WHERE id = p_group_id;

  RETURN jsonb_build_object('ok', TRUE);
END; $$;
GRANT EXECUTE ON FUNCTION public.join_group(UUID, UUID) TO anon, authenticated, service_role;

-- ── leave_group: leave an additional group (never the primary) ──
CREATE OR REPLACE FUNCTION public.leave_group(p_member_id UUID, p_group_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_primary BOOLEAN;
BEGIN
  SELECT is_primary INTO v_primary FROM public.group_memberships
  WHERE member_id = p_member_id AND group_id = p_group_id;
  IF v_primary IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'You are not in that group.'); END IF;
  IF v_primary THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'You can''t leave your primary group.'); END IF;

  UPDATE public.group_memberships SET status = 'left' WHERE member_id = p_member_id AND group_id = p_group_id;
  UPDATE public.organization_groups
  SET current_member_count = GREATEST(0, COALESCE(current_member_count, 1) - 1)
  WHERE id = p_group_id;

  RETURN jsonb_build_object('ok', TRUE);
END; $$;
GRANT EXECUTE ON FUNCTION public.leave_group(UUID, UUID) TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 074 complete: group_memberships + get_my_groups/join_group/leave_group.';
END $$;

COMMIT;
