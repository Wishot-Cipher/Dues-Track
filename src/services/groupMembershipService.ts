/**
 * groupMembershipService — multi-group membership within an organization.
 * A member can belong to their class (primary) plus associations / clubs /
 * fellowships, and "My Dues" spans all of them. Backed by migration 074's
 * group_memberships table + get_my_groups / join_group / leave_group RPCs.
 */

import { supabase } from '@/config/supabase';

export interface MyGroup {
  group_id: string;
  name: string;
  short_name: string | null;
  kind: string;
  parent_group_id: string | null;
  is_primary: boolean;
  is_verified_exec: boolean;
}

export interface JoinableGroup {
  id: string;
  name: string;
  short_name: string | null;
  kind: string;
  current_member_count: number | null;
}

// Group kinds a member can opt into beyond their structural class/department.
const JOINABLE_KINDS = ['association', 'club', 'fellowship', 'general', 'team'];

export const groupMembershipService = {
  async getMyGroups(memberId: string): Promise<MyGroup[]> {
    const { data, error } = await supabase.rpc('get_my_groups', { p_member_id: memberId });
    if (error || !data?.ok) return [];
    return (data.groups || []) as MyGroup[];
  },

  async joinGroup(memberId: string, groupId: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('join_group', { p_member_id: memberId, p_group_id: groupId });
    if (error) return { ok: false, error: error.message };
    return (data ?? { ok: false, error: 'Empty response' }) as { ok: boolean; error?: string };
  },

  async leaveGroup(memberId: string, groupId: string): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('leave_group', { p_member_id: memberId, p_group_id: groupId });
    if (error) return { ok: false, error: error.message };
    return (data ?? { ok: false, error: 'Empty response' }) as { ok: boolean; error?: string };
  },

  /** Groups in the org a member can opt into (associations/clubs/fellowships) they're not already in. */
  async listJoinable(orgId: string, excludeGroupIds: string[]): Promise<JoinableGroup[]> {
    const { data, error } = await supabase
      .from('organization_groups')
      .select('id, name, short_name, kind, current_member_count, is_active')
      .eq('organization_id', orgId)
      .eq('is_active', true)
      .in('kind', JOINABLE_KINDS)
      .order('name');
    if (error || !data) return [];
    const exclude = new Set(excludeGroupIds);
    return (data as JoinableGroup[]).filter((g) => !exclude.has(g.id));
  },
};

export default groupMembershipService;
