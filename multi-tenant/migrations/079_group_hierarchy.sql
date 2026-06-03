-- ============================================================
-- Migration 079: Enforce faculty → department → class hierarchy
--
-- Real-life rule (for academic orgs — university / polytechnic / college):
--
--   Faculty                        kind in ('faculty','college')   parent = NULL
--     └── Department               kind = 'department'             parent MUST be a faculty/college
--           └── Class              kind in ('class','level')       parent MUST be a department
--
-- Associations / clubs / fellowships / teams / general groups can sit anywhere
-- — they're cross-cutting by nature. Non-academic orgs are flat (no enforcement).
--
-- Why this matters: when a dept president publishes "Civil dues", the cascade
-- fan-out walks `parent_group_id` down. If a class was created OUTSIDE the dept
-- (a "CVE" that's a sibling of the dept instead of a child), its members never
-- get billed. This trigger makes that impossible going forward; the new RPCs
-- (find_misplaced_groups / reparent_group / merge_groups / delete_empty_group)
-- let an admin clean up the orphans that already exist.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1) Trigger: enforce the hierarchy on INSERT / UPDATE
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public._enforce_group_hierarchy()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  v_org_type    TEXT;
  v_parent_kind TEXT;
  v_parent_org  UUID;
BEGIN
  -- Skip validation if neither the parent nor the kind changed on UPDATE.
  IF TG_OP = 'UPDATE'
     AND OLD.parent_group_id IS NOT DISTINCT FROM NEW.parent_group_id
     AND OLD.kind = NEW.kind THEN
    RETURN NEW;
  END IF;

  SELECT organization_type INTO v_org_type
  FROM public.organizations WHERE id = NEW.organization_id;

  -- Only academic orgs follow the strict tree. Everything else stays flat.
  IF COALESCE(v_org_type, '') NOT IN ('university', 'polytechnic', 'college') THEN
    RETURN NEW;
  END IF;

  -- Resolve parent (and check it lives in the same org).
  IF NEW.parent_group_id IS NOT NULL THEN
    SELECT kind, organization_id INTO v_parent_kind, v_parent_org
    FROM public.organization_groups WHERE id = NEW.parent_group_id;
    IF v_parent_kind IS NULL THEN
      RAISE EXCEPTION 'Parent group does not exist.'
        USING ERRCODE = 'foreign_key_violation';
    END IF;
    IF v_parent_org <> NEW.organization_id THEN
      RAISE EXCEPTION 'Parent group belongs to a different organization.'
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;

  CASE NEW.kind
    WHEN 'faculty', 'college' THEN
      IF NEW.parent_group_id IS NOT NULL THEN
        RAISE EXCEPTION 'A % is a top-level group and cannot have a parent.', NEW.kind
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'department' THEN
      IF NEW.parent_group_id IS NULL THEN
        RAISE EXCEPTION 'A department must be created inside a faculty.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_parent_kind NOT IN ('faculty', 'college') THEN
        RAISE EXCEPTION 'A department''s parent must be a faculty (got %).', v_parent_kind
          USING ERRCODE = 'check_violation';
      END IF;

    WHEN 'class', 'level' THEN
      IF NEW.parent_group_id IS NULL THEN
        RAISE EXCEPTION 'A class must be created inside a department.'
          USING ERRCODE = 'check_violation';
      END IF;
      IF v_parent_kind <> 'department' THEN
        RAISE EXCEPTION 'A class''s parent must be a department (got %).', v_parent_kind
          USING ERRCODE = 'check_violation';
      END IF;

    ELSE
      -- association / club / fellowship / team / general — no constraint.
      NULL;
  END CASE;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_group_hierarchy ON public.organization_groups;
CREATE TRIGGER trg_enforce_group_hierarchy
  BEFORE INSERT OR UPDATE OF parent_group_id, kind ON public.organization_groups
  FOR EACH ROW EXECUTE FUNCTION public._enforce_group_hierarchy();

-- ════════════════════════════════════════════════════════════
-- 2) find_misplaced_groups — list groups that violate the hierarchy
--    (read-only; the admin uses this to drive the cleanup UI)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.find_misplaced_groups(p_org_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org_type TEXT;
  v_rows     jsonb;
BEGIN
  SELECT organization_type INTO v_org_type FROM public.organizations WHERE id = p_org_id;
  IF COALESCE(v_org_type, '') NOT IN ('university', 'polytechnic', 'college') THEN
    RETURN jsonb_build_object('ok', TRUE, 'orphans', '[]'::jsonb);
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.kind, t.name), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT
      g.id, g.name, g.short_name, g.kind,
      g.parent_group_id, COALESCE(g.current_member_count, 0) AS member_count,
      p.kind AS parent_kind, p.name AS parent_name,
      CASE
        WHEN g.kind IN ('faculty','college') AND g.parent_group_id IS NOT NULL
          THEN 'faculty_has_parent'
        WHEN g.kind = 'department' AND g.parent_group_id IS NULL
          THEN 'department_orphan'
        WHEN g.kind = 'department' AND p.kind NOT IN ('faculty','college')
          THEN 'department_wrong_parent'
        WHEN g.kind IN ('class','level') AND g.parent_group_id IS NULL
          THEN 'class_orphan'
        WHEN g.kind IN ('class','level') AND p.kind <> 'department'
          THEN 'class_wrong_parent'
        ELSE NULL
      END AS issue
    FROM public.organization_groups g
    LEFT JOIN public.organization_groups p ON p.id = g.parent_group_id
    WHERE g.organization_id = p_org_id
      AND COALESCE(g.is_active, TRUE) = TRUE
  ) t
  WHERE t.issue IS NOT NULL;

  RETURN jsonb_build_object('ok', TRUE, 'orphans', v_rows);
END;
$$;
GRANT EXECUTE ON FUNCTION public.find_misplaced_groups(UUID) TO anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 3) reparent_group — move a group under a new parent
--    Caller must be an active admin in the same org. The hierarchy trigger
--    will reject the update if the new parent's kind is wrong.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.reparent_group(
  p_caller_member_id UUID, p_group_id UUID, p_new_parent_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org_id UUID;
BEGIN
  IF p_caller_member_id IS NULL OR p_group_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Missing arguments.');
  END IF;

  SELECT organization_id INTO v_org_id
  FROM public.organization_groups WHERE id = p_group_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Group not found.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.member_admins
    WHERE member_id = p_caller_member_id AND organization_id = v_org_id
      AND COALESCE(is_active, TRUE) = TRUE
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only an admin in this organization can re-parent groups.');
  END IF;

  -- Refuse a self-cycle.
  IF p_new_parent_id = p_group_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'A group cannot be its own parent.');
  END IF;

  UPDATE public.organization_groups
  SET parent_group_id = p_new_parent_id, updated_at = NOW()
  WHERE id = p_group_id;

  RETURN jsonb_build_object('ok', TRUE);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reparent_group(UUID, UUID, UUID) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 4) delete_empty_group — hard-delete a group that has no members
--    (used to clean up the duplicate "CVE" case)
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.delete_empty_group(
  p_caller_member_id UUID, p_group_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_org_id UUID; v_member_count INTEGER; v_child_count INTEGER;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.organization_groups WHERE id = p_group_id;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Group not found.');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.member_admins
    WHERE member_id = p_caller_member_id AND organization_id = v_org_id
      AND COALESCE(is_active, TRUE) = TRUE
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only an admin in this organization can delete groups.');
  END IF;

  SELECT COUNT(*) INTO v_member_count FROM public.organization_members
   WHERE group_id = p_group_id;
  IF v_member_count > 0 THEN
    RETURN jsonb_build_object('ok', FALSE,
      'error', 'This group still has ' || v_member_count || ' members. Move them out first or use merge.');
  END IF;

  SELECT COUNT(*) INTO v_child_count FROM public.organization_groups
   WHERE parent_group_id = p_group_id;
  IF v_child_count > 0 THEN
    RETURN jsonb_build_object('ok', FALSE,
      'error', 'This group still has ' || v_child_count || ' child groups. Move or delete them first.');
  END IF;

  DELETE FROM public.organization_groups WHERE id = p_group_id;
  RETURN jsonb_build_object('ok', TRUE);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.delete_empty_group(UUID, UUID) TO authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 5) merge_groups — move members + admins + payment types from one
--    group into another, then delete the source. Used when the same
--    real-world group was created twice (the "CVE" duplicate).
--    Both groups must be in the same org and same kind for safety.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.merge_groups(
  p_caller_member_id UUID,
  p_source_group_id  UUID,
  p_target_group_id  UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_src RECORD; v_tgt RECORD;
BEGIN
  IF p_source_group_id = p_target_group_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Source and target are the same group.');
  END IF;

  SELECT id, organization_id, kind INTO v_src FROM public.organization_groups WHERE id = p_source_group_id;
  SELECT id, organization_id, kind INTO v_tgt FROM public.organization_groups WHERE id = p_target_group_id;
  IF v_src.id IS NULL OR v_tgt.id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Both groups must exist.');
  END IF;
  IF v_src.organization_id <> v_tgt.organization_id THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Groups belong to different organizations.');
  END IF;
  IF v_src.kind <> v_tgt.kind THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Both groups must be the same kind (got ' || v_src.kind || ' and ' || v_tgt.kind || ').');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.member_admins
    WHERE member_id = p_caller_member_id AND organization_id = v_src.organization_id
      AND COALESCE(is_active, TRUE) = TRUE
  ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Only an admin in this organization can merge groups.');
  END IF;

  -- Re-home everything from source → target.
  UPDATE public.organization_members SET group_id = p_target_group_id WHERE group_id = p_source_group_id;
  UPDATE public.member_admins        SET group_id = p_target_group_id WHERE group_id = p_source_group_id;
  UPDATE public.payment_types        SET group_id = p_target_group_id WHERE group_id = p_source_group_id;
  UPDATE public.organization_groups  SET parent_group_id = p_target_group_id WHERE parent_group_id = p_source_group_id;

  -- Refresh the target's denormalised member counter.
  UPDATE public.organization_groups t
  SET current_member_count = (SELECT COUNT(*) FROM public.organization_members WHERE group_id = t.id),
      updated_at = NOW()
  WHERE t.id = p_target_group_id;

  DELETE FROM public.organization_groups WHERE id = p_source_group_id;

  RETURN jsonb_build_object('ok', TRUE);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', SQLERRM);
END;
$$;
GRANT EXECUTE ON FUNCTION public.merge_groups(UUID, UUID, UUID) TO authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 079 complete: hierarchy enforced + find/reparent/delete/merge RPCs ready.';
END $$;

COMMIT;
