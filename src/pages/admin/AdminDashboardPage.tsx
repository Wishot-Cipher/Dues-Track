import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/config/supabase';
import { colors, gradients } from '@/config/colors';
import GlassCard from '@/components/ui/GlassCard';
import { formatCurrency } from '@/utils/formatters';
import { AdminDashboardSkeleton } from '@/components/ui/Skeleton';
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
  const [showReceiptModal, setShowReceiptModal] = useState(false);
  const [selectedPayment, setSelectedPayment] = useState<RecentPayment | null>(null);
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
  }, []);

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
      const { data } = await supabase
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
        .in('status', ['approved', 'rejected']) // Only show attended/reviewed items
        .order('updated_at', { ascending: false }) // Most recently reviewed first
        .limit(5);

      setRecentPayments(data || []);
    } catch (error) {
      console.error('Error fetching recent payments:', error);
    }
  };

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
          <GlassCard>
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Admin Dashboard</h1>
                <p style={{ color: colors.textSecondary }}>Manage payments and monitor class finances</p>
              </div>
              <div className="flex flex-wrap gap-3">
                {hasPermission('can_create_payments') && (
                <button
                  onClick={() => navigate('/admin/create-payment')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-all"
                  style={{ background: gradients.primary }}
                >
                  <Plus className="w-5 h-5" />
                  <span className="hidden sm:inline">Create Payment</span>
                </button>
                )}
                {hasPermission('can_approve_payments') && (
                <button
                  onClick={() => navigate('/admin/scan-qr')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-all"
                  style={{ background: gradients.mint }}
                >
                  <QrCode className="w-5 h-5" />
                  <span className="hidden sm:inline">Scan QR Code</span>
                </button>
                )}
                {hasPermission('can_approve_payments') && (
                <button
                  onClick={() => navigate('/admin/review')}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all relative"
                  style={{ 
                    background: `${colors.warning}20`,
                    border: `1px solid ${colors.warning}40`,
                    color: colors.warning
                  }}
                >
                  <Clock className="w-5 h-5" />
                  <span className="hidden sm:inline">Review Payments</span>
                  {stats.pendingReview > 0 && (
                    <span className="absolute -top-2 -right-2 w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white"
                          style={{ background: colors.statusUnpaid }}>
                      {stats.pendingReview}
                    </span>
                  )}
                </button>
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
            >
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Total Students</p>
                    <p className="text-3xl font-bold text-white">{stats.totalStudents}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                       style={{ background: `${colors.primary}20` }}>
                    <Users className="w-6 h-6" style={{ color: colors.primary }} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Pending Review */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Pending Review</p>
                    <p className="text-3xl font-bold" style={{ color: colors.warning }}>{stats.pendingReview}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                       style={{ background: `${colors.warning}20` }}>
                    <Clock className="w-6 h-6" style={{ color: colors.warning }} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Total Collected */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm mb-1 cursor-pointer" style={{ color: colors.textSecondary }} onClick={() => navigate('/admin/collected')}>Total Collected</p>
                    <p className="text-2xl font-bold text-white cursor-pointer" onClick={() => navigate('/admin/collected')}>{formatCurrency(stats.totalCollected)}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                       style={{ background: `${colors.statusPaid}20` }}>
                    <Wallet className="w-6 h-6" style={{ color: colors.statusPaid }} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Active Payment Types */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
            >
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Active Payments</p>
                    <p className="text-3xl font-bold text-white">{stats.totalPaymentTypes}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                       style={{ background: `${colors.accentMint}20` }}>
                    <FileText className="w-6 h-6" style={{ color: colors.accentMint }} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Approved Today */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.5 }}
            >
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Approved Today</p>
                    <p className="text-3xl font-bold" style={{ color: colors.statusPaid }}>{stats.approvedToday}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                       style={{ background: `${colors.statusPaid}20` }}>
                    <CheckCircle className="w-6 h-6" style={{ color: colors.statusPaid }} />
                  </div>
                </div>
              </GlassCard>
            </motion.div>

            {/* Rejected Payments */}
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
            >
              <GlassCard>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Rejected</p>
                    <p className="text-3xl font-bold" style={{ color: colors.statusUnpaid }}>{stats.rejectedPayments}</p>
                  </div>
                  <div className="w-12 h-12 rounded-xl flex items-center justify-center"
                       style={{ background: `${colors.statusUnpaid}20` }}>
                    <XCircle className="w-6 h-6" style={{ color: colors.statusUnpaid }} />
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
          <GlassCard>
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-white">Recent Submissions</h2>
              <button
                onClick={() => navigate('/admin/review')}
                className="text-sm font-medium transition-all"
                style={{ color: colors.primary }}
              >
                View All →
              </button>
            </div>

            {recentPayments.length === 0 ? (
              <div className="text-center py-8">
                <AlertCircle className="w-12 h-12 mx-auto mb-3" style={{ color: colors.textSecondary }} />
                <p style={{ color: colors.textSecondary }}>No recent submissions</p>
              </div>
            ) : (
              <div className="space-y-3">
                {recentPayments.map((payment, index) => (
                  <motion.div
                    key={payment.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="flex items-center justify-between p-4 rounded-lg transition-all hover:bg-white/5"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                  >
                    <div className="flex items-center gap-4 flex-1">
                      <div className="w-10 h-10 rounded-full flex items-center justify-center"
                           style={{ background: `${colors.primary}20` }}>
                        <Users className="w-5 h-5" style={{ color: colors.primary }} />
                      </div>
                      <div className="flex-1">
                        <p className="text-white font-medium">{payment.students?.full_name}</p>
                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                          {payment.payment_types?.name}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <p className="text-white font-semibold">{formatCurrency(payment.amount)}</p>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                          {payment.students?.reg_number}
                        </p>
                      </div>
                      <span className="px-3 py-1 rounded-full text-xs font-medium capitalize"
                            style={{ 
                              background: `${getStatusColor(payment.status)}20`,
                              color: getStatusColor(payment.status)
                            }}>
                        {payment.status}
                      </span>
                      <button
                        onClick={() => {
                          setSelectedPayment(payment);
                          setShowReceiptModal(true);
                        }}
                        className="p-2 rounded-lg transition-all"
                        style={{ background: `${colors.primary}20`, color: colors.primary }}
                        title="View Receipt"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    </div>
                  </motion.div>
                ))}
              </div>
            )}
          </GlassCard>
        </motion.div>

        {/* Quick Actions */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
        >
          <GlassCard>
            <h2 className="text-xl font-bold text-white mb-4">Quick Actions</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              <button
                onClick={() => navigate('/dashboard')}
                className="flex items-center gap-3 p-4 rounded-lg transition-all hover:bg-opacity-80"
                style={{ background: 'rgba(255, 104, 3, 0.1)', border: '1px solid rgba(255, 104, 3, 0.3)' }}
              >
                <Wallet className="w-5 h-5" style={{ color: colors.primary }} />
                <span className="text-white font-medium">Student Dashboard</span>
              </button>
              {hasPermission('can_create_payments') && (
              <button
                onClick={() => navigate('/admin/create-payment')}
                className="flex items-center gap-3 p-4 rounded-lg transition-all"
                style={{ background: 'rgba(255, 255, 255, 0.05)' }}
              >
                <Plus className="w-5 h-5" style={{ color: colors.primary }} />
                <span className="text-white font-medium">Create Payment</span>
              </button>
              )}
              {hasPermission('can_approve_payments') && (
              <button
                onClick={() => navigate('/admin/review')}
                className="flex items-center gap-3 p-4 rounded-lg transition-all"
                style={{ background: 'rgba(255, 255, 255, 0.05)' }}
              >
                <Eye className="w-5 h-5" style={{ color: colors.warning }} />
                <span className="text-white font-medium">Review Submissions</span>
              </button>
              )}
              {hasPermission('can_manage_students') && (
              <button
                onClick={() => navigate('/admin/manage-students')}
                className="flex items-center gap-3 p-4 rounded-lg transition-all"
                style={{ background: 'rgba(255, 255, 255, 0.05)' }}
              >
                <Users className="w-5 h-5" style={{ color: colors.accentMint }} />
                <span className="text-white font-medium">Manage Students</span>
              </button>
              )}
              {hasPermission('can_manage_students') && (
              <button
                onClick={() => navigate('/admin/expenses')}
                className="flex items-center gap-3 p-4 rounded-lg transition-all"
                style={{ background: 'rgba(255, 255, 255, 0.05)' }}
              >
                <FileText className="w-5 h-5" style={{ color: colors.primary }} />
                <span className="text-white font-medium">Expenses</span>
              </button>
              )}
              {hasPermission('can_approve_payments') && (
              <button
                onClick={() => navigate('/admin/waive-payment')}
                className="flex items-center gap-3 p-4 rounded-lg transition-all"
                style={{ background: 'rgba(255, 255, 255, 0.05)' }}
              >
                <Edit className="w-5 h-5" style={{ color: colors.statusPaid }} />
                <span className="text-white font-medium">Waive Payment</span>
              </button>
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

        {/* Expenses - quick link + list (admin features) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9 }}
        >
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-1">
              <GlassCard>
                <h3 className="text-lg font-semibold text-white mb-2">Record Expense</h3>
                <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>Record a new expense in the dedicated expenses page.</p>
                <div className="flex">
                  <button
                    onClick={() => navigate('/admin/expenses')}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-all w-full"
                    style={{ background: 'linear-gradient(90deg, rgba(255,104,3,1), rgba(255,160,64,1))' }}
                  >
                    <FileText className="w-5 h-5" />
                    <span>Go to Expenses</span>
                  </button>
                </div>
              </GlassCard>
            </div>
            {/* expense list removed from dashboard to keep the view focused; use /admin/expenses */}
          </div>
        </motion.div>
      </div>

      {/* Receipt Modal */}
      {showReceiptModal && selectedPayment && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-70 flex items-center justify-center z-50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          onClick={() => setShowReceiptModal(false)}
        >
          <motion.div
            className="max-w-2xl w-full rounded-xl overflow-hidden"
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            onClick={(e) => e.stopPropagation()}
          >
            <GlassCard className="p-6">
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xl font-bold text-white">Payment Receipt</h3>
                <button
                  onClick={() => setShowReceiptModal(false)}
                  className="p-2 rounded-lg transition-colors"
                  style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                >
                  <X size={20} style={{ color: colors.textSecondary }} />
                </button>
              </div>

              {/* Payment Details */}
              <div className="space-y-4 mb-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Student Name</p>
                    <p className="text-white font-medium">{selectedPayment.students?.full_name}</p>
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Registration Number</p>
                    <p className="text-white font-medium">{selectedPayment.students?.reg_number}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Payment Type</p>
                    <p className="text-white font-medium">{selectedPayment.payment_types?.name}</p>
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Amount</p>
                    <p className="text-white font-medium">{formatCurrency(selectedPayment.amount)}</p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Transaction Reference</p>
                    <p className="text-white font-medium text-sm">{selectedPayment.transaction_ref}</p>
                  </div>
                  <div>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Status</p>
                    <span className="inline-block px-3 py-1 rounded-full text-xs font-medium capitalize"
                          style={{ 
                            background: `${getStatusColor(selectedPayment.status)}20`,
                            color: getStatusColor(selectedPayment.status)
                          }}>
                      {selectedPayment.status}
                    </span>
                  </div>
                </div>

                {selectedPayment.notes && (
                  <div>
                    <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Notes</p>
                    <p className="text-white text-sm whitespace-pre-wrap p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                      {selectedPayment.notes}
                    </p>
                  </div>
                )}
              </div>

              {/* Receipt Image/PDF */}
              {selectedPayment.receipt_url ? (
                <div>
                  <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>Receipt</p>
                  {selectedPayment.receipt_url.endsWith('.pdf') ? (
                    <div className="p-8 rounded-lg text-center" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                      <FileText size={48} className="mx-auto mb-3" style={{ color: colors.primary }} />
                      <p className="text-white mb-4">PDF Receipt</p>
                      <a
                        href={selectedPayment.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-medium text-white transition-all"
                        style={{ background: gradients.primary }}
                      >
                        <ExternalLink size={18} />
                        Open PDF
                      </a>
                    </div>
                  ) : (
                    <div className="rounded-lg overflow-hidden" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                      <img 
                        src={selectedPayment.receipt_url} 
                        alt="Payment Receipt" 
                        className="w-full h-auto max-h-96 object-contain"
                      />
                      <a
                        href={selectedPayment.receipt_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-center gap-2 p-3 text-sm font-medium transition-colors"
                        style={{ color: colors.primary }}
                      >
                        <ExternalLink size={16} />
                        View Full Size
                      </a>
                    </div>
                  )}
                </div>
              ) : (
                <div className="p-8 rounded-lg text-center" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                  <AlertCircle size={48} className="mx-auto mb-3" style={{ color: colors.textSecondary }} />
                  <p style={{ color: colors.textSecondary }}>No receipt uploaded</p>
                </div>
              )}
            </GlassCard>
          </motion.div>
        </motion.div>
      )}
      <Footer />
    </div>
  );
}
