import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/config/supabase';
import { colors, gradients } from '@/config/colors';
import GlassCard from '@/components/ui/GlassCard';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { AdminDashboardSkeleton, PaymentCardSkeleton } from '@/components/ui/Skeleton';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import {
  Users,
  Clock,
  CheckCircle,
  XCircle,
  FileText,
  Plus,
  AlertCircle,
  Wallet,
  Eye,
  Edit,
  X,
  ExternalLink,
  QrCode,
  Sparkles,
  TrendingUp,
  Shield,
  ChevronRight,
  ChevronLeft,
  Activity,
  BarChart3,
  Receipt,
  Calendar,
} from 'lucide-react';
import Footer from '@/components/Footer';
import StudentFeatureSettings from '@/components/admin/StudentFeatureSettings';
import ExpenseVisibilitySettings from '@/components/admin/ExpenseVisibilitySettings';
// ExpenseList removed from dashboard; use dedicated Expenses page instead

interface AdminStats {
  totalStudents: number;
  totalPaymentTypes: number;
  pendingReview: number;
  totalCollected: number;
  approvedToday: number;
  rejectedPayments: number;
}

interface RecentPayment {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  receipt_url: string;
  transaction_ref: string;
  notes: string | null;
  students: {
    full_name: string;
    reg_number: string;
  } | null;
  payment_types: {
    name: string;
  } | null;
}

export default function AdminDashboardPage() {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  
  // Debug: Check permissions
  // Debug logs removed for production security
  
  const [loading, setLoading] = useState(true);
  const [recentPaymentsLoading, setRecentPaymentsLoading] = useState(true);
  const [recentExpensesLoading, setRecentExpensesLoading] = useState(true);
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [showAllReviewsModal, setShowAllReviewsModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<RecentPayment | null>(null);
  const [reviewsFilter, setReviewsFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [reviewsPage, setReviewsPage] = useState(1);
  const [allPayments, setAllPayments] = useState<RecentPayment[]>([]);
  const reviewsPerPage = 8;
  
  // Expenses state
  const [recentExpenses, setRecentExpenses] = useState<{
    id: string;
    title: string;
    amount: number;
    status: string;
    expense_date: string;
    category?: string;
  }[]>([]);
  const [expensesPage, setExpensesPage] = useState(1);
  const expensesPerPage = 5;
  
  const [stats, setStats] = useState<AdminStats>({
    totalStudents: 0,
    totalPaymentTypes: 0,
    pendingReview: 0,
    totalCollected: 0,
    approvedToday: 0,
    rejectedPayments: 0,
  });
  const [recentPayments, setRecentPayments] = useState<RecentPayment[]>([]);

  useEffect(() => {
    fetchAdminStats();
    fetchRecentPayments();
    fetchRecentExpenses();
  }, []);

  const fetchRecentExpenses = async () => {
    try {
      setRecentExpensesLoading(true);
      const { data } = await supabase
        .from('expenses')
        .select(`
          id,
          title,
          amount,
          status,
          expense_date,
          created_at,
          payment_types!expenses_payment_type_id_fkey (
            category
          )
        `)
        .order('created_at', { ascending: false })
        .limit(20);

      const formatted = (data || []).map(exp => ({
        id: exp.id,
        title: exp.title,
        amount: exp.amount,
        status: exp.status,
        expense_date: exp.expense_date || exp.created_at,
        category: Array.isArray(exp.payment_types) 
          ? (exp.payment_types[0] as { category?: string } | undefined)?.category 
          : (exp.payment_types as { category?: string } | null)?.category || 'Other'
      }));
      
      setRecentExpenses(formatted);
    } catch (error) {
      console.error('Error fetching recent expenses:', error);
    } finally {
      setRecentExpensesLoading(false);
    }
  };

  // Paginate expenses
  const totalExpensePages = Math.ceil(recentExpenses.length / expensesPerPage);
  const paginatedExpenses = recentExpenses.slice(
    (expensesPage - 1) * expensesPerPage,
    expensesPage * expensesPerPage
  );

  const fetchAdminStats = async () => {
    try {
      setLoading(true);

      // Total students
      const { count: studentCount } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // Total payment types
      const { count: paymentTypeCount } = await supabase
        .from('payment_types')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // Pending review
      const { count: pendingCount } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      // Total collected (approved payments excluding waived)
      const { data: approvedPayments } = await supabase
        .from('payments')
        .select('amount, transaction_ref')
        .eq('status', 'approved');

      const totalCollected = approvedPayments
        ?.filter(p => !p.transaction_ref?.startsWith('WAIVED-'))
        .reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;

      // Approved today (excluding waived)
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: approvedTodayPayments } = await supabase
        .from('payments')
        .select('transaction_ref')
        .eq('status', 'approved')
        .gte('approved_at', today.toISOString());

      const approvedTodayCount = approvedTodayPayments
        ?.filter(p => !p.transaction_ref?.startsWith('WAIVED-'))
        .length || 0;

      // Rejected payments
      const { count: rejectedCount } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'rejected');

      setStats({
        totalStudents: studentCount || 0,
        totalPaymentTypes: paymentTypeCount || 0,
        pendingReview: pendingCount || 0,
        totalCollected,
        approvedToday: approvedTodayCount || 0,
        rejectedPayments: rejectedCount || 0,
      });
    } catch (error) {
      console.error('Error fetching admin stats:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchRecentPayments = async () => {
    try {
      setRecentPaymentsLoading(true);
      
      // Fetch all payments for the modal (including pending)
      const { data: allData } = await supabase
        .from('payments')
        .select(`
          *,
          students!payments_student_id_fkey (
            full_name,
            reg_number
          ),
          payment_types (
            title
          )
        `)
        .in('status', ['approved', 'rejected', 'pending'])
        .order('updated_at', { ascending: false });

      setAllPayments(allData || []);
      
      // Recent payments only shows approved/rejected (reviewed items)
      const reviewed = (allData || []).filter(p => p.status !== 'pending').slice(0, 5);
      setRecentPayments(reviewed);
    } catch (error) {
      console.error('Error fetching recent payments:', error);
    } finally {
      setRecentPaymentsLoading(false);
    }
  };

  // Filter and paginate all payments for modal
  const filteredReviews = allPayments.filter(p => {
    if (reviewsFilter === 'all') return true;
    return p.status === reviewsFilter;
  });
  
  const totalReviewPages = Math.ceil(filteredReviews.length / reviewsPerPage);
  const paginatedReviews = filteredReviews.slice(
    (reviewsPage - 1) * reviewsPerPage,
    reviewsPage * reviewsPerPage
  );

  // Get counts for filter badges
  const pendingCount = allPayments.filter(p => p.status === 'pending').length;
  const approvedCount = allPayments.filter(p => p.status === 'approved').length;
  const rejectedCount = allPayments.filter(p => p.status === 'rejected').length;

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'approved':
        return colors.statusPaid;
      case 'rejected':
        return colors.statusUnpaid;
      case 'pending':
        return colors.warning;
      default:
        return colors.textSecondary;
    }
  };

  return (
    <div className="min-h-screen py-6 px-4 relative overflow-hidden"  style={{
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

      <div className="max-w-7xl mx-auto space-y-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard className="relative overflow-hidden">
            {/* Header Decorative Elements */}
            <div className="absolute top-0 right-0 w-64 h-64 opacity-5 pointer-events-none">
              <Shield className="w-full h-full" style={{ color: colors.primary }} />
            </div>
            <div 
              className="absolute top-0 left-0 w-full h-1"
              style={{ background: gradients.primary }}
            />
            
            <div className="relative z-10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                {/* Admin Badge */}
                <motion.div 
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 0.1 }}
                  className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-3"
                  style={{ 
                    background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
                    border: `1px solid ${colors.primary}40`,
                    color: colors.primary,
                  }}
                >
                  <Sparkles className="w-3 h-3" />
                  ADMIN CONTROL CENTER
                </motion.div>
                
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2 flex items-center gap-3">
                  <span>Dashboard</span>
                  <Activity className="w-6 h-6" style={{ color: colors.accentMint }} />
                </h1>
                <p style={{ color: colors.textSecondary }} className="flex items-center gap-2">
                  <BarChart3 className="w-4 h-4" />
                  Manage payments and monitor class finances
                </p>
              </div>
              
              <div className="flex flex-wrap gap-3">
                {hasPermission('can_create_payments') && (
                <motion.button
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/admin/create-payment')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white transition-all shadow-lg"
                  style={{ 
                    background: gradients.primary,
                    boxShadow: `0 4px 15px ${colors.primary}40`
                  }}
                >
                  <Plus className="w-5 h-5" />
                  <span className="hidden sm:inline">Create Payment</span>
                </motion.button>
                )}
                {hasPermission('can_approve_payments') && (
                <motion.button
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/admin/scan-qr')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white transition-all shadow-lg"
                  style={{ 
                    background: gradients.mint,
                    boxShadow: `0 4px 15px ${colors.accentMint}40`
                  }}
                >
                  <QrCode className="w-5 h-5" />
                  <span className="hidden sm:inline">Scan QR</span>
                </motion.button>
                )}
                {hasPermission('can_approve_payments') && (
                <motion.button
                  whileHover={{ scale: 1.02, y: -2 }}
                  whileTap={{ scale: 0.98 }}
                  onClick={() => navigate('/admin/review')}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all relative"
                  style={{ 
                    background: `${colors.warning}20`,
                    border: `1px solid ${colors.warning}50`,
                    color: colors.warning
                  }}
                >
                  <Clock className="w-5 h-5" />
                  <span className="hidden sm:inline">Review</span>
                  {stats.pendingReview > 0 && (
                    <motion.span 
                      initial={{ scale: 0 }}
                      animate={{ scale: 1 }}
                      className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white shadow-lg"
                      style={{ 
                        background: colors.statusUnpaid,
                        boxShadow: `0 2px 8px ${colors.statusUnpaid}60`
                      }}
                    >
                      {stats.pendingReview}
                    </motion.span>
                  )}
                </motion.button>
                )}
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Stats Grid */}
        {loading ? (
          <AdminDashboardSkeleton />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {/* Total Students */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
              whileHover={{ scale: 1.02, y: -4 }}
              className="cursor-pointer"
              onClick={() => navigate('/admin/manage-students')}
            >
              <GlassCard className="relative overflow-hidden group">
                {/* Gradient border on hover */}
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl"
                     style={{ 
                       background: `linear-gradient(135deg, ${colors.primary}20, transparent)`,
                       border: `1px solid ${colors.primary}40`
                     }} />
                
                {/* Background Icon */}
                <div className="absolute -bottom-4 -right-4 w-24 h-24 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Users className="w-full h-full" style={{ color: colors.primary }} />
                </div>
                
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-sm mb-1 flex items-center gap-2" style={{ color: colors.textSecondary }}>
                      Total Students
                      <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: colors.primary }} />
                    </p>
                    <p className="text-3xl font-bold text-white">
                      <AnimatedCounter value={stats.totalStudents} />
                    </p>
                    <p className="text-xs mt-1" style={{ color: colors.accentMint }}>Active members</p>
                  </div>
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                       style={{ background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)` }}>
                    <Users className="w-7 h-7" style={{ color: colors.primary }} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Pending Review */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
              whileHover={{ scale: 1.02, y: -4 }}
              className="cursor-pointer"
              onClick={() => navigate('/admin/review')}
            >
              <GlassCard className="relative overflow-hidden group">
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl"
                     style={{ 
                       background: `linear-gradient(135deg, ${colors.warning}20, transparent)`,
                       border: `1px solid ${colors.warning}40`
                     }} />
                
                <div className="absolute -bottom-4 -right-4 w-24 h-24 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Clock className="w-full h-full" style={{ color: colors.warning }} />
                </div>
                
                {/* Pulsing indicator for pending */}
                {stats.pendingReview > 0 && (
                  <div className="absolute top-3 right-3 w-3 h-3 rounded-full animate-pulse"
                       style={{ background: colors.warning, boxShadow: `0 0 8px ${colors.warning}` }} />
                )}
                
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-sm mb-1 flex items-center gap-2" style={{ color: colors.textSecondary }}>
                      Pending Review
                      <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: colors.warning }} />
                    </p>
                    <p className="text-3xl font-bold" style={{ color: colors.warning }}>
                      <AnimatedCounter value={stats.pendingReview} />
                    </p>
                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Awaiting action</p>
                  </div>
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                       style={{ background: `linear-gradient(135deg, ${colors.warning}30, ${colors.warning}10)` }}>
                    <Clock className="w-7 h-7" style={{ color: colors.warning }} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Total Collected */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
              whileHover={{ scale: 1.02, y: -4 }}
              className="cursor-pointer"
              onClick={() => navigate('/admin/collected')}
            >
              <GlassCard className="relative overflow-hidden group">
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl"
                     style={{ 
                       background: `linear-gradient(135deg, ${colors.statusPaid}20, transparent)`,
                       border: `1px solid ${colors.statusPaid}40`
                     }} />
                
                <div className="absolute -bottom-4 -right-4 w-24 h-24 opacity-10 group-hover:opacity-20 transition-opacity">
                  <Wallet className="w-full h-full" style={{ color: colors.statusPaid }} />
                </div>
                
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-sm mb-1 flex items-center gap-2" style={{ color: colors.textSecondary }}>
                      Total Collected
                      <TrendingUp className="w-3 h-3" style={{ color: colors.statusPaid }} />
                    </p>
                    <p className="text-2xl font-bold text-white">
                      {formatCurrency(stats.totalCollected)}
                    </p>
                    <p className="text-xs mt-1" style={{ color: colors.statusPaid }}>Revenue to date</p>
                  </div>
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                       style={{ background: `linear-gradient(135deg, ${colors.statusPaid}30, ${colors.statusPaid}10)` }}>
                    <Wallet className="w-7 h-7" style={{ color: colors.statusPaid }} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Active Payment Types */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
              whileHover={{ scale: 1.02, y: -4 }}
              className="cursor-pointer"
              onClick={() => navigate('/admin/create-payment')}
            >
              <GlassCard className="relative overflow-hidden group">
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl"
                     style={{ 
                       background: `linear-gradient(135deg, ${colors.accentMint}20, transparent)`,
                       border: `1px solid ${colors.accentMint}40`
                     }} />
                
                <div className="absolute -bottom-4 -right-4 w-24 h-24 opacity-10 group-hover:opacity-20 transition-opacity">
                  <FileText className="w-full h-full" style={{ color: colors.accentMint }} />
                </div>
                
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-sm mb-1 flex items-center gap-2" style={{ color: colors.textSecondary }}>
                      Active Payments
                      <ChevronRight className="w-3 h-3 opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: colors.accentMint }} />
                    </p>
                    <p className="text-3xl font-bold text-white">
                      <AnimatedCounter value={stats.totalPaymentTypes} />
                    </p>
                    <p className="text-xs mt-1" style={{ color: colors.accentMint }}>Payment types</p>
                  </div>
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                       style={{ background: `linear-gradient(135deg, ${colors.accentMint}30, ${colors.accentMint}10)` }}>
                    <FileText className="w-7 h-7" style={{ color: colors.accentMint }} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Approved Today */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
              whileHover={{ scale: 1.02, y: -4 }}
            >
              <GlassCard className="relative overflow-hidden group">
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl"
                     style={{ 
                       background: `linear-gradient(135deg, ${colors.statusPaid}20, transparent)`,
                       border: `1px solid ${colors.statusPaid}40`
                     }} />
                
                <div className="absolute -bottom-4 -right-4 w-24 h-24 opacity-10 group-hover:opacity-20 transition-opacity">
                  <CheckCircle className="w-full h-full" style={{ color: colors.statusPaid }} />
                </div>
                
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Approved Today</p>
                    <p className="text-3xl font-bold" style={{ color: colors.statusPaid }}>
                      <AnimatedCounter value={stats.approvedToday} />
                    </p>
                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Today's activity</p>
                  </div>
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                       style={{ background: `linear-gradient(135deg, ${colors.statusPaid}30, ${colors.statusPaid}10)` }}>
                    <CheckCircle className="w-7 h-7" style={{ color: colors.statusPaid }} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Rejected Payments */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
              whileHover={{ scale: 1.02, y: -4 }}
            >
              <GlassCard className="relative overflow-hidden group">
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 pointer-events-none rounded-xl"
                     style={{ 
                       background: `linear-gradient(135deg, ${colors.statusUnpaid}20, transparent)`,
                       border: `1px solid ${colors.statusUnpaid}40`
                     }} />
                
                <div className="absolute -bottom-4 -right-4 w-24 h-24 opacity-10 group-hover:opacity-20 transition-opacity">
                  <XCircle className="w-full h-full" style={{ color: colors.statusUnpaid }} />
                </div>
                
                <div className="flex items-center justify-between relative z-10">
                  <div>
                    <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Rejected</p>
                    <p className="text-3xl font-bold" style={{ color: colors.statusUnpaid }}>
                      <AnimatedCounter value={stats.rejectedPayments} />
                    </p>
                    <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Total rejected</p>
                  </div>
                  <div className="w-14 h-14 rounded-xl flex items-center justify-center transition-all group-hover:scale-110"
                       style={{ background: `linear-gradient(135deg, ${colors.statusUnpaid}30, ${colors.statusUnpaid}10)` }}>
                    <XCircle className="w-7 h-7" style={{ color: colors.statusUnpaid }} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        )}

        {/* Recent Payments Table */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
        >
          <GlassCard className="relative overflow-hidden">
            {/* Section Header with gradient accent */}
            <div 
              className="absolute top-0 left-0 w-full h-1 opacity-60"
              style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accentMint}, transparent)` }}
            />
            
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                     style={{ background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)` }}>
                  <Activity className="w-5 h-5" style={{ color: colors.primary }} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Recent Submissions</h2>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Latest reviewed payments</p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.05, x: 4 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setShowAllReviewsModal(true)}
                className="flex items-center gap-2 text-sm font-medium px-4 py-2 rounded-lg transition-all"
                style={{ 
                  color: colors.primary,
                  background: `${colors.primary}10`,
                  border: `1px solid ${colors.primary}30`
                }}
              >
                View All
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>

            <AnimatePresence mode="wait">
              {recentPaymentsLoading ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {[1, 2, 3, 4, 5].map((i) => (
                    <PaymentCardSkeleton key={i} />
                  ))}
                </motion.div>
              ) : recentPayments.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12"
                >
                  <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center"
                       style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                    <AlertCircle className="w-10 h-10" style={{ color: colors.textSecondary }} />
                  </div>
                  <p className="text-lg font-medium text-white mb-1">No Recent Activity</p>
                  <p style={{ color: colors.textSecondary }}>Submissions will appear here once reviewed</p>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-3"
                >
                  {recentPayments.map((payment, index) => (
                    <motion.div
                      key={payment.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.05 }}
                      whileHover={{ scale: 1.01, x: 4 }}
                      className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 rounded-xl transition-all cursor-pointer group gap-3 sm:gap-0"
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                      }}
                      onClick={() => {
                        setSelectedPayment(payment);
                        setShowReceiptModal(true);
                      }}
                    >
                      <div className="flex items-center gap-3 sm:gap-4 flex-1">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-base sm:text-lg transition-transform group-hover:scale-110 shrink-0"
                             style={{ 
                               background: `linear-gradient(135deg, ${colors.primary}40, ${colors.primary}20)`,
                               color: colors.primary
                             }}>
                          {payment.students?.full_name?.charAt(0) || '?'}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium truncate text-sm sm:text-base">{payment.students?.full_name}</p>
                          <p className="text-xs sm:text-sm truncate" style={{ color: colors.textSecondary }}>
                            {payment.payment_types?.name}
                          </p>
                          {/* Mobile: Show amount and date inline */}
                          <div className="flex items-center gap-2 mt-1 sm:hidden">
                            <span className="text-white font-semibold text-sm">{formatCurrency(payment.amount)}</span>
                            <span className="text-xs" style={{ color: colors.textSecondary }}>•</span>
                            <span className="text-xs" style={{ color: colors.textSecondary }}>{formatDate(payment.created_at, 'short')}</span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-4 pl-13 sm:pl-0">
                        <div className="text-right hidden sm:block">
                          <p className="text-white font-semibold">{formatCurrency(payment.amount)}</p>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>
                            {formatDate(payment.created_at, 'short')}
                          </p>
                        </div>
                        <span className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold capitalize"
                              style={{ 
                                background: `linear-gradient(135deg, ${getStatusColor(payment.status)}30, ${getStatusColor(payment.status)}10)`,
                                color: getStatusColor(payment.status),
                                border: `1px solid ${getStatusColor(payment.status)}40`
                              }}>
                          {payment.status}
                        </span>
                        <motion.div
                          whileHover={{ scale: 1.1 }}
                          className="p-2 sm:p-2.5 rounded-lg transition-all opacity-70 group-hover:opacity-100"
                          style={{ background: `${colors.primary}20`, color: colors.primary }}
                          title="View Receipt"
                        >
                          <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                        </motion.div>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </GlassCard>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <GlassCard className="relative overflow-hidden">
            <div 
              className="absolute top-0 left-0 w-full h-1 opacity-60"
              style={{ background: `linear-gradient(90deg, ${colors.accentMint}, ${colors.primary}, transparent)` }}
            />
            
            <div className="flex items-center gap-3 mb-6">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center"
                   style={{ background: `linear-gradient(135deg, ${colors.accentMint}30, ${colors.accentMint}10)` }}>
                <Sparkles className="w-5 h-5" style={{ color: colors.accentMint }} />
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">Quick Actions</h2>
                <p className="text-xs" style={{ color: colors.textSecondary }}>Frequently used operations</p>
              </div>
            </div>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-3 p-4 rounded-xl transition-all group"
                style={{ 
                  background: `linear-gradient(135deg, ${colors.primary}15, ${colors.primary}05)`,
                  border: `1px solid ${colors.primary}30`
                }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                     style={{ background: `${colors.primary}30` }}>
                  <Wallet className="w-5 h-5" style={{ color: colors.primary }} />
                </div>
                <div className="text-left">
                  <span className="text-white font-medium block">Student View</span>
                  <span className="text-xs" style={{ color: colors.textSecondary }}>Switch to student dashboard</span>
                </div>
              </motion.button>
              
              {hasPermission('can_create_payments') && (
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/admin/create-payment')}
                className="flex items-center gap-3 p-4 rounded-xl transition-all group"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                     style={{ background: `${colors.primary}20` }}>
                  <Plus className="w-5 h-5" style={{ color: colors.primary }} />
                </div>
                <div className="text-left">
                  <span className="text-white font-medium block">Create Payment</span>
                  <span className="text-xs" style={{ color: colors.textSecondary }}>Add new payment type</span>
                </div>
              </motion.button>
              )}
              
              {hasPermission('can_approve_payments') && (
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/admin/review')}
                className="flex items-center gap-3 p-4 rounded-xl transition-all group relative"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                {stats.pendingReview > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
                       style={{ background: colors.warning }}>
                    {stats.pendingReview}
                  </div>
                )}
                <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                     style={{ background: `${colors.warning}20` }}>
                  <Eye className="w-5 h-5" style={{ color: colors.warning }} />
                </div>
                <div className="text-left">
                  <span className="text-white font-medium block">Review Payments</span>
                  <span className="text-xs" style={{ color: colors.textSecondary }}>Approve or reject submissions</span>
                </div>
              </motion.button>
              )}
              
              {hasPermission('can_manage_students') && (
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/admin/manage-students')}
                className="flex items-center gap-3 p-4 rounded-xl transition-all group"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                     style={{ background: `${colors.accentMint}20` }}>
                  <Users className="w-5 h-5" style={{ color: colors.accentMint }} />
                </div>
                <div className="text-left">
                  <span className="text-white font-medium block">Manage Students</span>
                  <span className="text-xs" style={{ color: colors.textSecondary }}>View and edit student records</span>
                </div>
              </motion.button>
              )}
              
              {hasPermission('can_manage_students') && (
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/admin/expenses')}
                className="flex items-center gap-3 p-4 rounded-xl transition-all group"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                     style={{ background: `${colors.primary}20` }}>
                  <BarChart3 className="w-5 h-5" style={{ color: colors.primary }} />
                </div>
                <div className="text-left">
                  <span className="text-white font-medium block">Expenses</span>
                  <span className="text-xs" style={{ color: colors.textSecondary }}>Track class expenditures</span>
                </div>
              </motion.button>
              )}
              
              {hasPermission('can_approve_payments') && (
              <motion.button
                whileHover={{ scale: 1.02, y: -2 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/admin/waive-payment')}
                className="flex items-center gap-3 p-4 rounded-xl transition-all group"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.03)',
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              >
                <div className="w-10 h-10 rounded-lg flex items-center justify-center transition-transform group-hover:scale-110"
                     style={{ background: `${colors.statusPaid}20` }}>
                  <Edit className="w-5 h-5" style={{ color: colors.statusPaid }} />
                </div>
                <div className="text-left">
                  <span className="text-white font-medium block">Waive Payment</span>
                  <span className="text-xs" style={{ color: colors.textSecondary }}>Grant payment exemptions</span>
                </div>
              </motion.button>
              )}
            </div>
          </GlassCard>
        </motion.div>

        {/* Student Feature Controls */}
        {hasPermission('can_manage_students') && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.85 }}
          >
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <StudentFeatureSettings />
              <ExpenseVisibilitySettings />
            </div>
          </motion.div>
        )}

        {/* Expenses - quick link + recent expenses preview with pagination */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          <GlassCard className="relative overflow-hidden">
            {/* Gradient top border for consistency */}
            <div 
              className="absolute top-0 left-0 w-full h-1"
              style={{ background: `linear-gradient(90deg, ${colors.statusFailed}, ${colors.warning}, transparent)` }}
            />
            
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                     style={{ 
                       background: `linear-gradient(135deg, ${colors.statusFailed}30, ${colors.statusFailed}10)`,
                       border: `1px solid ${colors.statusFailed}40`,
                       boxShadow: `0 4px 15px ${colors.statusFailed}20`
                     }}>
                  <TrendingUp className="w-6 h-6" style={{ color: colors.statusFailed }} />
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl font-bold text-white">Recent Expenses</h2>
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                          style={{ background: `${colors.statusFailed}30`, color: colors.statusFailed }}>
                      {recentExpenses.length} Total
                    </span>
                  </div>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Latest class expenditures</p>
                </div>
              </div>
              <motion.button
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => navigate('/admin/expenses')}
                className="flex items-center justify-center gap-2 px-5 py-2.5 rounded-xl font-medium text-white transition-all shadow-lg"
                style={{ 
                  background: `linear-gradient(135deg, ${colors.statusFailed}, ${colors.primary})`,
                  boxShadow: `0 4px 15px ${colors.statusFailed}40`
                }}
              >
                <FileText className="w-4 h-4" />
                <span>Manage Expenses</span>
                <ChevronRight className="w-4 h-4" />
              </motion.button>
            </div>

            {/* Expenses List */}
            <AnimatePresence mode="wait">
              {recentExpensesLoading ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="space-y-3"
                >
                  {[1, 2, 3, 4, 5].map((i) => (
                    <PaymentCardSkeleton key={i} />
                  ))}
                </motion.div>
              ) : paginatedExpenses.length === 0 ? (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="text-center py-12"
                >
                  <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                       style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                    <Wallet className="w-8 h-8" style={{ color: colors.textSecondary }} />
                  </div>
                  <p className="text-white font-medium mb-1">No Expenses Recorded</p>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>
                    Start tracking expenses in the expenses page
                  </p>
                </motion.div>
              ) : (
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="space-y-2"
                >
                  {paginatedExpenses.map((expense, index) => (
                    <motion.div
                      key={expense.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: index * 0.03 }}
                      className="flex items-center justify-between p-3 rounded-xl transition-all hover:scale-[1.01]"
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.03)',
                        border: '1px solid rgba(255, 255, 255, 0.05)'
                      }}
                    >
                      <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                             style={{ 
                               background: expense.status === 'approved' 
                                 ? `${colors.statusPaid}20` 
                                 : expense.status === 'rejected' 
                                 ? `${colors.statusUnpaid}20`
                                 : `${colors.warning}20`
                             }}>
                          {expense.status === 'approved' && <CheckCircle className="w-5 h-5" style={{ color: colors.statusPaid }} />}
                          {expense.status === 'rejected' && <XCircle className="w-5 h-5" style={{ color: colors.statusUnpaid }} />}
                          {expense.status === 'pending' && <Clock className="w-5 h-5" style={{ color: colors.warning }} />}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-white font-medium text-sm truncate">{expense.title}</p>
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs capitalize px-2 py-0.5 rounded-full"
                                  style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textSecondary }}>
                              {expense.category?.replace(/_/g, ' ') || 'Other'}
                            </span>
                            <span className="text-xs" style={{ color: colors.textSecondary }}>
                              {formatDate(expense.expense_date, 'short')}
                            </span>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <p className="font-semibold text-sm" style={{ color: colors.statusFailed }}>
                          -{formatCurrency(expense.amount)}
                        </p>
                        <span className="px-2 py-1 rounded-full text-[10px] font-semibold capitalize"
                              style={{ 
                                background: expense.status === 'approved' 
                                  ? `${colors.statusPaid}20` 
                                  : expense.status === 'rejected' 
                                  ? `${colors.statusUnpaid}20`
                                  : `${colors.warning}20`,
                                color: expense.status === 'approved' 
                                  ? colors.statusPaid 
                                  : expense.status === 'rejected' 
                                  ? colors.statusUnpaid
                                  : colors.warning
                              }}>
                          {expense.status}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>

            {/* Pagination */}
            {totalExpensePages > 1 && (
              <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                  Page {expensesPage} of {totalExpensePages}
                </p>
                <div className="flex items-center gap-2">
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setExpensesPage(p => Math.max(1, p - 1))}
                    disabled={expensesPage === 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                    style={{
                      background: expensesPage === 1 ? 'rgba(255, 255, 255, 0.03)' : `${colors.primary}20`,
                      border: `1px solid ${expensesPage === 1 ? 'transparent' : colors.primary}40`,
                      color: expensesPage === 1 ? colors.textSecondary : colors.primary,
                    }}
                  >
                    <ChevronLeft className="w-3 h-3" />
                    Prev
                  </motion.button>
                  
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(totalExpensePages, 5) }, (_, i) => {
                      let page: number;
                      if (totalExpensePages <= 5) {
                        page = i + 1;
                      } else if (expensesPage <= 3) {
                        page = i + 1;
                      } else if (expensesPage >= totalExpensePages - 2) {
                        page = totalExpensePages - 4 + i;
                      } else {
                        page = expensesPage - 2 + i;
                      }
                      
                      return (
                        <motion.button
                          key={page}
                          whileHover={{ scale: 1.1 }}
                          whileTap={{ scale: 0.9 }}
                          onClick={() => setExpensesPage(page)}
                          className="w-7 h-7 rounded-lg text-xs font-semibold transition-all"
                          style={{
                            background: expensesPage === page 
                              ? `linear-gradient(135deg, ${colors.statusFailed}, ${colors.primary})`
                              : 'rgba(255, 255, 255, 0.05)',
                            color: expensesPage === page ? 'white' : colors.textSecondary,
                          }}
                        >
                          {page}
                        </motion.button>
                      );
                    })}
                  </div>
                  
                  <motion.button
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setExpensesPage(p => Math.min(totalExpensePages, p + 1))}
                    disabled={expensesPage === totalExpensePages}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium transition-all disabled:opacity-40"
                    style={{
                      background: expensesPage === totalExpensePages ? 'rgba(255, 255, 255, 0.03)' : `${colors.primary}20`,
                      border: `1px solid ${expensesPage === totalExpensePages ? 'transparent' : colors.primary}40`,
                      color: expensesPage === totalExpensePages ? colors.textSecondary : colors.primary,
                    }}
                  >
                    Next
                    <ChevronRight className="w-3 h-3" />
                  </motion.button>
                </div>
              </div>
            )}
          </GlassCard>
        </motion.div>
      </div>

      {/* Receipt Modal - Enhanced with Scrolling */}
      <AnimatePresence>
        {showReceiptModal && selectedPayment && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowReceiptModal(false)}
          >
            <div className="min-h-full flex items-start justify-center p-4 py-8">
              <motion.div
                className="max-w-3xl w-full"
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 20, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <GlassCard className="p-0 overflow-hidden">
                  {/* Modal Header */}
                  <div className="relative p-6 border-b border-white/10"
                       style={{ background: `linear-gradient(135deg, ${colors.primary}10, transparent)` }}>
                    <div 
                      className="absolute top-0 left-0 w-full h-1"
                      style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accentMint}, transparent)` }}
                    />
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                             style={{ 
                               background: `linear-gradient(135deg, ${colors.primary}40, ${colors.primary}20)`,
                               border: `1px solid ${colors.primary}50`,
                               boxShadow: `0 4px 15px ${colors.primary}30`
                             }}>
                          <FileText className="w-7 h-7" style={{ color: colors.primary }} />
                        </div>
                        <div>
                          <div className="flex items-center gap-2 mb-1">
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase"
                                  style={{ background: `${colors.primary}30`, color: colors.primary }}>
                              Payment Receipt
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex items-center gap-1"
                                  style={{ 
                                    background: `${getStatusColor(selectedPayment.status)}20`,
                                    color: getStatusColor(selectedPayment.status)
                                  }}>
                              {selectedPayment.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                              {selectedPayment.status === 'rejected' && <XCircle className="w-3 h-3" />}
                              {selectedPayment.status === 'pending' && <Clock className="w-3 h-3" />}
                              {selectedPayment.status}
                            </span>
                          </div>
                          <h3 className="text-xl font-bold text-white">{selectedPayment.students?.full_name}</h3>
                          <p className="text-sm flex items-center gap-2" style={{ color: colors.textSecondary }}>
                            <Users className="w-4 h-4" />
                            {selectedPayment.students?.reg_number}
                          </p>
                        </div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.1, rotate: 90 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setShowReceiptModal(false)}
                        className="p-2 rounded-xl transition-colors"
                        style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                      >
                        <X size={20} style={{ color: colors.textSecondary }} />
                      </motion.button>
                    </div>
                  </div>

                  {/* Modal Body - Scrollable */}
                  <div className="p-6 space-y-6">
                    {/* Payment Details Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="p-4 rounded-xl text-center" 
                           style={{ background: `linear-gradient(135deg, ${colors.primary}20, ${colors.primary}05)`, border: `1px solid ${colors.primary}30` }}>
                        <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Amount</p>
                        <p className="text-xl sm:text-2xl font-bold" style={{ color: colors.primary }}>
                          {formatCurrency(selectedPayment.amount)}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl text-center" 
                           style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Payment Type</p>
                        <p className="text-white font-semibold text-sm sm:text-base">
                          {selectedPayment.payment_types?.name || 'N/A'}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl text-center" 
                           style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                        <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Date Submitted</p>
                        <p className="text-white font-medium text-sm">
                          {formatDate(selectedPayment.created_at, 'short')}
                        </p>
                      </div>
                      <div className="p-4 rounded-xl text-center" 
                           style={{ 
                             background: `${getStatusColor(selectedPayment.status)}10`, 
                             border: `1px solid ${getStatusColor(selectedPayment.status)}30` 
                           }}>
                        <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>Status</p>
                        <p className="font-semibold text-sm capitalize flex items-center justify-center gap-1"
                           style={{ color: getStatusColor(selectedPayment.status) }}>
                          {selectedPayment.status === 'approved' && <CheckCircle className="w-4 h-4" />}
                          {selectedPayment.status === 'rejected' && <XCircle className="w-4 h-4" />}
                          {selectedPayment.status === 'pending' && <Clock className="w-4 h-4" />}
                          {selectedPayment.status}
                        </p>
                      </div>
                    </div>

                    {/* Transaction Reference */}
                    <div className="p-4 rounded-xl" 
                         style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.08)' }}>
                      <p className="text-xs font-medium mb-2" style={{ color: colors.textSecondary }}>Transaction Reference</p>
                      <p className="text-white font-mono text-sm sm:text-base break-all bg-black/20 px-3 py-2 rounded-lg">
                        {selectedPayment.transaction_ref}
                      </p>
                    </div>

                    {/* Notes if available */}
                    {selectedPayment.notes && (
                      <div className="p-4 rounded-xl" 
                           style={{ background: `${colors.accentMint}08`, border: `1px solid ${colors.accentMint}20` }}>
                        <p className="text-xs font-medium mb-2" style={{ color: colors.accentMint }}>Payment Notes</p>
                        <p className="text-white text-sm whitespace-pre-wrap leading-relaxed">
                          {selectedPayment.notes}
                        </p>
                      </div>
                    )}

                    {/* Receipt Image/PDF Section */}
                    <div>
                      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>
                        Receipt Attachment
                      </p>
                      <div className="rounded-xl overflow-hidden" 
                           style={{ background: 'rgba(0, 0, 0, 0.3)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                        {selectedPayment.receipt_url ? (
                          selectedPayment.receipt_url.endsWith('.pdf') ? (
                            <div className="p-8 text-center">
                              <div className="w-16 h-16 rounded-xl mx-auto mb-4 flex items-center justify-center"
                                   style={{ background: `${colors.primary}20` }}>
                                <FileText size={32} style={{ color: colors.primary }} />
                              </div>
                              <p className="text-white font-medium mb-4">PDF Receipt Document</p>
                              <motion.a
                                whileHover={{ scale: 1.02 }}
                                whileTap={{ scale: 0.98 }}
                                href={selectedPayment.receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-all shadow-lg"
                                style={{ 
                                  background: gradients.primary,
                                  boxShadow: `0 4px 15px ${colors.primary}30`
                                }}
                              >
                                <ExternalLink size={18} />
                                Open PDF
                              </motion.a>
                            </div>
                          ) : (
                            <div>
                              <img 
                                src={selectedPayment.receipt_url} 
                                alt="Payment Receipt" 
                                className="w-full h-auto object-contain"
                                style={{ maxHeight: '400px' }}
                              />
                              <motion.a
                                whileHover={{ scale: 1.01 }}
                                href={selectedPayment.receipt_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center justify-center gap-2 p-3 text-sm font-medium transition-colors border-t border-white/10"
                                style={{ color: colors.primary }}
                              >
                                <ExternalLink size={16} />
                                View Full Size
                              </motion.a>
                            </div>
                          )
                        ) : (
                          <div className="p-8 text-center">
                            <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                                 style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                              <AlertCircle size={32} style={{ color: colors.textSecondary }} />
                            </div>
                            <p className="text-white font-medium mb-1">No Receipt Uploaded</p>
                            <p className="text-sm" style={{ color: colors.textSecondary }}>
                              This payment doesn't have an attached receipt
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* All Reviews Modal with Pagination */}
      <AnimatePresence>
        {showAllReviewsModal && (
          <motion.div
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 overflow-y-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setShowAllReviewsModal(false)}
          >
            <div className="min-h-full flex items-start justify-center p-4 py-8">
              <motion.div
                className="max-w-4xl w-full"
                initial={{ scale: 0.9, y: 20, opacity: 0 }}
                animate={{ scale: 1, y: 0, opacity: 1 }}
                exit={{ scale: 0.9, y: 20, opacity: 0 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                onClick={(e) => e.stopPropagation()}
              >
                <GlassCard className="p-0 overflow-hidden">
                  {/* Modal Header */}
                  <div className="relative p-4 sm:p-6 border-b border-white/10">
                    <div 
                      className="absolute top-0 left-0 w-full h-1"
                      style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accentMint}, transparent)` }}
                    />
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2 sm:gap-3">
                        <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0"
                             style={{ background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)` }}>
                          <Receipt className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: colors.primary }} />
                        </div>
                        <div>
                          <h3 className="text-lg sm:text-xl font-bold text-white">All Payment Reviews</h3>
                          <p className="text-xs sm:text-sm" style={{ color: colors.textSecondary }}>
                            {filteredReviews.length} total submissions
                          </p>
                        </div>
                      </div>
                      <motion.button
                        whileHover={{ scale: 1.1, rotate: 90 }}
                        whileTap={{ scale: 0.9 }}
                        onClick={() => setShowAllReviewsModal(false)}
                        className="p-1.5 sm:p-2 rounded-lg transition-colors"
                        style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                      >
                        <X className="w-4 h-4 sm:w-5 sm:h-5" style={{ color: colors.textSecondary }} />
                      </motion.button>
                    </div>

                    {/* Filter Tabs */}
                    <div className="flex flex-wrap gap-1.5 sm:gap-2 mt-4">
                      {[
                        { key: 'all', label: 'All', count: allPayments.length },
                        { key: 'pending', label: 'Pending', count: pendingCount, color: colors.warning },
                        { key: 'approved', label: 'Approved', count: approvedCount, color: colors.statusPaid },
                        { key: 'rejected', label: 'Rejected', count: rejectedCount, color: colors.statusUnpaid },
                      ].map((filter) => (
                        <motion.button
                          key={filter.key}
                          whileHover={{ scale: 1.05 }}
                          whileTap={{ scale: 0.95 }}
                          onClick={() => {
                            setReviewsFilter(filter.key as typeof reviewsFilter);
                            setReviewsPage(1);
                          }}
                          className="flex items-center gap-1 sm:gap-2 px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all"
                          style={{
                            background: reviewsFilter === filter.key 
                              ? `linear-gradient(135deg, ${filter.color || colors.primary}30, ${filter.color || colors.primary}10)` 
                              : 'rgba(255, 255, 255, 0.05)',
                            border: `1px solid ${reviewsFilter === filter.key ? (filter.color || colors.primary) + '50' : 'rgba(255, 255, 255, 0.1)'}`,
                            color: reviewsFilter === filter.key ? (filter.color || colors.primary) : colors.textSecondary,
                          }}
                        >
                          {filter.label}
                          <span className="px-1 sm:px-1.5 py-0.5 rounded-full text-[10px] sm:text-xs"
                                style={{ background: 'rgba(255, 255, 255, 0.1)' }}>
                            {filter.count}
                          </span>
                        </motion.button>
                      ))}
                    </div>
                  </div>

                  {/* Modal Body - Payment List */}
                  <div className="p-4 sm:p-6 max-h-[60vh] overflow-y-auto">
                    {paginatedReviews.length === 0 ? (
                      <div className="text-center py-12">
                        <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                             style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                          <AlertCircle className="w-8 h-8" style={{ color: colors.textSecondary }} />
                        </div>
                        <p className="text-white font-medium mb-1">No Payments Found</p>
                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                          No {reviewsFilter !== 'all' ? reviewsFilter : ''} payments to display
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {paginatedReviews.map((payment, index) => (
                          <motion.div
                            key={payment.id}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: index * 0.03 }}
                            whileHover={{ scale: 1.01 }}
                            className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-3 sm:p-4 rounded-xl cursor-pointer group transition-all gap-3 sm:gap-0"
                            style={{ 
                              background: 'rgba(255, 255, 255, 0.03)',
                              border: '1px solid rgba(255, 255, 255, 0.05)'
                            }}
                            onClick={() => {
                              setSelectedPayment(payment);
                              setShowReceiptModal(true);
                            }}
                          >
                            <div className="flex items-center gap-3 sm:gap-4 flex-1">
                              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center font-bold text-base sm:text-lg transition-transform group-hover:scale-110 shrink-0"
                                   style={{ 
                                     background: `linear-gradient(135deg, ${getStatusColor(payment.status)}40, ${getStatusColor(payment.status)}20)`,
                                     color: getStatusColor(payment.status)
                                   }}>
                                {payment.students?.full_name?.charAt(0) || '?'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-white font-medium truncate text-sm sm:text-base">{payment.students?.full_name}</p>
                                <div className="flex items-center gap-2 flex-wrap">
                                  <p className="text-xs sm:text-sm truncate" style={{ color: colors.textSecondary }}>
                                    {payment.payment_types?.name}
                                  </p>
                                  <span className="text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full hidden xs:inline"
                                        style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textSecondary }}>
                                    {payment.students?.reg_number}
                                  </span>
                                </div>
                                {/* Mobile: Show amount and date inline */}
                                <div className="flex items-center gap-2 mt-1 sm:hidden">
                                  <span className="text-white font-semibold text-sm">{formatCurrency(payment.amount)}</span>
                                  <span className="text-xs" style={{ color: colors.textSecondary }}>•</span>
                                  <span className="text-xs" style={{ color: colors.textSecondary }}>{formatDate(payment.created_at, 'short')}</span>
                                </div>
                              </div>
                            </div>
                            <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 pl-13 sm:pl-0">
                              <div className="text-right hidden sm:block">
                                <p className="text-white font-semibold">{formatCurrency(payment.amount)}</p>
                                <p className="text-xs flex items-center gap-1" style={{ color: colors.textSecondary }}>
                                  <Calendar className="w-3 h-3" />
                                  {formatDate(payment.created_at, 'short')}
                                </p>
                              </div>
                              <span className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold capitalize flex items-center gap-1"
                                    style={{ 
                                      background: `linear-gradient(135deg, ${getStatusColor(payment.status)}30, ${getStatusColor(payment.status)}10)`,
                                      color: getStatusColor(payment.status),
                                      border: `1px solid ${getStatusColor(payment.status)}40`
                                    }}>
                                {payment.status === 'approved' && <CheckCircle className="w-3 h-3" />}
                                {payment.status === 'rejected' && <XCircle className="w-3 h-3" />}
                                {payment.status === 'pending' && <Clock className="w-3 h-3" />}
                                <span className="hidden xs:inline">{payment.status}</span>
                              </span>
                              <motion.div
                                whileHover={{ scale: 1.1 }}
                                className="p-1.5 sm:p-2 rounded-lg opacity-60 group-hover:opacity-100 transition-opacity"
                                style={{ background: `${colors.primary}20`, color: colors.primary }}
                              >
                                <Eye className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                              </motion.div>
                            </div>
                          </motion.div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Pagination Footer */}
                  {totalReviewPages > 1 && (
                    <div className="p-3 sm:p-4 border-t border-white/10">
                      <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                        <p className="text-xs sm:text-sm text-center sm:text-left" style={{ color: colors.textSecondary }}>
                          Page {reviewsPage} of {totalReviewPages} • <span className="hidden xs:inline">Showing</span> {paginatedReviews.length} of {filteredReviews.length}
                        </p>
                        <div className="flex items-center gap-1 sm:gap-2">
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setReviewsPage(p => Math.max(1, p - 1))}
                            disabled={reviewsPage === 1}
                            className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all disabled:opacity-40"
                            style={{
                              background: reviewsPage === 1 ? 'rgba(255, 255, 255, 0.03)' : `${colors.primary}20`,
                              border: `1px solid ${reviewsPage === 1 ? 'transparent' : colors.primary}40`,
                              color: reviewsPage === 1 ? colors.textSecondary : colors.primary,
                            }}
                          >
                            <ChevronLeft className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            <span className="hidden xs:inline">Prev</span>
                          </motion.button>
                          
                          <div className="flex gap-1">
                            {Array.from({ length: Math.min(totalReviewPages, 5) }, (_, i) => {
                              let page: number;
                              if (totalReviewPages <= 5) {
                                page = i + 1;
                              } else if (reviewsPage <= 3) {
                                page = i + 1;
                              } else if (reviewsPage >= totalReviewPages - 2) {
                                page = totalReviewPages - 4 + i;
                              } else {
                                page = reviewsPage - 2 + i;
                              }
                              
                              return (
                                <motion.button
                                  key={page}
                                  whileHover={{ scale: 1.1 }}
                                  whileTap={{ scale: 0.9 }}
                                  onClick={() => setReviewsPage(page)}
                                  className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg text-xs sm:text-sm font-semibold transition-all"
                                  style={{
                                    background: reviewsPage === page 
                                      ? gradients.primary
                                      : 'rgba(255, 255, 255, 0.05)',
                                    color: reviewsPage === page ? 'white' : colors.textSecondary,
                                  }}
                                >
                                  {page}
                                </motion.button>
                              );
                            })}
                          </div>
                          
                          <motion.button
                            whileHover={{ scale: 1.05 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => setReviewsPage(p => Math.min(totalReviewPages, p + 1))}
                            disabled={reviewsPage === totalReviewPages}
                            className="flex items-center gap-0.5 sm:gap-1 px-2 sm:px-3 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all disabled:opacity-40"
                            style={{
                              background: reviewsPage === totalReviewPages ? 'rgba(255, 255, 255, 0.03)' : `${colors.primary}20`,
                              border: `1px solid ${reviewsPage === totalReviewPages ? 'transparent' : colors.primary}40`,
                              color: reviewsPage === totalReviewPages ? colors.textSecondary : colors.primary,
                            }}
                          >
                            <span className="hidden xs:inline">Next</span>
                            <ChevronRight className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          </motion.button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Quick Action to Review Page */}
                  <div className="p-4 border-t border-white/10 bg-white/[0.02]">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setShowAllReviewsModal(false);
                        navigate('/admin/review');
                      }}
                      className="w-full flex items-center justify-center gap-2 py-3 rounded-xl font-medium text-white transition-all"
                      style={{ 
                        background: gradients.primary,
                        boxShadow: `0 4px 15px ${colors.primary}30`
                      }}
                    >
                      <Eye className="w-5 h-5" />
                      Go to Full Review Page
                      <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </GlassCard>
              </motion.div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Footer />
    </div>
  );
}
