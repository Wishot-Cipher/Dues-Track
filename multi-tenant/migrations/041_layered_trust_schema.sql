-- ============================================================
-- Migration 041: Layered trust schema + membership-rule enforcement
--
-- Implements Phase A of Blueprint §13.11. Adds the fields and
-- safety nets that the verification v2 RPCs (Phase B) will lean on.
--
-- Idempotent. Existing rows are backfilled with sensible defaults
-- derived from their current verification_status (see §13.2 layers).
--
-- Adds:
--   member_admins.verification_layer       INTEGER 0..5
--   member_admins.confirmed_by_admin_id    UUID    (the Layer-4 confirmer)
--   claim_requests.bootstrap_path          BOOLEAN
--   claim_requests.required_layer          INTEGER
--   claim_requests.current_layer           INTEGER
--   claim_rejections                       TABLE   (90-day cooldown)
--
-- Functions:
--   compute_trust_layer(claim_id)          → INTEGER 0..5
--   enforce_membership_rules()             → trigger function
--   trg_member_admins_membership_check     → trigger on member_admins
--
-- Hard rules enforced by the trigger (§13.4):
--   Class exec      → caller is a member of THAT class
--   Department exec → caller is in a class whose parent is the dept
--   Faculty exec    → caller is in a class whose grandparent is the faculty
--   SUG exec        → caller is a member of the org
-- ============================================================

BEGIN;

-- ════════════════════════════════════════════════════════════
-- PART 1 — Extend member_admins
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.member_admins
  ADD COLUMN IF NOT EXISTS verification_layer INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS confirmed_by_admin_id UUID REFERENCES public.member_admins(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='member_admins'
      AND constraint_name='chk_member_admins_verification_layer'
  ) THEN
    ALTER TABLE public.member_admins
      ADD CONSTRAINT chk_member_admins_verification_layer
      CHECK (verification_layer BETWEEN 0 AND 5);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_member_admins_layer
  ON public.member_admins (organization_id, verification_layer)
  WHERE is_active = TRUE;

-- Backfill: derive verification_layer from verification_status (§13.2)
UPDATE public.member_admins
SET verification_layer = CASE
  WHEN verification_status = 'admin_verified'    THEN 4
  WHEN verification_status = 'document_verified' THEN 4
  WHEN verification_status = 'member_confirmed'  THEN 3
  WHEN verification_status = 'email_verified'    THEN 2
  WHEN verification_status = 'pending'           THEN 1
  ELSE                                                0
END
WHERE verification_layer = 0
  AND verification_status IS NOT NULL;

-- ════════════════════════════════════════════════════════════
-- PART 2 — Extend claim_requests
-- ════════════════════════════════════════════════════════════
ALTER TABLE public.claim_requests
  ADD COLUMN IF NOT EXISTS bootstrap_path BOOLEAN NOT NULL DEFAULT FALSE,
  ADD COLUMN IF NOT EXISTS required_layer INTEGER NOT NULL DEFAULT 4,
  ADD COLUMN IF NOT EXISTS current_layer  INTEGER NOT NULL DEFAULT 0;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE table_schema='public' AND table_name='claim_requests'
      AND constraint_name='chk_claim_requests_layer_bounds'
  ) THEN
    ALTER TABLE public.claim_requests
      ADD CONSTRAINT chk_claim_requests_layer_bounds
      CHECK (
        required_layer BETWEEN 0 AND 5
        AND current_layer BETWEEN 0 AND 5
      );
  END IF;
END $$;

-- ════════════════════════════════════════════════════════════
-- PART 3 — claim_rejections (90-day cooldown)
-- ════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS public.claim_rejections (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id         UUID NOT NULL REFERENCES public.organization_members(id) ON DELETE CASCADE,
  organization_id   UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_signature  TEXT NOT NULL,   -- '<scope>:<group_id>:<role>' — unique per (rejected role, target, member)
  rejected_by_admin_id UUID REFERENCES public.member_admins(id) ON DELETE SET NULL,
  reason            TEXT,
  expires_at        TIMESTAMPTZ NOT NULL,
  lifted_at         TIMESTAMPTZ,     -- platform admin can lift early
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_claim_rejections_active
  ON public.claim_rejections (member_id, target_signature, expires_at)
  WHERE lifted_at IS NULL;

-- ════════════════════════════════════════════════════════════
-- PART 4 — Trigger: enforce membership rules on member_admins
-- ════════════════════════════════════════════════════════════
-- Hard-blocks insertion of admin rows that violate §13.4:
--   class exec     → caller's group_id MUST equal target group_id
--   dept exec      → caller's group_id's parent MUST equal target group_id
--   faculty exec   → caller's group_id's grandparent MUST equal target group_id
--   SUG / org exec → caller must just be in the org (already enforced by FK)
--
-- Service role bypass: when a SECURITY DEFINER RPC runs as service_role,
-- we trust it (those RPCs do their own validation).
-- ============================================================
CREATE OR REPLACE FUNCTION public.enforce_membership_rules()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  v_caller_group_id UUID;
  v_caller_org_id   UUID;
  v_target_kind     TEXT;
  v_target_parent   UUID;
  v_caller_parent   UUID;
  v_caller_gparent  UUID;
BEGIN
  -- Allow service role to bypass — internal RPCs are trusted.
  IF current_setting('request.jwt.claim.role', TRUE) = 'service_role'
     OR session_user = 'postgres'
  THEN
    RETURN NEW;
  END IF;

  -- Resolve caller (the new admin's member identity)
  SELECT organization_id, group_id
    INTO v_caller_org_id, v_caller_group_id
  FROM public.organization_members
  WHERE id = NEW.member_id;

  IF v_caller_org_id IS NULL THEN
    RAISE EXCEPTION 'membership_rule: member % does not exist', NEW.member_id;
  END IF;
  IF v_caller_org_id <> NEW.organization_id THEN
    RAISE EXCEPTION 'membership_rule: member belongs to a different organization';
  END IF;

  -- Org-scope or NULL group is allowed for org-wide admins; just verify the org match.
  IF NEW.group_id IS NULL OR NEW.scope_level = 'org' THEN
    RETURN NEW;
  END IF;

  -- Look up the target group's kind and parent
  SELECT kind, parent_group_id INTO v_target_kind, v_target_parent
  FROM public.organization_groups
  WHERE id = NEW.group_id;

  IF v_target_kind IS NULL THEN
    RAISE EXCEPTION 'membership_rule: target group % does not exist', NEW.group_id;
  END IF;

  -- Caller's chain: their group → parent (typically department) → grandparent (typically faculty)
  SELECT parent_group_id INTO v_caller_parent
  FROM public.organization_groups WHERE id = v_caller_group_id;
  IF v_caller_parent IS NOT NULL THEN
    SELECT parent_group_id INTO v_caller_gparent
    FROM public.organization_groups WHERE id = v_caller_parent;
  END IF;

  -- ── Rule application ──
  -- Class exec: must be in the same class
  IF v_target_kind IN ('class','level','year_group') THEN
    IF v_caller_group_id IS DISTINCT FROM NEW.group_id THEN
      RAISE EXCEPTION 'membership_rule: only members of % can hold an exec role in it', NEW.group_id;
    END IF;

  -- Dept / association exec: caller's class must be a child of the target dept
  ELSIF v_target_kind IN ('department','association','university_unit','fellowship','chapter','general') THEN
    IF v_caller_parent IS DISTINCT FROM NEW.group_id
       AND v_caller_group_id IS DISTINCT FROM NEW.group_id THEN
      RAISE EXCEPTION 'membership_rule: caller must belong to a class inside this %', v_target_kind;
    END IF;

  -- Faculty / college exec: caller's grandparent (class → dept → faculty) must match
  ELSIF v_target_kind IN ('faculty','college') THEN
    IF v_caller_gparent IS DISTINCT FROM NEW.group_id
       AND v_caller_parent IS DISTINCT FROM NEW.group_id
       AND v_caller_group_id IS DISTINCT FROM NEW.group_id THEN
      RAISE EXCEPTION 'membership_rule: caller must belong to a department inside this faculty';
    END IF;

  -- SUG: any member of the org is allowed (already verified above)
  ELSIF v_target_kind = 'sug' THEN
    NULL;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_member_admins_membership_check ON public.member_admins;
CREATE TRIGGER trg_member_admins_membership_check
  BEFORE INSERT OR UPDATE OF member_id, group_id, scope_level
  ON public.member_admins
  FOR EACH ROW EXECUTE FUNCTION public.enforce_membership_rules();

-- ════════════════════════════════════════════════════════════
-- PART 5 — compute_trust_layer(claim_id)
-- ════════════════════════════════════════════════════════════
-- Reads the current state of a claim and returns its trust layer:
--   0 — claim missing
--   1 — self-declared (claim exists)
--   2 — institutional email present (Layer 2 strengthens)
--   3 — votes_received >= votes_required
--   4 — confirmed by a verified parent-org exec (Layer 4 = money unlocks)
--   5 — document_verified by platform admin
--
-- Pure read; no side effects. The RPC that ADVANCES a claim
-- (Phase B's `recompute_claim_layer`) is what writes the value
-- back into claim_requests.current_layer.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.compute_trust_layer(p_claim_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v RECORD;
  v_confirmed BOOLEAN;
  v_doc_reviewed BOOLEAN;
BEGIN
  SELECT
    cr.id,
    cr.organization_id,
    cr.institutional_email,
    cr.votes_required,
    cr.votes_received,
    cr.verification_method,
    cr.resulting_admin_id,
    cr.status
  INTO v
  FROM public.claim_requests cr
  WHERE cr.id = p_claim_id;

  IF v IS NULL THEN
    RETURN 0;
  END IF;

  -- Layer 5: platform-admin document review
  v_doc_reviewed := v.verification_method = 'document'
                    AND v.status = 'approved';
  IF v_doc_reviewed THEN RETURN 5; END IF;

  -- Layer 4: a parent-org verified exec has confirmed (look at the
  -- resulting admin row's confirmed_by_admin_id)
  IF v.resulting_admin_id IS NOT NULL THEN
    SELECT (confirmed_by_admin_id IS NOT NULL)
      INTO v_confirmed
    FROM public.member_admins
    WHERE id = v.resulting_admin_id;
    IF COALESCE(v_confirmed, FALSE) THEN RETURN 4; END IF;
  END IF;

  -- Layer 3: peer-vote threshold met
  IF COALESCE(v.votes_required, 0) > 0
     AND COALESCE(v.votes_received, 0) >= v.votes_required THEN
    RETURN 3;
  END IF;

  -- Layer 2: institutional email present
  IF v.institutional_email IS NOT NULL
     AND LENGTH(TRIM(v.institutional_email)) > 0 THEN
    RETURN 2;
  END IF;

  -- Layer 1: claim simply exists
  RETURN 1;
END;
$$;

GRANT EXECUTE ON FUNCTION public.compute_trust_layer(UUID)
  TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- PART 6 — Helper: is_member_under_cooldown(member, signature)
-- ════════════════════════════════════════════════════════════
-- Used by the Phase-B submit_claim_v2 RPC to block re-claim attempts
-- during the 90-day cooldown window.
-- ════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION public.is_member_under_cooldown(
  p_member_id  UUID,
  p_signature  TEXT
)
RETURNS BOOLEAN
LANGUAGE SQL
STABLE
SECURITY DEFINER
SET search_path = public, extensions
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.claim_rejections
    WHERE member_id = p_member_id
      AND target_signature = p_signature
      AND lifted_at IS NULL
      AND expires_at > NOW()
  );
$$;

GRANT EXECUTE ON FUNCTION public.is_member_under_cooldown(UUID, TEXT)
  TO anon, authenticated;

-- ════════════════════════════════════════════════════════════
-- PART 7 — GRANTs on new tables
-- ════════════════════════════════════════════════════════════
GRANT SELECT, INSERT, UPDATE ON public.claim_rejections TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.claim_rejections TO service_role;

-- RLS: claim_rejections is admin-readable, write via service-role RPC only
ALTER TABLE public.claim_rejections ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS claim_rejections_select ON public.claim_rejections;
CREATE POLICY claim_rejections_select
  ON public.claim_rejections FOR SELECT
  USING (
    member_id::text = auth.uid()::text
    OR EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.organization_id = claim_rejections.organization_id
        AND ma.member_id::text = auth.uid()::text
        AND ma.is_active = TRUE
        AND ma.verification_layer >= 4
    )
  );

DROP POLICY IF EXISTS claim_rejections_service ON public.claim_rejections;
CREATE POLICY claim_rejections_service
  ON public.claim_rejections FOR ALL TO service_role
  USING (TRUE) WITH CHECK (TRUE);

-- ════════════════════════════════════════════════════════════
-- Verification
-- ════════════════════════════════════════════════════════════
DO $$
DECLARE
  layered_admins INTEGER;
  trigger_exists BOOLEAN;
BEGIN
  SELECT COUNT(*) INTO layered_admins
  FROM public.member_admins
  WHERE verification_layer > 0;

  SELECT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'trg_member_admins_membership_check'
  ) INTO trigger_exists;

  RAISE NOTICE 'Migration 041 complete (Phase A — Layered Trust schema):';
  RAISE NOTICE '  member_admins.verification_layer + confirmed_by_admin_id added';
  RAISE NOTICE '  Backfilled % existing admin rows to a layer derived from their status', layered_admins;
  RAISE NOTICE '  claim_requests.bootstrap_path + required_layer + current_layer added';
  RAISE NOTICE '  claim_rejections table + RLS created';
  RAISE NOTICE '  compute_trust_layer() + is_member_under_cooldown() helpers ready';
  RAISE NOTICE '  Membership-rule trigger active: %', trigger_exists;
END $$;

COMMIT;
