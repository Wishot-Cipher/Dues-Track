-- ============================================================
-- Migration 124: set_group_set_fields() — persist a class's Model-B set
-- identity (entry_year / current_level / course_duration) right after it
-- is bootstrapped.
--
-- Why an RPC: at the moment the founder creates a class via the
-- add-class flow they aren't logged in yet (no JWT), so a direct
-- organization_groups UPDATE would be denied by RLS. This SECURITY
-- DEFINER RPC sets the fields server-side, gated to someone who is
-- actually a member of that group (the founder, who was just placed in
-- it) or an exec who can manage its level.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.set_group_set_fields(
  p_group_id        UUID,
  p_caller_member_id UUID,
  p_entry_year      INTEGER DEFAULT NULL,
  p_current_level   TEXT    DEFAULT NULL,
  p_course_duration INTEGER DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_ok BOOLEAN;
  v_level TEXT := NULLIF(TRIM(COALESCE(p_current_level, '')), '');
BEGIN
  IF p_group_id IS NULL OR p_caller_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Missing group or caller.');
  END IF;

  -- Caller must be a member of this group (the founder just placed here)
  -- OR an exec entitled to manage its level.
  v_ok := EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE id = p_caller_member_id AND group_id = p_group_id
  ) OR public.can_manage_group_level(p_caller_member_id, p_group_id);

  IF NOT v_ok THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not allowed to set this group''s details.');
  END IF;

  UPDATE public.organization_groups
  SET entry_year      = COALESCE(p_entry_year, entry_year),
      current_level   = COALESCE(v_level, current_level),
      levels          = CASE WHEN v_level IS NOT NULL THEN ARRAY[v_level] ELSE levels END,
      course_duration = COALESCE(p_course_duration, course_duration),
      graduation_year = CASE
        WHEN COALESCE(p_entry_year, entry_year) IS NOT NULL
         AND COALESCE(p_course_duration, course_duration) IS NOT NULL
        THEN COALESCE(p_entry_year, entry_year) + COALESCE(p_course_duration, course_duration)
        ELSE graduation_year END,
      updated_at = NOW()
  WHERE id = p_group_id;

  RETURN jsonb_build_object('ok', TRUE);
END;
$$;
GRANT EXECUTE ON FUNCTION public.set_group_set_fields(UUID, UUID, INTEGER, TEXT, INTEGER)
  TO anon, authenticated, service_role;

DO $$ BEGIN RAISE NOTICE 'Migration 124 applied: set_group_set_fields() ready (persist class set identity post-bootstrap).'; END $$;

COMMIT;
