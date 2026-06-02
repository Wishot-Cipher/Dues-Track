/* eslint-disable no-empty */
/**
 * OrgDashboardPage - Multi-tenant member dashboard
 * Professional summary with progress ring, stats, quick actions, activity feed
 */

import { useState, useEffect } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { motion } from 'framer-motion';
import {
  CreditCard,
  CheckCircle,
  Clock,
  AlertCircle,
  ArrowRight,
  Plus,
  Shield,
  Users,
  Loader2,
  UserPlus,
  ChevronsLeft,
  ChevronLeft,
  ChevronRight,
  ChevronsRight,
  Calendar,
  Flame,
} from 'lucide-react';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useThemeTokens, type ThemeTokens } from '@/hooks/useThemeTokens';

interface DashboardStats {
  totalDue: number;
  totalPaid: number;
  pendingCount: number;
  approvedCount: number;
  totalPaymentTypes: number;
}

// Lightweight domain types used in this page
type Organization = {
  id: string;
  slug?: string;
  currency_symbol?: string;
  name?: string;
  payment_label?: string;
  member_label_plural?: string;
};

type User = {
  id: string;
  group_id?: string;
  full_name?: string;
};

type PaymentType = {
  id: string;
  title: string;
  amount: number | string | null;
  is_mandatory: boolean;
  deadline?: string | null;
  icon?: string | null;
  color?: string | null;
  category?: string | null;
  created_at?: string | null;
};

type Payment = {
  id: string;
  amount: number | string | null;
  status: string;
  payment_type_id: string;
  created_at?: string | null;
};

type UnpaidItem = {
  paymentType: PaymentType;
  remaining: number;
  amountPaid: number;
};

// Progress Ring SVG — theme-aware
function ProgressRing({
  progress, size = 132, strokeWidth = 10, tk,
}: { progress: number; size?: number; strokeWidth?: number; tk: ThemeTokens }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  const progressColor = progress >= 100 ? tk.mint : progress >= 50 ? tk.primary : tk.amber;
  const trackColor = tk.isLight ? 'rgba(15,7,3,0.07)' : 'rgba(255,255,255,0.07)';

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <defs>
        <linearGradient id="ring-grad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={progressColor} stopOpacity="0.95" />
          <stop offset="100%" stopColor={progressColor} stopOpacity="0.65" />
        </linearGradient>
      </defs>
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={trackColor}
        strokeWidth={strokeWidth}
        fill="none"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="url(#ring-grad)"
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
        style={{ filter: `drop-shadow(0 0 8px ${progressColor}55)` }}
      />
    </svg>
  );
}

/**
 * Compute days until a deadline (negative if past).
 * Returns null if no deadline was set.
 */
function daysUntil(deadline?: string | null): number | null {
  if (!deadline) return null;
  const d = new Date(deadline);
  if (isNaN(d.getTime())) return null;
  const ms = d.getTime() - Date.now();
  return Math.ceil(ms / (1000 * 60 * 60 * 24));
}

/** Map a "due in X days" number to an urgency band. */
function deadlineBadge(days: number | null, tk: ThemeTokens) {
  if (days === null) return null;
  if (days < 0) return { label: `${Math.abs(days)}d overdue`, color: tk.danger, icon: <Flame size={11} /> };
  if (days === 0) return { label: 'Due today', color: tk.danger, icon: <Flame size={11} /> };
  if (days <= 3) return { label: `${days}d left`, color: tk.amber, icon: <Clock size={11} /> };
  if (days <= 14) return { label: `${days}d left`, color: tk.blue, icon: <Calendar size={11} /> };
  return { label: `${days}d left`, color: tk.textTer, icon: <Calendar size={11} /> };
}

// Small paginated unpaid dues list used on Org dashboard
function UnpaidDuesList({ organization, user, unpaidPage, unpaidPerPage, setUnpaidPage, tk }: {
  organization: Organization | null | undefined;
  user: User | null | undefined;
  unpaidPage: number;
  unpaidPerPage: number;
  setUnpaidPage: Dispatch<SetStateAction<number>>;
  tk: ThemeTokens;
}) {
  const [items, setItems] = useState<UnpaidItem[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  useEffect(() => {
    if (!user?.id) return;
    try {
      const stored = localStorage.getItem(`dismissedDues_${user.id}`);
      setDismissedIds(stored ? JSON.parse(stored) : []);
    } catch {
      setDismissedIds([]);
    }
  }, [user?.id]);
  const [showDismissed, setShowDismissed] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      if (!organization || !user) return;
      setLoading(true);
      try {
        const { data: paymentTypes } = await supabase
          .from('payment_types')
          .select('id, title, amount, is_mandatory, deadline, icon, color, category, created_at')
          .eq('organization_id', organization.id)
          .eq('group_id', user.group_id)
          .eq('is_active', true);

        const { data: payments } = await supabase
          .from('payments')
          .select('id, amount, status, payment_type_id, created_at')
          .eq('member_id', user.id)
          .eq('organization_id', organization.id);

        const types: PaymentType[] = (paymentTypes as PaymentType[]) || [];
        const pays: Payment[] = (payments as Payment[]) || [];

        const unpaid: UnpaidItem[] = types.map((t) => {
          const paymentsForType = pays.filter((p) => p.payment_type_id === t.id && p.status === 'approved');
          const amountPaid = paymentsForType.reduce((s, p) => s + Number(p.amount || 0), 0);
          const remaining = Math.max(0, Number(t.amount || 0) - amountPaid);
          return {
            paymentType: t,
            remaining,
            amountPaid,
          };
        }).filter((it) => it.remaining > 0);

        // Debug: log fetched types/payments/unpaid for troubleshooting
        try {
          // eslint-disable-next-line no-console
          console.debug('OrgDashboard UnpaidDuesList loaded', {
            paymentTypes: types.map(t => ({ id: t.id, title: t.title, amount: t.amount })),
            payments: pays.slice(0, 10).map(p => ({ id: p.id, payment_type_id: p.payment_type_id, status: p.status, amount: p.amount })),
            unpaidIds: unpaid.map(u => u.paymentType.id),
          });
        } catch {}

        // Sort: items with a deadline first (most-urgent first), then by mandatory, then by recency.
        const sorted = unpaid.sort((a, b) => {
          const da = daysUntil(a.paymentType.deadline ?? null);
          const db = daysUntil(b.paymentType.deadline ?? null);
          if (da !== null && db !== null) return da - db;
          if (da !== null) return -1;
          if (db !== null) return 1;
          if (a.paymentType.is_mandatory !== b.paymentType.is_mandatory) {
            return a.paymentType.is_mandatory ? -1 : 1;
          }
          return new Date(b.paymentType.created_at || 0).getTime() - new Date(a.paymentType.created_at || 0).getTime();
        });
        if (mounted) setItems(sorted);
      } catch (err) {
        console.error('Error loading unpaid dues:', err);
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => { mounted = false; };
  }, [organization, user]);

  // respect dismissed optional dues when computing visible list
  const visibleItems = items.filter(it => it.paymentType.is_mandatory || showDismissed || !dismissedIds.includes(String(it.paymentType.id)));
  const visibleTotalPages = Math.max(1, Math.ceil(visibleItems.length / unpaidPerPage));
  useEffect(() => {
    if (unpaidPage > visibleTotalPages) setUnpaidPage(1);
  }, [visibleItems.length, visibleTotalPages, unpaidPage, setUnpaidPage]);

  const startIndex = (unpaidPage - 1) * unpaidPerPage;
  const endIndex = Math.min(visibleItems.length, startIndex + unpaidPerPage);
  const pageItems = visibleItems.slice(startIndex, endIndex);

  const scrollToTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const currency = organization?.currency_symbol || '₦';

  return (
    <div>
      {loading ? (
        <div className="p-8 text-center">
          <Loader2 size={22} className="animate-spin mx-auto" style={{ color: tk.primary }} />
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="px-6 py-10 text-center">
          <div
            className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center mb-3"
            style={{ background: `${tk.mint}18`, border: `1px solid ${tk.mint}30` }}
          >
            <CheckCircle size={24} style={{ color: tk.mint }} />
          </div>
          <p className="font-semibold text-sm" style={{ color: tk.text }}>You're all caught up</p>
          <p className="text-xs mt-1" style={{ color: tk.textTer }}>No outstanding dues right now.</p>
          {dismissedIds.length > 0 && (
            <button
              onClick={() => setShowDismissed(s => !s)}
              className="text-xs font-medium mt-4"
              style={{ color: tk.primary }}
            >
              {showDismissed ? 'Hide' : 'Show'} skipped ({dismissedIds.length})
            </button>
          )}
        </div>
      ) : (
        <div>
          {(dismissedIds.length > 0 || debugOpen) && (
            <div className="flex items-center justify-end gap-3 mb-3">
              {dismissedIds.length > 0 && (
                <button
                  onClick={() => { setShowDismissed(s => { const next = !s; try { console.debug('OrgDashboard UnpaidDuesList toggle showDismissed', { next, dismissedIds }); } catch{}; return next; }); setUnpaidPage(1); }}
                  className="text-xs font-medium"
                  style={{ color: tk.primary }}
                >
                  {showDismissed ? 'Hide' : 'Show'} skipped ({dismissedIds.length})
                </button>
              )}
              <button onClick={() => setDebugOpen(d => !d)} className="text-xs" style={{ color: tk.textTer }}>
                {debugOpen ? 'Hide' : 'Show'} debug
              </button>
            </div>
          )}

          <div className="space-y-2.5">
            {pageItems.map((it, idx) => {
              const isDismissed = dismissedIds.includes(String(it.paymentType.id));
              const isOptional = !it.paymentType.is_mandatory;
              const days = daysUntil(it.paymentType.deadline ?? null);
              const badge = deadlineBadge(days, tk);
              const accent = it.paymentType.color || (badge?.color ?? tk.primary);

              return (
                <motion.button
                  key={it.paymentType.id}
                  type="button"
                  onClick={() => navigate(`/${organization?.slug}/payments/${it.paymentType.id}`)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.04 }}
                  whileHover={{ y: -1 }}
                  whileTap={{ scale: 0.995 }}
                  className="group w-full relative overflow-hidden rounded-2xl p-3.5 sm:p-4 flex items-stretch gap-3 text-left transition-all"
                  style={{
                    background: tk.card,
                    border: `1px solid ${tk.cardBorder}`,
                    boxShadow: tk.shadow,
                  }}
                >
                  {/* Left accent rail (urgency-tinted) */}
                  <span
                    aria-hidden
                    className="absolute left-0 top-0 bottom-0 w-1"
                    style={{ background: `linear-gradient(180deg, ${accent}, ${accent}55)` }}
                  />

                  {/* Icon block */}
                  <div
                    className="shrink-0 w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center"
                    style={{
                      background: `${accent}15`,
                      color: accent,
                      border: `1px solid ${accent}28`,
                    }}
                  >
                    <CreditCard size={20} />
                  </div>

                  {/* Body */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start gap-2 flex-wrap">
                      <p className="font-semibold text-sm truncate" style={{ color: tk.text }}>
                        {it.paymentType.title}
                      </p>
                      {!isOptional && (
                        <span
                          className="text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: `${tk.primary}18`, color: tk.primary }}
                        >
                          Required
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                      {it.paymentType.category && (
                        <span className="text-[11px]" style={{ color: tk.textTer }}>
                          {it.paymentType.category}
                        </span>
                      )}
                      {it.paymentType.category && badge && (
                        <span className="w-1 h-1 rounded-full" style={{ background: tk.textTer }} />
                      )}
                      {badge && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-full"
                          style={{ color: badge.color, background: `${badge.color}18`, border: `1px solid ${badge.color}30` }}
                        >
                          {badge.icon}{badge.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount + actions */}
                  <div className="flex flex-col items-end justify-between shrink-0">
                    <p className="font-bold text-sm sm:text-base whitespace-nowrap" style={{ color: tk.text }}>
                      {currency}{Number(it.remaining).toLocaleString('en-NG')}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      {isOptional && !isDismissed && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = Array.from(new Set([...dismissedIds, String(it.paymentType.id)]));
                            setDismissedIds(next);
                            try { if (user?.id) localStorage.setItem(`dismissedDues_${user.id}`, JSON.stringify(next)); } catch {}
                            setUnpaidPage(1);
                          }}
                          className="text-[11px] font-medium"
                          style={{ color: tk.textTer }}
                        >
                          Skip
                        </span>
                      )}
                      {isOptional && isDismissed && (
                        <span
                          role="button"
                          tabIndex={0}
                          onClick={(e) => {
                            e.stopPropagation();
                            const next = dismissedIds.filter(id => id !== String(it.paymentType.id));
                            setDismissedIds(next);
                            try { if (user?.id) localStorage.setItem(`dismissedDues_${user.id}`, JSON.stringify(next)); } catch {}
                            setUnpaidPage(1);
                          }}
                          className="text-[11px] font-medium"
                          style={{ color: tk.primary }}
                        >
                          Restore
                        </span>
                      )}
                      <ArrowRight
                        size={14}
                        className="transition-transform group-hover:translate-x-0.5"
                        style={{ color: tk.primary }}
                      />
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>

          {visibleTotalPages > 1 && (
            <div
              className="mt-4 rounded-xl p-3 flex items-center justify-between gap-4"
              style={{ background: tk.overlay, border: `1px solid ${tk.cardBorder}` }}
            >
              <div className="text-xs sm:text-sm" style={{ color: tk.textTer }}>
                Showing <span className="font-semibold" style={{ color: tk.text }}>{startIndex + 1}-{endIndex}</span> of <span className="font-semibold" style={{ color: tk.text }}>{visibleItems.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setUnpaidPage(1); scrollToTop(); }} disabled={unpaidPage === 1} className="p-2 rounded-lg disabled:opacity-40" style={{ background: tk.overlay }}>
                  <ChevronsLeft className="w-4 h-4" style={{ color: tk.textSec }} />
                </button>
                <button onClick={() => { setUnpaidPage(prev => Math.max(1, prev - 1)); scrollToTop(); }} disabled={unpaidPage === 1} className="p-2 rounded-lg disabled:opacity-40" style={{ background: tk.overlay }}>
                  <ChevronLeft className="w-4 h-4" style={{ color: tk.textSec }} />
                </button>

                <div className="flex items-center gap-1 mx-2">
                  {Array.from({ length: Math.min(visibleTotalPages, 5) }, (_, i) => {
                    let pageNumber;
                    if (visibleTotalPages <= 5) pageNumber = i + 1;
                    else if (unpaidPage <= 3) pageNumber = i + 1;
                    else if (unpaidPage >= visibleTotalPages - 2) pageNumber = visibleTotalPages - 4 + i;
                    else pageNumber = unpaidPage - 2 + i;

                    const isActive = unpaidPage === pageNumber;
                    return (
                      <button
                        key={i}
                        onClick={() => { setUnpaidPage(pageNumber); scrollToTop(); }}
                        className="w-9 h-9 rounded-lg font-medium text-sm"
                        style={{
                          background: isActive ? tk.gradOrange : tk.overlay,
                          color: isActive ? '#FFFFFF' : tk.textSec,
                          boxShadow: isActive ? `0 4px 14px -4px ${tk.primary}66` : 'none',
                        }}
                      >
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>

                <button onClick={() => { setUnpaidPage(prev => Math.min(visibleTotalPages, prev + 1)); scrollToTop(); }} disabled={unpaidPage === visibleTotalPages} className="p-2 rounded-lg disabled:opacity-40" style={{ background: tk.overlay }}>
                  <ChevronRight className="w-4 h-4" style={{ color: tk.textSec }} />
                </button>
                <button onClick={() => { setUnpaidPage(visibleTotalPages); scrollToTop(); }} disabled={unpaidPage === visibleTotalPages} className="p-2 rounded-lg disabled:opacity-40" style={{ background: tk.overlay }}>
                  <ChevronsRight className="w-4 h-4" style={{ color: tk.textSec }} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {debugOpen && (
        <div className="mt-3 p-3 text-xs rounded-lg" style={{ background: tk.overlay, border: `1px solid ${tk.cardBorder}`, color: tk.textSec }}>
          <div className="font-semibold mb-2" style={{ color: tk.text }}>Debug — Unpaid Dues</div>
          <div><strong>showDismissed:</strong> {String(showDismissed)}</div>
          <div><strong>dismissedIds:</strong> {JSON.stringify(dismissedIds)}</div>
          <div><strong>items.ids:</strong> {JSON.stringify(items.map(i => String(i.paymentType.id)))}</div>
          <div><strong>visible.ids:</strong> {JSON.stringify(visibleItems.map(i => String(i.paymentType.id)))}</div>
          <div><strong>pageItems.ids:</strong> {JSON.stringify(pageItems.map(i => String(i.paymentType.id)))}</div>
          <div><strong>startIndex</strong> {startIndex} <strong>endIndex</strong> {endIndex} <strong>visibleLen</strong> {visibleItems.length}</div>
          <div><strong>localStorageKey</strong> {user?.id ? `dismissedDues_${user.id}` : 'user.id missing'}</div>
        </div>
      )}
    </div>
  );
}

export default function OrgDashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, organization, group, isAnyAdmin } = useMultiTenantAuth();
  const navigate = useNavigate();
  const tk = useThemeTokens();
  const [stats, setStats] = useState<DashboardStats>({ totalDue: 0, totalPaid: 0, pendingCount: 0, approvedCount: 0, totalPaymentTypes: 0 });
  const [recentPayments, setRecentPayments] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);
  // Unpaid dues pagination state (4 per page)
  const [unpaidPage, setUnpaidPage] = useState(1);
  const unpaidPerPage = 4;

  useEffect(() => {
    if (user && organization) fetchDashboardData();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, organization]);

  const fetchDashboardData = async () => {
    if (!user || !organization) return;
    setLoading(true);
    try {
      const { data: paymentTypes } = await supabase
        .from('payment_types')
        .select('id, title, amount, is_mandatory, deadline, icon, color, category')
        .eq('organization_id', organization.id)
        .eq('group_id', user.group_id)
        .eq('is_active', true);

      const { data: payments } = await supabase
        .from('payments')
        .select('id, amount, status, payment_type_id, created_at')
        .eq('member_id', user.id)
        .eq('organization_id', organization.id)
        .order('created_at', { ascending: false })
        .limit(10);

      const types = paymentTypes || [];
      const pays = payments || [];
      const totalDue = types.reduce((sum, t) => sum + Number(t.amount), 0);
      const approvedPayments = pays.filter(p => p.status === 'approved');
      const totalPaid = approvedPayments.reduce((sum, p) => sum + Number(p.amount), 0);
      const pendingCount = pays.filter(p => p.status === 'pending').length;

      setStats({
        totalDue,
        totalPaid,
        pendingCount,
        approvedCount: approvedPayments.length,
        totalPaymentTypes: types.length,
      });
      setRecentPayments(pays.slice(0, 5));
      setUnpaidPage(1);
    } catch (error) {
      console.error('Dashboard data error:', error);
    } finally {
      setLoading(false);
    }
  };

  const currencySymbol = organization?.currency_symbol || '₦';
  const paymentLabel = organization?.payment_label || 'Payments';
  const memberLabelPlural = organization?.member_label_plural || 'Members';

  const formatAmount = (amount: number) =>
    `${currencySymbol}${amount.toLocaleString('en-NG', { minimumFractionDigits: 0 })}`;

  const balance = Math.max(0, stats.totalDue - stats.totalPaid);
  const progressPercent = stats.totalDue > 0 ? Math.min(100, Math.round((stats.totalPaid / stats.totalDue) * 100)) : 0;

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6" style={{ color: tk.text }}>
      {/* ── Welcome Header ── */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div className="min-w-0">
          <h1 className="text-2xl sm:text-[28px] font-bold tracking-tight" style={{ color: tk.text }}>
            {greeting()}, {user?.full_name?.split(' ')[0] || 'there'} 👋
          </h1>
          <p className="text-sm mt-1 truncate" style={{ color: tk.textSec }}>
            {organization?.name} &bull; <span style={{ color: tk.textTer }}>{group?.name || '—'}</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAnyAdmin() && (
            <button
              onClick={() => navigate(`/${orgSlug}/admin/members`)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-105"
              style={{ border: `1px solid ${tk.primaryRing}`, color: tk.primary, background: tk.primarySoft }}
            >
              <UserPlus size={14} />
              <span className="hidden sm:inline">Add {organization?.member_label || 'Member'}</span>
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Hero: Payment Summary Card ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <div
          className="relative overflow-hidden rounded-3xl"
          style={{
            background: tk.card,
            border: `1px solid ${tk.cardBorder}`,
            boxShadow: tk.shadowLg,
          }}
        >
          {/* Ambient brand wash — visible in both themes */}
          <span
            aria-hidden
            className="absolute -top-24 -right-24 w-72 h-72 rounded-full pointer-events-none"
            style={{ background: tk.blob1, filter: 'blur(60px)' }}
          />
          <span
            aria-hidden
            className="absolute -bottom-32 -left-20 w-72 h-72 rounded-full pointer-events-none"
            style={{ background: tk.blob2, filter: 'blur(60px)' }}
          />

          <div className="relative p-5 sm:p-7">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Progress Ring */}
              <div className="relative shrink-0">
                {loading ? (
                  <div className="w-[132px] h-[132px] flex items-center justify-center">
                    <Loader2 size={28} className="animate-spin" style={{ color: tk.primary }} />
                  </div>
                ) : (
                  <>
                    <ProgressRing progress={progressPercent} tk={tk} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-3xl font-bold tracking-tight" style={{ color: tk.text }}>
                        {progressPercent}%
                      </span>
                      <span className="text-[10px] uppercase tracking-[0.18em] font-bold mt-0.5" style={{ color: tk.textTer }}>
                        Paid
                      </span>
                    </div>
                  </>
                )}
              </div>

              {/* Summary Details */}
              <div className="flex-1 w-full space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold mb-1" style={{ color: tk.textTer }}>
                      Total Due
                    </p>
                    <p className="text-xl sm:text-2xl font-bold tabular-nums" style={{ color: tk.text }}>
                      {loading ? '---' : formatAmount(stats.totalDue)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.14em] font-bold mb-1" style={{ color: tk.textTer }}>
                      Paid
                    </p>
                    <p className="text-xl sm:text-2xl font-bold tabular-nums" style={{ color: tk.mint }}>
                      {loading ? '---' : formatAmount(stats.totalPaid)}
                    </p>
                  </div>
                </div>

                {/* Balance bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium" style={{ color: tk.textSec }}>
                      Outstanding balance
                    </span>
                    <span
                      className="text-sm font-bold tabular-nums"
                      style={{ color: balance > 0 ? tk.danger : tk.mint }}
                    >
                      {loading ? '---' : formatAmount(balance)}
                    </span>
                  </div>
                  <div
                    className="h-2 rounded-full overflow-hidden"
                    style={{ background: tk.isLight ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.07)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: tk.gradOrange }}
                      initial={{ width: 0 }}
                      animate={{ width: `${progressPercent}%` }}
                      transition={{ duration: 1, ease: 'easeOut', delay: 0.3 }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Summary footer stats */}
          <div
            className="relative grid grid-cols-3"
            style={{ borderTop: `1px solid ${tk.cardBorder}` }}
          >
            {[
              { label: paymentLabel, value: stats.totalPaymentTypes, icon: <CreditCard size={14} />, color: tk.primary },
              { label: 'Pending', value: stats.pendingCount, icon: <Clock size={14} />, color: tk.amber },
              { label: 'Approved', value: stats.approvedCount, icon: <CheckCircle size={14} />, color: tk.mint },
            ].map((item, i) => (
              <div
                key={item.label}
                className="flex items-center justify-center gap-2 py-3.5 px-2"
                style={{ borderLeft: i === 0 ? 'none' : `1px solid ${tk.cardBorder}` }}
              >
                <span
                  className="w-7 h-7 rounded-lg flex items-center justify-center"
                  style={{ background: `${item.color}18`, color: item.color }}
                >
                  {item.icon}
                </span>
                <span className="text-sm font-bold tabular-nums" style={{ color: tk.text }}>
                  {loading ? '-' : item.value}
                </span>
                <span className="text-xs hidden sm:inline" style={{ color: tk.textTer }}>
                  {item.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      {/* ── Quick Actions Grid ── */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        {[
          {
            onClick: () => navigate(`/${orgSlug}/payments`),
            title: `View ${paymentLabel}`,
            sub: 'History & submissions',
            icon: <CreditCard size={22} />,
            color: tk.primary,
            show: true,
          },
          {
            onClick: () => navigate(`/${orgSlug}/admin/dashboard`),
            title: 'Admin Panel',
            sub: 'Review & manage',
            icon: <Shield size={22} />,
            color: tk.purple,
            show: isAnyAdmin(),
          },
          {
            onClick: () => navigate(`/${orgSlug}/admin/members`),
            title: `Manage ${memberLabelPlural}`,
            sub: 'Add & organize',
            icon: <Users size={22} />,
            color: tk.blue,
            show: isAnyAdmin(),
          },
        ].filter(a => a.show).map((a) => (
          <button
            key={a.title}
            onClick={a.onClick}
            className="group flex items-center gap-4 p-4 rounded-2xl text-left transition-all hover:-translate-y-0.5 active:scale-[0.99]"
            style={{
              background: tk.card,
              border: `1px solid ${tk.cardBorder}`,
              boxShadow: tk.shadow,
            }}
          >
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110"
              style={{ background: `${a.color}14`, color: a.color, border: `1px solid ${a.color}30` }}
            >
              {a.icon}
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm" style={{ color: tk.text }}>{a.title}</p>
              <p className="text-xs" style={{ color: tk.textTer }}>{a.sub}</p>
            </div>
            <ArrowRight
              size={16}
              className="transition-transform group-hover:translate-x-1"
              style={{ color: a.color }}
            />
          </button>
        ))}
      </motion.div>

      {/* ── What's Due (events) ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight" style={{ color: tk.text }}>
              What's due
            </h2>
            <p className="text-xs mt-0.5" style={{ color: tk.textTer }}>
              Sorted by urgency. Tap a card to pay.
            </p>
          </div>
        </div>
        <div
          className="rounded-2xl p-3 sm:p-4"
          style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, boxShadow: tk.shadow }}
        >
          <UnpaidDuesList
            organization={organization}
            user={user}
            unpaidPage={unpaidPage}
            unpaidPerPage={unpaidPerPage}
            setUnpaidPage={setUnpaidPage}
            tk={tk}
          />
        </div>
      </motion.div>

      {/* ── Recent Activity ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight" style={{ color: tk.text }}>
              Recent activity
            </h2>
            <p className="text-xs mt-0.5" style={{ color: tk.textTer }}>
              Your last few submissions.
            </p>
          </div>
          {recentPayments.length > 0 && (
            <button
              onClick={() => navigate(`/${orgSlug}/payments`)}
              className="text-xs font-medium flex items-center gap-1 transition-all hover:gap-2 px-3 py-2 rounded-xl"
              style={{ color: tk.primary, background: tk.primarySoft }}
            >
              View all <ArrowRight size={12} />
            </button>
          )}
        </div>
        <div
          className="rounded-2xl overflow-hidden"
          style={{ background: tk.card, border: `1px solid ${tk.cardBorder}`, boxShadow: tk.shadow }}
        >
          {loading ? (
            <div className="p-10 text-center">
              <Loader2 size={24} className="animate-spin mx-auto mb-2" style={{ color: tk.primary }} />
              <p className="text-sm" style={{ color: tk.textTer }}>Loading activity...</p>
            </div>
          ) : recentPayments.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div
                className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center"
                style={{ background: tk.primarySoft, border: `1px solid ${tk.primaryRing}` }}
              >
                <CreditCard size={28} style={{ color: tk.primary }} />
              </div>
              <div>
                <p className="font-semibold" style={{ color: tk.text }}>No activity yet</p>
                <p className="text-sm mt-1" style={{ color: tk.textTer }}>
                  Your payment activity will appear here.
                </p>
              </div>
              <button
                onClick={() => navigate(`/${orgSlug}/payments`)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105"
                style={{ color: '#FFFFFF', background: tk.gradOrange, boxShadow: `0 8px 22px -8px ${tk.primary}` }}
              >
                <Plus size={16} />
                Submit a payment
              </button>
            </div>
          ) : (
            <div className="divide-y" style={{ borderColor: tk.cardBorder }}>
            {recentPayments.map((payment, idx) => {
              const statusColors: Record<string, string> = {
                approved: tk.mint,
                pending: tk.amber,
                rejected: tk.danger,
              };
              const statusIcons: Record<string, React.ReactNode> = {
                approved: <CheckCircle size={14} />,
                pending: <Clock size={14} />,
                rejected: <AlertCircle size={14} />,
              };
              const statusColor = statusColors[payment.status as string] || tk.textTer;
              return (
                <motion.div
                  key={payment.id as string}
                  className="flex items-center justify-between px-4 sm:px-5 py-3.5 transition-colors"
                  style={{ borderColor: tk.cardBorder }}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                      style={{ background: `${statusColor}18`, color: statusColor, border: `1px solid ${statusColor}30` }}
                    >
                      {statusIcons[payment.status as string] || <CreditCard size={14} />}
                    </div>
                    <div>
                      <p className="text-sm font-semibold tabular-nums" style={{ color: tk.text }}>
                        {formatAmount(payment.amount as number)}
                      </p>
                      <p className="text-xs" style={{ color: tk.textTer }}>
                        {new Date(payment.created_at as string).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                    style={{ color: statusColor, background: `${statusColor}18`, border: `1px solid ${statusColor}30` }}
                  >
                    {payment.status as string}
                  </span>
                </motion.div>
              );
            })}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
