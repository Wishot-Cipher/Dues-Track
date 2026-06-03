-- ============================================================
-- Migration 032: fanout_due_notifications() RPC
--
-- When an admin publishes a new payment_type, we need EVERY
-- targeted member to be notified. This RPC is the fan-out:
--
--   Input  : payment_type_id
--   Output : { ok, notified_count, target_count }
--   Effect : INSERTs one row into `notifications` per applicable
--            member (in-app notification — push/email handled
--            separately by the existing notificationService).
--
-- Targeting logic:
--   - Same organization_id as the payment type
--   - is_active = TRUE on the member
--   - If payment_type.group_id is set → only members in that group
--   - If payment_type.target_levels is non-empty → only matching levels
--   - Idempotent: skips members who already have a notification
--     for this payment_type (so re-running doesn't double-notify)
--
-- SECURITY DEFINER so the admin's session can fan out even though
-- their RLS scope wouldn't let them INSERT into other members'
-- notification rows directly.
-- ============================================================

BEGIN;

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
BEGIN
  -- Resolve the payment type
  SELECT * INTO v_pt
  FROM public.payment_types
  WHERE id = p_payment_type_id;

  IF v_pt IS NULL THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Payment type not found.');
  END IF;

  -- Format notification body
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
    CASE WHEN v_pt.deadline IS NOT NULL
         THEN ' — due ' || TO_CHAR(v_pt.deadline, 'Mon DD')
         ELSE '' END,
    CASE WHEN v_pt.is_mandatory THEN ' · Mandatory' ELSE ' · Optional' END
  );

  v_link := '/payment/' || v_pt.id;

  -- Count of targeted members (for the admin's "X members notified" toast)
  SELECT COUNT(*) INTO v_target_count
  FROM public.organization_members om
  WHERE om.organization_id = v_pt.organization_id
    AND COALESCE(om.is_active, TRUE) = TRUE
    AND (v_pt.group_id IS NULL OR om.group_id = v_pt.group_id)
    AND (
      v_pt.target_levels IS NULL
      OR array_length(v_pt.target_levels, 1) IS NULL
      OR om.level = ANY(v_pt.target_levels)
    );

  -- Insert one notification per targeted member, skipping any that
  -- already have a notification for this payment_type.
  WITH inserted AS (
    INSERT INTO public.notifications (
      organization_id, member_id, group_id,
      type, title, message, link,
      related_type, related_id
    )
    SELECT
      v_pt.organization_id,
      om.id,
      om.group_id,
      v_notify_type,
      v_title,
      v_message,
      v_link,
      'payment_type',
      v_pt.id
    FROM public.organization_members om
    WHERE om.organization_id = v_pt.organization_id
      AND COALESCE(om.is_active, TRUE) = TRUE
      AND (v_pt.group_id IS NULL OR om.group_id = v_pt.group_id)
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
    'ok',              TRUE,
    'notified_count',  v_notified_count,
    'target_count',    v_target_count,
    'payment_type_id', v_pt.id,
    'title',           v_pt.title
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('ok', FALSE, 'error', 'Notification fan-out failed: ' || SQLERRM);
END;
$$;

GRANT EXECUTE ON FUNCTION public.fanout_due_notifications(UUID) TO anon, authenticated;

DO $$
BEGIN
  RAISE NOTICE 'Migration 032 complete: fanout_due_notifications() ready.';
  RAISE NOTICE 'Call after every payment_types INSERT to notify members.';
END $$;

COMMIT;
