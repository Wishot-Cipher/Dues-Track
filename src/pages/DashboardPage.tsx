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

export default function DashboardPage() {
  const { user, logout } = useAuth();
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
        
        // Log current user for debugging
        console.log('🔍 Fetching data for student:', {
          id: user.id,
          name: user.full_name,
          reg_number: user.reg_number
        });
        
        const [statsData, paymentTypesData, paymentsData] = await Promise.all([
          paymentService.getStudentPaymentStats(user.id),
          paymentService.getActivePaymentTypesForStudent(user.id),
          paymentService.getStudentPayments(user.id),
        ]);

        // Log fetched data for verification
        console.log('📊 Student Stats:', statsData);
        console.log('💰 Payment Types for student:', paymentTypesData.length);
        console.log('📝 Payments made by student:', paymentsData);
        console.log('🔍 Payment details:', paymentsData.map(p => ({
          payment_type_id: p.payment_type_id,
          student_id: p.student_id,
          amount: p.amount,
          status: p.status,
          is_mine: p.student_id === user.id
        })));

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
        
        console.log('✅ Final sorted payments:', sortedCombined.map(p => ({
          title: p.paymentType.title,
          status: p.status,
          amountPaid: p.amountPaid
        })));
        
        setActivePayments(sortedCombined);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboardData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      className="min-h-screen relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)',
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
            <div className="flex items-center gap-3">
              <motion.div
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ background: gradients.primary }}
                whileHover={{ scale: 1.05, rotate: 5 }}
              >
                <Wallet className="w-5 h-5 text-white" />
              </motion.div>
              <div className="hidden sm:block">
                <h1 className="text-lg font-bold text-white">Class Dues</h1>
                <p className="text-xs" style={{ color: colors.textSecondary }}>{user?.level || 'N/A'}</p>
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
                      {user?.roles?.includes('admin') && (
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
                        onClick={() => {/* Navigate to settings */}}
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

              {user?.roles?.includes('admin') && (
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
                onClick={() => setShowMobileMenu(false)}
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
          <StatCard
            title="Total Paid"
            value={formatCurrency(stats.totalPaid)}
            icon={DollarSign}
            iconColor={colors.statusPaid}
            delay={0.3}
          />
          <StatCard
            title="Outstanding"
            value={formatCurrency(stats.totalDue)}
            icon={AlertCircle}
            iconColor={colors.warning}
            delay={0.4}
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
        </div>

        {/* My Payments Section - 2/3 + 1/3 Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
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
                <div className="text-center py-8">
                  <div className="animate-spin w-6 h-6 border-4 border-t-transparent rounded-full mx-auto mb-3" 
                       style={{ borderColor: colors.primary, borderTopColor: 'transparent' }} />
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Loading...</p>
                </div>
              ) : activePayments.filter(p => p.status === 'not_paid').length === 0 ? (
                <div className="text-center py-8">
                  <CheckCircle size={48} className="mx-auto mb-3" style={{ color: colors.statusPaid }} />
                  <p className="text-sm font-medium" style={{ color: colors.statusPaid }}>All Caught Up!</p>
                  <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                    You have no outstanding payments
                  </p>
                </div>
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
                          className="p-3 rounded-xl border transition-all"
                          style={{ 
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderColor: isOverdue ? `${colors.statusUnpaid}50` : `${colors.statusUnpaid}30`
                          }}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 * index }}
                        >
                          <div className="flex items-center gap-2 mb-2">
                            <div className="text-xl">
                              {paymentType.icon || 
                               (paymentType.category === 'semester_dues' ? '🎓' : 
                                paymentType.category === 'books' ? '📚' : 
                                paymentType.category === 'events' ? '🎉' :
                                paymentType.category === 'projects' ? '📊' : '💰')}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="font-semibold text-white text-sm truncate">{paymentType.title}</p>
                              <p className="text-xs" style={{ color: isOverdue ? colors.statusUnpaid : colors.textSecondary }}>
                                {isOverdue ? '⚠️ Overdue' : `Due: ${formatDate(paymentType.deadline, 'short')}`}
                              </p>
                            </div>
                          </div>
                          
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-base font-bold text-white">{formatCurrency(paymentType.amount)}</span>
                            <div 
                              className="px-2 py-0.5 rounded-full text-xs font-medium"
                              style={{ 
                                background: `${colors.statusUnpaid}20`,
                                color: colors.statusUnpaid
                              }}
                            >
                              NOT PAID
                            </div>
                          </div>

                          <button
                            className="w-full py-2 px-3 rounded-lg font-medium text-xs transition-all"
                            style={{
                              background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
                              color: 'white'
                            }}
                            onClick={(e) => {
                              e.stopPropagation();
                              navigate(`/payment/${paymentType.id}`);
                            }}
                            onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                          >
                            💰 PAY NOW
                          </button>
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
                <div className="text-center py-12">
                  <div className="animate-spin w-8 h-8 border-4 border-t-transparent rounded-full mx-auto mb-3" 
                       style={{ borderColor: colors.primary, borderTopColor: 'transparent' }} />
                  <p className="text-sm" style={{ color: colors.textSecondary }}>Loading payments...</p>
                </div>
              ) : activePayments.filter(p => p.status !== 'not_paid').length === 0 ? (
                <div className="text-center py-12">
                  <Wallet size={48} className="mx-auto mb-3 opacity-20" style={{ color: colors.textSecondary }} />
                  <p className="text-sm" style={{ color: colors.textSecondary }}>No payments submitted yet</p>
                  <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                    Check "Unpaid Dues" to make your first payment
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {activePayments
                    .filter(p => p.status !== 'not_paid')
                    .map((item, index) => {
                      const { paymentType, status, amountPaid, progress } = item;
                      
                      return (
                        <motion.div
                          key={paymentType.id}
                          className="p-4 rounded-xl border transition-all"
                          style={{ 
                            background: 'rgba(255, 255, 255, 0.03)',
                            borderColor: status === 'paid' ? `${colors.statusPaid}30` : 
                                        status === 'waived' ? `${colors.accentMint}30` :
                                        status === 'partial' ? `${colors.warning}30` :
                                        status === 'pending' ? `${colors.accentMint}30` :
                                        'rgba(255, 255, 255, 0.1)'
                          }}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: 0.1 * index }}
                        >
                          <div className="flex items-start justify-between gap-3">
                            {/* Left: Icon and Info */}
                            <div className="flex items-center gap-3 flex-1 min-w-0">
                              <div className="text-2xl shrink-0">
                                {paymentType.icon || 
                                 (paymentType.category === 'semester_dues' ? '🎓' : 
                                  paymentType.category === 'books' ? '📚' : 
                                  paymentType.category === 'events' ? '🎉' :
                                  paymentType.category === 'projects' ? '📊' : '💰')}
                              </div>
                              <div className="flex-1 min-w-0">
                                <h4 className="font-semibold text-white text-sm sm:text-base truncate">
                                  {paymentType.title}
                                </h4>
                                <p className="text-xs" style={{ color: colors.textSecondary }}>
                                  {paymentType.category.replace('_', ' ')} • Due: {formatDate(paymentType.deadline, 'short')}
                                </p>
                                {status === 'partial' && (
                                  <div className="mt-2">
                                    <div className="h-2 rounded-full overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.1)' }}>
                                      <div 
                                        className="h-full transition-all duration-300" 
                                        style={{ 
                                          width: `${progress}%`,
                                          background: `linear-gradient(90deg, ${colors.warning}, ${colors.accentMint})`
                                        }} 
                                      />
                                    </div>
                                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                      {formatCurrency(amountPaid)} / {formatCurrency(paymentType.amount)}
                                    </p>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* Right: Status and Action */}
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <div 
                                className="px-3 py-1 rounded-full text-xs font-medium whitespace-nowrap"
                                style={{ 
                                  background: status === 'paid' ? `${colors.statusPaid}20` :
                                             status === 'waived' ? `${colors.accentMint}20` :
                                             status === 'partial' ? `${colors.warning}20` :
                                             `${colors.accentMint}20`,
                                  color: status === 'paid' ? colors.statusPaid :
                                         status === 'waived' ? colors.accentMint :
                                         status === 'partial' ? colors.warning :
                                         colors.accentMint
                                }}
                              >
                                {status === 'paid' ? '✅ PAID' :
                                 status === 'waived' ? '✨ WAIVED' :
                                 status === 'partial' ? `🟠 ${Math.round(progress)}%` :
                                 '🟡 PENDING'}
                              </div>
                              {status === 'waived' ? (
                                <span className="text-xs" style={{ color: colors.accentMint }}>
                                  No payment required
                                </span>
                              ) : (
                                <span className="text-sm font-bold text-white">
                                  {formatCurrency(paymentType.amount)}
                                </span>
                              )}
                            </div>
                          </div>

                          {/* Action Buttons */}
                          <div className="mt-3 flex gap-2">
                            {status === 'waived' && (
                              <div className="w-full py-2 px-3 rounded-lg text-xs text-center" style={{ background: `${colors.accentMint}10`, color: colors.accentMint }}>
                                ✅ Payment waived by admin
                              </div>
                            )}
                            {status === 'paid' && (
                              <>
                                <button
                                  className="flex-1 py-2 px-3 rounded-lg font-medium text-xs transition-all"
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    color: 'white'
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    // Download receipt logic
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                                >
                                  📥 Download Receipt
                                </button>
                                <button
                                  className="flex-1 py-2 px-3 rounded-lg font-medium text-xs transition-all"
                                  style={{
                                    background: 'rgba(255, 255, 255, 0.1)',
                                    color: 'white'
                                  }}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    navigate(`/payment/${paymentType.id}`);
                                  }}
                                  onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                  onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                                >
                                  👁️ View Details
                                </button>
                              </>
                            )}
                            {status === 'pending' && (
                              <button
                                className="w-full py-2 px-3 rounded-lg font-medium text-xs transition-all"
                                style={{
                                  background: 'rgba(255, 255, 255, 0.1)',
                                  color: 'white'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate('/payments');
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
                                onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.1)'}
                              >
                                👁️ View Status
                              </button>
                            )}
                            {status === 'partial' && (
                              <button
                                className="w-full py-2 px-3 rounded-lg font-medium text-xs transition-all"
                                style={{
                                  background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
                                  color: 'white'
                                }}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  navigate(`/payment/${paymentType.id}`);
                                }}
                                onMouseEnter={(e) => e.currentTarget.style.transform = 'scale(1.02)'}
                                onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}
                              >
                                💰 Complete Payment
                              </button>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                </div>
              )}
            </GlassCard>
          </motion.div>
        </div>
      </div>

      {/* Floating Action Button - Admin/Finsec/Class Rep */}
      {user?.roles && (user.roles.includes('admin') || user.roles.includes('finsec') || user.roles.includes('class_rep')) && (
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
