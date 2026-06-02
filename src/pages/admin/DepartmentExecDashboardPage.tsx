/**
 * DepartmentExecDashboardPage — the home page when you're acting as a
 * verified departmental exec (Layer 4, scope_level='unit', and the
 * admin record's group is a department).
 *
 * What a dept exec actually does (per the strategic plan):
 *   • Sees the classes under their department
 *   • Publishes dues / events targeted at:
 *       ▸ a single class,
 *       ▸ all classes in the dept (one cascading due, NOT N copies),
 *       ▸ a specific level (e.g. only 200L students across the dept)
 *   • Sees a per-due rollup: how many in each class paid
 *
 * What they explicitly DON'T do here:
 *   • Manage individual students (names/emails/removals) — that's the
 *     class rep's job, closer to the student
 *   • See per-payment financial detail — that's also class-rep scope
 *   • Touch the org-wide settings, payout, billing
 *
 * Route: /:orgSlug/admin/dept   (gated by requireVerified)
 *
 * Visual language: same theme tokens + cards as the rest of the app.
 * The page is intentionally narrower than the class admin dashboard
 * because the dept exec has fewer levers to pull — clutter would hurt.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Building2,
  CalendarClock,
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
interface ClassRow {
  group: OrganizationGroup;
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
  // Rollup
  total_targets: number;
  paid_count: number;
}

/**
 * Resolves "is the caller a verified DEPARTMENT exec?" from their admin
 * records. We look for an active row with:
 *   • verification_layer >= 4 (fully verified, money unlocked)
 *   • scope_level = 'unit'
 *   • group_id pointing at something that is NOT a faculty/college
 *
 * We don't insist on kind='department' exactly because real data
 * sometimes uses 'unit', 'subgroup', or a NULL kind for the level
 * below faculty. Anything that has a parent_group_id (i.e. it sits
 * under a faculty) qualifies; the FacultyExecDashboardPage takes care
 * of the kind='faculty'|'college' case.
 *
 * Returns null when the caller doesn't qualify — the page renders a
 * friendly "this area is for verified department execs" panel instead.
 */
function pickDeptAdmin(records: MemberAdmin[], groups: OrganizationGroup[]):
  { admin: MemberAdmin; dept: OrganizationGroup } | null
{
  for (const a of records) {
    if (!a.is_active) continue;
    if ((a.verification_layer ?? 0) < 4) continue;
    if (a.scope_level !== 'unit') continue;
    if (!a.group_id) continue;
    const group = groups.find((g) => g.id === a.group_id);
    if (!group) continue;
    const kind = (group.kind || '').toLowerCase();
    // Reject only the faculty/college tier — everything else at
    // scope=unit is treated as a department for dashboard purposes.
    if (kind === 'faculty' || kind === 'college') continue;
    return { admin: a, dept: group };
  }
  return null;
}

export default function DepartmentExecDashboardPage() {
  const tk = useThemeTokens();
  const { user, organization } = useMultiTenantAuth();
  const { go, orgSlug } = useAppNav();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [dept, setDept] = useState<OrganizationGroup | null>(null);
  const [adminRow, setAdminRow] = useState<MemberAdmin | null>(null);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [recentDues, setRecentDues] = useState<RecentDue[]>([]);

  // ── Resolve role + load classes + recent dues ──────────────────────
  useEffect(() => {
    let cancelled = false;
    if (!user || !organization) {
      setLoading(false);
      return;
    }

    (async () => {
      setLoading(true);
      setDenied(false);

      // 1. Pull all groups for the org once — we'll need them to
      //    resolve the caller's dept AND to list classes under it.
      let groups: OrganizationGroup[] = [];
      try {
        groups = await organizationService.getGroups(organization.id);
      } catch {
        if (!cancelled) { setDenied(true); setLoading(false); }
        return;
      }
      if (cancelled) return;

      const records = (user.admin_records as MemberAdmin[]) || [];
      const resolved = pickDeptAdmin(records, groups);
      if (!resolved) {
        if (!cancelled) { setDenied(true); setLoading(false); }
        return;
      }
      const { admin, dept: deptGroup } = resolved;
      setAdminRow(admin);
      setDept(deptGroup);

      // 2. Direct children of the dept = classes/levels
      const classGroups = groups.filter(
        (g) => g.parent_group_id === deptGroup.id,
      );

      // 3. For each class, fetch active dues count in parallel. We do
      //    this server-side as a single IN() query so we don't fan out
      //    one-per-class.
      const classIds = classGroups.map((g) => g.id);

      // Active dues across all the classes in this dept (in one query)
      const { data: dueRows } = classIds.length > 0
        ? await supabase
            .from('payment_types')
            .select('id, group_id')
            .eq('organization_id', organization.id)
            .in('group_id', classIds)
            .eq('is_active', true)
        : { data: [] };

      const activeByClass = new Map<string, number>();
      ((dueRows as Array<{ group_id: string }>) || []).forEach((r) => {
        activeByClass.set(r.group_id, (activeByClass.get(r.group_id) || 0) + 1);
      });

      const rows: ClassRow[] = classGroups
        .map((g) => ({
          group: g,
          memberCount: (g as { current_member_count?: number }).current_member_count ?? 0,
          activeDuesCount: activeByClass.get(g.id) || 0,
        }))
        .sort((a, b) => {
          // Sort by level if present (100L → 200L → 300L), then by name.
          const la = a.group.levels?.[0] ?? a.group.name ?? '';
          const lb = b.group.levels?.[0] ?? b.group.name ?? '';
          return la.localeCompare(lb, undefined, { numeric: true });
        });
      if (cancelled) return;
      setClasses(rows);

      // 4. Recent dues I published: payment_types where created_by = me
      //    and (target group is this dept, OR target group is one of
      //    this dept's classes). That captures both "all classes in
      //    dept" (group_id = dept) AND "single class" (group_id = a
      //    class). Limit to 8 latest.
      const targetIds = [deptGroup.id, ...classIds];
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

      // Rollup: count "approved" payments per payment_type, plus the
      // expected target population (members in the targeted scope,
      // optionally filtered by level).
      const dueIds = pubs.map((p) => p.id);
      let paidCounts = new Map<string, number>();
      if (dueIds.length > 0) {
        const { data: payRows } = await supabase
          .from('payments')
          .select('payment_type_id')
          .in('payment_type_id', dueIds)
          .eq('status', 'approved');
        ((payRows as Array<{ payment_type_id: string }>) || [])
          .forEach((p) => {
            paidCounts = paidCounts.set(p.payment_type_id, (paidCounts.get(p.payment_type_id) || 0) + 1);
          });
      }

      // Expected target = members in the target group (and descendants
      // if it's the dept itself). Optional level filter.
      const targetPopulation = (groupId: string, levels: string[] | null): number => {
        // Members in target group OR in its descendant groups (for
        // dept-wide dues). We approximate population by summing
        // current_member_count on the matched groups — close enough
        // for a "how many should pay?" denominator.
        const matched =
          groupId === deptGroup.id
            ? [deptGroup, ...classGroups]
            : classGroups.filter((c) => c.id === groupId);
        const total = matched.reduce(
          (s, g) => s + ((g as { current_member_count?: number }).current_member_count ?? 0),
          0,
        );
        if (!levels?.length) return total;
        // Level-filtered: only count classes whose `levels` overlap.
        const matchedByLevel = matched.filter((g) =>
          (g.levels ?? []).some((l) => levels.includes(l)),
        );
        return matchedByLevel.reduce(
          (s, g) => s + ((g as { current_member_count?: number }).current_member_count ?? 0),
          0,
        );
      };

      const recent: RecentDue[] = pubs.map((p) => {
        const targetGroup = p.group_id === deptGroup.id
          ? deptGroup
          : classGroups.find((c) => c.id === p.group_id);
        return {
          id: p.id,
          title: p.title,
          amount: Number(p.amount || 0),
          target_levels: p.target_levels,
          group_id: p.group_id,
          group_name: targetGroup?.name ?? null,
          group_kind: (targetGroup?.kind || null),
          created_at: p.created_at,
          is_active: p.is_active,
          total_targets: targetPopulation(p.group_id, p.target_levels),
          paid_count: paidCounts.get(p.id) || 0,
        };
      });
      if (cancelled) return;
      setRecentDues(recent);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [user, organization]);

  // Roll-up of dept-wide stats (header) — purely for context, never
  // financial detail.
  const totals = useMemo(() => {
    const memberTotal = classes.reduce((s, c) => s + c.memberCount, 0);
    const duesTotal   = classes.reduce((s, c) => s + c.activeDuesCount, 0);
    return { memberTotal, duesTotal, classCount: classes.length };
  }, [classes]);

  // ── Loading ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10" style={{ color: tk.text }}>
        <div className="flex items-center gap-2" style={{ color: tk.textSec }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading your department…</span>
        </div>
      </div>
    );
  }

  // ── Denied (user shouldn't be here) ──────────────────────────────
  // Layer-4 dept-exec route — if the caller doesn't qualify, send them
  // back to /dashboard. The header role-switcher is the canonical way
  // to land here, so most denials mean a deep-link or a role expiry.
  if (denied || !dept || !adminRow) {
    return (
      <div
        className="max-w-md mx-auto mt-16 px-5 py-6 rounded-2xl text-center"
        style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, color: tk.text }}
      >
        <ShieldCheck className="w-8 h-8 mx-auto mb-2" style={{ color: tk.amber }} />
        <p className="font-bold text-sm">This area is for verified department execs.</p>
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
            {adminRow.role_label || adminRow.role || 'Departmental Exec'}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: tk.textTer }}
          >
            <Building2 className="w-3 h-3" />
            {dept.name}
          </span>
        </div>
        <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight">
          {dept.name} dashboard
        </h1>
        <p className="text-sm" style={{ color: tk.textSec }}>
          Publish dues and events for one class, all classes in your department,
          or a specific level. You're not seeing student-level financial detail
          here — that stays with each class rep.
        </p>
      </motion.header>

      {/* ── Quick stats ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-3 gap-3"
      >
        <Stat label="Classes"        value={totals.classCount}  icon={<Layers className="w-3.5 h-3.5" />} tk={tk} color={tk.primary} />
        <Stat label="Members total"  value={totals.memberTotal} icon={<Users className="w-3.5 h-3.5" />}  tk={tk} color={tk.blue} />
        <Stat label="Active dues"    value={totals.duesTotal}   icon={<Receipt className="w-3.5 h-3.5" />} tk={tk} color={tk.mint} />
      </motion.div>

      {/* ── Publish a due — quick targeting CTAs ────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="rounded-2xl p-5 sm:p-6 relative overflow-hidden"
        style={{
          background: tk.card,
          border: `1px solid ${tk.cardBorder}`,
          boxShadow: tk.shadow,
        }}
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
                One due, one row. Target it precisely — no fan-out, no duplicate ledgers.
              </p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-1 sm:grid-cols-3 gap-3">
            <TargetCard
              icon={<Layers className="w-5 h-5" />}
              title="A single class"
              sub="Pick one class under your dept."
              tk={tk}
              accent={tk.primary}
              onClick={() => navigate(
                `/${orgSlug}/admin/create-payment?scope=group&deptId=${dept.id}`,
              )}
            />
            <TargetCard
              icon={<Building2 className="w-5 h-5" />}
              title="All classes in this dept"
              sub="One cascading due — every class sees it."
              tk={tk}
              accent={tk.blue}
              onClick={() => navigate(
                `/${orgSlug}/admin/create-payment?scope=faculty&groupId=${dept.id}`,
              )}
            />
            <TargetCard
              icon={<TrendingUp className="w-5 h-5" />}
              title="A specific level"
              sub="e.g. only 200L students across the dept."
              tk={tk}
              accent={tk.purple}
              onClick={() => navigate(
                `/${orgSlug}/admin/create-payment?scope=faculty&groupId=${dept.id}&byLevel=1`,
              )}
            />
          </div>
        </div>
      </motion.section>

      {/* ── Classes I oversee ──────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <header className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">
              Classes you oversee
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
              Read-only. Edits to individual students happen at the class level.
            </p>
          </div>
          {classes.length > 0 && (
            <Link
              to={`/${orgSlug}/admin/groups`}
              className="text-xs font-semibold inline-flex items-center gap-1"
              style={{ color: tk.primary }}
            >
              Manage hierarchy <ArrowRight className="w-3 h-3" />
            </Link>
          )}
        </header>

        {classes.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
          >
            <Layers className="w-7 h-7 mx-auto mb-2" style={{ color: tk.textTer }} />
            <p className="font-semibold text-sm">No classes in this department yet.</p>
            <p className="text-xs mt-1" style={{ color: tk.textSec }}>
              Ask the faculty exec (or platform admin) to add the first class.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, boxShadow: tk.shadow }}
          >
            <div className="divide-y" style={{ borderColor: tk.cardBorder }}>
              {classes.map((row) => (
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
                    <Layers className="w-4 h-4" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold truncate">
                      {row.group.name}
                    </p>
                    <p className="text-[11px]" style={{ color: tk.textTer }}>
                      {row.memberCount} member{row.memberCount === 1 ? '' : 's'}
                      {' · '}
                      {row.activeDuesCount} active due{row.activeDuesCount === 1 ? '' : 's'}
                    </p>
                  </div>
                  {row.group.levels?.length ? (
                    <span
                      className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full"
                      style={{ background: tk.primarySoft, color: tk.primary }}
                    >
                      {row.group.levels[0]}
                    </span>
                  ) : null}
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
              Tap a row to see who paid, by class. No per-payment financials.
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
              onClick={() => navigate(`/${orgSlug}/admin/create-payment?scope=faculty&groupId=${dept.id}`)}
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
                  : d.group_kind === 'department'
                    ? 'All classes'
                    : (d.group_name || 'Class');
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
          })}. Dept exec roles refresh each academic session.
        </p>
      )}
    </div>
  );
}

// ── Sub-components ─────────────────────────────────────────────────

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
