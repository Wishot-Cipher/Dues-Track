/**
 * OrgOverviewPage — Organization entry point.
 * Route: /:orgSlug
 *
 * v2 UX pass:
 *  - Search results navigate directly on tap (no confirm modal —
 *    the breadcrumb + kind badge in the result row already gives
 *    enough context to commit).
 *  - Hero compressed into a single-line strip on mobile: only the
 *    TrustBadge shows below ~375px, org-type pill joins at xs:,
 *    "Signed in" pill joins at sm:. overflow-hidden (no flex-wrap)
 *    keeps the hero a fixed height on every screen.
 *  - Sidebar: "I know my class/faculty" is the primary CTA. "Add a
 *    faculty" + "Invite a faculty founder" stay always-visible as
 *    secondary (muted) actions below it — no collapse/disclosure,
 *    since hiding them makes adding structure later hard to find.
 *  - Empty state (zero groups) gets its own prominent "Add a
 *    faculty" CTA so a brand-new org isn't a dead end.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  ChevronRight,
  Globe,
  GraduationCap,
  Layers,
  LogOut,
  Search,
  Sparkles,
  Users,
  X,
  AlertTriangle,
  BookOpen,
} from 'lucide-react';
import PageWrapper from '@/components/ui/PageWrapper';
import CopyInviteLink from '@/components/ui/CopyInviteLink';
import { APP_NAME } from '@/config/constants';
import { organizationService } from '@/services/organizationService';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import type { Organization, OrganizationGroup, TrustLevel } from '@/types/multiTenant';
import TrustBadge from '@/components/trust/TrustBadge';

// ── Tokens ────────────────────────────────────────────────────────────────────

type OT = {
  bg: string; bgWash: string;
  card: string; cardHov: string; cardBorder: string; hoverBorder: string;
  text: string; textSec: string; textTer: string;
  primary: string; primarySoft: string; primaryRing: string;
  blue: string; mint: string; danger: string; amber: string;
  gradOrange: string;
};

function buildTokens(theme: 'light' | 'dark'): OT {
  const d = getDashboardTokens(theme);
  return {
    bg: d.bg, bgWash: d.bgWash,
    card: d.card, cardHov: d.cardHover, cardBorder: d.cardBorder,
    hoverBorder: d.primaryRing,
    text: d.text, textSec: d.textSec, textTer: d.textTer,
    primary: d.primary, primarySoft: d.primarySoft, primaryRing: d.primaryRing,
    blue: d.blue, mint: d.mint, danger: d.danger, amber: d.amber,
    gradOrange: d.gradOrange,
  };
}

// ── Kind helpers ──────────────────────────────────────────────────────────────

function kindMeta(kind: string | undefined, tk: OT) {
  const map: Record<string, { color: string; icon: React.ElementType; label: string }> = {
    faculty:    { color: tk.blue,    icon: GraduationCap, label: 'Faculty' },
    college:    { color: tk.blue,    icon: GraduationCap, label: 'College' },
    department: { color: tk.primary, icon: BookOpen,      label: 'Department' },
    dept:       { color: tk.primary, icon: BookOpen,      label: 'Department' },
    class:      { color: '#8b5cf6',  icon: Layers,        label: 'Class' },
    year:       { color: tk.mint,    icon: Layers,        label: 'Year' },
    level:      { color: '#ec4899',  icon: Layers,        label: 'Level' },
    general:    { color: '#06b6d4',  icon: Users,         label: 'Group' },
  };
  return map[kind?.toLowerCase() ?? ''] ?? { color: tk.primary, icon: Layers, label: 'Group' };
}

const KIND_ORDER = ['faculty', 'college', 'department', 'dept', 'class', 'year', 'level', 'general'];
function kindPriority(k?: string) {
  const i = KIND_ORDER.indexOf(k?.toLowerCase() ?? '');
  return i === -1 ? 99 : i;
}

function isFaculty(g: OrganizationGroup) {
  const k = g.kind?.toLowerCase() ?? '';
  return k === 'faculty' || k === 'college';
}

// ── Search result type ────────────────────────────────────────────────────────

type SearchResult = {
  group: OrganizationGroup;
  path: string[];   // e.g. ['Engineering', 'Civil Eng', '300L']
  kind: string;
};

// ── Sub-components ────────────────────────────────────────────────────────────

function LoadingScreen({ tk }: { tk: OT }) {
  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8"
      style={{ background: tk.bg, backgroundImage: tk.bgWash, color: tk.text }}>
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <motion.div className="w-9 h-9 border-2 rounded-full"
          style={{ borderColor: `${tk.primary}30`, borderTopColor: tk.primary }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        />
        <p className="text-xs tracking-wider" style={{ color: tk.textTer }}>Loading…</p>
      </div>
    </PageWrapper>
  );
}

function NotFoundScreen({ orgSlug, onBack, tk }: { orgSlug?: string; onBack: () => void; tk: OT }) {
  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8"
      style={{ background: tk.bg, backgroundImage: tk.bgWash, color: tk.text }}>
      <motion.div className="w-full max-w-md rounded-[28px] p-10 text-center"
        style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
        initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
        <div className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: `${tk.primary}15` }}>
          <Building2 className="w-7 h-7" style={{ color: tk.primary }} />
        </div>
        <h1 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: tk.text }}>
          Organization not found
        </h1>
        <p className="text-sm leading-6" style={{ color: tk.textSec }}>
          No organization at <span className="font-semibold" style={{ color: tk.text }}>/{orgSlug}</span>.
        </p>
        <motion.button onClick={onBack}
          className="mt-6 px-6 py-3 rounded-xl font-semibold text-sm text-white"
          style={{ background: tk.gradOrange }}
          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
          Back to search
        </motion.button>
      </motion.div>
    </PageWrapper>
  );
}

// Faculty card — the primary unit on this page
function FacultyCard({
  group,
  index,
  deptCount,
  classCount,
  tk,
  onClick,
}: {
  group: OrganizationGroup;
  index: number;
  deptCount: number;
  classCount: number;
  tk: OT;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const km = kindMeta(group.kind, tk);

  return (
    <motion.button
      onClick={onClick}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      className="w-full text-left rounded-2xl p-5 flex flex-col gap-3 transition-all"
      style={{
        background: hov ? tk.cardHov : tk.card,
        border: `1px solid ${hov ? tk.hoverBorder : tk.cardBorder}`,
      }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.28), duration: 0.22 }}
      whileTap={{ scale: 0.985 }}
    >
      {/* Icon + name row */}
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all"
          style={{
            background: hov ? `${km.color}22` : `${km.color}12`,
            border: `1px solid ${hov ? `${km.color}40` : `${km.color}20`}`,
          }}>
          <km.icon className="w-4.5 h-4.5" style={{ color: km.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug truncate" style={{ color: tk.text }}>
            {group.name}
          </p>
          <p className="text-[11px] font-mono uppercase tracking-wider mt-0.5" style={{ color: tk.textTer }}>
            {group.short_name}
          </p>
        </div>
        <motion.div animate={{ x: hov ? 2 : 0 }} transition={{ duration: 0.15 }} className="shrink-0 mt-0.5">
          <ChevronRight className="w-4 h-4" style={{ color: hov ? km.color : tk.textTer }} />
        </motion.div>
      </div>

      {/* Stats row */}
      <div className="flex items-center gap-2 flex-wrap">
        {deptCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: `${tk.primary}10`, color: tk.primary }}>
            <BookOpen className="w-2.5 h-2.5" />
            {deptCount} dept{deptCount !== 1 ? 's' : ''}
          </span>
        )}
        {classCount > 0 && (
          <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
            style={{ background: `${tk.blue}10`, color: tk.blue }}>
            <Layers className="w-2.5 h-2.5" />
            {classCount} class{classCount !== 1 ? 'es' : ''}
          </span>
        )}
        {deptCount === 0 && classCount === 0 && (
          <span className="text-[10px]" style={{ color: tk.textTer }}>No groups yet</span>
        )}
      </div>

      {group.description && (
        <p className="text-[11px] leading-5 line-clamp-2" style={{ color: tk.textSec }}>
          {group.description}
        </p>
      )}
    </motion.button>
  );
}

// Flat group row — used when the org has no faculty structure
function GroupRow({
  group,
  index,
  tk,
  onClick,
}: {
  group: OrganizationGroup;
  index: number;
  tk: OT;
  onClick: () => void;
}) {
  const [hov, setHov] = useState(false);
  const km = kindMeta(group.kind, tk);
  const levelText = group.levels?.length ? group.levels.join(' · ') : '';

  return (
    <motion.button
      onClick={onClick}
      onHoverStart={() => setHov(true)}
      onHoverEnd={() => setHov(false)}
      className="w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all"
      style={{
        background: hov ? tk.cardHov : 'transparent',
        border: `1px solid ${hov ? tk.hoverBorder : 'transparent'}`,
      }}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.28), duration: 0.2 }}
      whileTap={{ scale: 0.987 }}
    >
      <div className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: `${km.color}12`, border: `1px solid ${km.color}20` }}>
        <km.icon className="w-4 h-4" style={{ color: km.color }} />
      </div>
      <div className="flex-1 min-w-0">
        {levelText && (
          <span className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded mr-1"
            style={{ background: `${tk.primary}15`, color: tk.primary }}>
            Level {levelText}
          </span>
        )}
        <p className="text-sm font-semibold truncate" style={{ color: tk.text }}>{group.name}</p>
        <p className="text-[11px] font-mono uppercase tracking-wider mt-0.5" style={{ color: tk.textTer }}>
          {group.short_name}
          {group.kind && !levelText && (
            <span className="ml-1.5 normal-case font-sans tracking-normal" style={{ color: km.color }}>
              · {km.label}
            </span>
          )}
        </p>
      </div>
      <motion.div animate={{ x: hov ? 2 : 0 }} transition={{ duration: 0.15 }}>
        <ArrowRight className="w-4 h-4" style={{ color: hov ? tk.primary : tk.textTer }} />
      </motion.div>
    </motion.button>
  );
}

// Switch session modal
function SwitchModal({
  targetGroup, currentGroupName, org, tk, onSwitch, onStay,
}: {
  targetGroup: OrganizationGroup; currentGroupName: string;
  org: Organization; tk: OT; onSwitch: () => void; onStay: () => void;
}) {
  const km = kindMeta(targetGroup.kind, tk);
  return (
    <motion.div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
      <motion.div className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
        onClick={onStay} initial={{ opacity: 0 }} animate={{ opacity: 1 }} />
      <motion.div className="relative w-full max-w-md rounded-[28px] overflow-hidden"
        style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>
        <div style={{ height: 2, background: `linear-gradient(90deg, ${tk.danger}, transparent 70%)` }} />
        <div className="p-7">
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'rgba(239,68,68,0.10)', border: '1px solid rgba(239,68,68,0.22)' }}>
            <AlertTriangle className="w-5 h-5" style={{ color: tk.danger }} />
          </div>
          <h3 className="text-xl font-bold mb-2 tracking-tight" style={{ color: tk.text }}>
            You're already signed in
          </h3>
          <p className="text-sm leading-6" style={{ color: tk.textSec }}>
            You're currently logged into{' '}
            <span className="font-semibold" style={{ color: tk.text }}>{currentGroupName}</span>.
            Switching will sign you out of your current session.
          </p>
          <div className="mt-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${tk.cardBorder}` }}>
            <div className="flex items-center gap-3 px-4 py-3"
              style={{ background: 'rgba(239,68,68,0.06)', borderBottom: `1px solid ${tk.cardBorder}` }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ background: 'rgba(239,68,68,0.14)', color: tk.danger }}>
                {org.short_name?.charAt(0) || 'O'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest" style={{ color: tk.textTer }}>Current session</p>
                <p className="text-sm font-semibold truncate" style={{ color: tk.text }}>{currentGroupName}</p>
              </div>
              <LogOut className="w-3.5 h-3.5 shrink-0" style={{ color: tk.danger }} />
            </div>
            <div className="flex items-center justify-center py-2" style={{ background: tk.card }}>
              <ChevronRight className="w-4 h-4 rotate-90" style={{ color: tk.textTer }} />
            </div>
            <div className="flex items-center gap-3 px-4 py-3" style={{ background: `${km.color}08` }}>
              <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${km.color}18` }}>
                <km.icon className="w-3.5 h-3.5" style={{ color: km.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest" style={{ color: tk.textTer }}>Switching to</p>
                <p className="text-sm font-semibold truncate" style={{ color: tk.text }}>{targetGroup.name}</p>
              </div>
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: km.color }} />
            </div>
          </div>
          <div className="flex gap-3 mt-6">
            <motion.button onClick={onStay}
              className="flex-1 py-3 rounded-xl text-sm font-semibold"
              style={{ background: tk.card, color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              Stay signed in
            </motion.button>
            <motion.button onClick={onSwitch}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)' }}
              whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
              <LogOut className="w-4 h-4" />
              Switch & sign out
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 9;

function Pagination({
  page, total, onChange, tk,
}: {
  page: number; total: number; onChange: (p: number) => void; tk: OT;
}) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-4">
      <button
        onClick={() => onChange(page - 1)}
        disabled={page === 1}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-30 transition-opacity"
        style={{ background: tk.cardHov, color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}>
        Prev
      </button>
      {Array.from({ length: pages }, (_, i) => i + 1).map(p => (
        <button key={p} onClick={() => onChange(p)}
          className="w-7 h-7 rounded-lg text-xs font-bold transition-all"
          style={{
            background: p === page ? tk.primary : tk.cardHov,
            color: p === page ? '#fff' : tk.textTer,
            border: `1px solid ${p === page ? tk.primary : tk.cardBorder}`,
          }}>
          {p}
        </button>
      ))}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page === pages}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-30 transition-opacity"
        style={{ background: tk.cardHov, color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}>
        Next
      </button>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrgOverviewPage() {
  const { orgSlug }  = useParams<{ orgSlug: string }>();
  const navigate     = useNavigate();
  const { isAuthenticated, user, logout } = useMultiTenantAuth();
  const { theme } = useTheme();
  const tk = buildTokens(theme);

  const [loading, setLoading]             = useState(true);
  const [org, setOrg]                     = useState<Organization | null>(null);
  const [groups, setGroups]               = useState<OrganizationGroup[]>([]);
  const [searchQuery, setSearchQuery]     = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [switchTarget, setSwitchTarget]   = useState<OrganizationGroup | null>(null);
  const [page, setPage]                   = useState(1);
  const searchRef = useRef<HTMLInputElement>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!orgSlug) return;
      setLoading(true);
      try {
        const orgData = await organizationService.getBySlug(orgSlug);
        if (!mounted) return;
        setOrg(orgData);
        if (orgData) {
          const groupData = await organizationService.getGroups(orgData.id);
          if (mounted) setGroups(groupData);
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void load();
    return () => { mounted = false; };
  }, [orgSlug]);

  // ── Derived lists ──────────────────────────────────────────────────────────

  // Faculties: what the org page shows by default
  const faculties = useMemo(() =>
    groups
      .filter(isFaculty)
      .sort((a, b) => (a.name || '').localeCompare(b.name || '')),
  [groups]);

  // Flat groups: fallback when org has no faculty structure
  const flatGroups = useMemo(() =>
    groups
      .filter(g => !isFaculty(g))
      .sort((a, b) => {
        const kDiff = kindPriority(a.kind) - kindPriority(b.kind);
        if (kDiff !== 0) return kDiff;
        const lA = a.levels?.[0] ?? '';
        const lB = b.levels?.[0] ?? '';
        if (lA !== lB) return lA.localeCompare(lB, undefined, { numeric: true });
        return (a.name || '').localeCompare(b.name || '');
      }),
  [groups]);

  const hasFacultyStructure = faculties.length > 0;

  const groupById = useMemo(() => {
    const map = new Map<string, OrganizationGroup>();
    groups.forEach(g => map.set(g.id, g));
    return map;
  }, [groups]);

  // Walk the parent chain to build a breadcrumb path, e.g.
  // ['Engineering', 'Civil Eng', '300L']. `parentId` is explicitly
  // typed as `string | undefined` so TS doesn't try to infer it
  // from `current` (self-referencing initializer otherwise).
  function resolvePath(g: OrganizationGroup): string[] {
    const path: string[] = [];
    let current: OrganizationGroup | undefined = g;
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      path.unshift(current.name);
      const parentId: string | undefined = (current as { parent_group_id?: string }).parent_group_id;
      current = parentId ? groupById.get(parentId) : undefined;
    }
    return path;
  }

  // ── Global search across ALL groups ───────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) { setSearchResults([]); return; }

    const results: SearchResult[] = groups
      .filter(g =>
        g.name.toLowerCase().includes(q) ||
        g.short_name.toLowerCase().includes(q) ||
        (g.description ?? '').toLowerCase().includes(q)
      )
      .slice(0, 8)
      .map(g => ({
        group: g,
        path: resolvePath(g),
        kind: g.kind ?? 'general',
      }));

    setSearchResults(results);
    setPage(1);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, groups]);

  // ── Pagination for faculties / flatGroups ──────────────────────────────────
  const displayList = hasFacultyStructure ? faculties : flatGroups;
  const pagedList   = useMemo(() =>
    displayList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  [displayList, page]);

  // Per-faculty child counts
  const childCounts = useMemo(() => {
    const deptCount  = new Map<string, number>();
    const classCount = new Map<string, number>();
    groups.forEach(g => {
      const parentId = (g as { parent_group_id?: string }).parent_group_id;
      if (!parentId) return;
      const parentKind = groupById.get(parentId)?.kind?.toLowerCase() ?? '';
      if (isFaculty(groupById.get(parentId)!)) {
        if (['department', 'dept'].includes(g.kind?.toLowerCase() ?? '')) {
          deptCount.set(parentId, (deptCount.get(parentId) ?? 0) + 1);
        } else {
          classCount.set(parentId, (classCount.get(parentId) ?? 0) + 1);
        }
      }
      // Count classes under depts that belong to a faculty
      if (['department', 'dept'].includes(parentKind)) {
        const grandParentId = (groupById.get(parentId) as { parent_group_id?: string })?.parent_group_id;
        if (grandParentId && isFaculty(groupById.get(grandParentId)!)) {
          classCount.set(grandParentId, (classCount.get(grandParentId) ?? 0) + 1);
        }
      }
    });
    return { deptCount, classCount };
  }, [groups, groupById]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const handleFacultyClick = useCallback((group: OrganizationGroup) => {
    if (!orgSlug) return;
    navigate(`/${orgSlug}/f/${encodeURIComponent(group.short_name)}`);
  }, [orgSlug, navigate]);

  const handleGroupClick = useCallback((group: OrganizationGroup) => {
    if (!orgSlug) return;
    const kind = group.kind?.toLowerCase() ?? '';
    if (kind === 'faculty' || kind === 'college') {
      navigate(`/${orgSlug}/f/${encodeURIComponent(group.short_name)}`);
      return;
    }
    if (kind === 'department' || kind === 'dept') {
      navigate(`/${orgSlug}/d/${encodeURIComponent(group.short_name)}`);
      return;
    }
    if (isAuthenticated && user) {
      setSwitchTarget(group);
      return;
    }
    navigate(`/${orgSlug}/g/${encodeURIComponent(group.short_name)}`);
  }, [orgSlug, navigate, isAuthenticated, user]);

  // Search result tap = direct navigation. The result row already
  // shows the breadcrumb path + kind badge, so the user has made an
  // informed choice by the time they tap — no extra confirm screen.
  const handleSearchResultClick = useCallback((result: SearchResult) => {
    setSearchQuery('');
    handleGroupClick(result.group);
  }, [handleGroupClick]);

  const handleSwitchConfirm = useCallback(async () => {
    if (!switchTarget) return;
    await logout?.();
    setSwitchTarget(null);
    if (!orgSlug) return;
    const params = new URLSearchParams();
    if (switchTarget.id) params.set('group', switchTarget.id);
    navigate(`/${orgSlug}/login${params.toString() ? `?${params}` : ''}`);
  }, [switchTarget, logout, orgSlug, navigate]);

  const goToLogin = useCallback(() => {
    if (!orgSlug) return;
    navigate(`/${orgSlug}/login`);
  }, [orgSlug, navigate]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <LoadingScreen tk={tk} />;
  if (!org)    return <NotFoundScreen orgSlug={orgSlug} onBack={() => navigate('/')} tk={tk} />;

  const groupLabel       = org.group_label       ?? 'Group';
  const groupLabelPlural = org.group_label_plural ?? 'Groups';
  const currentGroupName = (user as unknown as Record<string, unknown> | null)?.group_name as string
    ?? (user as unknown as Record<string, unknown> | null)?.full_name as string
    ?? 'your current session';
  const isSearching = searchQuery.trim().length > 0;
  const memberCount = (org as { member_count?: number }).member_count;

  return (
    <>
      <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8"
        style={{ background: tk.bg, backgroundImage: tk.bgWash, color: tk.text }}>
        <div className="w-full max-w-5xl space-y-4">

          {/* ── Hero — single dense row ──
              On mobile, only the TrustBadge shows below the name.
              org-type pill joins at xs:, "Signed in" pill joins at
              sm:. overflow-hidden (NOT flex-wrap) keeps this strip a
              fixed single-line height on every viewport — no more
              two-line badge wrap pushing the faculty grid down. */}
          <motion.div
            className="rounded-[24px] px-4 sm:px-6 py-4 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${tk.primarySoft}, ${tk.card})`,
              border: `1px solid ${tk.cardBorder}`,
            }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse 50% 60% at 95% 10%, ${tk.primary}22, transparent)` }} />

            <div className="relative flex items-center gap-3 sm:gap-4">
              {/* Logo */}
              <div className="relative shrink-0">
                {org.logo_url ? (
                  <img src={org.logo_url} alt={org.name}
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl object-cover"
                    style={{ background: tk.bg, border: `1px solid ${tk.cardBorder}`, boxShadow: '0 6px 20px rgba(0,0,0,0.28)' }}
                    onError={e => {
                      (e.target as HTMLImageElement).style.display = 'none';
                      const fb = (e.target as HTMLImageElement).nextElementSibling as HTMLElement | null;
                      if (fb) fb.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center text-white font-extrabold text-lg"
                  style={{ background: tk.gradOrange, boxShadow: '0 6px 20px rgba(255,104,3,0.28)', display: org.logo_url ? 'none' : 'flex' }}>
                  {org.short_name?.slice(0, 1) ?? 'O'}
                </div>
                <span className="absolute -bottom-1 -right-1 w-3 h-3 rounded-full border-2"
                  style={{ background: tk.mint, borderColor: tk.bg }} />
              </div>

              {/* Name + badges — truncates hard, cedes width to stats */}
              <div className="min-w-0 flex-1">
                <h1 className="text-base sm:text-lg font-extrabold leading-tight tracking-tight truncate" style={{ color: tk.text }}>
                  {org.name}
                </h1>
                <div className="flex items-center gap-1.5 mt-1 overflow-hidden">
                  <TrustBadge
                    level={((org as { trust_level?: TrustLevel }).trust_level) ?? 'community'}
                    size="sm" showTooltip
                  />
                  {/* Org type pill — first thing dropped on narrow
                      screens. TrustBadge already signals "real org". */}
                  <span className="hidden xs:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium capitalize shrink-0"
                    style={{ background: tk.cardHov, color: tk.textSec }}>
                    <Globe className="w-3 h-3" /> {org.organization_type}
                  </span>
                  {isAuthenticated && user && (
                    <span className="hidden sm:inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium shrink-0"
                      style={{ background: `${tk.mint}1A`, color: tk.mint, border: `1px solid ${tk.mint}33` }}>
                      <CheckCircle2 className="w-3 h-3" /> Signed in
                    </span>
                  )}
                  {(org as { description?: string | null }).description && (
                    <span className="hidden lg:inline text-[11px] truncate" style={{ color: tk.textTer }}>
                      · {(org as { description?: string | null }).description}
                    </span>
                  )}
                </div>
              </div>

              {/* Stats — compact pills, no boxed tiles */}
              <div className="hidden sm:flex items-center gap-3 shrink-0 pl-2">
                {typeof memberCount === 'number' && (
                  <div className="text-center">
                    <p className="text-base font-bold leading-none" style={{ color: tk.text }}>{memberCount}</p>
                    <p className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: tk.textTer }}>Members</p>
                  </div>
                )}
                <div className="w-px h-8" style={{ background: tk.cardBorder }} />
                <div className="text-center">
                  <p className="text-base font-bold leading-none" style={{ color: tk.text }}>
                    {hasFacultyStructure ? faculties.length : groups.length}
                  </p>
                  <p className="text-[9px] uppercase tracking-wider mt-0.5" style={{ color: tk.textTer }}>
                    {hasFacultyStructure ? 'Faculties' : groupLabelPlural}
                  </p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Body ── */}
          <div className="grid lg:grid-cols-[1fr_260px] gap-5 items-start">

            {/* Main panel */}
            <motion.div
              className="rounded-[24px] overflow-hidden"
              style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Toolbar */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5"
                style={{ borderBottom: `1px solid ${tk.cardBorder}` }}>
                <div className="flex-1">
                  <h2 className="text-base font-bold tracking-tight" style={{ color: tk.text }}>
                    {hasFacultyStructure ? 'Select your faculty' : `Select a ${groupLabel.toLowerCase()}`}
                  </h2>
                  <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
                    {hasFacultyStructure
                      ? `${faculties.length} facult${faculties.length !== 1 ? 'ies' : 'y'} · tap to browse departments & classes`
                      : `${groups.length} ${groupLabelPlural.toLowerCase()} available`}
                  </p>
                </div>

                {/* Global search */}
                <div className="relative flex-1 sm:max-w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: tk.textTer }} />
                  <input
                    ref={searchRef}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search across all classes…"
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: tk.cardHov,
                      border: `1px solid ${tk.cardBorder}`,
                      color: tk.text,
                      caretColor: tk.primary,
                    }}
                    onFocus={e => {
                      e.currentTarget.style.borderColor = `${tk.primary}50`;
                      e.currentTarget.style.boxShadow = `0 0 0 3px ${tk.primary}12`;
                    }}
                    onBlur={e => {
                      e.currentTarget.style.borderColor = tk.cardBorder;
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  />
                  <AnimatePresence>
                    {searchQuery && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        onClick={() => { setSearchQuery(''); searchRef.current?.focus(); }}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5">
                        <X className="w-3 h-3" style={{ color: tk.textTer }} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              <div className="p-3 sm:p-4">
                {/* ── Search results (inline list, direct navigation) ── */}
                {isSearching && (
                  <AnimatePresence mode="wait">
                    {searchResults.length === 0 ? (
                      <motion.div key="empty" className="py-12 text-center"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Search className="w-7 h-7 mx-auto mb-3 opacity-20" style={{ color: tk.textTer }} />
                        <p className="text-sm font-semibold" style={{ color: tk.text }}>
                          No results for "{searchQuery}"
                        </p>
                        <p className="text-xs mt-1" style={{ color: tk.textTer }}>
                          Try the faculty name, department, or class code.
                        </p>
                      </motion.div>
                    ) : (
                      <motion.div key="results" className="space-y-1"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <p className="text-[10px] uppercase tracking-widest font-bold px-1 mb-2"
                          style={{ color: tk.textTer }}>
                          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''} · tap to go
                        </p>
                        {searchResults.map((result, i) => {
                          const km = kindMeta(result.kind, tk);
                          return (
                            <motion.button
                              key={result.group.id}
                              onClick={() => handleSearchResultClick(result)}
                              className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl transition-all"
                              style={{ background: 'transparent', border: `1px solid transparent` }}
                              initial={{ opacity: 0, x: -6 }}
                              animate={{ opacity: 1, x: 0 }}
                              transition={{ delay: i * 0.03 }}
                              whileHover={{ background: tk.cardHov, borderColor: tk.cardBorder }}
                              whileTap={{ scale: 0.987 }}
                            >
                              <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                                style={{ background: `${km.color}12`, border: `1px solid ${km.color}20` }}>
                                <km.icon className="w-3.5 h-3.5" style={{ color: km.color }} />
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold truncate" style={{ color: tk.text }}>
                                  {result.group.name}
                                </p>
                                {result.path.length > 1 && (
                                  <div className="flex items-center gap-1 mt-0.5 flex-wrap">
                                    {result.path.slice(0, -1).map((seg, si) => (
                                      <span key={si} className="flex items-center gap-1">
                                        <span className="text-[10px]" style={{ color: tk.textTer }}>{seg}</span>
                                        <ChevronRight className="w-2 h-2" style={{ color: tk.textTer }} />
                                      </span>
                                    ))}
                                    <span className="text-[10px] font-medium" style={{ color: tk.textSec }}>
                                      {result.path[result.path.length - 1]}
                                    </span>
                                  </div>
                                )}
                              </div>
                              <span className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                                style={{ background: `${km.color}12`, color: km.color }}>
                                {km.label}
                              </span>
                              <ArrowRight className="w-3.5 h-3.5 shrink-0" style={{ color: tk.textTer }} />
                            </motion.button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}

                {/* ── Faculty grid / flat list ── */}
                {!isSearching && (
                  <>
                    {hasFacultyStructure ? (
                      <>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {pagedList.map((g, i) => (
                            <FacultyCard
                              key={g.id}
                              group={g}
                              index={i}
                              deptCount={childCounts.deptCount.get(g.id) ?? 0}
                              classCount={childCounts.classCount.get(g.id) ?? 0}
                              tk={tk}
                              onClick={() => handleFacultyClick(g)}
                            />
                          ))}
                        </div>
                        <Pagination
                          page={page}
                          total={faculties.length}
                          onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          tk={tk}
                        />
                      </>
                    ) : (
                      <div className="space-y-0.5">
                        {pagedList.map((g, i) => (
                          <GroupRow
                            key={g.id}
                            group={g}
                            index={i}
                            tk={tk}
                            onClick={() => handleGroupClick(g)}
                          />
                        ))}
                        <Pagination
                          page={page}
                          total={flatGroups.length}
                          onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          tk={tk}
                        />
                      </div>
                    )}

                    {/* Empty state — actionable, not just descriptive.
                        A brand-new org has nothing to browse, so this
                        IS the primary CTA. */}
                    {displayList.length === 0 && (
                      <motion.div className="py-14 text-center"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                        <div className="w-14 h-14 rounded-2xl mx-auto mb-4 flex items-center justify-center"
                          style={{ background: tk.primarySoft }}>
                          <Building2 className="w-6 h-6" style={{ color: tk.primary }} />
                        </div>
                        <p className="text-sm font-semibold" style={{ color: tk.text }}>
                          No {groupLabelPlural.toLowerCase()} yet
                        </p>
                        <p className="text-xs mt-1 mb-4" style={{ color: tk.textTer }}>
                          Add the first faculty to start building your organization's structure.
                        </p>
                        <motion.button
                          onClick={() => orgSlug && navigate(`/${orgSlug}/add-faculty`)}
                          className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-bold text-white"
                          style={{ background: tk.gradOrange, boxShadow: `0 8px 24px -8px ${tk.primary}66` }}
                          whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                          <Sparkles className="w-4 h-4" />
                          Add a faculty
                        </motion.button>
                      </motion.div>
                    )}
                  </>
                )}
              </div>
            </motion.div>

            {/* Sidebar */}
            <motion.aside
              className="rounded-[24px] overflow-hidden sticky top-6"
              style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Signed-in strip */}
              {isAuthenticated && user && (
                <div className="px-5 py-4 flex items-center gap-3"
                  style={{ borderBottom: `1px solid ${tk.cardBorder}`, background: `${tk.mint}0D` }}>
                  <div className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${tk.mint}1F` }}>
                    <CheckCircle2 className="w-4 h-4" style={{ color: tk.mint }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: tk.mint }}>Signed in as</p>
                    <p className="text-sm font-semibold truncate" style={{ color: tk.text }}>
                      {(user as unknown as Record<string, unknown>)?.full_name as string
                        ?? (user as unknown as Record<string, unknown>)?.member_id as string
                        ?? 'Member'}
                    </p>
                  </div>
                </div>
              )}

              <div className="p-5 space-y-4">
                {/* Primary CTA */}
                <div>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: tk.primarySoft }}>
                    <Users className="w-4 h-4" style={{ color: tk.primary }} />
                  </div>
                  <h3 className="text-sm font-bold mb-1" style={{ color: tk.text }}>
                    {hasFacultyStructure ? 'Know your faculty?' : 'Know your class?'}
                  </h3>
                  <p className="text-xs leading-5 mb-3" style={{ color: tk.textSec }}>
                    {hasFacultyStructure
                      ? 'Tap your faculty in the list, then pick your department and class to sign in.'
                      : `Select your ${groupLabel.toLowerCase()} in the list to sign in or join.`}
                  </p>
                  <motion.button onClick={goToLogin}
                    className="w-full px-4 py-3 rounded-xl text-xs font-semibold text-left flex items-center justify-between"
                    style={{ background: tk.primarySoft, color: tk.primary }}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                    <span>I know my {groupLabel.toLowerCase()}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </motion.button>
                </div>

                <div className="rounded-xl p-3 flex items-start gap-2"
                  style={{ background: `${tk.primary}08`, border: `1px solid ${tk.primaryRing}` }}>
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: tk.primary }} />
                  <p className="text-[11px] leading-5" style={{ color: tk.textSec }}>
                    {hasFacultyStructure
                      ? 'Can\'t find your class? Use the search bar — type a class code or department name and tap straight in.'
                      : `Select your ${groupLabel.toLowerCase()} to go to your scoped login.`}
                  </p>
                </div>

                <div style={{ borderTop: `1px solid ${tk.cardBorder}` }} />

                {/* ── Setup actions ──
                    Always visible, styled as secondary (muted) so
                    they don't compete with the primary CTA above —
                    but never hidden behind a toggle, since adding a
                    second faculty later is a legitimate, recurring
                    action, not just a zero-state concern. */}
                <div className="space-y-2">
                  <motion.button
                    onClick={() => orgSlug && navigate(`/${orgSlug}/add-faculty`)}
                    className="w-full px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between"
                    style={{ background: tk.cardHov, color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.97 }}>
                    <span>Add a faculty</span>
                    <Sparkles className="w-3.5 h-3.5" />
                  </motion.button>
                  {orgSlug && (
                    <CopyInviteLink
                      url={`/${orgSlug}/add-faculty`}
                      label="Invite a faculty founder"
                      successText="Faculty-founder invite link copied"
                      hint="Anyone with this link can register a faculty. They still need peer votes before exec powers unlock."
                      t={tk}
                    />
                  )}
                </div>

                <p className="text-[10px] leading-5" style={{ color: tk.textTer }}>
                  Powered by {APP_NAME}. Access is scoped per {groupLabel.toLowerCase()} — your data stays private.
                </p>
              </div>
            </motion.aside>
          </div>
        </div>
      </PageWrapper>

      {/* Switch session modal */}
      <AnimatePresence>
        {switchTarget && (
          <SwitchModal
            targetGroup={switchTarget}
            currentGroupName={currentGroupName}
            org={org}
            tk={tk}
            onSwitch={handleSwitchConfirm}
            onStay={() => setSwitchTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}