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
  ChevronRight,
  Sparkles,
  CreditCard,
  TrendingUp,
  User as UserIcon,
  AlertCircle,
  Zap,
  CheckCircle2,
  Loader2,
  Activity,
  History,
} from 'lucide-react';
import { useAppAuth as useAuth } from '@/hooks/useAppAuth';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useAppNav } from '@/hooks/useAppNav';
import paymentService from '@/services/paymentService';
import { formatCurrency, formatDate } from '@/utils/formatters';
import type { Payment, PaymentType, PaymentStats } from '@/types';
import VerificationStatusBanner from '@/components/claims/VerificationStatusBanner';
import VoteUrgencyBanner from '@/components/claims/VoteUrgencyBanner';
// ── Phase-2 dashboard redesign (matches the polished mockup) ──
// Theme system + decorative page background + hero + the new
// quick-actions / due-next / promo surfaces. The legacy BentoGrid
// + "New this week" + "Your dues" list are gone — replaced by the
// cleaner DueNextList. Sections below still pending a re-skin live
// inside ThemedPanel so they render correctly in both modes.
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import PayvexoBackground from '@/components/student/dashboard/PayvexoBackground';
import OutstandingHero from '@/components/student/dashboard/OutstandingHero';
import QuickActionsGrid from '@/components/student/dashboard/QuickActionsGrid';
import DueNextList, { type DueNextItem } from '@/components/student/dashboard/DueNextList';
import PromoBanner from '@/components/student/dashboard/PromoBanner';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// All design tokens come from getDashboardTokens(theme) — no inline
// dark-only palette lives here anymore. Components below either accept
// `theme` and call getDashboardTokens themselves, or read the `dt`
// instance computed once at the page level.
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
  const memberLoginId = mtMember?.member_id ?? user?.reg_number;
  const { go, orgSlug } = useAppNav();
  const navigate = useNavigate();
  // Theme used by the redesigned dashboard surfaces (Phase 1+2).
  // `theme` is the resolved value ('light' | 'dark'); the toggle UI
  // will land in Phase 3. `dt` are the tokens for the current theme —
  // every new component below reads them so light/dark both look right.
  const { theme } = useTheme();
  const dt = useMemo(() => getDashboardTokens(theme), [theme]);
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

  // ── Items for the new DueNextList (Phase 2) ─────────────────
  // We surface the next ~5 unpaid/partial dues. The component handles
  // empty-state and skeletons itself.
  const dueNextItems: DueNextItem[] = useMemo(() => {
    return allDuesSorted
      .filter((e) => e.status !== 'paid')
      .slice(0, 5)
      .map((e) => ({
        id: e.pt.id,
        title: e.pt.title || 'Untitled due',
        amount: Number(e.pt.amount || 0),
        status: e.status,
        daysLeft: e.daysLeft,
        isMandatory: Boolean(e.pt.is_mandatory),
        categoryKey: (e.pt as { category?: string | null }).category ?? null,
        paidAmount: e.approvedSum,
      }));
  }, [allDuesSorted]);

  // Hero figures
  const outstanding = Math.max(0, Number(stats.totalDue || 0));
  const unpaidCount = unpaidActive.length;

  // Receipts count (approved payments) — surfaced as the "History" tile hint
  const receiptsCount = useMemo(
    () => payments.filter((p) => p.status === 'approved').length,
    [payments]
  );

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh' }}>
      {/* Theme-aware decorative background (warm peach blob upper-left,
          secondary blob lower-right, dot grid, hand-drawn swoosh).
          The only background layer on this page now. */}
      <PayvexoBackground theme={theme} />

      {/* Spacing rhythm: 5 between sections gives fintech breathing room
          without feeling sparse. 6xl max-width keeps desktop legible
          while the page stays single-column (mobile-first). */}
      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-24 space-y-5">
        {/* Welcome banner (just-joined) */}
        <AnimatePresence>
          {welcomeOrg && (
            <motion.div
              initial={{ opacity: 0, y: -12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              className="rounded-2xl px-4 py-3 flex items-center gap-3"
              style={{
                background: theme === 'light' ? '#E6FAEF' : 'rgba(48,255,172,0.10)',
                border: `1px solid ${theme === 'light' ? '#B8EED4' : 'rgba(48,255,172,0.22)'}`,
              }}
            >
              <Sparkles className="w-5 h-5 shrink-0" style={{ color: dt.mint }} />
              <p className="text-sm flex-1" style={{ color: dt.text }}>
                Welcome to <span className="font-bold">{welcomeOrg || 'your organization'}</span>! You're all set up.
              </p>
              <button
                onClick={() => setWelcomeOrg(null)}
                className="text-xs font-bold"
                style={{ color: dt.mint }}
              >
                Got it
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ───────────── VOTE URGENCY BANNER ─────────────
            Compact at-a-glance banner that hides itself when there's
            nothing to vote on. Replaced the duplicate full-card
            VoteInbox below it — one signal is enough. */}
        <VoteUrgencyBanner orgSlug={orgSlug} />

        {/* ───────────── GREETING (fintech-style) ─────────────
            Tiny one-line greeting + small avatar chip. The headline
            of this page is the OutstandingHero card below — the
            greeting is intentionally secondary. Pattern borrowed from
            Opay / Kuda / Cash App: never compete with the balance. */}
        <header className="flex items-center justify-between gap-3 px-1 sm:px-0">
          <div className="min-w-0">
            <p
              className="text-[11px] uppercase tracking-[0.16em] font-bold"
              style={{ color: dt.textTer }}
            >
              {orgName || 'Your account'}
            </p>
            <p
              className="text-[15px] font-bold leading-tight mt-0.5 truncate"
              style={{ color: dt.text }}
            >
              {greeting()}, <span style={{ color: dt.primary }}>{firstName(user?.full_name)}</span>
            </p>
          </div>
          {/* Avatar chip — small, sharp, fintech-grade */}
          <button
            type="button"
            onClick={() => go('/profile')}
            className="shrink-0 w-10 h-10 rounded-full flex items-center justify-center text-sm font-extrabold transition-transform active:scale-95"
            style={{
              background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
              color: dt.primary,
              border: `1px solid ${dt.primaryRing}`,
              boxShadow: theme === 'light'
                ? `0 6px 18px -8px ${dt.primaryRing}`
                : 'none',
            }}
            aria-label="Open profile"
          >
            {firstName(user?.full_name).charAt(0).toUpperCase()}
          </button>
        </header>

        <OutstandingHero
          outstandingAmount={outstanding}
          pendingCount={unpaidCount}
          totalCount={paymentTypes.length || unpaidCount}
          privacyOn={privacyOn}
          onTogglePrivacy={() => setPrivacyOn((v) => !v)}
          ctaLabel={urgent ? 'Pay next due' : undefined}
          onCtaClick={urgent ? () => go(`/payment/${urgent.pt.id}`) : undefined}
        />

        {/* ───────────── VERIFICATION STATUS BANNER ─────────────
            Surfaces the user's exact next step:
              • not an admin → "Claim a role"
              • unverified admin (e.g. fresh founder) → "Verify your role"
              • mid-flight claim → progress bar + waiting state
            Hides when verification_layer >= 4 (fully verified). */}
        <ThemedPanel theme={theme}>
          <VerificationStatusBanner />
        </ThemedPanel>

        {/* VoteInbox removed in fintech-redesign — the compact
            VoteUrgencyBanner above is the single source of truth for
            outstanding votes. Less duplication, less noise. */}

        {/* ───────────── DUE NEXT — highest priority below the hero ─────────────
            This is what the member NEEDS to do next. Fintech hierarchy:
            balance (hero) → next action (due next) → tools (quick actions).
            Mockup-faithful: tinted icon chips, deadline pills, tap-to-pay. */}
        <DueNextList
          theme={theme}
          loading={loading}
          privacyOn={privacyOn}
          items={dueNextItems}
          totalCount={allDuesSorted.length}
          onItemClick={(id) => go(`/payment/${id}`)}
          onSeeAllClick={() => go('/payments')}
        />

        {/* ───────────── PROMO BANNER ─────────────
            Reinforces Paystack-first behaviour: rewards paying online
            (no waiting for manual approval). Shown only when the
            member actually has something to pay. */}
        {!loading && unpaidCount > 0 && (
          <PromoBanner
            theme={theme}
            icon={Zap}
            tint={dt.primary}
            title="Pay online, get instant confirmation"
            subtitle="Bank transfer & USSD work from any Nigerian bank."
            actionLabel={urgent ? 'Pay now' : undefined}
            onAction={urgent ? () => go(`/payment/${urgent.pt.id}`) : undefined}
          />
        )}

        {/* ───────────── QUICK ACTIONS ─────────────
            Secondary tools row. Same data shape regardless of theme;
            tile rendering adapts (soft tints in light, glassy in dark).
            Sits BELOW the due-next list because tools are less urgent
            than the next thing-to-pay. */}
        <div className="pt-1">
          <p
            className="text-[10px] uppercase tracking-[0.16em] font-bold px-1 mb-2"
            style={{ color: dt.textTer }}
          >
            Quick tools
          </p>
          <QuickActionsGrid
            theme={theme}
            tiles={[
              {
                icon: CreditCard,
                label: 'Pay',
                hint: unpaidCount ? `${unpaidCount} pending` : 'all clear',
                tint: dt.primary,
                onClick: () => go('/payments'),
              },
              {
                icon: History,
                label: 'History',
                hint: receiptsCount ? `${receiptsCount} paid` : 'nothing yet',
                tint: dt.mint,
                onClick: () => go('/payments'),
              },
              {
                icon: TrendingUp,
                label: 'Spending',
                hint: 'transparency',
                tint: dt.amber,
                onClick: () => go('/payments'),
              },
              {
                icon: UserIcon,
                label: 'Profile',
                hint: memberLoginId?.slice(0, 6) || 'me',
                tint: dt.purple,
                onClick: () => go('/profile'),
              },
            ]}
          />
        </div>

        {/* ───────────── ACTIVITY FEED ─────────────
            Theme-aware re-skin: same data, light + dark surfaces. */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18 }}
          className="rounded-3xl overflow-hidden"
          style={{
            background: dt.card,
            border: `1px solid ${dt.cardBorder}`,
            boxShadow: theme === 'light'
              ? '0 1px 0 rgba(255,255,255,0.7) inset, 0 6px 24px -12px rgba(15,7,3,0.08)'
              : '0 1px 0 rgba(255,255,255,0.02) inset',
          }}
        >
          <header className="flex items-center justify-between px-5 sm:px-6 py-4" style={{ borderBottom: `1px solid ${dt.cardBorder}` }}>
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" style={{ color: dt.primary }} />
              <h2 className="text-sm font-bold tracking-tight" style={{ color: dt.text }}>Recent activity</h2>
            </div>
            <button
              onClick={() => go('/payments')}
              className="text-xs font-semibold flex items-center gap-1 transition-colors"
              style={{ color: dt.textSec }}
            >
              See all
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </header>

          {loading ? (
            <div className="px-5 sm:px-6 py-6 flex items-center gap-3" style={{ color: dt.textTer }}>
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Loading activity…</span>
            </div>
          ) : recentActivity.length === 0 ? (
            <div className="px-5 sm:px-6 py-10 text-center">
              <p className="text-sm" style={{ color: dt.textSec }}>
                Nothing here yet. Your payments and notices will show up here.
              </p>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: dt.cardBorder } as React.CSSProperties}>
              {recentActivity.map((p, i) => (
                <ActivityRow
                  key={p.id || i}
                  payment={p}
                  payment_type_name={
                    paymentTypes.find((pt) => pt.id === p.payment_type_id)?.title || 'Payment'
                  }
                  index={i}
                  privacyOn={privacyOn}
                  theme={theme}
                  onClick={() => p.id && navigate(`/${orgSlug ?? ''}/payment/${p.id}`)}
                />
              ))}
            </div>
          )}
        </motion.section>

        {/* ───────────── COMING SOON: EVENT TICKETING ─────────────
            Fintech roadmap teaser. The next big feature on the
            platform is event ticketing for clubs/SUG events — same
            payment rails, just a different SKU. This card creates
            anticipation and signals momentum. Replaces the old
            notifications-nudge footer which felt utility-store. */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-3xl p-5 sm:p-6 overflow-hidden"
          style={{
            background: theme === 'light'
              ? 'linear-gradient(135deg, #F5EEFE 0%, #FAF6FF 50%, #FFFFFF 100%)'
              : 'linear-gradient(135deg, rgba(139,92,246,0.12) 0%, rgba(255,255,255,0.02) 100%)',
            border: `1px solid ${theme === 'light' ? '#E5D9FB' : 'rgba(139,92,246,0.22)'}`,
          }}
        >
          {/* Decorative glow blob */}
          <div
            className="absolute pointer-events-none rounded-full"
            style={{
              width: 220,
              height: 220,
              right: -60,
              top: -60,
              background: theme === 'light'
                ? 'radial-gradient(circle, rgba(139,92,246,0.18) 0%, transparent 65%)'
                : 'radial-gradient(circle, rgba(139,92,246,0.22) 0%, transparent 65%)',
              filter: 'blur(20px)',
            }}
            aria-hidden
          />

          <div className="relative flex flex-col sm:flex-row gap-4 sm:items-center sm:justify-between">
            <div className="flex items-start gap-3 min-w-0">
              {/* Big icon chip — purple, matches the ticket category vibe */}
              <div
                className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                style={{
                  background: theme === 'light' ? '#FFFFFF' : 'rgba(139,92,246,0.18)',
                  border: `1px solid ${theme === 'light' ? '#E5D9FB' : 'rgba(139,92,246,0.32)'}`,
                  boxShadow: theme === 'light' ? '0 8px 20px -8px rgba(139,92,246,0.32)' : 'none',
                }}
              >
                <Sparkles className="w-5 h-5" style={{ color: '#8b5cf6' }} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className="text-[10px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full"
                    style={{
                      background: theme === 'light' ? '#EFE3FF' : 'rgba(139,92,246,0.18)',
                      color: '#8b5cf6',
                    }}
                  >
                    Coming soon
                  </span>
                </div>
                <p className="text-sm sm:text-base font-extrabold leading-tight mt-1" style={{ color: dt.text }}>
                  Event tickets, right in your dashboard
                </p>
                <p className="text-xs mt-1 leading-snug" style={{ color: dt.textSec }}>
                  Buy passes to lectures, parties & meetups — paid with the same Paystack rails you already trust.
                </p>
              </div>
            </div>

            {/* Subtle interest button — soft, not loud */}
            <motion.button
              onClick={() => go('/profile')}
              className="self-start sm:self-center shrink-0 px-3.5 py-2 rounded-xl text-[12px] font-bold inline-flex items-center gap-1.5 transition-colors"
              style={{
                background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
                color: '#8b5cf6',
                border: `1px solid ${theme === 'light' ? '#E5D9FB' : 'rgba(139,92,246,0.28)'}`,
              }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.97 }}
            >
              Notify me
              <ChevronRight className="w-3.5 h-3.5" />
            </motion.button>
          </div>
        </motion.section>
      </main>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ThemedPanel — thin wrapper that gives legacy sections (which still
// render their own dark-mode UI internally) a theme-aware backdrop
// so they're visually anchored on the light cream page. Once those
// sections are re-skinned natively, this wrapper can go away.
// ════════════════════════════════════════════════════════════════════════════
function ThemedPanel({
  theme,
  delay = 0,
  children,
}: {
  theme: 'light' | 'dark';
  delay?: number;
  children: React.ReactNode;
}) {
  const dt = getDashboardTokens(theme);
  return (
    <motion.section
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="rounded-3xl overflow-hidden"
      style={{
        background: dt.card,
        border: `1px solid ${dt.cardBorder}`,
        boxShadow: theme === 'light'
          ? '0 1px 0 rgba(255,255,255,0.7) inset, 0 6px 24px -12px rgba(15,7,3,0.08)'
          : '0 1px 0 rgba(255,255,255,0.02) inset',
      }}
    >
      {children}
    </motion.section>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// Activity row — theme-aware (light + dark) status row in the
// "Recent activity" panel. Same data shape as before; just renders
// correctly on the cream page in light mode.
// ════════════════════════════════════════════════════════════════════════════
function ActivityRow({
  payment,
  payment_type_name,
  index,
  privacyOn,
  theme,
  onClick,
}: {
  payment: Payment;
  payment_type_name: string;
  index: number;
  privacyOn: boolean;
  theme: 'light' | 'dark';
  onClick?: () => void;
}) {
  const t = getDashboardTokens(theme);
  const statusMeta: Record<string, { color: string; label: string; icon: React.ElementType }> = {
    approved: { color: t.mint,   label: 'Paid',     icon: CheckCircle2 },
    pending:  { color: t.amber,  label: 'Pending',  icon: Loader2 },
    rejected: { color: t.danger, label: 'Rejected', icon: AlertCircle },
  };
  const meta = statusMeta[payment.status as string] ?? { color: t.textTer, label: payment.status as string, icon: BookOpen };
  const Icon = meta.icon;

  return (
    <motion.button
      onClick={onClick}
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.04 * index, duration: 0.22 }}
      className="w-full flex items-center gap-3 px-5 sm:px-6 py-3.5 text-left transition-colors hover:bg-black/[0.02] dark:hover:bg-white/[0.02]"
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
        <p className="text-sm font-semibold truncate" style={{ color: t.text }}>{payment_type_name}</p>
        <p className="text-[11px] mt-0.5" style={{ color: t.textTer }}>
          {meta.label}
          {payment.created_at ? ` · ${formatDate(payment.created_at, 'short')}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p
          className="text-sm font-bold tabular-nums"
          style={{
            color: t.text,
            filter: privacyOn ? 'blur(6px)' : 'none',
          }}
        >
          {formatCurrency(Number(payment.amount || 0))}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 ml-1 shrink-0" style={{ color: t.textTer }} />
    </motion.button>
  );
}
