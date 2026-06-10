import { useEffect, useMemo, useState } from 'react';
import { supabase } from '@/config/supabase';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import type { MemberAdmin, OrganizationGroup } from '@/types/multiTenant';

export type RoleTabKind = 'student' | 'exec' | 'pending';
export type RoleScopeLevel = 'org' | 'unit' | 'group';

export interface RoleTab {
  key: string;
  kind: RoleTabKind;
  label: string;
  subLabel?: string;
  adminId?: string;
  groupId?: string | null;
  scopeLevel?: RoleScopeLevel;
  /**
   * Kind of the group this role is scoped to (faculty / department /
   * class / level / ...). The role-switcher uses this to pick the
   * right landing dashboard: scope='unit' + groupKind='department'
   * lands on /admin/dept, scope='unit' + groupKind='faculty' lands
   * on /admin/faculty, otherwise we fall back to /admin/dashboard.
   */
  groupKind?: string | null;
  verified: boolean;
  pending?: boolean;
  role?: string;
}

const PENDING_STATUSES = ['submitted', 'awaiting_votes', 'under_review', 'votes_complete'];

function titleCase(input: string): string {
  return input
    .replace(/_/g, ' ')
    .split(' ')
    .map((w) => (w ? w[0].toUpperCase() + w.slice(1) : ''))
    .join(' ')
    .trim();
}

function normalizeRoleLabel(roleLabel: string, params: { scopeLevel: RoleScopeLevel; orgType?: string; role?: string }): string {
  const { scopeLevel, orgType, role } = params;
  if (scopeLevel === 'org' && (orgType === 'university' || orgType === 'school')) {
    if (roleLabel.toLowerCase().includes('sug')) return roleLabel;
    if (role === 'president') return 'SUG President';
    return `SUG ${roleLabel}`;
  }
  return roleLabel;
}

function buildScopeLabel(params: {
  scopeLevel: RoleScopeLevel;
  orgType?: string;
  orgUnitLabel?: string | null;
  orgGroupLabel?: string | null;
  groupKind?: string | null;
}): string {
  const { scopeLevel, orgType, orgUnitLabel, orgGroupLabel, groupKind } = params;

  if (scopeLevel === 'org') {
    return orgType === 'university' || orgType === 'school' ? 'SUG Exec' : 'Org Exec';
  }
  // scope='unit' covers BOTH department and faculty execs (the DB only
  // has org|unit|group). They must be distinguished by groupKind, or a
  // departmental president gets mislabeled "Faculty Exec" — the bug the
  // user hit on the role switcher. The previous code returned the
  // faculty/unit label here BEFORE the groupKind checks below ever ran.
  if (scopeLevel === 'unit') {
    if (groupKind === 'department') return 'Department Exec';
    if (groupKind === 'faculty' || groupKind === 'college') return `${orgUnitLabel || 'Faculty'} Exec`;
    if (groupKind === 'association') return 'Association Exec';
    // Genuinely unknown unit-tier group — fall back to the org's unit label.
    return `${orgUnitLabel || 'Unit'} Exec`;
  }
  if (groupKind === 'class' || groupKind === 'level') return 'Class Exec';
  if (groupKind === 'department') return 'Department Exec';
  if (groupKind === 'association') return 'Association Exec';
  if (groupKind === 'faculty' || groupKind === 'college') return `${orgUnitLabel || 'Faculty'} Exec`;
  return `${orgGroupLabel || 'Group'} Exec`;
}

export function useUserRoles() {
  const { user, organization, group } = useMultiTenantAuth();
  const [roles, setRoles] = useState<RoleTab[]>([]);
  const [loading, setLoading] = useState(true);

  const memberId = user?.id;
  const orgId = organization?.id;

  useEffect(() => {
    let active = true;

    const loadRoles = async () => {
      if (!memberId || !orgId || !organization) {
        setRoles([]);
        setLoading(false);
        return;
      }

      setLoading(true);

      const adminRecords = (user?.admin_records ?? []) as MemberAdmin[];
      const adminGroupIds = adminRecords
        .map((ar) => ar.group_id)
        .filter((id): id is string => Boolean(id));

      const { data: claims } = await supabase
        .from('claim_requests')
        .select('id, position_title, claimed_scope, claimed_group_id, claimed_unit_group_id, status')
        .eq('claimant_user_id', memberId)
        .eq('organization_id', orgId)
        .in('status', PENDING_STATUSES)
        .order('created_at', { ascending: false });

      const claimGroupIds = (claims ?? [])
        .map((c) => (c.claimed_scope === 'unit' ? c.claimed_unit_group_id : c.claimed_group_id))
        .filter((id): id is string => Boolean(id));

      const uniqueGroupIds = Array.from(new Set([...adminGroupIds, ...claimGroupIds]));
      let groups: OrganizationGroup[] = [];
      if (uniqueGroupIds.length > 0) {
        const { data: groupRows } = await supabase
          .from('organization_groups')
          .select('id, name, short_name, kind')
          .in('id', uniqueGroupIds);
        groups = (groupRows ?? []) as OrganizationGroup[];
      }

      const groupMap = new Map<string, OrganizationGroup>();
      groups.forEach((g) => {
        groupMap.set(g.id, g);
      });

      const studentRole: RoleTab = {
        key: 'student',
        kind: 'student',
        label: organization.member_label || 'Student',
        subLabel: group?.short_name || group?.name || undefined,
        verified: true,
      };

      const execRoles = adminRecords
        .filter((ar) => ar.is_active)
        .map((ar) => {
          const groupInfo = ar.group_id ? groupMap.get(ar.group_id) : null;

          // The founder's money-locked SETUP STEWARD (mig 111). It's
          // org-scoped but NOT a governance role — don't dress it up as
          // "SUG Exec" / prepend "SUG". It's a selectable setup role so
          // the founder can reach the admin/setup surfaces; its powers
          // are gated by the can_* flags (money off), not by this label.
          if (ar.role === 'org_setup') {
            return {
              key: `admin:${ar.id}`,
              kind: 'exec',
              label: ar.role_label || 'Founder · setup',
              subLabel: 'Setup steward',
              adminId: ar.id,
              groupId: ar.group_id ?? null,
              groupKind: groupInfo?.kind ?? null,
              scopeLevel: 'org' as RoleScopeLevel,
              verified: true,
              pending: false,
              role: ar.role,
            } as RoleTab;
          }

          const baseLabel = ar.role_label || ar.custom_role_name || titleCase(ar.role || 'exec');
          const roleLabel = normalizeRoleLabel(baseLabel, {
            scopeLevel: (ar.scope_level || 'group') as RoleScopeLevel,
            orgType: organization.organization_type,
            role: ar.role,
          });
          const scopeLevel = (ar.scope_level || 'group') as RoleScopeLevel;
          const scopeLabel = buildScopeLabel({
            scopeLevel,
            orgType: organization.organization_type,
            orgUnitLabel: organization.unit_label || null,
            orgGroupLabel: organization.group_label || null,
            groupKind: groupInfo?.kind || null,
          });
          const groupLabel = groupInfo ? (groupInfo.short_name || groupInfo.name) : null;
          const verified = (ar.verification_layer ?? 0) >= 4;

          return {
            key: `admin:${ar.id}`,
            kind: verified ? 'exec' : 'pending',
            label: roleLabel,
            subLabel: groupLabel ? `${scopeLabel} • ${groupLabel}` : scopeLabel,
            adminId: ar.id,
            groupId: ar.group_id ?? null,
            groupKind: groupInfo?.kind ?? null,
            scopeLevel,
            verified,
            pending: !verified,
            role: ar.role,
          } as RoleTab;
        });

      const pendingRoles = (claims ?? []).map((c) => {
        const claimGroupId = c.claimed_scope === 'unit' ? c.claimed_unit_group_id : c.claimed_group_id;
        const groupInfo = claimGroupId ? groupMap.get(claimGroupId) : null;
        const scopeLevel = (c.claimed_scope || 'group') as RoleScopeLevel;
        const scopeLabel = buildScopeLabel({
          scopeLevel,
          orgType: organization.organization_type,
          orgUnitLabel: organization.unit_label || null,
          orgGroupLabel: organization.group_label || null,
          groupKind: groupInfo?.kind || null,
        });
        const groupLabel = groupInfo ? (groupInfo.short_name || groupInfo.name) : null;
        const label = c.position_title || 'Pending role';
        return {
          key: `claim:${c.id}`,
          kind: 'pending',
          label,
          subLabel: groupLabel ? `${scopeLabel} • ${groupLabel}` : scopeLabel,
          groupId: claimGroupId ?? null,
          groupKind: groupInfo?.kind ?? null,
          scopeLevel,
          verified: false,
          pending: true,
        } as RoleTab;
      });

      const verifiedExecs = execRoles.filter((r) => r.kind === 'exec');
      const pendingExecs = execRoles.filter((r) => r.kind === 'pending');
      const allRoles = [studentRole, ...verifiedExecs, ...pendingExecs, ...pendingRoles];

      const scopeOrder: Record<RoleScopeLevel, number> = { org: 0, unit: 1, group: 2 };
      const sorted = [
        studentRole,
        ...allRoles
          .slice(1)
          .sort((a, b) => {
            const aScope = a.scopeLevel ? scopeOrder[a.scopeLevel] : 99;
            const bScope = b.scopeLevel ? scopeOrder[b.scopeLevel] : 99;
            if (aScope !== bScope) return aScope - bScope;
            return (a.subLabel || '').localeCompare(b.subLabel || '');
          }),
      ];

      if (active) {
        setRoles(sorted);
        setLoading(false);
      }
    };

    void loadRoles();

    return () => {
      active = false;
    };
  }, [memberId, orgId, organization, user?.admin_records, group?.id, group?.name, group?.short_name]);

  const hasExec = useMemo(() => roles.some((r) => r.kind === 'exec' || r.kind === 'pending'), [roles]);

  return { roles, loading, hasExec };
}

export default useUserRoles;
