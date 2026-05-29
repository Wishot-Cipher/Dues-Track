/**
 * Platform Console — Super Admin Dashboard
 * This page is deliberately unlisted and accessible only via direct URL.
 * Provides overview of all organizations on the Payvexo platform.
 * 
 * Entry: /pvx-console (hidden route)
 * Easter egg: Tap version number 7x in Settings
 * 
 * @author Dev_Wishot
 * @copyright Dev_Wishot - @wishotstudio
 */

import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Shield,
  Building2,
  Users,
  Banknote,
  TrendingUp,
  LogOut,
  Eye,
  EyeOff,
  Search,
  RefreshCw,
  ArrowLeft,
  Activity,
  Globe,
  CheckCircle,
  XCircle,
  Lock,
  Mail,
  CreditCard,
  Clock,
  ChevronDown,
  ChevronUp,
  Crown,
  Zap,
  Star,
  X,
  ArrowUpCircle,
} from 'lucide-react';
import {
  platformAdminLogin,
  getPlatformAdmin,
  platformAdminLogout,
  verifySession,
  fetchPlatformStats,
  toggleOrganizationStatus,
  updateOrgSubscription,
  extendTrial,
  fetchOrgBillingHistory,
  type PlatformAdmin,
  type PlatformStats,
  type OrgOverview,
  type BillingTransaction,
} from '@/services/platformAdminService';
import ConsoleUniversitiesPage from '@/pages/admin/ConsoleUniversitiesPage';
import ConsoleRoleManagementPage from '@/pages/admin/ConsoleRoleManagementPage';
import ConsoleEmailCodeLogin from '@/components/platform/ConsoleEmailCodeLogin';
import { consoleColors as colors, consoleGradients as gradients } from '@/pages/admin/consoleTheme';
import ConsoleStatCard from '@/pages/admin/ConsoleStatCard';

function formatCurrency(amount: number): string {
  return `₦${amount.toLocaleString()}`;
}

// ── Login Form ──
function PlatformLoginForm({ onLogin }: { onLogin: (admin: PlatformAdmin) => void }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;

    setLoading(true);
    setError('');
    try {
      const admin = await platformAdminLogin(email, password);
      onLogin(admin);
    } catch (err) {
      console.error('[PVX Console] Login error:', err);
      setError(err instanceof Error ? err.message : 'Authentication failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: colors.bg }}>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        <div
          className="rounded-2xl p-6 sm:p-8"
          style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
        >
          {/* Header - deliberately minimal */}
          <div className="text-center mb-8">
            <div
              className="w-14 h-14 mx-auto mb-4 rounded-xl flex items-center justify-center"
              style={{ background: `${colors.primary}15`, border: `1px solid ${colors.primary}30` }}
            >
              <Shield className="w-7 h-7" style={{ color: colors.primary }} />
            </div>
            <h1 className="text-lg font-bold text-white">Platform Console</h1>
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
              Authorized access only
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textSecondary }} />
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@payvexo.com"
                  className="w-full pl-10 pr-4 py-3 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                  autoComplete="email"
                />
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-white/60 mb-1.5 block">Password</label>
              <div className="relative">
                <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textSecondary }} />
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full pl-10 pr-12 py-3 rounded-xl text-sm text-white placeholder-white/30 focus:outline-none focus:ring-2"
                  style={{
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                  }}
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2"
                >
                  {showPassword ? (
                    <EyeOff className="w-4 h-4" style={{ color: colors.textSecondary }} />
                  ) : (
                    <Eye className="w-4 h-4" style={{ color: colors.textSecondary }} />
                  )}
                </button>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.p
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  className="text-xs text-red-400 text-center"
                >
                  {error}
                </motion.p>
              )}
            </AnimatePresence>

            <motion.button
              type="submit"
              disabled={loading || !email || !password}
              className="w-full py-3 rounded-xl font-semibold text-sm text-white disabled:opacity-40 disabled:cursor-not-allowed"
              style={{ background: gradients.primary }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? 'Verifying...' : 'Sign In'}
            </motion.button>
          </form>
        </div>

        <p className="text-center text-[10px] mt-4" style={{ color: colors.textSecondary }}>
          This console is restricted to Payvexo platform administrators.
        </p>
      </motion.div>
    </div>
  );
}

// ── Plan badge colors ──
const planColors: Record<string, string> = {
  free: '#6b7280',
  starter: '#3b82f6',
  professional: '#f59e0b',
  enterprise: '#8b5cf6',
};

const planIcons: Record<string, React.ElementType> = {
  free: Star,
  starter: Zap,
  professional: Crown,
  enterprise: Shield,
};

// ── Billing Management Modal ──
function BillingModal({
  org,
  onClose,
  onUpdate,
}: {
  org: OrgOverview;
  onClose: () => void;
  onUpdate: () => void;
}) {
  const [selectedPlan, setSelectedPlan] = useState(org.subscription_plan || 'free');
  const [maxGroups, setMaxGroups] = useState(org.max_groups || 1);
  const [maxMembers, setMaxMembers] = useState(org.max_members || 50);
  const [maxAdmins, setMaxAdmins] = useState(org.max_admins || 3);
  const [trialDays, setTrialDays] = useState(14);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [billingHistory, setBillingHistory] = useState<BillingTransaction[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(true);
  const [activeTab, setActiveTab] = useState<'plan' | 'limits' | 'history'>('plan');

  useEffect(() => {
    loadBillingHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadBillingHistory = async () => {
    setLoadingHistory(true);
    try {
      const history = await fetchOrgBillingHistory(org.id);
      setBillingHistory(history);
    } catch {
      setBillingHistory([]);
    } finally {
      setLoadingHistory(false);
    }
  };

  // Auto-update limits when plan changes
  useEffect(() => {
    const planDefaults: Record<string, { g: number; m: number; a: number }> = {
      free: { g: 1, m: 50, a: 3 },
      starter: { g: 3, m: 300, a: 10 },
      professional: { g: 20, m: 5000, a: 50 },
      enterprise: { g: 999, m: 99999, a: 999 },
    };
    const d = planDefaults[selectedPlan];
    if (d) {
      setMaxGroups(d.g);
      setMaxMembers(d.m);
      setMaxAdmins(d.a);
    }
  }, [selectedPlan]);

  const handleUpdatePlan = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await updateOrgSubscription(org.id, selectedPlan as 'free' | 'starter' | 'professional' | 'enterprise', {
        max_groups: maxGroups,
        max_members: maxMembers,
        max_admins: maxAdmins,
      });
      setSuccess(`Plan updated to ${selectedPlan.charAt(0).toUpperCase() + selectedPlan.slice(1)}`);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update plan');
    } finally {
      setLoading(false);
    }
  };

  const handleExtendTrial = async () => {
    setLoading(true);
    setError('');
    setSuccess('');
    try {
      await extendTrial(org.id, trialDays);
      setSuccess(`Trial extended by ${trialDays} days`);
      onUpdate();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to extend trial');
    } finally {
      setLoading(false);
    }
  };

  const plans = ['free', 'starter', 'professional', 'enterprise'];

  return (
    <motion.div
      className="fixed inset-0 z-100 flex items-center justify-center p-4"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        className="relative w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl"
        style={{ background: '#1a1a2e', border: `1px solid ${colors.cardBorder}` }}
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
      >
        {/* Header */}
        <div className="sticky top-0 z-10 px-5 py-4 flex items-center justify-between rounded-t-2xl"
          style={{ background: '#1a1a2e', borderBottom: `1px solid ${colors.cardBorder}` }}>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold"
              style={{ background: `${colors.primary}20`, color: colors.primary }}>
              {org.name.substring(0, 2).toUpperCase()}
            </div>
            <div>
              <h3 className="font-semibold text-white text-sm">{org.name}</h3>
              <p className="text-[10px]" style={{ color: colors.textSecondary }}>Subscription Management</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-white/5">
            <X className="w-4 h-4" style={{ color: colors.textSecondary }} />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3">
          {[
            { key: 'plan', label: 'Plan', icon: CreditCard },
            { key: 'limits', label: 'Limits', icon: ArrowUpCircle },
            { key: 'history', label: 'History', icon: Clock },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as 'plan' | 'limits' | 'history')}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all"
              style={{
                background: activeTab === tab.key ? `${colors.primary}20` : 'transparent',
                color: activeTab === tab.key ? colors.primary : colors.textSecondary,
              }}
            >
              <tab.icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          ))}
        </div>

        <div className="p-5 space-y-4">
          {/* Messages */}
          <AnimatePresence>
            {error && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="p-3 rounded-xl text-xs text-red-400"
                style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                {error}
              </motion.div>
            )}
            {success && (
              <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }}
                className="p-3 rounded-xl text-xs text-green-400"
                style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
                {success}
              </motion.div>
            )}
          </AnimatePresence>

          {/* Plan Tab */}
          {activeTab === 'plan' && (
            <>
              {/* Current Status */}
              <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.cardBorder}` }}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] uppercase tracking-wider font-medium" style={{ color: colors.textSecondary }}>Current Plan</span>
                  <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                    style={{ background: `${planColors[org.subscription_plan || 'free']}20`, color: planColors[org.subscription_plan || 'free'] }}>
                    {org.subscription_plan || 'Free'}
                  </span>
                </div>
                {org.is_on_trial && (
                  <div className="flex items-center gap-1.5 text-[11px]" style={{ color: colors.textSecondary }}>
                    <Clock className="w-3 h-3" />
                    Trial ends: {org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString() : 'N/A'}
                  </div>
                )}
                {org.subscription_expires_at && (
                  <div className="flex items-center gap-1.5 text-[11px] mt-1" style={{ color: colors.textSecondary }}>
                    <Clock className="w-3 h-3" />
                    Expires: {new Date(org.subscription_expires_at).toLocaleDateString()}
                  </div>
                )}
              </div>

              {/* Plan Selection */}
              <div>
                <label className="text-xs font-medium mb-2 block" style={{ color: colors.textSecondary }}>Change Plan</label>
                <div className="grid grid-cols-2 gap-2">
                  {plans.map(plan => {
                    const PlanIcon = planIcons[plan];
                    return (
                      <motion.button
                        key={plan}
                        onClick={() => setSelectedPlan(plan)}
                        className="p-3 rounded-xl text-left transition-all"
                        style={{
                          background: selectedPlan === plan ? `${planColors[plan]}15` : 'rgba(255,255,255,0.03)',
                          border: `1.5px solid ${selectedPlan === plan ? planColors[plan] + '60' : 'rgba(255,255,255,0.08)'}`,
                        }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <div className="flex items-center gap-2 mb-1">
                          <PlanIcon className="w-3.5 h-3.5" style={{ color: planColors[plan] }} />
                          <span className="text-xs font-semibold capitalize text-white">{plan}</span>
                        </div>
                        <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                          {plan === 'free' && '50 members, 1 group'}
                          {plan === 'starter' && '300 members, 3 groups'}
                          {plan === 'professional' && '5K members, 20 groups'}
                          {plan === 'enterprise' && 'Unlimited'}
                        </p>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              <motion.button
                onClick={handleUpdatePlan}
                disabled={loading || selectedPlan === org.subscription_plan}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-40"
                style={{ background: gradients.primary }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? 'Updating...' : 'Update Plan'}
              </motion.button>

              {/* Trial Extension */}
              <div className="pt-2" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
                <label className="text-xs font-medium mb-2 block" style={{ color: colors.textSecondary }}>Extend Trial</label>
                <div className="flex items-center gap-2">
                  <input
                    type="number"
                    value={trialDays}
                    onChange={(e) => setTrialDays(parseInt(e.target.value) || 0)}
                    min={1}
                    max={365}
                    className="flex-1 px-3 py-2 rounded-xl text-sm text-white focus:outline-none"
                    style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                  />
                  <span className="text-xs" style={{ color: colors.textSecondary }}>days</span>
                  <motion.button
                    onClick={handleExtendTrial}
                    disabled={loading || trialDays < 1}
                    className="px-4 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-40"
                    style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}
                    whileHover={{ scale: 1.03 }}
                    whileTap={{ scale: 0.97 }}
                  >
                    Extend
                  </motion.button>
                </div>
              </div>
            </>
          )}

          {/* Limits Tab */}
          {activeTab === 'limits' && (
            <>
              <div className="space-y-3">
                {[
                  { label: 'Max Groups', value: maxGroups, setter: setMaxGroups, current: org.max_groups },
                  { label: 'Max Members', value: maxMembers, setter: setMaxMembers, current: org.max_members },
                  { label: 'Max Admins', value: maxAdmins, setter: setMaxAdmins, current: org.max_admins },
                ].map(field => (
                  <div key={field.label}>
                    <label className="text-xs font-medium mb-1 flex items-center justify-between" style={{ color: colors.textSecondary }}>
                      {field.label}
                      <span className="text-[10px]" style={{ color: colors.textSecondary }}>Current: {field.current}</span>
                    </label>
                    <input
                      type="number"
                      value={field.value}
                      onChange={(e) => field.setter(parseInt(e.target.value) || 0)}
                      min={1}
                      className="w-full px-3 py-2.5 rounded-xl text-sm text-white focus:outline-none focus:ring-2 focus:ring-orange-500/50"
                      style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}
                    />
                  </div>
                ))}
              </div>

              <motion.button
                onClick={handleUpdatePlan}
                disabled={loading}
                className="w-full py-2.5 rounded-xl font-semibold text-sm text-white disabled:opacity-40"
                style={{ background: gradients.primary }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? 'Saving...' : 'Save Limits'}
              </motion.button>
            </>
          )}

          {/* History Tab */}
          {activeTab === 'history' && (
            <div>
              {loadingHistory ? (
                <div className="text-center py-8">
                  <motion.div className="w-6 h-6 border-2 rounded-full mx-auto"
                    style={{ borderColor: `${colors.primary}30`, borderTopColor: colors.primary }}
                    animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: 'linear' }} />
                </div>
              ) : billingHistory.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="w-8 h-8 mx-auto mb-2" style={{ color: colors.textSecondary }} />
                  <p className="text-xs" style={{ color: colors.textSecondary }}>No billing transactions yet</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {billingHistory.map(tx => (
                    <div key={tx.id} className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.cardBorder}` }}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-xs font-medium text-white capitalize">{tx.plan} Plan</span>
                        <span className="px-2 py-0.5 rounded-full text-[9px] font-semibold"
                          style={{
                            background: tx.status === 'completed' ? 'rgba(34,197,94,0.15)' : 'rgba(245,158,11,0.15)',
                            color: tx.status === 'completed' ? '#22c55e' : '#f59e0b',
                          }}>
                          {tx.status}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-[11px]" style={{ color: colors.textSecondary }}>
                          {new Date(tx.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-sm font-bold" style={{ color: colors.accentMint }}>
                          {tx.currency === 'NGN' ? '₦' : '$'}{tx.amount.toLocaleString()}
                        </span>
                      </div>
                      {tx.payment_reference && (
                        <p className="text-[9px] font-mono mt-1" style={{ color: colors.textSecondary }}>
                          Ref: {tx.payment_reference}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Organization Row ──
function OrgRow({
  org,
  onToggleStatus,
  onManageBilling,
}: {
  org: OrgOverview;
  onToggleStatus: (orgId: string, active: boolean) => void;
  onManageBilling: (org: OrgOverview) => void;
}) {
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(false);
  const plan = org.subscription_plan || 'free';
  const PlanIcon = planIcons[plan] || Star;

  return (
    <motion.div
      className="rounded-xl overflow-hidden"
      style={{ background: colors.cardBg, border: `1px solid ${colors.cardBorder}` }}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center gap-3">
        {/* Org Info */}
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-bold"
            style={{
              background: org.is_active ? `${colors.primary}15` : 'rgba(255, 255, 255, 0.05)',
              color: org.is_active ? colors.primary : colors.textSecondary,
              border: `1px solid ${org.is_active ? colors.primary + '30' : 'rgba(255, 255, 255, 0.1)'}`,
            }}
          >
            {org.name.substring(0, 2).toUpperCase()}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-semibold text-white text-sm truncate">{org.name}</p>
              <span
                className="px-1.5 py-0.5 rounded-full text-[9px] font-semibold shrink-0"
                style={{
                  background: org.is_active ? `${colors.statusActive}15` : `${colors.statusInactive}15`,
                  color: org.is_active ? colors.statusActive : colors.statusInactive,
                }}
              >
                {org.is_active ? 'Active' : 'Inactive'}
              </span>
              <span
                className="px-1.5 py-0.5 rounded-full text-[9px] font-bold shrink-0 uppercase flex items-center gap-1"
                style={{ background: `${planColors[plan]}15`, color: planColors[plan] }}
              >
                <PlanIcon className="w-2.5 h-2.5" />
                {plan}
              </span>
            </div>
            <p className="text-[11px] truncate" style={{ color: colors.textSecondary }}>
              /{org.slug} · {org.organization_type} · Created {new Date(org.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Stats */}
        <div className="flex items-center gap-4 sm:gap-6 text-xs ml-13 sm:ml-0">
          <div className="text-center">
            <p className="font-bold text-white">{org.member_count}</p>
            <p style={{ color: colors.textSecondary }}>Members</p>
          </div>
          <div className="text-center">
            <p className="font-bold text-white">{org.payment_count}</p>
            <p style={{ color: colors.textSecondary }}>Payments</p>
          </div>
          <div className="text-center">
            <p className="font-bold" style={{ color: colors.accentMint }}>
              {formatCurrency(org.total_collected)}
            </p>
            <p style={{ color: colors.textSecondary }}>Collected</p>
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2 ml-13 sm:ml-0">
          <motion.button
            onClick={() => onManageBilling(org)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: `${planColors[plan]}15`, color: planColors[plan] }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Manage Billing"
          >
            <CreditCard className="w-3.5 h-3.5" />
          </motion.button>
          <motion.button
            onClick={() => setExpanded(!expanded)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: 'rgba(255,255,255,0.05)', color: colors.textSecondary }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="Details"
          >
            {expanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </motion.button>
          <motion.button
            onClick={() => navigate(`/${org.slug}/login`)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{ background: `${colors.primary}15`, color: colors.primary }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title="View org"
          >
            <Globe className="w-3.5 h-3.5" />
          </motion.button>
          <motion.button
            onClick={() => onToggleStatus(org.id, !org.is_active)}
            className="px-3 py-1.5 rounded-lg text-xs font-medium"
            style={{
              background: org.is_active ? `${colors.statusInactive}15` : `${colors.statusActive}15`,
              color: org.is_active ? colors.statusInactive : colors.statusActive,
            }}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            title={org.is_active ? 'Deactivate' : 'Activate'}
          >
            {org.is_active ? <XCircle className="w-3.5 h-3.5" /> : <CheckCircle className="w-3.5 h-3.5" />}
          </motion.button>
        </div>
      </div>

      {/* Expanded Details */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 grid grid-cols-2 sm:grid-cols-4 gap-3" style={{ borderTop: `1px solid ${colors.cardBorder}` }}>
              <div className="pt-3">
                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: colors.textSecondary }}>Plan</p>
                <p className="text-xs font-semibold capitalize text-white">{plan}</p>
              </div>
              <div className="pt-3">
                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: colors.textSecondary }}>Limits</p>
                <p className="text-xs text-white">{org.max_members} members / {org.max_groups} groups</p>
              </div>
              <div className="pt-3">
                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: colors.textSecondary }}>Trial</p>
                <p className="text-xs text-white">
                  {org.is_on_trial ? (
                    <span style={{ color: colors.accentMint }}>
                      Until {org.trial_ends_at ? new Date(org.trial_ends_at).toLocaleDateString() : 'N/A'}
                    </span>
                  ) : 'No'}
                </p>
              </div>
              <div className="pt-3">
                <p className="text-[10px] uppercase tracking-wider mb-0.5" style={{ color: colors.textSecondary }}>Expires</p>
                <p className="text-xs text-white">
                  {org.subscription_expires_at ? new Date(org.subscription_expires_at).toLocaleDateString() : 'Never'}
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

// ── Main Dashboard ──
function PlatformDashboard({ admin, onLogout }: { admin: PlatformAdmin; onLogout: () => void }) {
  const navigate = useNavigate();
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState('');
  const [billingOrg, setBillingOrg] = useState<OrgOverview | null>(null);
  const [filterPlan, setFilterPlan] = useState<string>('all');
  const [activeSection, setActiveSection] = useState<'dashboard' | 'universities' | 'roles'>('dashboard');

  const loadData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setError('');

    try {
      const data = await fetchPlatformStats();
      setStats(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load data');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleToggleStatus = async (orgId: string, active: boolean) => {
    try {
      await toggleOrganizationStatus(orgId, active);
      await loadData(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update');
    }
  };

  const filteredOrgs = stats?.recentOrgs.filter(
    (org) => {
      const matchesSearch = org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        org.slug.toLowerCase().includes(searchQuery.toLowerCase());
      const matchesPlan = filterPlan === 'all' || (org.subscription_plan || 'free') === filterPlan;
      return matchesSearch && matchesPlan;
    }
  ) || [];

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: colors.bg }}>
        <motion.div
          className="w-8 h-8 border-2 rounded-full"
          style={{ borderColor: `${colors.primary}30`, borderTopColor: colors.primary }}
          animate={{ rotate: 360 }}
          transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-screen" style={{ background: colors.bg }}>
      {/* Header */}
      <div
        className="sticky top-0 z-50 px-4 sm:px-6 py-3"
        style={{ background: 'rgba(15, 7, 3, 0.9)', backdropFilter: 'blur(20px)', borderBottom: `1px solid ${colors.cardBorder}` }}
      >
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
            <motion.button
              onClick={() => navigate('/')}
              className="p-2 rounded-lg"
              style={{ background: 'rgba(255, 255, 255, 0.05)' }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <ArrowLeft className="w-4 h-4" style={{ color: colors.textSecondary }} />
            </motion.button>
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5" style={{ color: colors.primary }} />
              <span className="text-sm font-semibold text-white">Console</span>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-2">
              <Activity className="w-3.5 h-3.5" style={{ color: colors.accentMint }} />
              <span className="text-xs" style={{ color: colors.textSecondary }}>
                {admin.full_name}
              </span>
            </div>
            <motion.button
              onClick={() => loadData(true)}
              disabled={refreshing}
              className="p-2 rounded-lg"
              style={{ background: 'rgba(255, 255, 255, 0.05)' }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <RefreshCw
                className={`w-4 h-4 ${refreshing ? 'animate-spin' : ''}`}
                style={{ color: colors.textSecondary }}
              />
            </motion.button>
            <motion.button
              onClick={onLogout}
              className="p-2 rounded-lg"
              style={{ background: 'rgba(239, 68, 68, 0.1)' }}
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
            >
              <LogOut className="w-4 h-4 text-red-400" />
            </motion.button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-5xl mx-auto px-4 sm:px-6 py-6 space-y-6">
        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="p-3 rounded-xl text-xs text-red-400"
              style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
            >
              {error}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Section Switcher */}
        <div className="flex flex-wrap gap-2 p-1 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.cardBorder}` }}>
          {[
            { key: 'dashboard', label: 'Dashboard' },
            { key: 'universities', label: 'Organizations' },
            { key: 'roles', label: 'Role Management' },
          ].map((section) => (
            <button
              key={section.key}
              onClick={() => setActiveSection(section.key as 'dashboard' | 'universities' | 'roles')}
              className="px-4 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: activeSection === section.key ? `${colors.primary}20` : 'transparent',
                color: activeSection === section.key ? colors.primary : colors.textSecondary,
              }}
            >
              {section.label}
            </button>
          ))}
        </div>

        {activeSection === 'universities' && <ConsoleUniversitiesPage />}
        {activeSection === 'roles' && <ConsoleRoleManagementPage />}

        {activeSection === 'dashboard' && (
          <>

        {/* Stats Grid */}
        {stats && (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
            <StatCard
              label="Organizations"
              value={stats.totalOrganizations}
              icon={Building2}
              color={colors.primary}
              subtext={`${stats.activeOrganizations} active`}
            />
            <StatCard
              label="Total Members"
              value={stats.totalMembers.toLocaleString()}
              icon={Users}
              color="#3b82f6"
            />
            <ConsoleStatCard
              label="Payments"
              value={stats.totalPayments.toLocaleString()}
              icon={TrendingUp}
              color={colors.accentMint}
            />
            <ConsoleStatCard
              label="Collected"
              value={formatCurrency(stats.totalCollected)}
              icon={Banknote}
              color="#22c55e"
            />
            <ConsoleStatCard
              label="Platform"
              value="Active"
              icon={Activity}
              color={colors.accentMint}
              subtext="All systems operational"
            />
          </div>
        )}

        {/* Organizations Section */}
        <div>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
            <h2 className="text-base font-bold text-white">Organizations</h2>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              {/* Plan Filter */}
              <div className="flex items-center gap-1 p-1 rounded-xl overflow-x-auto" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                {['all', 'free', 'starter', 'professional', 'enterprise'].map(p => (
                  <button
                    key={p}
                    onClick={() => setFilterPlan(p)}
                    className="px-2 py-1 rounded-lg text-[10px] font-medium transition-all capitalize whitespace-nowrap"
                    style={{
                      background: filterPlan === p ? `${p === 'all' ? colors.primary : planColors[p] || colors.primary}20` : 'transparent',
                      color: filterPlan === p ? (p === 'all' ? colors.primary : planColors[p] || colors.primary) : colors.textSecondary,
                    }}
                  >
                    {p}
                  </button>
                ))}
              </div>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5" style={{ color: colors.textSecondary }} />
                <input
                  type="text"
                  placeholder="Search..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-9 pr-4 py-2 rounded-xl text-xs text-white placeholder-white/30 focus:outline-none sm:w-56"
                  style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            {filteredOrgs.length === 0 ? (
              <div className="text-center py-12">
                <Building2 className="w-10 h-10 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  {searchQuery || filterPlan !== 'all' ? 'No matching organizations' : 'No organizations yet'}
                </p>
              </div>
            ) : (
              filteredOrgs.map((org) => (
                <OrgRow key={org.id} org={org} onToggleStatus={handleToggleStatus} onManageBilling={(o) => setBillingOrg(o)} />
              ))
            )}
          </div>
        </div>
          </>
        )}
      </div>

      {/* Billing Modal */}
      <AnimatePresence>
        {billingOrg && (
          <BillingModal
            org={billingOrg}
            onClose={() => setBillingOrg(null)}
            onUpdate={() => loadData(true)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Main Page Component ──
export default function PlatformConsolePage() {
  const [admin, setAdmin] = useState<PlatformAdmin | null>(() => getPlatformAdmin());
  // Toggled by the "Use password instead" link inside ConsoleEmailCodeLogin
  // so the existing password form stays one click away during the migration.
  const [useFallbackPassword, setUseFallbackPassword] = useState(false);
  const [verifying, setVerifying] = useState<boolean>(() => Boolean(getPlatformAdmin()));

  // Re-verify the cached token against the server on mount and on every
  // tab focus. A stale or expired token kicks the user back to login —
  // we never trust client-side session data alone.
  useEffect(() => {
    let cancelled = false;
    const check = async () => {
      const cached = getPlatformAdmin();
      if (!cached) {
        if (!cancelled) { setAdmin(null); setVerifying(false); }
        return;
      }
      const fresh = await verifySession();
      if (!cancelled) {
        setAdmin(fresh);
        setVerifying(false);
      }
    };
    void check();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);

  const handleLogout = async () => {
    await platformAdminLogout();
    setAdmin(null);
  };

  if (verifying) {
    return (
      <div
        className="min-h-screen flex items-center justify-center px-4"
        style={{
          background: 'radial-gradient(circle at top, rgba(255, 104, 3, 0.14) 0%, rgba(15, 7, 3, 1) 52%, rgba(8, 4, 2, 1) 100%)',
          color: colors.textPrimary,
        }}
      >
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="w-full max-w-sm rounded-3xl p-6 text-center"
          style={{
            background: colors.cardBg,
            border: `1px solid ${colors.cardBorder}`,
            boxShadow: '0 24px 80px -24px rgba(0, 0, 0, 0.55)',
          }}
        >
          <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: `${colors.primary}15`, border: `1px solid ${colors.primary}30` }}>
            <motion.div
              className="w-7 h-7 border-2 rounded-full"
              style={{ borderColor: `${colors.primary}30`, borderTopColor: colors.primary }}
              animate={{ rotate: 360 }}
              transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
            />
          </div>
          <h1 className="text-lg font-bold mb-1">Loading Console</h1>
          <p className="text-xs" style={{ color: colors.textSecondary }}>
            Verifying your session and restoring the dashboard...
          </p>
        </motion.div>
      </div>
    );
  }

  if (!admin) {
    // Email-code (passwordless) is the new default. The password form
    // is kept as a one-tap fallback while admins migrate. Once everyone
    // has logged in via email, the fallback can be removed and mig 044's
    // password RPC deprecated.
    return useFallbackPassword
      ? <PlatformLoginForm onLogin={setAdmin} />
      : (
          <ConsoleEmailCodeLogin
            onLogin={setAdmin}
            showPasswordFallback
            onPasswordFallback={() => setUseFallbackPassword(true)}
          />
        );
  }

  return <PlatformDashboard admin={admin} onLogout={handleLogout} />;
}
