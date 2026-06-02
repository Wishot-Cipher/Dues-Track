/**
 * FacultyExecDashboardPage — the home page when you're acting as a
 * verified faculty exec (Layer 4, scope_level='unit', and the admin
 * record's group is a faculty/college).
 *
 * What a faculty exec actually does:
 *   • Sees the departments under their faculty (and a class count per dept)
 *   • Publishes dues / events targeted at:
 *       ▸ a single department,
 *       ▸ all departments in the faculty (one cascading due),
 *       ▸ a specific level across the whole faculty (e.g. all 200L)
 *   • Sees a per-due rollup at department level, with totals
 *
 * Explicitly NOT here:
 *   • Per-student edits (class-rep scope)
 *   • Per-payment financial detail (class-rep scope)
 *   • Org-wide payout / billing / sub-account
 *
 * Route: /:orgSlug/admin/faculty   (gated by requireVerified)
 *
 * Pairs with DepartmentExecDashboardPage — same visual language so a
 * user who toggles between roles experiences a consistent surface,
 * just at a different tier of the hierarchy.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  CalendarClock,
  GraduationCap,
  Layers,
  Loader2,
  Plus,
  Receipt,
  ShieldCheck,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import { useAppNav } from '@/hooks/useAppNav';
import { supabase } from '@/config/supabase';
import { organizationService } from '@/services/organizationService';
import type { MemberAdmin, OrganizationGroup } from '@/types/multiTenant';

// ── Local types ───────────────────────────────────────────────────────
interface DeptRow {
  group: OrganizationGroup;
  classCount: number;
  memberCount: number;
  activeDuesCount: number;
}

interface RecentDue {
  id: string;
  title: string;
  amount: number;
  target_levels: string[] | null;
  group_id: string | null;
  group_name: string | null;
  group_kind: string | null;
  created_at: string;
  is_active: boolean;
  total_targets: number;
  paid_count: number;
}

/**
 * Resolves "is the caller a verified FACULTY exec?". We accept either:
 *   • kind='faculty' or kind='college' (the explicit signal), OR
 *   • a top-level unit group (parent_group_id IS NULL) — which is
 *     what a faculty IS structurally, regardless of what kind text
 *     someone typed.
 * Anything below the top level falls through to the dept exec page.
 */
function pickFacultyAdmin(records: MemberAdmin[], groups: OrganizationGroup[]):
  { admin: MemberAdmin; faculty: OrganizationGroup } | null
{
  for (const a of records) {
    if (!a.is_active) continue;
    if ((a.verification_layer ?? 0) < 4) continue;
    if (a.scope_level !== 'unit') continue;
    if (!a.group_id) continue;
    const group = groups.find((g) => g.id === a.group_id);
    if (!group) continue;
    const kind = (group.kind || '').toLowerCase();
    const isTopLevel = !group.parent_group_id;
    if (kind !== 'faculty' && kind !== 'college' && !isTopLevel) continue;
    return { admin: a, faculty: group };
  }
  return null;
}

export default function FacultyExecDashboardPage() {
  const tk = useThemeTokens();
  const { user, organization } = useMultiTenantAuth();
  const { go, orgSlug } = useAppNav();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [faculty, setFaculty] = useState<OrganizationGroup | null>(null);
  const [adminRow, setAdminRow] = useState<MemberAdmin | null>(null);
  const [departments, setDepartments] = useState<DeptRow[]>([]);
  const [recentDues, setRecentDues] = useState<RecentDue[]>([]);

  useEffect(() => {
    let cancelled = false;
    if (!user || !organization) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setDenied(false);

      // Pull the org's whole group tree once.
      let groups: OrganizationGroup[] = [];
      try {
        groups = await organizationService.getGroups(organization.id);
      } catch {
        if (!cancelled) { setDenied(true); setLoading(false); }
        return;
      }
      if (cancelled) return;

      const records = (user.admin_records as MemberAdmin[]) || [];
      const resolved = pickFacultyAdmin(records, groups);
      if (!resolved) {
        if (!cancelled) { setDenied(true); setLoading(false); }
        return;
      }
      const { admin, faculty: facultyGroup } = resolved;
      setAdminRow(admin);
      setFaculty(facultyGroup);

      // Direct children of the faculty (mostly departments; could also
      // include leaf groups for non-academic shapes).
      const deptGroups = groups.filter((g) => g.parent_group_id === facultyGroup.id);

      // All classes that sit under any of those departments.
      const deptIds = deptGroups.map((g) => g.id);
      const classGroups = groups.filter(
        (g) => g.parent_group_id && deptIds.includes(g.parent_group_id),
      );

      // For each dept, count classes + sum member_count + count active
      // dues targeted at it or at any of its classes. Single IN() query
      // for the dues, then bucket by class.
      const allRelevantIds = [...deptIds, ...classGroups.map((g) => g.id)];

      const { data: dueRows } = allRelevantIds.length > 0
        ? await supabase
            .from('payment_types')
            .select('id, group_id')
            .eq('organization_id', organization.id)
            .in('group_id', allRelevantIds)
            .eq('is_active', true)
        : { data: [] };

      const activeByGroup = new Map<string, number>();
      ((dueRows as Array<{ group_id: string }>) || []).forEach((r) => {
        activeByGroup.set(r.group_id, (activeByGroup.get(r.group_id) || 0) + 1);
      });

      // Bucket classes by their dept parent for per-dept rollups.
      const classesByDept = new Map<string, OrganizationGroup[]>();
      classGroups.forEach((c) => {
        if (!c.parent_group_id) return;
        if (!classesByDept.has(c.parent_group_id)) classesByDept.set(c.parent_group_id, []);
        classesByDept.get(c.parent_group_id)!.push(c);
      });

      const deptRows: DeptRow[] = deptGroups
        .map((dept) => {
          const kids = classesByDept.get(dept.id) || [];
          const memberCount =
            ((dept as { current_member_count?: number }).current_member_count ?? 0) +
            kids.reduce(
              (s, k) => s + ((k as { current_member_count?: number }).current_member_count ?? 0),
              0,
            );
          // Active dues for this dept = dues targeting the dept itself
          // plus dues targeting any of its classes.
          const deptActive = activeByGroup.get(dept.id) || 0;
          const classesActive = kids.reduce((s, k) => s + (activeByGroup.get(k.id) || 0), 0);
          return {
            group: dept,
            classCount: kids.length,
            memberCount,
            activeDuesCount: deptActive + classesActive,
          };
        })
        .sort((a, b) => a.group.name.localeCompare(b.group.name));
      if (cancelled) return;
      setDepartments(deptRows);

      // Recent dues I published — targeting either the faculty itself,
      // any dept under it, or any class under those depts. Cast a wide
      // net so this list represents the faculty exec's actual activity.
      const targetIds = [facultyGroup.id, ...deptIds, ...classGroups.map((g) => g.id)];
      const { data: pubRows } = await supabase
        .from('payment_types')
        .select('id, title, amount, target_levels, group_id, created_at, is_active')
        .eq('organization_id', organization.id)
        .eq('created_by', user.id)
        .in('group_id', targetIds)
        .order('created_at', { ascending: false })
        .limit(8);

      const pubs = (pubRows as Array<{
        id: string; title: string; amount: number;
        target_levels: string[] | null; group_id: string;
        created_at: string; is_active: boolean;
      }>) || [];

      // Paid counts per due.
      const dueIds = pubs.map((p) => p.id);
      const paidCounts = new Map<string, number>();
      if (dueIds.length > 0) {
        const { data: payRows } = await supabase
          .from('payments')
          .select('payment_type_id')
          .in('payment_type_id', dueIds)
          .eq('status', 'approved');
        ((payRows as Array<{ payment_type_id: string }>) || [])
          .forEach((p) => {
            paidCounts.set(p.payment_type_id, (paidCounts.get(p.payment_type_id) || 0) + 1);
          });
      }

      // Target population estimator: if target is the faculty itself,
      // sum across all classes; if it's a dept, sum its classes; if it's
      // a class, just that class. Optional level filter further narrows
      // it to classes whose `levels` overlap.
      const populationOf = (groupId: string, levels: string[] | null): number => {
        let matched: OrganizationGroup[] = [];
        if (groupId === facultyGroup.id) matched = classGroups;
        else if (deptIds.includes(groupId)) matched = classesByDept.get(groupId) || [];
        else {
          const cls = classGroups.find((g) => g.id === groupId);
          matched = cls ? [cls] : [];
        }
        if (levels?.length) {
          matched = matched.filter((g) => (g.levels ?? []).some((l) => levels.includes(l)));
        }
        return matched.reduce(
          (s, g) => s + ((g as { current_member_count?: number }).current_member_count ?? 0),
          0,
        );
      };

      const recent: RecentDue[] = pubs.map((p) => {
        const targetGroup =
          p.group_id === facultyGroup.id
            ? facultyGroup
            : (deptGroups.find((d) => d.id === p.group_id)
               ?? classGroups.find((c) => c.id === p.group_id));
        return {
          id: p.id,
          title: p.title,
          amount: Number(p.amount || 0),
          target_levels: p.target_levels,
          group_id: p.group_id,
          group_name: targetGroup?.name ?? null,
          group_kind: targetGroup?.kind ?? null,
          created_at: p.created_at,
          is_active: p.is_active,
          total_targets: populationOf(p.group_id, p.target_levels),
          paid_count: paidCounts.get(p.id) || 0,
        };
      });
      if (cancelled) return;
      setRecentDues(recent);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user, organization]);

  const totals = useMemo(() => {
    const memberTotal = departments.reduce((s, d) => s + d.memberCount, 0);
    const classTotal  = departments.reduce((s, d) => s + d.classCount, 0);
    const duesTotal   = departments.reduce((s, d) => s + d.activeDuesCount, 0);
    return { deptCount: departments.length, classTotal, memberTotal, duesTotal };
  }, [departments]);

  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10" style={{ color: tk.text }}>
        <div className="flex items-center gap-2" style={{ color: tk.textSec }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading your faculty…</span>
        </div>
      </div>
    );
  }

  if (denied || !faculty || !adminRow) {
    return (
      <div
        className="max-w-md mx-auto mt-16 px-5 py-6 rounded-2xl text-center"
        style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, color: tk.text }}
      >
        <ShieldCheck className="w-8 h-8 mx-auto mb-2" style={{ color: tk.amber }} />
        <p className="font-bold text-sm">This area is for verified faculty execs.</p>
        <p className="text-xs mt-1" style={{ color: tk.textSec }}>
          Switch to a different role from the top-right role switcher, or head back to your dashboard.
        </p>
        <button
          type="button"
          onClick={() => go('/dashboard')}
          className="mt-4 px-4 py-2 rounded-xl text-sm font-bold inline-flex items-center gap-1.5"
          style={{ background: tk.gradOrange, color: '#FFFFFF' }}
        >
          Back to dashboard
          <ArrowRight className="w-4 h-4" />
        </button>
      </div>
    );
  }

  const currencySymbol = organization?.currency_symbol || '₦';

  return (
    <div className="max-w-5xl mx-auto px-4 py-6 space-y-6" style={{ color: tk.text }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <motion.header
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-2"
      >
        <div className="flex items-center gap-2 flex-wrap">
          <span
            className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
            style={{ background: tk.primarySoft, color: tk.primary, border: `1px solid ${tk.primaryRing}` }}
          >
            <ShieldCheck className="w-3 h-3" />
            {adminRow.role_label || adminRow.role || 'Faculty Exec'}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: tk.textTer }}
          >
            <GraduationCap className="w-3 h-3" />
            {faculty.name}
          </span>
        </div>
        <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight">
          {faculty.name} dashboard
        </h1>
        <p className="text-sm" style={{ color: tk.textSec }}>
          Publish dues and events for one department, all departments in your
          faculty, or a specific level across them. Per-student edits and
          per-payment detail stay with each class rep.
        </p>
      </motion.header>

      {/* ── Quick stats ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        <Stat label="Departments" value={totals.deptCount}   icon={<Building2 className="w-3.5 h-3.5" />} tk={tk} color={tk.primary} />
        <Stat label="Classes"     value={totals.classTotal}  icon={<Layers className="w-3.5 h-3.5" />}    tk={tk} color={tk.purple} />
        <Stat label="Members"     value={totals.memberTotal} icon={<Users className="w-3.5 h-3.5" />}     tk={tk} color={tk.blue} />
        <Stat label="Active dues" value={totals.duesTotal}   icon={<Receipt className="w-3.5 h-3.5" />}   tk={tk} color={tk.mint} />
      </motion.div>

      {/* ── Publish a due — targeting CTAs ──────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
        style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, boxShadow: tk.shadow }}
      >
        <span
          aria-hidden
          className="absolute -right-12 -bottom-12 w-44 h-44 rounded-full pointer-events-none"
          style={{ background: tk.blob1, filter: 'blur(60px)' }}
        />
        <div className="relative">
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: tk.primary }}>
                Publish a due
              </p>
              <h2 className="text-lg font-extrabold tracking-tight mt-0.5">
                Who should pay?
              </h2>
              <p className="text-xs mt-1" style={{ color: tk.textSec }}>
                One due, one row. Target precisely — no class-level fan-out, no duplicate ledgers.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TargetCard
              icon={<Building2 className="w-5 h-5" />}
              title="A single department"
              sub="Pick one dept inside this faculty."
              tk={tk}
              accent={tk.primary}
              onClick={() => navigate(
                `/${orgSlug}/admin/create-payment?scope=faculty&facultyId=${faculty.id}&pickDept=1`,
              )}
            />
            <TargetCard
              icon={<GraduationCap className="w-5 h-5" />}
              title="All departments"
              sub="One cascading due — every dept (and its classes) sees it."
              tk={tk}
              accent={tk.blue}
              onClick={() => navigate(
                `/${orgSlug}/admin/create-payment?scope=faculty&groupId=${faculty.id}`,
              )}
            />
            <TargetCard
              icon={<TrendingUp className="w-5 h-5" />}
              title="A specific level"
              sub="e.g. only 200L across the whole faculty."
              tk={tk}
              accent={tk.purple}
              onClick={() => navigate(
                `/${orgSlug}/admin/create-payment?scope=faculty&groupId=${faculty.id}&byLevel=1`,
              )}
            />
          </div>
        </div>
      </motion.section>

      {/* ── Departments under this faculty ──────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <header className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">
              Departments you oversee
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
              Read-only roll-ups. Each dept's exec runs their own classes.
            </p>
          </div>
          {departments.length > 0 && (
            <Link
              to={`/${orgSlug}/admin/groups`}
              className="text-xs font-semibold inline-flex items-center gap-1"
              style={{ color: tk.primary }}
            >
              Manage hierarchy <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </header>

        {departments.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
          >
            <Building2 className="w-7 h-7 mx-auto mb-2" style={{ color: tk.textTer }} />
            <p className="font-semibold text-sm">No departments under this faculty yet.</p>
            <p className="text-xs mt-1" style={{ color: tk.textSec }}>
              Add the first department from the hierarchy page.
            </p>
            <button
              type="button"
              onClick={() => go('/admin/groups')}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: tk.gradOrange, color: '#FFFFFF' }}
            >
              <Plus className="w-4 h-4" /> Open hierarchy
            </button>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, boxShadow: tk.shadow }}
          >
            <div className="divide-y" style={{ borderColor: tk.cardBorder }}>
              {departments.map((row) => (
                <div
                  key={row.group.id}
                  className="px-4 py-3 flex items-center gap-3"
                  style={{ borderColor: tk.cardBorder }}
                >
                  <div
                    className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: tk.primarySoft,
                      color: tk.primary,
                      border: `1px solid ${tk.primaryRing}`,
                    }}
                  >
                    <Building2 className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">{row.group.name}</p>
                    <p className="text-[11px]" style={{ color: tk.textTer }}>
                      {row.classCount} class{row.classCount === 1 ? '' : 'es'}
                      {' · '}
                      {row.memberCount} member{row.memberCount === 1 ? '' : 's'}
                      {' · '}
                      {row.activeDuesCount} active due{row.activeDuesCount === 1 ? '' : 's'}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </motion.section>

      {/* ── Recent dues I published ─────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <header className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">
              Recent dues you published
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
              Tap a row to see who paid, grouped by dept then class.
            </p>
          </div>
          <button
            type="button"
            onClick={() => go(`/admin/manage-dues`)}
            className="text-xs font-semibold inline-flex items-center gap-1"
            style={{ color: tk.primary }}
          >
            View all <ArrowRight className="w-3 h-3" />
          </button>
        </header>

        {recentDues.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
          >
            <Receipt className="w-7 h-7 mx-auto mb-2" style={{ color: tk.textTer }} />
            <p className="font-semibold text-sm">No dues published yet.</p>
            <p className="text-xs mt-1" style={{ color: tk.textSec }}>
              Use the targeting cards above to publish your first one.
            </p>
            <button
              type="button"
              onClick={() => navigate(`/${orgSlug}/admin/create-payment?scope=faculty&groupId=${faculty.id}`)}
              className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold"
              style={{ background: tk.gradOrange, color: '#FFFFFF' }}
            >
              <Plus className="w-4 h-4" /> Publish a due
            </button>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, boxShadow: tk.shadow }}
          >
            <div className="divide-y" style={{ borderColor: tk.cardBorder }}>
              {recentDues.map((d) => {
                const pct = d.total_targets > 0
                  ? Math.min(100, Math.round((d.paid_count / d.total_targets) * 100))
                  : 0;
                const targetSummary = d.target_levels?.length
                  ? `${d.target_levels.join(' · ')}`
                  : d.group_kind === 'faculty' || d.group_kind === 'college'
                    ? 'All departments'
                    : (d.group_name || 'Group');
                return (
                  <Link
                    key={d.id}
                    to={`/${orgSlug}/admin/manage-dues?focus=${d.id}`}
                    className="px-4 py-3.5 flex items-center gap-3 transition-colors hover:bg-black/[0.02]"
                    style={{ borderColor: tk.cardBorder, color: tk.text }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: `${tk.primary}14`,
                        color: tk.primary,
                        border: `1px solid ${tk.primaryRing}`,
                      }}
                    >
                      <Receipt className="w-4 h-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">{d.title}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
                        {targetSummary} · {currencySymbol}{d.amount.toLocaleString('en-NG')}
                      </p>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <p className="text-[11px] font-bold tabular-nums" style={{ color: tk.text }}>
                        {d.paid_count}/{d.total_targets || '—'}
                      </p>
                      <div
                        className="h-1 rounded-full mt-1 overflow-hidden"
                        style={{ background: tk.isLight ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.07)' }}
                      >
                        <div
                          className="h-full"
                          style={{ width: `${pct}%`, background: tk.gradOrange }}
                        />
                      </div>
                    </div>
                    <ArrowRight className="w-4 h-4 shrink-0" style={{ color: tk.textTer }} />
                  </Link>
                );
              })}
            </div>
          </div>
        )}
      </motion.section>

      {/* ── Footer note about session lifecycle ─────────────────── */}
      {adminRow.tenure_start && (
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: tk.textTer }}>
          <CalendarClock className="w-3 h-3" />
          Acting since {new Date(adminRow.tenure_start as unknown as string).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
          })}. Faculty exec roles refresh each academic session.
        </p>
      )}
    </div>
  );
}

// ── Sub-components — same shape as the dept dashboard so the visual
// language between the two tiers stays consistent. ───────────────────

function Stat({
  label, value, icon, color, tk,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  tk: ReturnType<typeof useThemeTokens>;
}) {
  return (
    <div
      className="rounded-2xl p-3 sm:p-4"
      style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, boxShadow: tk.shadow }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </span>
        <p className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: tk.textTer }}>
          {label}
        </p>
      </div>
      <p className="text-xl font-extrabold tabular-nums mt-2" style={{ color: tk.text }}>
        {value}
      </p>
    </div>
  );
}

function TargetCard({
  icon, title, sub, accent, tk, onClick,
}: {
  icon: React.ReactNode;
  title: string;
  sub: string;
  accent: string;
  tk: ReturnType<typeof useThemeTokens>;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group text-left rounded-2xl p-4 transition-all hover:-translate-y-0.5 active:scale-[0.99]"
      style={{
        background: tk.isLight ? '#FFFFFF' : 'rgba(255,255,255,0.03)',
        border: `1px solid ${tk.cardBorder}`,
        boxShadow: tk.shadow,
      }}
    >
      <span
        className="inline-flex w-10 h-10 rounded-xl items-center justify-center mb-2.5"
        style={{ background: `${accent}14`, color: accent, border: `1px solid ${accent}30` }}
      >
        {icon}
      </span>
      <p className="text-sm font-bold" style={{ color: tk.text }}>
        {title}
      </p>
      <p className="text-[11px] mt-1" style={{ color: tk.textTer }}>
        {sub}
      </p>
      <span
        className="inline-flex items-center gap-1 text-[11px] font-semibold mt-2 transition-transform group-hover:translate-x-0.5"
        style={{ color: accent }}
      >
        Choose <ArrowRight className="w-3 h-3" />
      </span>
    </button>
  );
}
