-- Migration 043: Add member_id/group_id to notifications (if missing)
-- Fixes claim-submit notifications insert failing on missing group_id.

BEGIN;

ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS member_id UUID REFERENCES public.organization_members(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS group_id UUID REFERENCES public.organization_groups(id) ON DELETE SET NULL;

-- Backfill group_id from member_id where possible.
UPDATE public.notifications n
SET group_id = om.group_id
FROM public.organization_members om
WHERE n.group_id IS NULL
  AND n.member_id = om.id;

CREATE INDEX IF NOT EXISTS idx_notifications_member ON public.notifications(member_id);
CREATE INDEX IF NOT EXISTS idx_notifications_group ON public.notifications(group_id);

COMMIT;
