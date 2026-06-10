/**
 * OrgOverviewPage — Organization department/group browser
 * Route: /:orgSlug
 *
 * Features:
 * - Compact, scannable department list with kind-based grouping
 * - Live search with instant filter
 * - "Already logged in" intercept modal when switching department
 * - Sticky sidebar with org stats and CTAs
 * - Level badge displayed prominently on class/department cards
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  CheckCircle2,
  Globe,
  Search,
  Sparkles,
  Users,
  X,
  ChevronRight,
  LogOut,
  AlertTriangle,
  Layers,
  GraduationCap,
  BookOpen,
  Filter,
} from 'lucide-react';
import PageWrapper from '@/components/ui/PageWrapper';
import CopyInviteLink from '@/components/ui/CopyInviteLink';
import { APP_NAME } from '@/config/constants';
import { organizationService } from '@/services/organizationService';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import type { Organization, OrganizationGroup, TrustLevel } from '@/types/multiTenant';
import TrustBadge from '@/components/trust/TrustBadge';

// ── Design tokens ─────────────────────────────────────────────────────────────
type OverviewTokens = {
  bg: string;
  bgWash: string;       // page background gradient overlay (light + dark variants)
  cardBg: string;
  cardBgHov: string;
  cardHover: string;
  cardBorder: string;
  hoverBorder: string;
  textPrimary: string;
  textSec: string;
  textTer: string;
  primary: string;
  primaryDim: string;
  primarySoft: string;
  primaryBorder: string;
  blue: string;
  mint: string;
  danger: string;
  gradPrimary: string;
};

function buildOverviewTokens(theme: 'light' | 'dark'): OverviewTokens {
  const dtk = getDashboardTokens(theme);
  return {
    bg: dtk.bg,
    bgWash: dtk.bgWash,
    cardBg: dtk.card,
    cardBgHov: dtk.cardHover,
    cardHover: dtk.cardHover,
    cardBorder: dtk.cardBorder,
    hoverBorder: dtk.primaryRing,
    textPrimary: dtk.text,
    textSec: dtk.textSec,
    textTer: dtk.textTer,
    primary: dtk.primary,
    primaryDim: dtk.primarySoft,
    primarySoft: dtk.primarySoft,
    primaryBorder: dtk.primaryRing,
    blue: dtk.blue,
    mint: dtk.mint,
    danger: dtk.danger,
    gradPrimary: dtk.gradOrange,
  };
}

// ── Kind -> icon + color ───────────────────────────────────────────────────────
function kindMeta(kind: string | undefined, tk: OverviewTokens) {
  const map: Record<string, { color: string; icon: React.ElementType; label: string }> = {
    faculty:    { color: tk.blue,    icon: GraduationCap, label: 'Faculty' },
    department: { color: tk.primary, icon: BookOpen,      label: 'Department' },
    class:      { color: '#8b5cf6',  icon: Layers,        label: 'Class' },
    general:    { color: '#06b6d4',  icon: Users,         label: 'Group' },
    year:       { color: tk.mint,    icon: Layers,        label: 'Year' },
    level:      { color: '#ec4899',  icon: Layers,        label: 'Level' },
  };
  return map[kind?.toLowerCase() || ''] ?? { color: tk.primary, icon: Layers, label: 'Group' };
}

const KIND_ORDER = ['faculty', 'department', 'class', 'year', 'level', 'general'];
function kindPriority(kind?: string) {
  const idx = KIND_ORDER.indexOf(kind?.toLowerCase() || '');
  return idx === -1 ? 99 : idx;
}

// ─────────────────────────────────────────────────────────────────────────────
// Switch Department Intercept Modal
// ─────────────────────────────────────────────────────────────────────────────
function SwitchDeptModal({
  targetGroup,
  currentGroupName,
  org,
  tk,
  onSwitch,
  onStay,
}: {
  targetGroup: OrganizationGroup;
  currentGroupName: string;
  org: Organization;
  tk: OverviewTokens;
  onSwitch: () => void;
  onStay: () => void;
}) {
  const km = kindMeta(targetGroup.kind, tk);

  return (
    <motion.div
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <motion.div
        className="absolute inset-0"
        style={{ background: 'rgba(0,0,0,0.72)', backdropFilter: 'blur(8px)' }}
        onClick={onStay}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
      />

      <motion.div
        className="relative w-full max-w-md rounded-[28px] overflow-hidden"
        style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
        initial={{ opacity: 0, y: 32, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.96 }}
        transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
      >
        <div style={{ height: 2, background: `linear-gradient(90deg, ${tk.danger}, transparent 70%)` }} />

        <div className="p-7">
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center mb-5"
            style={{ background: 'rgba(239,68,68,0.10)', border: `1px solid rgba(239,68,68,0.22)` }}
          >
            <AlertTriangle className="w-5 h-5" style={{ color: tk.danger }} />
          </div>

          <h3 className="text-xl font-bold mb-2 tracking-tight" style={{ color: tk.textPrimary }}>
            You're already signed in
          </h3>
          <p className="text-sm leading-6" style={{ color: tk.textSec }}>
            You're currently logged into{' '}
            <span className="font-semibold" style={{ color: tk.textPrimary }}>{currentGroupName}</span>.
            Switching will sign you out of your current session.
          </p>

          <div className="mt-5 rounded-2xl overflow-hidden" style={{ border: `1px solid ${tk.cardBorder}` }}>
            <div
              className="flex items-center gap-3 px-4 py-3"
              style={{ background: 'rgba(239,68,68,0.06)', borderBottom: `1px solid ${tk.cardBorder}` }}
            >
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0 text-xs font-bold"
                style={{ background: 'rgba(239,68,68,0.14)', color: tk.danger }}
              >
                {org.short_name?.charAt(0) || 'O'}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest" style={{ color: tk.textTer }}>Current session</p>
                <p className="text-sm font-semibold truncate" style={{ color: tk.textPrimary }}>{currentGroupName}</p>
              </div>
              <LogOut className="w-3.5 h-3.5 shrink-0" style={{ color: tk.danger }} />
            </div>

            <div className="flex items-center justify-center py-2" style={{ background: tk.cardBg }}>
              <ChevronRight className="w-4 h-4 rotate-90" style={{ color: tk.textTer }} />
            </div>

            <div className="flex items-center gap-3 px-4 py-3" style={{ background: `${km.color}08` }}>
              <div
                className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${km.color}18` }}
              >
                <km.icon className="w-3.5 h-3.5" style={{ color: km.color }} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-[10px] uppercase tracking-widest" style={{ color: tk.textTer }}>Switching to</p>
                {targetGroup.levels?.length ? (
                  <p className="text-[10px]" style={{ color: km.color }}>Level {targetGroup.levels.join(' · ')}</p>
                ) : null}
                <p className="text-sm font-semibold truncate" style={{ color: tk.textPrimary }}>{targetGroup.name}</p>
              </div>
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" style={{ color: km.color }} />
            </div>
          </div>

          <div className="flex gap-3 mt-6">
            <motion.button
              onClick={onStay}
              className="flex-1 py-3 rounded-xl text-sm font-semibold"
              style={{ background: tk.cardBg, color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              Stay signed in
            </motion.button>
            <motion.button
              onClick={onSwitch}
              className="flex-1 py-3 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-2"
              style={{ background: 'linear-gradient(135deg, #ef4444 0%, #f87171 100%)' }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              <LogOut className="w-4 h-4" />
              Switch & sign out
            </motion.button>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Loading screen
// ─────────────────────────────────────────────────────────────────────────────
function LoadingScreen({ tk }: { tk: OverviewTokens }) {
  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8" style={{ background: tk.bg, backgroundImage: tk.bgWash, color: tk.textPrimary }}>
      <div className="flex flex-col items-center justify-center py-20 gap-4">
        <motion.div
          className="w-10 h-10 border-2 rounded-full"
          style={{ borderColor: `${tk.primary}30`, borderTopColor: tk.primary }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        />
        <p className="text-xs tracking-wider" style={{ color: tk.textTer }}>
          Loading organization…
        </p>
      </div>
    </PageWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Not found
// ─────────────────────────────────────────────────────────────────────────────
function NotFoundScreen({ orgSlug, onBack, tk }: { orgSlug?: string; onBack: () => void; tk: OverviewTokens }) {
  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8" style={{ background: tk.bg, backgroundImage: tk.bgWash, color: tk.textPrimary }}>
      <motion.div
        className="w-full max-w-md rounded-[28px] p-10 text-center"
        style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
          style={{ background: `${tk.primary}15` }}>
          <Building2 className="w-7 h-7" style={{ color: tk.primary }} />
        </div>
        <h1 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: tk.textPrimary }}>Organization not found</h1>
        <p className="text-sm leading-6" style={{ color: tk.textSec }}>
          No organization at <span className="font-semibold" style={{ color: tk.textPrimary }}>/{orgSlug}</span>.
        </p>
        <motion.button
          onClick={onBack}
          className="mt-6 px-6 py-3 rounded-xl font-semibold text-sm text-white"
          style={{ background: tk.gradPrimary }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.97 }}
        >
          Back to search
        </motion.button>
      </motion.div>
    </PageWrapper>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Department row — compact list item
// ─────────────────────────────────────────────────────────────────────────────
function DeptRow({
  group,
  index,
  tk,
  onClick,
}: {
  group: OrganizationGroup;
  index: number;
  tk: OverviewTokens;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const km = kindMeta(group.kind, tk);
  const levelText = group.levels?.length ? group.levels.join(' · ') : '';

  return (
    <motion.button
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all"
      style={{
        background: hovered ? tk.cardBgHov : 'transparent',
        border: `1px solid ${hovered ? tk.hoverBorder : 'transparent'}`,
      }}
      whileTap={{ scale: 0.987 }}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: Math.min(index * 0.025, 0.3), duration: 0.22 }}
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all"
        style={{
          background: hovered ? `${km.color}20` : `${km.color}10`,
          border: `1px solid ${hovered ? `${km.color}35` : `${km.color}18`}`,
        }}
      >
        <km.icon className="w-4 h-4" style={{ color: km.color }} />
      </div>

      <div className="flex-1 min-w-0">
        {levelText && (
          <div className="flex items-center gap-1.5 mb-1">
            <span
              className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded"
              style={{ background: `${tk.primary}15`, color: tk.primary }}
            >
              Level {levelText}
            </span>
          </div>
        )}
        <p className="text-sm font-semibold truncate leading-snug" style={{ color: tk.textPrimary }}>{group.name}</p>
        <p className="text-[11px] font-mono uppercase tracking-wider mt-0.5 truncate" style={{ color: tk.textTer }}>
          {group.short_name}
          {group.kind && !levelText && (
            <span className="ml-2 normal-case font-sans tracking-normal" style={{ color: km.color }}>
              · {km.label}
            </span>
          )}
        </p>
      </div>

      {group.description && (
        <p className="hidden md:block text-xs line-clamp-1 max-w-[160px] shrink-0" style={{ color: tk.textTer }}>
          {group.description}
        </p>
      )}

      <motion.div animate={{ x: hovered ? 3 : 0 }} transition={{ duration: 0.18 }} className="shrink-0">
        <ArrowRight className="w-4 h-4" style={{ color: hovered ? tk.primary : tk.textTer }} />
      </motion.div>
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Section header (grouped view)
// ─────────────────────────────────────────────────────────────────────────────
function SectionHeader({ kind, count, tk }: { kind: string; count: number; tk: OverviewTokens }) {
  const km = kindMeta(kind, tk);
  return (
    <div className="flex items-center gap-2.5 px-4 mb-1 mt-1">
      <km.icon className="w-3.5 h-3.5 shrink-0" style={{ color: km.color }} />
      <p className="text-[10px] font-bold uppercase tracking-[0.16em]" style={{ color: km.color }}>
        {km.label}s
      </p>
      <span
        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
        style={{ background: `${km.color}15`, color: km.color }}
      >
        {count}
      </span>
      <div className="flex-1 h-px" style={{ background: `linear-gradient(90deg, ${km.color}20, transparent)` }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main page
// ─────────────────────────────────────────────────────────────────────────────
export default function OrgOverviewPage() {
  const { orgSlug }  = useParams<{ orgSlug: string }>();
  const navigate     = useNavigate();
  const { isAuthenticated, user, logout } = useMultiTenantAuth();
  const { theme } = useTheme();
  const tk = buildOverviewTokens(theme);

  const [loading, setLoading]           = useState(true);
  const [org, setOrg]                   = useState<Organization | null>(null);
  const [groups, setGroups]             = useState<OrganizationGroup[]>([]);
  const [searchQuery, setSearchQuery]   = useState('');
  const [activeKind, setActiveKind]     = useState<string>('all');
  const [switchTarget, setSwitchTarget] = useState<OrganizationGroup | null>(null);
  const [showAll, setShowAll]           = useState(false);

  const INITIAL_SHOW = 8;

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

  const kinds = useMemo(() => {
    const seen = new Set<string>();
    groups.forEach(g => g.kind && seen.add(g.kind.toLowerCase()));
    return Array.from(seen).sort((a, b) => kindPriority(a) - kindPriority(b));
  }, [groups]);

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return groups
      .filter(g => {
        const matchKind   = activeKind === 'all' || g.kind?.toLowerCase() === activeKind;
        const matchSearch = !q ||
          g.name.toLowerCase().includes(q) ||
          g.short_name.toLowerCase().includes(q) ||
          (g.description || '').toLowerCase().includes(q);
        return matchKind && matchSearch;
      })
      .sort((a, b) => {
        const lA = a.levels?.[0] || '';
        const lB = b.levels?.[0] || '';
        if (lA !== lB) return lA.localeCompare(lB, undefined, { numeric: true });
        return (a.name || '').localeCompare(b.name || '');
      });
  }, [groups, searchQuery, activeKind]);

  const grouped = useMemo(() => {
    if (activeKind !== 'all' || searchQuery) return null;
    const map = new Map<string, OrganizationGroup[]>();
    groups.forEach(g => {
      const k = g.kind?.toLowerCase() || 'general';
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(g);
    });
    return Array.from(map.entries()).sort(([a], [b]) => kindPriority(a) - kindPriority(b));
  }, [groups, activeKind, searchQuery]);

  const visibleFlat = useMemo(() => {
    if (!searchQuery && activeKind === 'all') return [];
    return showAll ? filtered : filtered.slice(0, INITIAL_SHOW);
  }, [filtered, showAll, searchQuery, activeKind]);

  const handleGroupClick = (group: OrganizationGroup) => {
    if (!orgSlug) return;
    const kind = group.kind?.toLowerCase();

    // Faculties and departments are STRUCTURE, not login destinations.
    // Always drill into them so the visitor can pick a leaf (class).
    //   • Faculty/college → /f/<short> (lists depts + leaf classes)
    //   • Department      → /d/<short> (lists classes in the dept)
    // The previous code routed an unauthenticated dept-click straight to
    // /g/<deptShort> (the login welcome) — that asked "log in as the
    // dept" which is conceptually wrong. Members log in at the CLASS
    // level; dept/faculty exec access happens via the role switcher
    // after Layer-4 verification.
    if (kind === 'faculty' || kind === 'college') {
      navigate(`/${orgSlug}/f/${encodeURIComponent(group.short_name)}`);
      return;
    }
    if (kind === 'department') {
      navigate(`/${orgSlug}/d/${encodeURIComponent(group.short_name)}`);
      return;
    }

    // Leaf (class / level / fellowship / association):
    //   • Authenticated → switch-context modal
    //   • Visitor       → /g/<short> welcome (sign up / sign in / invite)
    if (isAuthenticated && user) {
      setSwitchTarget(group);
      return;
    }
    navigate(`/${orgSlug}/g/${encodeURIComponent(group.short_name)}`);
  };

  const goToLogin = (group?: OrganizationGroup) => {
    if (!orgSlug) return;
    const params = new URLSearchParams();
    if (group?.id) params.set('group', group.id);
    navigate(`/${orgSlug}/login${params.toString() ? `?${params}` : ''}`);
  };

  const handleSwitchConfirm = async () => {
    if (!switchTarget) return;
    await logout?.();
    setSwitchTarget(null);
    goToLogin(switchTarget);
  };

  // The legacy "Create / join a department" CTA used to drop the user on
  // /join-org (a flat department-creation form). The new flow is
  // hierarchical: department creation happens INSIDE a faculty. So this
  // CTA now narrows the visible list to faculties and scrolls to it —
  // the user picks a faculty, then sees the "Add a department" CTA there.
  const goToJoinOrg = () => {
    setActiveKind('faculty');
    setSearchQuery('');
    setShowAll(true);
    // Scroll into view on next paint
    requestAnimationFrame(() => {
      const el = document.querySelector<HTMLElement>('[data-faculty-list]');
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  if (loading)  return <LoadingScreen tk={tk} />;
  if (!org)     return <NotFoundScreen orgSlug={orgSlug} onBack={() => navigate('/')} tk={tk} />;

  const groupLabel       = org.group_label       || 'Group';
  const groupLabelPlural = org.group_label_plural || 'Groups';
  const currentGroupName = (user as any)?.group?.name ?? 'your current session';

  let rowIndex = 0;

  return (
    <>
      <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8" style={{ background: tk.bg, backgroundImage: tk.bgWash, color: tk.textPrimary }}>
        <div className="w-full max-w-6xl space-y-5">

          {/* ── Hero ── */}
          <motion.div
            className="rounded-[28px] p-5 sm:p-7 relative overflow-hidden"
            style={{
              background: `linear-gradient(135deg, ${tk.primaryDim}, ${tk.cardBg})`,
              border: `1px solid ${tk.cardBorder}`,
            }}
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse 50% 60% at 95% 10%, ${tk.primary}24, transparent)` }} />

            <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
              <div className="flex items-center gap-4 min-w-0">
                <div className="relative shrink-0">
                  {org.logo_url ? (
                    <img
                      src={org.logo_url}
                      alt={org.name}
                      className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl object-cover"
                      style={{
                        background: tk.bg,
                        border: `1px solid ${tk.cardBorder}`,
                        boxShadow: '0 6px 20px rgba(0,0,0,0.32)',
                      }}
                      onError={(e) => {
                        // Fail gracefully — swap to the initial fallback if the
                        // hot-linked logo 404s. We toggle a sibling element.
                        (e.target as HTMLImageElement).style.display = 'none';
                        const fb = (e.target as HTMLImageElement).nextElementSibling as HTMLElement | null;
                        if (fb) fb.style.display = 'flex';
                      }}
                    />
                  ) : null}
                  <div
                    className="w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center text-white font-extrabold text-lg sm:text-xl"
                    style={{
                      background: tk.gradPrimary,
                      boxShadow: '0 6px 20px rgba(255,104,3,0.32)',
                      display: org.logo_url ? 'none' : 'flex',
                    }}
                  >
                    {org.short_name?.slice(0, 1) || 'O'}
                  </div>
                  <span
                    className="absolute -bottom-1 -right-1 w-3.5 h-3.5 rounded-full border-2"
                    style={{ background: tk.mint, borderColor: tk.bg }}
                  />
                </div>
                <div className="min-w-0">
                  <p className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: tk.textTer }}>
                    Organization Access
                  </p>
                  <h1 className="text-xl sm:text-2xl font-extrabold leading-tight tracking-tight truncate" style={{ color: tk.textPrimary }}>
                    {org.name}
                  </h1>
                  <div className="flex flex-wrap items-center gap-2 mt-1.5">
                    <TrustBadge
                      level={((org as { trust_level?: TrustLevel }).trust_level) ?? 'community'}
                      size="sm"
                      showTooltip
                    />
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
                      style={{ background: tk.cardBgHov, color: tk.textSec }}>
                      <Globe className="w-3 h-3" /> {org.organization_type}
                    </span>
                    {isAuthenticated && user && (
                      <>
                        <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                          style={{ background: `${tk.mint}1A`, color: tk.mint, border: `1px solid ${tk.mint}33` }}>
                          <CheckCircle2 className="w-3 h-3" /> Signed in
                        </span>
                        <motion.button
                          onClick={() => navigate(`/${orgSlug}/claim`)}
                          className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-bold"
                          style={{ background: `${tk.primary}14`, color: tk.primary, border: `1px solid ${tk.primary}30` }}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                        >
                          Claim exec role
                        </motion.button>
                      </>
                    )}
                  </div>
                  {/* Public description — the org's own words, shown on
                      its landing card so visitors know what it is. */}
                  {(org as { description?: string | null }).description && (
                    <p className="text-[13px] mt-2 leading-snug max-w-xl" style={{ color: tk.textSec }}>
                      {(org as { description?: string | null }).description}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex gap-3 shrink-0 flex-wrap items-center">
                <motion.button
                  onClick={() => orgSlug && navigate(`/${orgSlug}/add-faculty`)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl text-xs font-semibold whitespace-nowrap"
                  style={{
                    background: `${tk.primary}14`,
                    color: tk.primary,
                    border: `1px solid ${tk.primary}30`,
                  }}
                  whileHover={{ scale: 1.04 }}
                  whileTap={{ scale: 0.96 }}
                >
                  <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
                  Add faculty
                </motion.button>

                {/* Org founder shortcut: copy the add-faculty URL so
                    they can hand the next faculty exec a direct link
                    without bootstrapping every faculty themselves. */}
                {orgSlug && (
                  <CopyInviteLink
                    url={`/${orgSlug}/add-faculty`}
                    label="Invite a faculty founder"
                    successText="Faculty-founder invite link copied"
                    hint="Anyone with this link can register a faculty in this org. They still need peer votes / parent confirm before exec powers unlock."
                    t={tk}
                  />
                )}

                {/* Members — a trust/size signal on the public card. */}
                {typeof (org as { member_count?: number }).member_count === 'number' && (
                  <div className="rounded-xl px-4 py-2.5 text-center relative overflow-hidden"
                    style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}`, minWidth: 72 }}>
                    <div className="absolute top-0 inset-x-0 h-0.5" style={{ background: tk.mint }} />
                    <p className="text-[9px] uppercase tracking-wider" style={{ color: tk.textTer }}>Members</p>
                    <p className="text-xl font-bold mt-1" style={{ color: tk.textPrimary }}>{(org as { member_count?: number }).member_count}</p>
                  </div>
                )}
                <div className="rounded-xl px-4 py-2.5 text-center relative overflow-hidden"
                  style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}`, minWidth: 72 }}>
                  <div className="absolute top-0 inset-x-0 h-0.5" style={{ background: tk.primary }} />
                  <p className="text-[9px] uppercase tracking-wider" style={{ color: tk.textTer }}>{groupLabelPlural}</p>
                  <p className="text-xl font-bold mt-1" style={{ color: tk.textPrimary }}>{groups.length}</p>
                </div>
                {kinds.length > 1 && (
                  <div className="rounded-xl px-4 py-2.5 text-center relative overflow-hidden"
                    style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}`, minWidth: 72 }}>
                    <div className="absolute top-0 inset-x-0 h-0.5" style={{ background: tk.blue }} />
                    <p className="text-[9px] uppercase tracking-wider" style={{ color: tk.textTer }}>Types</p>
                    <p className="text-xl font-bold mt-1" style={{ color: tk.textPrimary }}>{kinds.length}</p>
                  </div>
                )}
              </div>
            </div>
          </motion.div>

          {/* ── Body ── */}
          <div className="grid lg:grid-cols-[1fr_280px] gap-5 items-start">

            {/* Department list panel */}
            <motion.div
              className="rounded-[24px] overflow-hidden"
              style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Toolbar */}
              <div
                className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5"
                style={{ borderBottom: `1px solid ${tk.cardBorder}` }}
              >
                <div className="flex-1">
                  <h2 className="text-base font-bold tracking-tight" style={{ color: tk.textPrimary }}>
                    Select a {groupLabel.toLowerCase()}
                  </h2>
                  <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
                    {groups.length} {groupLabelPlural.toLowerCase()} available
                  </p>
                </div>

                <div className="relative flex-1 sm:max-w-64">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: tk.textTer }} />
                  <input
                    value={searchQuery}
                    onChange={e => { setSearchQuery(e.target.value); setShowAll(false); }}
                    placeholder={`Search ${groupLabelPlural.toLowerCase()}…`}
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl text-sm outline-none transition-all"
                    style={{
                      background: tk.cardBgHov,
                      border: `1px solid ${tk.cardBorder}`,
                      color: tk.textPrimary,
                      caretColor: tk.primary,
                    }}
                    onFocus={e => { e.currentTarget.style.borderColor = `${tk.primary}50`; e.currentTarget.style.boxShadow = `0 0 0 3px ${tk.primary}12`; }}
                    onBlur={e => { e.currentTarget.style.borderColor = tk.cardBorder; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                  <AnimatePresence>
                    {searchQuery && (
                      <motion.button
                        initial={{ opacity: 0, scale: 0.7 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.7 }}
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5"
                      >
                        <X className="w-3 h-3" style={{ color: tk.textTer }} />
                      </motion.button>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* Kind filter tabs */}
              {kinds.length > 1 && !searchQuery && (
                <div
                  className="flex items-center gap-1.5 px-4 sm:px-5 py-3 overflow-x-auto"
                  style={{ borderBottom: `1px solid ${tk.cardBorder}` }}
                >
                  <Filter className="w-3.5 h-3.5 shrink-0 mr-1" style={{ color: tk.textTer }} />
                  {['all', ...kinds].map(k => {
                    const active = activeKind === k;
                    const km2    = k === 'all' ? null : kindMeta(k, tk);
                    return (
                      <button
                        key={k}
                        onClick={() => { setActiveKind(k); setShowAll(false); }}
                        className="px-3 py-1.5 rounded-full text-[11px] font-semibold whitespace-nowrap transition-all"
                        style={{
                          background: active ? (km2 ? `${km2.color}18` : tk.primaryDim) : 'transparent',
                          color:       active ? (km2 ? km2.color : tk.primary) : tk.textTer,
                          border:      `1px solid ${active ? (km2 ? `${km2.color}30` : tk.primaryBorder) : 'transparent'}`,
                        }}
                      >
                        {k === 'all' ? `All (${groups.length})` : `${kindMeta(k, tk).label}s`}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* List content */}
              <div className="p-3 sm:p-4">
                {/* Grouped view */}
                {grouped && !searchQuery && (
                  <div className="space-y-4">
                    {grouped.map(([kind, items]) => {
                      const visible = showAll ? items : items.slice(0, INITIAL_SHOW);
                      return (
                        <div key={kind} data-faculty-list={kind === 'faculty' ? 'true' : undefined}>
                          <SectionHeader kind={kind} count={items.length} tk={tk} />
                          <div className="space-y-0.5">
                            {visible.map(group => (
                              <DeptRow key={group.id} group={group} index={rowIndex++} tk={tk} onClick={() => handleGroupClick(group)} />
                            ))}
                          </div>
                        </div>
                      );
                    })}
                    {groups.length > INITIAL_SHOW && (
                      <button
                        onClick={() => setShowAll(v => !v)}
                        className="w-full py-3 rounded-xl text-xs font-semibold transition-all mt-2"
                        style={{ background: tk.cardBgHov, color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}
                      >
                        {showAll
                          ? 'Show less'
                          : `Show all ${groups.length} ${groupLabelPlural.toLowerCase()}`}
                      </button>
                    )}
                  </div>
                )}

                {/* Flat filtered view */}
                {(searchQuery || activeKind !== 'all') && (
                  visibleFlat.length === 0 ? (
                    <motion.div className="py-14 text-center" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                      <Building2 className="w-8 h-8 mx-auto mb-3 opacity-20" style={{ color: tk.textTer }} />
                      <p className="text-sm font-semibold" style={{ color: tk.textPrimary }}>
                        {searchQuery ? `No results for "${searchQuery}"` : `No ${kindMeta(activeKind, tk).label.toLowerCase()}s`}
                      </p>
                      <p className="text-xs mt-1 mb-5" style={{ color: tk.textTer }}>
                        Try a different search term or clear the filter.
                      </p>
                      <motion.button
                        onClick={goToJoinOrg}
                        className="px-5 py-2.5 rounded-xl text-sm text-white font-semibold"
                        style={{ background: tk.gradPrimary }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                      >
                        Browse faculties to add a {groupLabel.toLowerCase()}
                      </motion.button>
                    </motion.div>
                  ) : (
                    <>
                      <div className="space-y-0.5">
                        {visibleFlat.map((group, i) => (
                          <DeptRow key={group.id} group={group} index={i} tk={tk} onClick={() => handleGroupClick(group)} />
                        ))}
                      </div>
                      {filtered.length > INITIAL_SHOW && (
                        <button
                          onClick={() => setShowAll(v => !v)}
                          className="w-full mt-3 py-3 rounded-xl text-xs font-semibold transition-all"
                          style={{ background: tk.cardBgHov, color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}
                        >
                          {showAll ? 'Show less' : `Show ${filtered.length - INITIAL_SHOW} more`}
                        </button>
                      )}
                    </>
                  )
                )}
              </div>
            </motion.div>

            {/* Sidebar */}
            <motion.aside
              className="rounded-[24px] overflow-hidden sticky top-6"
              style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.14, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Signed-in banner */}
              {isAuthenticated && user && (
                <div
                  className="px-5 py-4 flex items-center gap-3"
                  style={{ borderBottom: `1px solid ${tk.cardBorder}`, background: `${tk.mint}0D` }}
                >
                  <div
                    className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
                    style={{ background: `${tk.mint}1F` }}
                  >
                    <CheckCircle2 className="w-4 h-4" style={{ color: tk.mint }} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-[10px] uppercase tracking-widest" style={{ color: tk.mint }}>Signed in as</p>
                    <p className="text-sm font-semibold truncate" style={{ color: tk.textPrimary }}>
                      {(user as any)?.full_name || (user as any)?.member_id || 'Member'}
                    </p>
                  </div>
                </div>
              )}

              <div className="p-5 space-y-5">
                <div>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: tk.primaryDim }}>
                    <Users className="w-4 h-4" style={{ color: tk.primary }} />
                  </div>
                  <h3 className="text-sm font-bold" style={{ color: tk.textPrimary }}>Need help?</h3>
                  <p className="mt-1.5 text-xs leading-5" style={{ color: tk.textSec }}>
                    Can't find your {groupLabel.toLowerCase()}? You can create one or ask your admin.
                  </p>
                </div>

                <div style={{ borderTop: `1px solid ${tk.cardBorder}` }} />

                <div className="space-y-2.5">
                  <motion.button
                    onClick={() => goToLogin()}
                    className="w-full px-4 py-3 rounded-xl text-xs font-semibold text-left flex items-center justify-between"
                    style={{ background: tk.primaryDim, color: tk.primary }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span>I know my {groupLabel.toLowerCase()}</span>
                    <ChevronRight className="w-3.5 h-3.5" />
                  </motion.button>
                  <motion.button
                    onClick={goToJoinOrg}
                    className="w-full px-4 py-3 rounded-xl text-xs font-semibold flex items-center justify-between"
                    style={{ background: tk.cardBgHov, color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}
                    whileHover={{ scale: 1.02, color: tk.textPrimary }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span>Add a {groupLabel.toLowerCase()} to a faculty</span>
                    <Sparkles className="w-3.5 h-3.5" />
                  </motion.button>
                </div>

                <div
                  className="rounded-xl p-3 flex items-start gap-2.5"
                  style={{ background: `${tk.primary}08`, border: `1px solid ${tk.primaryBorder}` }}
                >
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: tk.primary }} />
                  <p className="text-[11px] leading-5" style={{ color: tk.textSec }}>
                    Select your {groupLabel.toLowerCase()} to go directly to your scoped login.
                  </p>
                </div>

                <p className="text-[10px] leading-5" style={{ color: tk.textTer }}>
                  Powered by {APP_NAME}. Access is scoped per {groupLabel.toLowerCase()} — your data stays private.
                </p>
              </div>
            </motion.aside>
          </div>
        </div>
      </PageWrapper>

      {/* Switch modal */}
      <AnimatePresence>
        {switchTarget && (
          <SwitchDeptModal
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