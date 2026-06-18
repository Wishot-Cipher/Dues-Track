-- ============================================================
-- Migration 133: fix permission flags missing from the
-- ON CONFLICT UPDATE branch of _finalize_claim_layer4
--
-- Root cause
-- ----------
-- Migs 061/097/132 all correctly set can_manage_expenses=TRUE (and
-- the other permission flags) on the INSERT branch. But the
-- ON CONFLICT (member_id, organization_id, group_id, role) DO UPDATE
-- branch only ever touched verification_status, verification_layer,
-- confirmed_by_admin_id, verified_at, is_active, role_label, and
-- can_manage_members. Every other permission flag — including
-- can_manage_expenses, can_create_payments, can_approve_payments,
-- can_manage_admins, can_view_analytics, can_export_data,
-- can_manage_settings — was left untouched on conflict.
--
-- This meant any member_admins row that already existed (created
-- earlier in the bootstrap path at Layer 2/3 with permissions
-- defaulted false, or re-confirmed via a second claim) NEVER got
-- promoted to the full permission set on Layer 4 finalization.
-- The row's verification_layer correctly jumped to 4, but the
-- permission columns stayed at whatever they were minted with —
-- which is why class reps, treasurers, and other execs could not
-- open /admin/expenses (or other permission-gated pages) despite
-- being shown as fully verified.
--
-- Fix
-- ---
-- Add the missing flags to the DO UPDATE SET list so a conflict
-- resolves to the SAME full permission set the fresh-insert path
-- grants. This is idempotent and safe to re-run.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._finalize_claim_layer4(
  p_claim_id           UUID,
  p_grant_method       TEXT,
  p_confirmer_admin_id UUID
)
RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_claim      RECORD;
  v_target_gid UUID;
  v_admin_id   UUID;
  v_can_manage_members BOOLEAN;
  v_sys_role   TEXT;
  v_label      TEXT;
  v_incumbent  UUID;
  v_sentinel   UUID := '00000000-0000-0000-0000-000000000000';
BEGIN
  SELECT * INTO v_claim FROM public.claim_requests WHERE id = p_claim_id;
  IF v_claim IS NULL THEN RETURN NULL; END IF;
  IF v_claim.status = 'approved' THEN RETURN v_claim.resulting_admin_id; END IF;

  v_target_gid := CASE v_claim.claimed_scope
    WHEN 'group' THEN v_claim.claimed_group_id
    WHEN 'unit'  THEN v_claim.claimed_unit_group_id
    ELSE NULL END;

  -- ── 1) SEAT-TAKEN GUARD (unchanged from mig 132) ────────────────
  SELECT cr.claimant_user_id INTO v_incumbent
  FROM public.claim_requests cr
  JOIN public.member_admins ma ON ma.id = cr.resulting_admin_id
  WHERE cr.organization_id   = v_claim.organization_id
    AND cr.status            = 'approved'
    AND cr.claimed_role      = v_claim.claimed_role
    AND cr.claimed_scope     = v_claim.claimed_scope
    AND cr.claimant_user_id <> v_claim.claimant_user_id
    AND ma.is_active         = TRUE
    AND ma.verification_layer >= 4
    AND COALESCE(
          CASE cr.claimed_scope WHEN 'group' THEN cr.claimed_group_id
                                WHEN 'unit'  THEN cr.claimed_unit_group_id
                                ELSE NULL END, v_sentinel
        ) = COALESCE(v_target_gid, v_sentinel)
  LIMIT 1;

  IF v_incumbent IS NOT NULL THEN
    UPDATE public.claim_requests
    SET status       = 'rejected',
        grant_method = 'seat_filled',
        resolved_at  = NOW(),
        updated_at   = NOW()
    WHERE id = p_claim_id;

    INSERT INTO public.notifications (
      organization_id, member_id, group_id, type, title, message, link, related_type, related_id
    ) VALUES (
      v_claim.organization_id, v_claim.claimant_user_id, v_target_gid,
      'claim_rejected', 'That seat is already filled',
      'Another member was verified as ' ||
        COALESCE(NULLIF(TRIM(v_claim.position_title), ''), v_claim.claimed_role) ||
        ' for this group first. If you believe you''re the real holder, ask them to hand over the role.',
      '/dashboard', 'claim_request', p_claim_id
    );

    RETURN NULL;
  END IF;

  -- Tier-aware members-management permission (kept from mig 095).
  v_can_manage_members := v_claim.claimed_scope IN ('group', 'org');

  -- Role mapping (kept from mig 061/097/132).
  v_sys_role := CASE
    WHEN v_claim.claimed_role IN (
      'super_admin','org_owner','org_admin','faculty_admin','group_admin',
      'treasurer','secretary','auditor','moderator','custom'
    ) THEN v_claim.claimed_role
    WHEN v_claim.claimed_scope = 'org'  THEN 'org_admin'
    WHEN v_claim.claimed_scope = 'unit' THEN 'faculty_admin'
    ELSE 'group_admin'
  END;
  v_label := COALESCE(NULLIF(TRIM(v_claim.position_title), ''), v_claim.claimed_role);

  INSERT INTO public.member_admins (
    member_id, organization_id, group_id,
    role, role_label, scope_level,
    can_create_payments, can_approve_payments, can_manage_members, can_manage_admins,
    can_manage_expenses, can_view_analytics, can_export_data, can_manage_settings,
    verification_status, verification_method, verified_at, verification_layer,
    confirmed_by_admin_id, is_active, tenure_start
  ) VALUES (
    v_claim.claimant_user_id, v_claim.organization_id, v_target_gid,
    v_sys_role, v_label, v_claim.claimed_scope,
    TRUE, TRUE, v_can_manage_members, TRUE, TRUE, TRUE, TRUE, TRUE,
    'admin_verified', 'admin', NOW(), 4,
    p_confirmer_admin_id, TRUE, CURRENT_DATE
  )
  -- FIX (mig 133): the ON CONFLICT branch was missing every
  -- permission flag except can_manage_members. Add them all so a
  -- conflicting row gets promoted to the SAME full permission set
  -- the fresh-insert path grants. This is the actual bug fix.
  ON CONFLICT (member_id, organization_id, group_id, role) DO UPDATE
    SET verification_status   = 'admin_verified',
        verification_layer    = GREATEST(member_admins.verification_layer, 4),
        confirmed_by_admin_id  = COALESCE(EXCLUDED.confirmed_by_admin_id, member_admins.confirmed_by_admin_id),
        verified_at           = NOW(),
        is_active             = TRUE,
        role_label            = COALESCE(NULLIF(EXCLUDED.role_label, ''), member_admins.role_label),
        can_manage_members    = v_can_manage_members,
        can_create_payments   = TRUE,
        can_approve_payments  = TRUE,
        can_manage_admins     = TRUE,
        can_manage_expenses   = TRUE,
        can_view_analytics    = TRUE,
        can_export_data       = TRUE,
        can_manage_settings   = TRUE,
        updated_at            = NOW()
  RETURNING id INTO v_admin_id;

  UPDATE public.claim_requests
  SET status             = 'approved',
      resulting_admin_id = v_admin_id,
      current_layer      = 4,
      grant_method       = p_grant_method,
      resolved_at        = NOW(),
      updated_at         = NOW()
  WHERE id = p_claim_id;

  UPDATE public.organizations
  SET org_state = 'active', orphaned_at = NULL, acting_started_at = NULL, acting_deadline_at = NULL, updated_at = NOW()
  WHERE id = v_claim.organization_id AND org_state IN ('acting','orphaned');

  INSERT INTO public.notifications (
    organization_id, member_id, group_id, type, title, message, link, related_type, related_id
  ) VALUES (
    v_claim.organization_id, v_claim.claimant_user_id, v_target_gid,
    'claim_approved', 'You''re verified',
    'Your role as ' || v_label || ' is now verified. You have full admin access — money is unlocked.',
    '/dashboard', 'claim_request', p_claim_id
  );

  -- ── 2) CLOSE THE LOSERS (unchanged from mig 132) ────────────────
  INSERT INTO public.notifications (
    organization_id, member_id, group_id, type, title, message, link, related_type, related_id
  )
  SELECT
    cr.organization_id, cr.claimant_user_id, v_target_gid,
    'claim_rejected', 'Another exec was verified',
    v_label || ' was verified for this group, so your competing claim was closed. ' ||
      'If you''re a different officer, claim your own position instead.',
    '/dashboard', 'claim_request', cr.id
  FROM public.claim_requests cr
  WHERE cr.organization_id  = v_claim.organization_id
    AND cr.id              <> p_claim_id
    AND cr.status IN ('submitted','awaiting_votes','email_sent','under_review')
    AND cr.claimed_role     = v_claim.claimed_role
    AND cr.claimed_scope    = v_claim.claimed_scope
    AND COALESCE(
          CASE cr.claimed_scope WHEN 'group' THEN cr.claimed_group_id
                                WHEN 'unit'  THEN cr.claimed_unit_group_id
                                ELSE NULL END, v_sentinel
        ) = COALESCE(v_target_gid, v_sentinel);

  UPDATE public.claim_requests cr
  SET status       = 'rejected',
      grant_method = 'seat_filled',
      resolved_at  = NOW(),
      updated_at   = NOW()
  WHERE cr.organization_id  = v_claim.organization_id
    AND cr.id              <> p_claim_id
    AND cr.status IN ('submitted','awaiting_votes','email_sent','under_review')
    AND cr.claimed_role     = v_claim.claimed_role
    AND cr.claimed_scope    = v_claim.claimed_scope
    AND COALESCE(
          CASE cr.claimed_scope WHEN 'group' THEN cr.claimed_group_id
                                WHEN 'unit'  THEN cr.claimed_unit_group_id
                                ELSE NULL END, v_sentinel
        ) = COALESCE(v_target_gid, v_sentinel);

  RETURN v_admin_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public._finalize_claim_layer4(UUID, TEXT, UUID) TO authenticated, service_role;

-- ── Backfill ─────────────────────────────────────────────────────
-- Repair every EXISTING row that was silently stuck with missing
-- permissions because of this bug. Scoped tightly: only rows that
-- are fully verified (layer >= 4) and active — i.e. rows that
-- SHOULD have full permissions per the finalize function's own
-- contract, but don't, because they went through the broken
-- ON CONFLICT path before this fix.
UPDATE public.member_admins
SET
  can_create_payments  = TRUE,
  can_approve_payments = TRUE,
  can_manage_admins    = TRUE,
  can_manage_expenses  = TRUE,
  can_view_analytics   = TRUE,
  can_export_data      = TRUE,
  can_manage_settings  = TRUE,
  can_manage_members   = (scope_level IN ('group', 'org')),
  updated_at           = NOW()
WHERE verification_layer >= 4
  AND is_active = TRUE
  AND (
    can_create_payments  IS DISTINCT FROM TRUE
    OR can_approve_payments IS DISTINCT FROM TRUE
    OR can_manage_admins    IS DISTINCT FROM TRUE
    OR can_manage_expenses  IS DISTINCT FROM TRUE
    OR can_view_analytics   IS DISTINCT FROM TRUE
    OR can_export_data      IS DISTINCT FROM TRUE
    OR can_manage_settings  IS DISTINCT FROM TRUE
    OR can_manage_members   IS DISTINCT FROM (scope_level IN ('group', 'org'))
  );

DO $$
BEGIN
  RAISE NOTICE
    'Migration 133 applied: _finalize_claim_layer4 ON CONFLICT branch now '
    'sets every permission flag, matching the INSERT branch. Existing '
    'Layer-4 active rows with stale/missing permissions have been backfilled.';
END $$;

COMMIT;