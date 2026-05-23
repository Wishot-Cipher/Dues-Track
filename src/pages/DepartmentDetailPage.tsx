/**
 * DepartmentDetailPage — drill-in view for a single department.
 *
 * Route: /:orgSlug/d/:departmentShort
 *
 * Position in the hierarchy:
 *   University → Faculty → ▶ Department ◀ → Class (100L, 200L, ...)
 *
 * Shows:
 *   • Breadcrumb back to the parent faculty (and to the org root)
 *   • Department hero with kind / member count / trust badge
 *   • The list of CLASSES (or other leaf groups) whose
 *     parent_group_id is this department
 *   • "+ Add class" CTA visible to all (admins; non-admins still
 *     see it but RLS / RPC will reject if they're not authorized)
 *
 * Click handling on children: classes / levels → /g/:short (welcome).
 * Privacy: same autonomy rules from mig 022 + 028 apply.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Building2,
  GraduationCap,
  Layers,
  Search,
  Users,
} from 'lucide-react';
import PageWrapper from '@/components/ui/PageWrapper';
import { organizationService } from '@/services/organizationService';
import TrustBadge from '@/components/trust/TrustBadge';
import type {
  Organization,
  OrganizationGroup,
  TrustLevel,
} from '@/types/multiTenant';

const tk = {
  bg:           '#0F0703',
  cardBg:       'rgba(255,255,255,0.03)',
  cardBgHov:    'rgba(255,255,255,0.055)',
  cardBorder:   'rgba(255,255,255,0.08)',
  hoverBorder:  'rgba(255,104,3,0.35)',
  textPrimary:  '#FFFFFF',
  textSec:      'rgba(255,255,255,0.55)',
  textTer:      'rgba(255,255,255,0.30)',
  primary:      '#FF6803',
  blue:         '#3b82f6',
  mint:         '#30FFAC',
  purple:       '#8b5cf6',
};

const KIND_META: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  class:       { color: tk.purple,  icon: Layers,   label: 'Class' },
  level:       { color: '#ec4899',  icon: Layers,   label: 'Level' },
  association: { color: tk.mint,    icon: Users,    label: 'Association' },
  general:     { color: tk.mint,    icon: Users,    label: 'Group' },
  fellowship:  { color: tk.blue,    icon: Users,    label: 'Fellowship' },
};
function kindMeta(kind?: string) {
  return KIND_META[kind?.toLowerCase() || ''] ?? KIND_META.general;
}

export default function DepartmentDetailPage() {
  const { orgSlug, departmentShort } = useParams<{ orgSlug: string; departmentShort: string }>();
  const navigate = useNavigate();

  // Explicit state machine — see FacultyDetailPage for rationale.
  type LoadState = 'loading' | 'ok' | 'org_not_found' | 'department_not_found';
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [org, setOrg] = useState<Organization | null>(null);
  const [department, setDepartment] = useState<OrganizationGroup | null>(null);
  const [parentFaculty, setParentFaculty] = useState<OrganizationGroup | null>(null);
  const [children, setChildren] = useState<OrganizationGroup[]>([]);
  const [query, setQuery] = useState('');

  useEffect(() => {
    let cancelled = false;
    if (!orgSlug || !departmentShort) return;

    setLoadState('loading');
    setOrg(null);
    setDepartment(null);
    setParentFaculty(null);
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

      const dep = all.find(
        (g) => g.short_name?.toLowerCase() === decodeURIComponent(departmentShort).toLowerCase()
          && (g.kind?.toLowerCase() === 'department'
              || g.kind?.toLowerCase() === 'class'
              || g.kind?.toLowerCase() === 'general')
      ) ?? null;

      if (!dep) {
        setLoadState('department_not_found');
        return;
      }
      setDepartment(dep);

      if (dep.parent_group_id) {
        setParentFaculty(all.find((g) => g.id === dep.parent_group_id) ?? null);
      }

      const kids = all
        .filter((g) => g.parent_group_id === dep.id)
        .sort((a, b) => {
          const la = a.levels?.[0] ?? a.name ?? '';
          const lb = b.levels?.[0] ?? b.name ?? '';
          return la.localeCompare(lb, undefined, { numeric: true });
        });
      setChildren(kids);
      setLoadState('ok');
    })();
    return () => { cancelled = true; };
  }, [orgSlug, departmentShort]);

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
      <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
        <div className="flex flex-col items-center justify-center py-20 gap-4">
          <motion.div
            className="w-10 h-10 border-2 rounded-full"
            style={{ borderColor: `${tk.primary}30`, borderTopColor: tk.primary }}
            animate={{ rotate: 360 }}
            transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
          />
          <p className="text-xs tracking-wider" style={{ color: tk.textTer }}>
            Loading department…
          </p>
        </div>
      </PageWrapper>
    );
  }

  if (loadState === 'org_not_found' || loadState === 'department_not_found' || !org || !department) {
    return (
      <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
        <motion.div
          className="w-full max-w-md rounded-[28px] p-10 text-center"
          style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="w-14 h-14 rounded-2xl mx-auto mb-5 flex items-center justify-center"
            style={{ background: `${tk.primary}15` }}>
            <BookOpen className="w-7 h-7" style={{ color: tk.primary }} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3 tracking-tight">Department not found</h1>
          <p className="text-sm leading-6" style={{ color: tk.textSec }}>
            No department at <span className="text-white font-semibold">/{orgSlug}/d/{departmentShort}</span>.
          </p>
          <motion.button
            onClick={() => navigate(`/${orgSlug}/overview`)}
            className="mt-6 px-6 py-3 rounded-xl font-semibold text-sm text-white"
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
  const classLabelPlural = (department.kind === 'department') ? 'Classes' : 'Groups';

  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
      <div className="w-full max-w-5xl space-y-5">

        {/* ── Breadcrumb ── */}
        <div className="flex items-center gap-1.5 text-xs flex-wrap" style={{ color: tk.textSec }}>
          <motion.button
            onClick={() => navigate(`/${orgSlug}/overview`)}
            className="font-medium transition-colors hover:text-white"
            whileHover={{ x: -2 }}
          >
            {org.short_name}
          </motion.button>
          {parentFaculty && (
            <>
              <span style={{ color: tk.textTer }}>/</span>
              <button
                onClick={() => navigate(`/${orgSlug}/f/${encodeURIComponent(parentFaculty.short_name)}`)}
                className="font-medium transition-colors hover:text-white"
              >
                {parentFaculty.short_name}
              </button>
            </>
          )}
          <span style={{ color: tk.textTer }}>/</span>
          <span className="font-semibold text-white">{department.short_name}</span>
        </div>

        {/* ── Department hero ── */}
        <motion.div
          className="rounded-[28px] p-5 sm:p-7 relative overflow-hidden"
          style={{
            background: 'linear-gradient(135deg, rgba(255,104,3,0.10), rgba(255,255,255,0.02))',
            border: `1px solid ${tk.cardBorder}`,
          }}
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="absolute inset-0 pointer-events-none"
            style={{ background: 'radial-gradient(ellipse 50% 60% at 95% 10%, rgba(255,104,3,0.14), transparent)' }} />

          <div className="relative flex flex-col sm:flex-row sm:items-center gap-5 justify-between">
            <div className="flex items-center gap-4 min-w-0">
              <div className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center"
                style={{ background: `${tk.primary}18`, border: `1px solid ${tk.primary}30` }}>
                <BookOpen className="w-6 h-6" style={{ color: tk.primary }} />
              </div>
              <div className="min-w-0">
                <p className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-0.5" style={{ color: tk.textTer }}>
                  {parentFaculty ? `${org.name} · ${unitLabel}: ${parentFaculty.name}` : org.name}
                </p>
                <h1 className="text-xl sm:text-2xl font-extrabold text-white leading-tight tracking-tight">
                  {department.name}
                </h1>
                <div className="flex flex-wrap items-center gap-2 mt-1.5">
                  <TrustBadge level={(org.trust_level as TrustLevel) ?? 'community'} size="sm" />
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: 'rgba(255,255,255,0.06)', color: tk.textSec }}>
                    <Building2 className="w-3 h-3" /> {department.short_name}
                  </span>
                  {children.length > 0 && (
                    <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                      style={{ background: `${tk.primary}14`, color: tk.primary }}>
                      <Layers className="w-3 h-3" /> {children.length} {classLabelPlural.toLowerCase()}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="rounded-xl px-4 py-2.5 text-center relative overflow-hidden shrink-0"
              style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}`, minWidth: 84 }}>
              <div className="absolute top-0 inset-x-0 h-0.5" style={{ background: tk.primary }} />
              <p className="text-[9px] uppercase tracking-wider" style={{ color: tk.textTer }}>{classLabelPlural}</p>
              <p className="text-xl font-bold text-white mt-1">{children.length}</p>
            </div>
          </div>
        </motion.div>

        {/* ── Children list ── */}
        <motion.div
          className="rounded-[24px] overflow-hidden"
          style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.08, duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        >
          <div
            className="flex flex-col sm:flex-row sm:items-center gap-3 p-4 sm:p-5"
            style={{ borderBottom: `1px solid ${tk.cardBorder}` }}
          >
            <div className="flex-1">
              <h2 className="text-base font-bold text-white tracking-tight">
                {classLabelPlural} in {department.name}
              </h2>
              <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
                {children.length > 0
                  ? `Pick a ${classLabelPlural.toLowerCase().slice(0, -2)} to join or sign in.`
                  : 'Add the first one to get started.'}
              </p>
            </div>

            <motion.button
              onClick={() =>
                navigate(`/${org.slug}/d/${encodeURIComponent(department.short_name)}/new`)
              }
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold whitespace-nowrap"
              style={{
                background: `${tk.primary}14`,
                color: tk.primary,
                border: `1px solid ${tk.primary}30`,
              }}
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
            >
              <span style={{ fontSize: 14, lineHeight: 1 }}>+</span>
              Add class
            </motion.button>

            <div className="relative flex-1 sm:max-w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: tk.textTer }} />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search…"
                className="w-full pl-9 pr-3 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{
                  background: 'rgba(255,255,255,0.05)',
                  border: `1px solid ${tk.cardBorder}`,
                  caretColor: tk.primary,
                }}
                onFocus={(e) => {
                  e.currentTarget.style.borderColor = `${tk.primary}50`;
                  e.currentTarget.style.boxShadow = `0 0 0 3px ${tk.primary}12`;
                }}
                onBlur={(e) => {
                  e.currentTarget.style.borderColor = tk.cardBorder;
                  e.currentTarget.style.boxShadow = 'none';
                }}
              />
            </div>
          </div>

          {filtered.length === 0 ? (
            <div className="px-6 py-16 text-center space-y-4">
              <p className="text-sm" style={{ color: tk.textSec }}>
                {query
                  ? `No ${classLabelPlural.toLowerCase()} match "${query}".`
                  : `No ${classLabelPlural.toLowerCase()} in ${department.name} yet. Be the first.`}
              </p>
              {!query && (
                <motion.button
                  onClick={() =>
                    navigate(`/${org.slug}/d/${encodeURIComponent(department.short_name)}/new`)
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
                  Add the first class
                </motion.button>
              )}
            </div>
          ) : (
            <div className="p-3">
              {filtered.map((g, i) => (
                <ChildRow
                  key={g.id}
                  group={g}
                  index={i}
                  onClick={() =>
                    navigate(`/${orgSlug}/g/${encodeURIComponent(g.short_name)}`)
                  }
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
  group, index, onClick,
}: {
  group: OrganizationGroup;
  index: number;
  onClick: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const km = kindMeta(group.kind);
  const levelText = group.levels?.length ? group.levels.join(' · ') : '';
  const memberCount = (group as { current_member_count?: number; member_count?: number })
    .current_member_count ?? (group as { member_count?: number }).member_count ?? 0;

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
          <span
            className="text-[9px] font-bold uppercase tracking-widest px-1.5 py-0.5 rounded inline-block mb-1"
            style={{ background: `${tk.primary}15`, color: tk.primary }}
          >
            Level {levelText}
          </span>
        )}
        <p className="text-sm font-semibold text-white truncate leading-snug">{group.name}</p>
        <p className="text-[11px] font-mono uppercase tracking-wider mt-0.5 truncate" style={{ color: tk.textTer }}>
          {group.short_name}
          {group.kind && !levelText && (
            <span className="ml-2 normal-case font-sans tracking-normal" style={{ color: km.color }}>
              · {km.label}
            </span>
          )}
          {memberCount > 0 && (
            <span className="ml-2 normal-case font-sans tracking-normal" style={{ color: tk.textSec }}>
              · {memberCount} {memberCount === 1 ? 'member' : 'members'}
            </span>
          )}
        </p>
      </div>

      <motion.div animate={{ x: hovered ? 3 : 0 }} transition={{ duration: 0.18 }} className="shrink-0">
        <ArrowRight className="w-4 h-4" style={{ color: hovered ? tk.primary : tk.textTer }} />
      </motion.div>
    </motion.button>
  );
}
