-- ============================================================
-- Migration 033: create_due_with_scope_check() RPC
--
-- Closes the scope-creep hole on due creation.
--
-- WITHOUT this RPC, the CreateDuePage just INSERTed straight into
-- payment_types using whatever group_id the client sent. A class
-- rep could craft an INSERT with group_id = NULL (= org-wide due)
-- and members of OTHER classes would see it. That's wrong:
--
--   group-scope admin → may only publish to their exact group
--   unit-scope admin  → may publish to their faculty OR any
--                       child group (class/department) under it
--   org-scope admin   → may publish org-wide, faculty-wide, or
--                       to any single group
--
-- This RPC enforces those rules on the server. The UI mirrors
-- them, but the RPC is the source of truth.
--
-- Also: this RPC calls fanout_due_notifications() at the end so
-- callers don't have to chain two RPC calls.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.create_due_with_scope_check(
  p_caller_member_id UUID,
  p_target_scope     TEXT,            -- 'org' | 'faculty' | 'group'
  p_target_group_id  UUID,            -- NULL when scope = 'org'; faculty id when 'faculty'; leaf id when 'group'
  p_payload          JSONB
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_id                UUID;
  v_caller_scope          TEXT;   -- 'org' | 'unit' | 'group'
  v_caller_group_id       UUID;
  v_caller_has_create     BOOLEAN := FALSE;
  v_target_kind           TEXT;
  v_target_parent_id      UUID;
  v_resolved_group_id     UUID;
  v_payment_type_id       UUID;
  v_fanout_result         JSONB;
BEGIN
  IF p_caller_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;
  IF p_target_scope NOT IN ('org','faculty','group') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid target scope.');
  END IF;

  -- ── Resolve the caller's organization + admin record ──
  SELECT organization_id INTO v_org_id
  FROM public.organization_members
  WHERE id = p_caller_member_id
    AND COALESCE(is_active, TRUE) = TRUE
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found or inactive.');
  END IF;

  -- Pick the caller's MOST PERMISSIVE active admin row in this org.
  -- Order: org > unit > group, then most recent.
  SELECT scope_level, group_id, COALESCE(can_create_payments, FALSE)
    INTO v_caller_scope, v_caller_group_id, v_caller_has_create
  FROM public.member_admins
  WHERE member_id = p_caller_member_id
    AND organization_id = v_org_id
    AND COALESCE(is_active, TRUE) = TRUE
  ORDER BY
    CASE scope_level
      WHEN 'org'   THEN 0
      WHEN 'unit'  THEN 1
      WHEN 'group' THEN 2
      ELSE                3
    END,
    created_at DESC
  LIMIT 1;

  IF v_caller_scope IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You are not an admin in this organization.');
  END IF;

  IF NOT v_caller_has_create THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Your role does not allow creating dues. Ask an org admin to grant `can_create_payments`.');
  END IF;

  -- ── Validate the target ──
  IF p_target_scope = 'org' THEN
    IF v_caller_scope <> 'org' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Only an org-wide admin can create org-wide dues. Yours is ' || v_caller_scope || '-scope.');
    END IF;
    v_resolved_group_id := NULL;

  ELSIF p_target_scope IN ('faculty','group') THEN
    IF p_target_group_id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Target group is required for this scope.');
    END IF;

    -- Resolve target group's kind + parent, and verify it's in the caller's org
    SELECT kind, parent_group_id
      INTO v_target_kind, v_target_parent_id
    FROM public.organization_groups
    WHERE id = p_target_group_id
      AND organization_id = v_org_id;

    IF v_target_kind IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Target group not found in your organization.');
    END IF;

    IF p_target_scope = 'faculty' AND v_target_kind <> 'faculty' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Faculty-scoped dues must point at a faculty group (kind=faculty).');
    END IF;

    -- Authorization
    IF v_caller_scope = 'org' THEN
      -- org admin can publish to any group in their org
      NULL;
    ELSIF v_caller_scope = 'unit' THEN
      -- unit admin can publish to their own faculty OR any leaf whose parent is their faculty
      IF p_target_group_id <> v_caller_group_id
         AND v_target_parent_id IS DISTINCT FROM v_caller_group_id THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'You can only publish dues to your faculty or classes inside it.');
      END IF;
    ELSE  -- group scope
      IF p_target_group_id <> v_caller_group_id THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'You can only publish dues to your own class. Ask your faculty admin for cross-class dues.');
      END IF;
    END IF;

    v_resolved_group_id := p_target_group_id;
  END IF;

  -- ── Insert the payment_type ──
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

DO $$
BEGIN
  RAISE NOTICE 'Migration 033 complete: create_due_with_scope_check() ready.';
  RAISE NOTICE 'CreateDuePage should now call this RPC instead of INSERTing directly.';
END $$;

COMMIT;
