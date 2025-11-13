import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/config/supabase';
import { useToast } from '@/hooks/useToast';
import { colors, gradients } from '@/config/colors';
import GlassCard from '@/components/ui/GlassCard';
import { formatCurrency, formatDate } from '@/utils/formatters';
import {
  CheckCircle,
  XCircle,
  FileText,
  User,
  AlertTriangle,
  Eye,
  X,
  Check,
  Clock,
  ArrowLeft,
} from 'lucide-react';
import Footer from '@/components/Footer';
import notificationService from '@/services/notificationService';

interface PendingPayment {
  id: string;
  student_id: string;
  payment_type_id: string;
  amount: number;
  transaction_ref: string;
  receipt_url: string;
  notes: string | null;
  created_at: string;
  status: 'pending' | 'approved' | 'rejected';
  approved_at?: string;
  rejection_reason?: string;
  students: {
    full_name: string;
    reg_number: string;
    level: string;
  };
  payment_types: {
    title: string;
    category: string;
  };
}

export default function AdminReviewPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<PendingPayment | null>(null);
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const itemsPerPage = 10;

  // Scroll to top helper
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Filter and paginate payments
  const filteredPayments = payments.filter(p => filter === 'all' || p.status === filter);
  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const fetchPendingPayments = async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('payments')
        .select(`
          *,
          students!payments_student_id_fkey (
            full_name,
            reg_number,
            level
          ),
          payment_types (
            title,
            category
          )
        `)
        .order('created_at', { ascending: true });

      if (error) throw error;
      
      // Sort: pending first, then approved/rejected
      const sorted = (data || []).sort((a, b) => {
        if (a.status === 'pending' && b.status !== 'pending') return -1;
        if (a.status !== 'pending' && b.status === 'pending') return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
      
      setPayments(sorted);
    } catch (error) {
      console.error('Error fetching pending payments:', error);
      showError('Failed to load pending payments');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingPayments();

    const channel = supabase
      .channel('pending-payments')
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'payments',
        },
        () => {
          fetchPendingPayments();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = async () => {
    if (!selectedPayment) return;

    try {
      setProcessingId(selectedPayment.id);
      const { error } = await supabase
        .from('payments')
        .update({
          status: 'approved',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
        })
        .eq('id', selectedPayment.id);

      if (error) throw error;

      // Send notification to student using notification service
      await notificationService.sendPaymentApprovedNotification(
        selectedPayment.student_id,
        selectedPayment.students.full_name,
        selectedPayment.payment_types?.title || 'Payment',
        selectedPayment.amount,
        selectedPayment.id
      );

      showSuccess('Payment approved successfully!');
      setShowApproveModal(false);
      setSelectedPayment(null);
      fetchPendingPayments();
    } catch (error) {
      console.error('Error approving payment:', error);
      showError('Failed to approve payment');
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string, transactionRef?: string) => {
    // Check if waived
    if (status === 'approved' && transactionRef?.startsWith('WAIVED-')) {
      return { bg: `${colors.accentMint}20`, color: colors.accentMint, label: 'WAIVED' };
    }
    
    switch (status) {
      case 'approved':
        return { bg: `${colors.statusPaid}20`, color: colors.statusPaid, label: 'APPROVED' };
      case 'rejected':
        return { bg: `${colors.statusUnpaid}20`, color: colors.statusUnpaid, label: 'REJECTED' };
      default:
        return { bg: `${colors.warning}20`, color: colors.warning, label: 'PENDING' };
    }
  };

  const handleReject = async () => {
    if (!selectedPayment || !rejectionReason.trim()) {
      showError('Please provide a rejection reason');
      return;
    }

    try {
      setProcessingId(selectedPayment.id);
      const { error } = await supabase
        .from('payments')
        .update({
          status: 'rejected',
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason.trim(),
        })
        .eq('id', selectedPayment.id);

      if (error) throw error;

// Send notification to student using notification service
await notificationService.sendPaymentRejectedNotification(
  selectedPayment.student_id,
  selectedPayment.students.full_name,
  selectedPayment.payment_types?.title || 'Payment',
  selectedPayment.amount,
  rejectionReason.trim(),
  selectedPayment.id
);

      showSuccess('Payment rejected');
      setShowRejectModal(false);
      setRejectionReason('');
      setSelectedPayment(null);
      fetchPendingPayments();
    } catch (error) {
      console.error('Error rejecting payment:', error);
      showError('Failed to reject payment');
    } finally {
      setProcessingId(null);
    }
  };

  return (
    <div className="min-h-screen py-4 sm:py-6 relative overflow-x-hidden"  style={{
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
      
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 space-y-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard>
            <div className="flex flex-col sm:flex-row items-center sm:items-start justify-between gap-4">
              <div className="text-center sm:text-left w-full sm:w-auto">
                <button
                  onClick={() => navigate('/admin/dashboard')}
                  className="flex items-center justify-center sm:justify-start gap-2 mb-3 px-3 py-1.5 rounded-lg transition-colors text-sm w-full sm:w-auto"
                  style={{ 
                    color: colors.textSecondary,
                    background: 'rgba(255, 255, 255, 0.05)',
                  }}
                >
                  <ArrowLeft size={16} />
                  <span>Back to Dashboard</span>
                </button>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Payment Review</h1>
                <p className="text-sm sm:text-base" style={{ color: colors.textSecondary }}>Review and approve pending payment submissions</p>
              </div>
              <div className="flex items-center gap-3 w-full sm:w-auto justify-center">
                <div className="px-4 sm:px-6 py-3 sm:py-4 rounded-xl w-full sm:w-auto text-center" style={{ background: `${colors.warning}20`, border: `1px solid ${colors.warning}40` }}>
                  <p className="text-xs sm:text-sm" style={{ color: colors.textSecondary }}>Pending Review</p>
                  <p className="text-2xl sm:text-3xl font-bold mt-1" style={{ color: colors.warning }}>
                    {payments.filter(p => p.status === 'pending').length}
                  </p>
                </div>
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Filter Tabs */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          <GlassCard>
            <div className="flex flex-wrap gap-2">
              {[
                { value: 'all', label: 'All Payments', count: payments.length },
                { value: 'pending', label: 'Pending', count: payments.filter(p => p.status === 'pending').length },
                { value: 'approved', label: 'Approved', count: payments.filter(p => p.status === 'approved').length },
                { value: 'rejected', label: 'Rejected', count: payments.filter(p => p.status === 'rejected').length },
              ].map(({ value, label, count }) => (
                <button
                  key={value}
                  onClick={() => {
                    setFilter(value as typeof filter);
                    setCurrentPage(1);
                  }}
                  className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                  style={{
                    background: filter === value ? `${colors.primary}30` : 'rgba(255, 255, 255, 0.05)',
                    border: `1px solid ${filter === value ? colors.primary + '60' : 'transparent'}`,
                    color: filter === value ? colors.primary : colors.textSecondary,
                  }}
                >
                  {label} ({count})
                </button>
              ))}
            </div>
          </GlassCard>
        </motion.div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" 
                 style={{ borderColor: colors.primary, borderTopColor: 'transparent' }} />
          </div>
        ) : paginatedPayments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <GlassCard>
              <div className="text-center py-12">
                <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: colors.statusPaid }} />
                <p className="text-xl text-white mb-2">
                  {filter === 'all' ? 'All Caught Up!' : `No ${filter} payments`}
                </p>
                <p style={{ color: colors.textSecondary }}>No pending payments to review</p>
              </div>
            </GlassCard>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <GlassCard>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                      <th className="text-left py-4 px-4 text-sm font-semibold" style={{ color: colors.textSecondary }}>
                        STUDENT
                      </th>
                      <th className="text-left py-4 px-4 text-sm font-semibold" style={{ color: colors.textSecondary }}>
                        PAYMENT TYPE
                      </th>
                      <th className="text-left py-4 px-4 text-sm font-semibold" style={{ color: colors.textSecondary }}>
                        AMOUNT
                      </th>
                      <th className="text-left py-4 px-4 text-sm font-semibold" style={{ color: colors.textSecondary }}>
                        SUBMITTED
                      </th>
                      <th className="text-left py-4 px-4 text-sm font-semibold" style={{ color: colors.textSecondary }}>
                        TRANSACTION REF
                      </th>
                      <th className="text-right py-4 px-4 text-sm font-semibold" style={{ color: colors.textSecondary }}>
                        ACTIONS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPayments.map((payment, index) => (
                      <motion.tr
                        key={payment.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="border-b hover:bg-white/5 transition-colors"
                        style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 rounded-full flex items-center justify-center" 
                                 style={{ background: `${colors.primary}20` }}>
                              <User className="w-5 h-5" style={{ color: colors.primary }} />
                            </div>
                            <div>
                              <p className="text-white font-medium">{payment.students.full_name}</p>
                              <p className="text-sm" style={{ color: colors.textSecondary }}>
                                {payment.students.reg_number} • {payment.students.level}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-white font-medium">{payment.payment_types.title}</p>
                          <p className="text-sm capitalize" style={{ color: colors.textSecondary }}>
                            {payment.payment_types.category.replace('_', ' ')}
                          </p>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-white font-semibold text-lg">
                            {formatCurrency(payment.amount)}
                          </p>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <Clock className="w-4 h-4" style={{ color: colors.textSecondary }} />
                            <p className="text-white text-sm">
                              {formatDate(payment.created_at, 'short')}
                            </p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <p className="text-white font-mono text-sm">
                            {payment.transaction_ref}
                          </p>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedPayment(payment)}
                              className="p-2 rounded-lg transition-all"
                              style={{ 
                                background: `${colors.primary}20`,
                                color: colors.primary
                              }}
                              title="View Receipt"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                            {payment.status === 'pending' && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedPayment(payment);
                                    setShowApproveModal(true);
                                  }}
                                  disabled={processingId === payment.id}
                                  className="p-2 rounded-lg transition-all disabled:opacity-50"
                                  style={{ 
                                    background: `${colors.statusPaid}20`,
                                    color: colors.statusPaid
                                  }}
                                  title="Approve"
                                >
                                  {processingId === payment.id ? (
                                    <div className="animate-spin rounded-full h-5 w-5 border-2 border-t-transparent" 
                                         style={{ borderColor: colors.statusPaid, borderTopColor: 'transparent' }} />
                                  ) : (
                                    <Check className="w-5 h-5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedPayment(payment);
                                    setShowRejectModal(true);
                                  }}
                                  disabled={processingId === payment.id}
                                  className="p-2 rounded-lg transition-all disabled:opacity-50"
                                  style={{ 
                                    background: `${colors.statusUnpaid}20`,
                                    color: colors.statusUnpaid
                                  }}
                                  title="Reject"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile Card View */}
              <div className="lg:hidden space-y-4">
                {paginatedPayments.map((payment, index) => (
                  <motion.div
                    key={payment.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: Math.min(index * 0.02, 0.3) }}
                    className="p-4 rounded-lg" 
                    style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  >
                    {/* Student Info - Centered */}
                    <div className="flex flex-col items-center text-center mb-4">
                      <div className="w-14 h-14 rounded-full flex items-center justify-center mb-3" 
                           style={{ background: `${colors.primary}20` }}>
                        <User className="w-6 h-6" style={{ color: colors.primary }} />
                      </div>
                      <p className="text-white font-semibold text-lg">{payment.students.full_name}</p>
                      <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>
                        {payment.students.reg_number}
                      </p>
                      {(() => {
                        const badge = getStatusBadge(payment.status, payment.transaction_ref);
                        return (
                          <span className="px-3 py-1.5 rounded-full text-xs font-medium" 
                                style={{ background: badge.bg, color: badge.color }}>
                            {badge.label}
                          </span>
                        );
                      })()}
                    </div>

                    {/* Payment Details - Organized Grid */}
                    <div className="space-y-3 mb-4">
                      <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                        <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Payment Type</p>
                        <p className="text-white text-sm font-medium">{payment.payment_types.title}</p>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                          <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Amount</p>
                          <p className="text-white font-semibold text-sm">{formatCurrency(payment.amount)}</p>
                        </div>
                        <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                          <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Submitted</p>
                          <p className="text-white text-xs">{formatDate(payment.created_at, 'short')}</p>
                        </div>
                      </div>
                      <div className="p-3 rounded-lg text-center" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                        <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Transaction Ref</p>
                        <p className="text-white text-xs font-mono break-all">{payment.transaction_ref}</p>
                      </div>
                    </div>

                    {/* Actions - Stacked Layout */}
                    <div className="space-y-2">
                      <button
                        onClick={() => setSelectedPayment(payment)}
                        className="w-full flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all"
                        style={{ 
                          background: `${colors.primary}20`,
                          border: `1px solid ${colors.primary}40`,
                          color: colors.primary
                        }}
                      >
                        <Eye className="w-4 h-4" />
                        View Receipt
                      </button>
                      {payment.status === 'pending' && (
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            onClick={() => {
                              setSelectedPayment(payment);
                              setShowApproveModal(true);
                            }}
                            disabled={processingId === payment.id}
                            className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                            style={{ 
                              background: `${colors.statusPaid}20`,
                              border: `1px solid ${colors.statusPaid}40`,
                              color: colors.statusPaid
                            }}
                          >
                            {processingId === payment.id ? (
                              <>
                                <div className="animate-spin rounded-full h-4 w-4 border-2 border-t-transparent" 
                                     style={{ borderColor: colors.statusPaid, borderTopColor: 'transparent' }} />
                                <span className="hidden sm:inline">Processing</span>
                              </>
                            ) : (
                              <>
                                <Check className="w-4 h-4" />
                                Approve
                              </>
                            )}
                          </button>
                          <button
                            onClick={() => {
                              setSelectedPayment(payment);
                              setShowRejectModal(true);
                            }}
                            disabled={processingId === payment.id}
                            className="flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                            style={{ 
                              background: `${colors.statusUnpaid}20`,
                              border: `1px solid ${colors.statusUnpaid}40`,
                              color: colors.statusUnpaid
                            }}
                          >
                            <X className="w-4 h-4" />
                            Reject
                          </button>
                        </div>
                      )}
                    </div>
                  </motion.div>
                ))}
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Pagination */}
        {!loading && filteredPayments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <GlassCard>
              {totalPages > 1 ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p className="text-xs sm:text-sm text-center sm:text-left" style={{ color: colors.textSecondary }}>
                    Showing {(currentPage - 1) * itemsPerPage + 1} - {Math.min(currentPage * itemsPerPage, filteredPayments.length)} of {filteredPayments.length}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <button
                      onClick={() => {
                        setCurrentPage(p => Math.max(1, p - 1));
                        scrollToTop();
                      }}
                      disabled={currentPage === 1}
                      className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: currentPage === 1 ? 'rgba(255, 255, 255, 0.05)' : `${colors.primary}20`,
                        color: currentPage === 1 ? colors.textSecondary : colors.primary,
                      }}
                    >
                      Previous
                    </button>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                        <button
                          key={page}
                          onClick={() => {
                            setCurrentPage(page);
                            scrollToTop();
                          }}
                          className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg text-xs sm:text-sm font-medium transition-all"
                          style={{
                            background: currentPage === page ? colors.primary : 'rgba(255, 255, 255, 0.05)',
                            color: currentPage === page ? 'white' : colors.textSecondary,
                          }}
                        >
                          {page}
                        </button>
                      ))}
                    </div>
                    <button
                      onClick={() => {
                        setCurrentPage(p => Math.min(totalPages, p + 1));
                        scrollToTop();
                      }}
                      disabled={currentPage === totalPages}
                      className="px-3 sm:px-4 py-2 rounded-lg text-xs sm:text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background: currentPage === totalPages ? 'rgba(255, 255, 255, 0.05)' : `${colors.primary}20`,
                        color: currentPage === totalPages ? colors.textSecondary : colors.primary,
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p className="text-xs sm:text-sm" style={{ color: colors.textSecondary }}>
                    Showing all {filteredPayments.length} payment{filteredPayments.length !== 1 ? 's' : ''}
                  </p>
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </div>

      {/* Receipt Viewer Modal */}
      <AnimatePresence>
        {selectedPayment && !showRejectModal && !showApproveModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setSelectedPayment(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-4xl"
              onClick={(e) => e.stopPropagation()}
            >
              <GlassCard>
                {/* Header */}
                <div className="flex items-center justify-between mb-6 pb-4 border-b" 
                     style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                  <div>
                    <h2 className="text-2xl font-bold text-white mb-1">Payment Receipt</h2>
                    <p style={{ color: colors.textSecondary }}>{selectedPayment.students.full_name}</p>
                  </div>
                  <button
                    onClick={() => setSelectedPayment(null)}
                    className="p-2 hover:bg-white/10 rounded-lg transition-colors"
                  >
                    <X className="w-6 h-6" style={{ color: colors.textSecondary }} />
                  </button>
                </div>

                {/* Receipt Image */}
                <div className="mb-6 max-h-[60vh] overflow-y-auto rounded-lg">
                  <img
                    src={selectedPayment.receipt_url}
                    alt="Payment Receipt"
                    className="w-full rounded-lg"
                    style={{ background: 'rgba(0, 0, 0, 0.5)' }}
                  />
                </div>

                {/* Payment Info */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6 p-4 rounded-lg" 
                     style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                  <div>
                    <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Amount</p>
                    <p className="text-white font-semibold text-lg">{formatCurrency(selectedPayment.amount)}</p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Payment Type</p>
                    <p className="text-white font-medium">{selectedPayment.payment_types.title}</p>
                  </div>
                  <div>
                    <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Transaction Ref</p>
                    <p className="text-white font-mono text-sm">{selectedPayment.transaction_ref}</p>
                  </div>
                </div>

                {/* Actions */}
                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={() => window.open(selectedPayment.receipt_url, '_blank')}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all"
                    style={{ 
                      background: `${colors.primary}20`,
                      border: `1px solid ${colors.primary}40`,
                      color: colors.primary
                    }}
                  >
                    <FileText className="w-5 h-5" />
                    Open Full Size
                  </button>
                  <button
                    onClick={() => {
                      setShowApproveModal(true);
                    }}
                    disabled={processingId === selectedPayment.id}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium text-white transition-all disabled:opacity-50"
                    style={{ background: gradients.primary }}
                  >
                    <CheckCircle className="w-5 h-5" />
                    {processingId === selectedPayment.id ? 'Approving...' : 'Approve Payment'}
                  </button>
                  <button
                    onClick={() => setShowRejectModal(true)}
                    disabled={processingId === selectedPayment.id}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium transition-all disabled:opacity-50"
                    style={{ 
                      background: `${colors.statusUnpaid}20`,
                      border: `1px solid ${colors.statusUnpaid}40`,
                      color: colors.statusUnpaid
                    }}
                  >
                    <XCircle className="w-5 h-5" />
                    Reject Payment
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Approve Confirmation Modal */}
      <AnimatePresence>
        {showApproveModal && selectedPayment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => setShowApproveModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" 
                       style={{ background: `${colors.statusPaid}20` }}>
                    <CheckCircle className="w-6 h-6" style={{ color: colors.statusPaid }} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Approve Payment</h3>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                      Confirm payment approval
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-lg mb-6" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                  <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>Student</p>
                  <p className="text-white font-medium mb-3">{selectedPayment.students.full_name}</p>
                  
                  <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>Amount</p>
                  <p className="text-white font-semibold text-lg mb-3">{formatCurrency(selectedPayment.amount)}</p>
                  
                  <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>Payment Type</p>
                  <p className="text-white">{selectedPayment.payment_types.title}</p>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => setShowApproveModal(false)}
                    className="flex-1 py-3 rounded-lg font-medium text-white transition-all"
                    style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApprove}
                    disabled={processingId === selectedPayment.id}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium text-white transition-all disabled:opacity-50"
                    style={{ background: gradients.primary }}
                  >
                    {processingId === selectedPayment.id ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                        Approving...
                      </>
                    ) : (
                      <>
                        <CheckCircle className="w-5 h-5" />
                        Approve
                      </>
                    )}
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Reject Modal */}
      <AnimatePresence>
        {showRejectModal && selectedPayment && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50 p-4"
            onClick={() => {
              setShowRejectModal(false);
              setRejectionReason('');
            }}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              className="w-full max-w-md"
              onClick={(e) => e.stopPropagation()}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-6">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center" 
                       style={{ background: `${colors.statusUnpaid}20` }}>
                    <AlertTriangle className="w-6 h-6" style={{ color: colors.statusUnpaid }} />
                  </div>
                  <div>
                    <h3 className="text-xl font-bold text-white">Reject Payment</h3>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                      Provide a reason for rejection
                    </p>
                  </div>
                </div>

                <div className="space-y-4 mb-6">
                  <div className="p-4 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                    <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Student</p>
                    <p className="text-white font-medium">{selectedPayment.students.full_name}</p>
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-white mb-2">
                      Rejection Reason *
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="e.g., Receipt is blurry, wrong amount, invalid transaction reference..."
                      rows={4}
                      className="w-full rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2"
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.05)', 
                        border: '1px solid rgba(255, 255, 255, 0.1)'
                      }}
                    />
                  </div>
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={() => {
                      setShowRejectModal(false);
                      setRejectionReason('');
                    }}
                    className="flex-1 py-3 rounded-lg font-medium text-white transition-all"
                    style={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleReject}
                    disabled={processingId === selectedPayment.id || !rejectionReason.trim()}
                    className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium text-white transition-all disabled:opacity-50"
                    style={{ background: colors.statusUnpaid }}
                  >
                    {processingId === selectedPayment.id ? (
                      <>
                        <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
                        Rejecting...
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5" />
                        Reject
                      </>
                    )}
                  </button>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      <Footer />
    </div>
  );
}
