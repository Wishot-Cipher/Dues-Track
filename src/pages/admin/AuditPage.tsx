/**
 * AuditPage — payments aggregated by tier for execs above the class.
 *
 * Strategic rule (per user spec):
 *   • Faculty exec → "show me payments arranged BY DEPARTMENT, then
 *     by class inside each, so I can find who paid in a particular
 *     dept fast."
 *   • Department exec → "show me payments arranged BY CLASS, so I
 *     can compare which classes have paid the most."
 *   • Org owner → everything in the org rolled up by faculty
 *     (collapses into the same shape as the dept/faculty view).
 *
 * Each row shows: the group's name + kind chip + member count +
 * approved-payment total + pending count. Click a group → expands
 * to show the layer below (faculty → dept; dept → class). Click
 * a class → drill into its individual payments list.
 *
 * Why a new page rather than a tab on /admin/review:
 *   Review is per-payment ("approve / reject these"). Audit is
 *   per-group ("which units have collected the most"). Different
 *   muscle, different layout — squeezing both onto Review made
 *   it cluttered and slow.
 *
 * Class reps don't get this surface — they're already at the
 * leaf and seeing the same data in MyDues / Manage Dues. The
 * route guard restricts allowedScopes to ['unit', 'org'].
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Users,
  Receipt,
  TrendingUp,
  AlertCircle,
  Search,
  Layers,
  GraduationCap,
  Network,
  BookOpen,
  Building2,
} from 'lucide-react';
import { useAppNav } from '@/hooks/useAppNav';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { supabase } from '@/config/supabase';
import { getScopedGroupIds } from '@/utils/scopedGroups';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface GroupRow {
  id: string;
  name: string;
  short_name: string;
  kind: string;
  parent_group_id: string | null;
  member_count: number;
}

interface PaymentRow {
  id: string;
  member_id: string;
  group_id: string | null;
  payment_type_id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  transaction_ref: string | null;
  approved_at: string | null;
  member?: { full_name: string; member_id: string } | null;
  payment_type?: { title: string } | null;
}

interface AggregatedGroup {
  group: GroupRow;
  paidTotal: number;
  paidCount: number;
  pendingCount: number;
  childrenIds: string[];
}

function kindIcon(kind?: string) {
  const k = kind?.toLowerCase() || '';
  if (k === 'faculty' || k === 'college') return <GraduationCap className="w-4 h-4" />;
  if (k === 'department') return <Network className="w-4 h-4" />;
  if (k === 'class' || k === 'level') return <BookOpen className="w-4 h-4" />;
  return <Building2 className="w-4 h-4" />;
}

export default function AuditPage() {
  const { go: navigate, orgSlug } = useAppNav();
  const { organization, user } = useMultiTenantAuth();
  const { theme } = useTheme();
  const tt = useMemo(() => getDashboardTokens(theme), [theme]);
  const { activeRole } = useActiveRole({
    orgId: organization?.id,
    memberId: user?.id,
  });

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [groups, setGroups] = useState<GroupRow[]>([]);
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');
  const [drilldownGroupId, setDrilldownGroupId] = useState<string | null>(null);

  const toggleExpand = useCallback((id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }, []);

  // ── Fetch ────────────────────────────────────────────────────────
  // One coordinated load: groups (with member counts) + payments in
  // parallel, scoped to the active role's subtree. Payments query
  // uses the cached scoped-group set so a faculty exec only pulls
  // what their faculty can see.
  useEffect(() => {
    if (!organization?.id) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const scopedIds = await getScopedGroupIds({
          orgId: organization.id,
          activeGroupId: activeRole?.groupId ?? null,
          activeScopeLevel: activeRole?.scopeLevel ?? null,
        });

        // Groups — restricted to the scope when one is set, else the
        // full org tree. The select includes a count of active members.
        let gQuery = supabase
          .from('organization_groups')
          .select('id, name, short_name, kind, parent_group_id, organization_members(count)')
          .eq('organization_id', organization.id);
        if (scopedIds) gQuery = gQuery.in('id', Array.from(scopedIds));

        // Payments — same scoped set, status filter applied later so
        // we can show both paid and pending in the aggregate.
        let pQuery = supabase
          .from('payments')
          .select(`
            id, member_id, group_id, payment_type_id, amount, status, transaction_ref, approved_at,
            member:organization_members!payments_member_id_fkey ( full_name, member_id ),
            payment_type:payment_types ( title )
          `)
          .eq('organization_id', organization.id)
          .order('created_at', { ascending: false });
        if (scopedIds) pQuery = pQuery.in('group_id', Array.from(scopedIds));

        const [gRes, pRes] = await Promise.all([gQuery, pQuery]);
        if (cancelled) return;
        if (gRes.error) throw gRes.error;
        if (pRes.error) throw pRes.error;

        const gRows = ((gRes.data || []) as Array<{
          id: string;
          name: string;
          short_name: string;
          kind: string;
          parent_group_id: string | null;
          organization_members: { count: number }[] | { count: number };
        }>).map((g) => {
          const counts = Array.isArray(g.organization_members)
            ? g.organization_members
            : [g.organization_members].filter(Boolean);
          const memberCount = counts.reduce((sum, c) => sum + (c?.count || 0), 0);
          return {
            id: g.id,
            name: g.name,
            short_name: g.short_name,
            kind: g.kind,
            parent_group_id: g.parent_group_id,
            member_count: memberCount,
          };
        });

        setGroups(gRows);
        setPayments((pRes.data || []) as PaymentRow[]);
      } catch (err) {
        if (cancelled) return;
        console.error('Audit load error:', err);
        setError(err instanceof Error ? err.message : 'Could not load audit data.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [organization?.id, activeRole?.groupId, activeRole?.scopeLevel]);

  // ── Aggregate ────────────────────────────────────────────────────
  // Walk every payment, accumulate into its group_id. Then for each
  // group, also surface child group ids so the row can list them
  // when expanded.
  const aggregated = useMemo<Map<string, AggregatedGroup>>(() => {
    const map = new Map<string, AggregatedGroup>();
    for (const g of groups) {
      map.set(g.id, {
        group: g,
        paidTotal: 0,
        paidCount: 0,
        pendingCount: 0,
        childrenIds: [],
      });
    }
    for (const g of groups) {
      if (g.parent_group_id && map.has(g.parent_group_id)) {
        map.get(g.parent_group_id)!.childrenIds.push(g.id);
      }
    }
    // Roll up payments. The leaf group accrues directly; for the
    // expanded "by department" view the parent's totals are derived
    // from the union of its children — done at render time so a
    // single payment isn't double-counted in the aggregate map.
    for (const p of payments) {
      if (!p.group_id) continue;
      const a = map.get(p.group_id);
      if (!a) continue;
      if (p.status === 'pending') a.pendingCount++;
      if (p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-')) {
        a.paidCount++;
        a.paidTotal += Number(p.amount || 0);
      }
    }
    return map;
  }, [groups, payments]);

  // ── Roots ────────────────────────────────────────────────────────
  // For org owner viewing: every faculty / college (top of tree).
  // For faculty exec: the dept children of their faculty.
  // For dept exec: the class children of their dept.
  const roots = useMemo<GroupRow[]>(() => {
    if (!activeRole?.kind || activeRole.kind !== 'exec') return [];
    const own = activeRole.groupId ? groups.find(g => g.id === activeRole.groupId) : null;
    if (activeRole.scopeLevel === 'org' || !own) {
      // Top-level groups (faculties, colleges, or any without a parent).
      return groups.filter(g => !g.parent_group_id);
    }
    // Unit-scope (faculty / dept) — show the direct children of own.
    return groups.filter(g => g.parent_group_id === own.id);
  }, [activeRole, groups]);

  // Recursive totals — sum the subtree under a group.
  const subtreeTotals = useCallback((id: string): { paid: number; paidCount: number; pending: number; members: number } => {
    const agg = aggregated.get(id);
    if (!agg) return { paid: 0, paidCount: 0, pending: 0, members: 0 };
    let paid = agg.paidTotal;
    let paidCount = agg.paidCount;
    let pending = agg.pendingCount;
    let members = agg.group.member_count;
    for (const cid of agg.childrenIds) {
      const sub = subtreeTotals(cid);
      paid += sub.paid;
      paidCount += sub.paidCount;
      pending += sub.pending;
      members += sub.members;
    }
    return { paid, paidCount, pending, members };
  }, [aggregated]);

  const filteredRoots = useMemo(() => {
    if (!search.trim()) return roots;
    const q = search.toLowerCase();
    return roots.filter(g =>
      g.name.toLowerCase().includes(q) || g.short_name.toLowerCase().includes(q)
    );
  }, [roots, search]);

  // ── Drilldown ────────────────────────────────────────────────────
  const drilldownPayments = useMemo<PaymentRow[]>(() => {
    if (!drilldownGroupId) return [];
    return payments
      .filter(p => p.group_id === drilldownGroupId)
      .sort((a, b) => (b.approved_at || '').localeCompare(a.approved_at || ''));
  }, [drilldownGroupId, payments]);

  const drilldownGroup = useMemo(
    () => (drilldownGroupId ? groups.find(g => g.id === drilldownGroupId) : null),
    [drilldownGroupId, groups],
  );

  const fmt = (n: number) =>
    `${organization?.currency_symbol || '₦'}${n.toLocaleString('en-NG')}`;

  if (!organization) return null;

  return (
    <div
      className="min-h-screen py-6 px-4 relative overflow-hidden"
      style={{ background: tt.bgWash, color: tt.text }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 w-[480px] h-[480px] rounded-full"
        style={{ background: tt.blob1, filter: 'blur(120px)' }}
      />

      <div className="relative z-10 max-w-5xl mx-auto space-y-6">
        {/* Header */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider"
            style={{ color: tt.textTer }}
          >
            <ArrowLeft className="w-3 h-3" />
            Back to dashboard
          </button>

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
              Payment audit
            </span>
          </div>

          <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight">
            Payments by {activeRole?.scopeLevel === 'org' ? 'faculty' : activeRole?.scopeLevel === 'unit' ? 'department / class' : 'class'}
          </h1>
          <p className="text-sm" style={{ color: tt.textSec }}>
            Aggregated view of every payment in your scope, grouped so
            you can find who paid (and how much) in any unit fast. Tap
            a row to expand; tap a leaf to see individual payments.
          </p>

          {/* Search */}
          <div
            className="rounded-2xl p-2.5"
            style={{ background: tt.card, border: `1px solid ${tt.cardBorder}` }}
          >
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
                style={{ color: tt.textTer }}
              />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by group name or code…"
                className="w-full pl-9 pr-3 py-2 rounded-xl text-sm outline-none"
                style={{
                  background: theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${tt.cardBorder}`,
                  color: tt.text,
                }}
              />
            </div>
          </div>
        </motion.header>

        {/* List */}
        {loading ? (
          <div
            className="py-12 flex justify-center rounded-2xl"
            style={{ background: tt.card, border: `1px solid ${tt.cardBorder}` }}
          >
            <LoadingSpinner size="md" text="Loading audit data…" />
          </div>
        ) : error ? (
          <div
            className="p-6 rounded-2xl text-center"
            style={{ background: tt.card, border: `1px solid ${tt.danger}40` }}
          >
            <AlertCircle className="w-10 h-10 mx-auto mb-2" style={{ color: tt.danger }} />
            <p className="text-sm font-bold" style={{ color: tt.text }}>{error}</p>
          </div>
        ) : filteredRoots.length === 0 ? (
          <div
            className="py-14 px-6 rounded-2xl text-center"
            style={{ background: tt.card, border: `1px solid ${tt.cardBorder}` }}
          >
            <div
              className="w-14 h-14 mx-auto mb-3 rounded-2xl flex items-center justify-center"
              style={{ background: tt.primarySoft }}
            >
              <Receipt className="w-7 h-7" style={{ color: tt.primary }} />
            </div>
            <p className="font-extrabold text-base mb-1" style={{ color: tt.text }}>
              {search ? `No groups match "${search}"` : 'Nothing to audit yet'}
            </p>
            <p className="text-sm" style={{ color: tt.textSec }}>
              {search ? 'Try a different search.' : 'No groups in your scope have any payments yet.'}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredRoots.map(root => (
              <AuditTreeNode
                key={root.id}
                group={root}
                aggregated={aggregated}
                subtreeTotals={subtreeTotals}
                expanded={expanded}
                onToggle={toggleExpand}
                onDrilldown={setDrilldownGroupId}
                fmt={fmt}
                tt={tt}
                depth={0}
              />
            ))}
          </div>
        )}
      </div>

      {/* Drilldown overlay */}
      <AnimatePresence>
        {drilldownGroupId && drilldownGroup && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[110] flex items-end sm:items-center justify-center p-4"
            style={{
              background: theme === 'light' ? 'rgba(15,7,3,0.30)' : 'rgba(3,7,18,0.68)',
              backdropFilter: 'blur(10px)',
            }}
            onClick={() => setDrilldownGroupId(null)}
          >
            <motion.div
              initial={{ opacity: 0, y: 10, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.98 }}
              transition={{ duration: 0.16 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-2xl max-h-[80vh] rounded-2xl overflow-hidden flex flex-col"
              style={{
                background: theme === 'light' ? '#FFFFFF' : '#100A07',
                border: `1px solid ${tt.cardBorder}`,
                boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
              }}
            >
              <div
                className="p-4 flex items-center gap-3 shrink-0"
                style={{ borderBottom: `1px solid ${tt.cardBorder}` }}
              >
                <span
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: tt.primarySoft, color: tt.primary }}
                >
                  {kindIcon(drilldownGroup.kind)}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-base font-extrabold truncate" style={{ color: tt.text }}>
                    {drilldownGroup.name}
                  </p>
                  <p className="text-xs" style={{ color: tt.textSec }}>
                    {drilldownPayments.length} payment{drilldownPayments.length === 1 ? '' : 's'} in this group
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setDrilldownGroupId(null)}
                  className="text-xs font-bold px-3 py-1.5 rounded-lg"
                  style={{
                    background: theme === 'light' ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.05)',
                    color: tt.textSec,
                    border: `1px solid ${tt.cardBorder}`,
                  }}
                >
                  Close
                </button>
              </div>

              <div className="overflow-y-auto p-3 flex-1 min-h-0">
                {drilldownPayments.length === 0 ? (
                  <p className="text-sm text-center py-8" style={{ color: tt.textTer }}>
                    No payments in this group yet.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {drilldownPayments.map((p) => (
                      <div
                        key={p.id}
                        className="rounded-xl p-3 flex items-center gap-3"
                        style={{
                          background: theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.03)',
                          border: `1px solid ${tt.cardBorder}`,
                        }}
                      >
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: tt.text }}>
                            {p.member?.full_name || 'Unknown member'}
                          </p>
                          <p className="text-[11px] mt-0.5 truncate" style={{ color: tt.textTer }}>
                            {p.member?.member_id} · {p.payment_type?.title || 'Payment'}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-extrabold tabular-nums" style={{ color: tt.text }}>
                            {fmt(Number(p.amount || 0))}
                          </p>
                          <p
                            className="text-[10px] font-bold uppercase tracking-wider mt-0.5"
                            style={{
                              color:
                                p.status === 'approved' ? tt.mint
                                : p.status === 'pending' ? tt.amber
                                : tt.danger,
                            }}
                          >
                            {p.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────
// AuditTreeNode — recursive row for the audit list.
// Each row's totals are computed from the SUBTREE (this group + all
// descendants) so a faculty row shows the faculty's grand total even
// when it has no direct payments. Click anywhere on the row to drill
// into its payments. Children render on expand.
// ────────────────────────────────────────────────────────────────────
function AuditTreeNode({
  group, aggregated, subtreeTotals, expanded, onToggle, onDrilldown, fmt, tt, depth,
}: {
  group: GroupRow;
  aggregated: Map<string, AggregatedGroup>;
  subtreeTotals: (id: string) => { paid: number; paidCount: number; pending: number; members: number };
  expanded: Set<string>;
  onToggle: (id: string) => void;
  onDrilldown: (id: string) => void;
  fmt: (n: number) => string;
  tt: ReturnType<typeof getDashboardTokens>;
  depth: number;
}) {
  const agg = aggregated.get(group.id);
  const childrenIds = agg?.childrenIds || [];
  const isOpen = expanded.has(group.id);
  const hasChildren = childrenIds.length > 0;
  const totals = subtreeTotals(group.id);

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
        <div className="p-3 sm:p-4 flex items-center gap-3">
          {hasChildren ? (
            <button
              type="button"
              onClick={() => onToggle(group.id)}
              aria-label={isOpen ? 'Collapse' : 'Expand'}
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                background: tt.primarySoft,
                color: tt.primary,
                border: `1px solid ${tt.primaryRing}`,
              }}
            >
              {isOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
            </button>
          ) : (
            <span className="w-7 h-7 shrink-0" />
          )}

          <span
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: tt.primarySoft,
              color: tt.primary,
              border: `1px solid ${tt.primaryRing}`,
            }}
          >
            {kindIcon(group.kind)}
          </span>

          <div
            className="flex-1 min-w-0 cursor-pointer"
            onClick={() => onDrilldown(group.id)}
          >
            <p className="font-bold text-sm truncate" style={{ color: tt.text }}>
              {group.name}
            </p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: tt.textTer }}
              >
                <Users className="w-2.5 h-2.5" />
                {totals.members} {totals.members === 1 ? 'member' : 'members'}
              </span>
              <span
                className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                style={{ color: tt.textTer }}
              >
                <Receipt className="w-2.5 h-2.5" />
                {totals.paidCount} paid
              </span>
              {totals.pending > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider"
                  style={{ color: tt.amber }}
                >
                  <AlertCircle className="w-2.5 h-2.5" />
                  {totals.pending} pending
                </span>
              )}
            </div>
          </div>

          <div className="text-right shrink-0">
            <p className="text-sm sm:text-base font-extrabold tabular-nums" style={{ color: tt.text }}>
              {fmt(totals.paid)}
            </p>
            <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: tt.mint }}>
              <TrendingUp className="w-2.5 h-2.5 inline mr-1" />
              collected
            </p>
          </div>
        </div>
      </div>

      {isOpen && hasChildren && (
        <div className="space-y-2">
          {childrenIds.map(cid => {
            const child = aggregated.get(cid)?.group;
            if (!child) return null;
            return (
              <AuditTreeNode
                key={cid}
                group={child}
                aggregated={aggregated}
                subtreeTotals={subtreeTotals}
                expanded={expanded}
                onToggle={onToggle}
                onDrilldown={onDrilldown}
                fmt={fmt}
                tt={tt}
                depth={depth + 1}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
