/**
 * FacultyDetailPage — drill-in view for a single faculty/unit inside an org.
 *
 * Route: /:orgSlug/f/:facultyShortName
 *
 * Shows:
 *   • Org breadcrumb (← back to org overview)
 *   • Faculty header (name + trust badge inherited from org + member count)
 *   • The list of CLASS/DEPARTMENT/level groups whose parent_group_id is
 *     this faculty's id
 *   • CTA to "create a class in this faculty" for verified admins
 *
 * Privacy: respects the autonomy rules from migration 022. A visitor sees
 * the LIST of classes (directory info — names, kinds, member counts) but
 * NOT their members, payments, or expenses. Clicking a class opens the
 * existing switch/join modal flow (handled on the org overview page).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  ChevronRight,
  GraduationCap,
  Layers,
  Search,
  Users,
} from 'lucide-react';
import PageWrapper from '@/components/ui/PageWrapper';
import { organizationService } from '@/services/organizationService';
import TrustBadge from '@/components/trust/TrustBadge';
import { useThemeTokens, type ThemeTokens } from '@/hooks/useThemeTokens';
import type {
  Organization,
  OrganizationGroup,
  TrustLevel,
} from '@/types/multiTenant';

// Brand accent colors per group kind. Used as `${color}15` translucent tints
// + colored icon glyphs, so they're theme-invariant by design.
const KIND_META: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  class:      { color: '#8b5cf6', icon: Layers,   label: 'Class' },
  department: { color: '#FF6803', icon: BookOpen, label: 'Department' },
  level:      { color: '#ec4899', icon: Layers,   label: 'Level' },
  general:    { color: '#30FFAC', icon: Users,    label: 'Group' },
  fellowship: { color: '#3B82F6', icon: Users,    label: 'Fellowship' },
};
function kindMeta(kind?: string) {
  return KIND_META[kind?.toLowerCase() || ''] ?? KIND_META.general;
}

export default function FacultyDetailPage() {
  const t = useThemeTokens();
  const { orgSlug, facultyShortName } = useParams<{ orgSlug: string; facultyShortName: string }>();
  const navigate = useNavigate();

  // Explicit state machine. `loadState='loading'` is the ONLY state that shows
  // the spinner — we never derive "not found" from a null check on org/faculty,
  // because React can render with `loading=false, faculty=null` between awaits
  // and that produces a not-found flicker. Now the not-found screens are only
  // shown when the async work has explicitly resolved to a missing record.
  type LoadState = 'loading' | 'ok' | 'org_not_found' | 'faculty_not_found';
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [org, setOrg] = useState<Organization | null>(null);
  const [faculty, setFaculty] = useState<OrganizationGroup | null>(null);
  const [children, setChildren] = useState<OrganizationGroup[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!orgSlug || !facultyShortName) return;

    setLoadState('loading');
    setOrg(null);
    setFaculty(null);
    setChildren([]);

    (async () => {
      const orgData = await organizationService.getBySlug(orgSlug);
      if (cancelled) return;
      if (!orgData) {
        setLoadState('org_not_found');
        return;
      }
      setOrg(orgData);

      const all = await organizationService.getGroups(orgData.id);
      if (cancelled) return;

      const fac = all.find(
        (g) =>
          g.short_name?.toLowerCase() === decodeURIComponent(facultyShortName).toLowerCase() &&
          g.kind?.toLowerCase() === 'faculty'
      ) ?? null;

      if (!fac) {
        setLoadState('faculty_not_found');
        return;
      }
      setFaculty(fac);

      const kids = all
        .filter((g) => g.parent_group_id === fac.id && g.kind?.toLowerCase() !== 'faculty')
        .sort((a, b) => {
          const la = a.levels?.[0] ?? '';
          const lb = b.levels?.[0] ?? '';
          if (la !== lb) return la.localeCompare(lb, undefined, { numeric: true });
          return a.name.localeCompare(b.name);
        });
      setChildren(kids);
      setLoadState('ok');
    })();
    return () => {
      cancelled = true;
    };
  }, [orgSlug, facultyShortName]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return children;
    return children.filter(
      (g) =>
        g.name.toLowerCase().includes(q) ||
        g.short_name?.toLowerCase().includes(q) ||
        (g.description ?? '').toLowerCase().includes(q)
    );
  }, [children, query]);

  if (loadState === 'loading') {
    return (
      <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8" style={{ background: t.bg, backgroundImage: t.bgWash, color: t.text }}>
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <motion.div
            className="w-10 h-10 border-2 rounded-full"
            style={{ borderColor: `${t.primary}30`, borderTopColor: t.primary }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-xs tracking-wider" style={{ color: t.textTer }}>
            Loading faculty…
          </p>
        </div>
      </PageWrapper>
    );
  }

  if (loadState === 'org_not_found' || loadState === 'faculty_not_found' || !org || !faculty) {
    return (
      <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8" style={{ background: t.bg, backgroundImage: t.bgWash, color: t.text }}>
        <motion.div
          className="w-full max-w-md rounded-[28px] p-10 text-center"
          style={{ background: t.card, border: `1px solid ${t.cardBorder}`, color: t.text }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
            style={{ background: `${t.primary}15` }}
          >
            <GraduationCap className="w-7 h-7" style={{ color: t.primary }} />
          </div>
          <h1 className="text-2xl font-bold mb-3 tracking-tight">Faculty not found</h1>
          <p className="text-sm leading-6" style={{ color: t.textSec }}>
            No faculty at <span className="font-semibold">/{orgSlug}/f/{facultyShortName}</span>.
          </p>
          <motion.button
            onClick={() => navigate(`/${orgSlug}/overview`)}
            className="mt-6 px-6 py-3 rounded-xl font-semibold text-sm"
            style={{ background: 'linear-gradient(135deg, #FF6803, #FFAC5F)' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Back to {org?.short_name ?? 'organization'}
          </motion.button>
        </motion.div>
      </PageWrapper>
    );
  }

  const unitLabel = org.unit_label ?? 'Faculty';
  const groupLabelPlural = org.group_label_plural ?? 'Departments';

  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8" style={{ background: t.bg, backgroundImage: t.bgWash, color: t.text }}>
      <div className="w-full max-w-5xl space-y-5">
        {/* ── Breadcrumb trail (Org › Faculty) ── */}
        <nav className="flex items-center gap-1.5 text-xs font-medium" style={{ color: t.textSec }}>
          <motion.button
            onClick={() => navigate(`/${orgSlug}/overview`)}
            className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg transition-colors"
            style={{ color: t.textSec }}
            whileHover={{ x: -1 }}
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>{org.short_name}</span>
          </motion.button>
          <ChevronRight className="w-3 h-3" style={{ color: t.textTer }} />
          <span className="px-2 py-1 rounded-lg font-semibold" style={{ color: t.text }}>
            {faculty.short_name || faculty.name}
          </span>
        </nav>

        {/* ── Faculty hero ── */}
        <motion.div
          className="rounded-[28px] p-5 sm:p-7 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(59,130,246,0.10), rgba(255,255,255,0.02))',
            border: `1px solid ${t.cardBorder}`,
          }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 50% 60% at 95% 10%, rgba(59,130,246,0.16), transparent)' }}
          />

          <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center"
                style={{ background: `${t.blue}18`, border: `1px solid ${t.blue}30` }}
              >
                <GraduationCap className="w-6 h-6" style={{ color: t.blue }} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: t.textTer }}>
                  {org.name} · {unitLabel}
                </p>
                <h1 className="text-xl sm:text-2xl font-extrabold leading-tight tracking-tight">
                  {faculty.name}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <TrustBadge level={(org.trust_level as TrustLevel) ?? 'community'} size="sm" />
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(255,255,255,0.06)', color: t.textSec }}>
                    <Building2 className="w-3 h-3" /> {faculty.short_name}
                  </span>
                  {children.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `${t.primary}14`, color: t.primary }}>
                      <Layers className="w-3 h-3" /> {children.length} {groupLabelPlural.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl px-4 py-2.5 text-center relative overflow-hidden shrink-0"
              style={{ background: t.card, border: `1px solid ${t.cardBorder}`, minWidth: 84 }}>
              <div className="absolute top-0 inset-x-0 h-0.5" style={{ background: t.blue }} />
              <p className="text-[9px] uppercase tracking-wider" style={{ color: t.textTer }}>{groupLabelPlural}</p>
              <p className="text-xl font-bold mt-1">{children.length}</p>
            </div>
          </div>
        </motion.div>

        {/* ── Children list ── */}
        <motion.div
          className="rounded-[24px] overflow-hidden"
          style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5"
            style={{ borderBottom: `1px solid ${t.cardBorder}` }}
          >
            <div className="flex-1">
              <h2 className="text-base font-bold tracking-tight">
                {groupLabelPlural} in {faculty.name}
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: t.textTer }}>
                Pick a {(org.group_label ?? 'class').toLowerCase()} to join, or add a new one.
              </p>
            </div>

            <motion.button
              onClick={() =>
                navigate(`/${org.slug}/f/${encodeURIComponent(faculty.short_name)}/new`)
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
              style={{
                background: `${t.primary}14`,
                color: t.primary,
                border: `1px solid ${t.primary}30`,
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
              Add {org.group_label?.toLowerCase() ?? 'department'}
            </motion.button>

            <div className="relative flex-1 sm:max-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: t.textTer }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm outline-none"
                style={{
                  background: t.input,
                  border: `1px solid ${t.inputBorder}`,
                  color: t.text,
                  caretColor: t.primary,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = `${t.primary}50`;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${t.primary}12`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = t.cardBorder;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="px-6 py-12 sm:py-16 text-center">
              {query ? (
                <p className="text-sm" style={{ color: t.textSec }}>
                  No {groupLabelPlural.toLowerCase()} match <span style={{ color: t.text, fontWeight: 600 }}>"{query}"</span>.
                </p>
              ) : (
                <div className="max-w-md mx-auto space-y-4">
                  <div
                    className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
                    style={{
                      background: t.isLight ? '#FFF7EE' : 'rgba(255,104,3,0.10)',
                      border: `1px solid ${t.primaryRing}`,
                    }}
                  >
                    <BookOpen className="w-7 h-7" style={{ color: t.primary }} />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold mb-1" style={{ color: t.text }}>
                      No {groupLabelPlural.toLowerCase()} yet
                    </h3>
                    <p className="text-sm leading-6" style={{ color: t.textSec }}>
                      {groupLabelPlural} live inside <span style={{ color: t.text, fontWeight: 600 }}>{faculty.name}</span>.
                      Add the first one to start collecting dues here.
                    </p>
                  </div>
                  <motion.button
                    onClick={() =>
                      navigate(`/${org.slug}/f/${encodeURIComponent(faculty.short_name)}/new`)
                    }
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold"
                    style={{
                      background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
                      color: 'white',
                      boxShadow: '0 8px 24px rgba(255,104,3,0.35)',
                    }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    <span style={{ fontSize: 16, lineHeight: 1 }}>+</span>
                    Add the first {org.group_label?.toLowerCase() ?? 'department'}
                  </motion.button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-3">
              {filtered.map((g, i) => (
                <ChildRow
                  key={g.id}
                  group={g}
                  index={i}
                  t={t}
                  onClick={() => {
                    // Department drill-down: department/college groups have
                    // their own browse page showing the classes inside them.
                    // Leaf kinds (class, level, fellowship, association) go
                    // straight to the welcome page (signup / signin / invite).
                    const kind = g.kind?.toLowerCase();
                    if (kind === 'department' || kind === 'college') {
                      navigate(`/${orgSlug}/d/${encodeURIComponent(g.short_name)}`);
                    } else {
                      navigate(`/${orgSlug}/g/${encodeURIComponent(g.short_name)}`);
                    }
                  }}
                />
              ))}
            </div>
          )}
        </motion.div>
      </div>
    </PageWrapper>
  );
}

function ChildRow({
  group,
  index,
  onClick,
  t,
}: {
  group: OrganizationGroup;
  index: number;
  onClick: () => void;
  t: ThemeTokens;
}) {
  const [hovered, setHovered] = useState(false);
  const km = kindMeta(group.kind);
  const levelText = group.levels?.length ? group.levels.join(' · ') : '';

  return (
    <motion.button
      onClick={onClick}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="w-full text-left flex items-center gap-4 px-4 py-3.5 rounded-2xl transition-all"
      style={{
        background: hovered ? t.cardHover : 'transparent',
        border: `1px solid ${hovered ? t.primaryRing : 'transparent'}`,
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
          <span
            className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded inline-block mb-1"
            style={{ background: `${t.primary}15`, color: t.primary }}
          >
            Level {levelText}
          </span>
        )}
        <p className="text-sm font-semibold truncate leading-snug">{group.name}</p>
        <p className="text-[11px] font-mono uppercase tracking-wider mt-0.5 truncate" style={{ color: t.textTer }}>
          {group.short_name}
          {group.kind && !levelText && (
            <span className="ml-2 normal-case font-sans tracking-normal" style={{ color: km.color }}>
              · {km.label}
            </span>
          )}
        </p>
      </div>

      <motion.div animate={{ x: hovered ? 3 : 0 }} transition={{ duration: 0.18 }} className="shrink-0">
        <ArrowRight className="w-4 h-4" style={{ color: hovered ? t.primary : t.textTer }} />
      </motion.div>
    </motion.button>
  );
}
