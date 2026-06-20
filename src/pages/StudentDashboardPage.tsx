/**
 * StudentDashboardPage — bento-grid modular home for members.
 *
 * Route: /:orgSlug/dashboard
 *
 * ── 2026-06 additions ──────────────────────────────────────────────
 *   PlatformNoticeBoard  — editorial carousel notice board.
 *                          Fetches platform_notices from Supabase.
 *                          Sits between ShareClassLinkCard and DueNextList
 *                          so members see it on first scroll without
 *                          blocking the financial critical path.
 *                          Renders nothing while loading / when empty,
 *                          so existing layout is unaffected when no
 *                          notices are live.
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
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import PayvexoBackground from '@/components/student/dashboard/PayvexoBackground';
import OutstandingHero from '@/components/student/dashboard/OutstandingHero';
import EventsSection from '@/components/student/dashboard/EventsSection';
import QuickActionsGrid from '@/components/student/dashboard/QuickActionsGrid';
import DueNextList, { type DueNextItem } from '@/components/student/dashboard/DueNextList';
import OptionalContributions from '@/components/student/dashboard/OptionalContributions';
import PayOnTimeCard from '@/components/student/dashboard/PayOnTimeCard';
import ShareClassLinkCard from '@/components/student/dashboard/ShareClassLinkCard';
import ThemeSwitcher from '@/components/ThemeSwitcher';
// ── Notice board (2026-06) ─────────────────────────────────────────
import PlatformNoticeBoard from '@/components/student/dashboard/PlatformNoticeBoard';

// ── Helpers ──────────────────────────────────────────────────────────────────
function greeting(d: Date = new Date()): string {
  const h = d.getHours();
  if (h < 5)  return 'Burning the midnight oil';
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

// ── Main ──────────────────────────────────────────────────────────────────────
export default function StudentDashboardPage() {
  const { user } = useAuth();
  const { user: mtMember } = useMultiTenantAuth();
  const orgName  = mtMember?.organization?.name;
  const orgId    = mtMember?.organization?.id ?? '';
  const groupId  = mtMember?.group?.id ?? null;
  const memberLoginId = mtMember?.member_id ?? user?.reg_number;
  const { go, orgSlug } = useAppNav();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const dt = useMemo(() => getDashboardTokens(theme), [theme]);
  const location = useLocation();

  // Privacy mask
  const [privacyOn, setPrivacyOn] = useState<boolean>(() => {
    try { return localStorage.getItem('pvx_privacy_mask') === '1'; } catch { return false; }
  });
  useEffect(() => {
    try { localStorage.setItem('pvx_privacy_mask', privacyOn ? '1' : '0'); } catch { /* noop */ }
  }, [privacyOn]);

  // Welcome banner
  const [welcomeOrg, setWelcomeOrg] = useState<string | null>(null);
  useEffect(() => {
    const s = location.state as { justJoined?: boolean; orgName?: string } | null;
    if (s?.justJoined) {
      setWelcomeOrg(s.orgName ?? orgName ?? '');
      window.history.replaceState({}, document.title);
    }
  }, [location, orgName]);

  // Data
  const [loading, setLoading]           = useState(true);
  const [stats, setStats]               = useState<PaymentStats>({ totalPaid: 0, totalDue: 0, paymentsMade: 0, pendingPayments: 0 });
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [payments, setPayments]         = useState<Payment[]>([]);

  const fetchAll = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    try {
      const payload = await paymentService.getStudentDashboardPayload(user.id);
      setStats(payload.stats);
      setPaymentTypes(payload.paymentTypes);
      setPayments(payload.payments);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => { void fetchAll(); }, [fetchAll]);

  // ── Derived ───────────────────────────────────────────────────────────────
  const enriched = useMemo(() => {
    return paymentTypes.map((pt) => {
      const own = payments.filter((p) => p.payment_type_id === pt.id);
      const isWaived = own.some(
        (p) => p.status === 'approved' && p.transaction_ref?.startsWith('WAIVED-'),
      );
      const approvedSum = own
        .filter((p) => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-'))
        .reduce((s, p) => s + Number(p.amount || 0), 0);
      const status: 'paid' | 'partial' | 'pending' | 'unpaid' | 'waived' =
        isWaived                                      ? 'waived'
        : own.some((p) => p.status === 'pending')    ? 'pending'
        : approvedSum >= Number(pt.amount || 0)      ? 'paid'
        : approvedSum > 0                            ? 'partial'
        :                                              'unpaid';
      return {
        pt,
        category: pt.category ?? null,
        status,
        approvedSum,
        owed: isWaived ? 0 : Math.max(0, Number(pt.amount || 0) - approvedSum),
        daysLeft: daysFromNow(pt.deadline),
      };
    });
  }, [paymentTypes, payments]);

  const duesOnly = useMemo(
    () => enriched.filter((e) => String(e.category ?? '').toLowerCase() !== 'event'),
    [enriched],
  );

  const unpaidActive = useMemo(
    () => duesOnly.filter((e) => e.status === 'unpaid' || e.status === 'partial'),
    [duesOnly],
  );

  const urgent = useMemo(() => {
    const mandatory = unpaidActive.filter((e) => e.pt.is_mandatory);
    const pool = mandatory.length ? mandatory : unpaidActive;
    return [...pool].sort((a, b) => {
      const ad = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
      const bd = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
      return ad - bd;
    })[0] ?? null;
  }, [unpaidActive]);

  const recentActivity = useMemo(
    () =>
      [...payments]
        .sort((a, b) => new Date(b.created_at || '').getTime() - new Date(a.created_at || '').getTime())
        .slice(0, 5),
    [payments],
  );

  const allDuesSorted = useMemo(() => {
    const rank: Record<typeof enriched[number]['status'], number> = {
      unpaid: 0, partial: 1, pending: 2, paid: 3, waived: 3,
    };
    return [...duesOnly].sort((a, b) => {
      if (rank[a.status] !== rank[b.status]) return rank[a.status] - rank[b.status];
      if (a.pt.is_mandatory !== b.pt.is_mandatory) return a.pt.is_mandatory ? -1 : 1;
      const ad = a.daysLeft ?? Number.MAX_SAFE_INTEGER;
      const bd = b.daysLeft ?? Number.MAX_SAFE_INTEGER;
      return ad - bd;
    });
  }, [duesOnly]);

  const dueNextItems: DueNextItem[] = useMemo(() =>
    allDuesSorted
      .filter((e) => e.status !== 'paid' && e.status !== 'waived' && e.pt.is_mandatory)
      .slice(0, 5)
      .map((e) => ({
        id: e.pt.id,
        title: e.pt.title || 'Untitled due',
        amount: Number(e.pt.amount || 0),
        status: e.status as DueNextItem['status'],
        daysLeft: e.daysLeft,
        isMandatory: Boolean(e.pt.is_mandatory),
        categoryKey: (e.pt as { category?: string | null }).category ?? null,
        paidAmount: e.approvedSum,
      })),
    [allDuesSorted],
  );

  const optionalDueItems: DueNextItem[] = useMemo(() =>
    allDuesSorted
      .filter((e) => e.status !== 'paid' && e.status !== 'waived' && !e.pt.is_mandatory)
      .slice(0, 5)
      .map((e) => ({
        id: e.pt.id,
        title: e.pt.title || 'Untitled due',
        amount: Number(e.pt.amount || 0),
        status: e.status as DueNextItem['status'],
        daysLeft: e.daysLeft,
        isMandatory: Boolean(e.pt.is_mandatory),
        categoryKey: (e.pt as { category?: string | null }).category ?? null,
        paidAmount: e.approvedSum,
      })),
    [allDuesSorted],
  );

  const outstanding  = Math.max(0, Number(stats.totalDue || 0));
  const mandatoryUnpaid = useMemo(() => unpaidActive.filter((e) => e.pt.is_mandatory), [unpaidActive]);
  const unpaidCount  = mandatoryUnpaid.length;
  const receiptsCount = useMemo(() => payments.filter((p) => p.status === 'approved').length, [payments]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh' }}>
      <PayvexoBackground theme={theme} />

      <main className="relative z-10 max-w-6xl mx-auto px-4 sm:px-6 pt-4 sm:pt-6 pb-24 space-y-5">

        {/* ── Alert rail: welcome / verify-prompt / claim / vote-urgency
            compressed into one tight stack with shared small gap (space-y-2
            instead of each one inheriting the page's space-y-5). They were
            each reading at full hero-weight before the actual hero — this
            keeps them visible but visually subordinate. ── */}
        <div className="space-y-2">
          <AnimatePresence>
            {welcomeOrg && (
              <motion.div
                initial={{ opacity: 0, y: -12 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -12 }}
                className="rounded-2xl px-4 py-2.5 flex items-center gap-3"
                style={{
                  background: theme === 'light' ? '#E6FAEF' : 'rgba(48,255,172,0.10)',
                  border: `1px solid ${theme === 'light' ? '#B8EED4' : 'rgba(48,255,172,0.22)'}`,
                }}
              >
                <Sparkles className="w-4 h-4 shrink-0" style={{ color: dt.mint }} />
                <p className="text-[13px] flex-1" style={{ color: dt.text }}>
                  Welcome to <span className="font-bold">{welcomeOrg || 'your organization'}</span>! You're all set up.
                </p>
                <button onClick={() => setWelcomeOrg(null)} className="text-xs font-bold" style={{ color: dt.mint }}>
                  Got it
                </button>
              </motion.div>
            )}
          </AnimatePresence>

          {mtMember?.admin_records?.some(
            (a) => a.is_active &&
              !['email_verified', 'document_verified', 'admin_verified', 'member_confirmed'].includes(a.verification_status || '')
          ) && (
            <button
              onClick={() => go('/verify-email')}
              className="w-full rounded-2xl px-4 py-2.5 flex items-center gap-3 text-left"
              style={{ background: 'rgba(255,104,3,0.10)', border: '1px solid rgba(255,104,3,0.30)' }}
            >
              <AlertCircle className="w-4 h-4 shrink-0" style={{ color: '#FF6803' }} />
              <p className="text-[13px] flex-1" style={{ color: dt.text }}>
                <span className="font-bold" style={{ color: '#FF6803' }}>Verify your role</span> to unlock dues, events &amp; payouts
              </p>
              <ChevronRight className="w-3.5 h-3.5 shrink-0" style={{ color: '#FF6803' }} />
            </button>
          )}

          <MyClaimStatus />
          <VoteUrgencyBanner orgSlug={orgSlug} />
        </div>

        {/* Greeting */}
        <header className="flex items-start justify-between gap-3 px-1 sm:px-0">
          <div className="min-w-0 flex-1">
            <p className="text-[14px] sm:text-[15px] font-medium" style={{ color: dt.textSec }}>
              {greeting()},
            </p>
            <h1 className="text-[26px] sm:text-[30px] font-extrabold leading-[1.1] tracking-tight mt-0.5" style={{ color: dt.text }}>
              {user?.full_name?.trim() || firstName(user?.full_name)}
              <span className="ml-1.5" aria-hidden>👋</span>
            </h1>
            <p className="text-[12px] sm:text-[13px] mt-1" style={{ color: dt.textTer }}>
              Stay on top of your payments.
            </p>
          </div>
          <ThemeSwitcher className="mt-1 shrink-0" size={38} />
        </header>

        {/* Hero */}
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

        {/* Verification banner */}
        <ThemedPanel theme={theme}>
          <VerificationStatusBanner />
        </ThemedPanel>

        {/* Share class link */}
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

     

        {/* ── The Ledger zone ───────────────────────────────────────
            DueNextList, OptionalContributions, and EventsSection used
            to each render as their own independent floating section —
            three section headers, three different rhythms, no sense
            they belong together. One soft card groups them with
            consistent internal spacing; each component keeps its own
            internal layout untouched, this only adds the shared frame
            and the dividers between them. ── */}
        <div
          className="rounded-[28px] p-4 sm:p-5 space-y-6"
          style={{
            background: dt.card,
            border: `1px solid ${dt.cardBorder}`,
            boxShadow: theme === 'light'
              ? '0 1px 0 rgba(255,255,255,0.7) inset, 0 6px 24px -12px rgba(15,7,3,0.08)'
              : '0 1px 0 rgba(255,255,255,0.02) inset',
          }}
        >
          <DueNextList
            theme={theme}
            loading={loading}
            privacyOn={privacyOn}
            items={dueNextItems}
            totalCount={allDuesSorted.length}
            onItemClick={(id) => go(`/payment/${id}`)}
            onSeeAllClick={() => go('/payments')}
          />

          {optionalDueItems.length > 0 && (
            <div style={{ borderTop: `1px solid ${dt.cardBorder}`, paddingTop: 20 }}>
              <OptionalContributions
                theme={theme}
                privacyOn={privacyOn}
                items={optionalDueItems}
                onGive={(id) => go(`/payment/${id}`)}
              />
            </div>
          )}

          <div style={{ borderTop: `1px solid ${dt.cardBorder}`, paddingTop: 20 }}>
            <EventsSection
              theme={theme}
              orgId={orgId}
              memberId={mtMember?.id ?? null}
              maxItems={2}
              showAllHref={orgSlug ? `/${orgSlug}/events` : null}
              onGetTicket={(id) => go(`/payment/${id}`)}
            />
          </div>
        </div>

        {/* Quick actions — visually quiet: small label, no card chrome
            of its own beyond what QuickActionsGrid already provides. */}
        <div>
          <p className="text-[9.5px] uppercase tracking-[0.18em] font-bold px-1 mb-2 opacity-80" style={{ color: dt.textTer }}>
            Quick tools
          </p>
          <QuickActionsGrid
            theme={theme}
            tiles={[
              {
                icon: CreditCard,
                label: 'Pay',
                hint: unpaidCount ? `${unpaidCount} pending` : 'all clear',
                tint: theme === 'light' ? '#C84600' : '#FF7A1E',
                onClick: () => go('/payments'),
              },
              {
                icon: History,
                label: 'History',
                hint: receiptsCount ? `${receiptsCount} paid` : 'nothing yet',
                tint: theme === 'light' ? '#047857' : '#10D49B',
                onClick: () => go('/payments'),
              },
              {
                icon: Users,
                label: 'Groups',
                hint: 'see & join',
                tint: theme === 'light' ? '#0F766E' : '#2DD4BF',
                onClick: () => go('/groups'),
              },
              {
                icon: UserIcon,
                label: 'Profile',
                hint: memberLoginId?.slice(0, 6) || 'me',
                tint: theme === 'light' ? '#5B21B6' : '#A78BFA',
                onClick: () => go('/profile'),
              },
            ]}
          />
        </div>

        {/* Recent activity */}
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
          <header
            className="flex items-center justify-between px-5 sm:px-6 py-4"
            style={{ borderBottom: `1px solid ${dt.cardBorder}` }}
          >
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4" style={{ color: dt.primary }} />
              <h2 className="text-sm font-bold tracking-tight" style={{ color: dt.text }}>
                Recent activity
              </h2>
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
                  onClick={() => {
                    if (!p.id) return;
                    const base = `/${orgSlug ?? ''}`;
                    if (p.status === 'approved') {
                      navigate(`${base}/receipt/${p.id}`);
                    } else if (p.payment_type_id) {
                      navigate(`${base}/payment/${p.payment_type_id}`);
                    }
                  }}
                />
              ))}

              
            </div>
          )}

          
        </motion.section>

           {/* ─────────────────────────────────────────────────────────────
            PLATFORM NOTICE BOARD
            Sits here — below the "who you are" identity surfaces
            (verification, share card) and above "what you need to do"
            (due next). This is the editorial zone: information before
            action. The component handles its own loading state and
            renders nothing when there are no active notices, so the
            spacing gap below collapses cleanly when empty.
        ───────────────────────────────────────────────────────────── */}
        <PlatformNoticeBoard
          theme={theme}
          orgId={orgId || null}
        />

        {/* Pay on time card */}
        <div className="pt-4">
          <PayOnTimeCard theme={theme} firstName={firstName(user?.full_name)} />
        </div>
      </main>
    </div>
  );
}

// ── ThemedPanel ───────────────────────────────────────────────────────────────
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

// ── ActivityRow ───────────────────────────────────────────────────────────────
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
  const isWaived = payment.status === 'approved'
    && (payment as { transaction_ref?: string | null }).transaction_ref?.startsWith('WAIVED-');
  const statusMeta: Record<string, { color: string; label: string; icon: React.ElementType }> = {
    approved: { color: t.mint,   label: 'Paid',     icon: CheckCircle2 },
    pending:  { color: t.amber,  label: 'Pending',  icon: Loader2 },
    rejected: { color: t.danger, label: 'Rejected', icon: AlertCircle },
  };
  const meta = isWaived
    ? { color: t.amber, label: 'Waived', icon: CheckCircle2 }
    : statusMeta[payment.status as string] ?? { color: t.textTer, label: payment.status as string, icon: BookOpen };
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
        <p className="text-sm font-semibold truncate" style={{ color: t.text }}>
          {payment_type_name}
        </p>
        <p className="text-[11px] mt-0.5" style={{ color: t.textTer }}>
          {meta.label}
          {payment.created_at ? ` · ${formatDate(payment.created_at, 'short')}` : ''}
        </p>
      </div>
      <div className="text-right shrink-0">
        <p
          className="text-sm font-bold tabular-nums"
          style={{
            color: isWaived ? t.amber : t.text,
            filter: privacyOn && !isWaived ? 'blur(6px)' : 'none',
          }}
        >
          {isWaived ? 'Waived' : formatCurrency(Number(payment.amount || 0))}
        </p>
      </div>
      <ChevronRight className="w-4 h-4 ml-1 shrink-0" style={{ color: t.textTer }} />
    </motion.button>
  );
}