-- ============================================================
-- Migration 120: Welcome notification for every new member
-- (special "you're the first" message for the class pioneer).
--
-- Why a trigger (not client code): new members arrive via several
-- paths — invite signup (signup_member_via_invite), dept/faculty
-- bootstrap, admin-added members. A single AFTER INSERT trigger on
-- organization_members guarantees EVERY new member is welcomed exactly
-- once, no matter how they joined, with no client involvement.
--
-- First-in-class: counted live (COUNT of active members in the new
-- member's group, which includes the just-inserted row). If they're
-- the only one, they get the pioneer message nudging them to share
-- the class link + claim the rep role; otherwise a normal welcome.
-- ============================================================

BEGIN;

CREATE OR REPLACE FUNCTION public.notify_new_member_welcome()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_org_name    TEXT;
  v_group_name  TEXT;
  v_count       INT;
  v_is_first    BOOLEAN;
  v_title       TEXT;
  v_message     TEXT;
BEGIN
  -- Members must belong to a group + org to be welcomed meaningfully.
  IF NEW.group_id IS NULL OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;
  IF COALESCE(NEW.is_active, TRUE) = FALSE THEN
    RETURN NEW;
  END IF;

  SELECT name INTO v_org_name FROM public.organizations WHERE id = NEW.organization_id;
  SELECT name INTO v_group_name FROM public.organization_groups WHERE id = NEW.group_id;

  -- Live count — includes the row just inserted (AFTER INSERT).
  SELECT COUNT(*) INTO v_count
  FROM public.organization_members
  WHERE group_id = NEW.group_id AND COALESCE(is_active, TRUE) = TRUE;
  v_is_first := COALESCE(v_count, 1) <= 1;

  IF v_is_first THEN
    v_title := '🎉 You''re the first here!';
    v_message :=
      'You''re the very first member of ' || COALESCE(v_group_name, 'your group')
      || (CASE WHEN v_org_name IS NOT NULL THEN ' in ' || v_org_name ELSE '' END)
      || '. Share your group''s invite link to bring everyone in — and you can claim the rep role from your dashboard to manage dues and members.';
  ELSE
    v_title := '👋 Welcome to ' || COALESCE(v_group_name, v_org_name, 'Payvexo');
    v_message :=
      'Welcome to ' || COALESCE(v_group_name, v_org_name, 'your group')
      || '! Your dues, events and payments all live here. Tap the bell any time to catch up on what''s new.';
  END IF;

  INSERT INTO public.notifications (
    organization_id, group_id, member_id, type, title, message, is_read
  ) VALUES (
    NEW.organization_id, NEW.group_id, NEW.id, 'welcome', v_title, v_message, FALSE
  );

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Never let a welcome-notification hiccup block a signup.
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_new_member_welcome ON public.organization_members;
CREATE TRIGGER trg_new_member_welcome
  AFTER INSERT ON public.organization_members
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_new_member_welcome();

DO $$
BEGIN
  RAISE NOTICE 'Migration 120 applied: new members now get a welcome notification (pioneer message for the first-in-group).';
END $$;

COMMIT;
