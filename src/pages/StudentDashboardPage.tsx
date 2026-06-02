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
  User as UserIcon,
  Users,
  AlertCircle,
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
import MyClaimStatus from '@/components/claims/MyClaimStatus';
// ── Phase-2 dashboard redesign (matches the polished mockup) ──
// Theme system + decorative page background + hero + the new
// quick-actions / due-next / promo surfaces. The legacy BentoGrid
// + "New this week" + "Your dues" list are gone — replaced by the
// cleaner DueNextList. Sections below still pending a re-skin live
// inside ThemedPanel so they render correctly in both modes.
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import PayvexoBackground from '@/components/student/dashboard/PayvexoBackground';
import OutstandingHero from '@/components/student/dashboard/OutstandingHero';
import EventsSection from '@/components/student/dashboard/EventsSection';
import QuickActionsGrid from '@/components/student/dashboard/QuickActionsGrid';
import DueNextList, { type DueNextItem } from '@/components/student/dashboard/DueNextList';
import PayOnTimeCard from '@/components/student/dashboard/PayOnTimeCard';
import ShareClassLinkCard from '@/components/student/dashboard/ShareClassLinkCard';
import ThemeSwitcher from '@/components/ThemeSwitcher';

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
  const orgId = mtMember?.organization?.id ?? '';
  const groupId = mtMember?.group?.id ?? null;
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
      setWelcomeOrg(s.orgName ?? orgName ?? '');
      window.history.replaceState({}, document.title);
    }
  }, [location, orgName]);

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
        category: pt.category ?? null,
        status,
        approvedSum,
        owed: Math.max(0, Number(pt.amount || 0) - approvedSum),
        daysLeft: daysFromNow(pt.deadline),
      };
    });
  }, [paymentTypes, payments]);

  const duesOnly = useMemo(
    () => enriched.filter((e) => (String(e.category ?? '').toLowerCase()) !== 'event'),
    [enriched]
  );

  const unpaidActive = useMemo(
    () => duesOnly.filter((e) => e.status === 'unpaid' || e.status === 'partial'),
    [duesOnly]
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
    return [...duesOnly].sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (a.pt.is_mandatory !== b.pt.is_mandatory) return a.pt.is_mandatory ? -1 : 1;
      const ad = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
      const bd = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });
  }, [duesOnly]);

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

        {/* ───────────── PENDING-EXEC VERIFY PROMPT ─────────────
            A founder/exec whose role isn't verified yet is bounced out of
            /admin/*; this banner shows them the way to unlock it. */}
        {mtMember?.admin_records?.some(
          (a) => a.is_active &&
            !['email_verified', 'document_verified', 'admin_verified', 'member_confirmed'].includes(a.verification_status || '')
        ) && (
          <button
            onClick={() => go('/verify-email')}
            className="w-full mb-3 rounded-2xl px-4 py-3 flex items-center gap-3 text-left"
            style={{ background: 'rgba(255,104,3,0.10)', border: '1px solid rgba(255,104,3,0.30)' }}
          >
            <AlertCircle className="w-5 h-5 shrink-0" style={{ color: '#FF6803' }} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold" style={{ color: '#FF6803' }}>Verify your role to unlock admin</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.65)' }}>
                Confirm your school email to create dues, events &amp; payouts.
              </p>
            </div>
            <ChevronRight className="w-4 h-4 shrink-0" style={{ color: '#FF6803' }} />
          </button>
        )}

        {/* ───────────── MY CLAIM STATUS ─────────────
            Graduated-trust progress for the claimant's own pending claim
            (path, vote progress, 72h window, platform-review escape valve). */}
        <MyClaimStatus />

        {/* ───────────── VOTE URGENCY BANNER ─────────────
            Compact at-a-glance banner that hides itself when there's
            nothing to vote on. Replaced the duplicate full-card
            VoteInbox below it — one signal is enough. */}
        <VoteUrgencyBanner orgSlug={orgSlug} />

        {/* ───────────── GREETING (mockup-faithful, two-line) ─────────────
            "Good afternoon," (small) then the user's full name (big,
            bold) on a new line. The theme switcher sits to the right
            on its own — visible affordance for light/dark/system. */}
        <header className="flex items-start justify-between gap-3 px-1 sm:px-0">
          <div className="min-w-0 flex-1">
            <p
              className="text-[14px] sm:text-[15px] font-medium"
              style={{ color: dt.textSec }}
            >
              {greeting()},
            </p>
            <h1
              className="text-[26px] sm:text-[30px] font-extrabold leading-[1.1] tracking-tight mt-0.5"
              style={{ color: dt.text }}
            >
              {user?.full_name?.trim() || firstName(user?.full_name)}
              <span className="ml-1.5" aria-hidden>👋</span>
            </h1>
            <p
              className="text-[12px] sm:text-[13px] mt-1"
              style={{ color: dt.textTer }}
            >
              Stay on top of your payments.
            </p>
          </div>
          <ThemeSwitcher className="mt-1 shrink-0" size={38} />
        </header>

        <OutstandingHero
          outstandingAmount={outstanding}
          pendingCount={unpaidCount}
          totalCount={paymentTypes.length || unpaidCount}
          privacyOn={privacyOn}
          onTogglePrivacy={() => setPrivacyOn((v) => !v)}
          ctaLabel={urgent ? 'Pay next due' : undefined}
          onCtaClick={urgent ? () => go(`/payment/${urgent.pt.id}`) : undefined}
          memberId={memberLoginId || null}
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

        {/* ───────────── SHARE CLASS LINK ─────────────
            Anyone in the class can grow the class — invites are not
            gated to admins. Calls SECURITY DEFINER RPC
            create_member_join_invite which yields a member-only code. */}
        {orgSlug && groupId && mtMember?.id && (
          <ShareClassLinkCard
            theme={theme}
            memberId={mtMember.id}
            groupId={groupId}
            orgSlug={orgSlug}
            className={mtMember?.group?.name}
            orgName={orgName}
          />
        )}

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

        <EventsSection
          theme={theme}
          orgId={orgId}
          groupId={groupId}
          maxItems={2}
          showAllHref={orgSlug ? `/${orgSlug}/events` : null}
          onGetTicket={(id) => go(`/payment/${id}`)}
        />

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
                // Deep brand orange — more mature than the bright #FF6803
                tint: theme === 'light' ? '#C84600' : '#FF7A1E',
                onClick: () => go('/payments'),
              },
              {
                icon: History,
                label: 'History',
                hint: receiptsCount ? `${receiptsCount} paid` : 'nothing yet',
                // Mature emerald — "trusted success" not "neon"
                tint: theme === 'light' ? '#047857' : '#10D49B',
                onClick: () => go('/payments'),
              },
              {
                icon: Users,
                label: 'Groups',
                hint: 'see & join',
                // Calm teal — distinct from the payment actions without
                // feeling like a third finance tile.
                tint: theme === 'light' ? '#0F766E' : '#2DD4BF',
                onClick: () => go('/groups'),
              },
              {
                icon: UserIcon,
                label: 'Profile',
                hint: memberLoginId?.slice(0, 6) || 'me',
                // Deeper indigo-purple — more "fintech executive"
                tint: theme === 'light' ? '#5B21B6' : '#A78BFA',
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

        {/* ───────────── PAY ON TIME CARD (moved to bottom) ───────────── */}
        <div className="pt-4">
          <PayOnTimeCard theme={theme} firstName={firstName(user?.full_name)} />
        </div>

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
