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
  BookOpen,
  Network,
} from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { supabase } from '@/config/supabase';
import organizationService from '@/services/organizationService';
import type { OrganizationGroup, GroupKind } from '@/types/multiTenant';
import PageWrapper from '@/components/ui/PageWrapper';
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
function KindPill({ kind }: { kind?: string }) {
  const color = kindColor(kind)
  return (
    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide" style={{ background: `${color}15`, color }}>
      {kind || 'general'}
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
  group, groups, isAcademicOrg, onEdit,
}: {
  group: OrganizationGroup; groups: OrganizationGroup[];
  isAcademicOrg: boolean;
  onEdit: (g: OrganizationGroup) => void;
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
                  <KindPill kind={group.kind} />
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

              {/* Edit btn */}
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

// ── Stat mini ───────────────────────────────────────────────────────────────
function MiniStat({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="rounded-2xl p-4 relative overflow-hidden" style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}>
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <p className="text-[10px] uppercase tracking-[0.2em] font-semibold mb-1.5" style={{ color: tk.textTer }}>{label}</p>
      <p className="text-2xl font-black text-white tabular-nums">{value}</p>
    </div>
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

  const openCreate = () => {
    setForm({ ...DEFAULT_FORM, kind: isAcademicOrg ? 'class' : 'general' })
    setEditTarget(null); setFormError(''); setShowModal(true)
  }

  const openEdit = (group: OrganizationGroup) => {
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
      parent_group_id: form.kind === 'class' ? (form.parent_group_id || undefined) : undefined,
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

  return (
    <div className="min-h-screen relative" style={{ background: tk.bg }}>
      {/* Ambient glows */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div className="absolute rounded-full blur-[200px]" style={{ width: 560, height: 560, background: `radial-gradient(circle, ${tk.blue}, transparent 70%)`, top: '-18%', right: '-12%', opacity: 0.09 }} animate={{ scale: [1, 1.08, 1] }} transition={{ duration: 11, repeat: Infinity, ease: 'easeInOut' }} />
        <motion.div className="absolute rounded-full blur-[160px]" style={{ width: 400, height: 400, background: `radial-gradient(circle, ${tk.primary}, transparent 70%)`, bottom: '5%', left: '-8%', opacity: 0.07 }} animate={{ scale: [1, 1.1, 1] }} transition={{ duration: 13, repeat: Infinity, ease: 'easeInOut', delay: 3 }} />
        <div className="absolute inset-0 opacity-[0.018]" style={{ backgroundImage: `repeating-linear-gradient(-45deg, transparent, transparent 50px, rgba(59,130,246,0.5) 50px, rgba(59,130,246,0.5) 51px)` }} />
      </div>

      <PageWrapper>
        <div className="max-w-6xl mx-auto space-y-6 relative z-10">

          {/* ── HERO ── */}
          <motion.div {...fadeUp(0)}>
            <div className="rounded-[32px] overflow-hidden relative" style={{ background: 'linear-gradient(135deg, rgba(59,130,246,0.1), rgba(255,104,3,0.08))', border: `1px solid ${tk.cardBorder}` }}>
              <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: `linear-gradient(90deg, ${tk.blue}, ${tk.primary} 50%, transparent)` }} />
              <div className="absolute inset-0 pointer-events-none" style={{ background: 'radial-gradient(ellipse 55% 55% at 95% 5%, rgba(59,130,246,0.13), transparent)' }} />
              <div className="absolute -right-10 -top-10 w-60 h-60 opacity-[0.03] pointer-events-none text-white"><Network className="w-full h-full" /></div>

              <div className="relative p-7 sm:p-10">
                <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-6">
                  <div>
                    <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] mb-4" style={{ background: `${tk.blue}14`, border: `1px solid ${tk.blue}28`, color: tk.blue }}>
                      <Layers className="w-3 h-3" /> Organization Structure
                    </div>
                    <h1 className="text-3xl sm:text-5xl font-black text-white tracking-tight leading-none">
                      {isAcademicOrg ? 'Faculties &' : groupLabelPlural}<br />
                      <span style={{ color: tk.blue }}>{isAcademicOrg ? classLabelPlural : ''}</span>
                    </h1>
                    <p className="mt-3 text-sm max-w-lg leading-7" style={{ color: tk.textSec }}>
                      Keep your structure clean and professional. Create, update, and organize {groupLabelPlural.toLowerCase()} with clarity.
                    </p>

                    {/* Scope banner — surfaces when the page has been
                        narrowed to the caller's active role's subtree.
                        Without it the filtering feels like a bug ("I
                        had more faculties yesterday?"). */}
                    {scopeRootName && (
                      <div
                        className="mt-4 inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[11px] font-semibold"
                        style={{
                          background: `${tk.primary}14`,
                          border: `1px solid ${tk.primary}33`,
                          color: tk.primary,
                        }}
                      >
                        <Layers className="w-3 h-3" />
                        Showing your scope: <span className="font-bold">{scopeRootName}</span>
                      </div>
                    )}
                  </div>
                  <motion.button
                    whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.97 }}
                    onClick={openCreate}
                    className="shrink-0 inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white"
                    style={{ background: `linear-gradient(135deg, ${tk.blue}, ${tk.primary})`, boxShadow: `0 8px 28px ${tk.blue}30` }}
                  >
                    <Plus className="w-4 h-4" />
                    New {isAcademicOrg ? classLabel : groupLabel}
                  </motion.button>
                </div>
              </div>
            </div>
          </motion.div>

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
                            <KindPill kind={o.kind} />
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

          {/* ── STATS ── */}
          <div className="grid grid-cols-3 gap-4">
            <MiniStat label={groupLabelPlural} value={groups.length} color={tk.primary} />
            <MiniStat label={isAcademicOrg ? 'Faculties' : 'Active'} value={isAcademicOrg ? facultyGroups.length : groups.filter(g => g.is_active).length} color={tk.blue} />
            <MiniStat label={isAcademicOrg ? classLabelPlural : 'Inactive'} value={isAcademicOrg ? classGroups.length : groups.filter(g => !g.is_active).length} color={tk.primary} />
          </div>

          {/* ── SEARCH + TABS ── */}
          <motion.div {...fadeUp(0.08)}>
            <div className="rounded-[24px] p-4 sm:p-5" style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}>
              <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
                {/* Search */}
                <div className="flex-1 relative">
                  <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none" style={{ color: tk.textTer }} />
                  <input
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder={`Search ${groupLabelPlural.toLowerCase()}…`}
                    className="w-full pl-10 pr-9 py-3 rounded-xl text-white text-sm outline-none transition-all placeholder-white/20 focus:ring-2 focus:ring-blue-500/25"
                    style={{ background: tk.inputBg, border: `1px solid ${tk.inputBor}` }}
                  />
                  {searchQuery && (
                    <button onClick={() => setSearchQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center justify-center rounded-full hover:bg-white/10">
                      <X className="w-3 h-3" style={{ color: tk.textTer }} />
                    </button>
                  )}
                </div>

                {/* Tabs */}
                <div className="flex gap-2">
                  {tabOptions.map(t => (
                    <TabBtn key={t.value} active={activeTab === t.value} onClick={() => setActiveTab(t.value)}>
                      {t.label}
                    </TabBtn>
                  ))}
                </div>
              </div>

              {/* Result count */}
              {searchQuery && (
                <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-3 text-xs" style={{ color: tk.textTer }}>
                  {visibleGroups.length} result{visibleGroups.length !== 1 ? 's' : ''} for "{searchQuery}"
                </motion.p>
              )}
            </div>
          </motion.div>

          {/* ── GROUP GRID ── */}
          {loading ? (
            <div className="py-20 flex justify-center">
              <LoadingSpinner size="md" text="Loading groups…" />
            </div>
          ) : error ? (
            <div className="rounded-[24px] p-12" style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}>
              <EmptyState illustration="error" title="Unable to load groups" description={error} action={<button onClick={fetchGroups} className="px-5 py-2.5 rounded-xl text-sm font-semibold" style={{ background: `${tk.primary}14`, color: tk.primary }}>Try Again</button>} />
            </div>
          ) : visibleGroups.length === 0 ? (
            <motion.div {...fadeUp(0.1)} className="rounded-[24px] p-14 text-center" style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}>
              <div className="w-20 h-20 rounded-3xl mx-auto mb-5 flex items-center justify-center" style={{ background: `${tk.blue}10`, border: `1px solid ${tk.blue}22` }}>
                <Users className="w-10 h-10" style={{ color: tk.blue }} />
              </div>
              <p className="font-bold text-white text-base">
                {searchQuery ? `No results for "${searchQuery}"` : `No ${groupLabelPlural.toLowerCase()} yet`}
              </p>
              <p className="mt-1.5 text-sm" style={{ color: tk.textTer }}>
                {searchQuery ? 'Try a different search term.' : 'Create your first group and start organizing members.'}
              </p>
              {!searchQuery && (
                <motion.button whileHover={{ scale: 1.04 }} onClick={openCreate} className="mt-5 inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white" style={{ background: `linear-gradient(135deg, ${tk.blue}, ${tk.primary})` }}>
                  <Plus className="w-4 h-4" /> Create {isAcademicOrg ? classLabel : groupLabel}
                </motion.button>
              )}
            </motion.div>
          ) : (
            <motion.div
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
              variants={listVariants}
              initial="hidden"
              animate="show"
            >
              <AnimatePresence>
                {visibleGroups.map(group => (
                  <GroupCard
                      key={group.id}
                      group={group}
                      groups={groups}
                      isAcademicOrg={isAcademicOrg}
                      onEdit={openEdit}
                    />
                ))}
              </AnimatePresence>
            </motion.div>
          )}
        </div>
      </PageWrapper>

      {/* ── CREATE / EDIT MODAL ── */}
      <Modal
        isOpen={showModal}
        onClose={closeModal}
        title={editTarget ? `Edit ${getGroupLabel(form.kind, classLabel, groupLabel, isAcademicOrg)}` : `Create ${getGroupLabel(form.kind, classLabel, groupLabel, isAcademicOrg)}`}
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

          {isAcademicOrg && (
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
              <ProfessionalDropdown
                value={form.parent_group_id}
                onChange={v => setForm(p => ({ ...p, parent_group_id: v as string }))}
                placeholder="Select faculty"
                options={[{ value: '', label: 'No faculty' }, ...facultyGroups.map(g => ({ value: g.id, label: `${g.name} (${g.short_name})` }))]}
                clearable
              />
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

function getGroupLabel(kind: GroupKind, classLabel: string, groupLabel: string, isAcademic: boolean) {
  if (!isAcademic) return groupLabel
  return kind === 'faculty' ? 'Faculty' : classLabel
}