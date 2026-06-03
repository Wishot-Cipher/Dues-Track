-- ============================================================
-- Migration 036: Hotfix get_due_creation_context column ref
--
-- Mig 035 referenced `member_count` on organization_groups, but
-- that table only has `current_member_count` (per mig 005). The
-- COALESCE fell over with "column does not exist" the first time
-- the CreateDuePage tried to load the targeting picker.
--
-- This migration just re-creates the function with the correct
-- column reference. CREATE OR REPLACE so it overwrites cleanly.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.get_due_creation_context(
  p_caller_member_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id            UUID;
  v_org_slug          TEXT;
  v_org_name          TEXT;
  v_org_state         TEXT;
  v_caller_scope      TEXT;
  v_caller_group_id   UUID;
  v_can_create        BOOLEAN;
  v_verified          TEXT;
  v_session_id        UUID;
  v_session_label     TEXT;
  v_can_publish       BOOLEAN := FALSE;
  v_targets           JSONB;
BEGIN
  IF p_caller_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;

  SELECT om.organization_id INTO v_org_id
  FROM public.organization_members om
  WHERE om.id = p_caller_member_id LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found.');
  END IF;

  SELECT slug, name, org_state INTO v_org_slug, v_org_name, v_org_state
  FROM public.organizations WHERE id = v_org_id;

  SELECT ma.scope_level, ma.group_id,
         COALESCE(ma.can_create_payments, FALSE),
         ma.verification_status
    INTO v_caller_scope, v_caller_group_id, v_can_create, v_verified
  FROM public.member_admins ma
  WHERE ma.member_id = p_caller_member_id
    AND ma.organization_id = v_org_id
    AND COALESCE(ma.is_active, TRUE) = TRUE
  ORDER BY
    CASE ma.scope_level WHEN 'org' THEN 0 WHEN 'unit' THEN 1 WHEN 'group' THEN 2 ELSE 3 END,
    ma.created_at DESC
  LIMIT 1;

  SELECT id, label INTO v_session_id, v_session_label
  FROM public.academic_sessions
  WHERE organization_id = v_org_id AND is_active = TRUE
  ORDER BY start_date DESC LIMIT 1;

  v_can_publish := v_can_create
    AND v_verified IN ('email_verified','document_verified','admin_verified','member_confirmed')
    AND v_org_state = 'active';

  -- Build the targets list based on caller's scope.
  -- NOTE: organization_groups has `current_member_count` (added mig 005).
  -- The earlier COALESCE referenced a non-existent `member_count` column.
  WITH all_groups AS (
    SELECT id, name, short_name, kind, parent_group_id,
           COALESCE(can_collect_dues, TRUE) AS can_collect_dues,
           COALESCE(current_member_count, 0) AS member_count
    FROM public.organization_groups
    WHERE organization_id = v_org_id
      AND COALESCE(is_active, TRUE) = TRUE
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id',                id,
      'name',              name,
      'short_name',        short_name,
      'kind',              kind,
      'parent_group_id',   parent_group_id,
      'can_collect_dues',  can_collect_dues,
      'member_count',      member_count
    ) ORDER BY kind, name
  ), '[]'::jsonb) INTO v_targets
  FROM all_groups
  WHERE
    (v_caller_scope = 'group' AND id = v_caller_group_id)
    OR (v_caller_scope = 'unit' AND (id = v_caller_group_id OR parent_group_id = v_caller_group_id))
    OR (v_caller_scope = 'org' AND can_collect_dues = TRUE);

  RETURN jsonb_build_object(
    'ok', TRUE,
    'org', jsonb_build_object(
      'id', v_org_id, 'slug', v_org_slug, 'name', v_org_name, 'state', v_org_state
    ),
    'caller', jsonb_build_object(
      'scope', v_caller_scope,
      'group_id', v_caller_group_id,
      'verification_status', v_verified,
      'can_publish', v_can_publish
    ),
    'session', CASE WHEN v_session_id IS NULL THEN NULL
                ELSE jsonb_build_object('id', v_session_id, 'label', v_session_label) END,
    'targets', v_targets
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_due_creation_context(UUID)
  TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 036 complete: get_due_creation_context column ref fixed.';
END $$;

COMMIT;
