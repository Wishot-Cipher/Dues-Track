-- ============================================================
-- Migration 082: founder-anchored bootstrap invite
--
-- The growth problem (recap):
--   Under the opt-in claim model (mig 081), the founder of a class
--   does not auto-get an admin row. The existing createInvite() flow
--   requires an admin row, so the founder couldn't invite anyone —
--   no second member ever joined, the class stayed at 1, no one could
--   even vote the founder into a role (claim Path B needs 7–15 votes).
--
-- The safety problem with "let anyone invite":
--   In a class with no admin, the first joiner can recruit strangers,
--   strangers can recruit strangers, and there's no one with
--   authority to kick them. Trust degrades fast.
--
-- The compromise (founder-anchored bootstrap):
--   • Only the FOUNDER of a class (= organization_groups.founder_member_id)
--     can share an invite while the class has no verified exec.
--   • Founder gets 1 active invite at a time, up to 20 uses, expires
--     in 14 days. 20 is enough to hit a Path-B quorum with a buffer.
--   • The moment any member_admin with verification_layer >= 2 exists
--     for the group's organization, the bootstrap invite path stops
--     working. From then on, admins are the gatekeepers (existing
--     createInvite flow).
--   • Every active bootstrap invite is visible to all class members
--     and ALL admins of the org — full transparency is the defense.
--
-- Schema:
--   1. organization_groups.founder_member_id      (NEW — backfilled)
--   2. organization_invites.created_by_member_id  (NEW — member-side audit)
--   3. v_class_invite_activity                    (NEW — admin-visible feed)
--
-- RPC:
--   create_member_join_invite(p_caller_member_id, p_group_id)
--     returns jsonb { ok, code?, invite_code?, group_id?, expires_at?, max_uses? }
--     error codes:
--       not_a_member        — caller isn't a member of the target group
--       not_founder         — caller is a member but not the founder
--       group_invalid       — group_id doesn't exist
--       org_mismatch        — caller's org and group's org differ
--       admin_exists        — bootstrap is over; class has an exec.
--                              Tell the caller to ask their admin.
--       too_many_active     — founder already has 1 active code
--       unknown
-- ============================================================

BEGIN;

-- ── 1. Schema ────────────────────────────────────────────────

-- Track the founder explicitly so we can grant the bootstrap privilege
-- to a single identifiable person, not "whoever is oldest."
ALTER TABLE public.organization_groups
  ADD COLUMN IF NOT EXISTS founder_member_id UUID
    REFERENCES public.organization_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organization_groups_founder_member_idx
  ON public.organization_groups (founder_member_id);

-- Backfill: for any group without an explicit founder, take the
-- earliest-created member of that group. This is best-effort — if
-- the original founder has left, the next-oldest takes the hat. Org
-- admins can change this manually later via reparent_group.
WITH first_members AS (
  SELECT DISTINCT ON (om.group_id)
    om.group_id,
    om.id AS member_id
  FROM public.organization_members om
  WHERE om.group_id IS NOT NULL
  ORDER BY om.group_id, om.created_at ASC, om.id ASC
)
UPDATE public.organization_groups g
   SET founder_member_id = fm.member_id
  FROM first_members fm
 WHERE g.id = fm.group_id
   AND g.founder_member_id IS NULL;

-- Trigger: when a member is inserted into a class that has no
-- founder_member_id, claim them as the founder. This guarantees every
-- new class (post-082) has an identifiable founder without needing
-- to touch the bootstrap RPCs from 080/081.
CREATE OR REPLACE FUNCTION public._set_group_founder_on_first_member()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.group_id IS NOT NULL THEN
    UPDATE public.organization_groups
       SET founder_member_id = NEW.id
     WHERE id = NEW.group_id
       AND founder_member_id IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_group_founder_on_first_member ON public.organization_members;
CREATE TRIGGER trg_set_group_founder_on_first_member
  AFTER INSERT ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public._set_group_founder_on_first_member();

-- Parallel column on invites so audit/UI can show "Shared by Ada"
-- without relying on the admin-only `created_by`.
ALTER TABLE public.organization_invites
  ADD COLUMN IF NOT EXISTS created_by_member_id UUID
    REFERENCES public.organization_members(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS organization_invites_created_by_member_idx
  ON public.organization_invites (created_by_member_id);

-- ── 2. Activity view: admin-visible invite trail ──────────────
-- Every class admin (when one finally arrives) can scan this to see
-- the bootstrap chain: who invited whom, when, and via which code.
-- Drop first because column rename / signature drift would otherwise
-- block recreation in CREATE OR REPLACE.
DROP VIEW IF EXISTS public.v_class_invite_activity;
CREATE VIEW public.v_class_invite_activity AS
SELECT
  oi.id                    AS invite_id,
  oi.organization_id,
  oi.group_id,
  oi.invite_code,
  oi.created_at,
  oi.expires_at,
  oi.times_used,
  oi.max_uses,
  oi.is_active,
  oi.created_by_member_id  AS shared_by_member_id,
  sharer.full_name         AS shared_by_name,
  -- `member_id` on organization_members is the text login id
  -- (matric / staff ID), NOT the row's UUID primary key.
  sharer.member_id         AS shared_by_login_id
FROM public.organization_invites oi
LEFT JOIN public.organization_members sharer
  ON sharer.id = oi.created_by_member_id;

-- ── 3. Has-admin helper ─────────────────────────────────────
-- "Does the class's organization have at least one verified exec?"
-- We treat verification_layer >= 2 (acting admin or higher) as the
-- gate. Lower than that is a pending claim — bootstrap stays on.
CREATE OR REPLACE FUNCTION public._class_has_verified_admin(p_group_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org_id UUID;
  v_count  INT;
BEGIN
  SELECT organization_id INTO v_org_id
  FROM public.organization_groups WHERE id = p_group_id;

  IF v_org_id IS NULL THEN RETURN FALSE; END IF;

  SELECT COUNT(*) INTO v_count
  FROM public.member_admins ma
  JOIN public.organization_members om ON om.id = ma.member_id
  WHERE om.organization_id = v_org_id
    AND COALESCE(ma.verification_layer, 0) >= 2;

  RETURN v_count > 0;
END;
$$;

-- ── 4. Founder bootstrap RPC ──────────────────────────────────
CREATE OR REPLACE FUNCTION public.create_member_join_invite(
  p_caller_member_id UUID,
  p_group_id         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_caller_org    UUID;
  v_group_org     UUID;
  v_founder       UUID;
  v_code          TEXT;
  v_attempts      INT := 0;
  v_active_count  INT;
  v_invite_id     UUID;
  v_expires_at    TIMESTAMPTZ;
  -- Bootstrap parameters — fixed (not user-tunable) so the policy is
  -- the same for every class on the platform.
  k_max_uses      CONSTANT INT := 20;
  k_expires_days  CONSTANT INT := 14;
BEGIN
  -- Caller must be a real member of the target group, in the target org
  SELECT organization_id INTO v_caller_org
  FROM public.organization_members
  WHERE id = p_caller_member_id
    AND group_id = p_group_id;

  IF v_caller_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_a_member');
  END IF;

  -- Group exists, matches caller's org, and the founder is identifiable
  SELECT organization_id, founder_member_id INTO v_group_org, v_founder
  FROM public.organization_groups
  WHERE id = p_group_id;

  IF v_group_org IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'group_invalid');
  END IF;

  IF v_group_org <> v_caller_org THEN
    RETURN jsonb_build_object('ok', false, 'code', 'org_mismatch');
  END IF;

  -- Only the founder gets the bootstrap key
  IF v_founder IS NULL OR v_founder <> p_caller_member_id THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_founder');
  END IF;

  -- Once any verified exec exists for the org, bootstrap is over.
  IF public._class_has_verified_admin(p_group_id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'admin_exists');
  END IF;

  -- Cap: founder may have 1 active invite at a time
  SELECT COUNT(*) INTO v_active_count
  FROM public.organization_invites
  WHERE created_by_member_id = p_caller_member_id
    AND group_id = p_group_id
    AND is_active = true
    AND (expires_at IS NULL OR expires_at > now())
    AND times_used < max_uses;

  IF v_active_count >= 1 THEN
    RETURN jsonb_build_object('ok', false, 'code', 'too_many_active');
  END IF;

  -- Code generation w/ collision retry. We intentionally avoid the
  -- 0/O/1/I/L set so codes are easy to read aloud over a phone call.
  v_expires_at := now() + (k_expires_days || ' days')::INTERVAL;

  LOOP
    v_attempts := v_attempts + 1;
    v_code := upper(substring(
      translate(encode(gen_random_bytes(8), 'base64'),
                '+/=ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789',
                  'XX23456789ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789')
      from 1 for 8));

    BEGIN
      INSERT INTO public.organization_invites (
        organization_id,
        group_id,
        invite_type,
        invite_code,
        max_uses,
        times_used,
        expires_at,
        is_active,
        created_by,
        created_by_member_id
      )
      VALUES (
        v_caller_org,
        p_group_id,
        'member',
        v_code,
        k_max_uses,
        0,
        v_expires_at,
        true,
        NULL,
        p_caller_member_id
      )
      RETURNING id INTO v_invite_id;
      EXIT;
    EXCEPTION
      WHEN unique_violation THEN
        IF v_attempts >= 5 THEN RAISE; END IF;
    END;
  END LOOP;

  RETURN jsonb_build_object(
    'ok', true,
    'invite_code', v_code,
    'group_id', p_group_id,
    'expires_at', v_expires_at,
    'max_uses', k_max_uses
  );

EXCEPTION WHEN OTHERS THEN
  RETURN jsonb_build_object('ok', false, 'code', 'unknown', 'detail', SQLERRM);
END;
$$;

REVOKE ALL ON FUNCTION public.create_member_join_invite(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_member_join_invite(UUID, UUID) TO authenticated, anon;

-- ── 5. Founder-status helper for the UI ──────────────────────
-- The client can call this to know whether to render the share card,
-- the "ask your founder" hint, or the standard admin invite UI.
CREATE OR REPLACE FUNCTION public.get_class_invite_status(
  p_caller_member_id UUID,
  p_group_id         UUID
)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_founder         UUID;
  v_founder_name    TEXT;
  v_has_admin       BOOLEAN;
  v_caller_is_member BOOLEAN;
BEGIN
  SELECT founder_member_id INTO v_founder
  FROM public.organization_groups WHERE id = p_group_id;

  SELECT om.full_name INTO v_founder_name
  FROM public.organization_members om WHERE om.id = v_founder;

  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE id = p_caller_member_id AND group_id = p_group_id
  ) INTO v_caller_is_member;

  v_has_admin := public._class_has_verified_admin(p_group_id);

  RETURN jsonb_build_object(
    'is_member',     v_caller_is_member,
    'is_founder',    v_caller_is_member AND v_founder IS NOT NULL AND v_founder = p_caller_member_id,
    'has_admin',     v_has_admin,
    'founder_name',  v_founder_name,
    -- Convenience flag the UI can branch on:
    'can_share',     v_caller_is_member AND v_founder IS NOT NULL AND v_founder = p_caller_member_id AND NOT v_has_admin
  );
END;
$$;

REVOKE ALL ON FUNCTION public.get_class_invite_status(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_class_invite_status(UUID, UUID) TO authenticated, anon;

COMMIT;
