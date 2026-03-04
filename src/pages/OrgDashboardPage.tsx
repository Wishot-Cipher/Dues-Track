/**
 * OrgDashboardPage - Multi-tenant member dashboard
 * Professional summary with progress ring, stats, quick actions, activity feed
 */

import { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { colors } from '@/config/colors';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useNavigate, useParams } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import GlassCard from '@/components/ui/GlassCard';

interface DashboardStats {
  totalDue: number;
  totalPaid: number;
  pendingCount: number;
  approvedCount: number;
  totalPaymentTypes: number;
}

// Progress Ring SVG component
function ProgressRing({ progress, size = 120, strokeWidth = 8 }: { progress: number; size?: number; strokeWidth?: number }) {
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (progress / 100) * circumference;
  const progressColor = progress >= 100 ? colors.success : progress >= 50 ? colors.primary : colors.warning;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke="rgba(255,255,255,0.06)"
        strokeWidth={strokeWidth}
        fill="none"
      />
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        stroke={progressColor}
        strokeWidth={strokeWidth}
        fill="none"
        strokeLinecap="round"
        strokeDasharray={circumference}
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 1.2, ease: 'easeOut' }}
      />
    </svg>
  );
}

export default function OrgDashboardPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, organization, group, isAnyAdmin } = useMultiTenantAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({ totalDue: 0, totalPaid: 0, pendingCount: 0, approvedCount: 0, totalPaymentTypes: 0 });
  const [recentPayments, setRecentPayments] = useState<Array<Record<string, unknown>>>([]);
  const [loading, setLoading] = useState(true);

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
                    <ProgressRing progress={progressPercent} />
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
