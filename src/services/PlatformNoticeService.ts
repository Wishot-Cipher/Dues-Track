/**
 * platformNoticesService
 *
 * Fetches active, non-expired platform notices for the student dashboard.
 * Returns global notices + any org-scoped notices for the current org,
 * sorted by priority DESC, then created_at DESC.
 *
 * No auth headers needed for read — RLS policy allows authenticated
 * members to SELECT active notices.
 */

import { supabase } from '@/config/supabase';

export interface PlatformNotice {
  id: string;
  title: string;
  body: string;
  kind: 'announcement' | 'tip' | 'update' | 'maintenance' | 'milestone';
  emoji: string | null;
  cta_label: string | null;
  cta_url: string | null;
  priority: number;
  org_id: string | null;
  created_at: string;
}

/**
 * Fetch active notices. Pass orgId to include org-scoped notices.
 * Limit to a reasonable count (default 6) so the carousel never grows
 * unwieldy — the Platform Console should enforce hygiene.
 */
export async function getActiveNotices(
  orgId?: string | null,
  limit = 6,
): Promise<PlatformNotice[]> {
  let query = supabase
    .from('platform_notices')
    .select('id, title, body, kind, emoji, cta_label, cta_url, priority, org_id, created_at')
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`)
    .order('priority', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(limit);

  // Include global notices OR notices scoped to this org
  if (orgId) {
    query = query.or(`org_id.is.null,org_id.eq.${orgId}`);
  } else {
    query = query.is('org_id', null);
  }

  const { data, error } = await query;

  if (error) {
    console.error('[platformNoticesService] fetch error:', error.message);
    return [];
  }

  return (data ?? []) as PlatformNotice[];
}