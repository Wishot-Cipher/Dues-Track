-- ============================================================
-- Migration 123: "Level is a timeline" — Model B foundation (Stage 1)
--
-- Treats a class as a PERMANENT year-group ("set") whose LEVEL advances
-- over time, instead of a static text field. Built additively on the
-- mig 005 progression scaffolding.
--
-- Critical design note (Nigerian academic reality):
--   Sessions have NO fixed end date and frequently extend (strikes etc.).
--   So advancement is PURELY MANUAL + exec-driven — there is NO cron, no
--   calendar trigger, no auto-advance anywhere. A set can sit at one
--   level across two sessions; that's expected. entry_year is the
--   permanent identity; current_level is advanced only when an exec
--   confirms their set actually moved up. Everything is logged +
--   reversible (a 'correction' undoes a mis-click).
--
-- Academic orgs only — non-academic orgs never use levels.
-- ============================================================

BEGIN;

-- ── 1) Group columns (the set's level state) ──
ALTER TABLE public.organization_groups
  ADD COLUMN IF NOT EXISTS entry_year       INTEGER,   -- session the set started (identity)
  ADD COLUMN IF NOT EXISTS current_level    TEXT,      -- canonical text level (e.g. '200L')
  ADD COLUMN IF NOT EXISTS course_duration  INTEGER,   -- years to graduation (4/5/6)
  ADD COLUMN IF NOT EXISTS graduation_year  INTEGER,   -- estimate = entry_year + duration (display only)
  ADD COLUMN IF NOT EXISTS is_graduated     BOOLEAN DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS graduated_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS alumni_label     TEXT;

-- Backfill current_level from the existing levels[] array for class-tier
-- groups so existing data lights up immediately.
UPDATE public.organization_groups
SET current_level = levels[1]
WHERE current_level IS NULL
  AND levels IS NOT NULL
  AND array_length(levels, 1) >= 1
  AND kind IN ('class', 'level');

-- ── 2) Permanent level history ──
CREATE TABLE IF NOT EXISTS public.group_level_history (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id        UUID NOT NULL REFERENCES public.organization_groups(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL,
  level_from      TEXT,
  level_to        TEXT,
  session_label   TEXT,
  change_type     TEXT NOT NULL DEFAULT 'advancement',  -- advancement | correction | graduation | initial
  changed_by      UUID,        -- organization_members.id
  changed_at      TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_group_level_history_group ON public.group_level_history (group_id, changed_at DESC);

ALTER TABLE public.group_level_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS group_level_history_read ON public.group_level_history;
CREATE POLICY group_level_history_read ON public.group_level_history
  FOR SELECT USING (TRUE);  -- app-layer scoped; writes go through SECURITY DEFINER RPCs
DROP POLICY IF EXISTS group_level_history_service ON public.group_level_history;
CREATE POLICY group_level_history_service ON public.group_level_history
  FOR ALL TO service_role USING (TRUE) WITH CHECK (TRUE);

-- ── 3) Permission helper: may the caller manage this group's level? ──
-- The group's own verified exec, OR any exec at an ancestor tier
-- (department/faculty), OR an org-scope exec. Never another sibling
-- group's exec, never a member, never alumni.
CREATE OR REPLACE FUNCTION public.can_manage_group_level(p_member_id UUID, p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org UUID;
BEGIN
  IF p_member_id IS NULL OR p_group_id IS NULL THEN RETURN FALSE; END IF;
  SELECT organization_id INTO v_org FROM public.organization_groups WHERE id = p_group_id;
  IF v_org IS NULL THEN RETURN FALSE; END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id = p_member_id
      AND ma.organization_id = v_org
      AND ma.is_active = TRUE
      AND COALESCE(ma.verification_layer, 0) >= 3
      AND (
        ma.scope_level = 'org'
        OR ma.group_id = p_group_id
        OR public.group_is_ancestor_or_self(ma.group_id, p_group_id)   -- ancestor tier exec
      )
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.can_manage_group_level(UUID, UUID) TO anon, authenticated, service_role;

-- ── 4) Advance / correct a set's level ──
-- Manual only. Updates the group's current_level AND every member's
-- `level` (so the existing dues-matching by member.level keeps working —
-- when a set hits 300L, 300L-targeted dues auto-apply). Logs history +
-- notifies members. p_change_type: 'advancement' (default) or 'correction'.
CREATE OR REPLACE FUNCTION public.advance_group_level(
  p_group_id        UUID,
  p_caller_member_id UUID,
  p_new_level       TEXT,
  p_session_label   TEXT DEFAULT NULL,
  p_change_type     TEXT DEFAULT 'advancement'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org     UUID;
  v_name    TEXT;
  v_from    TEXT;
  v_grad    BOOLEAN;
  v_new     TEXT := NULLIF(TRIM(COALESCE(p_new_level, '')), '');
BEGIN
  IF v_new IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Pick a level.'); END IF;
  IF NOT public.can_manage_group_level(p_caller_member_id, p_group_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only this set''s exec (or a department/faculty/org exec) can change its level.');
  END IF;

  SELECT organization_id, name, current_level, COALESCE(is_graduated, FALSE)
    INTO v_org, v_name, v_from, v_grad
  FROM public.organization_groups WHERE id = p_group_id;
  IF v_org IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Group not found.'); END IF;
  IF v_grad THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'This set has graduated — its level is fixed.'); END IF;

  UPDATE public.organization_groups
  SET current_level = v_new,
      levels = ARRAY[v_new],
      updated_at = NOW()
  WHERE id = p_group_id;

  -- Keep members in sync so dues match the new level.
  UPDATE public.organization_members
  SET level = v_new, updated_at = NOW()
  WHERE group_id = p_group_id;

  INSERT INTO public.group_level_history (group_id, organization_id, level_from, level_to, session_label, change_type, changed_by)
  VALUES (p_group_id, v_org, v_from, v_new, NULLIF(TRIM(COALESCE(p_session_label,'')),''),
          CASE WHEN p_change_type = 'correction' THEN 'correction' ELSE 'advancement' END, p_caller_member_id);

  -- Notify the set's members (best-effort).
  INSERT INTO public.notifications (organization_id, group_id, member_id, type, title, message, link)
  SELECT v_org, p_group_id, om.id, 'level_change',
         CASE WHEN p_change_type = 'correction' THEN 'Your level was corrected' ELSE '🎓 Your set advanced' END,
         COALESCE(v_name, 'Your set') || ' is now ' || v_new
           || CASE WHEN p_session_label IS NOT NULL THEN ' (' || p_session_label || ')' ELSE '' END
           || '. Any dues for this level now apply.',
         '/payments'
  FROM public.organization_members om
  WHERE om.group_id = p_group_id AND COALESCE(om.is_active, TRUE) = TRUE;

  RETURN jsonb_build_object('ok', TRUE, 'level_from', v_from, 'level_to', v_new);
END;
$$;
GRANT EXECUTE ON FUNCTION public.advance_group_level(UUID, UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

-- ── 5) Graduate a set ──
-- Marks the set graduated + alumni-labelled; flips its members to
-- 'graduated' (read-only — they keep login + history but get no new
-- dues, can't be elected); preserves ALL financial history. Manual +
-- confirmed on the client.
CREATE OR REPLACE FUNCTION public.graduate_group(
  p_group_id         UUID,
  p_caller_member_id UUID,
  p_alumni_label     TEXT DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org   UUID;
  v_name  TEXT;
  v_from  TEXT;
  v_label TEXT := NULLIF(TRIM(COALESCE(p_alumni_label, '')), '');
  v_count INT;
BEGIN
  IF NOT public.can_manage_group_level(p_caller_member_id, p_group_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only this set''s exec (or a department/faculty/org exec) can graduate it.');
  END IF;

  SELECT organization_id, name, current_level INTO v_org, v_name, v_from
  FROM public.organization_groups WHERE id = p_group_id;
  IF v_org IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Group not found.'); END IF;

  UPDATE public.organization_groups
  SET is_graduated = TRUE,
      graduated_at = NOW(),
      alumni_label = v_label,
      updated_at = NOW()
  WHERE id = p_group_id;

  -- Members → alumni (still active so they keep read access + history).
  UPDATE public.organization_members
  SET promotion_status = 'graduated', updated_at = NOW()
  WHERE group_id = p_group_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  INSERT INTO public.group_level_history (group_id, organization_id, level_from, level_to, change_type, changed_by)
  VALUES (p_group_id, v_org, v_from, COALESCE(v_label, 'Alumni'), 'graduation', p_caller_member_id);

  INSERT INTO public.notifications (organization_id, group_id, member_id, type, title, message, link)
  SELECT v_org, p_group_id, om.id, 'graduation',
         '🎓 Congratulations, you''ve graduated!',
         'Your set' || CASE WHEN v_name IS NOT NULL THEN ' (' || v_name || ')' ELSE '' END
           || ' is now alumni' || CASE WHEN v_label IS NOT NULL THEN ' — ' || v_label ELSE '' END
           || '. You keep access to your full payment history; no new dues will be added.',
         '/payments'
  FROM public.organization_members om
  WHERE om.group_id = p_group_id;

  RETURN jsonb_build_object('ok', TRUE, 'alumni', v_count, 'alumni_label', v_label);
END;
$$;
GRANT EXECUTE ON FUNCTION public.graduate_group(UUID, UUID, TEXT) TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 123 applied: level-as-timeline foundation (entry_year/current_level/duration/grad + group_level_history + advance/correct/graduate RPCs). Manual-only — no auto-advance.';
END $$;

COMMIT;
