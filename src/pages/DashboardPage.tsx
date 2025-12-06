import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { 
  User, 
  Wallet, 
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
  LayoutDashboard
} from 'lucide-react';
import { colors, gradients } from '@/config/colors';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate, useLocation } from 'react-router-dom';
import GlassCard from '@/components/ui/GlassCard';
import { formatCurrency, formatDate } from '@/utils/formatters';
import paymentService from '@/services/paymentService';
import type { Payment, PaymentType, PaymentStats } from '@/types';
import { StatCard } from '@/components/dashboard/StatCard';
import { NotificationCenter } from '@/components/NotificationCenter';
import Footer from '@/components/Footer';
import ExpenseTransparencyDashboard from '@/components/student/ExpenseTransparencyDashboard';
import AchievementSystem from '@/components/student/AchievementSystem';
import SmartDeadlineReminders from '@/components/student/SmartDeadlineReminders';
import ClassProgressVisualization from '@/components/student/ClassProgressVisualization';
import QuickPaymentSummary from '@/components/student/QuickPaymentSummary';
import { useStudentFeatures } from '@/hooks/useStudentFeatures';
import { StatCardSkeleton, PaymentCardSkeleton } from '@/components/ui/Skeleton';
import EmptyState, { AllPaidState } from '@/components/ui/EmptyState';
import { useSettings } from '@/contexts/SettingsContext';

export default function DashboardPage() {
  const { user, logout, hasPermission } = useAuth();
  const { features, loading: featuresLoading } = useStudentFeatures();
  const { settings } = useSettings();
  const navigate = useNavigate();
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  
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
  }>>([]);

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
              progress = 100; // Show as complete
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
          
          return {
            paymentType: pt,
            payment: paymentsForType[0] || null, // Keep first payment for reference
            status,
            amountPaid,
            progress
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
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            {/* Logo */}
            <div className="flex items-center gap-3 mr-4">
              <motion.div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: gradients.primary }}
                whileHover={{ scale: 1.05, rotate: 5 }}
              >
                <Wallet className="w-5 h-5 text-white" />
              </motion.div>
               <div className="hidden sm:block leading-tight">
                <h1 className="text-lg font-bold text-white">Class Dues</h1>
                <p className="text-xs pb-0.5" style={{ color: colors.textSecondary }}>{user?.level || 'N/A'}</p>
                </div> 
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

                      {/* Admin Dashboard Link - Only visible for admins */}
                      {(user?.admins && user.admins.length > 0) && (
                        <button
                          onClick={() => navigate('/admin/dashboard')}
                          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                          style={{ color: colors.primary }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 104, 3, 0.1)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                        >
                          <LayoutDashboard size={18} />
                          <span>Admin Dashboard</span>
                        </button>
                      )}

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
                        onClick={handleLogout}
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
            <div className="flex md:hidden items-center gap-2">
              {/* Notifications on mobile */}
              <NotificationCenter />

              {/* Mobile Menu Button */}
              <motion.button
                onClick={() => setShowMobileMenu(!showMobileMenu)}
                className="p-2.5 rounded-xl transition-colors"
                style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                whileHover={{ background: 'rgba(255, 255, 255, 0.1)' }}
                whileTap={{ scale: 0.95 }}
              >
                {showMobileMenu ? (
                  <CloseIcon className="w-6 h-6" style={{ color: colors.textPrimary }} />
                ) : (
                  <Menu className="w-6 h-6" style={{ color: colors.textPrimary }} />
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

              {(user?.admins && user.admins.length > 0) && (
                <button
                  onClick={() => {
                    navigate('/admin/dashboard');
                    setShowMobileMenu(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
                  style={{ color: colors.primary }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 104, 3, 0.1)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                >
                  <LayoutDashboard size={18} />
                  <span>Admin Dashboard</span>
                </button>
              )}

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
                onClick={handleLogout}
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
            Welcome back, {user?.full_name?.split(' ')[0]}! 👋
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
              <h3 className="text-xl font-bold text-white mb-6">
                Unpaid Dues ({activePayments.filter(p => p.status === 'not_paid').length})
              </h3>
              
              {loading ? (
                <div className="space-y-3">
                  {[1, 2].map((i) => (
                    <PaymentCardSkeleton key={i} />
                  ))}
                </div>
              ) : activePayments.filter(p => p.status === 'not_paid').length === 0 ? (
                <AllPaidState />
              ) : (
                <div className="space-y-3">
                  {activePayments
                    .filter(p => p.status === 'not_paid')
                    .sort((a, b) => {
                      // Sort by created_at in ascending order (oldest first)
                      const dateA = new Date(a.paymentType.created_at || 0).getTime();
                      const dateB = new Date(b.paymentType.created_at || 0).getTime();
                      return dateA - dateB;
                    })
                    .slice(0, 3) // Show only first 3 unpaid dues
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
                                <span className="text-xl font-bold text-white">{formatCurrency(paymentType.amount)}</span>
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
                                UNPAID
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
                  
                  {/* View All Button if more than 3 unpaid dues */}
                  {activePayments.filter(p => p.status === 'not_paid').length > 3 && (
                    <button
                      onClick={() => navigate('/payments')}
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
                      View All Unpaid Dues ({activePayments.filter(p => p.status === 'not_paid').length}) →
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
                              color: colors.accentMint, 
                              bg: `linear-gradient(135deg, ${colors.accentMint}10 0%, ${colors.accentMint}05 100%)`,
                              border: `${colors.accentMint}25`,
                              label: 'WAIVED',
                              icon: '✨'
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
                              color: colors.accentMint, 
                              bg: `linear-gradient(135deg, ${colors.accentMint}08 0%, transparent 100%)`,
                              border: `${colors.accentMint}20`,
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
                                    {formatCurrency(amountPaid)} / {formatCurrency(paymentType.amount)}
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

                            {/* Amount and Actions */}
                            <div className="mt-3 flex items-center justify-between">
                              <div>
                                {status === 'waived' ? (
                                  <p className="text-sm" style={{ color: colors.accentMint }}>
                                    No payment required
                                  </p>
                                ) : (
                                  <>
                                    <p className="text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>
                                      {status === 'paid' ? 'Amount Paid' : 'Total Amount'}
                                    </p>
                                    <span className="text-lg font-bold text-white">
                                      {formatCurrency(status === 'paid' ? amountPaid || paymentType.amount : paymentType.amount)}
                                    </span>
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

      {/* Footer */}
      <Footer />
    </div>
  );
}
