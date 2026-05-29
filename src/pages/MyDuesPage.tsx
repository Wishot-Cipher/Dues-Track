/**
 * MyDuesPage — the mobile-first "My Dues" hub from the Lucy Nwakwo
 * mockup. Replaces the route at /:orgSlug/payments (the old
 * PaymentHistoryPage is kept on disk as a safe-to-revert backup).
 *
 * Layout:
 *   • Top row: back + "My Dues" + filter icon (UI only for now)
 *   • Three tabs: All (N) · Pending (N) · Paid (N) — active tab has
 *     the brand-orange underline + count chip
 *   • "Pending Dues" section (only when there are any)
 *       Card list: tinted category icon + title + amount + deadline
 *       + "{N} days left" / "Overdue" pill + chevron
 *   • "Paid Dues" section
 *       Same row layout but the chip is mint with a checkmark instead
 *       of a days-left pill
 *
 * Theme-aware via getDashboardTokens. Reuses the same icon-for-
 * category helper as the dashboard for visual consistency.
 *
 * Data: same paymentService calls the dashboard makes — no schema
 * changes, no extra fetches.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowLeft, ChevronRight, CheckCircle2, AlertCircle, BookOpen, Calendar,
  GraduationCap, Heart, Sparkles, Ticket, Wallet, SlidersHorizontal, Users,
} from 'lucide-react';
import { useAppAuth as useAuth } from '@/hooks/useAppAuth';
import { useAppNav } from '@/hooks/useAppNav';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import PayvexoBackground from '@/components/student/dashboard/PayvexoBackground';
import paymentService from '@/services/paymentService';
import { groupMembershipService, type MyGroup } from '@/services/groupMembershipService';
import type { Payment, PaymentType } from '@/types';

// ── Helpers ────────────────────────────────────────────────────────
function iconForCategory(key?: string | null) {
  const k = (key || '').toLowerCase();
  if (k.includes('tuition') || k.includes('fee')) return GraduationCap;
  if (k.includes('don') || k.includes('charity')) return Heart;
  if (k.includes('book') || k.includes('material')) return BookOpen;
  if (k.includes('event') || k.includes('ticket')) return Ticket;
  if (k.includes('party') || k.includes('social')) return Sparkles;
  if (k.includes('calendar') || k.includes('annual')) return Calendar;
  return Wallet;
}

function formatNaira(amount: number): string {
  return `₦${amount.toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-NG', { year: 'numeric', month: 'short', day: 'numeric' });
}

function daysFromNow(iso: string | null | undefined): number | null {
  if (!iso) return null;
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
}

function hexAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#') || color.length !== 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ── Derived shape per due ─────────────────────────────────────────
interface DueRowData {
  pt: PaymentType;
  groupLabel: string;
  status: 'unpaid' | 'partial' | 'pending' | 'paid';
  approvedSum: number;
  outstanding: number;
  daysLeft: number | null;
  /** Most recent approved payment, if any (for "Paid on …" date). */
  paidAt: string | null;
}

type TabKey = 'all' | 'pending' | 'paid';

// ── Page ───────────────────────────────────────────────────────────
export default function MyDuesPage() {
  const { user } = useAuth();
  const { go } = useAppNav();
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  const [loading, setLoading] = useState(true);
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [memberGroups, setMemberGroups] = useState<MyGroup[]>([]);
  const [tab, setTab] = useState<TabKey>('all');

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [pts, pays, groups] = await Promise.all([
        paymentService.getActivePaymentTypesForStudent(user.id),
        paymentService.getStudentPayments(user.id),
        groupMembershipService.getMyGroups(user.id),
      ]);
      setPaymentTypes(pts);
      setPayments(pays);
      setMemberGroups(groups);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // ── Build a per-due row ─────────────────────────────────────────
  const rows: DueRowData[] = useMemo(() => {
    const groupNameById = new Map(memberGroups.map((item) => [item.group_id, item.name]));

    return paymentTypes.map((pt) => {
      const own = payments.filter(p => p.payment_type_id === pt.id);
      const approvedSum = own.filter(p => p.status === 'approved')
        .reduce((s, p) => s + Number(p.amount || 0), 0);

      // PAID must win over a stray 'pending' row: an abandoned Paystack init
      // leaves a pending row behind, and if pending took priority a fully-paid
      // due would show as payable again → double payment. Check paid first.
      const amount = Number(pt.amount || 0);
      const status: DueRowData['status'] =
        amount > 0 && approvedSum >= amount ? 'paid'
        : own.some(p => p.status === 'pending') ? 'pending'
        : approvedSum > 0 ? 'partial'
        : 'unpaid';

      const lastApproved = own
        .filter(p => p.status === 'approved')
        .sort((a, b) =>
          new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime(),
        )[0];

      return {
        pt,
        groupLabel: pt.group_id ? (groupNameById.get(pt.group_id) || 'Group due') : 'Org-wide',
        status,
        approvedSum,
        outstanding: Math.max(0, Number(pt.amount || 0) - approvedSum),
        daysLeft: daysFromNow(pt.deadline),
        paidAt: lastApproved?.created_at ?? null,
      };
    });
  }, [memberGroups, paymentTypes, payments]);

  // ── Tab partitions ──────────────────────────────────────────────
  const pendingRows = useMemo(
    () => rows.filter(r => r.status === 'unpaid' || r.status === 'partial' || r.status === 'pending'),
    [rows],
  );
  const paidRows = useMemo(
    () => rows.filter(r => r.status === 'paid'),
    [rows],
  );

  const visiblePending = tab === 'paid' ? [] : pendingRows;
  const visiblePaid    = tab === 'pending' ? [] : paidRows;

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh' }}>
      <PayvexoBackground theme={theme} />

      <main className="relative z-10 max-w-2xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-24">

        {/* ── Top row: back + title + filter ──────────────────── */}
        <header className="flex items-center gap-3 mb-5">
          <button
            type="button"
            onClick={() => go('/dashboard')}
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0"
            style={{
              background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
              color: t.text,
              border: `1px solid ${t.cardBorder}`,
              boxShadow: isLight ? '0 6px 18px -8px rgba(15,7,3,0.10)' : 'none',
            }}
            aria-label="Back"
          >
            <ArrowLeft size={16} />
          </button>
          <h1 className="text-[17px] font-extrabold tracking-tight flex-1" style={{ color: t.text }}>
            My Dues
          </h1>
          <button
            type="button"
            className="w-9 h-9 rounded-full flex items-center justify-center transition-colors shrink-0"
            style={{
              background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
              color: t.textSec,
              border: `1px solid ${t.cardBorder}`,
              boxShadow: isLight ? '0 6px 18px -8px rgba(15,7,3,0.10)' : 'none',
            }}
            aria-label="Filter dues"
            title="Filter (coming soon)"
          >
            <SlidersHorizontal size={15} />
          </button>
        </header>

        {/* ── Tabs ─────────────────────────────────────────────── */}
        <TabBar
          tab={tab}
          counts={{
            all:     rows.length,
            pending: pendingRows.length,
            paid:    paidRows.length,
          }}
          onChange={setTab}
          theme={theme}
        />

        {!loading && memberGroups.length > 0 && (
          <section
            className="mt-4 rounded-2xl px-4 py-3"
            style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
          >
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" style={{ color: t.primary }} />
              <p className="text-sm font-bold" style={{ color: t.text }}>
                Dues across {memberGroups.length} group{memberGroups.length === 1 ? '' : 's'}
              </p>
            </div>
            <div className="flex flex-wrap gap-2 mt-3">
              {memberGroups.slice(0, 4).map((item) => (
                <span
                  key={item.group_id}
                  className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold"
                  style={{ background: isLight ? '#F3EEEA' : 'rgba(255,255,255,0.06)', color: t.textSec }}
                >
                  {item.name}
                  {item.is_primary && <span className="ml-1.5 font-bold" style={{ color: t.primary }}>Primary</span>}
                </span>
              ))}
              {memberGroups.length > 4 && (
                <span
                  className="inline-flex items-center rounded-full px-3 py-1 text-[11px] font-semibold"
                  style={{ background: isLight ? '#F3EEEA' : 'rgba(255,255,255,0.06)', color: t.textSec }}
                >
                  +{memberGroups.length - 4} more
                </span>
              )}
            </div>
          </section>
        )}

        {/* ── Loading skeleton ─────────────────────────────────── */}
        {loading && (
          <div className="space-y-3 mt-6">
            <RowSkeleton theme={theme} />
            <RowSkeleton theme={theme} />
            <RowSkeleton theme={theme} />
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────── */}
        {!loading && rows.length === 0 && (
          <div
            className="mt-10 rounded-2xl px-5 py-8 text-center"
            style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
          >
            <div
              className="w-12 h-12 mx-auto rounded-full flex items-center justify-center mb-3"
              style={{ background: isLight ? '#FFF1E3' : 'rgba(255,104,3,0.14)' }}
            >
              <Wallet size={22} color={t.primary} />
            </div>
            <p className="text-sm font-bold" style={{ color: t.text }}>No dues yet</p>
            <p className="text-xs mt-1" style={{ color: t.textSec }}>
              When your admin publishes a due, it'll show up here.
            </p>
          </div>
        )}

        {/* ── Pending Dues section ─────────────────────────────── */}
        {!loading && visiblePending.length > 0 && (
          <section className="mt-6">
            <SectionHeader
              label="Pending Dues"
              count={visiblePending.length}
              dotColor={t.primary}
              theme={theme}
            />
            <div className="mt-3 space-y-3">
              {visiblePending.map((r, i) => (
                <DueRow
                  key={r.pt.id}
                  data={r}
                  index={i}
                  theme={theme}
                  onClick={() => go(`/payment/${r.pt.id}`)}
                />
              ))}
            </div>
          </section>
        )}

        {/* ── Paid Dues section ─────────────────────────────────
            Paid rows route to the receipt for the most recent approved
            payment on that due, not back into the Make Payment flow. */}
        {!loading && visiblePaid.length > 0 && (
          <section className="mt-6">
            <SectionHeader
              label="Paid Dues"
              count={visiblePaid.length}
              dotColor={isLight ? '#10B981' : t.mint}
              theme={theme}
            />
            <div className="mt-3 space-y-3">
              {visiblePaid.map((r, i) => {
                const paidPaymentId = payments
                  .filter(p => p.payment_type_id === r.pt.id && p.status === 'approved')
                  .sort((a, b) =>
                    new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime(),
                  )[0]?.id;
                return (
                  <PaidRow
                    key={r.pt.id}
                    data={r}
                    index={i}
                    theme={theme}
                    onClick={() => paidPaymentId
                      ? go(`/receipt/${paidPaymentId}`)
                      : go(`/payment/${r.pt.id}`)}
                  />
                );
              })}
            </div>
          </section>
        )}

        {/* ── Section-empty when a tab filters everything out ── */}
        {!loading && rows.length > 0 && visiblePending.length === 0 && visiblePaid.length === 0 && (
          <div
            className="mt-6 rounded-2xl px-5 py-6 text-center"
            style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
          >
            <p className="text-sm" style={{ color: t.textSec }}>
              {tab === 'pending'
                ? 'No pending dues. You\'re all caught up.'
                : 'No paid dues yet — your receipts will appear here.'}
            </p>
          </div>
        )}
      </main>
    </div>
  );
}

// ── TabBar ───────────────────────────────────────────────────────
function TabBar({
  tab, counts, onChange, theme,
}: {
  tab: TabKey;
  counts: { all: number; pending: number; paid: number };
  onChange: (t: TabKey) => void;
  theme: 'light' | 'dark';
}) {
  const t = getDashboardTokens(theme);
  const tabs: { key: TabKey; label: string; n: number }[] = [
    { key: 'all',     label: 'All',     n: counts.all },
    { key: 'pending', label: 'Pending', n: counts.pending },
    { key: 'paid',    label: 'Paid',    n: counts.paid },
  ];

  return (
    <div
      className="flex items-center justify-between px-1"
      style={{ borderBottom: `1px solid ${t.cardBorder}` }}
    >
      {tabs.map((tb) => {
        const active = tb.key === tab;
        return (
          <button
            key={tb.key}
            type="button"
            onClick={() => onChange(tb.key)}
            className="relative flex-1 py-3 text-[13px] font-bold transition-colors"
            style={{ color: active ? t.primary : t.textSec }}
          >
            {tb.label} <span className="font-extrabold">({tb.n})</span>
            {active && (
              <motion.span
                layoutId="myDuesUnderline"
                className="absolute left-3 right-3 -bottom-px h-0.5 rounded-full"
                style={{ background: t.primary }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              />
            )}
          </button>
        );
      })}
    </div>
  );
}

// ── SectionHeader ────────────────────────────────────────────────
function SectionHeader({
  label, count, dotColor, theme,
}: { label: string; count: number; dotColor: string; theme: 'light' | 'dark' }) {
  const t = getDashboardTokens(theme);
  return (
    <div className="flex items-center gap-2 px-1">
      <span className="w-2 h-2 rounded-full" style={{ background: dotColor }} />
      <h2 className="text-[14px] font-extrabold" style={{ color: t.text }}>
        {label}
      </h2>
      <span
        className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
        style={{
          background: theme === 'light' ? '#F1EDEA' : 'rgba(255,255,255,0.06)',
          color: t.textSec,
        }}
      >
        {count}
      </span>
    </div>
  );
}

// ── DueRow (pending) ─────────────────────────────────────────────
function DueRow({
  data, index, theme, onClick,
}: { data: DueRowData; index: number; theme: 'light' | 'dark'; onClick: () => void }) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  const Icon = iconForCategory(data.pt.category);

  // Pill color logic: overdue=danger, ≤1d=danger, ≤7d=amber, else neutral
  const pill = (() => {
    if (data.status === 'pending') return { bg: isLight ? '#FFF3DC' : 'rgba(245,158,11,0.18)', color: isLight ? '#B86E00' : t.amber, label: 'Awaiting review' };
    if (data.daysLeft === null)    return { bg: isLight ? '#F1EDEA' : 'rgba(255,255,255,0.06)', color: t.textSec, label: 'No deadline' };
    if (data.daysLeft < 0)         return { bg: isLight ? '#FEE6E6' : 'rgba(239,68,68,0.18)',  color: isLight ? '#C82A2A' : '#FCA5A5', label: `${Math.abs(data.daysLeft)} days overdue` };
    if (data.daysLeft === 0)       return { bg: isLight ? '#FEE6E6' : 'rgba(239,68,68,0.18)',  color: isLight ? '#C82A2A' : '#FCA5A5', label: 'Due today' };
    if (data.daysLeft <= 7)        return { bg: isLight ? '#FFF3DC' : 'rgba(245,158,11,0.18)', color: isLight ? '#B86E00' : t.amber, label: `${data.daysLeft} days left` };
    return { bg: isLight ? '#EEF4FF' : 'rgba(91,155,255,0.16)', color: isLight ? '#1E4FBF' : t.blue, label: `${data.daysLeft} days left` };
  })();

  // Icon tint follows urgency. Mandatory + urgent = orange. Optional = blue.
  const iconTint = data.daysLeft !== null && data.daysLeft < 7
    ? t.primary
    : (data.pt.is_mandatory ? t.primary : '#8b5cf6');

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      whileTap={{ scale: 0.985 }}
      className="w-full text-left rounded-2xl px-4 py-3.5 flex items-center gap-3 transition-colors group"
      style={{
        background: t.card,
        border: `1px solid ${t.cardBorder}`,
        boxShadow: isLight
          ? '0 1px 0 rgba(255,255,255,0.7) inset, 0 4px 14px -8px rgba(15,7,3,0.08)'
          : '0 1px 0 rgba(255,255,255,0.02) inset',
      }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
        style={{
          background: isLight ? hexAlpha(iconTint, 0.10) : hexAlpha(iconTint, 0.16),
          border: `1px solid ${hexAlpha(iconTint, isLight ? 0.20 : 0.28)}`,
        }}
      >
        <Icon size={20} color={iconTint} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-extrabold truncate" style={{ color: t.text }}>
          {data.pt.title}
        </p>
        <p className="text-[11px] mt-0.5 font-semibold" style={{ color: t.textSec }}>
          {data.groupLabel}
        </p>
        <p className="text-[14px] font-extrabold tabular-nums mt-0.5" style={{ color: t.text }}>
          {formatNaira(data.outstanding)}
        </p>
        <p className="text-[11px] mt-1" style={{ color: t.textSec }}>
          {data.pt.deadline ? `Due date: ${formatDate(data.pt.deadline)}` : 'No deadline set'}
        </p>
      </div>

      <div className="flex flex-col items-end gap-1 shrink-0">
        <span
          className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5"
          style={{ background: pill.bg, color: pill.color }}
        >
          {pill.label.includes('overdue') && <AlertCircle size={11} />}
          {pill.label}
        </span>
        <ChevronRight
          className="w-4 h-4 transition-transform group-hover:translate-x-0.5"
          style={{ color: t.textTer }}
        />
      </div>
    </motion.button>
  );
}

// ── PaidRow ──────────────────────────────────────────────────────
function PaidRow({
  data, index, theme, onClick,
}: { data: DueRowData; index: number; theme: 'light' | 'dark'; onClick: () => void }) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  const Icon = iconForCategory(data.pt.category);
  const mintBrand = isLight ? '#10B981' : t.mint;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: index * 0.04 }}
      whileTap={{ scale: 0.985 }}
      className="w-full text-left rounded-2xl px-4 py-3.5 flex items-center gap-3 transition-colors group"
      style={{
        background: t.card,
        border: `1px solid ${t.cardBorder}`,
        boxShadow: isLight
          ? '0 1px 0 rgba(255,255,255,0.7) inset, 0 4px 14px -8px rgba(15,7,3,0.08)'
          : '0 1px 0 rgba(255,255,255,0.02) inset',
      }}
    >
      <div
        className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
        style={{
          background: isLight ? hexAlpha(mintBrand, 0.10) : hexAlpha(mintBrand, 0.16),
          border: `1px solid ${hexAlpha(mintBrand, isLight ? 0.22 : 0.30)}`,
        }}
      >
        <Icon size={20} color={mintBrand} />
      </div>

      <div className="flex-1 min-w-0">
        <p className="text-[14px] font-extrabold truncate" style={{ color: t.text }}>
          {data.pt.title}
        </p>
        <p className="text-[11px] mt-0.5 font-semibold" style={{ color: t.textSec }}>
          {data.groupLabel}
        </p>
        <p className="text-[14px] font-extrabold tabular-nums mt-0.5" style={{ color: t.text }}>
          {formatNaira(Number(data.pt.amount || 0))}
        </p>
        <p className="text-[11px] mt-1" style={{ color: t.textSec }}>
          Paid on {formatDate(data.paidAt)}
        </p>
      </div>

      <div className="shrink-0">
        <div
          className="w-8 h-8 rounded-full flex items-center justify-center"
          style={{
            background: isLight ? hexAlpha(mintBrand, 0.14) : hexAlpha(mintBrand, 0.20),
            border: `1px solid ${hexAlpha(mintBrand, isLight ? 0.22 : 0.32)}`,
          }}
        >
          <CheckCircle2 size={16} color={mintBrand} />
        </div>
      </div>
    </motion.button>
  );
}

// ── Skeleton ─────────────────────────────────────────────────────
function RowSkeleton({ theme }: { theme: 'light' | 'dark' }) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  return (
    <div
      className="rounded-2xl px-4 py-3.5 flex items-center gap-3 animate-pulse"
      style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
    >
      <div
        className="w-12 h-12 rounded-2xl shrink-0"
        style={{ background: isLight ? '#EEE9E5' : 'rgba(255,255,255,0.05)' }}
      />
      <div className="flex-1 space-y-2">
        <div className="h-3.5 rounded" style={{ background: isLight ? '#EEE9E5' : 'rgba(255,255,255,0.05)', width: '60%' }} />
        <div className="h-3.5 rounded" style={{ background: isLight ? '#EEE9E5' : 'rgba(255,255,255,0.05)', width: '40%' }} />
        <div className="h-2.5 rounded" style={{ background: isLight ? '#F5F1ED' : 'rgba(255,255,255,0.03)', width: '50%' }} />
      </div>
      <div className="space-y-2">
        <div className="h-4 w-14 rounded-full" style={{ background: isLight ? '#EEE9E5' : 'rgba(255,255,255,0.05)' }} />
        <div className="h-3 w-4 rounded ml-auto" style={{ background: isLight ? '#F5F1ED' : 'rgba(255,255,255,0.03)' }} />
      </div>
    </div>
  );
}
