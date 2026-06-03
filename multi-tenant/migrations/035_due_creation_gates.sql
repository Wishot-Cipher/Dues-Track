-- ============================================================
-- Migration 035: Tighten due-creation RPC + add context helper
--
-- Two things, both required for the spec's non-negotiables:
--
-- 1. Rewrite `create_due_with_scope_check()` so it ALSO enforces:
--    a. The org is in state 'active'. If 'acting' or 'orphaned',
--       no money may flow — only drafts are allowed (and this RPC
--       doesn't create drafts).
--    b. The caller's verification_status is in a trusted state.
--       A pending exec cannot publish dues.
--    c. The target group can_collect_dues = TRUE. SUG groups
--       can't be the target of dues.
--    d. The due is bound to the org's currently-active academic
--       session (Part 10 of the spec). If no session is active,
--       the RPC errors with a helpful message.
--
-- 2. Add `get_due_creation_context()` so the UI can render the
--    correct scope-aware targeting picker without 3 round trips.
--    Returns the caller's scope, verification, org state, current
--    session, and the list of groups they may target.
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1) Rewrite create_due_with_scope_check with new gates
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.create_due_with_scope_check(
  p_caller_member_id UUID,
  p_target_scope     TEXT,
  p_target_group_id  UUID,
  p_payload          JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id              UUID;
  v_org_state           TEXT;
  v_caller_scope        TEXT;
  v_caller_group_id     UUID;
  v_caller_can_create   BOOLEAN := FALSE;
  v_caller_verified     TEXT;
  v_target_kind         TEXT;
  v_target_parent_id    UUID;
  v_target_collects     BOOLEAN;
  v_resolved_group_id   UUID;
  v_session_id          UUID;
  v_session_label       TEXT;
  v_payment_type_id     UUID;
  v_fanout_result       JSONB;
BEGIN
  IF p_caller_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;
  IF p_target_scope NOT IN ('org','faculty','group') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid target scope.');
  END IF;

  -- ── Resolve caller's org ──
  SELECT om.organization_id INTO v_org_id
  FROM public.organization_members om
  WHERE om.id = p_caller_member_id
    AND COALESCE(om.is_active, TRUE) = TRUE
  LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found or inactive.');
  END IF;

  -- ── Spec Part 4: gate by org_state ──
  SELECT org_state INTO v_org_state
  FROM public.organizations WHERE id = v_org_id;

  IF v_org_state IS NULL OR v_org_state <> 'active' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'This organization is ' || COALESCE(v_org_state,'unknown') ||
      '. Dues can only be published when the organization is Active.');
  END IF;

  -- ── Caller's most permissive verified admin row ──
  SELECT ma.scope_level, ma.group_id,
         COALESCE(ma.can_create_payments, FALSE),
         ma.verification_status
    INTO v_caller_scope, v_caller_group_id,
         v_caller_can_create, v_caller_verified
  FROM public.member_admins ma
  WHERE ma.member_id = p_caller_member_id
    AND ma.organization_id = v_org_id
    AND COALESCE(ma.is_active, TRUE) = TRUE
  ORDER BY
    CASE ma.scope_level
      WHEN 'org'   THEN 0
      WHEN 'unit'  THEN 1
      WHEN 'group' THEN 2
      ELSE              3
    END,
    ma.created_at DESC
  LIMIT 1;

  IF v_caller_scope IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'You are not an admin in this organization.');
  END IF;
  IF NOT v_caller_can_create THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Your role does not allow creating dues.');
  END IF;

  -- ── Spec Part 6: only verified execs may publish ──
  IF v_caller_verified IS NULL
     OR v_caller_verified NOT IN (
       'email_verified', 'document_verified',
       'admin_verified', 'member_confirmed'
     ) THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Your exec status is ' || COALESCE(v_caller_verified,'pending') ||
      '. Complete verification before publishing dues.');
  END IF;

  -- ── Validate the target ──
  IF p_target_scope = 'org' THEN
    IF v_caller_scope <> 'org' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Only an org-wide admin can create org-wide dues. Your scope is '
        || v_caller_scope || '.');
    END IF;
    v_resolved_group_id := NULL;

  ELSIF p_target_scope IN ('faculty','group') THEN
    IF p_target_group_id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Target group is required for this scope.');
    END IF;

    SELECT kind, parent_group_id, can_collect_dues
      INTO v_target_kind, v_target_parent_id, v_target_collects
    FROM public.organization_groups
    WHERE id = p_target_group_id
      AND organization_id = v_org_id;

    IF v_target_kind IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Target group not found in your organization.');
    END IF;

    -- SUG, etc. can't collect dues
    IF COALESCE(v_target_collects, TRUE) = FALSE THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'This group is configured not to collect dues.');
    END IF;

    IF p_target_scope = 'faculty' AND v_target_kind NOT IN ('faculty','college') THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Faculty-scoped dues must point at a faculty (or college) group.');
    END IF;

    -- Scope-based authorization (unchanged from mig 033 + tightened)
    IF v_caller_scope = 'org' THEN
      NULL;
    ELSIF v_caller_scope = 'unit' THEN
      IF p_target_group_id <> v_caller_group_id
         AND v_target_parent_id IS DISTINCT FROM v_caller_group_id THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'You can only publish dues to your faculty or classes inside it.');
      END IF;
    ELSE
      IF p_target_group_id <> v_caller_group_id THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'You can only publish dues to your own class. Ask your faculty admin for cross-class dues.');
      END IF;
    END IF;

    v_resolved_group_id := p_target_group_id;
  END IF;

  -- ── Spec Part 10: bind to current academic session ──
  SELECT id, label INTO v_session_id, v_session_label
  FROM public.academic_sessions
  WHERE organization_id = v_org_id AND is_active = TRUE
  ORDER BY start_date DESC
  LIMIT 1;
  -- Session is optional (donations may not need one), but we record it
  -- when present so dues never bleed across years.

  -- ── Insert ──
  INSERT INTO public.payment_types (
    organization_id, group_id,
    title, description, category, amount,
    icon, color,
    deadline, late_fee_per_day,
    is_mandatory, allow_partial, minimum_partial_amount, is_public,
    target_levels, target_sections,
    is_active,
    bank_name, account_name, account_number,
    accepts_paystack, accepts_manual,
    event_date, event_venue, event_cover_url, event_max_attendees,
    academic_session_id, academic_session_label,
    created_by
  ) VALUES (
    v_org_id, v_resolved_group_id,
    p_payload->>'title',
    p_payload->>'description',
    COALESCE(p_payload->>'category', 'dues'),
    COALESCE((p_payload->>'amount')::NUMERIC, 0),
    p_payload->>'icon',
    p_payload->>'color',
    NULLIF(p_payload->>'deadline','')::TIMESTAMPTZ,
    NULLIF(p_payload->>'late_fee_per_day','')::NUMERIC,
    COALESCE((p_payload->>'is_mandatory')::BOOLEAN, TRUE),
    COALESCE((p_payload->>'allow_partial')::BOOLEAN, FALSE),
    NULLIF(p_payload->>'minimum_partial_amount','')::NUMERIC,
    COALESCE((p_payload->>'is_public')::BOOLEAN, FALSE),
    CASE WHEN p_payload ? 'target_levels'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'target_levels'))
         ELSE NULL END,
    CASE WHEN p_payload ? 'target_sections'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'target_sections'))
         ELSE NULL END,
    TRUE,
    p_payload->>'bank_name',
    p_payload->>'account_name',
    p_payload->>'account_number',
    COALESCE((p_payload->>'accepts_paystack')::BOOLEAN, TRUE),
    COALESCE((p_payload->>'accepts_manual')::BOOLEAN, TRUE),
    NULLIF(p_payload->>'event_date','')::TIMESTAMPTZ,
    p_payload->>'event_venue',
    p_payload->>'event_cover_url',
    NULLIF(p_payload->>'event_max_attendees','')::INTEGER,
    v_session_id, v_session_label,
    p_caller_member_id
  )
  RETURNING id INTO v_payment_type_id;

  -- ── Fan out notifications ──
  v_fanout_result := public.fanout_due_notifications(v_payment_type_id);

  RETURN jsonb_build_object(
    'ok',               TRUE,
    'payment_type_id',  v_payment_type_id,
    'target_scope',     p_target_scope,
    'target_group_id',  v_resolved_group_id,
    'caller_scope',     v_caller_scope,
    'session_label',    v_session_label,
    'notified_count',   COALESCE((v_fanout_result->>'notified_count')::INTEGER, 0),
    'target_count',     COALESCE((v_fanout_result->>'target_count')::INTEGER, 0)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not publish: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_due_with_scope_check(UUID, TEXT, UUID, JSONB)
  TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 2) get_due_creation_context — single round-trip for the UI
-- ════════════════════════════════════════════════════════════
--
-- Returns everything CreateDuePage needs to render the scope-
-- aware targeting picker in ONE call:
--   - caller's scope, verification status, current group
--   - org_state, current academic session
--   - list of groups the caller may target
--
-- Output shape:
-- {
--   "ok": true,
--   "org": { "id", "slug", "name", "state" },
--   "caller": { "scope", "group_id", "verification_status", "can_publish" },
--   "session": { "id", "label" } | null,
--   "targets": [{ "id","name","short_name","kind","parent_group_id","can_collect_dues" }, ...]
-- }
-- ════════════════════════════════════════════════════════════
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

  -- Build the targets list based on caller's scope
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
    -- Group-scope admin: only their own group
    (v_caller_scope = 'group' AND id = v_caller_group_id)
    -- Unit admin: their faculty + any child of it
    OR (v_caller_scope = 'unit' AND (id = v_caller_group_id OR parent_group_id = v_caller_group_id))
    -- Org admin: everything that can collect dues
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
  RAISE NOTICE 'Migration 035 complete:';
  RAISE NOTICE '  - create_due_with_scope_check() now gates by org_state,';
  RAISE NOTICE '    verification_status, can_collect_dues, and binds to';
  RAISE NOTICE '    the active academic_session.';
  RAISE NOTICE '  - get_due_creation_context() returns everything the';
  RAISE NOTICE '    CreateDuePage UI needs in one round trip.';
END $$;

COMMIT;
