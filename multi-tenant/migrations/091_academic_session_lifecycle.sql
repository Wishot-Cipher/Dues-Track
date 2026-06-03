-- ============================================================
-- Migration 091: academic-session lifecycle for dept / faculty execs
--
-- Dept and faculty exec roles are NOT permanent — every academic
-- session a fresh election picks new execs. The platform shouldn't
-- silently let last year's exec keep publishing dues forever.
--
-- Model:
--
--   organizations
--     ├─ academic_session             TEXT     e.g. "2025/2026"
--     └─ academic_session_end_date    DATE     e.g. 2026-07-31
--
--   member_admins
--     ├─ academic_session             TEXT     the session this role belongs to
--     └─ tenure_expires_at            TIMESTAMPTZ  computed from the org's session end
--
--   archive_expired_unit_admins()     SQL function — sweeps tenure_expires_at < now()
--   for unit-scope (dept/faculty) admins and flips them to:
--       is_active=FALSE
--       verification_layer=0
--       verification_status='session_ended'
--   The user can re-claim for the new session via /claim.
--
-- Org-scope and group-scope (class rep) admins are NOT auto-archived
-- — the class rep is local enough to know their own term ended; the
-- org owner is rarely transient.
--
-- Trigger: when a NEW unit-scope admin row goes Layer-4 verified
-- (acting/peer/full), we stamp it with the org's current session +
-- expiry so the lifecycle is self-maintaining.
-- ============================================================

BEGIN;

-- ── 1. Schema ────────────────────────────────────────────────

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS academic_session          TEXT,
  ADD COLUMN IF NOT EXISTS academic_session_end_date DATE;

ALTER TABLE public.member_admins
  ADD COLUMN IF NOT EXISTS academic_session   TEXT,
  ADD COLUMN IF NOT EXISTS tenure_expires_at  TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS member_admins_tenure_expiry_idx
  ON public.member_admins (tenure_expires_at)
  WHERE tenure_expires_at IS NOT NULL AND is_active = TRUE;

-- ── 2. Stamper: when a new unit-scope admin row is inserted, copy
-- the org's current session + expiry onto it. Org-scope and group-
-- scope rows are left alone (they don't expire on session).
CREATE OR REPLACE FUNCTION public._stamp_unit_admin_session()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_session TEXT;
  v_end     DATE;
BEGIN
  IF NEW.scope_level <> 'unit' THEN RETURN NEW; END IF;
  IF NEW.academic_session IS NOT NULL AND NEW.tenure_expires_at IS NOT NULL THEN
    -- Caller pre-filled; trust them.
    RETURN NEW;
  END IF;

  SELECT academic_session, academic_session_end_date
    INTO v_session, v_end
  FROM public.organizations
  WHERE id = NEW.organization_id;

  IF v_session IS NOT NULL AND NEW.academic_session IS NULL THEN
    NEW.academic_session := v_session;
  END IF;
  IF v_end IS NOT NULL AND NEW.tenure_expires_at IS NULL THEN
    NEW.tenure_expires_at := (v_end::TIMESTAMPTZ + INTERVAL '1 day');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_stamp_unit_admin_session ON public.member_admins;
CREATE TRIGGER trg_stamp_unit_admin_session
  BEFORE INSERT ON public.member_admins
  FOR EACH ROW
  EXECUTE FUNCTION public._stamp_unit_admin_session();

-- ── 3. Sweeper: archive expired unit-scope admins. Idempotent and
-- safe to call from any cron / scheduler / RPC. Returns the count of
-- rows it archived so the caller can log it.
CREATE OR REPLACE FUNCTION public.archive_expired_unit_admins()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH expired AS (
    UPDATE public.member_admins
       SET is_active           = FALSE,
           verification_layer  = 0,
           verification_status = 'session_ended',
           updated_at          = NOW()
     WHERE scope_level         = 'unit'
       AND is_active           = TRUE
       AND tenure_expires_at IS NOT NULL
       AND tenure_expires_at   < NOW()
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM expired;

  RETURN COALESCE(v_count, 0);
END;
$$;

REVOKE ALL ON FUNCTION public.archive_expired_unit_admins() FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.archive_expired_unit_admins() TO authenticated;

-- ── 4. Convenience: an org owner can roll the session forward. Call
-- with the new session + end date; we stamp the org and (optionally)
-- sweep the now-expired previous-session admins in the same shot.
CREATE OR REPLACE FUNCTION public.roll_academic_session(
  p_org_id          UUID,
  p_session_label   TEXT,
  p_session_end     DATE,
  p_sweep_expired   BOOLEAN DEFAULT TRUE
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_archived INT := 0;
BEGIN
  UPDATE public.organizations
     SET academic_session          = p_session_label,
         academic_session_end_date = p_session_end,
         updated_at                = NOW()
   WHERE id = p_org_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', FALSE, 'code', 'org_not_found');
  END IF;

  IF p_sweep_expired THEN
    v_archived := public.archive_expired_unit_admins();
  END IF;

  RETURN jsonb_build_object(
    'ok',                TRUE,
    'organization_id',   p_org_id,
    'session',           p_session_label,
    'session_end',       p_session_end,
    'archived_count',    v_archived
  );
END;
$$;

REVOKE ALL ON FUNCTION public.roll_academic_session(UUID, TEXT, DATE, BOOLEAN) FROM PUBLIC;
GRANT  EXECUTE ON FUNCTION public.roll_academic_session(UUID, TEXT, DATE, BOOLEAN) TO authenticated;

COMMIT;
