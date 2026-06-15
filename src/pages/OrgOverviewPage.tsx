/**
 * OrgOverviewPage — Organization entry point.
 * Route: /:orgSlug
 *
 * UX principles (v4):
 *  1. Faculty-first drill-down. Students think "Engineering → Civil → 300L".
 *  2. Search navigates directly on tap — inline breadcrumb gives context,
 *     no confirm modal.
 *  3. Hero is a SLIM identity strip — small text, single line, no wrapping
 *     badges on mobile (collapses to TrustBadge + name only).
 *  4. NEW: a persistent "context bar" sits below the hero. Left = section
 *     label ("Faculties" / breadcrumb). Right = a "Manage structure" menu
 *     (Add faculty, Invite founder) — ONE consistent, learnable location
 *     for structure actions regardless of auth state or empty/populated.
 *     Unauthenticated taps route through login (returnTo).
 *  5. Empty state (no faculties) is still a strong onboarding moment, but
 *     now reinforces the SAME "Manage structure" affordance rather than
 *     being a one-off appearance.
 *  6. Flat-group fallback when org has no faculty structure (backward compat).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowRight,
  BookOpen,
  Building2,
  CheckCircle2,
  ChevronRight,
  ChevronDown,
  GraduationCap,
  Layers,
  Link2,
  LogOut,
  MapPin,
  Plus,
  Search,
  Settings,
  Users,
  X,
  AlertTriangle,
  Globe,
  Sparkles,
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
    faculty: { color: tk.blue, icon: GraduationCap, label: 'Faculty' },
    college: { color: tk.blue, icon: GraduationCap, label: 'College' },
    department: { color: tk.primary, icon: BookOpen, label: 'Department' },
    dept: { color: tk.primary, icon: BookOpen, label: 'Department' },
    class: { color: '#8b5cf6', icon: Layers, label: 'Class' },
    year: { color: tk.mint, icon: Layers, label: 'Year' },
    level: { color: '#ec4899', icon: Layers, label: 'Level' },
    general: { color: '#06b6d4', icon: Users, label: 'Group' },
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

// ── Search result ─────────────────────────────────────────────────────────────

type SearchResult = {
  group: OrganizationGroup;
  path: string[];
  kind: string;
};

// ── Loading / Not-found ───────────────────────────────────────────────────────

function LoadingScreen({ tk }: { tk: OT }) {
  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8"
      style={{ background: tk.bg, backgroundImage: tk.bgWash, color: tk.text }}>
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <motion.div className="w-9 h-9 border-2 rounded-full"
          style={{ borderColor: `${tk.primary}30`, borderTopColor: tk.primary }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }} />
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

// ── Empty state — no faculties exist yet ──────────────────────────────────────

function NoFacultiesEmptyState({
  isAuthenticated,
  tk,
  onAddFaculty,
  onInvite,
}: {
  isAuthenticated: boolean;
  tk: OT;
  onAddFaculty: () => void;
  onInvite?: React.ReactNode;
}) {
  return (
    <motion.div
      className="flex flex-col items-center justify-center py-16 px-6 text-center"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
    >
      {/* Icon with glow */}
      <div className="relative mb-6">
        <div
          className="w-20 h-20 rounded-3xl flex items-center justify-center"
          style={{
            background: `linear-gradient(135deg, ${tk.blue}20, ${tk.primary}15)`,
            border: `1px solid ${tk.blue}30`,
            boxShadow: `0 0 40px ${tk.blue}18`,
          }}
        >
          <GraduationCap className="w-9 h-9" style={{ color: tk.blue }} />
        </div>
        <span
          className="absolute -top-1 -right-1 w-4 h-4 rounded-full border-2 flex items-center justify-center"
          style={{ background: tk.amber, borderColor: tk.bg }}
        >
          <Plus className="w-2.5 h-2.5 text-white" />
        </span>
      </div>

      <h3 className="text-xl font-bold mb-2 tracking-tight" style={{ color: tk.text }}>
        No faculties yet
      </h3>
      <p className="text-sm leading-6 max-w-xs mb-1" style={{ color: tk.textSec }}>
        This organization hasn't been structured yet. Faculties are the starting
        point — departments and classes live inside them.
      </p>
      <p className="text-xs mb-8" style={{ color: tk.textTer }}>
        Start by creating the first faculty below.
      </p>

      <motion.button
        onClick={onAddFaculty}
        className="inline-flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-bold text-white mb-3"
        style={{
          background: `linear-gradient(135deg, ${tk.primary}, ${tk.amber})`,
          boxShadow: `0 4px 20px ${tk.primary}40`,
        }}
        whileHover={{ scale: 1.04, boxShadow: `0 6px 28px ${tk.primary}55` }}
        whileTap={{ scale: 0.97 }}
      >
        <Plus className="w-4 h-4" />
        {isAuthenticated ? 'Create the first faculty' : 'Sign in to create a faculty'}
      </motion.button>

      {onInvite && (
        <div className="mt-1">
          <p className="text-[11px] mb-2" style={{ color: tk.textTer }}>
            Or share this with whoever is setting things up:
          </p>
          {onInvite}
        </div>
      )}
    </motion.div>
  );
}

// ── Faculty card ───────────────────────────────────────────────────────────────

function FacultyCard({
  group, index, deptCount, classCount, tk, onClick,
}: {
  group: OrganizationGroup; index: number;
  deptCount: number; classCount: number;
  tk: OT; onClick: () => void;
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
        border: `1px solid ${hov ? km.color + '50' : tk.cardBorder}`,
        boxShadow: hov ? `0 4px 20px ${km.color}14` : 'none',
      }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: Math.min(index * 0.04, 0.28), duration: 0.2 }}
      whileTap={{ scale: 0.983 }}
    >
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all"
          style={{
            background: hov ? `${km.color}22` : `${km.color}12`,
            border: `1px solid ${hov ? `${km.color}40` : `${km.color}1E`}`,
          }}>
          <km.icon className="w-4 h-4" style={{ color: km.color }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold leading-snug truncate" style={{ color: tk.text }}>
            {group.name}
          </p>
          <p className="text-[11px] font-mono uppercase tracking-wider mt-0.5"
            style={{ color: tk.textTer }}>
            {group.short_name}
          </p>
        </div>
        <motion.div animate={{ x: hov ? 2 : 0 }} transition={{ duration: 0.14 }} className="shrink-0 mt-0.5">
          <ChevronRight className="w-4 h-4" style={{ color: hov ? km.color : tk.textTer }} />
        </motion.div>
      </div>

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

// ── Flat group row — fallback for orgs without faculty structure ───────────────

function GroupRow({
  group, index, tk, onClick,
}: {
  group: OrganizationGroup; index: number; tk: OT; onClick: () => void;
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
      <motion.div animate={{ x: hov ? 2 : 0 }} transition={{ duration: 0.14 }}>
        <ArrowRight className="w-4 h-4" style={{ color: hov ? tk.primary : tk.textTer }} />
      </motion.div>
    </motion.button>
  );
}

// ── Pagination ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 9;

function Pagination({ page, total, onChange, tk }: {
  page: number; total: number; onChange: (p: number) => void; tk: OT;
}) {
  const pages = Math.ceil(total / PAGE_SIZE);
  if (pages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-2 mt-5">
      <button onClick={() => onChange(page - 1)} disabled={page === 1}
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
      <button onClick={() => onChange(page + 1)} disabled={page === Math.ceil(total / PAGE_SIZE)}
        className="px-3 py-1.5 rounded-lg text-xs font-semibold disabled:opacity-30 transition-opacity"
        style={{ background: tk.cardHov, color: tk.textSec, border: `1px solid ${tk.cardBorder}` }}>
        Next
      </button>
    </div>
  );
}

// ── Switch session modal ───────────────────────────────────────────────────────

function SwitchModal({ targetGroup, currentGroupName, org, tk, onSwitch, onStay }: {
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
                {org.short_name?.charAt(0) ?? 'O'}
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

// ── Manage Structure menu (context bar) ─────────────────────────────────────────
//
// One consistent dropdown for ALL structure-management actions — Add
// faculty + Invite a faculty founder. Lives in the context bar, visible
// regardless of auth state (unauthenticated tap routes through login via
// goToAddFaculty's returnTo). This replaces the old pattern of scattering
// these actions across the toolbar / sidebar / empty-state depending on
// context — now there's exactly ONE learnable location.
function ManageStructureMenu({
  tk, theme, onAddFaculty, orgSlug,
}: {
  tk: OT; theme: 'light' | 'dark'; onAddFaculty: () => void; orgSlug?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  return (
    <div ref={ref} className="relative shrink-0">
      <motion.button
        onClick={() => setOpen(o => !o)}
        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
        style={{
          background: open ? `${tk.primary}1A` : tk.cardHov,
          color: open ? tk.primary : tk.textSec,
          border: `1px solid ${open ? tk.primary + '40' : tk.cardBorder}`,
        }}
        whileHover={{ scale: 1.03 }} whileTap={{ scale: 0.97 }}>
        <Settings className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Register a faculty</span>
        <span className="sm:hidden">Register a faculty</span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={{ duration: 0.15 }}>
          <ChevronDown className="w-3 h-3" />
        </motion.div>
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute right-0 top-full mt-2 w-64 rounded-2xl overflow-hidden z-30"
            style={{
              background: theme === 'light' ? '#FFFFFF' : '#1A100A',
              border: `1px solid ${tk.cardBorder}`,
              boxShadow: theme === 'light'
                ? '0 20px 50px -12px rgba(15,7,3,0.22), 0 4px 14px -4px rgba(15,7,3,0.08)'
                : '0 20px 60px -12px rgba(0,0,0,0.6), 0 4px 14px -4px rgba(0,0,0,0.3)',
            }}
          >
            <button
              onClick={() => { setOpen(false); onAddFaculty(); }}
              className="w-full flex items-center gap-3 px-3.5 py-3 text-left transition-colors hover:opacity-90"
              style={{ background: 'transparent' }}
            >
              <span className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                style={{ background: `${tk.primary}14`, color: tk.primary }}>
                <Plus className="w-4 h-4" />
              </span>
              <span className="min-w-0">
                <p className="text-xs font-bold" style={{ color: tk.text }}>Add a faculty</p>
                <p className="text-[10.5px]" style={{ color: tk.textTer }}>Create a new top-level faculty</p>
              </span>
            </button>

            {orgSlug && (
              <div className="px-3.5 pb-3 pt-1" style={{ borderTop: `1px solid ${tk.cardBorder}` }}>
                <div className="flex items-center gap-2 pt-2.5 pb-1.5">
                  <Link2 className="w-3.5 h-3.5" style={{ color: tk.textTer }} />
                  <p className="text-[10px] uppercase tracking-widest font-bold" style={{ color: tk.textTer }}>
                    Invite a founder
                  </p>
                </div>
                <p className="text-[11px] leading-4 mb-2" style={{ color: tk.textSec }}>
                  Share this link with whoever is setting up a new faculty. They
                  still need peer votes before exec powers unlock.
                </p>
                <CopyInviteLink
                  url={`/${orgSlug}/add-faculty`}
                  label="Copy invite link"
                  successText="Faculty-founder invite link copied"
                  hint=""
                  t={tk}
                />
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OrgOverviewPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();
  const { isAuthenticated, user, logout } = useMultiTenantAuth();
  const { theme } = useTheme();
  const tk = buildTokens(theme);

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Organization | null>(null);
  const [groups, setGroups] = useState<OrganizationGroup[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [switchTarget, setSwitchTarget] = useState<OrganizationGroup | null>(null);
  const [page, setPage] = useState(1);
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

  // ── Derived ────────────────────────────────────────────────────────────────
  const faculties = useMemo(() =>
    groups.filter(isFaculty).sort((a, b) => (a.name || '').localeCompare(b.name || '')),
    [groups]);

  const flatGroups = useMemo(() =>
    groups
      .filter(g => !isFaculty(g))
      .sort((a, b) => {
        const kd = kindPriority(a.kind) - kindPriority(b.kind);
        if (kd !== 0) return kd;
        const lA = a.levels?.[0] ?? '', lB = b.levels?.[0] ?? '';
        if (lA !== lB) return lA.localeCompare(lB, undefined, { numeric: true });
        return (a.name || '').localeCompare(b.name || '');
      }),
    [groups]);

  const hasFacultyStructure = faculties.length > 0;
  const isEmpty = hasFacultyStructure ? false : flatGroups.length === 0;

  // Parent map for path building
  const groupById = useMemo(() => {
    const m = new Map<string, OrganizationGroup>();
    groups.forEach(g => m.set(g.id, g));
    return m;
  }, [groups]);

  function resolvePath(g: OrganizationGroup): string[] {
    const path: string[] = [];
    let cur: OrganizationGroup | undefined = g;
    const seen = new Set<string>();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      path.unshift(cur.name);
      const pid: string | undefined = (cur as { parent_group_id?: string }).parent_group_id;
      cur = pid ? groupById.get(pid) : undefined;
    }
    return path;
  }

  // Per-faculty child counts
  const childCounts = useMemo(() => {
    const deptCount = new Map<string, number>();
    const classCount = new Map<string, number>();
    groups.forEach(g => {
      const pid = (g as { parent_group_id?: string }).parent_group_id;
      if (!pid) return;
      const parent = groupById.get(pid);
      if (!parent) return;
      if (isFaculty(parent)) {
        const k = g.kind?.toLowerCase() ?? '';
        if (k === 'department' || k === 'dept') {
          deptCount.set(pid, (deptCount.get(pid) ?? 0) + 1);
        } else {
          classCount.set(pid, (classCount.get(pid) ?? 0) + 1);
        }
      }
      const k = g.kind?.toLowerCase() ?? '';
      if (k !== 'department' && k !== 'dept') {
        const gpid = (parent as { parent_group_id?: string }).parent_group_id;
        if (gpid && isFaculty(groupById.get(gpid)!)) {
          classCount.set(gpid, (classCount.get(gpid) ?? 0) + 1);
        }
      }
    });
    return { deptCount, classCount };
  }, [groups, groupById]);

  // ── Global search ──────────────────────────────────────────────────────────
  useEffect(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) { setSearchResults([]); return; }
    setSearchResults(
      groups
        .filter(g =>
          g.name.toLowerCase().includes(q) ||
          g.short_name.toLowerCase().includes(q) ||
          (g.description ?? '').toLowerCase().includes(q)
        )
        .slice(0, 8)
        .map(g => ({ group: g, path: resolvePath(g), kind: g.kind ?? 'general' }))
    );
    setPage(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchQuery, groups]);

  const isSearching = searchQuery.trim().length > 0;

  // Paginated list
  const displayList = hasFacultyStructure ? faculties : flatGroups;
  const pagedList = useMemo(() =>
    displayList.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    [displayList, page]);

  // ── Navigation ─────────────────────────────────────────────────────────────
  const goToAddFaculty = useCallback(() => {
    if (!orgSlug) return;
    if (isAuthenticated) {
      navigate(`/${orgSlug}/add-faculty`);
    } else {
      navigate(`/${orgSlug}/login?returnTo=/${orgSlug}/add-faculty`);
    }
  }, [orgSlug, isAuthenticated, navigate]);

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
    if (isAuthenticated && user) { setSwitchTarget(group); return; }
    navigate(`/${orgSlug}/g/${encodeURIComponent(group.short_name)}`);
  }, [orgSlug, navigate, isAuthenticated, user]);

  const handleSearchTap = useCallback((result: SearchResult) => {
    setSearchQuery('');
    handleGroupClick(result.group);
  }, [handleGroupClick]);

  const handleSwitchConfirm = useCallback(async () => {
    if (!switchTarget || !orgSlug) return;
    await logout?.();
    setSwitchTarget(null);
    const params = new URLSearchParams();
    if (switchTarget.id) params.set('group', switchTarget.id);
    navigate(`/${orgSlug}/login${params.toString() ? `?${params}` : ''}`);
  }, [switchTarget, logout, orgSlug, navigate]);

  // ── Render ─────────────────────────────────────────────────────────────────
  if (loading) return <LoadingScreen tk={tk} />;
  if (!org) return <NotFoundScreen orgSlug={orgSlug} onBack={() => navigate('/')} tk={tk} />;

  const groupLabel = org.group_label ?? 'Group';
  const groupLabelPlural = org.group_label_plural ?? 'Groups';
  const currentGroupName =
    (user as unknown as Record<string, unknown> | null)?.group_name as string ??
    (user as unknown as Record<string, unknown> | null)?.full_name as string ??
    'your current session';

  return (
    <>
      <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8"
        style={{ background: tk.bg, backgroundImage: tk.bgWash, color: tk.text }}>
        <div className="w-full max-w-5xl space-y-3">

          {/* ── Slim identity strip ──
              Small text throughout (text-sm name, not text-xl). On
              mobile, badges collapse to TrustBadge only — org-type
              and "Signed in" pills join at sm:. overflow-hidden +
              no flex-wrap keeps this a fixed single-line height. */}
          <motion.div
            className="rounded-2xl px-4 py-3 relative overflow-hidden flex items-center gap-3"
            style={{
              background: `linear-gradient(135deg, ${tk.primarySoft}, ${tk.card})`,
              border: `1px solid ${tk.cardBorder}`,
            }}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          >
            <div className="absolute inset-0 pointer-events-none"
              style={{ background: `radial-gradient(ellipse 45% 70% at 100% 50%, ${tk.primary}14, transparent)` }} />

            {/* Logo / initial — smaller (9 instead of 11) */}
            <div className="relative shrink-0">
              {org.logo_url ? (
                <img src={org.logo_url} alt={org.name}
                  className="w-10 h-10 rounded-lg object-cover"
                  style={{ border: `1px solid ${tk.cardBorder}` }}
                  onError={e => {
                    (e.target as HTMLImageElement).style.display = 'none';
                    const fb = (e.target as HTMLImageElement).nextElementSibling as HTMLElement | null;
                    if (fb) fb.style.display = 'flex';
                  }}
                />
              ) : null}
              <div
                className="w-9 h-9 rounded-lg flex items-center justify-center text-white font-extrabold text-sm"
                style={{ background: tk.gradOrange, display: org.logo_url ? 'none' : 'flex' }}>
                {org.short_name?.slice(0, 1) ?? 'O'}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2"
                style={{ background: tk.mint, borderColor: tk.bg }} />
            </div>

            {/* Name + badges — single line, overflow-hidden (no wrap) */}
            <div className="min-w-0 flex-1 relative">
              <h1 className="text-base sm:text-lg font-extrabold leading-tight tracking-tight truncate"
                style={{ color: tk.text }}>
                {org.name}
              </h1>
              <div className="flex items-center gap-2 mt-1">
                <TrustBadge
                  level={((org as { trust_level?: TrustLevel }).trust_level) ?? 'community'}
                  size="sm" showTooltip
                />
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full capitalize shrink-0"
                  style={{ background: tk.cardHov, color: tk.textSec }}>
                  <Globe className="w-2.5 h-2.5" /> {org.organization_type}
                </span>
              </div>
            </div>

            {/* Single stat — faculty/group count, desktop only */}
            <div className="shrink-0 rounded-lg px-3 py-1.5 text-center relative overflow-hidden hidden sm:block"
              style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, minWidth: 60 }}>
              <p className="text-base font-bold leading-none" style={{ color: tk.text }}>
                {hasFacultyStructure ? faculties.length : groups.length}
              </p>
              <p className="text-[8.5px] uppercase tracking-wider mt-0.5" style={{ color: tk.textTer }}>
                {hasFacultyStructure ? 'Faculties' : groupLabelPlural}
              </p>
            </div>
          </motion.div>

          {/* ── Context bar — persistent, single learnable location
                for structure actions. Left = section label, right =
                Manage structure menu (always visible; unauthenticated
                taps route through login). ── */}
          <motion.div
            className="flex items-center justify-between gap-3 px-1"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.04, duration: 0.25 }}
          >
            <p className="text-[11px] sm:text-xs font-semibold uppercase tracking-wider truncate"
              style={{ color: tk.textTer }}>
              {hasFacultyStructure
                ? `${faculties.length} facult${faculties.length !== 1 ? 'ies' : 'y'}`
                : `${groups.length} ${groupLabelPlural.toLowerCase()}`}
            </p>
            <ManageStructureMenu tk={tk} theme={theme} onAddFaculty={goToAddFaculty} orgSlug={orgSlug} />
          </motion.div>

          {/* ── Body ── */}
          <div className="grid lg:grid-cols-[1fr_248px] gap-5 items-start">

            {/* Main panel */}
            <motion.div
              className="rounded-[24px] overflow-hidden"
              style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.07, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Toolbar — now just title + search (structure actions
                  moved to the context bar above) */}
              <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5"
                style={{ borderBottom: `1px solid ${tk.cardBorder}` }}>
                <div className="flex-1 min-w-0">
                  <h2 className="text-base font-bold tracking-tight" style={{ color: tk.text }}>
                    {hasFacultyStructure
                      ? 'Select your faculty'
                      : `Select a ${groupLabel.toLowerCase()}`}
                  </h2>
                  <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
                    {hasFacultyStructure
                      ? 'Tap to browse departments & classes inside'
                      : `${groups.length} ${groupLabelPlural.toLowerCase()} available`}
                  </p>
                </div>

                {/* Search */}
                <div className="relative shrink-0">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5"
                    style={{ color: tk.textTer }} />
                  <input
                    ref={searchRef}
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    placeholder="Search all classes…"
                    className="w-full sm:w-56 pl-9 pr-8 py-2 rounded-xl text-sm outline-none transition-all"
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

              {/* Content */}
              <div className="p-3 sm:p-4">

                {/* ── Search results ── */}
                {isSearching && (
                  <AnimatePresence mode="wait">
                    {searchResults.length === 0 ? (
                      <motion.div key="no-results" className="py-14 text-center"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Search className="w-7 h-7 mx-auto mb-3 opacity-20" style={{ color: tk.textTer }} />
                        <p className="text-sm font-semibold mb-1" style={{ color: tk.text }}>
                          No results for "{searchQuery}"
                        </p>
                        <p className="text-xs mb-4" style={{ color: tk.textTer }}>
                          Try the faculty name, department, or class code.
                        </p>
                        <button
                          onClick={() => { setSearchQuery(''); searchRef.current?.blur(); }}
                          className="text-xs font-semibold underline underline-offset-2"
                          style={{ color: tk.primary }}>
                          Browse faculties instead
                        </button>
                      </motion.div>
                    ) : (
                      <motion.div key="results" className="space-y-0.5"
                        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <p className="text-[10px] uppercase tracking-widest font-bold px-2 mb-2"
                          style={{ color: tk.textTer }}>
                          {searchResults.length} result{searchResults.length !== 1 ? 's' : ''}
                        </p>
                        {searchResults.map((result, i) => {
                          const km = kindMeta(result.kind, tk);
                          return (
                            <motion.button
                              key={result.group.id}
                              onClick={() => handleSearchTap(result)}
                              className="w-full text-left flex items-center gap-3 px-3 py-3 rounded-xl transition-all"
                              style={{ background: 'transparent', border: '1px solid transparent' }}
                              initial={{ opacity: 0, x: -5 }}
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
                                  <div className="flex items-center gap-0.5 mt-0.5 flex-wrap">
                                    <MapPin className="w-2.5 h-2.5 shrink-0" style={{ color: tk.textTer }} />
                                    {result.path.slice(0, -1).map((seg, si) => (
                                      <span key={si} className="flex items-center gap-0.5">
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
                            </motion.button>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                )}

                {/* ── Faculty grid / flat list / empty state ── */}
                {!isSearching && (
                  <>
                    {/* ── Empty: org has no faculties yet ── */}
                    {isEmpty && (
                      <NoFacultiesEmptyState
                        isAuthenticated={isAuthenticated}
                        tk={tk}
                        onAddFaculty={goToAddFaculty}
                        onInvite={
                          orgSlug ? (
                            <CopyInviteLink
                              url={`/${orgSlug}/add-faculty`}
                              label="Copy invite link"
                              successText="Faculty-founder invite link copied"
                              hint="Anyone with this link can register a faculty. They still need peer votes before exec powers unlock."
                              t={tk}
                            />
                          ) : undefined
                        }
                      />
                    )}

                    {/* ── Faculty grid ── */}
                    {!isEmpty && hasFacultyStructure && (
                      <>
                        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                          {pagedList.map((g, i) => (
                            <FacultyCard
                              key={g.id} group={g} index={i}
                              deptCount={childCounts.deptCount.get(g.id) ?? 0}
                              classCount={childCounts.classCount.get(g.id) ?? 0}
                              tk={tk}
                              onClick={() => handleGroupClick(g)}
                            />
                          ))}
                        </div>
                        <Pagination
                          page={page} total={faculties.length}
                          onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          tk={tk}
                        />
                      </>
                    )}

                    {/* ── Flat list fallback ── */}
                    {!isEmpty && !hasFacultyStructure && (
                      <>
                        <div className="space-y-0.5">
                          {pagedList.map((g, i) => (
                            <GroupRow
                              key={g.id} group={g} index={i}
                              tk={tk} onClick={() => handleGroupClick(g)}
                            />
                          ))}
                        </div>
                        <Pagination
                          page={page} total={flatGroups.length}
                          onChange={p => { setPage(p); window.scrollTo({ top: 0, behavior: 'smooth' }); }}
                          tk={tk}
                        />
                      </>
                    )}
                  </>
                )}
              </div>
            </motion.div>

            {/* ── Sidebar ── */}
            <motion.aside
              className="rounded-[24px] overflow-hidden sticky top-6"
              style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.13, duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
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
                {/* Primary guidance */}
                <div>
                  <div className="w-9 h-9 rounded-xl flex items-center justify-center mb-3"
                    style={{ background: tk.primarySoft }}>
                    <GraduationCap className="w-4 h-4" style={{ color: tk.primary }} />
                  </div>
                  <h3 className="text-sm font-bold mb-1" style={{ color: tk.text }}>
                    {isEmpty ? 'Get started' : 'Finding your class?'}
                  </h3>
                  <p className="text-xs leading-5" style={{ color: tk.textSec }}>
                    {isEmpty
                      ? 'Use "Manage structure" above to create the first faculty.'
                      : hasFacultyStructure
                        ? 'Tap your faculty → pick your department → pick your class to sign in or join.'
                        : `Select your ${groupLabel.toLowerCase()} in the list to sign in or join.`}
                  </p>
                </div>

                <div style={{ borderTop: `1px solid ${tk.cardBorder}` }} />

                {/* Hint chip */}
                <div className="rounded-xl p-3 flex items-start gap-2"
                  style={{ background: `${tk.primary}08`, border: `1px solid ${tk.primaryRing}` }}>
                  <Sparkles className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: tk.primary }} />
                  <p className="text-[11px] leading-5" style={{ color: tk.textSec }}>
                    {hasFacultyStructure
                      ? "Can't find your class? Use the search bar — it scans all classes instantly."
                      : `Select your ${groupLabel.toLowerCase()} to access your scoped login.`}
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

      {/* Switch session modal */}
      <AnimatePresence>
        {switchTarget && (
          <SwitchModal
            targetGroup={switchTarget}
            currentGroupName={currentGroupName}
            org={org} tk={tk}
            onSwitch={handleSwitchConfirm}
            onStay={() => setSwitchTarget(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}