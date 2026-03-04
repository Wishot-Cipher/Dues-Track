/**
 * BillingPage - Subscription management for organization admins
 * Shows current plan, usage stats, plan comparison, and payment history.
 * Integrates with Paystack for plan upgrades.
 */

import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  CreditCard,
  Check,
  X,
  Crown,
  Zap,
  Shield,
  Users,
  FolderTree,
  UserCog,
  Clock,
  AlertTriangle,
  Loader2,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  Star,
  Receipt,
  ExternalLink,
} from 'lucide-react';
import { colors } from '@/config/colors';
import { getOrgScope } from '@/utils/orgScope';
import { billingService, type BillingTransaction, type SubscriptionStatus } from '@/services/billingService';
import { SUBSCRIPTION_PLANS } from '@/types/multiTenant';
import type { SubscriptionTier, SubscriptionFeatures } from '@/types/multiTenant';
import { useToast } from '@/hooks/useToast';
import PageWrapper from '@/components/ui/PageWrapper';

// Paystack inline type (loaded via script)
declare global {
  interface Window {
    PaystackPop?: {
      setup: (config: {
        key: string;
        email: string;
        amount: number;
        currency: string;
        ref: string;
        metadata?: Record<string, unknown>;
        callback: (response: { reference: string }) => void;
        onClose: () => void;
      }) => { openIframe: () => void };
    };
  }
}

const PLAN_ORDER: SubscriptionTier[] = ['free', 'starter', 'professional', 'enterprise'];

const PLAN_ICONS: Record<SubscriptionTier, React.ReactNode> = {
  free: <Zap size={20} />,
  starter: <Star size={20} />,
  professional: <Crown size={20} />,
  enterprise: <Shield size={20} />,
};

const PLAN_COLORS: Record<SubscriptionTier, string> = {
  free: '#6B7280',
  starter: '#3B82F6',
  professional: '#FF6803',
  enterprise: '#8B5CF6',
};

const FEATURE_LABELS: Record<keyof SubscriptionFeatures, string> = {
  custom_branding: 'Custom Branding',
  email_notifications: 'Email Notifications',
  sms_notifications: 'SMS Notifications',
  whatsapp_notifications: 'WhatsApp Notifications',
  online_payments: 'Online Payments',
  api_access: 'API Access',
  data_export: 'Data Export',
  advanced_analytics: 'Advanced Analytics',
  audit_logs: 'Audit Logs',
  priority_support: 'Priority Support',
  custom_domain: 'Custom Domain',
  white_label: 'White Label',
  multi_currency: 'Multi-Currency',
  recurring_payments: 'Recurring Payments',
  bulk_import: 'Bulk Import',
  public_donation_page: 'Public Donation Page',
};

export default function BillingPage() {
  const toast = useToast();
  const scope = getOrgScope();
  const orgId = scope?.orgId;

  const [status, setStatus] = useState<SubscriptionStatus | null>(null);
  const [transactions, setTransactions] = useState<BillingTransaction[]>([]);
  const [loading, setLoading] = useState(true);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [processingPlan, setProcessingPlan] = useState<SubscriptionTier | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [paystackLoaded, setPaystackLoaded] = useState(false);
  const [currency] = useState('NGN');

  // Load Paystack inline script
  useEffect(() => {
    if (document.getElementById('paystack-script')) {
      setPaystackLoaded(true);
      return;
    }
    const script = document.createElement('script');
    script.id = 'paystack-script';
    script.src = 'https://js.paystack.co/v1/inline.js';
    script.async = true;
    script.onload = () => setPaystackLoaded(true);
    document.head.appendChild(script);
  }, []);

  const loadData = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [statusResult, transResult] = await Promise.all([
        billingService.getSubscriptionStatus(orgId),
        billingService.getTransactions(orgId),
      ]);
      setStatus(statusResult);
      setTransactions(transResult);
    } catch (error) {
      console.error('Error loading billing data:', error);
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpgrade = async (planId: SubscriptionTier) => {
    if (!orgId || !status) return;

    if (planId === 'enterprise') {
      toast.info('Enterprise plans require custom pricing. Contact us at support@payvexo.com');
      return;
    }

    if (planId === 'free') return;

    if (!billingService.isPaystackConfigured()) {
      toast.error('Payment system is not configured. Please contact the administrator.');
      return;
    }

    if (!paystackLoaded || !window.PaystackPop) {
      toast.error('Payment system is loading. Please try again in a moment.');
      return;
    }

    setProcessingPlan(planId);

    try {
      // Get email from org scope or prompt
      const email = prompt('Enter your email for payment receipt:');
      if (!email) {
        setProcessingPlan(null);
        return;
      }

      const payerName = 'Organization Admin';

      const result = await billingService.initiatePayment({
        orgId,
        planId,
        billingCycle,
        email,
        payerName,
        currency,
        memberId: scope?.memberId,
      });

      if (!result) {
        toast.error('Failed to initiate payment. Please try again.');
        setProcessingPlan(null);
        return;
      }

      // Open Paystack popup
      const handler = window.PaystackPop!.setup({
        key: result.publicKey,
        email,
        amount: result.amount,
        currency,
        ref: result.reference,
        metadata: {
          organization_id: orgId,
          plan_id: planId,
          billing_cycle: billingCycle,
        },
        callback: async (response) => {
          // Payment completed — verify
          toast.info('Verifying payment...');
          const verifyResult = await billingService.verifyAndUpgrade(response.reference);
          if (verifyResult.success) {
            toast.success(verifyResult.message);
            loadData(); // Refresh
          } else {
            toast.error(verifyResult.message);
          }
          setProcessingPlan(null);
        },
        onClose: () => {
          toast.info('Payment cancelled');
          setProcessingPlan(null);
        },
      });

      handler.openIframe();
    } catch (error) {
      console.error('Payment error:', error);
      toast.error('An error occurred. Please try again.');
      setProcessingPlan(null);
    }
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-NG', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getUsagePercent = (current: number, limit: number) => {
    if (limit === -1) return 0;
    return Math.min(100, Math.round((current / limit) * 100));
  };

  const getUsageColor = (percent: number) => {
    if (percent >= 90) return '#EF4444';
    if (percent >= 70) return '#F59E0B';
    return '#10B981';
  };

  if (loading) {
    return (
      <PageWrapper>
        <div className="flex items-center justify-center py-20">
          <Loader2 size={24} className="animate-spin" style={{ color: colors.primary }} />
        </div>
      </PageWrapper>
    );
  }

  if (!status) {
    return (
      <PageWrapper>
        <div className="text-center py-20">
          <AlertTriangle size={32} className="mx-auto mb-3 text-yellow-400" />
          <p className="text-white">Unable to load billing information</p>
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
            <CreditCard size={20} style={{ color: colors.primary }} />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white">Billing & Subscription</h1>
            <p className="text-sm" style={{ color: colors.textTertiary }}>
              Manage your plan, view usage, and payment history
            </p>
          </div>
        </div>

        {/* Current Plan Card */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${PLAN_COLORS[status.planId]}18, ${PLAN_COLORS[status.planId]}08)`,
            border: `1px solid ${PLAN_COLORS[status.planId]}40`,
          }}
        >
          <div className="p-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-xl flex items-center justify-center text-white"
                  style={{ background: PLAN_COLORS[status.planId] }}
                >
                  {PLAN_ICONS[status.planId]}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-lg font-bold text-white">{status.plan.name} Plan</h2>
                    {status.isTrial && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-yellow-500/20 text-yellow-400 uppercase">
                        Trial
                      </span>
                    )}
                    {status.isActive && !status.isTrial && status.planId !== 'free' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-green-500/20 text-green-400 uppercase">
                        Active
                      </span>
                    )}
                    {!status.isActive && status.planId !== 'free' && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-red-500/20 text-red-400 uppercase">
                        Expired
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: colors.textTertiary }}>
                    {status.plan.tagline}
                  </p>
                </div>
              </div>

              {(status.isTrial || (status.expiresAt && status.planId !== 'free')) && (
                <div className="text-right">
                  <div className="flex items-center gap-1.5">
                    <Clock size={14} style={{ color: status.daysRemaining <= 7 ? '#EF4444' : colors.textTertiary }} />
                    <span
                      className="text-sm font-semibold"
                      style={{ color: status.daysRemaining <= 7 ? '#EF4444' : colors.textSecondary }}
                    >
                      {status.daysRemaining} days left
                    </span>
                  </div>
                  {status.expiresAt && (
                    <p className="text-[10px] mt-0.5" style={{ color: colors.textTertiary }}>
                      {status.isTrial ? 'Trial ends' : 'Renews'} {formatDate(status.expiresAt)}
                    </p>
                  )}
                </div>
              )}
            </div>

            {/* Expiry Warning */}
            {status.daysRemaining <= 7 && status.daysRemaining > 0 && status.planId !== 'free' && (
              <div className="mt-4 p-3 rounded-xl bg-red-500/10 border border-red-500/20 flex items-center gap-2">
                <AlertTriangle size={16} className="text-red-400 shrink-0" />
                <p className="text-xs text-red-400">
                  Your {status.isTrial ? 'trial' : 'subscription'} expires in {status.daysRemaining} day{status.daysRemaining !== 1 ? 's' : ''}.
                  {status.isTrial ? ' Upgrade now to keep your features.' : ' Renew to avoid service interruption.'}
                </p>
              </div>
            )}
          </div>

          {/* Usage Stats */}
          <div className="px-5 pb-5">
            <p className="text-xs font-semibold uppercase tracking-wide mb-3" style={{ color: colors.textSecondary }}>
              Current Usage
            </p>
            <div className="grid grid-cols-3 gap-3">
              {([
                { label: 'Members', icon: <Users size={14} />, current: status.usage.members, limit: status.usage.membersLimit },
                { label: 'Groups', icon: <FolderTree size={14} />, current: status.usage.groups, limit: status.usage.groupsLimit },
                { label: 'Admins', icon: <UserCog size={14} />, current: status.usage.admins, limit: status.usage.adminsLimit },
              ]).map(({ label, icon, current, limit }) => {
                const percent = getUsagePercent(current, limit);
                const usageColor = getUsageColor(percent);
                return (
                  <div
                    key={label}
                    className="p-3 rounded-xl"
                    style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  >
                    <div className="flex items-center gap-1.5 mb-2" style={{ color: colors.textSecondary }}>
                      {icon}
                      <span className="text-[10px] font-medium uppercase tracking-wide">{label}</span>
                    </div>
                    <p className="text-lg font-bold text-white">
                      {current}
                      <span className="text-xs font-normal ml-1" style={{ color: colors.textTertiary }}>
                        / {limit === -1 ? '∞' : limit}
                      </span>
                    </p>
                    {limit !== -1 && (
                      <div className="mt-2 h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.06)' }}>
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{ width: `${percent}%`, background: usageColor }}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Billing Cycle Toggle */}
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={() => setBillingCycle('monthly')}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: billingCycle === 'monthly' ? colors.primary : 'transparent',
              color: billingCycle === 'monthly' ? 'white' : colors.textSecondary,
              border: `1px solid ${billingCycle === 'monthly' ? colors.primary : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            Monthly
          </button>
          <button
            onClick={() => setBillingCycle('yearly')}
            className="px-4 py-2 rounded-xl text-sm font-medium transition-all flex items-center gap-1.5"
            style={{
              background: billingCycle === 'yearly' ? colors.primary : 'transparent',
              color: billingCycle === 'yearly' ? 'white' : colors.textSecondary,
              border: `1px solid ${billingCycle === 'yearly' ? colors.primary : 'rgba(255,255,255,0.1)'}`,
            }}
          >
            Yearly
            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-400">
              Save 20%
            </span>
          </button>
        </div>

        {/* Plan Comparison */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {PLAN_ORDER.map(planId => {
            const plan = SUBSCRIPTION_PLANS[planId];
            const isCurrent = planId === status.planId;
            const isUpgrade = PLAN_ORDER.indexOf(planId) > PLAN_ORDER.indexOf(status.planId);
            const price = billingService.getPrice(plan, billingCycle, currency);
            const planColor = PLAN_COLORS[planId];

            return (
              <motion.div
                key={planId}
                initial={{ opacity: 0, y: 15 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: PLAN_ORDER.indexOf(planId) * 0.1 }}
                className="rounded-2xl overflow-hidden relative"
                style={{
                  background: isCurrent ? `${planColor}12` : 'rgba(255,255,255,0.02)',
                  border: `1.5px solid ${isCurrent ? planColor : 'rgba(255,255,255,0.06)'}`,
                }}
              >
                {plan.is_popular && (
                  <div
                    className="absolute top-0 right-0 px-2.5 py-1 rounded-bl-xl text-[10px] font-bold text-white"
                    style={{ background: planColor }}
                  >
                    {plan.badge}
                  </div>
                )}
                <div className="p-4">
                  <div className="flex items-center gap-2 mb-1">
                    <span style={{ color: planColor }}>{PLAN_ICONS[planId]}</span>
                    <h3 className="font-bold text-white">{plan.name}</h3>
                  </div>
                  <p className="text-[11px] mb-4" style={{ color: colors.textTertiary }}>{plan.tagline}</p>

                  {/* Price */}
                  <div className="mb-4">
                    {planId === 'enterprise' ? (
                      <p className="text-lg font-bold text-white">Custom</p>
                    ) : planId === 'free' ? (
                      <p className="text-2xl font-bold text-white">Free</p>
                    ) : (
                      <>
                        <p className="text-2xl font-bold text-white">
                          {price.formattedAmount}
                          <span className="text-xs font-normal" style={{ color: colors.textTertiary }}>
                            /{billingCycle === 'monthly' ? 'mo' : 'yr'}
                          </span>
                        </p>
                        {price.savings && (
                          <p className="text-[10px] mt-0.5 text-green-400">{price.savings}</p>
                        )}
                      </>
                    )}
                  </div>

                  {/* Limits */}
                  <div className="space-y-1.5 text-xs mb-4">
                    <div className="flex items-center gap-2" style={{ color: colors.textSecondary }}>
                      <Users size={12} />
                      <span>{plan.max_members === -1 ? 'Unlimited' : plan.max_members} members</span>
                    </div>
                    <div className="flex items-center gap-2" style={{ color: colors.textSecondary }}>
                      <FolderTree size={12} />
                      <span>{plan.max_groups === -1 ? 'Unlimited' : plan.max_groups} groups</span>
                    </div>
                    <div className="flex items-center gap-2" style={{ color: colors.textSecondary }}>
                      <UserCog size={12} />
                      <span>{plan.max_admins === -1 ? 'Unlimited' : plan.max_admins} admins</span>
                    </div>
                  </div>

                  {/* Key Features */}
                  <div className="space-y-1 text-[11px]">
                    {(Object.keys(FEATURE_LABELS) as (keyof SubscriptionFeatures)[]).slice(0, 6).map(feat => (
                      <div key={feat} className="flex items-center gap-1.5">
                        {plan.features[feat] ? (
                          <Check size={12} className="text-green-400 shrink-0" />
                        ) : (
                          <X size={12} className="text-gray-600 shrink-0" />
                        )}
                        <span style={{ color: plan.features[feat] ? colors.textSecondary : 'rgba(255,255,255,0.2)' }}>
                          {FEATURE_LABELS[feat]}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* Action Button */}
                  <div className="mt-4">
                    {isCurrent ? (
                      <div
                        className="w-full py-2.5 rounded-xl text-sm font-medium text-center"
                        style={{ background: `${planColor}15`, color: planColor, border: `1px solid ${planColor}40` }}
                      >
                        Current Plan
                      </div>
                    ) : isUpgrade ? (
                      <button
                        onClick={() => handleUpgrade(planId)}
                        disabled={!!processingPlan}
                        className="w-full py-2.5 rounded-xl text-sm font-semibold text-white flex items-center justify-center gap-1.5 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                        style={{ background: planColor }}
                      >
                        {processingPlan === planId ? (
                          <>
                            <Loader2 size={14} className="animate-spin" />
                            Processing...
                          </>
                        ) : planId === 'enterprise' ? (
                          <>
                            Contact Sales
                            <ExternalLink size={14} />
                          </>
                        ) : (
                          <>
                            Upgrade
                            <ArrowRight size={14} />
                          </>
                        )}
                      </button>
                    ) : (
                      <div
                        className="w-full py-2.5 rounded-xl text-sm text-center"
                        style={{ color: colors.textTertiary }}
                      >
                        —
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            );
          })}
        </div>

        {/* Full Feature Comparison */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <div className="p-4">
            <h3 className="font-semibold text-white text-sm flex items-center gap-2">
              <Check size={16} style={{ color: colors.primary }} />
              Full Feature Comparison
            </h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr style={{ borderBottom: '1px solid rgba(255,255,255,0.06)' }}>
                  <th className="text-left p-3 font-medium" style={{ color: colors.textSecondary }}>Feature</th>
                  {PLAN_ORDER.map(p => (
                    <th
                      key={p}
                      className="p-3 text-center font-semibold"
                      style={{ color: PLAN_COLORS[p] }}
                    >
                      {SUBSCRIPTION_PLANS[p].name}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(Object.keys(FEATURE_LABELS) as (keyof SubscriptionFeatures)[]).map(feat => (
                  <tr
                    key={feat}
                    style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}
                  >
                    <td className="p-3" style={{ color: colors.textSecondary }}>{FEATURE_LABELS[feat]}</td>
                    {PLAN_ORDER.map(planId => (
                      <td key={planId} className="p-3 text-center">
                        {SUBSCRIPTION_PLANS[planId].features[feat] ? (
                          <Check size={14} className="mx-auto text-green-400" />
                        ) : (
                          <X size={14} className="mx-auto text-gray-600" />
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Payment History */}
        <div className="rounded-2xl overflow-hidden" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="w-full p-4 flex items-center justify-between text-left"
          >
            <div className="flex items-center gap-2">
              <Receipt size={16} style={{ color: colors.primary }} />
              <span className="font-semibold text-white text-sm">Payment History</span>
              {transactions.length > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(255,255,255,0.06)', color: colors.textTertiary }}>
                  {transactions.length}
                </span>
              )}
            </div>
            {showHistory ? (
              <ChevronUp size={16} style={{ color: colors.textTertiary }} />
            ) : (
              <ChevronDown size={16} style={{ color: colors.textTertiary }} />
            )}
          </button>

          <AnimatePresence>
            {showHistory && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden"
              >
                {transactions.length === 0 ? (
                  <div className="px-4 pb-4 text-center py-8">
                    <Receipt size={24} className="mx-auto mb-2 opacity-30 text-white" />
                    <p className="text-sm" style={{ color: colors.textTertiary }}>No payment history yet</p>
                  </div>
                ) : (
                  <div className="px-4 pb-4 space-y-2">
                    {transactions.map(tx => (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-3 rounded-xl"
                        style={{ background: 'rgba(255,255,255,0.03)' }}
                      >
                        <div className="flex items-center gap-3">
                          <div
                            className="w-8 h-8 rounded-lg flex items-center justify-center"
                            style={{
                              background: tx.status === 'success' ? 'rgba(16,185,129,0.15)' :
                                tx.status === 'pending' ? 'rgba(245,158,11,0.15)' : 'rgba(239,68,68,0.15)',
                            }}
                          >
                            {tx.status === 'success' ? (
                              <Check size={14} className="text-green-400" />
                            ) : tx.status === 'pending' ? (
                              <Clock size={14} className="text-yellow-400" />
                            ) : (
                              <X size={14} className="text-red-400" />
                            )}
                          </div>
                          <div>
                            <p className="text-sm font-medium text-white capitalize">
                              {SUBSCRIPTION_PLANS[tx.plan_id]?.name || tx.plan_id} · {tx.billing_cycle}
                            </p>
                            <p className="text-[10px]" style={{ color: colors.textTertiary }}>
                              {formatDate(tx.created_at)} · {tx.reference}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-white">
                            {tx.currency === 'NGN' ? '₦' : '$'}{tx.amount.toLocaleString()}
                          </p>
                          <p
                            className="text-[10px] capitalize font-medium"
                            style={{
                              color: tx.status === 'success' ? '#10B981' :
                                tx.status === 'pending' ? '#F59E0B' : '#EF4444',
                            }}
                          >
                            {tx.status}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Paystack not configured warning */}
        {!billingService.isPaystackConfigured() && (
          <div
            className="p-4 rounded-xl flex items-start gap-3"
            style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}
          >
            <AlertTriangle size={18} className="text-yellow-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium text-yellow-400">Payment Gateway Not Configured</p>
              <p className="text-xs mt-1" style={{ color: colors.textTertiary }}>
                Add your Paystack public key as <code className="bg-white/5 px-1 rounded">VITE_PAYSTACK_PUBLIC_KEY</code> and 
                secret key as <code className="bg-white/5 px-1 rounded">PAYSTACK_SECRET_KEY</code> in your environment variables to enable payments.
              </p>
            </div>
          </div>
        )}
      </div>
    </PageWrapper>
  );
}
