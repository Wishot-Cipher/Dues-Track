/**
 * Organization Service
 * API service for fetching and managing organizations, groups, and settings
 * Payvexo Multi-Tenant
 */

import { supabase } from '@/config/supabase';
import type { Organization, OrganizationGroup, OrganizationSettings, OrganizationInvite, GroupKind } from '@/types/multiTenant';
import type { OrganizationType } from '@/config/constants';
import { ORG_TYPE_DEFAULTS } from '@/types/multiTenant';

function getCurrentMemberId(): string | null {
  try {
    return localStorage.getItem('pvx_member_id');
  } catch {
    return null;
  }
}

export interface OrganizationWithGroups extends Organization {
  groups: OrganizationGroup[];
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
      const { data, error } = await supabase
        .from('organizations')
        .select(`
          *,
          settings:organization_settings(*)
        `)
        .eq('slug', slug.toLowerCase())
        .eq('is_active', true)
        .single();

      if (error) {
        console.error('Error fetching organization:', error);
        return null;
      }

      return data as Organization;
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
   * Search organizations by name
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
      const normalizedEmail = orgData.email?.trim().toLowerCase();
      if (normalizedEmail) {
        const emailAvailable = await this.isEmailAvailable(normalizedEmail);
        if (!emailAvailable) {
          throw new Error('This organization email is already in use.');
        }
      }

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
          primary_color: '#6C3AED',
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
        p_group_kind: (updates as unknown as Record<string, unknown>).group_kind || null,
        p_description: updates.description || null,
        p_levels: levels || null,
        p_faculty_id: (updates as unknown as Record<string, unknown>).faculty_id || null,
        p_department_id: (updates as unknown as Record<string, unknown>).department_id || null,
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
      const { data, error } = await supabase
        .from('organization_invites')
        .insert({
          ...inviteData,
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
