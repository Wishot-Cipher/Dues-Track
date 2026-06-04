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
  Download,
} from 'lucide-react';
import { useAppNav } from '@/hooks/useAppNav';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import { supabase } from '@/config/supabase';
import { getScopedGroupIds } from '@/utils/scopedGroups';
import { exportTableToPDF } from '@/utils/pdfExport';
import LoadingSpinner from '@/components/ui/LoadingSpinner';

interface GroupRow {
  id: string;
  name: string;
  short_name: string;
  kind: string;
  parent_group_id: string | null;
  member_count: number;
}

interface PaymentRow extends Record<string, unknown> {
  id: string;
  member_id: string;
  group_id: string | null;
  payment_type_id: string;
  amount: number;
  status: 'pending' | 'approved' | 'rejected';
  transaction_ref: string | null;
  approved_at: string | null;
  member?: { full_name: string; member_id: string } | { full_name: string; member_id: string }[] | null;
  payment_type?: { title: string } | { title: string }[] | null;
}

/**
 * `firstOf(x)` — Supabase nested joins come back as `T | T[]`.
 * Unwrap whichever shape PostgREST emitted into a single object
 * for the renderer / exporter, or undefined when missing.
 */
function firstOf<T>(v: T | T[] | null | undefined): T | undefined {
  if (v == null) return undefined;
  if (Array.isArray(v)) return v[0];
  return v;
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
  const { go: navigate} = useAppNav();
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

        // Groups — restricted to the scope when one is set. The
        // previous attempt nested `organization_members(count)` as
        // a sub-select, but that requires PostgREST to find a
        // FK named exactly that AND for RLS on organization_members
        // to permit the cross-table read for the active role. When
        // either fails (e.g. dept-exec viewing audit), PostgREST
        // returns an opaque object that printed as "Object" in the
        // console with no useful message.
        // Switched to three separate queries — group identity,
        // member counts, and payments — all in parallel. The member
        // count is computed by grouping the organization_members
        // rows we already have permission to read.
        let gQuery = supabase
          .from('organization_groups')
          .select('id, name, short_name, kind, parent_group_id')
          .eq('organization_id', organization.id);
        if (scopedIds) gQuery = gQuery.in('id', Array.from(scopedIds));

        let mQuery = supabase
          .from('organization_members')
          .select('group_id')
          .eq('organization_id', organization.id)
          .eq('is_active', true);
        if (scopedIds) mQuery = mQuery.in('group_id', Array.from(scopedIds));

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

        const [gRes, mRes, pRes] = await Promise.all([gQuery, mQuery, pQuery]);
        if (cancelled) return;
        if (gRes.error) throw gRes.error;
        if (mRes.error) throw mRes.error;
        if (pRes.error) throw pRes.error;

        // Roll up member counts by group_id.
        const countsByGroup = new Map<string, number>();
        for (const m of (mRes.data || []) as Array<{ group_id: string | null }>) {
          if (!m.group_id) continue;
          countsByGroup.set(m.group_id, (countsByGroup.get(m.group_id) || 0) + 1);
        }

        const gRows = ((gRes.data || []) as Array<{
          id: string;
          name: string;
          short_name: string;
          kind: string;
          parent_group_id: string | null;
        }>).map((g) => ({
          id: g.id,
          name: g.name,
          short_name: g.short_name,
          kind: g.kind,
          parent_group_id: g.parent_group_id,
          member_count: countsByGroup.get(g.id) || 0,
        }));

        setGroups(gRows);
        setPayments((pRes.data || []) as unknown as PaymentRow[]);
      } catch (err) {
        if (cancelled) return;
        // Detailed log so the next "Audit load error: Object" tells
        // us exactly what failed. Supabase errors come as plain
        // objects so JSON.stringify lifts them into readable text.
        const errObj = err as { message?: string; code?: string; details?: string; hint?: string };
        console.error('Audit load error:', {
          message: errObj?.message,
          code: errObj?.code,
          details: errObj?.details,
          hint: errObj?.hint,
          raw: err,
        });
        setError(errObj?.message || errObj?.details || 'Could not load audit data.');
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

  // ── CSV export ───────────────────────────────────────────────────
  // Build a CSV from a slice of payments. The header row matches what
  // a bursar / treasurer typically wants to keep in spreadsheets:
  //   Member name, Member ID, Group, Payment type, Amount, Status,
  //   Approved at, Transaction ref.
  // Each value is wrapped in double-quotes with embedded double-quotes
  // doubled (RFC 4180) so commas and quotes in names don't break the
  // parse. Filename includes the scope name + today's date so multiple
  // downloads don't overwrite each other in the user's downloads dir.
  const exportCsv = useCallback((rows: PaymentRow[], scopeLabel: string) => {
    if (rows.length === 0) return;
    const groupNameById = new Map(groups.map(g => [g.id, g.name]));
    const escape = (v: unknown): string => {
      const s = v == null ? '' : String(v);
      return `"${s.replace(/"/g, '""')}"`;
    };
    const header = ['Member name', 'Member ID', 'Group', 'Payment type', 'Amount', 'Status', 'Approved at', 'Transaction ref'];
    const body = rows.map((p) => [
      escape(firstOf(p.member)?.full_name || ''),
      escape(firstOf(p.member)?.member_id || ''),
      escape(p.group_id ? (groupNameById.get(p.group_id) || '') : ''),
      escape(firstOf(p.payment_type)?.title || ''),
      escape(p.amount || 0),
      escape(p.status),
      escape(p.approved_at ? new Date(p.approved_at).toISOString().slice(0, 10) : ''),
      escape(p.transaction_ref || ''),
    ].join(','));
    const csv = [header.map(escape).join(','), ...body].join('\r\n');

    // ﻿ BOM so Excel auto-detects UTF-8 (Naira symbol + names
    // with non-ASCII characters render correctly).
    const blob = new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const safeScope = scopeLabel.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase();
    const date = new Date().toISOString().slice(0, 10);
    const a = document.createElement('a');
    a.href = url;
    a.download = `payments-${safeScope}-${date}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [groups]);

  const exportAll = useCallback(() => {
    const label = activeRole?.scopeLevel === 'org' ? (organization?.short_name || 'all') :
                  (groups.find(g => g.id === activeRole?.groupId)?.short_name || 'scope');
    exportCsv(payments, label);
  }, [exportCsv, payments, activeRole, groups, organization]);

  // PDF export — branded, archive-ready. CSV is for spreadsheets;
  // PDF is what a treasurer attaches to a meeting minute or prints
  // for a file. Same data, different reader. Shared formatter lives
  // in src/utils/pdfExport so the upcoming Expenses redesign can
  // call it with its own column list.
  const exportPdf = useCallback((rows: PaymentRow[], scopeLabel: string) => {
    if (rows.length === 0 || !organization) return;
    const groupNameById = new Map(groups.map(g => [g.id, g.name]));
    const currency = organization.currency_symbol || '₦';
    const fmtAmount = (n: number) => `${currency}${n.toLocaleString('en-NG')}`;
    const totalApproved = rows
      .filter(p => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-'))
      .reduce((s, p) => s + Number(p.amount || 0), 0);
    const approvedCount = rows.filter(p => p.status === 'approved').length;
    const pendingCount = rows.filter(p => p.status === 'pending').length;

    const date = new Date().toLocaleDateString('en-NG', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
    exportTableToPDF<PaymentRow>({
      title: `Payment audit — ${scopeLabel}`,
      subtitle: `Generated ${date}`,
      orgName: organization.name || organization.short_name || 'Organisation',
      accentColor: (organization.primary_color as string) || '#FF6803',
      columns: [
        { key: 'member',         label: 'Member',         align: 'left',
          format: (_v, p) => firstOf(p.member)?.full_name || '—' },
        { key: 'member_id',      label: 'Member ID',      align: 'left',
          format: (_v, p) => firstOf(p.member)?.member_id || '—' },
        { key: 'group_id',       label: 'Group',          align: 'left',
          format: (_v, p) => p.group_id ? (groupNameById.get(p.group_id) || '—') : '—' },
        { key: 'payment_type',   label: 'Payment type',   align: 'left',
          format: (_v, p) => firstOf(p.payment_type)?.title || '—' },
        { key: 'amount',         label: 'Amount',         align: 'right',
          format: (_v, p) => fmtAmount(Number(p.amount || 0)) },
        { key: 'status',         label: 'Status',         align: 'center',
          format: (v) => String(v || '—').toUpperCase() },
        { key: 'approved_at',    label: 'Approved',       align: 'right',
          format: (v) => v ? new Date(String(v)).toISOString().slice(0, 10) : '—' },
      ],
      rows,
      summary: [
        { label: 'Total payments listed', value: String(rows.length) },
        { label: 'Approved',              value: `${approvedCount} of ${rows.length}` },
        { label: 'Pending',               value: String(pendingCount) },
        { label: 'Total collected',       value: fmtAmount(totalApproved) },
      ],
      filenameSlug: `payments-${scopeLabel.replace(/[^a-z0-9_-]+/gi, '-').toLowerCase()}`,
    });
  }, [groups, organization]);

  const exportAllPdf = useCallback(() => {
    const label = activeRole?.scopeLevel === 'org' ? (organization?.short_name || 'all') :
                  (groups.find(g => g.id === activeRole?.groupId)?.short_name || 'scope');
    exportPdf(payments, label);
  }, [exportPdf, payments, activeRole, groups, organization]);

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
                Payment audit
              </span>
              {payments.length > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: tt.textTer }}
                >
                  {payments.length} {payments.length === 1 ? 'payment' : 'payments'} in scope
                </span>
              )}
            </div>

            {/* Two download formats side by side. CSV is for
                spreadsheets (filter, pivot, mail-merge); PDF is
                for archives + meeting attachments + printing —
                same data, different reader. Both filenames carry
                the scope + today's date so multiple downloads
                stack neatly in the user's downloads dir. */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={exportAll}
                disabled={payments.length === 0 || loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-40"
                style={{
                  background: tt.card,
                  color: tt.text,
                  border: `1px solid ${tt.cardBorder}`,
                }}
              >
                <Download className="w-3.5 h-3.5" />
                CSV
              </button>
              <button
                type="button"
                onClick={exportAllPdf}
                disabled={payments.length === 0 || loading}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-40"
                style={{
                  background: tt.primary,
                  color: '#FFFFFF',
                  border: `1px solid ${tt.primary}`,
                }}
              >
                <Download className="w-3.5 h-3.5" />
                PDF
              </button>
            </div>
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
                {/* Per-group CSV — same shape as the header export
                    but filtered to this drilldown. Lets a dept exec
                    download just one class's ledger without having
                    to import the whole faculty's into a spreadsheet
                    and filter manually. */}
                {drilldownPayments.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={() => exportCsv(drilldownPayments, drilldownGroup.short_name || drilldownGroup.name)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 shrink-0"
                      style={{
                        background: tt.primarySoft,
                        color: tt.primary,
                        border: `1px solid ${tt.primaryRing}`,
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      CSV
                    </button>
                    <button
                      type="button"
                      onClick={() => exportPdf(drilldownPayments, drilldownGroup.short_name || drilldownGroup.name)}
                      className="text-xs font-bold px-3 py-1.5 rounded-lg inline-flex items-center gap-1.5 shrink-0"
                      style={{
                        background: tt.primary,
                        color: '#FFFFFF',
                        border: `1px solid ${tt.primary}`,
                      }}
                    >
                      <Download className="w-3.5 h-3.5" />
                      PDF
                    </button>
                  </>
                )}
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
                            {firstOf(p.member)?.full_name || 'Unknown member'}
                          </p>
                          <p className="text-[11px] mt-0.5 truncate" style={{ color: tt.textTer }}>
                            {firstOf(p.member)?.member_id} · {firstOf(p.payment_type)?.title || 'Payment'}
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
