import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Calendar, 
  Settings,
  LogOut,
  ChevronDown,
  DollarSign,
  CheckCircle,
  AlertCircle,
  Menu,
  X as CloseIcon,
  Plus,
  XCircle,
  Eye,
  EyeOff,
  Gift,
  Star,
  AlertTriangle
} from 'lucide-react';
import { colors, gradients } from '@/config/colors';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import GlassCard from '@/components/ui/GlassCard';
import { LogoCompact } from '@/components/ui/Logo';
import { formatCurrency, formatDate } from '@/utils/formatters';
import paymentService from '@/services/paymentService';
import type { Payment, PaymentType, PaymentStats } from '@/types';
import { StatCard } from '@/components/dashboard/StatCard';
import { NotificationCenter } from '@/components/NotificationCenter';
import PushNotificationPrompt from '@/components/PushNotificationPrompt';
import Footer from '@/components/Footer';
import ExpenseTransparencyDashboard from '@/components/student/ExpenseTransparencyDashboard';
import AchievementSystem from '@/components/student/AchievementSystem';
import SmartDeadlineReminders from '@/components/student/SmartDeadlineReminders';
import DashboardSwitcher from '@/components/DashboardSwitcher';
import ClassProgressVisualization from '@/components/student/ClassProgressVisualization';
import QuickPaymentSummary from '@/components/student/QuickPaymentSummary';
import { useStudentFeatures } from '@/hooks/useStudentFeatures';
import { StatCardSkeleton, PaymentCardSkeleton } from '@/components/ui/Skeleton';
import EmptyState, { AllPaidState } from '@/components/ui/EmptyState';
import { useSettings } from '@/contexts/SettingsContext';
import haptics from '@/lib/haptics';
import usePullToRefresh from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/ui/PullToRefreshIndicator';

export default function DashboardPage() {
  const { user, logout, hasPermission } = useAuth();
  const { features, loading: featuresLoading } = useStudentFeatures();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);

  // Pull-to-refresh
  const { pullDistance, isRefreshing, isReady } = usePullToRefresh({
    onRefresh: async () => {
      setRefreshKey(prev => prev + 1);
      // Small delay so data fetch has time to start
      await new Promise(resolve => setTimeout(resolve, 800));
    },
  });
  
  // Real data states
  const [stats, setStats] = useState<PaymentStats>({
    totalPaid: 0,
    totalDue: 0,
    paymentsMade: 0,
    pendingPayments: 0,
  });
  
  // Active payment types with their status for current student
  const [activePayments, setActivePayments] = useState<Array<{
    paymentType: PaymentType;
    payment: Payment | null;
    status: 'paid' | 'pending' | 'partial' | 'not_paid' | 'waived';
    amountPaid: number;
    progress: number;
    baseRemaining?: number;
    daysOverdue?: number;
    lateFeePerDay?: number;
    accumulatedLateFees?: number;
    totalDue?: number;
  }>>([]);

  // Dismissed optional dues - stored in localStorage
  const [dismissedDues, setDismissedDues] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(`dismissedDues_${user?.id}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });
  const [showDismissed, setShowDismissed] = useState(false);
  const [showAllUnpaidDues, setShowAllUnpaidDues] = useState(false);

  // Save dismissed dues to localStorage when it changes
  useEffect(() => {
    if (user?.id) {
      localStorage.setItem(`dismissedDues_${user.id}`, JSON.stringify(dismissedDues));
    }
  }, [dismissedDues, user?.id]);

  // Dismiss an optional due
  const dismissOptionalDue = (paymentTypeId: string) => {
    setDismissedDues(prev => [...prev, paymentTypeId]);
  };

  // Restore a dismissed due
  const restoreDismissedDue = (paymentTypeId: string) => {
    setDismissedDues(prev => prev.filter(id => id !== paymentTypeId));
  };

  // Filter and separate dues
  const { mandatoryUnpaidDues, optionalUnpaidDues, dismissedUnpaidDues } = useMemo(() => {
    const unpaid = activePayments.filter(p => p.status === 'not_paid');
    
    return {
      mandatoryUnpaidDues: unpaid.filter(p => p.paymentType.is_mandatory),
      optionalUnpaidDues: unpaid.filter(p => !p.paymentType.is_mandatory && !dismissedDues.includes(p.paymentType.id)),
      dismissedUnpaidDues: unpaid.filter(p => !p.paymentType.is_mandatory && dismissedDues.includes(p.paymentType.id))
    };
  }, [activePayments, dismissedDues]);

  // Check if we need to refresh based on navigation state
  useEffect(() => {
    if (location.state && (location.state as { refresh?: boolean }).refresh) {
      setRefreshKey(prev => prev + 1);
      // Clear the state so it doesn't refresh again on next navigation
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Fetch data on component mount and when returning to dashboard
  useEffect(() => {
    const fetchDashboardData = async () => {
      if (!user?.id) return;

      try {
        setLoading(true);
        
        // Debug logs removed for production security
        
        const [statsData, paymentTypesData, paymentsData] = await Promise.all([
          paymentService.getStudentPaymentStats(user.id),
          paymentService.getActivePaymentTypesForStudent(user.id),
          paymentService.getStudentPayments(user.id),
        ]);

        // Debug logs removed for production security

        setStats(statsData);
        
        // Combine payment types with their payment status
        const combined = paymentTypesData.map(pt => {
          // Get ALL payments for this payment type (not just first one)
          const paymentsForType = paymentsData.filter(p => p.payment_type_id === pt.id);
          
          let status: 'paid' | 'pending' | 'partial' | 'not_paid' | 'waived' = 'not_paid';
          let amountPaid = 0;
          let progress = 0;
          
          if (paymentsForType.length > 0) {
            // Check if payment was waived
            const isWaived = paymentsForType.some(p => 
              p.status === 'approved' && p.transaction_ref?.startsWith('WAIVED-')
            );
            
            if (isWaived) {
              status = 'waived';
              progress = 0; // Waived = no payment made, don't show as progress
            } else {
              // Sum up all APPROVED payments for this payment type
              amountPaid = paymentsForType
                .filter(p => p.status === 'approved')
                .reduce((sum, p) => sum + Number(p.amount || 0), 0);
              
              progress = (amountPaid / pt.amount) * 100;
              
              // Check if there are any pending payments
              const hasPending = paymentsForType.some(p => p.status === 'pending');
              
              // If there's a pending payment, show pending status (takes priority)
              if (hasPending) {
                status = 'pending';
              } else if (amountPaid >= pt.amount) {
                status = 'paid';
              } else if (amountPaid > 0) {
                status = 'partial';
              }
            }
          }
          
          // Compute remaining and late fees
          const paymentTypeAmount = Number(pt.amount) || 0;
          const baseRemaining = Math.max(0, paymentTypeAmount - amountPaid);
          const now = new Date();
          const deadlineDate = pt.deadline ? new Date(pt.deadline) : null;
          const lateFeePerDay = Number(pt.late_fee_per_day || 0);

          // Calculate how much was paid BEFORE the deadline
          let paidBeforeDeadline = 0;
          if (deadlineDate) {
            paidBeforeDeadline = paymentsForType
              .filter(p => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-'))
              .reduce((sum, p) => {
                const submittedAt = p.submitted_at ? new Date(p.submitted_at) : (p.created_at ? new Date(p.created_at) : null);
                if (submittedAt && submittedAt.getTime() <= deadlineDate.getTime()) {
                  return sum + Number(p.amount || 0);
                }
                return sum;
              }, 0);
          }
          const remainingAtDeadline = Math.max(0, paymentTypeAmount - paidBeforeDeadline);

          // Only apply late fees if student still owed money at the deadline
          let daysOverdue = 0;
          let accumulatedLateFees = 0;
          if (deadlineDate && now > deadlineDate && remainingAtDeadline > 0 && lateFeePerDay > 0) {
            daysOverdue = Math.floor((now.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24));
            accumulatedLateFees = daysOverdue * lateFeePerDay;
          }
          const totalDue = Math.max(0, baseRemaining) + accumulatedLateFees;

          return {
            paymentType: pt,
            payment: paymentsForType[0] || null, // Keep first payment for reference
            status,
            amountPaid,
            progress,
            baseRemaining,
            daysOverdue,
            lateFeePerDay,
            accumulatedLateFees,
            totalDue
          };
        });
        
        // Sort payment types: unpaid/pending first, then partial, then paid/waived
        const sortedCombined = combined.sort((a, b) => {
          const statusOrder = { 'not_paid': 0, 'pending': 1, 'partial': 2, 'paid': 3, 'waived': 4 };
          return statusOrder[a.status] - statusOrder[b.status];
        });
        
        // Debug logs removed for production security
        
        setActivePayments(sortedCombined);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
  }, [user?.id, refreshKey]);

  const handleLogout = async () => {
    try {
      await logout();
      navigate('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  const confirmLogout = () => {
    haptics.warning();
    setShowLogoutModal(true);
    setShowProfileMenu(false);
    setShowMobileMenu(false);
  };

  return (
    <div 
      className="min-h-screen relative overflow-x-hidden"
      style={{
        background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)',
        minHeight: '100dvh',
      }}
    >
      {/* Background Grid Pattern */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${colors.primary}40 1px, transparent 1px),
            linear-gradient(90deg, ${colors.primary}40 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Animated Gradient Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
            top: '-10%',
            right: '-5%',
            animationDuration: '4s',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${colors.accentMint} 0%, transparent 70%)`,
            bottom: '-5%',
            left: '-5%',
            animation: 'pulse 6s ease-in-out infinite',
          }}
        />
        
        {/* ECE Logo Background - Creative Element */}
        <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none">
          <img 
            src="/Ece picture.jpg" 
            alt="ECE Background"
            className="w-full h-full object-contain"
            style={{
              filter: 'grayscale(0.5) brightness(0.8)',
              mixBlendMode: 'soft-light',
            }}
          />
        </div>
      </div>

      {/* Top Navigation */}
      <motion.nav 
        className="border-b sticky top-0 z-40"
        style={{ 
          background: 'rgba(15, 7, 3, 0.95)',
          backdropFilter: 'blur(20px)',
          borderColor: 'rgba(255, 104, 3, 0.2)',
        }}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[72px] sm:h-16">
            {/* Logo */}
            <div className="flex items-center gap-2.5 p-1.5 rounded-xl" style={{ background: 'rgba(255, 104, 3, 0.06)' }}>
              <LogoCompact />
               <div className="hidden sm:block leading-tight pr-2">
                <h1 className="text-base font-extrabold text-white tracking-tight">Dues<span style={{ color: colors.primary }}>Tracker</span></h1>
                <p className="text-[10px] font-medium tracking-wider uppercase" style={{ color: colors.textTertiary }}>{user?.level || 'N/A'}</p>
                </div> 
            </div>

            {/* Center - Dashboard Switcher for Admins */}
            <div className="hidden md:flex flex-1 justify-center">
              <DashboardSwitcher variant="full" />
            </div>

            {/* Right Side - Desktop */}
            <div className="hidden md:flex items-center gap-4">
              {/* Notifications */}
              <NotificationCenter />

              {/* Profile Dropdown */}
              <div className="relative">
                <motion.button
                  onClick={() => setShowProfileMenu(!showProfileMenu)}
                  className="flex items-center gap-3 px-3 py-2 rounded-xl transition-colors"
                  style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  whileHover={{ background: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                    style={{ background: gradients.primary }}
                  >
                    {user?.full_name?.charAt(0) || 'U'}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium text-white">{user?.full_name}</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>{user?.reg_number}</p>
                  </div>
                  <ChevronDown className="w-4 h-4" style={{ color: colors.textSecondary }} />
                </motion.button>

                {/* Dropdown Menu */}
                {showProfileMenu && (
                  <motion.div
                    className="absolute right-0 mt-2 w-56 rounded-xl border overflow-hidden z-50"
                    style={{
                      background: 'rgba(15, 7, 3, 0.95)',
                      backdropFilter: 'blur(20px)',
                      borderColor: 'rgba(255, 104, 3, 0.2)',
                    }}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="p-2">
                      <button
                        onClick={() => navigate('/profile')}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                        style={{ color: colors.textPrimary }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <User size={18} />
                        <span>Profile</span>
                      </button>

                      <button
                        onClick={() => navigate('/settings')}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                        style={{ color: colors.textPrimary }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <Settings size={18} />
                        <span>Settings</span>
                      </button>

                      <div className="my-1 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />

                      <button
                        onClick={confirmLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                        style={{ color: colors.statusUnpaid }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 68, 68, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <LogOut size={18} />
                        <span>Logout</span>
                      </button>
                    </div>
                  </motion.div>
                )}
              </div>
            </div>

            {/* Right Side - Mobile */}
            <div className="flex md:hidden items-center gap-1.5">
              {/* Notifications on mobile */}
              <NotificationCenter />

              {/* Mobile Menu Button */}
              <motion.button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2 rounded-xl transition-colors"
                style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                whileHover={{ background: 'rgba(255, 255, 255, 0.1)' }}
                whileTap={{ scale: 0.95 }}
              >
                {showMobileMenu ? (
                  <CloseIcon className="w-5 h-5" style={{ color: colors.textPrimary }} />
                ) : (
                  <Menu className="w-5 h-5" style={{ color: colors.textPrimary }} />
                )}
              </motion.button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {showMobileMenu && (
          <motion.div
            className="md:hidden border-t"
            style={{ borderColor: 'rgba(255, 104, 3, 0.2)' }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="px-4 py-4 space-y-1">
              {/* User Info */}
              <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                  style={{ background: gradients.primary }}
                >
                  {user?.full_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <p className="text-sm font-medium text-white">{user?.full_name}</p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>{user?.reg_number}</p>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>{user?.level}</p>
                </div>
              </div>

              {/* Mobile Dashboard Switcher */}
              {(user?.admins && user.admins.length > 0) && (
                <div className="pb-3 border-b mb-2" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                  <DashboardSwitcher variant="compact" />
                </div>
              )}

              <button
                onClick={() => {
                  navigate('/profile');
                  setShowMobileMenu(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
                style={{ color: colors.textPrimary }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <User size={18} />
                <span>Profile</span>
              </button>

              <button
                onClick={() => { navigate('/settings'); setShowMobileMenu(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
                style={{ color: colors.textPrimary }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <Settings size={18} />
                <span>Settings</span>
              </button>

              <div className="my-1 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }} />

              <button
                onClick={confirmLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
                style={{ color: colors.statusUnpaid }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 68, 68, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          </motion.div>
        )}
      </motion.nav>

      {/* Pull to Refresh Indicator */}
      <PullToRefreshIndicator
        pullDistance={pullDistance}
        isRefreshing={isRefreshing}
        isReady={isReady}
      />

      {/* Main Content */}
      <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Welcome Section */}
        <motion.div
          className="mb-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-white mb-2">
            {(() => {
              const hour = new Date().getHours();
              if (hour < 12) return 'Good morning';
              if (hour < 17) return 'Good afternoon';
              return 'Good evening';
            })()}, {user?.full_name?.split(' ')[0]}! 👋
          </h2>
          <p className="text-sm sm:text-base" style={{ color: colors.textSecondary }}>
            Here's your payment overview and recent activity
          </p>
        </motion.div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 lg:gap-6 mb-6 sm:mb-8">
          {loading ? (
            <>
              {[1, 2, 3, 4].map((i) => (
                <motion.div
                  key={i}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.1 * i }}
                >
                  <StatCardSkeleton />
                </motion.div>
              ))}
            </>
          ) : (
            <>
              <StatCard
                title="Total Paid"
                value={settings.appearance.showBalance ? formatCurrency(stats.totalPaid) : '••••••'}
                icon={DollarSign}
                iconColor={colors.statusPaid}
                delay={0.3}
                isCurrency
              />
              <StatCard
                title="Outstanding"
                value={settings.appearance.showBalance ? formatCurrency(stats.totalDue) : '••••••'}
                icon={AlertCircle}
                iconColor={colors.warning}
                delay={0.4}
                isCurrency
              />
              <StatCard
                title="Pending Review"
                value={stats.pendingPayments}
                icon={Calendar}
                iconColor={colors.accentMint}
                delay={0.5}
              />
              <StatCard
                title="Payments Made"
                value={stats.paymentsMade}
                icon={CheckCircle}
                iconColor={colors.primary}
                delay={0.6}
              />
            </>
          )}
        </div>

        {/* My Payments Section - 2/3 + 1/3 Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6 mb-6 sm:mb-8">
          {/* Right Side - Unpaid Dues (1/3 width) - FIRST ON MOBILE, RIGHT ON DESKTOP */}
          <motion.div
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.7 }}
            className="lg:col-start-3 lg:row-start-1"
          >
            <GlassCard>
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">
                  Unpaid Dues ({mandatoryUnpaidDues.length + optionalUnpaidDues.length})
                </h3>
                {dismissedUnpaidDues.length > 0 && (
                  <button
                    onClick={() => setShowDismissed(!showDismissed)}
                    className="flex items-center gap-1.5 text-xs font-medium transition-all hover:opacity-80"
                    style={{ color: colors.textSecondary }}
                  >
                    {showDismissed ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    {showDismissed ? 'Hide' : 'Show'} Skipped ({dismissedUnpaidDues.length})
                  </button>
                )}
              </div>
              
              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <PaymentCardSkeleton key={i} />
                  ))}
                </div>
              ) : mandatoryUnpaidDues.length === 0 && optionalUnpaidDues.length === 0 ? (
                <AllPaidState />
              ) : (
                <div className="space-y-4">
                  {/* Mandatory Dues Section */}
                  {mandatoryUnpaidDues.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Star className="w-4 h-4" style={{ color: colors.statusUnpaid }} />
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.statusUnpaid }}>
                          Required ({mandatoryUnpaidDues.length})
                        </span>
                      </div>
                      {mandatoryUnpaidDues
                        .sort((a, b) => {
                          const dateA = new Date(a.paymentType.created_at || 0).getTime();
                          const dateB = new Date(b.paymentType.created_at || 0).getTime();
                          return dateA - dateB;
                        })
                        .slice(0, showAllUnpaidDues ? undefined : 2)
                        .map((item, index) => {
                          const { paymentType } = item;
                          const isOverdue = new Date(paymentType.deadline) < new Date();
                          
                          return (
                            <motion.div
                              key={paymentType.id}
                              className="relative rounded-2xl overflow-hidden transition-all cursor-pointer group"
                              style={{ 
                                background: 'linear-gradient(135deg, rgba(255, 68, 68, 0.08) 0%, rgba(255, 68, 68, 0.02) 100%)',
                                border: isOverdue ? `1px solid ${colors.statusUnpaid}40` : '1px solid rgba(255, 68, 68, 0.2)',
                              }}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.1 * index }}
                              whileHover={{ scale: 1.02, y: -2 }}
                              onClick={() => navigate(`/payment/${paymentType.id}`)}
                            >
                              {/* Overdue badge */}
                              {isOverdue && (
                                <div 
                                  className="absolute top-0 right-0 px-2 py-1 text-[10px] font-bold uppercase"
                                  style={{ 
                                    background: colors.statusUnpaid, 
                                    color: 'white',
                                    borderBottomLeftRadius: '8px'
                                  }}
                                >
                                  ⚠️ Overdue
                                </div>
                              )}
                              
                              <div className="p-4">
                                <div className="flex items-center gap-3 mb-3">
                                  <motion.div 
                                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                                    style={{ 
                                      background: `${paymentType.color || colors.statusUnpaid}15`,
                                      border: `1px solid ${paymentType.color || colors.statusUnpaid}30`
                                    }}
                                    whileHover={{ rotate: 10 }}
                                  >
                                    {paymentType.icon || 
                                     (paymentType.category === 'semester_dues' ? '🎓' : 
                                      paymentType.category === 'books' ? '📚' : 
                                      paymentType.category === 'events' ? '🎉' :
                                      paymentType.category === 'projects' ? '📊' : '💰')}
                                  </motion.div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-bold text-white text-sm truncate">{paymentType.title}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <Calendar className="w-3 h-3" style={{ color: isOverdue ? colors.statusUnpaid : colors.textSecondary }} />
                                      <p className="text-xs" style={{ color: isOverdue ? colors.statusUnpaid : colors.textSecondary }}>
                                        {formatDate(paymentType.deadline, 'short')}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Amount Due</p>
                                    <span className="text-xl font-bold text-white">{formatCurrency(item.totalDue ?? paymentType.amount)}</span>
                                    {(item.accumulatedLateFees ?? 0) > 0 && (
                                      <div className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                        Includes {formatCurrency(item.accumulatedLateFees ?? 0)} late fees ({item.daysOverdue} days)
                                      </div>
                                    )}
                                  </div>
                                  <div 
                                    className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5"
                                    style={{ 
                                      background: `${colors.statusUnpaid}15`,
                                      color: colors.statusUnpaid,
                                      border: `1px solid ${colors.statusUnpaid}30`
                                    }}
                                  >
                                    <div className="w-1.5 h-1.5 rounded-full animate-pulse" style={{ background: colors.statusUnpaid }} />
                                    REQUIRED
                                  </div>
                                </div>

                                <motion.button
                                  className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2 group-hover:shadow-lg"
                                  style={{
                                    background: gradients.primary,
                                    color: 'white',
                                    boxShadow: `0 4px 15px ${colors.primary}30`
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    haptics.medium();
                                    navigate(`/payment/${paymentType.id}`);
                                  }}
                                  whileHover={{ scale: 1.02 }}
                                  whileTap={{ scale: 0.98 }}
                                >
                                  <DollarSign className="w-4 h-4" />
                                  Pay Now
                                </motion.button>
                              </div>
                            </motion.div>
                          );
                        })}
                    </div>
                  )}

                  {/* Optional Dues Section */}
                  {optionalUnpaidDues.length > 0 && (
                    <div className="space-y-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Gift className="w-4 h-4" style={{ color: colors.primary }} />
                        <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.primary }}>
                          Optional ({optionalUnpaidDues.length})
                        </span>
                      </div>
                      {optionalUnpaidDues
                        .sort((a, b) => {
                          const dateA = new Date(a.paymentType.created_at || 0).getTime();
                          const dateB = new Date(b.paymentType.created_at || 0).getTime();
                          return dateA - dateB;
                        })
                        .slice(0, showAllUnpaidDues ? undefined : 2)
                        .map((item, index) => {
                          const { paymentType } = item;
                          const isOverdue = new Date(paymentType.deadline) < new Date();
                          
                          return (
                            <motion.div
                              key={paymentType.id}
                              className="relative rounded-2xl overflow-hidden transition-all cursor-pointer group"
                              style={{ 
                                background: 'linear-gradient(135deg, rgba(255, 104, 3, 0.06) 0%, rgba(255, 104, 3, 0.02) 100%)',
                                border: `1px solid rgba(255, 104, 3, 0.2)`,
                              }}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ delay: 0.1 * index }}
                              whileHover={{ scale: 1.02, y: -2 }}
                              onClick={() => navigate(`/payment/${paymentType.id}`)}
                            >
                              {/* Skip button */}
                              <button
                                className="absolute top-2 right-2 p-1.5 rounded-full transition-all hover:scale-110 z-10"
                                style={{ 
                                  background: 'rgba(255, 255, 255, 0.1)',
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  dismissOptionalDue(paymentType.id);
                                }}
                                title="Skip this optional due"
                              >
                                <XCircle className="w-4 h-4" style={{ color: colors.textSecondary }} />
                              </button>
                              
                              <div className="p-4">
                                <div className="flex items-center gap-3 mb-3">
                                  <motion.div 
                                    className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                                    style={{ 
                                      background: `${paymentType.color || colors.primary}15`,
                                      border: `1px solid ${paymentType.color || colors.primary}30`
                                    }}
                                    whileHover={{ rotate: 10 }}
                                  >
                                    {paymentType.icon || 
                                     (paymentType.category === 'events' ? '🎉' :
                                      paymentType.category === 'projects' ? '📊' : 
                                      paymentType.category === 'welfare' ? '❤️' : '🎁')}
                                  </motion.div>
                                  <div className="flex-1 min-w-0 pr-6">
                                    <p className="font-bold text-white text-sm truncate">{paymentType.title}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <Calendar className="w-3 h-3" style={{ color: isOverdue ? colors.statusUnpaid : colors.textSecondary }} />
                                      <p className="text-xs" style={{ color: isOverdue ? colors.statusUnpaid : colors.textSecondary }}>
                                        {formatDate(paymentType.deadline, 'short')}
                                      </p>
                                    </div>
                                  </div>
                                </div>
                                
                                <div className="flex items-center justify-between mb-3">
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Amount</p>
                                    <span className="text-xl font-bold text-white">{formatCurrency(paymentType.amount)}</span>
                                  </div>
                                  <div 
                                    className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5"
                                    style={{ 
                                      background: `${colors.primary}15`,
                                      color: colors.primary,
                                      border: `1px solid ${colors.primary}30`
                                    }}
                                  >
                                    <Gift className="w-3 h-3" />
                                    OPTIONAL
                                  </div>
                                </div>

                                <div className="flex gap-2">
                                  <motion.button
                                    className="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                                    style={{
                                      background: 'rgba(255, 255, 255, 0.1)',
                                      color: colors.textSecondary,
                                      border: '1px solid rgba(255, 255, 255, 0.1)'
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      dismissOptionalDue(paymentType.id);
                                    }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                  >
                                    Skip
                                  </motion.button>
                                  <motion.button
                                    className="flex-1 py-2 px-3 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                                    style={{
                                      background: gradients.primary,
                                      color: 'white',
                                      boxShadow: `0 4px 15px ${colors.primary}30`
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/payment/${paymentType.id}`);
                                    }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                  >
                                    <DollarSign className="w-4 h-4" />
                                    Contribute
                                  </motion.button>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                    </div>
                  )}

                  {/* Dismissed/Skipped Dues Section */}
                  <AnimatePresence>
                    {showDismissed && dismissedUnpaidDues.length > 0 && (
                      <motion.div 
                        className="space-y-3"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.3 }}
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <EyeOff className="w-4 h-4" style={{ color: colors.textSecondary }} />
                          <span className="text-xs font-bold uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                            Skipped ({dismissedUnpaidDues.length})
                          </span>
                        </div>
                        {dismissedUnpaidDues.map((item, index) => {
                          const { paymentType } = item;
                          
                          return (
                            <motion.div
                              key={paymentType.id}
                              className="relative rounded-xl overflow-hidden transition-all opacity-60"
                              style={{ 
                                background: 'rgba(255, 255, 255, 0.03)',
                                border: '1px solid rgba(255, 255, 255, 0.08)',
                              }}
                              initial={{ opacity: 0, y: 10 }}
                              animate={{ opacity: 0.6, y: 0 }}
                              transition={{ delay: 0.1 * index }}
                            >
                              <div className="p-3">
                                <div className="flex items-center justify-between">
                                  <div className="flex items-center gap-3">
                                    <div 
                                      className="w-10 h-10 rounded-lg flex items-center justify-center text-lg shrink-0"
                                      style={{ 
                                        background: 'rgba(255, 255, 255, 0.05)',
                                      }}
                                    >
                                      {paymentType.icon || '🎁'}
                                    </div>
                                    <div>
                                      <p className="font-medium text-white text-sm">{paymentType.title}</p>
                                      <p className="text-xs" style={{ color: colors.textSecondary }}>
                                        {formatCurrency(paymentType.amount)}
                                      </p>
                                    </div>
                                  </div>
                                  <button
                                    className="px-3 py-1.5 rounded-lg text-xs font-medium transition-all hover:opacity-80"
                                    style={{ 
                                      background: 'rgba(255, 255, 255, 0.1)',
                                      color: colors.textSecondary
                                    }}
                                    onClick={() => restoreDismissedDue(paymentType.id)}
                                  >
                                    Restore
                                  </button>
                                </div>
                              </div>
                            </motion.div>
                          );
                        })}
                      </motion.div>
                    )}
                  </AnimatePresence>
                  
                  {/* Expand the list without sending students away from payable dues */}
                  {(mandatoryUnpaidDues.length > 2 || optionalUnpaidDues.length > 2) && (
                    <button
                      onClick={() => setShowAllUnpaidDues(prev => !prev)}
                      className="w-full mt-3 py-2.5 px-4 rounded-lg font-medium text-sm transition-all border"
                      style={{
                        background: 'rgba(255, 255, 255, 0.05)',
                        borderColor: 'rgba(255, 104, 3, 0.3)',
                        color: colors.primary,
                      }}
                      onMouseEnter={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 104, 3, 0.1)';
                        e.currentTarget.style.borderColor = colors.primary;
                      }}
                      onMouseLeave={(e) => {
                        e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)';
                        e.currentTarget.style.borderColor = 'rgba(255, 104, 3, 0.3)';
                      }}
                    >
                      {showAllUnpaidDues
                        ? 'Show fewer dues'
                        : `Show all unpaid dues (${mandatoryUnpaidDues.length + optionalUnpaidDues.length})`}
                    </button>
                  )}
                </div>
              )}
            </GlassCard>
          </motion.div>

          {/* Left Side - Submitted Payments (2/3 width) - SECOND ON MOBILE, LEFT ON DESKTOP */}
          <motion.div
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.8 }}
            className="lg:col-span-2 lg:col-start-1 lg:row-start-1"
          >
            <GlassCard>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-white">
                  My Payments ({activePayments.filter(p => p.status !== 'not_paid').length})
                </h3>
                <button
                  onClick={() => navigate('/payments')}
                  className="text-sm font-medium hover:underline"
                  style={{ color: colors.primary }}
                >
                  View History
                </button>
              </div>

              {loading ? (
                <div className="space-y-3">
                  {[1, 2, 3].map((i) => (
                    <PaymentCardSkeleton key={i} />
                  ))}
                </div>
              ) : activePayments.filter(p => p.status !== 'not_paid').length === 0 ? (
                <EmptyState
                  illustration="payments"
                  title="No payments yet"
                  description="Check 'Unpaid Dues' to make your first payment"
                  size="sm"
                />
              ) : (
                <div className="space-y-3">
                  {activePayments
                    .filter(p => p.status !== 'not_paid')
                    .map((item, index) => {
                      const { paymentType, status, amountPaid, progress } = item;
                      
                      // Get status styling
                      const getStatusConfig = () => {
                        switch(status) {
                          case 'paid':
                            return { 
                              color: colors.statusPaid, 
                              bg: `linear-gradient(135deg, ${colors.statusPaid}10 0%, ${colors.statusPaid}05 100%)`,
                              border: `${colors.statusPaid}25`,
                              label: 'PAID',
                              icon: '✅'
                            };
                          case 'waived':
                            return { 
                              color: '#6366F1', // Professional Indigo for waived
                              bg: `linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(99, 102, 241, 0.05) 100%)`,
                              border: 'rgba(99, 102, 241, 0.25)',
                              label: 'WAIVED',
                              icon: '🔓'
                            };
                          case 'partial':
                            return { 
                              color: colors.warning, 
                              bg: `linear-gradient(135deg, ${colors.warning}10 0%, ${colors.warning}05 100%)`,
                              border: `${colors.warning}25`,
                              label: `${Math.round(progress)}%`,
                              icon: '🟠'
                            };
                          case 'pending':
                            return {
                              color: colors.statusPending,
                              bg: `linear-gradient(135deg, ${colors.statusPending}08 0%, transparent 100%)`,
                              border: `${colors.statusPending}20`,
                              label: 'PENDING',
                              icon: '⏳'
                            };
                          default:
                            return { 
                              color: colors.textSecondary, 
                              bg: 'rgba(255,255,255,0.03)',
                              border: 'rgba(255,255,255,0.1)',
                              label: 'UNKNOWN',
                              icon: '❓'
                            };
                        }
                      };
                      
                      const statusConfig = getStatusConfig();
                      
                      return (
                        <motion.div
                          key={paymentType.id}
                          className="relative rounded-2xl overflow-hidden transition-all cursor-pointer group"
                          style={{ 
                            background: statusConfig.bg,
                            border: `1px solid ${statusConfig.border}`,
                          }}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 * index }}
                          whileHover={{ scale: 1.01 }}
                          onClick={() => navigate(`/payment/${paymentType.id}`)}
                        >
                          {/* Top accent bar */}
                          <div 
                            className="absolute top-0 left-0 right-0 h-1"
                            style={{ background: statusConfig.color }}
                          />
                          
                          <div className="p-4 pt-5">
                            <div className="flex items-start justify-between gap-3">
                              {/* Left: Icon and Info */}
                              <div className="flex items-center gap-3 flex-1 min-w-0">
                                <motion.div 
                                  className="w-12 h-12 rounded-xl flex items-center justify-center text-2xl shrink-0"
                                  style={{ 
                                    background: `${paymentType.color || statusConfig.color}15`,
                                    border: `1px solid ${paymentType.color || statusConfig.color}30`
                                  }}
                                  whileHover={{ rotate: 5 }}
                                >
                                  {paymentType.icon || 
                                   (paymentType.category === 'semester_dues' ? '🎓' : 
                                    paymentType.category === 'books' ? '📚' : 
                                    paymentType.category === 'events' ? '🎉' :
                                    paymentType.category === 'projects' ? '📊' : '💰')}
                                </motion.div>
                                <div className="flex-1 min-w-0">
                                  <h4 className="font-bold text-white text-sm sm:text-base truncate">
                                    {paymentType.title}
                                  </h4>
                                  <div className="flex items-center gap-2 mt-0.5">
                                    <span 
                                      className="text-[10px] px-2 py-0.5 rounded-full font-medium"
                                      style={{ 
                                        background: 'rgba(255,255,255,0.08)',
                                        color: colors.textSecondary
                                      }}
                                    >
                                      {paymentType.category.replace('_', ' ')}
                                    </span>
                                    <span className="text-xs" style={{ color: colors.textSecondary }}>
                                      • {formatDate(paymentType.deadline, 'short')}
                                    </span>
                                  </div>
                                </div>
                              </div>

                              {/* Right: Status Badge */}
                              <div 
                                className="px-3 py-1.5 rounded-full text-xs font-bold flex items-center gap-1.5 shrink-0"
                                style={{ 
                                  background: `${statusConfig.color}15`,
                                  color: statusConfig.color,
                                  border: `1px solid ${statusConfig.color}30`
                                }}
                              >
                                <span>{statusConfig.icon}</span>
                                <span>{statusConfig.label}</span>
                              </div>
                            </div>

                            {/* Progress bar for partial payments */}
                            {status === 'partial' && (
                              <div className="mt-3">
                                <div className="flex items-center justify-between text-xs mb-1.5">
                                  <span style={{ color: colors.textSecondary }}>Progress</span>
                                  <span className="font-semibold" style={{ color: colors.warning }}>
                                    {formatCurrency(amountPaid)} / {formatCurrency(item.totalDue ?? paymentType.amount)}
                                  </span>
                                </div>
                                <div 
                                  className="h-2.5 rounded-full overflow-hidden"
                                  style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                                >
                                  <motion.div 
                                    className="h-full rounded-full relative"
                                    style={{ 
                                      background: `linear-gradient(90deg, ${colors.warning}, ${colors.accentMint})`,
                                    }}
                                    initial={{ width: 0 }}
                                    animate={{ width: `${progress}%` }}
                                    transition={{ duration: 0.8, ease: "easeOut" }}
                                  >
                                    <div 
                                      className="absolute inset-0"
                                      style={{ 
                                        background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                                        animation: 'shimmer 2s infinite'
                                      }}
                                    />
                                  </motion.div>
                                </div>
                              </div>
                            )}

                            <div className="mt-3 flex items-center justify-between">
                              <div>
                                {status === 'waived' ? (
                                  <div>
                                    <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                      Payment Status
                                    </p>
                                    <p className="text-sm font-medium" style={{ color: '#9CA3AF' }}>
                                      Fee waived - ₦0 paid
                                    </p>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                      {status === 'paid' ? 'Amount Paid' : 'Total Amount'}
                                    </p>
                                    <span className="text-lg font-bold text-white">
                                      {formatCurrency(status === 'paid' ? amountPaid || paymentType.amount : (item.totalDue ?? paymentType.amount))}
                                    </span>
                                    {status !== 'paid' && (item.accumulatedLateFees ?? 0) > 0 && (
                                      <p className="text-xs mt-0.5" style={{ color: colors.statusUnpaid }}>
                                        +{formatCurrency(item.accumulatedLateFees ?? 0)} late fee
                                      </p>
                                    )}
                                  </>
                                )}
                              </div>
                              
                              {/* Action buttons based on status */}
                              <div className="flex gap-2">
                                {status === 'partial' && (
                                  <motion.button
                                    className="px-4 py-2 rounded-xl font-semibold text-xs transition-all flex items-center gap-1.5"
                                    style={{
                                      background: gradients.primary,
                                      color: 'white',
                                      boxShadow: `0 4px 12px ${colors.primary}25`
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/payment/${paymentType.id}`);
                                    }}
                                    whileHover={{ scale: 1.02 }}
                                    whileTap={{ scale: 0.98 }}
                                  >
                                    <DollarSign className="w-3.5 h-3.5" />
                                    Complete
                                  </motion.button>
                                )}
                                {status === 'pending' && (
                                  <motion.button
                                    className="px-4 py-2 rounded-xl font-semibold text-xs transition-all flex items-center gap-1.5"
                                    style={{
                                      background: 'rgba(255,255,255,0.08)',
                                      color: colors.textPrimary,
                                      border: '1px solid rgba(255,255,255,0.1)'
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate('/payments');
                                    }}
                                    whileHover={{ background: 'rgba(255,255,255,0.12)' }}
                                    whileTap={{ scale: 0.98 }}
                                  >
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    View Status
                                  </motion.button>
                                )}
                                {(status === 'paid' || status === 'waived') && (
                                  <motion.button
                                    className="px-4 py-2 rounded-xl font-semibold text-xs transition-all flex items-center gap-1.5"
                                    style={{
                                      background: 'rgba(255,255,255,0.08)',
                                      color: colors.textPrimary,
                                      border: '1px solid rgba(255,255,255,0.1)'
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      navigate(`/payment/${paymentType.id}`);
                                    }}
                                    whileHover={{ background: 'rgba(255,255,255,0.12)' }}
                                    whileTap={{ scale: 0.98 }}
                                  >
                                    View Details
                                  </motion.button>
                                )}
                              </div>
                            </div>
                          </div>
                        </motion.div>
                      );
                    })}
                </div>
              )}
            </GlassCard>
          </motion.div>
        </div>

        {/* Student Professional Features Section */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
          className="space-y-6 mb-6 sm:mb-8"
        >
          {/* Student Features - Controlled by Admin Settings */}
          {!featuresLoading && (
            <>
              {/* Deadline Reminders - Full Width */}
              {features.deadlineReminders && <SmartDeadlineReminders />}

              {/* Two Column Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                {/* Left Column */}
                <div className="space-y-4 sm:space-y-6">
                  {features.classProgress && <ClassProgressVisualization />}
                  {features.paymentSummary && <QuickPaymentSummary />}
                </div>

                {/* Right Column */}
                <div className="space-y-4 sm:space-y-6">
                  {features.expenseTransparency && <ExpenseTransparencyDashboard />}
                  {features.achievements && <AchievementSystem />}
                </div>
              </div>
            </>
          )}
        </motion.div>
      </div>

  {/* Floating Action Button - Admin/Finsec/Class Rep */}
  {hasPermission('can_create_payments') && (
        <motion.button
          className="fixed bottom-8 right-8 w-16 h-16 rounded-full flex items-center justify-center shadow-2xl z-50"
          style={{
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => navigate('/admin/create-payment')}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1 }}
          title="Create New Payment"
        >
          <Plus size={28} className="text-white" />
        </motion.button>
      )}

      {/* Push Notification Prompt */}
      <PushNotificationPrompt mode="banner" />

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutModal && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            {/* Backdrop */}
            <motion.div 
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowLogoutModal(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            
            {/* Modal */}
            <motion.div
              className="relative w-full max-w-sm rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(145deg, #1A1A1A 0%, #0D0D0D 100%)',
                border: '1px solid rgba(255, 68, 68, 0.3)',
                boxShadow: '0 25px 50px rgba(255, 68, 68, 0.15)'
              }}
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
            >
              {/* Header with danger icon */}
              <div 
                className="p-6 text-center"
                style={{ 
                  background: 'linear-gradient(180deg, rgba(255, 68, 68, 0.15) 0%, transparent 100%)'
                }}
              >
                <div 
                  className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4"
                  style={{ 
                    background: 'rgba(255, 68, 68, 0.15)',
                    border: '2px solid rgba(255, 68, 68, 0.3)'
                  }}
                >
                  <AlertTriangle className="w-8 h-8" style={{ color: colors.statusUnpaid }} />
                </div>
                
                <h3 className="text-xl font-bold text-white mb-2">
                  Logout Confirmation
                </h3>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Are you sure you want to logout? You'll need to sign in again to access your account.
                </p>
              </div>
              
              {/* Actions */}
              <div className="p-4 flex gap-3">
                <motion.button
                  className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all"
                  style={{
                    background: 'rgba(255, 255, 255, 0.08)',
                    color: colors.textPrimary,
                    border: '1px solid rgba(255, 255, 255, 0.1)'
                  }}
                  onClick={() => setShowLogoutModal(false)}
                  whileHover={{ scale: 1.02, background: 'rgba(255, 255, 255, 0.12)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  Cancel
                </motion.button>
                
                <motion.button
                  className="flex-1 py-3 px-4 rounded-xl font-semibold text-sm transition-all flex items-center justify-center gap-2"
                  style={{
                    background: 'linear-gradient(135deg, #FF4444, #CC3333)',
                    color: 'white',
                    boxShadow: '0 4px 15px rgba(255, 68, 68, 0.3)'
                  }}
                  onClick={handleLogout}
                  whileHover={{ scale: 1.02, boxShadow: '0 6px 20px rgba(255, 68, 68, 0.4)' }}
                  whileTap={{ scale: 0.98 }}
                >
                  <LogOut className="w-4 h-4" />
                  Yes, Logout
                </motion.button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <Footer />
    </div>
  );
}
