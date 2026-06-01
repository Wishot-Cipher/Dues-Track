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
import { colors } from '@/config/colors';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import GlassCard from '@/components/ui/GlassCard';
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

        if (mounted) setItems(unpaid.sort((a, b) => new Date(a.paymentType.created_at || 0).getTime() - new Date(b.paymentType.created_at || 0).getTime()));
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

  return (
    <div>
      {loading ? (
        <div className="p-6 text-center">
          <Loader2 size={20} className="animate-spin mx-auto" style={{ color: colors.primary }} />
        </div>
      ) : visibleItems.length === 0 ? (
        <div className="p-6 text-center text-sm" style={{ color: colors.textTertiary }}>
          <div>No unpaid dues</div>
          {dismissedIds.length > 0 && (
            <div className="mt-3">
              <button
                onClick={() => setShowDismissed(s => !s)}
                className="text-xs font-medium"
                style={{ color: colors.primary }}
              >
                {showDismissed ? 'Hide' : 'Show'} Skipped ({dismissedIds.length})
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div />
            {dismissedIds.length > 0 && (
              <button
                onClick={() => { setShowDismissed(s => { const next = !s; try { console.debug('OrgDashboard UnpaidDuesList toggle showDismissed', { next, dismissedIds }); } catch{}; return next; }); setUnpaidPage(1); }}
                className="text-xs font-medium"
                style={{ color: colors.primary }}
              >
                {showDismissed ? 'Hide' : 'Show'} Skipped ({dismissedIds.length})
              </button>
            )}
            <div>
              <button onClick={() => setDebugOpen(d => !d)} className="text-xs ml-3" style={{ color: colors.textTertiary }}>{debugOpen ? 'Hide' : 'Show'} debug</button>
            </div>
          </div>
          <div className="space-y-3">
            {pageItems.map((it) => {
              const isDismissed = dismissedIds.includes(String(it.paymentType.id));
              const isOptional = !it.paymentType.is_mandatory;
              const days = daysUntil(it.paymentType.deadline ?? null);
              const badge = deadlineBadge(days, tk);
              return (
              <div key={it.paymentType.id} className="p-3 rounded-xl bg-white/3 flex items-start justify-between">
                <div className="min-w-0">
                  <p className="font-semibold text-white text-sm truncate">{it.paymentType.title}</p>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <p className="text-xs" style={{ color: colors.textTertiary }}>{it.paymentType.category || '—'}</p>
                    {badge && (
                      <span
                        className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full"
                        style={{ color: badge.color, background: `${badge.color}1a`, border: `1px solid ${badge.color}35` }}
                      >
                        {badge.icon}{badge.label}
                      </span>
                    )}
                  </div>
                </div>
                <div className="text-right">
                  <p className="font-bold text-white">{organization?.currency_symbol || '₦'}{Number(it.remaining).toLocaleString('en-NG')}</p>
                  <div className="flex items-center justify-end gap-3">
                    <button
                      onClick={() => navigate(`/${organization?.slug}/payments/${it.paymentType.id}`)}
                      className="mt-2 text-xs font-medium"
                      style={{ color: colors.primary }}
                    >
                      View
                    </button>
                    {isOptional && !isDismissed && (
                      <button
                        onClick={() => {
                          const next = Array.from(new Set([...dismissedIds, String(it.paymentType.id)]));
                          setDismissedIds(next);
                          try { if (user?.id) localStorage.setItem(`dismissedDues_${user.id}`, JSON.stringify(next)); } catch {}
                          try { console.debug('OrgDashboard UnpaidDuesList skip', { added: it.paymentType.id, next }); } catch {}
                          setUnpaidPage(1);
                        }}
                        className="mt-2 text-xs font-medium opacity-80"
                        style={{ color: colors.textTertiary }}
                      >
                        Skip
                      </button>
                    )}
                    {isOptional && isDismissed && (
                      <button
                        onClick={() => {
                          const next = dismissedIds.filter(id => id !== String(it.paymentType.id));
                          setDismissedIds(next);
                          try { if (user?.id) localStorage.setItem(`dismissedDues_${user.id}`, JSON.stringify(next)); } catch {}
                          try { console.debug('OrgDashboard UnpaidDuesList restore', { removed: it.paymentType.id, next }); } catch {}
                          setUnpaidPage(1);
                        }}
                        className="mt-2 text-xs font-medium"
                        style={{ color: colors.primary }}
                      >
                        Restore
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )})}
          </div>

          {visibleTotalPages > 1 && (
            <div className="mt-4 rounded-xl p-3 flex items-center justify-between gap-4" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
              <div className="text-sm" style={{ color: colors.textTertiary }}>
                Showing <span className="font-semibold text-white">{startIndex + 1}-{endIndex}</span> of <span className="font-semibold text-white">{visibleItems.length}</span>
              </div>
              <div className="flex items-center gap-1">
                <button onClick={() => { setUnpaidPage(1); scrollToTop(); }} disabled={unpaidPage === 1} className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <ChevronsLeft className="w-4 h-4" style={{ color: colors.textTertiary }} />
                </button>
                <button onClick={() => { setUnpaidPage(prev => Math.max(1, prev - 1)); scrollToTop(); }} disabled={unpaidPage === 1} className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <ChevronLeft className="w-4 h-4" style={{ color: colors.textTertiary }} />
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
                      <button key={i} onClick={() => { setUnpaidPage(pageNumber); scrollToTop(); }} className="w-9 h-9 rounded-lg font-medium text-sm" style={{ background: isActive ? 'linear-gradient(135deg,' + colors.primary + ', ' + colors.success + ')' : 'rgba(255,255,255,0.05)', color: isActive ? 'white' : colors.textTertiary }}>
                        {pageNumber}
                      </button>
                    );
                  })}
                </div>

                <button onClick={() => { setUnpaidPage(prev => Math.min(visibleTotalPages, prev + 1)); scrollToTop(); }} disabled={unpaidPage === visibleTotalPages} className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <ChevronRight className="w-4 h-4" style={{ color: colors.textTertiary }} />
                </button>
                <button onClick={() => { setUnpaidPage(visibleTotalPages); scrollToTop(); }} disabled={unpaidPage === visibleTotalPages} className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                  <ChevronsRight className="w-4 h-4" style={{ color: colors.textTertiary }} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
      {debugOpen && (
        <div className="mt-3 p-3 text-xs rounded-lg" style={{ background: 'rgba(0,0,0,0.5)', border: '1px solid rgba(255,255,255,0.05)', color: colors.textTertiary }}>
          <div className="font-semibold text-white mb-2">Debug — Unpaid Dues</div>
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
    <div className="max-w-7xl mx-auto px-4 py-6 space-y-6">
      {/* ── Welcome Header ── */}
      <motion.div
        className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <h1 className="text-2xl font-bold text-white">
            {greeting()}, {user?.full_name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm mt-1" style={{ color: colors.textTertiary }}>
            {organization?.name} &bull; {group?.name || '—'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {isAnyAdmin() && (
            <button
              onClick={() => navigate(`/${orgSlug}/admin/members`)}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium transition-all hover:scale-105"
              style={{ border: `1px solid ${colors.borderPrimary}`, color: colors.primary }}
            >
              <UserPlus size={14} />
              <span className="hidden sm:inline">Add {organization?.member_label || 'Member'}</span>
            </button>
          )}
        </div>
      </motion.div>

      {/* ── Payment Summary Card (the hero) ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <GlassCard intensity="medium" className="p-0 overflow-hidden">
          <div className="p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row items-center gap-6">
              {/* Progress Ring */}
              <div className="relative shrink-0">
                {loading ? (
                  <div className="w-[120px] h-[120px] flex items-center justify-center">
                    <Loader2 size={28} className="animate-spin" style={{ color: colors.primary }} />
                  </div>
                ) : (
                  <>
                    <ProgressRing progress={progressPercent} tk={tk} />
                    <div className="absolute inset-0 flex flex-col items-center justify-center">
                      <span className="text-2xl font-bold text-white">{progressPercent}%</span>
                      <span className="text-[10px] uppercase tracking-wider" style={{ color: colors.textTertiary }}>
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
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Total Due</p>
                    <p className="text-xl sm:text-2xl font-bold text-white">{loading ? '---' : formatAmount(stats.totalDue)}</p>
                  </div>
                  <div>
                    <p className="text-xs uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>Paid</p>
                    <p className="text-xl sm:text-2xl font-bold" style={{ color: colors.success }}>{loading ? '---' : formatAmount(stats.totalPaid)}</p>
                  </div>
                </div>

                {/* Balance bar */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-xs font-medium" style={{ color: colors.textTertiary }}>Outstanding Balance</span>
                    <span className="text-sm font-bold" style={{ color: balance > 0 ? colors.error : colors.success }}>
                      {loading ? '---' : formatAmount(balance)}
                    </span>
                  </div>
                  <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.success})` }}
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
            className="grid grid-cols-3 divide-x"
            style={{ borderTop: `1px solid ${colors.borderLight}`, borderColor: 'rgba(255,255,255,0.06)' }}
          >
            {[
              { label: paymentLabel, value: stats.totalPaymentTypes, icon: <CreditCard size={14} />, color: colors.primary },
              { label: 'Pending', value: stats.pendingCount, icon: <Clock size={14} />, color: colors.warning },
              { label: 'Approved', value: stats.approvedCount, icon: <CheckCircle size={14} />, color: colors.success },
            ].map((item) => (
              <div key={item.label} className="flex items-center justify-center gap-2 py-3 px-2" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
                <div style={{ color: item.color }}>{item.icon}</div>
                <span className="text-sm font-semibold text-white">{loading ? '-' : item.value}</span>
                <span className="text-xs hidden sm:inline" style={{ color: colors.textTertiary }}>{item.label}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </motion.div>

      {/* ── Quick Actions Grid ── */}
      <motion.div
        className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <button
          onClick={() => navigate(`/${orgSlug}/payments`)}
          className="group flex items-center gap-4 p-4 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.98]"
          style={{ background: `${colors.primary}08`, border: `1px solid ${colors.borderPrimary}` }}
        >
          <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: `${colors.primary}18`, color: colors.primary }}>
            <CreditCard size={22} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-medium text-sm text-white">View {paymentLabel}</p>
            <p className="text-xs" style={{ color: colors.textTertiary }}>History & submissions</p>
          </div>
          <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" style={{ color: colors.textTertiary }} />
        </button>

        {isAnyAdmin() && (
          <>
            <button
              onClick={() => navigate(`/${orgSlug}/admin/dashboard`)}
              className="group flex items-center gap-4 p-4 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.98]"
              style={{ background: `${colors.accentPurple}08`, border: `1px solid ${colors.accentPurple}25` }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: `${colors.accentPurple}15`, color: colors.accentPurple }}>
                <Shield size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-white">Admin Panel</p>
                <p className="text-xs" style={{ color: colors.textTertiary }}>Review & manage</p>
              </div>
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" style={{ color: colors.textTertiary }} />
            </button>

            <button
              onClick={() => navigate(`/${orgSlug}/admin/members`)}
              className="group flex items-center gap-4 p-4 rounded-2xl text-left transition-all hover:scale-[1.01] active:scale-[0.98]"
              style={{ background: `${colors.accentCyan}06`, border: `1px solid ${colors.accentCyan}20` }}
            >
              <div className="w-11 h-11 rounded-xl flex items-center justify-center transition-transform group-hover:scale-110" style={{ background: `${colors.accentCyan}12`, color: colors.accentCyan }}>
                <Users size={22} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-sm text-white">Manage {memberLabelPlural}</p>
                <p className="text-xs" style={{ color: colors.textTertiary }}>Add & organize</p>
              </div>
              <ArrowRight size={16} className="transition-transform group-hover:translate-x-1" style={{ color: colors.textTertiary }} />
            </button>
          </>
        )}
      </motion.div>

      {/* ── Unpaid Dues (paginated) ── */}
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.25 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Unpaid Dues</h2>
          <div className="text-sm" style={{ color: colors.textTertiary }}>{/* summary */}</div>
        </div>
        <GlassCard>
          <div className="p-3">
            <UnpaidDuesList
              organization={organization}
              user={user}
              unpaidPage={unpaidPage}
              unpaidPerPage={unpaidPerPage}
              setUnpaidPage={setUnpaidPage}
              tk={tk}
            />
          </div>
        </GlassCard>
      </motion.div>

      {/* ── Recent Activity ── */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.3 }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-white">Recent Activity</h2>
          {recentPayments.length > 0 && (
            <button
              onClick={() => navigate(`/${orgSlug}/payments`)}
              className="text-xs font-medium flex items-center gap-1 transition-all hover:gap-2"
              style={{ color: colors.primary }}
            >
              View All <ArrowRight size={12} />
            </button>
          )}
        </div>
        <GlassCard className="divide-y divide-white/5">
          {loading ? (
            <div className="p-10 text-center">
              <Loader2 size={24} className="animate-spin mx-auto mb-2" style={{ color: colors.primary }} />
              <p className="text-sm" style={{ color: colors.textTertiary }}>Loading activity...</p>
            </div>
          ) : recentPayments.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <div className="w-14 h-14 rounded-2xl mx-auto flex items-center justify-center" style={{ background: `${colors.primary}10` }}>
                <CreditCard size={28} style={{ color: colors.textDisabled }} />
              </div>
              <div>
                <p className="font-medium text-white">No activity yet</p>
                <p className="text-sm mt-1" style={{ color: colors.textTertiary }}>
                  Your payment activity will appear here
                </p>
              </div>
              <button
                onClick={() => navigate(`/${orgSlug}/payments`)}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all hover:scale-105"
                style={{ color: colors.primary, border: `1px solid ${colors.borderPrimary}` }}
              >
                <Plus size={16} />
                Submit a Payment
              </button>
            </div>
          ) : (
            recentPayments.map((payment, idx) => {
              const statusColors: Record<string, string> = {
                approved: colors.success,
                pending: colors.warning,
                rejected: colors.error,
              };
              const statusIcons: Record<string, React.ReactNode> = {
                approved: <CheckCircle size={14} />,
                pending: <Clock size={14} />,
                rejected: <AlertCircle size={14} />,
              };
              const statusColor = statusColors[payment.status as string] || colors.textTertiary;
              return (
                <motion.div
                  key={payment.id as string}
                  className="flex items-center justify-between px-4 sm:px-5 py-3.5 hover:bg-white/2 transition-colors"
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${statusColor}12`, color: statusColor }}
                    >
                      {statusIcons[payment.status as string] || <CreditCard size={14} />}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-white">
                        {formatAmount(payment.amount as number)}
                      </p>
                      <p className="text-xs" style={{ color: colors.textTertiary }}>
                        {new Date(payment.created_at as string).toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'short', year: 'numeric',
                        })}
                      </p>
                    </div>
                  </div>
                  <span
                    className="text-xs font-semibold px-2.5 py-1 rounded-full capitalize"
                    style={{ color: statusColor, background: `${statusColor}12` }}
                  >
                    {payment.status as string}
                  </span>
                </motion.div>
              );
            })
          )}
        </GlassCard>
      </motion.div>
    </div>
  );
}
