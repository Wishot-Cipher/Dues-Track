/**
 * ClassExecDashboardView — focused dashboard for a verified class rep.
 *
 * Mounted by AdminDashboardPage at /:orgSlug/admin/dashboard when the
 * caller's active role is class-scoped (scope_level='group'). Sister
 * to DepartmentExecDashboardPage and FacultyExecDashboardPage — same
 * visual language, scoped one tier lower.
 *
 * What a class rep actually does (the only person with full power
 * over the class):
 *   • Manage class members (add / remove / edit / suspend)
 *   • Publish dues and events for THEIR class
 *   • Approve / reject pending payments
 *   • See receipts + financial detail for THIS class
 *
 * Everything in this view is filtered to the active group_id. We
 * NEVER show cross-class data here — that's the dept/faculty exec's
 * job. Cross-class data leaking into a class-rep view was the bug
 * that triggered this refactor.
 *
 * Data fetch: a single useEffect pulls counts and recent rows in
 * parallel. Heavier "view all" interactions hand off to the existing
 * Members, ManageDues, Review, Receipts pages — this view is a
 * dashboard, not a workbench.
 */

import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  ArrowRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  Clock,
  Layers,
  Loader2,
  Plus,
  Receipt,
  ShieldCheck,
  Users,
} from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useThemeTokens } from '@/hooks/useThemeTokens';
import { useAppNav } from '@/hooks/useAppNav';
import { supabase } from '@/config/supabase';
import type { MemberAdmin, OrganizationGroup } from '@/types/multiTenant';
import HandoverButton from '@/components/handover/HandoverButton';

// ── Local types ───────────────────────────────────────────────────────
interface PaymentRow {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  payer_name: string | null;
  payment_type_id: string | null;
  payment_type_title: string | null;
}

interface DueRow {
  id: string;
  title: string;
  amount: number;
  target_levels: string[] | null;
  created_at: string;
  is_active: boolean;
  paid_count: number;
}

interface DashStats {
  members:      number;
  activeDues:   number;
  pending:      number;
  collected:    number;  // total approved naira this term
}

/**
 * Resolves the caller's class-rep record + the class it points at.
 * Returns null when the caller isn't a verified group-scope admin —
 * AdminDashboardPage uses that null signal to fall back to its
 * org-wide widgets.
 */
function pickClassAdmin(records: MemberAdmin[], groups: OrganizationGroup[]):
  { admin: MemberAdmin; klass: OrganizationGroup } | null
{
  for (const a of records) {
    if (!a.is_active) continue;
    if ((a.verification_layer ?? 0) < 4) continue;
    if (a.scope_level !== 'group') continue;
    if (!a.group_id) continue;
    const group = groups.find((g) => g.id === a.group_id);
    if (!group) continue;
    return { admin: a, klass: group };
  }
  return null;
}

export interface ClassExecDashboardViewProps {
  /** Pass through so the parent can render this conditionally with
   *  the resolver result it already computed (avoids a second fetch). */
  admin: MemberAdmin;
  klass: OrganizationGroup;
}

/** Standalone resolver used by AdminDashboardPage to decide whether
 *  to mount this view at all. Exported so the parent doesn't need
 *  to duplicate the picking logic. */
export { pickClassAdmin };

export default function ClassExecDashboardView({ admin, klass }: ClassExecDashboardViewProps) {
  const tk = useThemeTokens();
  const { organization } = useMultiTenantAuth();
  const { go, orgSlug } = useAppNav();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashStats>({
    members: 0, activeDues: 0, pending: 0, collected: 0,
  });
  const [recentPayments, setRecentPayments] = useState<PaymentRow[]>([]);
  const [recentDues, setRecentDues] = useState<DueRow[]>([]);

  // ── Data load — every query scoped to this class. ─────────────
  useEffect(() => {
    if (!organization || !klass) return;
    let cancelled = false;

    (async () => {
      setLoading(true);

      // 1. Members count (class only)
      const { count: memberCount } = await supabase
        .from('organization_members')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', organization.id)
        .eq('group_id', klass.id);

      // 2. Active dues for this class + recent 6 published
      const { data: dueRows } = await supabase
        .from('payment_types')
        .select('id, title, amount, target_levels, created_at, is_active')
        .eq('organization_id', organization.id)
        .eq('group_id', klass.id)
        .order('created_at', { ascending: false })
        .limit(20);
      const allDues = (dueRows as DueRow[]) || [];
      const activeDuesCount = allDues.filter((d) => d.is_active).length;
      const top6Dues = allDues.slice(0, 6);

      // 3. Recent payments — last 6 across THIS class's members.
      //    We pull by payment_type_id to keep the filter tight.
      const dueIds = allDues.map((d) => d.id);
      let payments: PaymentRow[] = [];
      let pendingCount = 0;
      let collectedKobo = 0;
      if (dueIds.length > 0) {
        const { data: payRows } = await supabase
          .from('payments')
          .select(`
            id, amount, status, created_at, payer_name, payment_type_id,
            payment_type:payment_type_id (title)
          `)
          .in('payment_type_id', dueIds)
          .order('created_at', { ascending: false })
          .limit(50);

        const all = ((payRows as unknown as Array<{
          id: string; amount: number; status: string; created_at: string;
          payer_name: string | null; payment_type_id: string | null;
          payment_type: { title: string } | null;
        }>) || []).map((p) => ({
          id: p.id,
          amount: Number(p.amount || 0),
          status: p.status,
          created_at: p.created_at,
          payer_name: p.payer_name,
          payment_type_id: p.payment_type_id,
          payment_type_title: p.payment_type?.title ?? null,
        } as PaymentRow));

        payments = all.slice(0, 6);
        pendingCount  = all.filter((p) => p.status === 'pending').length;
        collectedKobo = all
          .filter((p) => p.status === 'approved')
          .reduce((s, p) => s + p.amount, 0);
      }

      // 4. Per-due paid counts (for the recent dues list bars)
      const paidByDue = new Map<string, number>();
      if (dueIds.length > 0) {
        const { data: paidRows } = await supabase
          .from('payments')
          .select('payment_type_id')
          .in('payment_type_id', dueIds)
          .eq('status', 'approved');
        ((paidRows as Array<{ payment_type_id: string }>) || []).forEach((r) => {
          paidByDue.set(r.payment_type_id, (paidByDue.get(r.payment_type_id) || 0) + 1);
        });
      }
      const recent: DueRow[] = top6Dues.map((d) => ({
        ...d,
        paid_count: paidByDue.get(d.id) || 0,
      }));

      if (cancelled) return;
      setStats({
        members:    memberCount ?? 0,
        activeDues: activeDuesCount,
        pending:    pendingCount,
        collected:  collectedKobo,
      });
      setRecentPayments(payments);
      setRecentDues(recent);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [organization, klass]);

  const currencySymbol = organization?.currency_symbol || '₦';
  const memberCount = useMemo(() => stats.members, [stats.members]);

  // ── Loading skeleton ──────────────────────────────────────────
  if (loading) {
    return (
      <div className="max-w-5xl mx-auto px-4 py-10" style={{ color: tk.text }}>
        <div className="flex items-center gap-2" style={{ color: tk.textSec }}>
          <Loader2 className="w-4 h-4 animate-spin" />
          <span className="text-sm">Loading your class…</span>
        </div>
      </div>
    );
  }

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
            {admin.role_label || admin.role || 'Class Rep'}
          </span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: tk.textTer }}
          >
            <Layers className="w-3 h-3" />
            {klass.name}
            {klass.levels?.length ? ` · ${klass.levels[0]}` : ''}
          </span>
        </div>
        <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight">
          {klass.short_name || klass.name} dashboard
        </h1>
        <p className="text-sm" style={{ color: tk.textSec }}>
          You're the person closest to the students — manage members, publish
          dues for your class, and review payments. Everything below is
          scoped to your class only.
        </p>
      </motion.header>

      {/* ── Quick stats ────────────────────────────────────────── */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="grid grid-cols-2 sm:grid-cols-4 gap-3"
      >
        <Stat label="Members"     value={memberCount}        icon={<Users className="w-3.5 h-3.5" />}        tk={tk} color={tk.blue} />
        <Stat label="Active dues" value={stats.activeDues}   icon={<Receipt className="w-3.5 h-3.5" />}      tk={tk} color={tk.primary} />
        <Stat label="Pending"     value={stats.pending}      icon={<Clock className="w-3.5 h-3.5" />}        tk={tk} color={tk.amber} />
        <Stat
          label="Collected"
          value={`${currencySymbol}${stats.collected.toLocaleString('en-NG')}`}
          icon={<CheckCircle2 className="w-3.5 h-3.5" />}
          tk={tk}
          color={tk.mint}
        />
      </motion.div>

      {/* ── Quick actions ──────────────────────────────────────── */}
      {/* 5 actions on wide screens, wraps to 2-col on mobile. Payout
          is intentionally first now — without it, "Publish a due"
          will be gated by the no-payout modal. */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3"
      >
        <ActionCard
          icon={<Banknote className="w-5 h-5" />}
          title="Payout account"
          sub="Where your class collects."
          tk={tk}
          accent={tk.mint}
          onClick={() => navigate(`/${orgSlug}/admin/payout?groupId=${klass.id}`)}
        />
        <ActionCard
          icon={<Plus className="w-5 h-5" />}
          title="Publish a due"
          sub="For this class only."
          tk={tk}
          accent={tk.primary}
          onClick={() => navigate(`/${orgSlug}/admin/create-payment?scope=group&groupId=${klass.id}`)}
        />
        <ActionCard
          icon={<Users className="w-5 h-5" />}
          title="Manage members"
          sub="Add, edit, suspend."
          tk={tk}
          accent={tk.blue}
          onClick={() => go('/admin/members')}
        />
        <ActionCard
          icon={<Clock className="w-5 h-5" />}
          title="Review payments"
          sub="Approve or reject pending."
          tk={tk}
          accent={tk.amber}
          onClick={() => go('/admin/review')}
        />
        <ActionCard
          icon={<Receipt className="w-5 h-5" />}
          title="Manage dues"
          sub="Edit, end, archive."
          tk={tk}
          accent={tk.purple}
          onClick={() => go('/admin/manage-dues')}
        />
      </motion.section>

      {/* ── Recent dues published ─────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.15 }}
      >
        <header className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">
              Recent dues you've published
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
              Tap a row to manage it — edit, end, or archive.
            </p>
          </div>
          <Link
            to={`/${orgSlug}/admin/manage-dues`}
            className="text-xs font-semibold inline-flex items-center gap-1"
            style={{ color: tk.primary }}
          >
            View all <ArrowRight className="w-3 h-3" />
          </Link>
        </header>

        {recentDues.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
          >
            <Receipt className="w-7 h-7 mx-auto mb-2" style={{ color: tk.textTer }} />
            <p className="font-semibold text-sm">No dues yet</p>
            <p className="text-xs mt-1" style={{ color: tk.textSec }}>
              Publish your class's first due — members will see it on their dashboard instantly.
            </p>
            <button
              type="button"
              onClick={() => navigate(`/${orgSlug}/admin/create-payment?scope=group&groupId=${klass.id}`)}
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
                const pct = memberCount > 0
                  ? Math.min(100, Math.round((d.paid_count / memberCount) * 100))
                  : 0;
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
                        {currencySymbol}{Number(d.amount).toLocaleString('en-NG')}
                        {d.is_active ? '' : ' · ended'}
                      </p>
                    </div>
                    <div className="text-right min-w-[80px]">
                      <p className="text-[11px] font-bold tabular-nums" style={{ color: tk.text }}>
                        {d.paid_count}/{memberCount || '—'}
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

      {/* ── Recent payments ───────────────────────────────────── */}
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <header className="flex items-end justify-between mb-3">
          <div>
            <h2 className="text-lg font-extrabold tracking-tight">
              Recent payments
            </h2>
            <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
              Only your class's submissions.
            </p>
          </div>
          <Link
            to={`/${orgSlug}/admin/review`}
            className="text-xs font-semibold inline-flex items-center gap-1"
            style={{ color: tk.primary }}
          >
            Open Review <ArrowRight className="w-3 h-3" />
          </Link>
        </header>

        {recentPayments.length === 0 ? (
          <div
            className="rounded-2xl p-6 text-center"
            style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
          >
            <Receipt className="w-7 h-7 mx-auto mb-2" style={{ color: tk.textTer }} />
            <p className="font-semibold text-sm">No payments yet</p>
            <p className="text-xs mt-1" style={{ color: tk.textSec }}>
              Submissions will show up here once members start paying.
            </p>
          </div>
        ) : (
          <div
            className="rounded-2xl overflow-hidden"
            style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, boxShadow: tk.shadow }}
          >
            <div className="divide-y" style={{ borderColor: tk.cardBorder }}>
              {recentPayments.map((p) => {
                const isPending = p.status === 'pending';
                const isApproved = p.status === 'approved';
                const accent = isApproved ? tk.mint : isPending ? tk.amber : tk.danger;
                return (
                  <div
                    key={p.id}
                    className="px-4 py-3.5 flex items-center gap-3"
                    style={{ borderColor: tk.cardBorder, color: tk.text }}
                  >
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{
                        background: `${accent}18`,
                        color: accent,
                        border: `1px solid ${accent}30`,
                      }}
                    >
                      {isApproved ? <CheckCircle2 className="w-4 h-4" /> : <Clock className="w-4 h-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {p.payer_name || 'Member'}
                      </p>
                      <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
                        {p.payment_type_title || 'Payment'} · {new Date(p.created_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold tabular-nums" style={{ color: tk.text }}>
                        {currencySymbol}{Number(p.amount).toLocaleString('en-NG')}
                      </p>
                      <span
                        className="text-[10px] font-bold uppercase tracking-wider"
                        style={{ color: accent }}
                      >
                        {p.status}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </motion.section>

      {/* ── Footer note about session lifecycle ─────────────────── */}
      {admin.tenure_start && (
        <p className="text-[11px] flex items-center gap-1.5" style={{ color: tk.textTer }}>
          <CalendarClock className="w-3 h-3" />
          Acting since {new Date(admin.tenure_start as unknown as string).toLocaleDateString('en-GB', {
            day: 'numeric', month: 'short', year: 'numeric',
          })}.
        </p>
      )}

      {/* Discoverable exec handover — self-hides for non-execs. */}
      <HandoverButton />
    </div>
  );
}

// ── Sub-components — same shape as the dept/faculty dashboards ────

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

function ActionCard({
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
        Open <ArrowRight className="w-3 h-3" />
      </span>
    </button>
  );
}
