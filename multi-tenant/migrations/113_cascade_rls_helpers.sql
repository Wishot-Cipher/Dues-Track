-- ============================================================
-- Migration 113: Cascade-aware RLS helper functions (STEP 1 of the
-- staged RLS restore). FUNCTIONS ONLY — no policy changes here, so
-- this migration is ZERO functional risk: nothing references these
-- until the policy-flip migration (114) is consciously applied.
--
-- Background
-- ----------
-- Mig 028 dropped the strict tier-isolation policies and set the
-- money tables to USING(TRUE) because custom auth meant auth.uid()
-- was NULL server-side. That's no longer true — login.ts mints a JWT
-- with sub=member.id, so auth.uid() resolves. We can restore proper
-- tier-aware RLS, but it must honor the DUES CASCADE or it will lock
-- members out of paying.
--
-- The cascade rule
-- ----------------
-- A due created at group G applies to members of G and every
-- DESCENDANT of G (a dept due cascades down to all its classes). So a
-- member in class C must be able to SEE (to pay) any due whose group
-- is C or an ANCESTOR of C (class, dept, faculty, org-wide).
--
--   member sees due  ⇔  due.group_id is ancestor-or-self of member.group_id
--                        OR due is org-wide (group_id IS NULL)
--
-- This also gives execs the right view for free: a dept exec is a
-- member of a class below the dept, so they see dept/faculty/org dues
-- (ancestors) + their own class — but NOT sibling classes' dues.
-- Exactly the tier-autonomy boundary.
--
-- These REPLACE the mig 022 definitions. The two helpers:
--   can_access_payment_type(pt_id) — SELECT visibility (cascade)
--   owns_payment_type(pt_id)       — write/manage (own tier only)
-- ============================================================

BEGIN;

-- ── Helper: is p_ancestor an ancestor-or-self of p_group? ──
-- Depth-guarded ancestor walk (cycle-safe). Used by the cascade.
CREATE OR REPLACE FUNCTION public.group_is_ancestor_or_self(
  p_ancestor UUID,
  p_group    UUID
)
RETURNS BOOLEAN
LANGUAGE sql STABLE
AS $$
  WITH RECURSIVE up AS (
    SELECT id, parent_group_id, 1 AS depth
    FROM public.organization_groups WHERE id = p_group
    UNION ALL
    SELECT g.id, g.parent_group_id, up.depth + 1
    FROM public.organization_groups g
    JOIN up ON g.id = up.parent_group_id
    WHERE up.depth < 12
  )
  SELECT EXISTS (SELECT 1 FROM up WHERE id = p_ancestor);
$$;
GRANT EXECUTE ON FUNCTION public.group_is_ancestor_or_self(UUID, UUID)
  TO anon, authenticated, service_role;

-- ── SELECT visibility: members (cascade) + the type's owning exec ──
CREATE OR REPLACE FUNCTION public.can_access_payment_type(p_payment_type_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_pt_group  UUID;
  v_pt_org    UUID;
  v_my_group  UUID;
  v_my_org    UUID;
BEGIN
  IF public.is_platform_admin() THEN RETURN TRUE; END IF;
  IF auth.role() = 'service_role' THEN RETURN TRUE; END IF;
  IF p_payment_type_id IS NULL THEN RETURN FALSE; END IF;

  SELECT group_id, organization_id INTO v_pt_group, v_pt_org
  FROM public.payment_types WHERE id = p_payment_type_id;
  IF v_pt_org IS NULL THEN RETURN FALSE; END IF;

  -- Resolve the caller's membership (org + primary group).
  SELECT organization_id, group_id INTO v_my_org, v_my_group
  FROM public.organization_members WHERE id::text = auth.uid()::text;
  IF v_my_org IS NULL OR v_my_org <> v_pt_org THEN RETURN FALSE; END IF;

  -- Org-wide due → visible to every member of the org.
  IF v_pt_group IS NULL THEN RETURN TRUE; END IF;

  -- Cascade: the due's group must be an ancestor-or-self of the
  -- caller's group (the due flows down to them).
  IF v_my_group IS NOT NULL
     AND public.group_is_ancestor_or_self(v_pt_group, v_my_group)
  THEN
    RETURN TRUE;
  END IF;

  -- An exec who OWNS this tier's due (even if their primary group is
  -- elsewhere) can still see it.
  RETURN EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id::text = auth.uid()::text
      AND ma.organization_id = v_pt_org
      AND ma.is_active = TRUE
      AND ma.group_id = v_pt_group
      AND COALESCE(ma.verification_layer, 0) >= 3
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.can_access_payment_type(UUID)
  TO anon, authenticated, service_role;

-- ── Write/manage: only the OWNING tier's verified exec ──
-- A due is managed by a verified (layer>=3) active admin whose group
-- is exactly the due's group (own tier — no reaching down), or an
-- org-scope admin for org-wide dues.
CREATE OR REPLACE FUNCTION public.owns_payment_type(p_payment_type_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, extensions
AS $$
DECLARE
  v_pt_group UUID;
  v_pt_org   UUID;
BEGIN
  IF public.is_platform_admin() THEN RETURN TRUE; END IF;
  IF auth.role() = 'service_role' THEN RETURN TRUE; END IF;
  IF p_payment_type_id IS NULL THEN RETURN FALSE; END IF;

  SELECT group_id, organization_id INTO v_pt_group, v_pt_org
  FROM public.payment_types WHERE id = p_payment_type_id;
  IF v_pt_org IS NULL THEN RETURN FALSE; END IF;

  IF v_pt_group IS NULL THEN
    -- Org-wide due → org-scope verified admin.
    RETURN EXISTS (
      SELECT 1 FROM public.member_admins ma
      WHERE ma.member_id::text = auth.uid()::text
        AND ma.organization_id = v_pt_org
        AND ma.is_active = TRUE
        AND ma.scope_level = 'org'
        AND COALESCE(ma.verification_layer, 0) >= 3
    );
  END IF;

  -- Tier due → verified admin of THAT exact group (own tier).
  RETURN EXISTS (
    SELECT 1 FROM public.member_admins ma
    WHERE ma.member_id::text = auth.uid()::text
      AND ma.organization_id = v_pt_org
      AND ma.is_active = TRUE
      AND ma.group_id = v_pt_group
      AND COALESCE(ma.verification_layer, 0) >= 3
  );
END;
$$;
GRANT EXECUTE ON FUNCTION public.owns_payment_type(UUID)
  TO anon, authenticated, service_role;

DO $$
BEGIN
  RAISE NOTICE 'Migration 113 complete: cascade-aware RLS helpers ready. NO policies changed — apply mig 114 to flip policies (with 115 as rollback).';
END $$;

COMMIT;
