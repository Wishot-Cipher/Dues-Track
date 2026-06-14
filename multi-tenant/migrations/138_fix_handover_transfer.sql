-- ============================================================
-- Migration 109: Fix exec handover — atomic transfer was silently
-- hitting 0 rows when outgoing_admin_id drifted from the member's
-- current active row, leaving both execs active simultaneously.
--
-- Root cause (mig 108 trigger):
--   The trigger deactivated by `id = v_h.outgoing_admin_id`.
--   That ID was captured at nominate_successor() time. If the
--   outgoing exec's member_admins row was replaced (re-verify,
--   layer bump, etc.) between nomination and approval, the WHERE
--   clause hits 0 rows silently — PostgreSQL does NOT raise an
--   error on UPDATE ... WHERE hitting no rows. Both exec rows
--   stay is_active=TRUE.
--
-- Fix:
--   1) Deactivate by (member_id + org + role + scope + group_id)
--      instead of by row ID — this finds the current active row
--      regardless of whether the row was recreated since nomination.
--   2) Add a RAISE EXCEPTION if 0 rows were deactivated so the
--      transfer failure is visible rather than silent.
--   3) Bump claim_banner_version on the org after a completed
--      handover so the UI re-shows the banner to relevant members.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.complete_handover_on_claim_approval()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_h        RECORD;
  v_rows_hit INT;
BEGIN
  -- Only act when a handover-linked claim flips to approved.
  IF NEW.status = 'approved'
     AND COALESCE(OLD.status, '') <> 'approved'
     AND NEW.handover_id IS NOT NULL
  THEN
    SELECT * INTO v_h FROM public.exec_handovers WHERE id = NEW.handover_id;

    IF v_h.id IS NOT NULL AND v_h.status = 'accepted' THEN

      -- ── Deactivate the outgoing exec's admin row ────────────────
      -- Match by (member_id + org + role + scope + group_id) rather
      -- than the stored row ID. This is robust to row replacement
      -- between nomination and approval — the original fix for the
      -- "two active execs" bug. We also guard is_active=TRUE so we
      -- never accidentally re-deactivate an already-ended row.
      UPDATE public.member_admins ma
      SET
        is_active    = FALSE,
        tenure_end   = CURRENT_DATE,
        updated_at   = NOW()
      FROM public.member_admins src
      WHERE src.id = v_h.outgoing_admin_id   -- anchor to the nominated row
        AND ma.member_id        = src.member_id
        AND ma.organization_id  = src.organization_id
        AND ma.role             = src.role
        AND ma.scope_level      = src.scope_level
        AND (
          -- group_id may be NULL for org-scope roles; treat NULL = NULL as equal
          (ma.group_id IS NULL AND src.group_id IS NULL)
          OR ma.group_id = src.group_id
        )
        AND ma.is_active = TRUE;  -- never touch already-deactivated rows

      GET DIAGNOSTICS v_rows_hit = ROW_COUNT;

      -- Surface the failure loudly rather than leaving dual execs.
      -- The claim approval is still committed; only the deactivation
      -- step failed, so we RAISE to roll back the whole transaction.
      IF v_rows_hit = 0 THEN
        RAISE EXCEPTION
          'Handover transfer failed: no active member_admins row found for '
          'outgoing exec (outgoing_admin_id=%, member_id=%). '
          'The claim has been approved but the role transfer did not complete. '
          'Manually deactivate the outgoing exec''s admin row.',
          v_h.outgoing_admin_id,
          v_h.outgoing_member_id;
      END IF;

      -- ── Complete the handover record ────────────────────────────
      UPDATE public.exec_handovers
      SET status = 'completed', resolved_at = NOW()
      WHERE id = v_h.id;

      -- ── Bump claim_banner_version ───────────────────────────────
      -- Invalidates every member's dismiss key so the banner
      -- re-appears org-wide after the role change. The versioned
      -- key in VerificationStatusBanner picks this up automatically.
      UPDATE public.organizations
      SET claim_banner_version = COALESCE(claim_banner_version, 0) + 1
      WHERE id = v_h.organization_id;

      -- ── Notify both parties ─────────────────────────────────────
      INSERT INTO public.notifications (
        organization_id, member_id, group_id,
        type, title, message, link, related_type, related_id
      )
      VALUES
        (
          v_h.organization_id, v_h.outgoing_member_id, v_h.group_id,
          'handover_completed',
          'Handover complete',
          'Your successor is verified. Your role has transferred and you''re '
          'now a regular member. Thank you for your service.',
          '/dashboard', 'exec_handover', v_h.id
        ),
        (
          v_h.organization_id, v_h.nominee_member_id, v_h.group_id,
          'handover_completed',
          'You''re now the exec',
          'Verification passed — the role is officially yours. '
          'Your dashboard now has exec access.',
          '/admin/dashboard', 'exec_handover', v_h.id
        );

    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Re-create the trigger (DROP IF EXISTS is idempotent).
DROP TRIGGER IF EXISTS trg_complete_handover ON public.claim_requests;
CREATE TRIGGER trg_complete_handover
  AFTER UPDATE OF status ON public.claim_requests
  FOR EACH ROW
  EXECUTE FUNCTION public.complete_handover_on_claim_approval();

-- Also ensure the column exists (safe if mig 009 already ran).
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS claim_banner_version INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  RAISE NOTICE
    'Migration 109 complete: handover transfer now deactivates by '
    'identity not row ID, raises on 0-row hit, and bumps '
    'claim_banner_version on completion.';
END $$;

COMMIT;