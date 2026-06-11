-- ============================================================
-- Migration 132: one verified holder per seat — resolve contested claims
-- cleanly instead of letting two people both end up verified.
--
-- The problem (user): "clashing roles aren't cleanly solved — two of the
-- same role in one tier, nope." Today the claim system DELIBERATELY lets
-- several people claim the same seat (contested → the class votes up the
-- real exec; that's a wanted feature). But nothing closed the loop: if
-- two contested claims each crossed the vote threshold, BOTH got
-- finalized into member_admins, so a tier ended up with two verified
-- Class Reps / Presidents — both able to collect, approve and waive.
--
-- The fix (in the single grant path, _finalize_claim_layer4):
--   1. SEAT-TAKEN GUARD — before granting, if another member is already
--      the active, verified holder of this exact seat (same claimed_role
--      at the same tier), do NOT grant a second one. Reject this claim
--      with a clear reason and tell the claimant to request a handover.
--   2. CLOSE THE LOSERS — after a grant succeeds, reject every OTHER
--      still-pending claim for the same seat (the contest is decided) and
--      notify those claimants.
--
-- This keeps contestation intact (many may claim, the vote decides) while
-- guaranteeing exactly one verified holder per seat. Legitimate handovers
-- still flow through the handover RPC (mig 108), which deactivates the
-- outgoing holder first, so the seat reads as empty for the successor.
--
-- "Same seat" = (organization_id, claimed_role, claimed_scope, target
-- group). Using claimed_role (not the mapped system role) avoids false
-- clashes — e.g. a President and a Vice-President both map to 'org_admin'
-- but are different seats, and the existing contestation detection keys
-- off claimed_role too, so this stays consistent.
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

  -- ── 1) SEAT-TAKEN GUARD ──────────────────────────────────────────
  -- Is another member already the ACTIVE, verified holder of this exact
  -- seat? If so, don't mint a second one — reject this claim and point
  -- the claimant at a handover.
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

  -- Role mapping (restored from mig 061). Map the claim's human title to
  -- a SYSTEM role that satisfies member_admins_role_check; keep the human
  -- title in role_label.
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
  ON CONFLICT (member_id, organization_id, group_id, role) DO UPDATE
    SET verification_status   = 'admin_verified',
        verification_layer    = GREATEST(member_admins.verification_layer, 4),
        confirmed_by_admin_id  = COALESCE(EXCLUDED.confirmed_by_admin_id, member_admins.confirmed_by_admin_id),
        verified_at           = NOW(),
        is_active             = TRUE,
        role_label            = COALESCE(NULLIF(EXCLUDED.role_label, ''), member_admins.role_label),
        can_manage_members    = v_can_manage_members,
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

  -- ── 2) CLOSE THE LOSERS ──────────────────────────────────────────
  -- The contest for this seat is decided. Reject every OTHER still-open
  -- claim for the same seat and tell those claimants.
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

DO $$
BEGIN
  RAISE NOTICE 'Migration 132 applied: one verified holder per seat. Contested claims still vote it out; the winner''s grant closes the losers; a second grant on a filled seat is refused.';
END $$;

COMMIT;
