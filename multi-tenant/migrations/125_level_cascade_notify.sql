-- ============================================================
-- Migration 125: Level-advance cascade notifications (Stage 5 / V2)
--
-- When a set advances to a level, the SIBLING sets in the same
-- department that are now ALSO at that level get a gentle, actionable
-- ping: "a set reached your level — are you advancing too?". This nudges
-- the older set to move up (or graduate) without anything automatic.
--
-- Recreates advance_group_level (from mig 123) verbatim + appends the
-- cascade block. Still 100% manual — these are just notifications;
-- nobody is advanced or graduated automatically.
-- ============================================================

BEGIN;

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
  v_parent  UUID;
  v_new     TEXT := NULLIF(TRIM(COALESCE(p_new_level, '')), '');
BEGIN
  IF v_new IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Pick a level.'); END IF;
  IF NOT public.can_manage_group_level(p_caller_member_id, p_group_id) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only this set''s exec (or a department/faculty/org exec) can change its level.');
  END IF;

  SELECT organization_id, name, current_level, COALESCE(is_graduated, FALSE), parent_group_id
    INTO v_org, v_name, v_from, v_grad, v_parent
  FROM public.organization_groups WHERE id = p_group_id;
  IF v_org IS NULL THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Group not found.'); END IF;
  IF v_grad THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'This set has graduated — its level is fixed.'); END IF;

  UPDATE public.organization_groups
  SET current_level = v_new, levels = ARRAY[v_new], updated_at = NOW()
  WHERE id = p_group_id;

  UPDATE public.organization_members
  SET level = v_new, updated_at = NOW()
  WHERE group_id = p_group_id;

  INSERT INTO public.group_level_history (group_id, organization_id, level_from, level_to, session_label, change_type, changed_by)
  VALUES (p_group_id, v_org, v_from, v_new, NULLIF(TRIM(COALESCE(p_session_label,'')),''),
          CASE WHEN p_change_type = 'correction' THEN 'correction' ELSE 'advancement' END, p_caller_member_id);

  -- Notify the set's own members.
  INSERT INTO public.notifications (organization_id, group_id, member_id, type, title, message, link)
  SELECT v_org, p_group_id, om.id, 'level_change',
         CASE WHEN p_change_type = 'correction' THEN 'Your level was corrected' ELSE '🎓 Your set advanced' END,
         COALESCE(v_name, 'Your set') || ' is now ' || v_new
           || CASE WHEN p_session_label IS NOT NULL THEN ' (' || p_session_label || ')' ELSE '' END
           || '. Any dues for this level now apply.',
         '/payments'
  FROM public.organization_members om
  WHERE om.group_id = p_group_id AND COALESCE(om.is_active, TRUE) = TRUE;

  -- ── CASCADE: ping execs of SIBLING sets (same department) that are
  --    now also at this level — they're the older set that should
  --    consider advancing too. Manual nudge only. ──
  IF p_change_type <> 'correction' AND v_parent IS NOT NULL THEN
    INSERT INTO public.notifications (organization_id, group_id, member_id, type, title, message, link)
    SELECT v_org, sib.id, ma.member_id, 'level_cascade',
           'A set reached your level',
           COALESCE(v_name, 'Another set') || ' just advanced to ' || v_new
             || '. Your set (' || COALESCE(sib.name, 'yours') || ') is also at ' || v_new
             || ' — is it advancing this session? Open Set & level to advance or graduate.',
           '/admin/dashboard'
    FROM public.organization_groups sib
    JOIN public.member_admins ma
      ON ma.group_id = sib.id
     AND ma.is_active = TRUE
     AND COALESCE(ma.verification_layer, 0) >= 3
    WHERE sib.organization_id = v_org
      AND sib.parent_group_id = v_parent     -- same department
      AND sib.id <> p_group_id
      AND sib.current_level = v_new
      AND COALESCE(sib.is_graduated, FALSE) = FALSE;
  END IF;

  RETURN jsonb_build_object('ok', TRUE, 'level_from', v_from, 'level_to', v_new);
END;
$$;
GRANT EXECUTE ON FUNCTION public.advance_group_level(UUID, UUID, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'Migration 125 applied: advance_group_level now cascades a "a set reached your level" nudge to sibling sets'' execs. Still fully manual.'; END $$;

COMMIT;
