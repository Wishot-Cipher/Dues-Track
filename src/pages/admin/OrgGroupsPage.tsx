import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Building2,
  Layers,
  Search,
  Plus,
  Edit2,
  GraduationCap,
  Users,
  X,
  AlertCircle,
  ChevronRight,
  ChevronDown,
  BookOpen,
  Network,
  Receipt,
  Banknote,
  CheckCircle2,
} from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { supabase } from '@/config/supabase';
import organizationService from '@/services/organizationService';
import type { OrganizationGroup, GroupKind } from '@/types/multiTenant';
import { getOrgTiers, getTierLabel } from '@/config/constants';
import EmptyState from '@/components/ui/EmptyState';
import Textarea from '@/components/ui/Textarea';
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Modal from '@/components/ui/Modal';
// Input component not used in this page

// ── Design tokens ───────────────────────────────────────────────────────────
const tk = {
  primary:    '#FF6803',
  mint:       '#30FFAC',
  blue:       '#3b82f6',
  amber:      '#f59e0b',
  cyan:       '#06b6d4',
  pink:       '#ec4899',
  bg:         '#0F0703',
  card:       'rgba(255,255,255,0.03)',
  cardBorder: 'rgba(255,255,255,0.07)',
  inputBg:    'rgba(255,255,255,0.05)',
  inputBor:   'rgba(255,255,255,0.1)',
  textSec:    'rgba(255,255,255,0.5)',
  textTer:    'rgba(255,255,255,0.28)',
}

const EASE = [0.22, 1, 0.36, 1] as const

const fadeUp = (delay = 0) => ({
  initial: { opacity: 0, y: 20 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.48, delay, ease: EASE },
})

const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.055, delayChildren: 0.05 } },
}
const cardVariants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.36, ease: EASE } },
}

// ── Kind → color mapping ────────────────────────────────────────────────────
const KIND_COLORS: Record<string, string> = {
  faculty:    tk.blue,
  class:      tk.primary,
  department: tk.primary,
  general:    tk.cyan,
  year:       tk.mint,
  level:      tk.pink,
  other:      tk.amber,
}
function kindColor(kind?: string) {
  return KIND_COLORS[kind?.toLowerCase() || ''] || tk.primary
}
function kindIcon(kind?: string) {
  const k = kind?.toLowerCase() || ''
  if (k === 'faculty') return <GraduationCap className="w-5 h-5" />
  if (k === 'class' || k === 'level') return <BookOpen className="w-5 h-5" />
  if (k === 'department') return <Network className="w-5 h-5" />
  return <Building2 className="w-5 h-5" />
}

// ── Interfaces ──────────────────────────────────────────────────────────────
interface GroupFormData {
  name: string; short_name: string; description: string;
  kind: GroupKind; parent_group_id: string; level: string;
}
const DEFAULT_FORM: GroupFormData = {
  name: '', short_name: '', description: '', kind: 'general', parent_group_id: '', level: '',
}
type GroupTab = 'all' | 'faculty' | 'class'

// ── Pill component ──────────────────────────────────────────────────────────
function KindPill({ kind, orgType }: { kind?: string; orgType?: string }) {
  const color = kindColor(kind)
  // Show the per-org-type label (Ministry/Section/Branch…) instead of
  // the raw canonical kind (department/class) so a church admin never
  // sees academic words. Falls back to the kind when no orgType.
  const label = orgType ? getTierLabel(orgType, kind || 'general') : (kind || 'general')
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide" style={{ background: `${color}15`, color }}>
      {label}
    </span>
  )
}

// ── Field label ─────────────────────────────────────────────────────────────
function FL({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: tk.textTer }}>
      {children}{required && <span className="ml-0.5" style={{ color: tk.primary }}>*</span>}
    </label>
  )
}

// ── Tab button ──────────────────────────────────────────────────────────────
function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <motion.button
      whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}
      onClick={onClick}
      className="px-4 py-2 rounded-xl text-sm font-semibold transition-all"
      style={{
        background: active ? `linear-gradient(135deg, ${tk.primary}, #FFAC5F)` : 'rgba(255,255,255,0.05)',
        color: active ? '#fff' : tk.textSec,
        border: `1px solid ${active ? 'transparent' : tk.cardBorder}`,
        boxShadow: active ? `0 4px 16px ${tk.primary}28` : 'none',
      }}
    >
      {children}
    </motion.button>
  )
}

// ── Group card ──────────────────────────────────────────────────────────────
function GroupCard({
  group, groups, isAcademicOrg, orgType, onEdit, canEdit,
}: {
  group: OrganizationGroup; groups: OrganizationGroup[];
  isAcademicOrg: boolean;
  orgType?: string;
  onEdit: (g: OrganizationGroup) => void;
  canEdit: boolean;
}) {
  const [hov, setHov] = useState(false)
  const kc = kindColor(group.kind)
  const ki = kindIcon(group.kind)
  // const kindLabel not used — UI shows labels directly
  const primaryLevel = group.levels?.[0] ? organizationService.canonicalizeLevel(group.levels[0]) : null
  const parentName = group.parent_group_id ? (groups.find(g => g.id === group.parent_group_id)?.name || 'Unknown') : null

  return (
    <motion.div
      variants={cardVariants}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      className="rounded-[20px] overflow-hidden transition-shadow"
      style={{
        background: hov ? 'rgba(255,255,255,0.04)' : tk.card,
        border: `1px solid ${hov ? kc + '35' : tk.cardBorder}`,
        boxShadow: hov ? `0 8px 32px rgba(0,0,0,0.28)` : 'none',
      }}
    >
      {/* Top accent */}
      <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${kc}70, transparent)` }} />

      <div className="p-5">
        <div className="flex items-start gap-4">
          {/* Icon */}
          <motion.div
            animate={{ scale: hov ? 1.08 : 1 }}
            transition={{ duration: 0.2 }}
            className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
            style={{ background: `${kc}15`, color: kc, border: `1px solid ${kc}25` }}
          >
            {ki}
          </motion.div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <h3 className="font-black text-white text-base leading-tight truncate">{group.name}</h3>
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-md font-mono" style={{ background: `${kc}15`, color: kc }}>
                    {group.short_name}
                  </span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <KindPill kind={group.kind} orgType={orgType} />
                  {primaryLevel && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold" style={{ background: 'rgba(255,255,255,0.06)', color: tk.textSec }}>
                      L{primaryLevel}
                    </span>
                  )}
                  {isAcademicOrg && parentName && group.kind !== 'faculty' && (
                    <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: tk.textTer }}>
                      <ChevronRight className="w-2.5 h-2.5" /> {parentName}
                    </span>
                  )}
                </div>
              </div>

              {/* Edit btn — hidden when the viewer doesn't own this
                  tier. Other rows stay visible but read-only. */}
              {canEdit && (
                <motion.button
                  whileHover={{ scale: 1.06 }} whileTap={{ scale: 0.94 }}
                  onClick={() => onEdit(group)}
                  className="shrink-0 w-8 h-8 rounded-xl flex items-center justify-center transition-all"
                  style={{
                    background: hov ? `${kc}18` : 'rgba(255,255,255,0.04)',
                    color: hov ? kc : tk.textTer,
                    border: `1px solid ${hov ? kc + '30' : tk.cardBorder}`,
                  }}
                >
                  <Edit2 className="w-3.5 h-3.5" />
                </motion.button>
              )}
            </div>

            {/* Description */}
            {group.description && (
              <p className="mt-2.5 text-xs leading-5 line-clamp-2" style={{ color: tk.textSec }}>
                {group.description}
              </p>
            )}
          </div>
        </div>
      </div>
    </motion.div>
  )
}

// ── Styled text input ────────────────────────────────────────────────────────
function SInput({ value, onChange, placeholder, type = 'text', maxLength }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; maxLength?: number;
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type={type}
      value={value}
      maxLength={maxLength}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all placeholder-white/20"
      style={{
        background: tk.inputBg,
        border: `1px solid ${focused ? tk.primary + '60' : tk.inputBor}`,
        boxShadow: focused ? `0 0 0 3px ${tk.primary}12` : 'none',
      }}
    />
  )
}

// ── Main page ────────────────────────────────────────────────────────────────
// ── Orphan / misplaced group cleanup ──────────────────────────────────────
//   Drives the panel that fixes the state left over before migration 079
//   (e.g. a "CVE" group that's a sibling of its faculty instead of a child,
//   or a class with no department parent). Calls the find / reparent / merge
//   / delete RPCs from mig 079.

interface Orphan {
  id: string;
  name: string;
  short_name: string;
  kind: string;
  parent_group_id: string | null;
  parent_kind: string | null;
  parent_name: string | null;
  member_count: number;
  issue:
    | 'department_orphan' | 'department_wrong_parent'
    | 'class_orphan' | 'class_wrong_parent'
    | 'faculty_has_parent';
}

const ISSUE_LABEL: Record<Orphan['issue'], string> = {
  department_orphan:       'Department has no faculty',
  department_wrong_parent: 'Department under the wrong kind of parent',
  class_orphan:            'Class has no department',
  class_wrong_parent:      'Class under the wrong kind of parent',
  faculty_has_parent:      'Faculty should be top-level',
};

export default function OrgGroupsPage() {
  const { organization, user } = useMultiTenantAuth()
  const { theme } = useTheme()
  // Themed tokens for the page chrome (background, surface, text).
  // The legacy `tk` const below still drives accent / kind colors that
  // were never theme-aware — keeping it avoids touching every per-card
  // gradient. `tt` is the source of truth for surfaces the user sees
  // as "the page" — wash, card background, text.
  const tt = useMemo(() => getDashboardTokens(theme), [theme])
  const [groups, setGroups]         = useState<OrganizationGroup[]>([])
  const [loading, setLoading]       = useState(true)
  const [error, setError]           = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [activeTab, setActiveTab]   = useState<GroupTab>('all')
  const [showModal, setShowModal]   = useState(false)
  const [saving, setSaving]         = useState(false)
  const [formError, setFormError]   = useState('')
  const [form, setForm]             = useState<GroupFormData>(DEFAULT_FORM)
  const [editTarget, setEditTarget] = useState<OrganizationGroup | null>(null)
  // Per-group stats — fetched once after groups load. Used to power
  // the tree-row badges (members, active dues, payout configured).
  // Each map is keyed by group_id.
  const [duesCounts, setDuesCounts] = useState<Map<string, number>>(new Map())
  const [payoutFlags, setPayoutFlags] = useState<Set<string>>(new Set())
  // Tree expansion state — the set of group ids the user has
  // explicitly toggled. Top-level rows default to OPEN (so the user
  // sees the tree at a glance); deeper rows default to closed.
  // Toggling a node flips its bit in this set, so an opened-by-default
  // top-level row appears in this set once the user closes it; a
  // closed-by-default child row appears once the user opens it.
  const [toggledKeys, setToggledKeys] = useState<Set<string>>(new Set())
  const toggleExpand = useCallback((id: string) => {
    setToggledKeys(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }, [])

  // ── Orphan cleanup state ────────────────────────────────────────────────
  const [orphans, setOrphans] = useState<Orphan[]>([])
  const [orphansLoading, setOrphansLoading] = useState(true)
  const [orphanBusy, setOrphanBusy] = useState<string | null>(null)
  const [orphanAction, setOrphanAction] = useState<
    | { kind: 'reparent' | 'merge' | 'delete'; target: Orphan }
    | null
  >(null)
  const [orphanPickId, setOrphanPickId] = useState<string>('')
  const [orphanError, setOrphanError] = useState<string>('')

  const isAcademicOrg    = organization?.organization_type === 'university' || organization?.organization_type === 'school'
  const classLabel       = (organization?.organization_type === 'university' || organization?.organization_type === 'school')
    ? 'Department'
    : 'Class'
  const classLabelPlural = classLabel === 'Class' ? 'Classes' : `${classLabel}s`
  const groupLabel       = organization?.group_label || 'Group'
  const groupLabelPlural = organization?.group_label_plural || 'Groups'

  const fetchGroups = useCallback(async () => {
    if (!organization) return
    setLoading(true); setError('')
    try {
      const data = await organizationService.getGroups(organization.id)
      setGroups(data || [])
    } catch { setError('Unable to load groups. Please try again.') }
    finally { setLoading(false) }
  }, [organization])

  useEffect(() => { void fetchGroups() }, [fetchGroups])

  // ── Per-group stats: active dues count + payout-configured flag.
  // Two cheap aggregates so the tree rows can show real numbers
  // instead of just decorating with kind pills. payout column is
  // mig 092; if the column isn't there yet the query gracefully
  // returns an empty set rather than throwing.
  const fetchGroupStats = useCallback(async () => {
    if (!organization || groups.length === 0) return
    const orgId = organization.id
    try {
      const { data: dues } = await supabase
        .from('payment_types')
        .select('group_id')
        .eq('organization_id', orgId)
        .eq('is_active', true)
      const counts = new Map<string, number>()
      ;(dues || []).forEach((row) => {
        const gid = (row as { group_id: string | null }).group_id
        if (!gid) return
        counts.set(gid, (counts.get(gid) || 0) + 1)
      })
      setDuesCounts(counts)
    } catch {
      // Payment-types read failed (RLS, etc.) — leave duesCounts empty.
    }
    try {
      const { data: payoutRows } = await supabase
        .from('organization_groups')
        .select('id, paystack_subaccount_code')
        .eq('organization_id', orgId)
      const flags = new Set<string>()
      ;(payoutRows || []).forEach((row) => {
        const r = row as { id: string; paystack_subaccount_code: string | null }
        if (r.paystack_subaccount_code) flags.add(r.id)
      })
      setPayoutFlags(flags)
    } catch {
      // Migration 092 not applied yet — payout flags stay empty
      // and the chip just renders as "not set". No throw.
    }
  }, [organization, groups.length])

  useEffect(() => { void fetchGroupStats() }, [fetchGroupStats])

  // ── Orphan detection: pull every group that violates faculty→dept→class.
  //    Academic orgs only — the RPC short-circuits for everything else.
  const loadOrphans = useCallback(async () => {
    if (!organization) { setOrphans([]); setOrphansLoading(false); return }
    setOrphansLoading(true)
    const { data } = await supabase.rpc('find_misplaced_groups', { p_org_id: organization.id })
    if (data && (data as { ok?: boolean }).ok) {
      setOrphans(((data as { orphans?: Orphan[] }).orphans) || [])
    } else {
      setOrphans([])
    }
    setOrphansLoading(false)
  }, [organization])
  useEffect(() => { void loadOrphans() }, [loadOrphans])

  // ── Action runner — calls reparent / merge / delete RPCs. Refreshes both
  //    the orphans list and the main groups list on success.
  const runOrphanAction = async () => {
    if (!orphanAction || !user?.id) return
    setOrphanError('')
    setOrphanBusy(orphanAction.target.id)
    try {
      if (orphanAction.kind === 'reparent') {
        if (!orphanPickId) { setOrphanError('Pick a new parent.'); setOrphanBusy(null); return }
        const { data } = await supabase.rpc('reparent_group', {
          p_caller_member_id: user.id,
          p_group_id:         orphanAction.target.id,
          p_new_parent_id:    orphanPickId,
        })
        if (!data?.ok) { setOrphanError(data?.error || 'Could not move that group.'); setOrphanBusy(null); return }
      } else if (orphanAction.kind === 'merge') {
        if (!orphanPickId) { setOrphanError('Pick a target group to merge into.'); setOrphanBusy(null); return }
        const { data } = await supabase.rpc('merge_groups', {
          p_caller_member_id: user.id,
          p_source_group_id:  orphanAction.target.id,
          p_target_group_id:  orphanPickId,
        })
        if (!data?.ok) { setOrphanError(data?.error || 'Could not merge those groups.'); setOrphanBusy(null); return }
      } else if (orphanAction.kind === 'delete') {
        const { data } = await supabase.rpc('delete_empty_group', {
          p_caller_member_id: user.id,
          p_group_id:         orphanAction.target.id,
        })
        if (!data?.ok) { setOrphanError(data?.error || 'Could not delete that group.'); setOrphanBusy(null); return }
      }
      setOrphanAction(null); setOrphanPickId('')
      await Promise.all([loadOrphans(), fetchGroups()])
    } catch (e) {
      setOrphanError(e instanceof Error ? e.message : 'Action failed.')
    } finally {
      setOrphanBusy(null)
    }
  }

  // What groups can serve as a new parent for THIS orphan?
  //   class  → list active departments
  //   department → list active faculties/colleges
  //   faculty (with parent) → must clear parent — handled by passing NULL
  const validParentsFor = useCallback((orphan: Orphan): OrganizationGroup[] => {
    const k = orphan.kind?.toLowerCase()
    if (k === 'class' || k === 'level') return groups.filter(g => g.kind === 'department')
    if (k === 'department') return groups.filter(g => g.kind === 'faculty' || g.kind === 'college')
    return []
  }, [groups])

  // For merge: another group of the SAME kind that isn't itself an orphan
  // (so we don't merge a broken group into another broken one).
  const validMergeTargetsFor = useCallback((orphan: Orphan): OrganizationGroup[] => {
    const orphanIds = new Set(orphans.map(o => o.id))
    return groups.filter(g => g.kind === orphan.kind && g.id !== orphan.id && !orphanIds.has(g.id))
  }, [groups, orphans])

  // ── Scope to the caller's active role ────────────────────────────
  // Before this, the page rendered EVERY faculty + class in the org,
  // even when the caller is a unit-scope (dept/faculty) exec who
  // only manages a single branch. A faculty exec for "Engineering"
  // would see "Medicine", "Arts", etc. — confusing AND not their
  // business. We now narrow to the active role's subtree.
  //
  // Rules:
  //   active role = org-scope (or none) → see everything (legacy)
  //   active role = unit-scope + faculty → see THAT faculty + all
  //     groups whose parent chain leads to it
  //   active role = unit-scope + dept   → see THAT dept + its classes
  //   active role = group-scope         → minScope:'unit' already
  //     hides the nav link; if they deep-link here, scope to just
  //     their own group so they don't see siblings.
  const { activeRole } = useActiveRole({
    orgId: organization?.id,
    memberId: user?.id,
  });

  // Build a set of in-scope group ids by walking down from the active
  // role's group. For org-scope (or no role yet) the set is "every
  // group" — represented by null so we skip the filter entirely.
  const inScopeIds = useMemo<Set<string> | null>(() => {
    if (activeRole?.kind !== 'exec') return null;
    if (activeRole.scopeLevel === 'org') return null;
    const rootId = activeRole.groupId;
    if (!rootId) return null;
    const out = new Set<string>([rootId]);
    const stack = [rootId];
    while (stack.length) {
      const id = stack.pop()!;
      for (const g of groups) {
        if (g.parent_group_id === id && !out.has(g.id)) {
          out.add(g.id);
          stack.push(g.id);
        }
      }
    }
    return out;
  }, [activeRole?.kind, activeRole?.scopeLevel, activeRole?.groupId, groups]);

  // The displayed groups list — filtered to the caller's subtree.
  const scopedGroups = useMemo(
    () => inScopeIds ? groups.filter(g => inScopeIds.has(g.id)) : groups,
    [groups, inScopeIds],
  );

  // Find the root group's name so we can name the scope banner.
  const scopeRootName = useMemo(() => {
    if (!inScopeIds || activeRole?.kind !== 'exec' || !activeRole.groupId) return null;
    return groups.find(g => g.id === activeRole.groupId)?.name ?? null;
  }, [groups, inScopeIds, activeRole?.kind, activeRole?.groupId]);

  const facultyGroups = useMemo(() => scopedGroups.filter(g => g.kind === 'faculty'), [scopedGroups])
  const classGroups   = useMemo(() => scopedGroups.filter(g => g.kind !== 'faculty'), [scopedGroups])

  const visibleGroups = useMemo(() => {
    // Default fallback is the SCOPED list, not the raw `groups`. The
    // raw list contains every group in the org and would leak content
    // outside the caller's subtree for non-academic shapes.
    let base = scopedGroups
    if (isAcademicOrg) {
      if (activeTab === 'faculty') base = facultyGroups
      if (activeTab === 'class')   base = classGroups
    }
    const q = searchQuery.trim().toLowerCase()
    if (!q) return base
    return base.filter(g =>
      g.name.toLowerCase().includes(q) ||
      g.short_name.toLowerCase().includes(q) ||
      (g.description || '').toLowerCase().includes(q)
    )
  }, [scopedGroups, isAcademicOrg, activeTab, facultyGroups, classGroups, searchQuery])

  // ── Authorisation model (per user design) ────────────────────
  // Each tier owns ONLY its own row. A dept exec doesn't get to
  // rename their faculty (that's the dean's call) or rename sibling
  // departments (that's the other HODs'). Creating a child is
  // allowed one tier below — faculty exec creates departments,
  // dept exec creates classes. Org owner has the master key.
  const canEditGroup = useCallback((group: OrganizationGroup): boolean => {
    if (!activeRole || activeRole.kind !== 'exec') return false
    if (activeRole.scopeLevel === 'org') return true
    return group.id === activeRole.groupId
  }, [activeRole])

  // What new group can this viewer create, if any? Returns the
  // pre-filled kind + parent + a label for the CTA. null = the
  // viewer has no new-group powers and the button hides.
  // The org's tier hierarchy (top → leaf) using canonical kinds with
  // per-type labels (#27). A church is Ministry → Section, a co-op is a
  // single Unit, a university is Faculty → Department → Class.
  const orgTiers = useMemo(() => getOrgTiers(organization?.organization_type), [organization?.organization_type])

  const createTarget = useMemo<{ kind: GroupKind; parentId: string | null; label: string } | null>(() => {
    if (!activeRole || activeRole.kind !== 'exec') return null

    // Org owner — creates the TOP tier of this org type.
    if (activeRole.scopeLevel === 'org') {
      const top = orgTiers[0]
      return { kind: top.kind as GroupKind, parentId: null, label: `New ${top.label.toLowerCase()}` }
    }

    if (!activeRole.groupId) return null
    const ownGroup = groups.find(g => g.id === activeRole.groupId)
    if (!ownGroup) return null

    // An exec creates the NEXT tier down from their own. Find their
    // tier in the config; if there's a tier below, that's the child.
    // Treat legacy 'college' like 'faculty'.
    const ownKind = ownGroup.kind === 'college' ? 'faculty' : ownGroup.kind
    const idx = orgTiers.findIndex(tier => tier.kind === ownKind)
    if (idx === -1 || idx >= orgTiers.length - 1) return null // leaf / unknown → nothing below
    const child = orgTiers[idx + 1]
    return { kind: child.kind as GroupKind, parentId: ownGroup.id, label: `New ${child.label.toLowerCase()}` }
  }, [activeRole, groups, orgTiers])

  const openCreate = () => {
    if (!createTarget) {
      // Defensive — the button shouldn't even render in this case,
      // but if something deeper opens the modal (e.g. an empty-state
      // CTA) we surface a clear refusal rather than letting the
      // user fill in a doomed form.
      setFormError('You don\'t have permission to create a new group at this tier.')
      setShowModal(true)
      return
    }
    setForm({
      ...DEFAULT_FORM,
      kind: createTarget.kind,
      parent_group_id: createTarget.parentId || '',
    })
    setEditTarget(null); setFormError(''); setShowModal(true)
  }

  const openEdit = (group: OrganizationGroup) => {
    if (!canEditGroup(group)) {
      // Soft guard — UI hides the Edit button when canEditGroup is
      // false, but a stale ref / keyboard path could still call us.
      // Refuse silently rather than letting the form open with a
      // misleading "Save" button.
      return
    }
    const kind = (group.kind || (isAcademicOrg ? 'class' : 'general')) as GroupKind
    setForm({
      name: group.name || '', short_name: group.short_name || '', description: group.description || '',
      kind, parent_group_id: group.parent_group_id || '',
      level: group.levels?.length ? organizationService.canonicalizeLevel(group.levels[0]) : '',
    })
    setEditTarget(group); setFormError(''); setShowModal(true)
  }

  const closeModal = () => { setShowModal(false); setEditTarget(null); setFormError('') }

  const validateForm = () => {
    if (!organization) return false
    if (!form.name.trim())       { setFormError('Group name is required.'); return false }
    if (!form.short_name.trim()) { setFormError('Short name is required.'); return false }
    const needsLevel = isAcademicOrg ? form.kind === 'class' : true
    if (needsLevel && !form.level.trim()) { setFormError('Primary level is required.'); return false }
    const taken = groups.some(g => g.short_name.toUpperCase() === form.short_name.trim().toUpperCase() && g.id !== editTarget?.id)
    if (taken) { setFormError('Another group already uses this short name.'); return false }
    return true
  }

  const handleSave = async () => {
    if (!organization || !validateForm()) return
    setSaving(true); setFormError('')
    const payload = {
      organization_id: organization.id,
      name: form.name.trim(),
      short_name: form.short_name.trim().toUpperCase(),
      description: form.description.trim() || undefined,
      kind: form.kind,
      // Persist the parent for EVERY nested tier, not just classes. The
      // old `form.kind === 'class'` guard orphaned departments: a dept
      // created here got a NULL parent, so it never sat under its
      // faculty — which broke the faculty→dept→class subtree walk
      // (faculty execs couldn't see their depts' members in waive /
      // finance / audit). createTarget already pins the right parent
      // (faculty exec → dept under their faculty; dept exec → class
      // under their dept). A top-level faculty has no parent, so an
      // empty value correctly becomes undefined (null).
      parent_group_id: form.parent_group_id || undefined,
      levels: form.level.trim() ? [form.level.trim()] : undefined,
    }
    try {
      if (editTarget) await organizationService.updateGroup(editTarget.id, { name: payload.name, short_name: payload.short_name, description: payload.description, parent_group_id: payload.parent_group_id, levels: payload.levels, kind: payload.kind })
      else await organizationService.createGroup(payload)
      await fetchGroups(); closeModal()
    } catch (err) { setFormError(err instanceof Error ? err.message : 'Failed to save group.') }
    finally { setSaving(false) }
  }

  if (!organization) return null

  const tabOptions: { value: GroupTab; label: string }[] = isAcademicOrg
    ? [{ value: 'all', label: 'All' }, { value: 'faculty', label: 'Faculties' }, { value: 'class', label: classLabelPlural }]
    : [{ value: 'all', label: groupLabelPlural }]

  // Aggregate counts for the stats strip. memberTotal sums every
  // group's member_count in scope — the page-level "people in your
  // subtree" tile users see in dept/faculty exec dashboards.
  const stats = useMemo(() => {
    const faculties = scopedGroups.filter(g => g.kind === 'faculty' || g.kind === 'college').length
    const departments = scopedGroups.filter(g => g.kind === 'department').length
    const classes = scopedGroups.filter(g =>
      g.kind === 'class' || g.kind === 'level' || g.kind === 'general' || g.kind === 'year_group' || g.kind === 'association'
    ).length
    const memberTotal = scopedGroups.reduce((sum, g) => sum + (g.member_count || 0), 0)
    return { faculties, departments, classes, memberTotal }
  }, [scopedGroups])

  return (
    <div
      className="min-h-screen relative overflow-hidden py-6 px-4"
      style={{ background: tt.bgWash, color: tt.text }}
    >
      {/* Soft brand blobs — match the exec dashboards. The legacy
          page used two animated radial-blur orbs + a 45deg diagonal
          stripe pattern, which read as old next to the new exec
          surfaces. Single static blobs instead. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 w-[520px] h-[520px] rounded-full"
        style={{ background: tt.blob1, filter: 'blur(120px)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 w-[420px] h-[420px] rounded-full"
        style={{ background: tt.blob2, filter: 'blur(110px)' }}
      />

      <div className="max-w-5xl mx-auto space-y-6 relative z-10">

        {/* ── Header (matches DepartmentExec / FacultyExec pattern) ── */}
        <motion.header {...fadeUp(0)} className="space-y-3">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
                style={{
                  background: tt.primarySoft,
                  color: tt.primary,
                  border: `1px solid ${tt.primaryRing}`,
                }}
              >
                <Layers className="w-3 h-3" />
                Organisation structure
              </span>
              {scopeRootName && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-2 py-1 rounded-full"
                  style={{
                    background: `${tt.blue}18`,
                    color: tt.blue,
                    border: `1px solid ${tt.blue}40`,
                  }}
                >
                  <Network className="w-3 h-3" />
                  Scope: {scopeRootName}
                </span>
              )}
            </div>

            {createTarget && (
              <button
                type="button"
                onClick={openCreate}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                style={{
                  background: tt.primary,
                  color: '#FFFFFF',
                  border: `1px solid ${tt.primary}`,
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                {createTarget.label}
              </button>
            )}
          </div>

          <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight" style={{ color: tt.text }}>
            {isAcademicOrg ? `Faculties & ${classLabelPlural}` : groupLabelPlural}
          </h1>
          <p className="text-sm" style={{ color: tt.textSec }}>
            The tree of your organisation — faculty, department, class.
            Each row carries its own dues catalogue and payout account;
            expand a row to see what lives underneath.
          </p>

          {/* Stats strip — three or four real numbers. The legacy hero
              had no per-row stats; this gives the page weight. */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            {isAcademicOrg && (
              <GroupStat label="Faculties"  value={stats.faculties}  icon={<GraduationCap className="w-3.5 h-3.5" />} color={tt.blue}    tt={tt} />
            )}
            {isAcademicOrg && (
              <GroupStat label="Departments" value={stats.departments} icon={<Network className="w-3.5 h-3.5" />}     color={tt.primary} tt={tt} />
            )}
            <GroupStat
              label={isAcademicOrg ? classLabelPlural : groupLabelPlural}
              value={isAcademicOrg ? stats.classes : scopedGroups.length}
              icon={<BookOpen className="w-3.5 h-3.5" />}
              color={tt.mint}
              tt={tt}
            />
            <GroupStat label="Members" value={stats.memberTotal} icon={<Users className="w-3.5 h-3.5" />} color={tt.amber} tt={tt} />
          </div>
        </motion.header>

          {/* ── ORPHANS / MISPLACED GROUPS ────────────────────────────────
              Only renders when the academic-org rules turn up violations
              (anything that breaks faculty → dept → class). Lets the admin
              re-parent, merge, or delete each one without touching SQL. */}
          {!orphansLoading && orphans.length > 0 && (
            <motion.div {...fadeUp(0.04)}>
              <div className="rounded-[24px] p-5 sm:p-6" style={{ background: `${tk.amber}10`, border: `1px solid ${tk.amber}40` }}>
                <div className="flex items-start gap-3 mb-3">
                  <div className="w-10 h-10 rounded-2xl shrink-0 flex items-center justify-center" style={{ background: `${tk.amber}20`, color: tk.amber }}>
                    <AlertCircle className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="text-white font-black text-base sm:text-lg leading-tight">
                      {orphans.length} group{orphans.length === 1 ? '' : 's'} need attention
                    </h3>
                    <p className="text-xs leading-5 mt-1" style={{ color: tk.textSec }}>
                      These break the faculty → department → class hierarchy. A class without a department won't receive dues from its dept; a department without a faculty is invisible to higher execs. Fix each one below.
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  {orphans.map((o) => {
                    const isBusy = orphanBusy === o.id
                    return (
                      <div key={o.id} className="rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3" style={{ background: 'rgba(0,0,0,0.25)', border: `1px solid ${tk.cardBorder}` }}>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-white truncate">{o.name}</span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-md" style={{ background: 'rgba(255,255,255,0.08)', color: tk.textSec }}>{o.short_name}</span>
                            <KindPill kind={o.kind} orgType={organization?.organization_type} />
                          </div>
                          <p className="text-[11px] mt-1" style={{ color: tk.amber }}>
                            {ISSUE_LABEL[o.issue]}
                            {o.parent_name && <> · currently under <span className="font-semibold">{o.parent_name}</span> ({o.parent_kind})</>}
                            {o.member_count > 0 && <> · {o.member_count} {o.member_count === 1 ? 'member' : 'members'}</>}
                          </p>
                        </div>
                        <div className="flex gap-2 shrink-0 flex-wrap">
                          <button
                            disabled={isBusy}
                            onClick={() => { setOrphanAction({ kind: 'reparent', target: o }); setOrphanPickId(''); setOrphanError('') }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                            style={{ background: `${tk.primary}18`, color: tk.primary, border: `1px solid ${tk.primary}40` }}
                          >
                            Move into…
                          </button>
                          <button
                            disabled={isBusy}
                            onClick={() => { setOrphanAction({ kind: 'merge', target: o }); setOrphanPickId(''); setOrphanError('') }}
                            className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                            style={{ background: `${tk.blue}18`, color: tk.blue, border: `1px solid ${tk.blue}40` }}
                          >
                            Merge into…
                          </button>
                          {o.member_count === 0 && (
                            <button
                              disabled={isBusy}
                              onClick={() => { setOrphanAction({ kind: 'delete', target: o }); setOrphanError('') }}
                              className="px-3 py-1.5 rounded-lg text-xs font-bold disabled:opacity-40"
                              style={{ background: 'rgba(239,68,68,0.15)', color: '#ef4444', border: '1px solid rgba(239,68,68,0.35)' }}
                            >
                              Delete
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Search + tab filter — theme-aware. The legacy `tk.inputBg`
              (rgba(255,255,255,0.05)) was invisible on light theme. */}
          <motion.div
            {...fadeUp(0.08)}
            className="rounded-2xl p-3 sm:p-4"
            style={{ background: tt.card, border: `1px solid ${tt.cardBorder}` }}
          >
            <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: tt.textTer }} />
                <input
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  placeholder={`Search ${groupLabelPlural.toLowerCase()}…`}
                  className="w-full pl-10 pr-9 py-2.5 rounded-xl text-sm outline-none transition-all focus:ring-2"
                  style={{
                    background: theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${tt.cardBorder}`,
                    color: tt.text,
                    ['--tw-ring-color' as string]: tt.primaryRing,
                  } as React.CSSProperties}
                />
                {searchQuery && (
                  <button
                    type="button"
                    onClick={() => setSearchQuery('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full"
                  >
                    <X className="w-3 h-3" style={{ color: tt.textTer }} />
                  </button>
                )}
              </div>

              <div className="flex gap-2 flex-wrap">
                {tabOptions.map(t => (
                  <TabBtn key={t.value} active={activeTab === t.value} onClick={() => setActiveTab(t.value)}>
                    {t.label}
                  </TabBtn>
                ))}
              </div>
            </div>

            {searchQuery && (
              <p className="mt-2 text-[11px]" style={{ color: tt.textTer }}>
                {visibleGroups.length} result{visibleGroups.length !== 1 ? 's' : ''} for "{searchQuery}"
              </p>
            )}
          </motion.div>

          {/* ── Tree of groups. When a search is active we show the FLAT
              matches (otherwise the user would have to drill to find
              what they typed). Otherwise we show the top-level nodes
              (faculty / no-parent) and let the user expand for kids.
              Top-level for non-academic orgs = every group. */}
          {loading ? (
            <div
              className="py-14 flex justify-center rounded-2xl"
              style={{ background: tt.card, border: `1px solid ${tt.cardBorder}` }}
            >
              <LoadingSpinner size="md" text="Loading groups…" />
            </div>
          ) : error ? (
            <div className="rounded-2xl p-10" style={{ background: tt.card, border: `1px solid ${tt.cardBorder}` }}>
              <EmptyState
                illustration="error"
                title="Unable to load groups"
                description={error}
                action={
                  <button
                    type="button"
                    onClick={fetchGroups}
                    className="px-4 py-2 rounded-xl text-sm font-bold"
                    style={{ background: tt.primarySoft, color: tt.primary, border: `1px solid ${tt.primaryRing}` }}
                  >
                    Try again
                  </button>
                }
              />
            </div>
          ) : visibleGroups.length === 0 ? (
            <div
              className="rounded-2xl p-12 text-center"
              style={{ background: tt.card, border: `1px solid ${tt.cardBorder}` }}
            >
              <div
                className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                style={{ background: tt.primarySoft, border: `1px solid ${tt.primaryRing}` }}
              >
                <Users className="w-7 h-7" style={{ color: tt.primary }} />
              </div>
              <p className="text-base font-extrabold tracking-tight mb-1" style={{ color: tt.text }}>
                {searchQuery ? `No results for "${searchQuery}"` : `No ${groupLabelPlural.toLowerCase()} yet`}
              </p>
              <p className="text-sm max-w-sm mx-auto mb-5" style={{ color: tt.textSec }}>
                {searchQuery ? 'Try a different search term.' : 'Create your first group to start organising members.'}
              </p>
              {!searchQuery && createTarget && (
                <button
                  type="button"
                  onClick={openCreate}
                  className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98]"
                  style={{ background: tt.primary, color: '#FFFFFF', border: `1px solid ${tt.primary}` }}
                >
                  <Plus className="w-4 h-4" />
                  {createTarget.label}
                </button>
              )}
            </div>
          ) : searchQuery ? (
            /* Flat-results mode — search is active. */
            <motion.div className="grid gap-3 sm:grid-cols-2" variants={listVariants} initial="hidden" animate="show">
              <AnimatePresence>
                {visibleGroups.map(group => (
                  <GroupCard
                    key={group.id}
                    group={group}
                    groups={groups}
                    isAcademicOrg={isAcademicOrg}
                    orgType={organization?.organization_type}
                    onEdit={openEdit}
                    canEdit={canEditGroup(group)}
                  />
                ))}
              </AnimatePresence>
            </motion.div>
          ) : (
            /* Tree mode. When activeTab is 'class' we render the
               filtered list FLAT because the user explicitly asked to
               see classes / departments — drilling them down inside a
               collapsed faculty would hide what they came for. The
               'all' / 'faculty' tabs use the hierarchy. */
            activeTab === 'class' ? (
              <motion.div className="grid gap-3 sm:grid-cols-2" variants={listVariants} initial="hidden" animate="show">
                <AnimatePresence>
                  {visibleGroups.map(group => (
                    <GroupCard
                      key={group.id}
                      group={group}
                      groups={groups}
                      isAcademicOrg={isAcademicOrg}
                      orgType={organization?.organization_type}
                      onEdit={openEdit}
                      canEdit={canEditGroup(group)}
                    />
                  ))}
                </AnimatePresence>
              </motion.div>
            ) : (
              <div className="space-y-3">
                {/* Top-level set — picking what to render at depth 0
                    so descendants render nested under their roots
                    (not flat alongside them):

                      1. A scope is active (dept exec / faculty exec).
                         The user's OWN group is the root; everything
                         else in scope is their subtree and renders
                         on expand. Single-root output, no duplicates.

                      2. Org-scope (no filter).
                         Show faculties / colleges as the natural roots
                         of the org tree. Departments + classes render
                         on expand under their faculty.

                      3. Non-academic / fallback.
                         Anything without a parent_group_id is a root.

                    The previous version filtered "no parent OR faculty/
                    college", then fell back to visibleGroups if empty.
                    For a dept exec the scope walk includes the dept +
                    its kids, NONE of which are faculties and ALL of
                    which have a parent_group_id → the filter returned
                    empty and the fallback rendered every group flat,
                    while ALSO expanding the dept's children inline →
                    each class listed twice. Single-root resolution
                    here keeps every group on the page exactly once. */}
                {(() => {
                  let tops: typeof visibleGroups
                  if (inScopeIds && activeRole?.groupId) {
                    // Scoped view → root is the active group itself.
                    const own = visibleGroups.find(g => g.id === activeRole.groupId)
                    tops = own ? [own] : []
                  } else if (isAcademicOrg) {
                    tops = visibleGroups.filter(g => g.kind === 'faculty' || g.kind === 'college')
                  } else {
                    tops = visibleGroups.filter(g => !g.parent_group_id)
                  }
                  // Last-resort fallback so a misconfigured tree still
                  // renders SOMETHING — but only when zero tops landed.
                  // Deduplicated against itself so the bug above can't
                  // recur silently.
                  if (tops.length === 0) {
                    tops = visibleGroups.filter(g => !g.parent_group_id)
                  }
                  if (tops.length === 0) tops = visibleGroups
                  return tops.map(top => (
                    <GroupTreeNode
                      key={top.id}
                      group={top}
                      groups={scopedGroups}
                      duesCounts={duesCounts}
                      payoutFlags={payoutFlags}
                      toggledKeys={toggledKeys}
                      onToggle={toggleExpand}
                      onEdit={openEdit}
                      canEditFn={canEditGroup}
                      isAcademicOrg={isAcademicOrg}
                      orgType={organization?.organization_type}
                      tt={tt}
                      depth={0}
                    />
                  ))
                })()}
              </div>
            )
          )}
      </div>

      {/* ── CREATE / EDIT MODAL ── */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editTarget ? `Edit ${getGroupLabel(form.kind, organization?.organization_type)}` : `Create ${getGroupLabel(form.kind, organization?.organization_type)}`}
        size="lg"
      >
        <div className="space-y-4">
          <AnimatePresence>
            {formError && (
              <motion.div initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="flex items-start gap-2.5 p-3 rounded-xl" style={{ background: `${tk.primary}0d`, border: `1px solid ${tk.primary}28` }}>
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tk.primary }} />
                <p className="text-xs" style={{ color: tk.primary }}>{formError}</p>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Group Type — only the org owner can swing between faculty
              and class. A faculty exec creating from their own page
              has parent_group_id pre-pinned to their faculty so it
              must be a class; switching to 'faculty' would orphan
              the row. We hide the dropdown for non-org callers so
              they can't pick the wrong shape. Editing an existing
              group also locks the kind. */}
          {isAcademicOrg && !editTarget && activeRole?.scopeLevel === 'org' && (
            <div>
              <FL>Group Type</FL>
              <ProfessionalDropdown
                value={form.kind}
                onChange={v => setForm(p => ({ ...p, kind: v as GroupKind, parent_group_id: '', level: '' }))}
                options={[{ value: 'faculty', label: 'Faculty' }, { value: 'class', label: classLabel }]}
              />
            </div>
          )}

          <div>
            <FL required>Group Name</FL>
            <SInput value={form.name} onChange={v => setForm(p => ({ ...p, name: v }))} placeholder={isAcademicOrg && form.kind === 'faculty' ? 'e.g. Faculty of Engineering' : `e.g. ${classLabel} Name`} />
          </div>

          <div>
            <FL required>Short Name / Code</FL>
            <SInput value={form.short_name} onChange={v => setForm(p => ({ ...p, short_name: v.toUpperCase().slice(0, 10) }))} placeholder={isAcademicOrg && form.kind === 'faculty' ? 'e.g. ENG' : 'e.g. CSC'} maxLength={10} />
            <p className="mt-1 text-[10px]" style={{ color: tk.textTer }}>{form.short_name.length}/10 characters · auto-uppercased</p>
          </div>

          <div>
            <FL>Description</FL>
            <Textarea value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional summary for this group" fullWidth />
          </div>

          {isAcademicOrg && form.kind === 'class' && (
            <div>
              <FL>Faculty (optional)</FL>
              {/* Parent picker — only the org owner can rehome a group
                  between faculties. A faculty exec creates classes
                  under their OWN faculty, full stop, so we lock the
                  parent (pre-filled in openCreate) and just show it
                  as a read-only line. */}
              {activeRole?.scopeLevel === 'org' || editTarget ? (
                <ProfessionalDropdown
                  value={form.parent_group_id}
                  onChange={v => setForm(p => ({ ...p, parent_group_id: v as string }))}
                  placeholder="Select faculty"
                  options={[{ value: '', label: 'No faculty' }, ...facultyGroups.map(g => ({ value: g.id, label: `${g.name} (${g.short_name})` }))]}
                  clearable
                />
              ) : (
                <div
                  className="px-3 py-2.5 rounded-xl text-xs"
                  style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${tk.cardBorder}`, color: tk.textSec }}
                >
                  Parent locked to {groups.find(g => g.id === form.parent_group_id)?.name || 'your faculty'} — only the org owner can move classes between faculties.
                </div>
              )}
            </div>
          )}

          {(!isAcademicOrg || form.kind === 'class') && (
            <div>
              <FL required>Primary Level</FL>
              <SInput value={form.level} onChange={v => setForm(p => ({ ...p, level: v }))} placeholder={organization?.organization_type === 'university' ? 'e.g. 200L' : 'e.g. SS2'} />
            </div>
          )}
        </div>

        <div className="mt-6 flex gap-3 justify-end">
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={closeModal} disabled={saving} className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: 'rgba(255,255,255,0.05)', color: tk.textSec }}>
            Cancel
          </motion.button>
          <motion.button whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }} onClick={handleSave} disabled={saving} className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-40" style={{ background: `linear-gradient(135deg, ${tk.blue}, ${tk.primary})`, boxShadow: `0 6px 20px ${tk.blue}28` }}>
            {saving
              ? <motion.div className="w-4 h-4 border-2 rounded-full" style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
              : editTarget ? <Edit2 className="w-4 h-4" /> : <Plus className="w-4 h-4" />
            }
            {editTarget ? 'Save Changes' : `Create ${isAcademicOrg ? classLabel : groupLabel}`}
          </motion.button>
        </div>
      </Modal>

      {/* ── Orphan action modal: reparent / merge / delete ─────────────── */}
      <Modal
        isOpen={!!orphanAction}
        onClose={() => { if (!orphanBusy) { setOrphanAction(null); setOrphanPickId(''); setOrphanError('') } }}
        title={
          !orphanAction ? '' :
          orphanAction.kind === 'reparent' ? `Move "${orphanAction.target.name}" under…` :
          orphanAction.kind === 'merge'    ? `Merge "${orphanAction.target.name}" into…` :
                                              `Delete "${orphanAction.target.name}"?`
        }
        size="md"
      >
        {orphanAction && (
          <div className="space-y-4">
            <p className="text-sm leading-6" style={{ color: tk.textSec }}>
              {orphanAction.kind === 'reparent' && 'Pick the correct parent. The DB will check the kind matches the hierarchy.'}
              {orphanAction.kind === 'merge'    && `Members, admins, payment types and child groups move into the target. "${orphanAction.target.name}" is deleted afterwards.`}
              {orphanAction.kind === 'delete'   && 'This permanently deletes the group. Only allowed if it has no members and no child groups.'}
            </p>

            {/* Picker (reparent / merge) */}
            {orphanAction.kind !== 'delete' && (() => {
              const options = orphanAction.kind === 'reparent'
                ? validParentsFor(orphanAction.target)
                : validMergeTargetsFor(orphanAction.target)
              if (options.length === 0) {
                return (
                  <div className="p-3 rounded-xl text-xs leading-5" style={{ background: 'rgba(245,158,11,0.10)', border: `1px solid ${tk.amber}40`, color: tk.amber }}>
                    {orphanAction.kind === 'reparent'
                      ? `No valid parents exist yet. Create a ${orphanAction.target.kind === 'class' || orphanAction.target.kind === 'level' ? 'department' : 'faculty'} first, then come back.`
                      : 'No matching group of the same kind to merge into.'}
                  </div>
                )
              }
              return (
                <div>
                  <FL required>{orphanAction.kind === 'reparent' ? 'New parent' : 'Merge target'}</FL>
                  <select
                    value={orphanPickId}
                    onChange={(e) => setOrphanPickId(e.target.value)}
                    className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none"
                    style={{ background: tk.inputBg, border: `1px solid ${tk.inputBor}` }}
                  >
                    <option value="">— Pick one —</option>
                    {options.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name} {g.short_name ? `(${g.short_name})` : ''} · {g.kind}
                      </option>
                    ))}
                  </select>
                </div>
              )
            })()}

            {orphanError && (
              <div className="p-3 rounded-xl text-xs leading-5" style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.40)', color: '#ef4444' }}>
                {orphanError}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-1">
              <button
                onClick={() => { if (!orphanBusy) { setOrphanAction(null); setOrphanPickId(''); setOrphanError('') } }}
                disabled={!!orphanBusy}
                className="px-4 py-2.5 rounded-xl text-sm font-bold"
                style={{ background: 'rgba(255,255,255,0.05)', color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}
              >
                Cancel
              </button>
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={runOrphanAction}
                disabled={!!orphanBusy}
                className="px-5 py-2.5 rounded-xl text-sm font-bold text-white disabled:opacity-60"
                style={{
                  background:
                    orphanAction.kind === 'delete' ? 'linear-gradient(135deg, #ef4444, #b91c1c)'
                    : orphanAction.kind === 'merge' ? `linear-gradient(135deg, ${tk.blue}, #1d4ed8)`
                    : `linear-gradient(135deg, ${tk.primary}, #c2410c)`,
                }}
              >
                {orphanBusy
                  ? 'Working…'
                  : orphanAction.kind === 'delete'   ? 'Delete group'
                  : orphanAction.kind === 'merge'    ? 'Merge'
                  :                                    'Move it'}
              </motion.button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

function getGroupLabel(kind: GroupKind, orgType?: string) {
  // Per-org-type tier label (Faculty/Department/Class · Ministry/Section
  // · Branch/Unit …). Falls back to a title-cased kind.
  return getTierLabel(orgType, kind)
}

/**
 * GroupTreeNode — recursive row that renders ONE group plus its
 * descendants on expand.
 *
 *   faculty
 *   └─ department
 *      └─ class
 *
 * Each row shows: kind icon + name + short_name pill + member count
 * + active-dues count + payout indicator + edit. Click the chevron
 * to expand and surface its kids. Depth-driven left padding gives
 * the tree its visual hierarchy without an explicit guideline.
 */
function GroupTreeNode({
  group, groups, duesCounts, payoutFlags, toggledKeys, onToggle, onEdit, canEditFn, isAcademicOrg, orgType, tt, depth,
}: {
  group: OrganizationGroup
  groups: OrganizationGroup[]
  orgType?: string
  duesCounts: Map<string, number>
  payoutFlags: Set<string>
  toggledKeys: Set<string>
  onToggle: (id: string) => void
  onEdit: (g: OrganizationGroup) => void
  canEditFn: (g: OrganizationGroup) => boolean
  isAcademicOrg: boolean
  tt: ReturnType<typeof getDashboardTokens>
  depth: number
}) {
  const children = useMemo(
    () => groups.filter(g => g.parent_group_id === group.id),
    [groups, group.id],
  )
  // Default: top-level nodes (depth 0) start OPEN; deeper nodes start
  // closed. The user's toggle flips that bit per-id. Hence:
  //   depth 0, NOT toggled → open
  //   depth 0, toggled     → closed
  //   depth >0, NOT toggled → closed
  //   depth >0, toggled     → open
  const defaultOpen = depth === 0
  const isOpen = toggledKeys.has(group.id) ? !defaultOpen : defaultOpen
  const hasChildren = children.length > 0
  const accent = kindColor(group.kind)
  const dues = duesCounts.get(group.id) || 0
  const hasPayout = payoutFlags.has(group.id)
  const kindLabel = getTierLabel(orgType, group.kind || 'group')
  const primaryLevel = group.levels?.[0] ? organizationService.canonicalizeLevel(group.levels[0]) : null
  // Whole row toggles when there are children — the chevron alone
  // was too small a target. Falls back to a no-op for leaves.
  const handleRowClick = () => {
    if (hasChildren) onToggle(group.id)
  }

  return (
    <div className="space-y-2">
      <div
        className="rounded-2xl overflow-hidden transition-all"
        style={{
          background: tt.card,
          border: `1px solid ${tt.cardBorder}`,
          marginLeft: depth > 0 ? depth * 16 : 0,
        }}
      >
        <div
          className={`p-3 sm:p-4 flex items-center gap-3 ${hasChildren ? 'cursor-pointer' : ''}`}
          onClick={handleRowClick}
          role={hasChildren ? 'button' : undefined}
          tabIndex={hasChildren ? 0 : undefined}
        >
          {/* Chevron — only when there are children. Acts as a visual
              affordance for the row-level toggle. Click handler is on
              the row, not just this button. */}
          {hasChildren ? (
            <span
              aria-hidden
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 transition-all"
              style={{ background: `${accent}14`, color: accent, border: `1px solid ${accent}30` }}
            >
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </span>
          ) : (
            <span className="w-7 h-7 shrink-0" />
          )}

          {/* Kind icon */}
          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${accent}18`, color: accent, border: `1px solid ${accent}30` }}
          >
            {kindIcon(group.kind)}
          </span>

          {/* Identity column */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-sm truncate" style={{ color: tt.text }}>
                {group.name}
              </p>
              <span
                className="text-[10px] font-mono px-1.5 py-0.5 rounded-md shrink-0"
                style={{ background: `${accent}14`, color: accent }}
              >
                {group.short_name}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-1.5 mt-1">
              <span
                className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider"
                style={{ background: `${accent}14`, color: accent, border: `1px solid ${accent}28` }}
              >
                {kindLabel}
              </span>
              {primaryLevel && (
                <span
                  className="inline-flex items-center px-1.5 py-0.5 rounded-full text-[9.5px] font-semibold"
                  style={{ background: tt.primarySoft, color: tt.primary }}
                >
                  L{primaryLevel}
                </span>
              )}
            </div>
          </div>

          {/* Stats column — members + active dues + payout flag. */}
          <div className="hidden sm:flex items-center gap-3 shrink-0">
            <Metric icon={<Users className="w-3 h-3" />} value={group.member_count || 0} label="members" tt={tt} />
            <Metric icon={<Receipt className="w-3 h-3" />} value={dues}                  label="dues"    tt={tt} />
            <span
              className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
              style={{
                background: hasPayout ? `${tt.mint}18` : `${tt.amber}14`,
                color: hasPayout ? tt.mint : tt.amber,
                border: `1px solid ${hasPayout ? `${tt.mint}40` : `${tt.amber}38`}`,
              }}
            >
              {hasPayout ? <CheckCircle2 className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
              {hasPayout ? 'Payout set' : 'No payout'}
            </span>
          </div>

          {/* Edit — only rendered for rows the viewer actually owns.
              A dept exec sees the pencil on their own dept; their
              faculty is read-only to them. stopPropagation so a
              click doesn't also toggle the row's expand state. */}
          {canEditFn(group) && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); onEdit(group) }}
              className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{
                background: tt.primarySoft,
                color: tt.primary,
                border: `1px solid ${tt.primaryRing}`,
              }}
              aria-label="Edit group"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Mobile: stats row collapses below the identity. */}
        <div className="px-4 pb-3 sm:hidden flex flex-wrap gap-1.5">
          <Metric icon={<Users className="w-3 h-3" />} value={group.member_count || 0} label="members" tt={tt} />
          <Metric icon={<Receipt className="w-3 h-3" />} value={dues}                  label="dues"    tt={tt} />
          <span
            className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
            style={{
              background: hasPayout ? `${tt.mint}18` : `${tt.amber}14`,
              color: hasPayout ? tt.mint : tt.amber,
              border: `1px solid ${hasPayout ? `${tt.mint}40` : `${tt.amber}38`}`,
            }}
          >
            {hasPayout ? <CheckCircle2 className="w-3 h-3" /> : <Banknote className="w-3 h-3" />}
            {hasPayout ? 'Payout set' : 'No payout'}
          </span>
        </div>
      </div>

      {/* Children — render on expand. depth+1 so they indent. */}
      {isOpen && hasChildren && (
        <div className="space-y-2">
          {children.map(child => (
            <GroupTreeNode
              key={child.id}
              group={child}
              groups={groups}
              duesCounts={duesCounts}
              payoutFlags={payoutFlags}
              toggledKeys={toggledKeys}
              onToggle={onToggle}
              onEdit={onEdit}
              canEditFn={canEditFn}
              isAcademicOrg={isAcademicOrg}
              orgType={orgType}
              tt={tt}
              depth={depth + 1}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Metric({
  icon, value, label, tt,
}: {
  icon: React.ReactNode
  value: number | string
  label: string
  tt: ReturnType<typeof getDashboardTokens>
}) {
  return (
    <span
      className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
      style={{ background: tt.primarySoft, color: tt.textSec, border: `1px solid ${tt.cardBorder}` }}
    >
      {icon}
      <span style={{ color: tt.text }} className="tabular-nums">{value}</span>
      <span style={{ color: tt.textTer }}>{label}</span>
    </span>
  )
}

function GroupStat({
  label, value, icon, color, tt,
}: {
  label: string
  value: number | string
  icon: React.ReactNode
  color: string
  tt: ReturnType<typeof getDashboardTokens>
}) {
  return (
    <div
      className="rounded-2xl p-3 sm:p-4"
      style={{ background: tt.card, border: `1px solid ${tt.cardBorder}` }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </span>
        <p className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: tt.textTer }}>
          {label}
        </p>
      </div>
      <p className="text-xl font-extrabold tabular-nums mt-2" style={{ color: tt.text }}>
        {value}
      </p>
    </div>
  )
}