-- ============================================================
-- Migration 119: a class "has an exec" only via its OWN class-level
-- exec — never an ancestor (dept/faculty/org) admin.
--
-- The bug (reported)
-- ------------------
-- A brand-new class created inside a department that already has a
-- department exec immediately showed "Your class has an exec now —
-- invites go through them", blocking the class founder from sharing a
-- join link. The class had NO exec of its own.
--
-- Root cause: _class_has_admin_other_than (mig 084) counted ANY admin
-- whose scope "covers" the class — including ANCESTOR admins (the
-- department/faculty exec) and org admins. Mig 084 did this on purpose
-- back then, but it predates the tier-autonomy model we've since locked
-- in: a department exec is NOT the class's exec. They manage their own
-- tier's dues + members, never the class's membership or invites. So an
-- ancestor exec must NOT close a class's bootstrap.
--
-- The fix
-- -------
-- _class_has_admin_other_than now counts ONLY a CLASS-LEVEL admin whose
-- group_id is exactly this class (excluding the founder). A dept /
-- faculty / org exec no longer makes a class "have an exec". Each class
-- bootstraps its own exec independently — exactly the autonomy rule.
--
-- create_member_join_invite + get_class_invite_status consume this
-- helper, so both pick up the fix automatically. (get_class_invite_
-- status's caller_is_full_admin still uses the ancestor walk — that's
-- about whether the CALLER can act, handled separately.)
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public._class_has_admin_other_than(
  p_group_id   UUID,
  p_excluding  UUID
)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count INT;
BEGIN
  IF p_group_id IS NULL THEN RETURN FALSE; END IF;

  -- ONLY an exec whose group is THIS class (own tier). Ancestor
  -- (dept/faculty) + org admins deliberately excluded — they don't
  -- run the class's membership or invites.
  SELECT COUNT(*) INTO v_count
  FROM public.member_admins ma
  WHERE ma.group_id = p_group_id
    AND COALESCE(ma.verification_layer, 0) >= 2
    AND ma.is_active = TRUE
    AND (p_excluding IS NULL OR ma.member_id <> p_excluding);

  RETURN v_count > 0;
END;
$$;

DO $$
BEGIN
  RAISE NOTICE 'Migration 119 applied: a class "has an exec" only via its OWN class-level exec; ancestor (dept/faculty/org) admins no longer block a new class''s invite bootstrap.';
END $$;

COMMIT;
