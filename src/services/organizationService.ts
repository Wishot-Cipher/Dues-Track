/**
 * Organization Service
 * API service for fetching and managing organizations, groups, and settings
 * Payvexo Multi-Tenant
 */

import { supabase } from '@/config/supabase';
import type {
  Organization,
  OrganizationGroup,
  OrganizationSettings,
  OrganizationInvite,
  GroupKind,
  SearchResult,
  SeedInstitution,
  TrustLevel,
  ClaimStatus,
} from '@/types/multiTenant';
import type { OrganizationType } from '@/config/constants';
import { ORG_TYPE_DEFAULTS } from '@/types/multiTenant';

function getCurrentMemberId(): string | null {
  try {
    return localStorage.getItem('pvx_member_id');
  } catch {
    return null;
  }
}

/**
 * Stable ordering for search results: highest-trust live orgs first,
 * then lower trust bands, then seeds last. Within a band, larger member
 * count wins, then alphabetical by name.
 */
const TRUST_ORDER: Record<TrustLevel, number> = {
  official:   0,
  verified:   1,
  recognized: 2,
  community:  3,
  seed:       4,
};

function sortByTrust(results: SearchResult[]): SearchResult[] {
  return [...results].sort((a, b) => {
    const ta = TRUST_ORDER[a.trust_level] ?? 9;
    const tb = TRUST_ORDER[b.trust_level] ?? 9;
    if (ta !== tb) return ta - tb;
    const ma = a.member_count ?? 0;
    const mb = b.member_count ?? 0;
    if (ma !== mb) return mb - ma;
    return a.name.localeCompare(b.name);
  });
}

export interface OrganizationWithGroups extends Organization {
  groups: OrganizationGroup[];
}

/** Result of get_due_creation_context RPC (mig 035) */
export interface DueCreationContext {
  ok: boolean;
  error?: string;
  org?: {
    id: string;
    slug: string;
    name: string;
    state: 'active' | 'acting' | 'orphaned' | null;
  };
  caller?: {
    scope: 'org' | 'unit' | 'group' | null;
    group_id: string | null;
    verification_status: string | null;
    can_publish: boolean;
  };
  session?: { id: string; label: string } | null;
  targets?: Array<{
    id: string;
    name: string;
    short_name: string;
    kind: string;
    parent_group_id: string | null;
    can_collect_dues: boolean;
    member_count: number;
  }>;
}

export interface AcademicSessionRecord {
  id: string;
  organization_id: string;
  label: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  is_locked: boolean;
  created_at: string;
  updated_at: string;
}

export interface AcademicTermRecord {
  id: string;
  organization_id: string;
  session_id: string;
  name: string;
  sequence: number;
  start_date: string;
  end_date: string;
  promotion_window_starts_at?: string | null;
  promotion_window_ends_at?: string | null;
  status: 'upcoming' | 'active' | 'closing' | 'closed';
  created_at: string;
  updated_at: string;
}

export const organizationService = {
  // ============================================================
  // ORGANIZATION CRUD
  // ============================================================

  /**
   * Fetch organization by URL slug
   */
  async getBySlug(slug: string): Promise<Organization | null> {
    try {
      // maybeSingle() returns null when no row matches, instead of
      // triggering the 406 error that .single() throws. The calling
      // pages already handle null by showing a NotFoundScreen.
      const { data, error } = await supabase
        .from('organizations')
        .select(`
          *,
          settings:organization_settings(*)
        `)
        .eq('slug', slug.toLowerCase())
        .eq('is_active', true)
        .maybeSingle();

      if (error) {
        console.error('Error fetching organization:', error);
        return null;
      }

      return (data as Organization | null);
    } catch (error) {
      console.error('Error in getBySlug:', error);
      return null;
    }
  },

  /**
   * Fetch organization by ID
   */
  async getById(id: string): Promise<Organization | null> {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select(`
          *,
          settings:organization_settings(*)
        `)
        .eq('id', id)
        .single();

      if (error) return null;
      return data as Organization;
    } catch (error) {
      console.error('Error in getById:', error);
      return null;
    }
  },

  /**
   * Fetch all active organizations (for directory/selector page)
   */
  async getAll(options?: { limit?: number; offset?: number; type?: OrganizationType }): Promise<Organization[]> {
    try {
      let query = supabase
        .from('organizations')
        .select('*')
        .eq('is_active', true);

      if (options?.type) {
        query = query.eq('organization_type', options.type);
      }

      query = query.order('name');

      if (options?.limit) query = query.limit(options.limit);
      if (options?.offset) query = query.range(options.offset, options.offset + (options.limit || 20) - 1);

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching organizations:', error);
        return [];
      }

      return data as Organization[];
    } catch (error) {
      console.error('Error in getAll:', error);
      return [];
    }
  },

  /**
   * Two-layer search for the landing page.
   *
   * Layer 1: live `organizations` (real, joinable, with trust badges).
   * Layer 2: `seed_institutions` not yet linked to a live org —
   *          these surface so a student who searches for an unlisted
   *          school can promote it via the Bring My School flow.
   *
   * If a seed shares a name (case-insensitive) with a live org, the
   * live one wins and the seed is suppressed. Results are returned in
   * trust order so the most legitimate matches surface first.
   */
  async searchUnified(
    query: string,
    opts?: { countryCode?: string; limit?: number }
  ): Promise<SearchResult[]> {
    const limit = opts?.limit ?? 8;
    const safeQuery = query.trim();
    if (safeQuery.length < 2) return [];

    // ── Layer 1: live organizations ──
    //
    // We attempt the modern column set first (mig 012 adds type,
    // trust_level, claim_status, country_code, etc.). If migrations
    // have NOT been applied yet, PostgREST returns 400 and we fall
    // back to a legacy column set. This makes the landing-page
    // search work on a stock Supabase before migrations run.
    let orgRows: Record<string, unknown>[] | null = null;
    let modernShape = true;

    {
      let modernQuery = supabase
        .from('organizations')
        .select('id, name, short_name, slug, type, organization_type, trust_level, claim_status, logo_url, member_count, country_code, country')
        .eq('is_active', true)
        .or(`name.ilike.%${safeQuery}%,short_name.ilike.%${safeQuery}%`);

      if (opts?.countryCode) {
        modernQuery = modernQuery.or(
          `country_code.eq.${opts.countryCode},country.eq.${opts.countryCode}`
        );
      }

      const res = await modernQuery.limit(limit);
      if (res.error) {
        console.warn('searchUnified: modern columns not available, falling back', res.error.message);
        modernShape = false;
      } else {
        orgRows = res.data as Record<string, unknown>[];
      }
    }

    if (!modernShape) {
      // Legacy fallback — only the columns guaranteed to exist on the
      // organizations table before migration 012.
      const legacyQuery = supabase
        .from('organizations')
        .select('id, name, short_name, slug, organization_type, logo_url, country')
        .eq('is_active', true)
        .or(`name.ilike.%${safeQuery}%,short_name.ilike.%${safeQuery}%`)
        .limit(limit);

      const res = await legacyQuery;
      if (res.error) {
        console.error('searchUnified: legacy org query also failed', res.error);
        orgRows = [];
      } else {
        orgRows = res.data as Record<string, unknown>[];
      }
    }

    const orgs: SearchResult[] = (orgRows ?? []).map((r) => ({
      kind: 'organization',
      id: String(r.id),
      name: String(r.name),
      short_name: (r.short_name as string) ?? null,
      type: (r.type as string) ?? (r.organization_type as string) ?? 'other',
      trust_level: ((r.trust_level as TrustLevel | undefined) ?? 'community'),
      slug: r.slug as string | undefined,
      logo_url: (r.logo_url as string | null) ?? null,
      member_count: typeof r.member_count === 'number' ? (r.member_count as number) : undefined,
      claim_status: ((r.claim_status as ClaimStatus | undefined) ?? 'unclaimed'),
      country_code: (r.country_code as string | undefined) ?? undefined,
    }));

    if (orgs.length >= Math.min(5, limit)) {
      return sortByTrust(orgs).slice(0, limit);
    }

    // ── Layer 2: seed institutions ──
    //
    // Wrapped defensively: if mig 011 hasn't run yet, the table
    // doesn't exist and PostgREST returns 42P01. Catch and skip.
    const remaining = limit - orgs.length;
    let seedRows: Record<string, unknown>[] = [];

    try {
      let seedQuery = supabase
        .from('seed_institutions')
        .select('id, name, short_name, type, state, city, ownership, country_code')
        .is('linked_org_id', null)
        .or(`name.ilike.%${safeQuery}%,short_name.ilike.%${safeQuery}%,aliases.cs.{${safeQuery.toUpperCase()}}`);

      if (opts?.countryCode) {
        seedQuery = seedQuery.eq('country_code', opts.countryCode);
      }

      const res = await seedQuery.limit(remaining * 2);
      if (res.error) {
        console.warn('searchUnified: seed_institutions not queryable yet', res.error.message);
      } else if (res.data) {
        seedRows = res.data as Record<string, unknown>[];
      }
    } catch (e) {
      console.warn('searchUnified: seed layer skipped', e);
    }

    const seenNames = new Set(orgs.map((o) => o.name.toLowerCase()));
    const seeds: SearchResult[] = seedRows
      .filter((s) => !seenNames.has(String(s.name).toLowerCase()))
      .slice(0, remaining)
      .map((s) => ({
        kind: 'seed',
        id: String(s.id),
        name: String(s.name),
        short_name: (s.short_name as string) ?? null,
        type: String(s.type ?? 'other'),
        trust_level: 'seed' as TrustLevel,
        state: (s.state as string | null) ?? null,
        city: (s.city as string | null) ?? null,
        ownership: ((s.ownership as 'federal' | 'state' | 'private' | null) ?? null),
        country_code: (s.country_code as string | undefined) ?? undefined,
      }));

    return sortByTrust([...orgs, ...seeds]).slice(0, limit);
  },

  /**
   * Add a new faculty (top-level unit) to an existing organization.
   *
   * Atomic — creates a single organization_groups row with kind='faculty'
   * and no parent_group_id, via the add_faculty_to_org RPC (mig 029).
   *
   * Use case: the founder created their org via bring-school, which
   * gave them ONE faculty. They want to add more.
   */
  async addFacultyToOrg(input: {
    orgSlug: string;
    facultyName: string;
    facultyShortName?: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    slug?: string;
    org_id?: string;
    faculty_id?: string;
    faculty_short?: string;
  }> {
    const { data, error } = await supabase.rpc('add_faculty_to_org', {
      p_org_slug:           input.orgSlug,
      p_faculty_name:       input.facultyName,
      p_faculty_short_name: input.facultyShortName ?? null,
    });
    if (error) {
      console.error('addFacultyToOrg RPC error', error);
      return { ok: false, error: error.message || 'Network error. Please try again.' };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as {
      ok: boolean;
      error?: string;
      slug?: string;
      org_id?: string;
      faculty_id?: string;
      faculty_short?: string;
    };
  },

  /**
   * Submit a claim to be an exec on the caller's org.
   *
   * Per mig 042 `submit_claim_v2` (layered trust). Inserts the claim,
   * computes bootstrap_path + required_layer, notifies peers and
   * parent execs, and returns the claim id + threshold info.
   */
  async submitClaim(input: {
    callerMemberId: string;
    claimedRole: string;
    claimedScope: 'org' | 'unit' | 'group';
    claimedGroupId: string | null;
    positionTitle: string;
    phone?: string;
    personalEmail?: string;
    institutionalEmail?: string;
    documentUrls?: string[];
    method?: 'email' | 'member_vote' | 'document';
  }): Promise<{
    ok: boolean;
    error?: string;
    claim_id?: string;
    votes_required?: number;
    vote_deadline?: string;
    bootstrap_path?: boolean;
    required_layer?: number;
  }> {
    const { data, error } = await supabase.rpc('submit_claim_v2', {
      p_caller_member_id:    input.callerMemberId,
      p_claimed_role:        input.claimedRole,
      p_claimed_scope:       input.claimedScope,
      p_claimed_group_id:    input.claimedGroupId,
      p_position_title:      input.positionTitle,
      p_phone:               input.phone ?? null,
      p_personal_email:      input.personalEmail ?? null,
      p_institutional_email: input.institutionalEmail ?? null,
      p_document_urls:       input.documentUrls ?? null,
      p_method:              input.method ?? 'member_vote',
    });
    if (error) {
      console.error('submitClaim RPC error', error);
      return { ok: false, error: error.message };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as {
      ok: boolean; error?: string; claim_id?: string;
      votes_required?: number; vote_deadline?: string;
      bootstrap_path?: boolean; required_layer?: number;
    };
  },

  // Back-compat alias used by older claim pages.
  async submitClaimV2(input: {
    callerMemberId: string;
    claimedRole: string;
    claimedScope: 'org' | 'unit' | 'group';
    claimedGroupId: string | null;
    positionTitle: string;
    phone?: string;
    personalEmail?: string;
    institutionalEmail?: string;
    documentUrls?: string[];
    method?: 'email' | 'member_vote' | 'document';
  }): Promise<{
    ok: boolean;
    error?: string;
    claim_id?: string;
    votes_required?: number;
    vote_deadline?: string;
    bootstrap_path?: boolean;
    required_layer?: number;
  }> {
    return this.submitClaim(input);
  },

  /**
   * Cast a vote on a pending claim (legacy mig 039 `cast_claim_vote`).
   * Kept for older UIs; new flows use cast_claim_vote_v2.
   */
  async castClaimVote(input: {
    claimId: string;
    voterMemberId: string;
    vote: 'confirm' | 'reject' | 'abstain';
    comment?: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    vote?: string;
    finalize?: {
      ok: boolean;
      approved?: boolean;
      votes_received?: number;
      votes_required?: number;
      admin_id?: string;
    };
  }> {
    const { data, error } = await supabase.rpc('cast_claim_vote', {
      p_claim_id:        input.claimId,
      p_voter_member_id: input.voterMemberId,
      p_vote:            input.vote,
      p_comment:         input.comment ?? null,
    });
    if (error) {
      console.error('castClaimVote RPC error', error);
      return { ok: false, error: error.message };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as {
      ok: boolean; error?: string; vote?: string;
      finalize?: { ok: boolean; approved?: boolean; votes_received?: number; votes_required?: number; admin_id?: string };
    };
  },

  // Back-compat alias used by VoteInbox / ClaimDecisionPage.
  async castClaimVoteV2(input: {
    claimId: string;
    voterMemberId: string;
    vote: 'confirm' | 'reject' | 'abstain';
    comment?: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    promoted?: boolean;
    votes_received?: number;
    votes_required?: number;
    bootstrap_path?: boolean;
    current_layer?: number;
    admin_id?: string;
  }> {
    const { data, error } = await supabase.rpc('cast_claim_vote_v2', {
      p_claim_id: input.claimId,
      p_voter_member_id: input.voterMemberId,
      p_vote: input.vote,
      p_comment: input.comment ?? null,
    });
    if (error) {
      console.error('castClaimVoteV2 RPC error', error);
      return { ok: false, error: error.message };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as {
      ok: boolean;
      error?: string;
      promoted?: boolean;
      votes_received?: number;
      votes_required?: number;
      bootstrap_path?: boolean;
      current_layer?: number;
      admin_id?: string;
    };
  },

  // Parent-exec confirmation path (layer 4 authority).
  async confirmClaimByParentExec(input: {
    claimId: string;
    confirmerMemberId: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('confirm_claim_by_parent_exec', {
      p_claim_id: input.claimId,
      p_confirmer_member_id: input.confirmerMemberId,
    });
    if (error) {
      console.error('confirmClaimByParentExec RPC error', error);
      return { ok: false, error: error.message };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as { ok: boolean; error?: string };
  },

  async rejectClaimByParentExec(input: {
    claimId: string;
    confirmerMemberId: string;
    reason?: string;
  }): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('reject_claim_by_parent_exec', {
      p_claim_id: input.claimId,
      p_confirmer_member_id: input.confirmerMemberId,
      p_reason: input.reason ?? null,
    });
    if (error) {
      console.error('rejectClaimByParentExec RPC error', error);
      return { ok: false, error: error.message };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as { ok: boolean; error?: string };
  },

  // Graduated-trust status for the claimant's own claim (runs the decision
  // tree lazily server-side, so the 72h escalation + auto-grant happen on read).
  async getClaimStatus(claimId: string): Promise<Record<string, unknown> & { ok: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('get_claim_status', { p_claim_id: claimId });
    if (error) {
      console.error('getClaimStatus RPC error', error);
      return { ok: false, error: error.message };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as Record<string, unknown> & { ok: boolean; error?: string };
  },

  // Path D — claimant asks for a platform review after 7 days stuck.
  async requestPlatformReview(input: { claimId: string; callerMemberId: string }): Promise<{ ok: boolean; error?: string }> {
    const { data, error } = await supabase.rpc('request_platform_review', {
      p_claim_id: input.claimId,
      p_caller_member_id: input.callerMemberId,
    });
    if (error) {
      console.error('requestPlatformReview RPC error', error);
      return { ok: false, error: error.message };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as { ok: boolean; error?: string };
  },

  // Claims that require a parent exec decision.
  async listPendingConfirmationsForExec(callerMemberId: string): Promise<Array<{
    id: string;
    full_name: string;
    position_title: string;
    claimed_role: string;
    claimed_scope: string;
    institutional_email: string | null;
    votes_received: number;
    votes_required: number;
    current_layer: number;
    bootstrap_path: boolean;
    created_at: string;
  }>> {
    const { data: me } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('id', callerMemberId)
      .maybeSingle();
    if (!me?.organization_id) return [];

    const { data, error } = await supabase
      .from('claim_requests')
      .select('id, full_name, position_title, claimed_role, claimed_scope, institutional_email, votes_received, votes_required, current_layer, bootstrap_path, created_at')
      .eq('organization_id', me.organization_id)
      .eq('status', 'awaiting_votes')
      .eq('bootstrap_path', false)   // bootstrap claims self-finalize; parent exec not needed
      .neq('claimant_user_id', callerMemberId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('listPendingConfirmationsForExec error', error);
      return [];
    }

    return (data ?? []) as Array<{
      id: string;
      full_name: string;
      position_title: string;
      claimed_role: string;
      claimed_scope: string;
      institutional_email: string | null;
      votes_received: number;
      votes_required: number;
      current_layer: number;
      bootstrap_path: boolean;
      created_at: string;
    }>;
  },

  /**
   * List pending claims the caller can vote on (their org +
   * awaiting_votes + caller is in the target scope + caller is
   * NOT the claimant + caller hasn't already voted).
   */
  async listOpenClaimsForVoter(callerMemberId: string): Promise<Array<{
    id: string;
    organization_id: string;
    claimant_user_id: string;
    full_name: string;
    position_title: string;
    claimed_role: string;
    claimed_scope: string;
    claimed_group_id: string | null;
    claimed_unit_group_id: string | null;
    votes_required: number;
    votes_received: number;
    vote_deadline: string;
    created_at: string;
  }>> {
    // First resolve the caller's org so we filter correctly even with relaxed RLS
    const { data: me } = await supabase
      .from('organization_members')
      .select('organization_id, group_id')
      .eq('id', callerMemberId)
      .maybeSingle();
    if (!me?.organization_id) return [];

    const voterGroupId = me.group_id ?? null;
    let voterParentId: string | null = null;
    let voterGrandparentId: string | null = null;

    if (voterGroupId) {
      const { data: groupRow } = await supabase
        .from('organization_groups')
        .select('parent_group_id')
        .eq('id', voterGroupId)
        .maybeSingle();
      voterParentId = groupRow?.parent_group_id ?? null;
      if (voterParentId) {
        const { data: parentRow } = await supabase
          .from('organization_groups')
          .select('parent_group_id')
          .eq('id', voterParentId)
          .maybeSingle();
        voterGrandparentId = parentRow?.parent_group_id ?? null;
      }
    }

    const { data, error } = await supabase
      .from('claim_requests')
      .select('id, organization_id, claimant_user_id, full_name, position_title, claimed_role, claimed_scope, claimed_group_id, claimed_unit_group_id, votes_required, votes_received, vote_deadline, created_at')
      .eq('organization_id', me.organization_id)
      .eq('status', 'awaiting_votes')
      .neq('claimant_user_id', callerMemberId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('listOpenClaimsForVoter error', error);
      return [];
    }
    const scoped = (data ?? []).filter((c) => {
      if (c.claimed_scope === 'org') return true;
      if (c.claimed_scope === 'group') {
        if (!voterGroupId) return false;
        return c.claimed_group_id === voterGroupId
          || c.claimed_group_id === voterParentId;
      }
      if (c.claimed_scope === 'unit') {
        if (!voterGroupId) return false;
        return c.claimed_unit_group_id === voterGroupId
          || c.claimed_unit_group_id === voterParentId
          || c.claimed_unit_group_id === voterGrandparentId;
      }
      return false;
    });

    // Filter out claims the caller has already voted on
    const ids = scoped.map((c) => c.id);
    if (ids.length === 0) return [];
    const { data: voted } = await supabase
      .from('claim_votes')
      .select('claim_request_id')
      .eq('voter_member_id', callerMemberId)
      .in('claim_request_id', ids);
    const votedSet = new Set((voted ?? []).map((v) => v.claim_request_id));
    return scoped.filter((c) => !votedSet.has(c.id)) as Array<{
      id: string; organization_id: string; claimant_user_id: string;
      full_name: string; position_title: string; claimed_role: string;
      claimed_scope: string; claimed_group_id: string | null;
      claimed_unit_group_id: string | null; votes_required: number;
      votes_received: number; vote_deadline: string; created_at: string;
    }>;
  },

  /**
   * Generic "add a subgroup to a parent" — supports both:
   *   parent = faculty/college → creates a department
   *   parent = department      → creates a class / level / association
   *
   * Calls add_subgroup_to_parent RPC (mig 037). Same atomic pattern
   * as bring_school_online: creates the group, the founder member,
   * and the founder admin row in one transaction.
   */
  async addSubgroupToParent(input: {
    orgSlug: string;
    parentShortName: string;
    subgroupName: string;
    subgroupShortName?: string;
    subgroupKind?: 'department' | 'class' | 'level' | 'association' | 'general';
    fullName: string;
    email: string;
    phone?: string;
    memberNumber: string;
    password: string;
    userLevel?: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    slug?: string;
    org_id?: string;
    parent_id?: string;
    parent_short?: string;
    parent_kind?: string;
    group_id?: string;
    group_short?: string;
    group_kind?: string;
    member_id?: string;
    member_login_id?: string;
  }> {
    const { data, error } = await supabase.rpc('add_subgroup_to_parent', {
      p_org_slug:            input.orgSlug,
      p_parent_short_name:   input.parentShortName,
      p_subgroup_name:       input.subgroupName,
      p_subgroup_short_name: input.subgroupShortName ?? null,
      p_subgroup_kind:       input.subgroupKind ?? null,
      p_full_name:           input.fullName,
      p_email:               input.email,
      p_phone:               input.phone ?? null,
      p_member_number:       input.memberNumber,
      p_password:            input.password,
      p_user_level:          input.userLevel ?? null,
    });
    if (error) {
      console.error('addSubgroupToParent RPC error', error);
      return { ok: false, error: error.message || 'Network error. Please try again.' };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as {
      ok: boolean;
      error?: string;
      slug?: string;
      org_id?: string;
      parent_id?: string;
      parent_short?: string;
      parent_kind?: string;
      group_id?: string;
      group_short?: string;
      group_kind?: string;
      member_id?: string;
      member_login_id?: string;
    };
  },

  /**
   * Returns everything the CreateDuePage needs to render the
   * scope-aware targeting picker in ONE round trip.
   *
   * Per mig 035 `get_due_creation_context`. Result shape:
   *   {
   *     ok: true,
   *     org: { id, slug, name, state },
   *     caller: { scope, group_id, verification_status, can_publish },
   *     session: { id, label } | null,
   *     targets: [{ id, name, short_name, kind, parent_group_id, can_collect_dues, member_count }]
   *   }
   */
  async getDueCreationContext(callerMemberId: string): Promise<DueCreationContext> {
    const { data, error } = await supabase.rpc('get_due_creation_context', {
      p_caller_member_id: callerMemberId,
    });
    if (error) {
      console.error('getDueCreationContext RPC error', error);
      return { ok: false, error: error.message };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as DueCreationContext;
  },

  /**
   * Publish a due via the scope-checked RPC (mig 033 + 035).
   *
   * The RPC validates: org_state='active', caller has can_create_payments,
   * verification_status is trusted, target scope is within caller's reach,
   * target group can_collect_dues, and binds the due to the org's current
   * academic session. On success, it fans out notifications automatically.
   */
  async createDueWithScope(input: {
    callerMemberId: string;
    targetScope: 'org' | 'faculty' | 'group';
    targetGroupId: string | null;
    payload: Record<string, unknown>;
  }): Promise<{
    ok: boolean;
    error?: string;
    payment_type_id?: string;
    target_scope?: string;
    target_group_id?: string | null;
    caller_scope?: string;
    session_label?: string | null;
    notified_count?: number;
    target_count?: number;
  }> {
    const { data, error } = await supabase.rpc('create_due_with_scope_check', {
      p_caller_member_id: input.callerMemberId,
      p_target_scope:     input.targetScope,
      p_target_group_id:  input.targetGroupId,
      p_payload:          input.payload,
    });
    if (error) {
      console.error('createDueWithScope RPC error', error);
      return { ok: false, error: error.message };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as {
      ok: boolean;
      error?: string;
      payment_type_id?: string;
      target_scope?: string;
      target_group_id?: string | null;
      caller_scope?: string;
      session_label?: string | null;
      notified_count?: number;
      target_count?: number;
    };
  },

  /**
   * Add a new department/class inside an existing faculty.
   *
   * Atomic — creates the department group + the founder member +
   * the founder admin row in one transaction via the
   * add_department_to_faculty RPC (mig 027).
   *
   * Use case: a student / staff member finds their school and
   * faculty on Payvexo but their department isn't there yet.
   * They click "Add a department" on the faculty page, fill the
   * form, and become the founding admin of that department.
   */
  async addDepartmentToFaculty(input: {
    orgSlug: string;
    facultyShortName: string;

    departmentName: string;
    departmentShortName?: string;
    departmentKind?: 'department' | 'class' | 'general';

    fullName: string;
    email: string;
    phone?: string;
    memberNumber: string;
    password: string;
    userLevel?: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    slug?: string;
    org_id?: string;
    faculty_id?: string;
    faculty_short?: string;
    group_id?: string;
    group_short?: string;
    member_id?: string;
    member_login_id?: string;
  }> {
    const { data, error } = await supabase.rpc('add_department_to_faculty', {
      p_org_slug:              input.orgSlug,
      p_faculty_short_name:    input.facultyShortName,
      p_department_name:       input.departmentName,
      p_department_short_name: input.departmentShortName ?? null,
      p_department_kind:       input.departmentKind ?? 'department',
      p_full_name:             input.fullName,
      p_email:                 input.email,
      p_phone:                 input.phone ?? null,
      p_member_number:         input.memberNumber,
      p_password:              input.password,
      p_user_level:            input.userLevel ?? null,
    });

    if (error) {
      console.error('addDepartmentToFaculty RPC error', error);
      return { ok: false, error: error.message || 'Network error. Please try again.' };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as {
      ok: boolean;
      error?: string;
      slug?: string;
      org_id?: string;
      faculty_id?: string;
      faculty_short?: string;
      group_id?: string;
      group_short?: string;
      member_id?: string;
      member_login_id?: string;
    };
  },

  /**
   * Self-signup into an EXISTING organization + group.
   *
   * Distinct from `bringSchoolOnline` (which creates a new org). This
   * is the path for "I'm new to this class" on the GroupWelcomePage.
   *
   * The RPC honors org gating:
   *   - `allow_self_registration` must be TRUE on the org's settings,
   *     otherwise the call fails with a friendly message asking the
   *     user to get an invite code from their admin.
   *   - `require_admin_approval` flips the new member to pending
   *     (inactive + suspended) until an admin approves them.
   */
  async signupMemberForGroup(input: {
    orgSlug: string;
    groupShortName: string;
    fullName: string;
    email: string;
    phone?: string;
    memberNumber: string;
    password: string;
    level?: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    slug?: string;
    org_id?: string;
    group_id?: string;
    member_id?: string;
    member_login_id?: string;
    requires_approval?: boolean;
  }> {
    const { data, error } = await supabase.rpc('signup_member_for_group', {
      p_org_slug:         input.orgSlug,
      p_group_short_name: input.groupShortName,
      p_full_name:        input.fullName,
      p_email:            input.email,
      p_phone:            input.phone ?? null,
      p_member_number:    input.memberNumber,
      p_password:         input.password,
      p_level:            input.level ?? null,
    });

    if (error) {
      console.error('signupMemberForGroup RPC error', error);
      return { ok: false, error: error.message || 'Network error. Please try again.' };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as {
      ok: boolean;
      error?: string;
      slug?: string;
      org_id?: string;
      group_id?: string;
      member_id?: string;
      member_login_id?: string;
      requires_approval?: boolean;
    };
  },

  /**
   * Fetch a single seed institution by id (used by BringMySchoolPage
   * to pre-fill the form with NUC/Wikidata data).
   */
  async getSeedInstitution(seedId: string): Promise<SeedInstitution | null> {
    const { data, error } = await supabase
      .from('seed_institutions')
      .select('*')
      .eq('id', seedId)
      .maybeSingle();
    if (error) {
      console.error('getSeedInstitution error', error);
      return null;
    }
    return data as SeedInstitution | null;
  },

  /**
   * Bring a school online — atomic creation of org + faculty + class +
   * founder member + founder admin row via the bring_school_online RPC
   * (multi-tenant/migrations/023_bring_school_rpc.sql).
   */
  async bringSchoolOnline(input: {
    fullName: string;
    email: string;
    phone?: string;
    memberNumber: string;
    password: string;

    orgName: string;
    orgShortName?: string;
    orgType: string;
    countryCode?: string;
    state?: string;
    city?: string;
    website?: string;

    seedId?: string | null;

    facultyName?: string;
    facultyShort?: string;

    groupName: string;
    groupShort?: string;
    groupKind?: string;
    userLevel?: string;
  }): Promise<{
    ok: boolean;
    error?: string;
    slug?: string;
    org_id?: string;
    group_id?: string;
    faculty_id?: string;
    member_id?: string;
    member_login_id?: string;
  }> {
    const { data, error } = await supabase.rpc('bring_school_online', {
      p_full_name:      input.fullName,
      p_email:          input.email,
      p_phone:          input.phone ?? null,
      p_member_number:  input.memberNumber,
      p_password:       input.password,
      p_org_name:       input.orgName,
      p_org_short_name: input.orgShortName ?? null,
      p_org_type:       input.orgType,
      p_country_code:   input.countryCode ?? 'NG',
      p_state:          input.state ?? null,
      p_city:           input.city ?? null,
      p_website:        input.website ?? null,
      p_seed_id:        input.seedId ?? null,
      p_faculty_name:   input.facultyName ?? null,
      p_faculty_short:  input.facultyShort ?? null,
      p_group_name:     input.groupName,
      p_group_short:    input.groupShort ?? null,
      p_group_kind:     input.groupKind ?? 'class',
      p_user_level:     input.userLevel ?? null,
    });

    if (error) {
      console.error('bringSchoolOnline RPC error', error);
      return { ok: false, error: error.message || 'Network error. Please try again.' };
    }
    return (data ?? { ok: false, error: 'Empty response' }) as {
      ok: boolean;
      error?: string;
      slug?: string;
      org_id?: string;
      group_id?: string;
      faculty_id?: string;
      member_id?: string;
      member_login_id?: string;
    };
  },

  /**
   * Legacy single-layer search kept for backwards compatibility.
   * New code should call `searchUnified` instead.
   */
  async search(query: string, type?: OrganizationType): Promise<Organization[]> {
    try {
      let dbQuery = supabase
        .from('organizations')
        .select('*')
        .eq('is_active', true)
        .or(`name.ilike.%${query}%,short_name.ilike.%${query}%`);

      if (type) {
        dbQuery = dbQuery.eq('organization_type', type);
      }

      const { data, error } = await dbQuery.limit(10);

      if (error) {
        console.error('Error searching organizations:', error);
        return [];
      }

      return data as Organization[];
    } catch (error) {
      console.error('Error in search:', error);
      return [];
    }
  },

  /**
   * Create a new organization with owner account (full onboarding)
   */
  async create(orgData: {
    name: string;
    short_name: string;
    slug: string;
    organization_type: OrganizationType;
    email?: string;
    phone?: string;
    country?: string;
    currency_code?: string;
    currency_symbol?: string;
  }, ownerData?: {
    group_name: string;
    group_short_name: string;
    owner_name: string;
    owner_member_id: string;
    owner_password: string;
    levels?: string[];
  }): Promise<{ slug: string; organization_id: string; group_id: string; member_id: string } | null> {
    try {
      // Org contact email is no longer globally unique (migration 076): one
      // person may run several orgs and reuse the same contact email.
      const normalizedEmail = orgData.email?.trim().toLowerCase();

      // If owner data provided, use the RPC to create everything in one call
      if (ownerData) {
        const { data, error } = await supabase.rpc('create_organization_with_owner', {
          p_org_name: orgData.name,
          p_org_short_name: orgData.short_name,
          p_org_slug: orgData.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          p_org_type: orgData.organization_type,
          p_owner_name: ownerData.owner_name,
          p_owner_member_id: ownerData.owner_member_id,
          p_owner_password: ownerData.owner_password,
          p_group_name: ownerData.group_name,
          p_group_short_name: ownerData.group_short_name,
        });

        if (error) {
          console.error('Error creating organization:', error);
          throw new Error(error.message || 'Failed to create organization');
        }

        // Update org with additional fields (terminology, branding, etc.)
        const defaults = ORG_TYPE_DEFAULTS[orgData.organization_type];
        const resultData = data as { organization_id: string; slug: string; group_id: string; member_id: string };
        
        await supabase
          .from('organizations')
          .update({
            email: normalizedEmail || null,
            phone: orgData.phone || null,
            country: orgData.country || 'Nigeria',
            currency_code: orgData.currency_code || 'NGN',
            currency_symbol: orgData.currency_symbol || '₦',
            member_label: defaults.member_label,
            member_label_plural: defaults.member_label_plural,
            group_label: defaults.group_label,
            group_label_plural: defaults.group_label_plural,
            payment_label: defaults.payment_label,
            admin_label: defaults.admin_label,
          })
          .eq('id', resultData.organization_id);

        // If caller provided a primary level for the initial group, persist it
        try {
          if (ownerData?.levels && ownerData.levels.length > 0 && resultData?.group_id) {
            const sanitized = this.deduplicateLevels(ownerData.levels);
            if (sanitized.length > 0) {
              const canonical = [this.canonicalizeLevel(sanitized[0])];
              await supabase.from('organization_groups').update({ levels: canonical }).eq('id', resultData.group_id);
            }
          }
        } catch (err) {
          console.warn('Failed to persist initial group levels after RPC:', err);
        }

        return resultData;
      }

      // Fallback: create org only (no owner)
      const defaults = ORG_TYPE_DEFAULTS[orgData.organization_type];

      const { data, error } = await supabase
        .from('organizations')
        .insert({
          ...orgData,
          slug: orgData.slug.toLowerCase().replace(/[^a-z0-9-]/g, '-'),
          email: normalizedEmail || null,
          member_label: defaults.member_label,
          member_label_plural: defaults.member_label_plural,
          group_label: defaults.group_label,
          group_label_plural: defaults.group_label_plural,
          payment_label: defaults.payment_label,
          admin_label: defaults.admin_label,
          primary_color: '#FF6803',
          secondary_color: '#0A0118',
          country: orgData.country || 'Nigeria',
          currency_code: orgData.currency_code || 'NGN',
          currency_symbol: orgData.currency_symbol || '₦',
          timezone: 'Africa/Lagos',
          locale: 'en-NG',
          subscription_plan: 'free',
          is_on_trial: true,
          trial_ends_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating organization:', error);
        return null;
      }

      const org = data as Organization;
      return { slug: org.slug, organization_id: org.id, group_id: '', member_id: '' };
    } catch (error) {
      console.error('Error in create:', error);
      throw error;
    }
  },

  /**
   * Update organization details
   */
  async update(orgId: string, updates: Partial<Organization>): Promise<Organization | null> {
    try {
      // Don't allow updating critical fields via this method
      const { id: _id, created_at: _ca, slug: _slug, ...safeUpdates } = updates;
      void _id; void _ca; void _slug;

      const { data, error } = await supabase
        .from('organizations')
        .update(safeUpdates)
        .eq('id', orgId)
        .select()
        .single();

      if (error) {
        console.error('Error updating organization:', error);
        return null;
      }

      return data as Organization;
    } catch (error) {
      console.error('Error in update:', error);
      return null;
    }
  },

  /**
   * Check if a slug is available
   */
  async isSlugAvailable(slug: string): Promise<boolean> {
    try {
      const { count, error } = await supabase
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .eq('slug', slug.toLowerCase());

      if (error) return false;
      return (count ?? 0) === 0;
    } catch {
      return false;
    }
  },

  async isEmailAvailable(email: string): Promise<boolean> {
    try {
      const normalizedEmail = email.trim().toLowerCase();
      if (!normalizedEmail) return true;

      const { count, error } = await supabase
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .eq('email', normalizedEmail);

      if (error) return false;
      return (count ?? 0) === 0;
    } catch {
      return false;
    }
  },

  // ============================================================
  // GROUP (DEPARTMENT/MINISTRY/CHAPTER) OPERATIONS
  // ============================================================

  /**
   * Deduplicate a levels array: trims whitespace, removes empties,
   * and keeps only the first occurrence (case-insensitive match,
   * preserving the original casing of the first occurrence).
   */
  /**
   * Convert a raw level string into a canonical representation.
   * Examples: "200 Level" -> "200L", "200L" -> "200L",
   * "Primary 1" -> "Primary 1" (normalized spacing/casing).
   */
  canonicalizeLevel(raw: string | null | undefined): string {
    if (!raw) return '';
    const s = raw.trim();
    if (!s) return '';

    // Numeric university-style levels: "100 Level", "200L", "200 L" -> "200L"
    const numMatch = s.match(/^(?:level\s*)?(\d{1,3})(?:\s*level)?$/i) || s.match(/^(\d{1,3})\s*L$/i);
    if (numMatch) {
      const n = Number(numMatch[1]);
      return `${n}L`;
    }

    // If string contains a numeric prefix like "100 Level" in other forms
    const containsNum = s.match(/(\d{1,3})/);
    if (containsNum && /level/i.test(s)) {
      return `${Number(containsNum[1])}L`;
    }

    // Common school forms: Primary/JSS/SS - normalize spacing and title-case
    const lowered = s.toLowerCase();
    if (lowered.startsWith('primary') || lowered.startsWith('jss') || lowered.startsWith('ss')) {
      return s
        .replace(/\s+/g, ' ')
        .split(' ')
        .map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
        .join(' ');
    }

    // Fallback: normalize whitespace
    return s.replace(/\s+/g, ' ');
  },

  deduplicateLevels(levels: string[]): string[] {
    const seen = new Set<string>();
    const result: string[] = [];
    for (const raw of levels) {
      const canonical = this.canonicalizeLevel(raw);
      if (!canonical) continue;
      const key = canonical.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        result.push(canonical);
      }
    }
    return result;
  },

  /**
   * Get all unique levels across every group in an organization.
   * Useful for org-wide level selectors and preventing cross-group duplicates.
   */
  async getOrganizationLevels(organizationId: string): Promise<string[]> {
    const groups = await this.getGroups(organizationId);
    const seen = new Set<string>();
    const result: string[] = [];
    for (const g of groups) {
      if (g.levels) {
        for (const l of g.levels) {
          const canonical = this.canonicalizeLevel(l);
          const key = canonical.toLowerCase();
          if (key && !seen.has(key)) {
            seen.add(key);
            result.push(canonical);
          }
        }
      }
    }
    return result;
  },

  /**
   * Fetch groups for an organization
   */
  async getGroups(organizationId: string): Promise<OrganizationGroup[]> {
    try {
      if (!organizationId) {
        console.warn('[OrgService] getGroups called with empty organizationId');
        return [];
      }

      const { data, error } = await supabase
        .from('organization_groups')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('is_active', true)
        .order('display_order', { ascending: true })
        .order('name');

      if (error) {
        console.error('[OrgService] Error fetching groups:', error.message, error.code);
        throw new Error(error.message);
      }

      return (data || []) as OrganizationGroup[];
    } catch (error) {
      console.error('[OrgService] Error in getGroups:', error);
      throw error;
    }
  },

  /**
   * Create a new group
   */
  async createGroup(groupData: {
    organization_id: string;
    name: string;
    short_name: string;
    code?: string;
    description?: string;
    levels?: string[];
    sections?: string[];
    leader_name?: string;
    leader_title?: string;
    parent_group_id?: string;
    kind?: GroupKind;
  }): Promise<OrganizationGroup | null> {
    try {
      const kind = groupData.kind ?? 'general';
      // Deduplicate levels before inserting and enforce single primary level
      const deduped = groupData.levels ? this.deduplicateLevels(groupData.levels) : [];
      if (kind === 'class' && deduped.length === 0) {
        throw new Error('A class group must include exactly one primary level.');
      }
      if (deduped.length > 1) {
        throw new Error('Only one primary level is allowed per group. Provide a single level.');
      }
      const primaryLevel = deduped.length > 0 ? this.canonicalizeLevel(deduped[0]) : null;
      const sanitized = {
        ...groupData,
        kind,
        levels: primaryLevel ? [primaryLevel] : null,
        display_order: 0,
        is_active: true,
      };

      const { data, error } = await supabase
        .from('organization_groups')
        .insert(sanitized)
        .select()
        .single();

      if (error) {
        console.error('Error creating group:', error);
        throw new Error(error.message || 'Failed to create group');
      }

      return data as OrganizationGroup;
    } catch (error) {
      console.error('Error in createGroup:', error);
      throw error;
    }
  },

  /**
   * Update a group
   * Uses RPC function for better CORS compatibility
   */
  async updateGroup(groupId: string, updates: Partial<OrganizationGroup>): Promise<OrganizationGroup | null> {
    try {
      const callerId = getCurrentMemberId();
      if (!callerId) {
        throw new Error('Please sign in again to update this group.');
      }

      // Deduplicate levels if they're being updated and enforce single primary level
      let levels: string[] | undefined = undefined;
      if (updates.levels) {
        const deduped = this.deduplicateLevels(updates.levels as string[]);
        if (deduped.length > 1) throw new Error('Only one primary level is allowed per group.');
        levels = deduped.length === 0 ? undefined : [this.canonicalizeLevel(deduped[0])];
      }

      const { data, error } = await supabase.rpc('update_organization_group', {
        p_caller_id: callerId,
        p_group_id: groupId,
        p_short_name: updates.short_name || null,
        p_kind: (updates as unknown as Record<string, unknown>).kind || null,
        p_description: updates.description || null,
        p_levels: levels || null,
        p_parent_group_id: (updates as unknown as Record<string, unknown>).parent_group_id || null,
      });

      if (error) throw error;
      return data as OrganizationGroup;
    } catch (error) {
      console.error('Error in updateGroup:', error);
      throw error;
    }
  },

  // ============================================================
  // SETTINGS OPERATIONS
  // ============================================================

  /**
   * Get organization settings
   */
  async getSettings(organizationId: string): Promise<OrganizationSettings | null> {
    try {
      const { data, error } = await supabase
        .from('organization_settings')
        .select('*')
        .eq('organization_id', organizationId)
        .single();

      if (error) return null;
      return data as OrganizationSettings;
    } catch (error) {
      console.error('Error in getSettings:', error);
      return null;
    }
  },

  /**
   * Update organization settings
   */
  async updateSettings(organizationId: string, updates: Partial<OrganizationSettings>): Promise<OrganizationSettings | null> {
    try {
      const { data, error } = await supabase
        .from('organization_settings')
        .update(updates)
        .eq('organization_id', organizationId)
        .select()
        .single();

      if (error) {
        console.error('Error updating settings:', error);
        return null;
      }

      return data as OrganizationSettings;
    } catch (error) {
      console.error('Error in updateSettings:', error);
      return null;
    }
  },

  // ============================================================
  // ACADEMIC PROGRESSION OPERATIONS

  async getAcademicSessions(organizationId: string): Promise<AcademicSessionRecord[]> {
    try {
      const { data, error } = await supabase
        .from('academic_sessions')
        .select('*')
        .eq('organization_id', organizationId)
        .order('start_date', { ascending: false });

      if (error) throw error;
      return (data || []) as AcademicSessionRecord[];
    } catch (error) {
      console.error('Error fetching academic sessions:', error);
      return [];
    }
  },

  async createAcademicSession(sessionData: {
    organization_id: string;
    label: string;
    start_date: string;
    end_date: string;
    is_active?: boolean;
    is_locked?: boolean;
  }): Promise<AcademicSessionRecord | null> {
    try {
      const callerId = getCurrentMemberId();
      if (!callerId) throw new Error('Please sign in again to create this session.');

      const { data, error } = await supabase.rpc('create_academic_session', {
        p_caller_id: callerId,
        p_org_id: sessionData.organization_id,
        p_session_name: sessionData.label,
        p_session_year: sessionData.label,
        p_start_date: sessionData.start_date,
        p_end_date: sessionData.end_date,
        p_is_active: sessionData.is_active ?? false,
      });

      if (error) throw error;
      return data as AcademicSessionRecord;
    } catch (error) {
      console.error('Error creating academic session:', error);
      return null;
    }
  },

  async updateAcademicSession(sessionId: string, updates: Partial<AcademicSessionRecord>): Promise<AcademicSessionRecord | null> {
    try {
      const callerId = getCurrentMemberId();
      if (!callerId) throw new Error('Please sign in again to update this session.');

      const { data, error } = await supabase.rpc('update_academic_session', {
        p_caller_id: callerId,
        p_session_id: sessionId,
        p_session_name: updates.label || null,
        p_session_year: updates.label || null,
        p_start_date: updates.start_date || null,
        p_end_date: updates.end_date || null,
        p_is_active: updates.is_active ?? null,
        p_is_locked: updates.is_locked ?? null,
      });

      if (error) throw error;
      return data as AcademicSessionRecord;
    } catch (error) {
      console.error('Error updating academic session:', error);
      return null;
    }
  },

  async setActiveAcademicSession(organizationId: string, sessionId: string): Promise<boolean> {
    try {
      const callerId = getCurrentMemberId();
      if (!callerId) throw new Error('Please sign in again to update the active session.');

      const { error } = await supabase.rpc('set_active_academic_session', {
        p_caller_id: callerId,
        p_org_id: organizationId,
        p_session_id: sessionId,
      });

      if (error) throw error;
      return true;
    } catch (error) {
      console.error('Error setting active academic session:', error);
      return false;
    }
  },

  async getAcademicTerms(organizationId: string, sessionId?: string): Promise<AcademicTermRecord[]> {
    try {
      let query = supabase
        .from('academic_terms')
        .select('*')
        .eq('organization_id', organizationId)
        .order('sequence', { ascending: true });

      if (sessionId) {
        query = query.eq('session_id', sessionId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data || []) as AcademicTermRecord[];
    } catch (error) {
      console.error('Error fetching academic terms:', error);
      return [];
    }
  },

  async createAcademicTerm(termData: {
    organization_id: string;
    session_id: string;
    name: string;
    sequence: number;
    start_date: string;
    end_date: string;
    promotion_window_starts_at?: string | null;
    promotion_window_ends_at?: string | null;
    status?: AcademicTermRecord['status'];
  }): Promise<AcademicTermRecord | null> {
    try {
      const { data, error } = await supabase
        .from('academic_terms')
        .insert({
          ...termData,
          status: termData.status ?? 'upcoming',
        })
        .select()
        .single();

      if (error) throw error;
      return data as AcademicTermRecord;
    } catch (error) {
      console.error('Error creating academic term:', error);
      return null;
    }
  },

  async updateAcademicTerm(termId: string, updates: Partial<AcademicTermRecord>): Promise<AcademicTermRecord | null> {
    try {
      const { data, error } = await supabase
        .from('academic_terms')
        .update(updates)
        .eq('id', termId)
        .select()
        .single();

      if (error) throw error;
      return data as AcademicTermRecord;
    } catch (error) {
      console.error('Error updating academic term:', error);
      return null;
    }
  },

  async setActiveAcademicTerm(organizationId: string, termId: string): Promise<boolean> {
    try {
      const terms = await this.getAcademicTerms(organizationId);
      const activeTerm = terms.find(term => term.id === termId);

      await Promise.all(
        terms.map(term =>
          supabase.from('academic_terms').update({ status: term.id === termId ? 'active' : term.status === 'active' ? 'upcoming' : term.status }).eq('id', term.id)
        )
      );

      if (activeTerm) {
        await this.updateSettings(organizationId, {
          current_sub_period_label: activeTerm.name,
        });
      }

      return true;
    } catch (error) {
      console.error('Error setting active academic term:', error);
      return false;
    }
  },

  // ============================================================
  // INVITE OPERATIONS
  // ============================================================

  /**
   * Create an invite link
   */
  async createInvite(inviteData: {
    organization_id: string;
    group_id?: string;
    invite_type: 'member' | 'admin' | 'bulk';
    email?: string;
    role?: string;
    max_uses?: number;
    expires_at?: string;
    created_by: string;
  }): Promise<OrganizationInvite | null> {
    try {
      // Ensure `created_by` references an existing `member_admins.id` when possible.
      let createdByAdminId: string | null = null;
      if (inviteData.created_by) {
        // 1) If caller passed an admin id directly, verify it exists
        const { data: adminById } = await supabase
          .from('member_admins')
          .select('id')
          .eq('id', inviteData.created_by)
          .maybeSingle();
        if (adminById && adminById.id) {
          createdByAdminId = adminById.id;
        } else {
          // 2) If they passed a member id, try to find the admin row for that member
          const { data: adminByMember } = await supabase
            .from('member_admins')
            .select('id')
            .eq('member_id', inviteData.created_by)
            .maybeSingle();
          if (adminByMember && adminByMember.id) createdByAdminId = adminByMember.id;
        }
      }

      const { data, error } = await supabase
        .from('organization_invites')
        .insert({
          ...inviteData,
          created_by: createdByAdminId,
          invite_code: Math.random().toString(36).substring(2, 10).toUpperCase(),
          max_uses: inviteData.max_uses || (inviteData.invite_type === 'bulk' ? 100 : 1),
          is_active: true,
        })
        .select()
        .single();

      if (error) {
        console.error('Error creating invite:', error);
        return null;
      }

      return data as OrganizationInvite;
    } catch (error) {
      console.error('Error in createInvite:', error);
      return null;
    }
  },

  /**
   * Validate an invite code
   */
  async validateInvite(code: string): Promise<OrganizationInvite | null> {
    try {
      const { data, error } = await supabase
        .from('organization_invites')
        .select(`
          *,
          organization:organizations(id, name, short_name, slug, organization_type, logo_url, primary_color)
        `)
        .eq('invite_code', code.toUpperCase())
        .eq('is_active', true)
        .single();

      if (error) return null;

      const invite = data as OrganizationInvite & { organization: Organization };

      // Check if expired
      if (invite.expires_at && new Date(invite.expires_at) < new Date()) {
        return null;
      }

      // Check if max uses reached
      if (invite.times_used >= invite.max_uses) {
        return null;
      }

      return invite;
    } catch (error) {
      console.error('Error in validateInvite:', error);
      return null;
    }
  },

  /**
   * Use an invite (increment counter)
   */
  async useInvite(inviteId: string): Promise<boolean> {
    try {
      const { error } = await supabase.rpc('increment_invite_usage', { invite_id: inviteId });
      return !error;
    } catch {
      return false;
    }
  },

  // ============================================================
  // UTILITY
  // ============================================================

  /**
   * Get the default/single organization (backwards compatibility)
   */
  async getDefault(): Promise<Organization | null> {
    try {
      const { data, error } = await supabase
        .from('organizations')
        .select('*')
        .eq('is_active', true)
        .limit(1)
        .single();

      if (error || !data) return null;
      return data as Organization;
    } catch (error) {
      console.error('Error in getDefault:', error);
      return null;
    }
  },

  /**
   * Check if system is in multi-tenant mode
   */
  async isMultiTenant(): Promise<boolean> {
    try {
      const { count, error } = await supabase
        .from('organizations')
        .select('id', { count: 'exact', head: true })
        .eq('is_active', true);

      if (error) return false;
      return (count ?? 0) > 1;
    } catch (error) {
      console.error('Error checking multi-tenant:', error);
      return false;
    }
  },

  /**
   * Get organization stats (for admin dashboards)
   */
  async getStats(organizationId: string): Promise<{
    totalMembers: number;
    totalGroups: number;
    totalPayments: number;
    totalCollected: number;
    pendingPayments: number;
  }> {
    try {
      const [members, groups, payments] = await Promise.all([
        supabase.from('organization_members').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_active', true),
        supabase.from('organization_groups').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('is_active', true),
        supabase.from('payments').select('amount, status').eq('organization_id', organizationId),
      ]);

      const paymentData = payments.data || [];
      const totalCollected = paymentData
        .filter(p => p.status === 'approved')
        .reduce((sum, p) => sum + Number(p.amount), 0);
      const pendingPayments = paymentData.filter(p => p.status === 'pending').length;

      return {
        totalMembers: members.count ?? 0,
        totalGroups: groups.count ?? 0,
        totalPayments: paymentData.length,
        totalCollected,
        pendingPayments,
      };
    } catch (error) {
      console.error('Error getting stats:', error);
      return { totalMembers: 0, totalGroups: 0, totalPayments: 0, totalCollected: 0, pendingPayments: 0 };
    }
  },

  // ============================================================
  // DEPARTMENT / GROUP WITHIN EXISTING ORG
  // ============================================================

  /**
   * Create a new department/group within an existing organization,
   * along with an owner account for that department.
   */
  async createDepartment(orgId: string, deptData: {
    group_name: string;
    group_short_name: string;
    owner_name: string;
    owner_member_id: string;
    owner_password: string;
    description?: string;
    parent_group_id?: string;
    levels?: string[];
    group_kind?: GroupKind;
  }): Promise<{ group_id: string; member_id: string; slug: string } | null> {
    try {
      // 1. Check if group short_name already exists in this org
      const { data: existing } = await supabase
        .from('organization_groups')
        .select('id')
        .eq('organization_id', orgId)
        .eq('short_name', deptData.group_short_name.toUpperCase())
        .single();

      if (existing) {
        throw new Error('A group with this short name already exists in this organization');
      }

      // 2. Create the group
      const kind = deptData.group_kind ?? 'general';
      // Prepare levels: require exactly one primary level for a class group
      const sanitizedLevels = deptData.levels ? this.deduplicateLevels(deptData.levels) : [];
      if (kind === 'class' && sanitizedLevels.length === 0) {
        throw new Error('A class must include exactly one primary level (e.g. "200L").');
      }
      if (sanitizedLevels.length > 1) {
        throw new Error('Only one primary level is allowed per group. Provide a single level.');
      }
      const primaryLevel = sanitizedLevels.length > 0 ? this.canonicalizeLevel(sanitizedLevels[0]) : null;

      const { data: group, error: groupError } = await supabase
        .from('organization_groups')
        .insert({
          organization_id: orgId,
          name: deptData.group_name,
          short_name: deptData.group_short_name.toUpperCase(),
          description: deptData.description || null,
          kind,
          parent_group_id: kind === 'class' ? (deptData.parent_group_id || null) : null,
          levels: primaryLevel ? [primaryLevel] : null,
          is_active: true,
        })
        .select()
        .single();

      if (groupError) throw new Error(groupError.message);

      // 3. Hash the password
      const { data: hashedPw, error: hashError } = await supabase.rpc('hash_password', {
        p_password: deptData.owner_password,
      });
      if (hashError) throw new Error('Failed to hash password');

      // 4. Create the owner member
      const { data: member, error: memberError } = await supabase
        .from('organization_members')
        .insert({
          organization_id: orgId,
          group_id: group.id,
          full_name: deptData.owner_name,
          member_id: deptData.owner_member_id,
          password_hash: hashedPw,
          level: (group?.levels && group.levels.length > 0) ? this.canonicalizeLevel(group.levels[0]) : null,
          is_active: true,
          force_password_change: false,
        })
        .select()
        .single();

      if (memberError) throw new Error(memberError.message);

      // 5. Give the owner admin privileges
      await supabase.from('member_admins').insert({
        member_id: member.id,
        organization_id: orgId,
        group_id: group.id,
        role: kind === 'faculty' ? 'faculty_admin' : 'group_admin',
        can_create_payments: true,
        can_approve_payments: true,
        can_manage_members: true,
        can_view_analytics: true,
      });

      // 6. Get the org slug for navigation
      const { data: org } = await supabase
        .from('organizations')
        .select('slug')
        .eq('id', orgId)
        .single();

      return {
        group_id: group.id,
        member_id: member.id,
        slug: org?.slug || '',
      };
    } catch (error) {
      console.error('Error creating department:', error);
      throw error;
    }
  },
};

export default organizationService;
