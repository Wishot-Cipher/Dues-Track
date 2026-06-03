-- ============================================================
-- Migration 075: Department-scoped dues + cascade fan-out + console power-ups
--
-- Fixes reported in testing:
--
--  1. "action must point to a faculty" — a DEPARTMENT president (scope 'unit',
--     group kind 'department') was forced into faculty targeting, but the RPC
--     only accepted kind IN ('faculty','college'). Now department/unit parents
--     are valid faculty-scope targets.
--
--  2. "could not publish: cannot extract" — when the form sends
--     target_levels:null / target_sections:null, `p_payload ? 'key'` is TRUE
--     (the key exists with a JSON null), so jsonb_array_elements_text() ran on
--     a JSON scalar and threw "cannot extract elements from a scalar". Guards
--     now require jsonb_typeof(...) = 'array'.
--
--  3. A due placed on a parent unit (department/faculty) must bill EVERY member
--     in the classes below it. fanout + the new get_my_billing_group_ids() walk
--     the group tree so a parent-scoped due cascades to all descendants.
--
--  4. Console: reject a claim (verification queue), revoke/suspend an admin
--     role, list an org's admins. Plus ensure active super admins keep full
--     operator powers (the operator must control everything).
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- 1) create_due_with_scope_check — department targets + null-array guards
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
  v_org_type            TEXT;
  v_category            TEXT;
  v_is_event            BOOLEAN;
  v_caller_scope        TEXT;
  v_caller_group_id     UUID;
  v_caller_can_create   BOOLEAN := FALSE;
  v_caller_layer        INTEGER := 0;
  v_target_kind         TEXT;
  v_target_parent_id    UUID;
  v_target_collects     BOOLEAN;
  v_resolved_group_id   UUID;
  v_session_id          UUID;
  v_session_label       TEXT;
  v_payment_type_id     UUID;
  v_fanout_result       JSONB;
  v_tier_count          INTEGER := 0;
BEGIN
  IF p_caller_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;
  IF p_target_scope NOT IN ('org','faculty','group') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Invalid target scope.');
  END IF;

  v_category := COALESCE(p_payload->>'category', 'dues');
  v_is_event := (v_category = 'event');

  SELECT om.organization_id INTO v_org_id
  FROM public.organization_members om
  WHERE om.id = p_caller_member_id AND COALESCE(om.is_active, TRUE) = TRUE
  LIMIT 1;
  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Member not found or inactive.');
  END IF;

  SELECT org_state, organization_type INTO v_org_state, v_org_type
  FROM public.organizations WHERE id = v_org_id;

  IF v_org_state IS NULL OR v_org_state <> 'active' THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'This organization is ' || COALESCE(v_org_state,'unknown') ||
      '. You can only publish when the organization is Active.');
  END IF;

  SELECT ma.scope_level, ma.group_id,
         COALESCE(ma.can_create_payments, FALSE),
         COALESCE(ma.verification_layer, 0)
    INTO v_caller_scope, v_caller_group_id, v_caller_can_create, v_caller_layer
  FROM public.member_admins ma
  WHERE ma.member_id = p_caller_member_id
    AND ma.organization_id = v_org_id
    AND COALESCE(ma.is_active, TRUE) = TRUE
  ORDER BY CASE ma.scope_level WHEN 'org' THEN 0 WHEN 'unit' THEN 1 WHEN 'group' THEN 2 ELSE 3 END,
           ma.created_at DESC
  LIMIT 1;

  IF v_caller_scope IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'You are not an admin in this organization.');
  END IF;
  IF NOT v_caller_can_create THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Your role does not allow creating dues or events.');
  END IF;

  IF v_caller_layer < 4 THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'Full verification (Layer 4) is required before publishing — money-collecting dues and event tickets unlock then. You are currently acting (Layer ' || v_caller_layer || ').');
  END IF;

  IF NOT v_is_event
     AND v_caller_scope = 'org'
     AND COALESCE(v_org_type,'') IN ('university','polytechnic','college','school') THEN
    RETURN jsonb_build_object('ok', FALSE, 'error',
      'As an SUG/university-wide exec you can create events, but university-wide dues are collected by the bursar, not on Payvexo.');
  END IF;

  IF p_target_scope = 'org' THEN
    IF v_caller_scope <> 'org' THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'Only an org-wide exec can target the whole organization. Your scope is ' || v_caller_scope || '.');
    END IF;
    v_resolved_group_id := NULL;

  ELSIF p_target_scope IN ('faculty','group') THEN
    IF p_target_group_id IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Target group is required for this scope.');
    END IF;

    SELECT kind, parent_group_id, can_collect_dues
      INTO v_target_kind, v_target_parent_id, v_target_collects
    FROM public.organization_groups
    WHERE id = p_target_group_id AND organization_id = v_org_id;

    IF v_target_kind IS NULL THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'Target group not found in your organization.');
    END IF;

    IF NOT v_is_event AND COALESCE(v_target_collects, TRUE) = FALSE THEN
      RETURN jsonb_build_object('ok', FALSE, 'error', 'This group is configured not to collect dues.');
    END IF;

    -- "Faculty scope" really means a PARENT unit and everything under it.
    -- Accept faculties, colleges, and departments (a dept president billing
    -- all classes below them).
    IF p_target_scope = 'faculty' AND v_target_kind NOT IN ('faculty','college','department','unit') THEN
      RETURN jsonb_build_object('ok', FALSE, 'error',
        'A whole-unit item must point at a faculty, college or department group.');
    END IF;

    IF v_caller_scope = 'org' THEN
      NULL;
    ELSIF v_caller_scope = 'unit' THEN
      IF p_target_group_id <> v_caller_group_id
         AND v_target_parent_id IS DISTINCT FROM v_caller_group_id THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'You can only publish to your unit or the classes inside it.');
      END IF;
    ELSE
      IF p_target_group_id <> v_caller_group_id THEN
        RETURN jsonb_build_object('ok', FALSE, 'error',
          'You can only publish to your own class. Ask your faculty/department exec for cross-class items.');
      END IF;
    END IF;

    v_resolved_group_id := p_target_group_id;
  END IF;

  SELECT id, label INTO v_session_id, v_session_label
  FROM public.academic_sessions
  WHERE organization_id = v_org_id AND is_active = TRUE
  ORDER BY start_date DESC LIMIT 1;

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
    v_category,
    COALESCE((p_payload->>'amount')::NUMERIC, 0),
    p_payload->>'icon',
    p_payload->>'color',
    NULLIF(p_payload->>'deadline','')::TIMESTAMPTZ,
    NULLIF(p_payload->>'late_fee_per_day','')::NUMERIC,
    CASE WHEN v_is_event THEN FALSE ELSE COALESCE((p_payload->>'is_mandatory')::BOOLEAN, TRUE) END,
    COALESCE((p_payload->>'allow_partial')::BOOLEAN, FALSE),
    NULLIF(p_payload->>'minimum_partial_amount','')::NUMERIC,
    COALESCE((p_payload->>'is_public')::BOOLEAN, FALSE),
    -- Guard: only treat as an array when it actually IS a JSON array. A JSON
    -- null (key present, value null) would otherwise crash jsonb_array_elements.
    CASE WHEN jsonb_typeof(p_payload->'target_levels') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'target_levels')) ELSE NULL END,
    CASE WHEN jsonb_typeof(p_payload->'target_sections') = 'array'
         THEN ARRAY(SELECT jsonb_array_elements_text(p_payload->'target_sections')) ELSE NULL END,
    TRUE,
    p_payload->>'bank_name',
    p_payload->>'account_name',
    p_payload->>'account_number',
    COALESCE((p_payload->>'accepts_paystack')::BOOLEAN, TRUE),
    COALESCE((p_payload->>'accepts_manual')::BOOLEAN, NOT v_is_event),
    NULLIF(p_payload->>'event_date','')::TIMESTAMPTZ,
    p_payload->>'event_venue',
    p_payload->>'event_cover_url',
    NULLIF(p_payload->>'event_max_attendees','')::INTEGER,
    v_session_id, v_session_label,
    p_caller_member_id
  )
  RETURNING id INTO v_payment_type_id;

  IF v_is_event AND jsonb_typeof(p_payload->'tiers') = 'array' THEN
    INSERT INTO public.event_ticket_tiers (
      payment_type_id, organization_id, name, description, price, quantity, sort_order
    )
    SELECT
      v_payment_type_id, v_org_id,
      COALESCE(NULLIF(t->>'name',''), 'Ticket'),
      NULLIF(t->>'description',''),
      COALESCE((t->>'price')::NUMERIC, 0),
      NULLIF(t->>'quantity','')::INTEGER,
      (ord - 1)::INTEGER
    FROM jsonb_array_elements(p_payload->'tiers') WITH ORDINALITY AS arr(t, ord)
    WHERE COALESCE(NULLIF(t->>'name',''), '') <> '' OR (t->>'price') IS NOT NULL;
    GET DIAGNOSTICS v_tier_count = ROW_COUNT;
  END IF;

  v_fanout_result := public.fanout_due_notifications(v_payment_type_id);

  RETURN jsonb_build_object(
    'ok',              TRUE,
    'payment_type_id', v_payment_type_id,
    'category',        v_category,
    'target_scope',    p_target_scope,
    'target_group_id', v_resolved_group_id,
    'caller_scope',    v_caller_scope,
    'session_label',   v_session_label,
    'tier_count',      v_tier_count,
    'notified_count',  COALESCE((v_fanout_result->>'notified_count')::INTEGER, 0),
    'target_count',    COALESCE((v_fanout_result->>'target_count')::INTEGER, 0)
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Could not publish: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_due_with_scope_check(UUID, TEXT, UUID, JSONB)
  TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 2) fanout_due_notifications — cascade a parent-unit due to descendants
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.fanout_due_notifications(
  p_payment_type_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_pt              RECORD;
  v_title           TEXT;
  v_message         TEXT;
  v_link            TEXT;
  v_notify_type     TEXT;
  v_notified_count  INTEGER := 0;
  v_target_count    INTEGER := 0;
  v_group_ids       UUID[];
BEGIN
  SELECT * INTO v_pt FROM public.payment_types WHERE id = p_payment_type_id;
  IF v_pt IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Payment type not found.');
  END IF;

  -- Resolve the set of groups this due applies to: the target group + every
  -- descendant in the org's group tree. NULL group_id = whole org (no filter).
  IF v_pt.group_id IS NOT NULL THEN
    WITH RECURSIVE tree AS (
      SELECT id FROM public.organization_groups WHERE id = v_pt.group_id
      UNION ALL
      SELECT g.id FROM public.organization_groups g
      JOIN tree ON g.parent_group_id = tree.id
    )
    SELECT array_agg(id) INTO v_group_ids FROM tree;
  END IF;

  v_notify_type := CASE
    WHEN v_pt.category = 'event' THEN 'event_published'
    WHEN v_pt.is_mandatory       THEN 'due_mandatory_published'
    ELSE                              'due_optional_published'
  END;
  v_title := CASE
    WHEN v_pt.category = 'event' THEN 'New event ticket: ' || v_pt.title
    WHEN v_pt.is_mandatory       THEN 'New due: ' || v_pt.title
    ELSE                              'Optional payment: ' || v_pt.title
  END;
  v_message := CONCAT(
    '₦', TO_CHAR(v_pt.amount, 'FM999,999,999'),
    CASE WHEN v_pt.deadline IS NOT NULL THEN ' — due ' || TO_CHAR(v_pt.deadline, 'Mon DD') ELSE '' END,
    CASE WHEN v_pt.is_mandatory THEN ' · Mandatory' ELSE ' · Optional' END
  );
  v_link := '/payment/' || v_pt.id;

  SELECT COUNT(*) INTO v_target_count
  FROM public.organization_members om
  WHERE om.organization_id = v_pt.organization_id
    AND COALESCE(om.is_active, TRUE) = TRUE
    AND (v_group_ids IS NULL OR om.group_id = ANY(v_group_ids))
    AND (
      v_pt.target_levels IS NULL
      OR array_length(v_pt.target_levels, 1) IS NULL
      OR om.level = ANY(v_pt.target_levels)
    );

  WITH inserted AS (
    INSERT INTO public.notifications (
      organization_id, member_id, group_id,
      type, title, message, link, related_type, related_id
    )
    SELECT
      v_pt.organization_id, om.id, om.group_id,
      v_notify_type, v_title, v_message, v_link, 'payment_type', v_pt.id
    FROM public.organization_members om
    WHERE om.organization_id = v_pt.organization_id
      AND COALESCE(om.is_active, TRUE) = TRUE
      AND (v_group_ids IS NULL OR om.group_id = ANY(v_group_ids))
      AND (
        v_pt.target_levels IS NULL
        OR array_length(v_pt.target_levels, 1) IS NULL
        OR om.level = ANY(v_pt.target_levels)
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.notifications n
        WHERE n.member_id = om.id
          AND n.related_type = 'payment_type'
          AND n.related_id = v_pt.id
      )
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_notified_count FROM inserted;

  RETURN jsonb_build_object(
    'ok', TRUE, 'notified_count', v_notified_count,
    'target_count', v_target_count, 'payment_type_id', v_pt.id, 'title', v_pt.title
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Notification fan-out failed: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fanout_due_notifications(UUID) TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- 3) get_my_billing_group_ids — member's groups + all their ancestors
--    A due on an ANCESTOR group applies to the member, so the client matches
--    a payment_type when pt.group_id ∈ this set (or pt.group_id IS NULL).
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.get_my_billing_group_ids(p_member_id UUID)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_ids UUID[];
BEGIN
  IF p_member_id IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Sign in required.');
  END IF;

  WITH RECURSIVE seeds AS (
    -- the member's active group memberships ...
    SELECT gm.group_id AS id
    FROM public.group_memberships gm
    WHERE gm.member_id = p_member_id AND gm.status = 'active'
    UNION
    -- ... plus their primary group on organization_members (belt and braces)
    SELECT om.group_id AS id
    FROM public.organization_members om
    WHERE om.id = p_member_id AND om.group_id IS NOT NULL
  ),
  tree AS (
    SELECT s.id FROM seeds s
    UNION
    SELECT g.parent_group_id
    FROM public.organization_groups g
    JOIN tree ON g.id = tree.id
    WHERE g.parent_group_id IS NOT NULL
  )
  SELECT array_agg(DISTINCT id) INTO v_ids FROM tree WHERE id IS NOT NULL;

  RETURN jsonb_build_object('ok', TRUE, 'group_ids', COALESCE(to_jsonb(v_ids), '[]'::jsonb));
END; $$;
GRANT EXECUTE ON FUNCTION public.get_my_billing_group_ids(UUID) TO anon, authenticated, service_role;

-- ════════════════════════════════════════════════════════════
-- 4) Console: reject a claim, manage org admins, keep operators powerful
-- ════════════════════════════════════════════════════════════

-- Reject / dismiss an in-flight exec claim (verification queue extra action).
CREATE OR REPLACE FUNCTION public.platform_reject_claim(
  p_session_token UUID, p_claim_id UUID, p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_admin public.super_admins;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_manage_organizations THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  UPDATE public.claim_requests
  SET status = 'rejected', updated_at = NOW()
  WHERE id = p_claim_id AND status NOT IN ('approved','rejected');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Claim not found or already resolved.');
  END IF;

  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (v_admin.id, v_admin.email, 'reject_claim', 'claim_request', p_claim_id,
          jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('ok', TRUE);
END; $$;
REVOKE ALL ON FUNCTION public.platform_reject_claim(UUID, UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_reject_claim(UUID, UUID, TEXT) TO authenticated;

-- List an organization's admins (for the revoke UI).
CREATE OR REPLACE FUNCTION public.platform_list_org_admins(
  p_session_token UUID, p_org_id UUID
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_admin public.super_admins; v_rows jsonb;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_view_all_data THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(t) ORDER BY t.scope_level, t.full_name), '[]'::jsonb) INTO v_rows
  FROM (
    SELECT ma.id AS admin_id, ma.member_id, ma.scope_level, ma.role, ma.role_label,
           ma.is_active, ma.verification_layer, ma.verification_status,
           m.full_name, m.email, m.member_id AS human_id,
           g.name AS group_name
    FROM public.member_admins ma
    JOIN public.organization_members m ON m.id = ma.member_id
    LEFT JOIN public.organization_groups g ON g.id = ma.group_id
    WHERE ma.organization_id = p_org_id
  ) t;

  RETURN jsonb_build_object('ok', TRUE, 'admins', v_rows);
END; $$;
REVOKE ALL ON FUNCTION public.platform_list_org_admins(UUID, UUID) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_list_org_admins(UUID, UUID) TO authenticated;

-- Revoke / restore an admin role (suspicious exec).
CREATE OR REPLACE FUNCTION public.platform_set_admin_active(
  p_session_token UUID, p_admin_id UUID, p_active BOOLEAN, p_reason TEXT
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE v_admin public.super_admins;
BEGIN
  v_admin := public._sa_resolve_token(p_session_token);
  IF v_admin.id IS NULL OR NOT v_admin.can_manage_organizations THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Not authorized.');
  END IF;

  UPDATE public.member_admins
  SET is_active = p_active, updated_at = NOW()
  WHERE id = p_admin_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('ok', FALSE, 'error', 'Admin role not found.'); END IF;

  INSERT INTO public.platform_audit_log (admin_id, admin_email, action, target_type, target_id, payload)
  VALUES (v_admin.id, v_admin.email, CASE WHEN p_active THEN 'restore_admin' ELSE 'revoke_admin' END,
          'member_admin', p_admin_id, jsonb_build_object('reason', p_reason));

  RETURN jsonb_build_object('ok', TRUE);
END; $$;
REVOKE ALL ON FUNCTION public.platform_set_admin_active(UUID, UUID, BOOLEAN, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.platform_set_admin_active(UUID, UUID, BOOLEAN, TEXT) TO authenticated;

-- The platform operator must be able to control everything: ensure every
-- active super admin keeps full powers.
UPDATE public.super_admins
SET can_manage_organizations   = TRUE,
    can_manage_subscriptions   = TRUE,
    can_view_all_data          = TRUE,
    can_manage_platform_admins = TRUE
WHERE is_active = TRUE;

DO $$
BEGIN
  RAISE NOTICE 'Migration 075 complete: dept-scoped dues + cascade fan-out + console actions.';
END $$;

COMMIT;
