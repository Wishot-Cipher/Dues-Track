/**
 * StudentDashboardPage — bento-grid modular home for members.
 *
 * Route: /:orgSlug/dashboard (replaces the old DashboardPage at this route)
 *
 * Layout regions:
 *   1. Smart greeting hero  — time-of-day, name, outstanding balance,
 *                             next urgent due, primary CTA
 *   2. 6-tile bento grid    — Dues, Events (coming soon), Receipts,
 *                             Class, Spending, Profile. Each tile is
 *                             clickable, shows a key metric.
 *   3. Activity feed        — recent payments + announcements, mixed
 *                             chronologically, lightweight rows
 *
 * Visual language: dark canvas, brand orange accent, mint for success,
 * glass cards with subtle borders, framer-motion entrance/hover.
 *
 * Data: reuses paymentService + useAppAuth (same shape as old dashboard,
 * so backend changes aren't needed). The old DashboardPage stays in
 * the repo as a safety net but is no longer routed.
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BookOpen,
  Calendar,
  ChevronRight,
  Eye,
  EyeOff,
  Layers,
  Receipt,
  Settings,
  Sparkles,
  Ticket,
  TrendingUp,
  User as UserIcon,
  Wallet,
  AlertCircle,
  Bell,
  Zap,
  CheckCircle2,
  ArrowRight,
  Loader2,
  Activity,
} from 'lucide-react';
import { useAppAuth as useAuth } from '@/hooks/useAppAuth';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useAppNav } from '@/hooks/useAppNav';
import paymentService from '@/services/paymentService';
import { formatCurrency, formatDate } from '@/utils/formatters';
import type { Payment, PaymentType, PaymentStats } from '@/types';
import ExpenseTransparencyDashboard from '@/components/student/ExpenseTransparencyDashboard';
import AchievementSystem from '@/components/student/AchievementSystem';
import VoteInbox from '@/components/claims/VoteInbox';
import VerificationStatusBanner from '@/components/claims/VerificationStatusBanner';

// ────────────────────────────────────────────────────────────────────────────
// Design tokens
// ────────────────────────────────────────────────────────────────────────────
const tk = {
  bg:        '#0F0703',
  panel:     'rgba(255,255,255,0.03)',
  panelHov:  'rgba(255,255,255,0.05)',
  border:    'rgba(255,255,255,0.08)',
  borderHov: 'rgba(255,104,3,0.32)',
  text:      '#FFFFFF',
  textSec:   'rgba(255,255,255,0.65)',
  textTer:   'rgba(255,255,255,0.40)',
  textQuat:  'rgba(255,255,255,0.22)',
  primary:   '#FF6803',
  primaryHi: '#FFAC5F',
  mint:      '#30FFAC',
  blue:      '#5B9BFF',
  purple:    '#8b5cf6',
  pink:      '#ec4899',
  amber:     '#F59E0B',
  danger:    '#ef4444',
};

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────
function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Burning the midnight oil';
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  if (h < 22) return 'Good evening';
  return 'Late night, eh';
}

function firstName(full?: string): string {
  if (!full) return 'there';
  return full.trim().split(/\s+/)[0];
}

function daysFromNow(iso?: string | null): number | null {
  if (!iso) return null;
  const target = new Date(iso).getTime();
  const now = Date.now();
  return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
}

// ────────────────────────────────────────────────────────────────────────────
// Main
// ────────────────────────────────────────────────────────────────────────────

export default function StudentDashboardPage() {
  const { user } = useAuth();
  // Multi-tenant auth has the org + group + raw member object that
  // useAppAuth doesn't surface on its mapped Student shape.
  const { user: mtMember } = useMultiTenantAuth();
  const orgName = mtMember?.organization?.name;
  const groupName = mtMember?.group?.name ?? user?.department;
  const memberLoginId = mtMember?.member_id ?? user?.reg_number;
  const { go, orgSlug } = useAppNav();
  const navigate = useNavigate();
  const location = useLocation();

  // Privacy mask — hide balances at a tap (shoulder-surfing friendly)
  const [privacyOn, setPrivacyOn] = useState<boolean>(() => {
    try { return localStorage.getItem('pvx_privacy_mask') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('pvx_privacy_mask', privacyOn ? '1' : '0'); } catch { /* noop */ }
  }, [privacyOn]);

  // Welcome banner (when user just joined via invite or bring-school)
  const [welcomeOrg, setWelcomeOrg] = useState<string | null>(null);
  useEffect(() => {
    const s = location.state as { justJoined?: boolean; orgName?: string } | null;
    if (s?.justJoined) {
      setWelcomeOrg(s.orgName ?? '');
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Data state
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<PaymentStats>({
    totalPaid: 0, totalDue: 0, paymentsMade: 0, pendingPayments: 0,
  });
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const [statsData, ptData, payData] = await Promise.all([
        paymentService.getStudentPaymentStats(user.id),
        paymentService.getActivePaymentTypesForStudent(user.id),
        paymentService.getStudentPayments(user.id),
      ]);
      setStats(statsData);
      setPaymentTypes(ptData);
      setPayments(payData);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // ── Derived: which payment types are unpaid and what's the most urgent ──
  const enriched = useMemo(() => {
    return paymentTypes.map((pt) => {
      const own = payments.filter((p) => p.payment_type_id === pt.id);
      const approvedSum = own
        .filter((p) => p.status === 'approved')
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      const status: 'paid' | 'partial' | 'pending' | 'unpaid' =
        own.some((p) => p.status === 'pending') ? 'pending'
        : approvedSum >= Number(pt.amount || 0) ? 'paid'
        : approvedSum > 0 ? 'partial'
        : 'unpaid';
      return {
        pt,
        status,
        approvedSum,
        owed: Math.max(0, Number(pt.amount || 0) - approvedSum),
        daysLeft: daysFromNow(pt.deadline),
      };
    });
  }, [paymentTypes, payments]);

  const unpaidActive = useMemo(
    () => enriched.filter((e) => e.status === 'unpaid' || e.status === 'partial'),
    [enriched]
  );

  const urgent = useMemo(() => {
    // Soonest deadline among unpaid/partial mandatory dues; fall back to any unpaid
    const mandatory = unpaidActive.filter((e) => e.pt.is_mandatory);
    const pool = mandatory.length ? mandatory : unpaidActive;
    return [...pool].sort((a, b) => {
      const ad = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
      const bd = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
      return ad - bd;
    })[0] ?? null;
  }, [unpaidActive]);

  // Recent activity = last 6 payments
  const recentActivity = useMemo(
    () =>
      [...payments]
        .sort((a, b) =>
          new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime()
        )
        .slice(0, 6),
    [payments]
  );

  // Dues published in the last 7 days — the "New this week" strip
  const newThisWeek = useMemo(() => {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return enriched
      .filter((e) => {
        const created = new Date(e.pt.created_at || '').getTime();
        return !Number.isNaN(created) && created >= cutoff;
      })
      .sort((a, b) => {
        const ad = new Date(a.pt.created_at || '').getTime();
        const bd = new Date(b.pt.created_at || '').getTime();
        return bd - ad;
      });
  }, [enriched]);

  // All dues with status — sorted: unpaid mandatory first, then partial, paid last
  const allDuesSorted = useMemo(() => {
    const rank: Record<typeof enriched[number]['status'], number> = {
      unpaid: 0, partial: 1, pending: 2, paid: 3,
    };
    return [...enriched].sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (a.pt.is_mandatory !== b.pt.is_mandatory) return a.pt.is_mandatory ? -1 : 1;
      const ad = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
      const bd = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });
  }, [enriched]);

  // Hero figures
  const outstanding = Math.max(0, Number(stats.totalDue || 0));
  const isAllClear  = outstanding === 0 && !loading;
  const unpaidCount = unpaidActive.length;

  // Class % paid (rough: paymentTypes paid / total)
  const classProgress = useMemo(() => {
    const total = enriched.length || 1;
    const done  = enriched.filter((e) => e.status === 'paid').length;
    return Math.round((done / total) * 100);
  }, [enriched]);

  // Receipts count (approved payments)
  const receiptsCount = useMemo(
    () => payments.filter((p) => p.status === 'approved').length,
    [payments]
  );

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh', background: tk.bg }}>
      {/* Ambient background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full blur-[180px]"
          style={{
            width: 640, height: 640,
            background: `radial-gradient(circle, ${tk.primary} 0%, transparent 70%)`,
            top: '-15%', right: '-10%', opacity: 0.12,
          }}
        />
        <div
          className="absolute rounded-full blur-[160px]"
          style={{
            width: 480, height: 480,
            background: `radial-gradient(circle, ${tk.mint} 0%, transparent 70%)`,
            bottom: '5%', left: '-8%', opacity: 0.07,
          }}
        />
      </div>

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-24 space-y-4">
        {/* Welcome banner (just-joined) */}
        <AnimatePresence>
          {welcomeOrg && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{ background: 'rgba(48,255,172,0.10)', border: '1px solid rgba(48,255,172,0.22)' }}
            >
              <Sparkles className="w-5 h-5 shrink-0" style={{ color: tk.mint }} />
              <p className="text-sm flex-1" style={{ color: 'rgba(214,255,237,0.95)' }}>
                Welcome to <span className="text-white font-bold">{welcomeOrg || 'your organization'}</span>!
                You're all set up.
              </p>
              <button
                onClick={() => setWelcomeOrg(null)}
                className="text-xs font-semibold"
                style={{ color: tk.mint }}
              >
                Got it
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ───────────── HERO ───────────── */}
        <HeroCard
          name={firstName(user?.full_name)}
          orgName={orgName}
          loading={loading}
          isAllClear={isAllClear}
          outstanding={outstanding}
          unpaidCount={unpaidCount}
          urgent={urgent}
          privacyOn={privacyOn}
          onTogglePrivacy={() => setPrivacyOn((v) => !v)}
          onPayUrgent={() => urgent && go(`/payment/${urgent.pt.id}`)}
          onSeeAllDues={() => go('/payments')}
        />

        {/* ───────────── VERIFICATION STATUS BANNER ─────────────
            Surfaces the user's exact next step:
              • not an admin → "Claim a role"
              • unverified admin (e.g. fresh founder) → "Verify your role"
              • mid-flight claim → progress bar + waiting state
            Hides when verification_layer >= 4 (fully verified). */}
        <VerificationStatusBanner />

        {/* ───────────── VOTE INBOX ─────────────
            Hides itself entirely when there's nothing to vote on,
            so it's non-disruptive on the happy path. */}
        <VoteInbox />

        {/* ───────────── BENTO GRID ───────────── */}
        <section className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
          {/* Dues */}
          <BentoTile
            icon={<Wallet className="w-5 h-5" />}
            accent={tk.primary}
            title="Dues"
            metric={loading ? '…' : unpaidCount.toString()}
            metricLabel={unpaidCount === 1 ? 'unpaid' : 'unpaid'}
            subtitle={isAllClear ? 'All caught up' : `${formatCurrency(outstanding)} outstanding`}
            privacy={!isAllClear && privacyOn ? 'subtitle' : 'none'}
            onClick={() => go('/payments')}
          />

          {/* Events — placeholder, coming soon */}
          <BentoTile
            icon={<Ticket className="w-5 h-5" />}
            accent={tk.purple}
            title="Events"
            metric="Soon"
            metricLabel="ticketing"
            subtitle="Buy passes to lectures, parties, meetups"
            comingSoon
          />

          {/* Receipts */}
          <BentoTile
            icon={<Receipt className="w-5 h-5" />}
            accent={tk.mint}
            title="Receipts"
            metric={loading ? '…' : receiptsCount.toString()}
            metricLabel={receiptsCount === 1 ? 'receipt' : 'receipts'}
            subtitle={receiptsCount ? 'View payment history' : 'No payments yet'}
            onClick={() => go('/payments')}
          />

          {/* Class progress */}
          <BentoTile
            icon={<Layers className="w-5 h-5" />}
            accent={tk.blue}
            title="Class"
            metric={loading ? '…' : `${classProgress}%`}
            metricLabel="caught up"
            subtitle={groupName || 'Your class'}
            onClick={() => go('/payments')}
          >
            <div className="mt-2 w-full h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
              <motion.div
                className="h-full rounded-full"
                style={{ background: `linear-gradient(90deg, ${tk.blue}, ${tk.mint})` }}
                initial={{ width: 0 }}
                animate={{ width: `${classProgress}%` }}
                transition={{ duration: 0.8, ease: 'easeOut' }}
              />
            </div>
          </BentoTile>

          {/* Spending transparency */}
          <BentoTile
            icon={<TrendingUp className="w-5 h-5" />}
            accent={tk.amber}
            title="Spending"
            metric="View"
            metricLabel="transparency"
            subtitle="See how your dues are spent"
            onClick={() => go('/payments')}
          />

          {/* Profile */}
          <BentoTile
            icon={<UserIcon className="w-5 h-5" />}
            accent={tk.pink}
            title="Profile"
            metric={memberLoginId?.slice(0, 8) || 'Me'}
            metricLabel="member"
            subtitle={user?.email || 'Update your info'}
            onClick={() => go('/profile')}
          />
        </section>

        {/* ───────────── NEW THIS WEEK ───────────── */}
        {!loading && newThisWeek.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.14 }}
            className="space-y-3"
          >
            <header className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4" style={{ color: tk.primary }} />
                <h2 className="text-sm font-bold text-white tracking-tight">New this week</h2>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: `${tk.primary}18`, color: tk.primary }}
                >
                  {newThisWeek.length}
                </span>
              </div>
            </header>
            <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 snap-x snap-mandatory">
              {newThisWeek.map((e, i) => (
                <NewDueCard
                  key={e.pt.id}
                  enriched={e}
                  index={i}
                  privacyOn={privacyOn}
                  onClick={() => go(`/payment/${e.pt.id}`)}
                />
              ))}
            </div>
          </motion.section>
        )}

        {/* ───────────── YOUR DUES — detailed list ───────────── */}
        {!loading && allDuesSorted.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="rounded-3xl overflow-hidden"
            style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
          >
            <header className="flex items-center justify-between px-5 sm:px-6 py-4"
              style={{ borderBottom: `1px solid ${tk.border}` }}>
              <div className="flex items-center gap-2">
                <Wallet className="w-4 h-4" style={{ color: tk.primary }} />
                <h2 className="text-sm font-bold text-white tracking-tight">Your dues</h2>
                <span
                  className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: tk.textSec }}
                >
                  {allDuesSorted.length}
                </span>
              </div>
              <span className="text-[10px] uppercase tracking-widest" style={{ color: tk.textTer }}>
                progress
              </span>
            </header>
            <div className="divide-y" style={{ borderColor: tk.border } as React.CSSProperties}>
              {allDuesSorted.slice(0, 8).map((e, i) => (
                <DueRow
                  key={e.pt.id}
                  enriched={e}
                  index={i}
                  privacyOn={privacyOn}
                  onClick={() => go(`/payment/${e.pt.id}`)}
                />
              ))}
            </div>
            {allDuesSorted.length > 8 && (
              <div className="px-5 sm:px-6 py-3 text-center" style={{ borderTop: `1px solid ${tk.border}` }}>
                <button
                  onClick={() => go('/payments')}
                  className="text-xs font-semibold inline-flex items-center gap-1"
                  style={{ color: tk.primary }}
                >
                  See all {allDuesSorted.length} dues
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </motion.section>
        )}

        {/* ───────────── TRANSPARENCY — where money goes ───────────── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.22 }}
        >
          <ExpenseTransparencyDashboard />
        </motion.section>

        {/* ───────────── ACHIEVEMENTS ───────────── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.26 }}
        >
          <AchievementSystem />
        </motion.section>

        {/* ───────────── ACTIVITY FEED ───────────── */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="rounded-3xl overflow-hidden"
          style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
        >
          <header className="flex items-center justify-between px-5 sm:px-6 py-4" style={{ borderBottom: `1px solid ${tk.border}` }}>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" style={{ color: tk.primary }} />
              <h2 className="text-sm font-bold text-white tracking-tight">Recent activity</h2>
            </div>
            <button
              onClick={() => go('/payments')}
              className="text-xs font-semibold flex items-center gap-1 transition-colors"
              style={{ color: tk.textSec }}
            >
              See all
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </header>

          {loading ? (
            <div className="px-5 sm:px-6 py-6 flex items-center gap-3" style={{ color: tk.textTer }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading activity…</span>
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="px-5 sm:px-6 py-10 text-center">
              <p className="text-sm" style={{ color: tk.textSec }}>
                Nothing here yet. Your payments and notices will show up here.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: tk.border } as React.CSSProperties}>
              {recentActivity.map((p, i) => (
                <ActivityRow
                  key={p.id || i}
                  payment={p}
                  payment_type_name={
                    paymentTypes.find((pt) => pt.id === p.payment_type_id)?.title || 'Payment'
                  }
                  index={i}
                  privacyOn={privacyOn}
                  onClick={() => p.id && navigate(`/${orgSlug ?? ''}/payment/${p.id}`)}
                />
              ))}
            </div>
          )}
        </motion.section>

        {/* ───────────── Helper footer card ───────────── */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="rounded-3xl p-5 sm:p-6 flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between"
          style={{
            background: 'linear-gradient(135deg, rgba(255,104,3,0.08), rgba(255,255,255,0.02))',
            border: `1px solid ${tk.border}`,
          }}
        >
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: `${tk.primary}15`, border: `1px solid ${tk.primary}28` }}
            >
              <Bell className="w-5 h-5" style={{ color: tk.primary }} />
            </div>
            <div>
              <p className="text-sm font-bold text-white">Stay on top of new dues</p>
              <p className="text-xs mt-0.5" style={{ color: tk.textSec }}>
                Enable push notifications so you never miss a deadline.
              </p>
            </div>
          </div>
          <motion.button
            onClick={() => go('/settings')}
            className="px-4 py-2 rounded-xl text-sm font-semibold text-white inline-flex items-center gap-1.5 shrink-0"
            style={{
              background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
              boxShadow: '0 6px 22px rgba(255,104,3,0.32)',
            }}
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
          >
            Settings
            <Settings className="w-3.5 h-3.5" />
          </motion.button>
        </motion.section>
      </main>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Hero
// ════════════════════════════════════════════════════════════════════════════
function HeroCard({
  name,
  orgName,
  loading,
  isAllClear,
  outstanding,
  unpaidCount,
  urgent,
  privacyOn,
  onTogglePrivacy,
  onPayUrgent,
  onSeeAllDues,
}: {
  name: string;
  orgName?: string;
  loading: boolean;
  isAllClear: boolean;
  outstanding: number;
  unpaidCount: number;
  urgent: {
    pt: PaymentType;
    owed: number;
    daysLeft: number | null;
  } | null;
  privacyOn: boolean;
  onTogglePrivacy: () => void;
  onPayUrgent: () => void;
  onSeeAllDues: () => void;
}) {
  const urgentLabel = urgent?.daysLeft != null
    ? urgent.daysLeft < 0
      ? `${Math.abs(urgent.daysLeft)} day${Math.abs(urgent.daysLeft) === 1 ? '' : 's'} overdue`
      : urgent.daysLeft === 0
        ? 'Due today'
        : urgent.daysLeft === 1
          ? 'Due tomorrow'
          : `Due in ${urgent.daysLeft} days`
    : 'No deadline';

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-[28px] p-5 sm:p-7 relative overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, rgba(255,104,3,0.10), rgba(255,255,255,0.025))',
        border: `1px solid ${tk.border}`,
      }}
    >
      {/* Top accent line */}
      <div
        className="absolute top-0 inset-x-0 h-0.5"
        style={{ background: `linear-gradient(90deg, transparent, ${tk.primary}, transparent)` }}
      />
      {/* Soft radial highlight */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: `radial-gradient(ellipse 60% 70% at 100% 0%, ${tk.primary}18, transparent 60%)` }}
      />

      <div className="relative flex flex-col sm:flex-row gap-6">
        {/* Left: greeting + balance */}
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-[0.22em] font-semibold mb-1.5"
            style={{ color: tk.textTer }}>
            {orgName || 'Your organization'}
          </p>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight">
            {greeting()},{' '}
            <span style={{
              background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              {name}
            </span>
          </h1>

          <div className="mt-5 flex items-end justify-between gap-3 flex-wrap">
            <div>
              <p className="text-[10px] uppercase tracking-[0.22em] font-semibold mb-1"
                style={{ color: tk.textTer }}>
                {isAllClear ? 'Status' : 'Outstanding'}
              </p>
              <div className="flex items-center gap-2">
                {loading ? (
                  <div className="h-9 w-32 rounded-xl animate-pulse" style={{ background: 'rgba(255,255,255,0.05)' }} />
                ) : isAllClear ? (
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-7 h-7" style={{ color: tk.mint }} />
                    <span className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                      All caught up
                    </span>
                  </div>
                ) : (
                  <span className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight tabular-nums">
                    {privacyOn ? '••••••' : formatCurrency(outstanding)}
                  </span>
                )}
                {!isAllClear && (
                  <button
                    onClick={onTogglePrivacy}
                    className="p-1.5 rounded-lg transition-colors"
                    title={privacyOn ? 'Show amount' : 'Hide amount'}
                    style={{ color: tk.textTer }}
                  >
                    {privacyOn ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                )}
              </div>
              {!isAllClear && !loading && (
                <p className="text-xs mt-1.5" style={{ color: tk.textSec }}>
                  {unpaidCount} due{unpaidCount === 1 ? '' : 's'}
                  {urgent ? ` · Next: ${urgent.pt.title}` : ''}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* Right: urgent CTA card */}
        {urgent && !loading && (
          <motion.div
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl p-4 sm:w-72 shrink-0 flex flex-col gap-3"
            style={{
              background: 'rgba(15,7,3,0.55)',
              border: `1px solid ${tk.border}`,
              backdropFilter: 'blur(8px)',
            }}
          >
            <div className="flex items-center gap-2">
              <Zap className="w-3.5 h-3.5" style={{
                color: (urgent.daysLeft ?? 999) <= 1 ? tk.danger : tk.amber,
              }} />
              <span className="text-[10px] uppercase tracking-[0.18em] font-bold"
                style={{ color: (urgent.daysLeft ?? 999) <= 1 ? tk.danger : tk.amber }}>
                {urgentLabel}
              </span>
            </div>
            <div>
              <p className="text-sm font-bold text-white truncate">{urgent.pt.title}</p>
              <div className="flex items-center gap-1.5 mt-1 text-[11px]" style={{ color: tk.textTer }}>
                <Calendar className="w-3 h-3" />
                {urgent.pt.deadline ? formatDate(urgent.pt.deadline, 'short') : 'No deadline'}
              </div>
            </div>
            <div className="flex items-center justify-between mt-1">
              <span className="text-lg font-extrabold text-white tabular-nums">
                {privacyOn ? '••••' : formatCurrency(urgent.owed)}
              </span>
              <motion.button
                onClick={onPayUrgent}
                className="px-3.5 py-2 rounded-xl text-xs font-bold text-white inline-flex items-center gap-1.5"
                style={{
                  background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
                  boxShadow: '0 6px 22px rgba(255,104,3,0.40)',
                }}
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
              >
                Pay now
                <ArrowRight className="w-3.5 h-3.5" />
              </motion.button>
            </div>
          </motion.div>
        )}

        {/* If all clear, show a celebratory call-to-action */}
        {isAllClear && !loading && (
          <motion.button
            onClick={onSeeAllDues}
            initial={{ opacity: 0, x: 16 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.15 }}
            className="rounded-2xl p-4 sm:w-64 shrink-0 flex flex-col gap-2 text-left"
            style={{
              background: 'rgba(48,255,172,0.06)',
              border: '1px solid rgba(48,255,172,0.20)',
            }}
            whileHover={{ scale: 1.02 }}
          >
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4" style={{ color: tk.mint }} />
              <span className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: tk.mint }}>
                Nothing pending
              </span>
            </div>
            <p className="text-sm" style={{ color: 'rgba(214,255,237,0.92)' }}>
              You're up to date with all dues. Review your history any time.
            </p>
            <span className="text-xs font-semibold inline-flex items-center gap-1 mt-1" style={{ color: tk.mint }}>
              View receipts
              <ArrowRight className="w-3 h-3" />
            </span>
          </motion.button>
        )}
      </div>
    </motion.section>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Bento Tile
// ════════════════════════════════════════════════════════════════════════════
function BentoTile({
  icon,
  accent,
  title,
  metric,
  metricLabel,
  subtitle,
  onClick,
  comingSoon,
  privacy,
  children,
}: {
  icon: React.ReactNode;
  accent: string;
  title: string;
  metric: string;
  metricLabel: string;
  subtitle?: string;
  onClick?: () => void;
  comingSoon?: boolean;
  privacy?: 'none' | 'metric' | 'subtitle';
  children?: React.ReactNode;
}) {
  const Wrapper: React.ElementType = onClick && !comingSoon ? motion.button : motion.div;
  return (
    <Wrapper
      onClick={onClick && !comingSoon ? onClick : undefined}
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
      whileHover={onClick && !comingSoon ? { y: -3 } : undefined}
      whileTap={onClick && !comingSoon ? { scale: 0.985 } : undefined}
      className={`text-left rounded-2xl p-4 sm:p-5 relative overflow-hidden transition-all ${comingSoon ? 'cursor-default' : onClick ? 'cursor-pointer' : ''}`}
      style={{
        background: tk.panel,
        border: `1px solid ${tk.border}`,
      }}
    >
      {/* Soft accent halo */}
      <div
        className="absolute inset-0 pointer-events-none opacity-50"
        style={{ background: `radial-gradient(ellipse 60% 80% at 100% 100%, ${accent}10, transparent 70%)` }}
      />

      <div className="relative">
        <div className="flex items-center justify-between">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: `${accent}18`,
              color: accent,
              border: `1px solid ${accent}28`,
            }}
          >
            {icon}
          </div>
          {comingSoon && (
            <span
              className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
              style={{
                background: `${tk.purple}14`,
                color: tk.purple,
                border: `1px solid ${tk.purple}28`,
              }}
            >
              Coming soon
            </span>
          )}
        </div>

        <p className="mt-4 text-[10px] uppercase tracking-[0.18em] font-semibold"
          style={{ color: tk.textTer }}>
          {title}
        </p>

        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl sm:text-2xl font-extrabold text-white tracking-tight tabular-nums truncate">
            {privacy === 'metric' ? '••••' : metric}
          </span>
          <span className="text-[10px]" style={{ color: tk.textTer }}>{metricLabel}</span>
        </div>

        {subtitle && (
          <p className="mt-1.5 text-[11px] leading-4 line-clamp-2" style={{ color: tk.textSec }}>
            {privacy === 'subtitle' ? '••••' : subtitle}
          </p>
        )}

        {children}
      </div>
    </Wrapper>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// New due card — horizontal scroll item for "New this week" strip
// ════════════════════════════════════════════════════════════════════════════
type EnrichedDue = {
  pt: PaymentType;
  status: 'paid' | 'partial' | 'pending' | 'unpaid';
  approvedSum: number;
  owed: number;
  daysLeft: number | null;
};

function NewDueCard({
  enriched, index, privacyOn, onClick,
}: {
  enriched: EnrichedDue;
  index: number;
  privacyOn: boolean;
  onClick: () => void;
}) {
  const accent = enriched.pt.color || tk.primary;
  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.05 * index, duration: 0.28 }}
      whileHover={{ y: -3 }}
      whileTap={{ scale: 0.98 }}
      className="text-left rounded-2xl p-4 relative overflow-hidden snap-start shrink-0 w-[260px]"
      style={{
        background: `linear-gradient(135deg, ${accent}10, rgba(255,255,255,0.025))`,
        border: `1px solid ${accent}30`,
      }}
    >
      <div className="flex items-start justify-between mb-3">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center text-xl"
          style={{ background: `${accent}18`, border: `1px solid ${accent}30` }}
        >
          {enriched.pt.icon || '🎓'}
        </div>
        <span
          className="text-[9px] font-bold uppercase tracking-widest px-2 py-1 rounded-full"
          style={{ background: `${tk.mint}14`, color: tk.mint, border: `1px solid ${tk.mint}30` }}
        >
          NEW
        </span>
      </div>
      <p className="text-sm font-bold text-white truncate">{enriched.pt.title}</p>
      <p className="text-[11px] mt-0.5 truncate" style={{ color: tk.textTer }}>
        {enriched.pt.deadline ? `Due ${formatDate(enriched.pt.deadline, 'short')}` : 'No deadline'}
      </p>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-base font-extrabold text-white tabular-nums">
          {privacyOn ? '••••' : formatCurrency(Number(enriched.pt.amount || 0))}
        </span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{
            background: enriched.pt.is_mandatory ? 'rgba(239,68,68,0.12)' : `${tk.mint}14`,
            color: enriched.pt.is_mandatory ? tk.danger : tk.mint,
            border: `1px solid ${enriched.pt.is_mandatory ? 'rgba(239,68,68,0.28)' : `${tk.mint}30`}`,
          }}
        >
          {enriched.pt.is_mandatory ? 'MANDATORY' : 'OPTIONAL'}
        </span>
      </div>
    </motion.button>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Due row — detailed list item in "Your dues" panel
// ════════════════════════════════════════════════════════════════════════════
function DueRow({
  enriched, index, privacyOn, onClick,
}: {
  enriched: EnrichedDue;
  index: number;
  privacyOn: boolean;
  onClick: () => void;
}) {
  const accent = enriched.pt.color || tk.primary;
  const amount = Number(enriched.pt.amount || 0);
  const progress = amount > 0 ? Math.min(100, (enriched.approvedSum / amount) * 100) : 0;

  const statusMeta: Record<EnrichedDue['status'], { color: string; label: string }> = {
    paid:    { color: tk.mint,    label: 'Paid' },
    partial: { color: tk.amber,   label: `${Math.round(progress)}% paid` },
    pending: { color: tk.blue,    label: 'Pending review' },
    unpaid:  { color: tk.danger,  label: enriched.daysLeft != null && enriched.daysLeft < 0
                                          ? `${Math.abs(enriched.daysLeft)} days overdue`
                                          : 'Unpaid' },
  };
  const meta = statusMeta[enriched.status];

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.03 * index, duration: 0.22 }}
      whileHover={{ background: tk.panelHov }}
      className="w-full flex items-center gap-4 px-5 sm:px-6 py-4 text-left transition-colors"
    >
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0"
        style={{ background: `${accent}15`, border: `1px solid ${accent}28` }}
      >
        {enriched.pt.icon || '🎓'}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-white truncate">{enriched.pt.title}</p>
          {enriched.pt.is_mandatory && (
            <span
              className="text-[9px] font-bold px-1.5 py-0.5 rounded-full shrink-0"
              style={{ background: 'rgba(239,68,68,0.10)', color: tk.danger }}
            >
              MANDATORY
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px]" style={{ color: tk.textTer }}>
          <span style={{ color: meta.color, fontWeight: 600 }}>{meta.label}</span>
          {enriched.pt.deadline && (
            <>
              <span>·</span>
              <Calendar className="w-3 h-3" />
              <span>{formatDate(enriched.pt.deadline, 'short')}</span>
            </>
          )}
        </div>
        {/* Progress bar */}
        <div
          className="mt-2 h-1 rounded-full overflow-hidden"
          style={{ background: 'rgba(255,255,255,0.06)' }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{
              background: enriched.status === 'paid'
                ? `linear-gradient(90deg, ${tk.mint}, ${tk.mint})`
                : enriched.status === 'partial'
                  ? `linear-gradient(90deg, ${tk.amber}, ${tk.primary})`
                  : enriched.status === 'pending'
                    ? `linear-gradient(90deg, ${tk.blue}, ${tk.mint})`
                    : `linear-gradient(90deg, ${tk.danger}, ${tk.amber})`,
            }}
            initial={{ width: 0 }}
            animate={{ width: `${Math.max(progress, enriched.status === 'unpaid' ? 6 : 0)}%` }}
            transition={{ duration: 0.6, delay: 0.05 * index, ease: 'easeOut' }}
          />
        </div>
      </div>

      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-white tabular-nums">
          {privacyOn ? '••••' : formatCurrency(amount)}
        </p>
        {enriched.status === 'partial' && (
          <p className="text-[10px]" style={{ color: tk.textTer }}>
            {privacyOn ? '••••' : formatCurrency(enriched.owed)} left
          </p>
        )}
      </div>
      <ChevronRight className="w-4 h-4 ml-1 shrink-0" style={{ color: tk.textQuat }} />
    </motion.button>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// Activity row
// ════════════════════════════════════════════════════════════════════════════
function ActivityRow({
  payment,
  payment_type_name,
  index,
  privacyOn,
  onClick,
}: {
  payment: Payment;
  payment_type_name: string;
  index: number;
  privacyOn: boolean;
  onClick?: () => void;
}) {
  const statusMeta: Record<string, { color: string; label: string; icon: React.ElementType }> = {
    approved: { color: tk.mint,   label: 'Paid',     icon: CheckCircle2 },
    pending:  { color: tk.amber,  label: 'Pending',  icon: Loader2 },
    rejected: { color: tk.danger, label: 'Rejected', icon: AlertCircle },
  };
  const meta = statusMeta[payment.status as string] ?? { color: tk.textTer, label: payment.status as string, icon: BookOpen };
  const Icon = meta.icon;

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.22 }}
      whileHover={{ background: tk.panelHov }}
      className="w-full flex items-center gap-3 px-5 sm:px-6 py-3.5 text-left transition-colors"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{
          background: `${meta.color}14`,
          color: meta.color,
          border: `1px solid ${meta.color}28`,
        }}
      >
        <Icon className={`w-4 h-4 ${payment.status === 'pending' ? 'animate-spin' : ''}`} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-semibold text-white truncate">{payment_type_name}</p>
        <p className="text-[11px] mt-0.5" style={{ color: tk.textTer }}>
          {meta.label}
          {payment.created_at ? ` · ${formatDate(payment.created_at, 'short')}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p className="text-sm font-bold text-white tabular-nums">
          {privacyOn ? '••••' : formatCurrency(Number(payment.amount || 0))}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 ml-1 shrink-0" style={{ color: tk.textQuat }} />
    </motion.button>
  );
}
