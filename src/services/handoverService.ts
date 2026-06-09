/**
 * handoverService — exec role succession (mig 108).
 *
 * Thin wrapper over the SECURITY DEFINER RPCs:
 *   - searchTierMembers   → find a successor in the outgoing exec's tier
 *   - nominate            → start the handover (notifies the nominee)
 *   - getMyPendingHandover→ durable banner source for the nominee
 *   - respond             → nominee accepts (auto-submits claim) / declines
 *   - cancel              → outgoing exec backs out before completion
 *
 * The actual role transfer is server-side: a trigger fires when the
 * nominee's claim is approved, deactivating the outgoing exec's
 * member_admins row. Nothing here mutates roles directly.
 */

import { supabase } from '@/config/supabase';

export interface TierMember {
  member_id: string;
  full_name: string;
  human_id: string;
  group_name: string;
  group_short: string;
}

export interface PendingHandover {
  id: string;
  role_label: string | null;
  scope_level: string;
  group_id: string | null;
  status: string;
  reason: string | null;
  group_name: string | null;
  from_name: string | null;
}

export const handoverService = {
  async searchTierMembers(
    callerMemberId: string,
    query: string,
    groupId?: string | null,
  ): Promise<{ ok: boolean; members?: TierMember[]; scope?: string; error?: string }> {
    const { data, error } = await supabase.rpc('search_tier_members_for_handover', {
      p_caller_member_id: callerMemberId,
      p_query: query,
      p_group_id: groupId ?? null,
    });
    if (error) return { ok: false, error: error.message };
    const d = data as { ok?: boolean; members?: TierMember[]; scope?: string; error?: string };
    return { ok: Boolean(d?.ok), members: d?.members ?? [], scope: d?.scope, error: d?.error };
  },

  async nominate(
    callerMemberId: string,
    nomineeMemberId: string,
    groupId?: string | null,
    reason?: string,
  ): Promise<{ ok: boolean; handover_id?: string; role_label?: string; error?: string }> {
    const { data, error } = await supabase.rpc('nominate_successor', {
      p_caller_member_id: callerMemberId,
      p_nominee_member_id: nomineeMemberId,
      p_group_id: groupId ?? null,
      p_reason: reason ?? null,
    });
    if (error) return { ok: false, error: error.message };
    return (data ?? { ok: false }) as { ok: boolean; handover_id?: string; role_label?: string; error?: string };
  },

  async getMyPendingHandover(
    memberId: string,
  ): Promise<PendingHandover | null> {
    const { data, error } = await supabase.rpc('get_my_pending_handover', {
      p_member_id: memberId,
    });
    if (error) return null;
    const d = data as { ok?: boolean; handover?: PendingHandover | null };
    return d?.handover ?? null;
  },

  async respond(
    nomineeMemberId: string,
    handoverId: string,
    accept: boolean,
  ): Promise<{ ok: boolean; status?: string; claim_id?: string; error?: string }> {
    const { data, error } = await supabase.rpc('respond_to_handover', {
      p_nominee_member_id: nomineeMemberId,
      p_handover_id: handoverId,
      p_accept: accept,
    });
    if (error) return { ok: false, error: error.message };
    return (data ?? { ok: false }) as { ok: boolean; status?: string; claim_id?: string; error?: string };
  },

  async cancel(
    callerMemberId: string,
    handoverId: string,
  ): Promise<{ ok: boolean; status?: string; error?: string }> {
    const { data, error } = await supabase.rpc('cancel_exec_handover', {
      p_caller_member_id: callerMemberId,
      p_handover_id: handoverId,
    });
    if (error) return { ok: false, error: error.message };
    return (data ?? { ok: false }) as { ok: boolean; status?: string; error?: string };
  },
};

export default handoverService;
