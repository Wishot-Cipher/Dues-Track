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
import { useAppAuth as useAuth } from '@/hooks/useAppAuth';
import { useAppNav } from '@/hooks/useAppNav';
import { useLocation } from 'react-router-dom';
import GlassCard from '@/components/ui/GlassCard';
import { LogoCompact } from '@/components/ui/Logo';
import { formatCurrency, formatDate } from '@/utils/formatters';
import paymentService from '@/services/paymentService';
import type { Payment, PaymentType, PaymentStats } from '@/types';
import { StatCard } from '@/components/dashboard/StatCard';
import { PrivacyMask, PrivacyToggle } from '@/components/ui/PrivacyMask';
import { NotificationCenter } from '@/components/NotificationCenter';
import PushNotificationPrompt from '@/components/PushNotificationPrompt';
import Footer from '@/components/Footer';
import ExpenseTransparencyDashboard from '@/components/student/ExpenseTransparencyDashboard';
import AchievementSystem from '@/components/student/AchievementSystem';
import SmartDeadlineReminders from '@/components/student/SmartDeadlineReminders';
import DashboardSwitcher from '@/components/DashboardSwitcher';
import ClassProgressVisualization from '@/components/student/ClassProgressVisualization';
import QuickPaymentSummary from '@/components/student/QuickPaymentSummary';
import ProgressBar from '@/components/ui/ProgressBar';
import { Printer } from 'lucide-react';
import { useStudentFeatures } from '@/hooks/useStudentFeatures';
import { StatCardSkeleton, PaymentCardSkeleton } from '@/components/ui/Skeleton';
import EmptyState, { AllPaidState } from '@/components/ui/EmptyState';
import { useSettings } from '@/contexts/SettingsContext';
import haptics from '@/lib/haptics';
import usePullToRefresh from '@/hooks/usePullToRefresh';
import PullToRefreshIndicator from '@/components/ui/PullToRefreshIndicator';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';

export default function DashboardPage() {
  const { user, logout, hasPermission } = useAuth();
  const { features, loading: featuresLoading } = useStudentFeatures();
  const { settings } = useSettings();
  const { go, orgSlug } = useAppNav();
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);
  const location = useLocation();
  const [showProfileMenu, setShowProfileMenu] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showWelcomeModal, setShowWelcomeModal] = useState(false);
  const [welcomeOrgName, setWelcomeOrgName] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  
  // When inside OrgLayout (multi-tenant), hide the page's built-in nav
  const isMultiTenant = !!orgSlug;

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

  // Displayed stats: adjust totalDue to exclude dismissed optional unpaid dues
  const displayedStats = useMemo(() => {
    const dismissedSum = dismissedUnpaidDues.reduce((sum, item) => {
      return sum + (Number(item.totalDue || item.paymentType.amount || 0));
    }, 0);
    return {
      ...stats,
      totalDue: Math.max(0, Number(stats.totalDue || 0) - dismissedSum),
    };
  }, [stats, dismissedUnpaidDues]);

  // Check if we need to refresh based on navigation state
  useEffect(() => {
    if (location.state && (location.state as { refresh?: boolean }).refresh) {
      setRefreshKey(prev => prev + 1);
      // Clear the state so it doesn't refresh again on next navigation
      window.history.replaceState({}, document.title);
    }
    // Show welcome modal for new members who just joined via invite link
    if (location.state && (location.state as { justJoined?: boolean }).justJoined) {
      const orgName = (location.state as { orgName?: string }).orgName || '';
      setWelcomeOrgName(orgName);
      setShowWelcomeModal(true);
      // Clear the state so modal doesn't re-appear on navigation
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

  // Print a professional payment summary HTML doc
  const printPaymentSummary = () => {
    const payments = activePayments.filter(p => p.status !== 'not_paid');
    if (payments.length === 0) return;
    const fmtCurr = (n: number) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
    const fmtDate = (d: string) => new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
    const statusLabel = (s: string) => ({ paid: 'PAID', pending: 'PENDING', partial: 'PARTIAL', waived: 'WAIVED' }[s] || s.toUpperCase());
    const statusColor = (s: string) => ({ paid: '#059669', pending: '#d97706', partial: '#ea580c', waived: '#6366f1' }[s] || '#64748b');
    const rows = payments.map(p => `
      <tr>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;font-weight:500;">${p.paymentType.title}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;">${p.paymentType.category?.replace('_', ' ') || '—'}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;">${fmtCurr(p.totalDue ?? p.paymentType.amount)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:right;color:${statusColor(p.status)}; font-weight:600;">${fmtCurr(p.amountPaid)}</td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;">
          <span style="display:inline-block;padding:3px 10px;border-radius:999px;font-size:11px;font-weight:700;color:white;background:${statusColor(p.status)};">${statusLabel(p.status)}</span>
        </td>
        <td style="padding:10px 12px;border-bottom:1px solid #e2e8f0;text-align:center;font-size:12px;">${p.paymentType.deadline ? fmtDate(p.paymentType.deadline) : '—'}</td>
      </tr>`).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Payment Summary - ${user?.full_name}</title>
<style>@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
*{box-sizing:border-box;margin:0;padding:0}body{font-family:'Inter',sans-serif;color:#0f172a;background:#fff;padding:32px}
.page{max-width:800px;margin:0 auto}
.header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #FF6803}
.brand{font-size:20px;font-weight:800;color:#0F0703}.brand span{color:#FF6803}
.meta{text-align:right;font-size:12px;color:#64748b;line-height:1.8}
.stats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:24px}
.stat{background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;padding:14px;text-align:center}
.stat-val{font-size:20px;font-weight:800;color:#0F0703}.stat-label{font-size:11px;color:#64748b;text-transform:uppercase;letter-spacing:1px;margin-top:4px}
table{width:100%;border-collapse:collapse;font-size:13px}
thead th{padding:10px 12px;text-align:left;font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:1px;color:#64748b;background:#f8fafc;border-bottom:2px solid #e2e8f0}
.footer{margin-top:24px;padding-top:12px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8}
.no-print{text-align:center;margin-top:16px}
.btn-print{padding:10px 28px;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-family:'Inter',sans-serif;
background:linear-gradient(135deg,#FF6803,#FFAC5F);color:white;font-size:14px}
@media print{.no-print{display:none!important}}
</style></head><body>
<div class="page">
<div class="header"><div><div class="brand">Pay<span>vexo</span></div><div style="font-size:11px;color:#64748b;margin-top:2px">Payment Summary</div></div>
<div class="meta"><strong>${user?.full_name}</strong><br>${user?.reg_number || ''}<br>${new Date().toLocaleDateString('en-US',{year:'numeric',month:'long',day:'numeric'})}</div></div>
<div class="stats">
<div class="stat"><div class="stat-val">${fmtCurr(stats.totalPaid)}</div><div class="stat-label">Total Paid</div></div>
<div class="stat"><div class="stat-val">${fmtCurr(displayedStats.totalDue)}</div><div class="stat-label">Total Due</div></div>
<div class="stat"><div class="stat-val">${stats.paymentsMade}</div><div class="stat-label">Payments</div></div>
<div class="stat"><div class="stat-val" style="color:${stats.totalPaid>=displayedStats.totalDue?'#059669':'#ea580c'}">${displayedStats.totalDue>0?Math.round((stats.totalPaid/displayedStats.totalDue)*100):0}%</div><div class="stat-label">Progress</div></div>
</div>
<table><thead><tr><th>Payment Type</th><th>Category</th><th style="text-align:right">Amount Due</th><th style="text-align:right">Paid</th><th style="text-align:center">Status</th><th style="text-align:center">Deadline</th></tr></thead><tbody>${rows}</tbody></table>
<div class="footer">Generated by Payvexo &bull; ${new Date().toLocaleString('en-US')}</div>
</div>
<div class="no-print"><button class="btn-print" onclick="window.print()">Print / Save as PDF</button></div>
</body></html>`;
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  };

  const handleLogout = async () => {
    try {
      await logout();
      go('/login');
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
        background: tk.bgWash,
        minHeight: '100dvh',
      }}
    >
      {/* Background Grid Pattern */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${theme === 'light' ? 'rgba(255, 104, 3, 0.12)' : 'rgba(255, 104, 3, 0.25)'} 1px, transparent 1px),
            linear-gradient(90deg, ${theme === 'light' ? 'rgba(255, 104, 3, 0.12)' : 'rgba(255, 104, 3, 0.25)'} 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Animated Gradient Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${tk.primary} 0%, transparent 70%)`,
            top: '-10%',
            right: '-5%',
            animationDuration: '4s',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${tk.mint} 0%, transparent 70%)`,
            bottom: '-5%',
            left: '-5%',
            animation: 'pulse 6s ease-in-out infinite',
          }}
        />
        
        {/* Background watermark — single-tenant only */}
        {!isMultiTenant && (
        <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none">
          <img 
            src="/Ece picture.jpg" 
            alt="Background"
            className="w-full h-full object-contain"
            style={{
              filter: 'grayscale(0.5) brightness(0.8)',
              mixBlendMode: 'soft-light',
            }}
          />
        </div>
        )}
      </div>

      {/* Top Navigation — hidden in multi-tenant mode (OrgLayout provides nav) */}
      {!isMultiTenant && (
      <motion.nav 
        className="border-b sticky top-0 z-40"
        style={{ 
          background: theme === 'light' ? 'rgba(255, 251, 247, 0.95)' : 'rgba(15, 7, 3, 0.95)',
          backdropFilter: 'blur(20px)',
          borderColor: tk.primaryRing,
        }}
        initial={{ y: -100 }}
        animate={{ y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-[72px] sm:h-16">
            {/* Logo */}
            <div className="flex items-center gap-2.5 p-1.5 rounded-xl" style={{ background: tk.primarySoft }}>
              <LogoCompact />
               <div className="hidden sm:block leading-tight pr-2">
                <h1 className="text-base font-extrabold tracking-tight" style={{ color: tk.text }}>Pay<span style={{ color: tk.primary }}>vexo</span></h1>
                {user?.level && (
                  <p className="text-[10px] font-semibold tracking-wider uppercase" style={{ color: tk.primary }}>{user.level}</p>
                )}
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
                  style={{ background: theme === 'light' ? 'rgba(15, 7, 3, 0.04)' : 'rgba(255, 255, 255, 0.05)' }}
                  whileHover={{ background: theme === 'light' ? 'rgba(15, 7, 3, 0.08)' : 'rgba(255, 255, 255, 0.1)' }}
                >
                  <div
                    className="w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold"
                    style={{ background: tk.gradOrange }}
                  >
                    {user?.full_name?.charAt(0) || 'U'}
                  </div>
                  <div className="text-left">
                    <p className="text-sm font-medium" style={{ color: tk.text }}>{user?.full_name}</p>
                    <p className="text-xs" style={{ color: tk.textSec }}>{user?.reg_number}</p>
                  </div>
                  <ChevronDown className="w-4 h-4" style={{ color: tk.textSec }} />
                </motion.button>

                {/* Dropdown Menu */}
                {showProfileMenu && (
                  <motion.div
                    className="absolute right-0 mt-2 w-56 rounded-xl border overflow-hidden z-50"
                    style={{
                      background: theme === 'light' ? 'rgba(255, 255, 255, 0.98)' : 'rgba(15, 7, 3, 0.95)',
                      backdropFilter: 'blur(20px)',
                      borderColor: tk.primaryRing,
                    }}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div className="p-2">
                      <button
                        onClick={() => go('/profile')}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                        style={{ color: tk.text }}
                        onMouseEnter={(e) => e.currentTarget.style.background = theme === 'light' ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255, 255, 255, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <User size={18} />
                        <span>Profile</span>
                      </button>

                      <button
                        onClick={() => go('/settings')}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                        style={{ color: tk.text }}
                        onMouseEnter={(e) => e.currentTarget.style.background = theme === 'light' ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255, 255, 255, 0.1)'}
                        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                      >
                        <Settings size={18} />
                        <span>Settings</span>
                      </button>

                      <div className="my-1 border-t" style={{ borderColor: tk.cardBorder }} />

                      <button
                        onClick={confirmLogout}
                        className="w-full flex items-center gap-3 px-3 py-2 rounded-lg transition-colors text-left"
                        style={{ color: tk.danger }}
                        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
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
                style={{ background: theme === 'light' ? 'rgba(15, 7, 3, 0.04)' : 'rgba(255, 255, 255, 0.05)' }}
                whileHover={{ background: theme === 'light' ? 'rgba(15, 7, 3, 0.08)' : 'rgba(255, 255, 255, 0.1)' }}
                whileTap={{ scale: 0.95 }}
              >
                {showMobileMenu ? (
                  <CloseIcon className="w-5 h-5" style={{ color: tk.text }} />
                ) : (
                  <Menu className="w-5 h-5" style={{ color: tk.text }} />
                )}
              </motion.button>
            </div>
          </div>
        </div>

        {/* Mobile Menu */}
        {showMobileMenu && (
          <motion.div
            className="md:hidden border-t"
            style={{ borderColor: tk.primaryRing }}
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
          >
            <div className="px-4 py-4 space-y-1">
              {/* User Info */}
              <div className="flex items-center gap-3 pb-3 border-b" style={{ borderColor: tk.cardBorder }}>
                <div
                  className="w-10 h-10 rounded-full flex items-center justify-center text-sm font-semibold"
                  style={{ background: tk.gradOrange }}
                >
                  {user?.full_name?.charAt(0) || 'U'}
                </div>
                <div>
                  <p className="text-sm font-medium" style={{ color: tk.text }}>{user?.full_name}</p>
                  <p className="text-xs" style={{ color: tk.textSec }}>{user?.reg_number}</p>
                  <p className="text-xs" style={{ color: tk.textSec }}>{user?.level}</p>
                </div>
              </div>

              {/* Mobile Dashboard Switcher */}
              {(user?.admins && user.admins.length > 0) && (
                <div className="pb-3 border-b mb-2" style={{ borderColor: tk.cardBorder }}>
                  <DashboardSwitcher variant="compact" />
                </div>
              )}

              <button
                onClick={() => {
                  go('/profile');
                  setShowMobileMenu(false);
                }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
                style={{ color: tk.text }}
                onMouseEnter={(e) => e.currentTarget.style.background = theme === 'light' ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <User size={18} />
                <span>Profile</span>
              </button>

              <button
                onClick={() => { go('/settings'); setShowMobileMenu(false); }}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
                style={{ color: tk.text }}
                onMouseEnter={(e) => e.currentTarget.style.background = theme === 'light' ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255, 255, 255, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <Settings size={18} />
                <span>Settings</span>
              </button>

              <div className="my-1 border-t" style={{ borderColor: tk.cardBorder }} />

              <button
                onClick={confirmLogout}
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-colors text-left"
                style={{ color: tk.danger }}
                onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(239, 68, 68, 0.1)'}
                onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
              >
                <LogOut size={18} />
                <span>Logout</span>
              </button>
            </div>
          </motion.div>
        )}
      </motion.nav>
      )}

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
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-2xl sm:text-3xl lg:text-4xl font-bold mb-2" style={{ color: tk.text }}>
              {(() => {
                const hour = new Date().getHours();
                if (hour < 12) return 'Good morning';
                if (hour < 17) return 'Good afternoon';
                return 'Good evening';
              })()}, {user?.full_name?.split(' ')[0]}! 👋
            </h2>
            <PrivacyToggle />
          </div>
          <p className="text-sm sm:text-base" style={{ color: tk.textSec }}>
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
                value={formatCurrency(stats.totalPaid)}
                icon={DollarSign}
                iconColor={colors.statusPaid}
                delay={0.3}
                isCurrency
                masked={!settings.appearance.showBalance}
              />
              <StatCard
                title="Outstanding"
                value={formatCurrency(displayedStats.totalDue)}
                icon={AlertCircle}
                iconColor={colors.warning}
                delay={0.4}
                isCurrency
                masked={!settings.appearance.showBalance}
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
                    style={{ color: tk.textSec }}
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
              ) : mandatoryUnpaidDues.length === 0 && optionalUnpaidDues.length === 0 && dismissedUnpaidDues.length === 0 ? (
                <AllPaidState />
              ) : (
                <div className="space-y-4">
                  {mandatoryUnpaidDues.length === 0 && optionalUnpaidDues.length === 0 && dismissedUnpaidDues.length > 0 && (
                    <div className="p-4 rounded-2xl border text-sm" style={{ background: tk.card, borderColor: tk.cardBorder, color: tk.textSec }}>
                      You have skipped all optional dues. Open <span style={{ color: tk.primary, fontWeight: 600 }}>Show Skipped</span> to restore any of them.
                    </div>
                  )}

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
                        .slice(0, 2)
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
                              onClick={() => go(`/payment/${paymentType.id}`)}
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
                                    <PrivacyMask><span className="text-xl font-bold text-white">{formatCurrency(item.totalDue ?? paymentType.amount)}</span></PrivacyMask>
                                    {(item.accumulatedLateFees ?? 0) > 0 && (
                                      <PrivacyMask><div className="text-xs mt-1" style={{ color: colors.textSecondary }}>
                                        Includes {formatCurrency(item.accumulatedLateFees ?? 0)} late fees ({item.daysOverdue} days)
                                      </div></PrivacyMask>
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
                                    go(`/payment/${paymentType.id}`);
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
                        .slice(0, 2)
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
                              onClick={() => go(`/payment/${paymentType.id}`)}
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
                                    <PrivacyMask><span className="text-xl font-bold text-white">{formatCurrency(paymentType.amount)}</span></PrivacyMask>
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
                                      go(`/payment/${paymentType.id}`);
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
                                        <PrivacyMask>{formatCurrency(paymentType.amount)}</PrivacyMask>
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
                  
                  {/* View All Button if more than visible dues */}
                  {(mandatoryUnpaidDues.length > 2 || optionalUnpaidDues.length > 2) && (
                    <button
                      onClick={() => go('/payments')}
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
                      View All Dues ({mandatoryUnpaidDues.length + optionalUnpaidDues.length}) →
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
                <div className="flex items-center gap-3">
                  <button
                    onClick={printPaymentSummary}
                    className="flex items-center gap-1.5 text-sm font-medium px-3 py-1.5 rounded-lg transition-all hover:scale-105"
                    style={{ background: 'rgba(255,255,255,0.08)', color: colors.textSecondary, border: '1px solid rgba(255,255,255,0.1)' }}
                    title="Print payment summary"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    Print
                  </button>
                  <button
                    onClick={() => go('/payments')}
                    className="text-sm font-medium hover:underline"
                    style={{ color: colors.primary }}
                  >
                    View History
                  </button>
                </div>
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
                          onClick={() => go(`/payment/${paymentType.id}`)}
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
                                  <PrivacyMask><span className="font-semibold" style={{ color: colors.warning }}>
                                    {formatCurrency(amountPaid)} / {formatCurrency(item.totalDue ?? paymentType.amount)}
                                  </span></PrivacyMask>
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
                                    <PrivacyMask><span className="text-lg font-bold text-white">
                                      {formatCurrency(status === 'paid' ? amountPaid || paymentType.amount : (item.totalDue ?? paymentType.amount))}
                                    </span></PrivacyMask>
                                    {status !== 'paid' && (item.accumulatedLateFees ?? 0) > 0 && (
                                      <PrivacyMask><p className="text-xs mt-0.5" style={{ color: colors.statusUnpaid }}>
                                        +{formatCurrency(item.accumulatedLateFees ?? 0)} late fee
                                      </p></PrivacyMask>
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
                                      go(`/payment/${paymentType.id}`);
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
                                      go('/payments');
                                    }}
                                    whileHover={{ background: 'rgba(255,255,255,0.12)' }}
                                    whileTap={{ scale: 0.98 }}
                                  >
                                    <AlertCircle className="w-3.5 h-3.5" />
                                    View Status
                                  </motion.button>
                                )}
                                {(status === 'paid' || status === 'waived') && (
                                  <>
                                  <motion.button
                                    className="p-2 rounded-xl transition-all flex items-center justify-center"
                                    style={{
                                      background: 'rgba(255,255,255,0.08)',
                                      color: colors.textPrimary,
                                      border: '1px solid rgba(255,255,255,0.1)'
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      go(`/payment/${paymentType.id}`);
                                    }}
                                    whileHover={{ background: 'rgba(255,255,255,0.12)' }}
                                    whileTap={{ scale: 0.98 }}
                                    title="Print Receipt"
                                  >
                                    <Printer className="w-4 h-4" />
                                  </motion.button>
                                  <motion.button
                                    className="px-4 py-2 rounded-xl font-semibold text-xs transition-all flex items-center gap-1.5"
                                    style={{
                                      background: 'rgba(255,255,255,0.08)',
                                      color: colors.textPrimary,
                                      border: '1px solid rgba(255,255,255,0.1)'
                                    }}
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      go(`/payment/${paymentType.id}`);
                                    }}
                                    whileHover={{ background: 'rgba(255,255,255,0.12)' }}
                                    whileTap={{ scale: 0.98 }}
                                  >
                                    View Details
                                  </motion.button>
                                  </>
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
              {/* Progress Bar - Payment Overview */}
              {features.progressBar && displayedStats.totalDue > 0 && (
                <GlassCard>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${colors.primary}15` }}>
                        <CheckCircle size={16} style={{ color: colors.primary }} />
                      </div>
                      <div>
                        <h3 className="text-sm font-semibold text-white">Payment Progress</h3>
                        <PrivacyMask><p className="text-xs" style={{ color: colors.textSecondary }}>
                          {formatCurrency(stats.totalPaid)} of {formatCurrency(displayedStats.totalDue)}
                        </p></PrivacyMask>
                      </div>
                    </div>
                    <span className="text-lg font-bold" style={{ color: colors.primary }}>
                      {displayedStats.totalDue > 0 ? Math.round((stats.totalPaid / displayedStats.totalDue) * 100) : 0}%
                    </span>
                  </div>
                  <ProgressBar
                    progress={displayedStats.totalDue > 0 ? Math.round((stats.totalPaid / displayedStats.totalDue) * 100) : 0}
                    height="h-3"
                    animated
                  />
                  <div className="flex items-center justify-between mt-2">
                    <PrivacyMask><span className="text-[11px]" style={{ color: colors.textSecondary }}>Outstanding: {formatCurrency(Math.max(0, displayedStats.totalDue - stats.totalPaid))}</span></PrivacyMask>
                    <span className="text-[11px] font-medium" style={{ color: stats.totalPaid >= displayedStats.totalDue ? colors.success : colors.warning }}>
                      {stats.totalPaid >= displayedStats.totalDue ? 'Fully Paid!' : 'In Progress'}
                    </span>
                  </div>
                </GlassCard>
              )}

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
          className="fixed bottom-24 lg:bottom-8 right-6 sm:right-8 w-14 h-14 sm:w-16 sm:h-16 rounded-full flex items-center justify-center shadow-2xl z-40"
          style={{
            background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
            boxShadow: `0 8px 32px ${colors.primary}40`,
          }}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={() => go('/admin/create-payment')}
          initial={{ opacity: 0, scale: 0 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ delay: 1 }}
          title="Create New Payment"
        >
          <Plus size={26} className="text-white" />
        </motion.button>
      )}

      {/* Push Notification Prompt */}
      <PushNotificationPrompt mode="banner" />

      {/* Logout Confirmation Modal */}
      <AnimatePresence>
        {showLogoutModal && (
          <motion.div
            className="fixed inset-0 z-100 flex items-center justify-center p-4"
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

      {/* ═══════════ WELCOME MODAL (new invite-link members) ═══════════ */}
      <AnimatePresence>
        {showWelcomeModal && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              className="absolute inset-0 bg-black/70 backdrop-blur-sm"
              onClick={() => setShowWelcomeModal(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            />
            <motion.div
              className="relative w-full max-w-sm rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(145deg, #1A1A1A 0%, #0D0D0D 100%)',
                border: `1px solid ${colors.primary}30`,
                boxShadow: `0 25px 60px rgba(255, 107, 53, 0.15)`,
              }}
              initial={{ opacity: 0, scale: 0.85, y: 30 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.85, y: 30 }}
              transition={{ type: 'spring', stiffness: 300, damping: 25 }}
            >
              {/* Top accent gradient */}
              <div className="h-1.5" style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accentMint}, ${colors.primary})` }} />

              <div className="p-6 pt-7 text-center">
                {/* Celebration icon */}
                <motion.div
                  className="mx-auto w-20 h-20 rounded-2xl flex items-center justify-center mb-5"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}20, ${colors.accentMint}15)`,
                    border: `1px solid ${colors.primary}25`,
                  }}
                  initial={{ rotate: -10, scale: 0.8 }}
                  animate={{ rotate: 0, scale: 1 }}
                  transition={{ type: 'spring', stiffness: 300, damping: 15, delay: 0.2 }}
                >
                  <span className="text-4xl">🎉</span>
                </motion.div>

                <motion.h3
                  className="text-xl font-bold text-white mb-2"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.3 }}
                >
                  Welcome to {welcomeOrgName || 'the team'}!
                </motion.h3>
                <motion.p
                  className="text-sm leading-relaxed mb-2"
                  style={{ color: colors.textSecondary }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  Hi <span className="font-semibold text-white">{user?.full_name?.split(' ')[0]}</span>! Your account has been created successfully. You're now part of the organization.
                </motion.p>

                {/* Quick tips */}
                <motion.div
                  className="text-left space-y-2 mb-6 p-3 rounded-xl"
                  style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.5 }}
                >
                  <p className="text-[10px] font-bold uppercase tracking-wider mb-2" style={{ color: colors.primary }}>Quick Tips</p>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: colors.accentMint }} />
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Check your <span className="text-white font-medium">unpaid dues</span> on the right panel</p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: colors.accentMint }} />
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Upload payment proof to get <span className="text-white font-medium">quick approval</span></p>
                  </div>
                  <div className="flex items-start gap-2">
                    <CheckCircle className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: colors.accentMint }} />
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Track your <span className="text-white font-medium">payment history</span> anytime</p>
                  </div>
                </motion.div>

                <motion.button
                  className="w-full py-3 px-4 rounded-xl font-semibold text-sm text-white flex items-center justify-center gap-2"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})`,
                    boxShadow: `0 4px 15px ${colors.primary}30`,
                  }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => setShowWelcomeModal(false)}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.6 }}
                >
                  <Star className="w-4 h-4" />
                  Let's Get Started!
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
