import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/config/supabase';
import { useToast } from '@/hooks/useToast';
import { useNavigate } from 'react-router-dom';
import { colors, gradients } from '@/config/colors';
import GlassCard from '@/components/ui/GlassCard';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { 
  Clock, 
  CheckCircle, 
  XCircle, 
  FileText, 
  Download,
  Search,
  Calendar,
  AlertCircle,
  ArrowLeft,
  DollarSign,
  Sparkles
} from 'lucide-react';
import Footer from '@/components/Footer';

interface Payment {
  id: string;
  payment_type_id: string;
  amount: number;
  transaction_ref: string;
  receipt_url: string;
  notes: string | null;
  status: 'pending' | 'approved' | 'rejected';
  rejection_reason: string | null;
  created_at: string;
  approved_at: string | null;
  payment_types: {
    title: string;
    category: string;
  };
}

export default function PaymentHistoryPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { error: showError } = useToast();
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Scroll to top function
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    if (!user) return;

    const fetchPayments = async () => {
      try {
        setLoading(true);
        const { data, error } = await supabase
          .from('payments')
          .select(`
            *,
            payment_types (
              title,
              category
            )
          `)
          .eq('student_id', user?.id)
          .order('created_at', { ascending: false });

        if (error) throw error;
        setPayments(data || []);
      } catch (error) {
        console.error('Error fetching payments:', error);
        showError('Failed to load payment history');
      } finally {
        setLoading(false);
      }
    };

    const subscribeToPayments = () => {
      const channel = supabase
        .channel('payment-updates')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'payments',
            filter: `student_id=eq.${user?.id}`,
          },
          () => {
            fetchPayments();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    };

    fetchPayments();
    const cleanup = subscribeToPayments();
    
    return cleanup;
  }, [user, showError]);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'approved':
        return <CheckCircle className="w-5 h-5" style={{ color: colors.statusPaid }} />;
      case 'rejected':
        return <XCircle className="w-5 h-5" style={{ color: colors.statusUnpaid }} />;
      default:
        return <Clock className="w-5 h-5" style={{ color: colors.warning }} />;
    }
  };

  const getStatusBadge = (status: string, transactionRef?: string) => {
    // Check if payment was waived
    if (status === 'approved' && transactionRef?.startsWith('WAIVED-')) {
      return {
        bg: `${colors.accentMint}20`,
        border: `${colors.accentMint}40`,
        color: colors.accentMint,
        label: 'WAIVED'
      };
    }
    
    switch (status) {
      case 'approved':
        return {
          bg: `${colors.statusPaid}20`,
          border: `${colors.statusPaid}40`,
          color: colors.statusPaid,
          label: 'APPROVED'
        };
      case 'rejected':
        return {
          bg: `${colors.statusUnpaid}20`,
          border: `${colors.statusUnpaid}40`,
          color: colors.statusUnpaid,
          label: 'REJECTED'
        };
      default:
        return {
          bg: `${colors.warning}20`,
          border: `${colors.warning}40`,
          color: colors.warning,
          label: 'PENDING'
        };
    }
  };

  const filteredPayments = payments
    .filter((payment) => filter === 'all' || payment.status === filter)
    .filter((payment) =>
      payment.payment_types.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
      payment.transaction_ref.toLowerCase().includes(searchTerm.toLowerCase())
    );

  // Pagination calculations
  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPayments = filteredPayments.slice(startIndex, endIndex);

  // Reset to first page when filter or search changes
  useEffect(() => {
    setCurrentPage(1);
  }, [filter, searchTerm]);

  const stats = {
    total: payments.length,
    pending: payments.filter((p) => p.status === 'pending').length,
    approved: payments.filter((p) => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-')).length,
    waived: payments.filter((p) => p.status === 'approved' && p.transaction_ref?.startsWith('WAIVED-')).length,
    rejected: payments.filter((p) => p.status === 'rejected').length,
    totalAmount: payments
      .filter((p) => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-'))
      .reduce((sum, p) => sum + p.amount, 0),
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ background: gradients.darkBackground }}>
      {/* ECE Logo Background - Creative Element */}
      <div className="hidden lg:block fixed right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none z-0">
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
      
      {/* Main Content Container - CENTERED */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-5 sm:space-y-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            onClick={() => navigate('/dashboard')}
            className="flex items-center justify-center sm:justify-start gap-2 mb-4 px-4 py-2 rounded-lg w-full sm:w-auto"
            style={{ color: colors.textPrimary, background: 'rgba(255, 255, 255, 0.05)' }}
          >
            <ArrowLeft size={20} />
            <span className="font-medium">Back to Dashboard</span>
          </button>
          
          <GlassCard>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white mb-2">Payment History</h1>
                <p style={{ color: colors.textSecondary }}>Track all your submitted payments</p>
              </div>
              <FileText size={40} style={{ color: colors.primary }} className="hidden sm:block" />
            </div>
          </GlassCard>
        </motion.div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-3 sm:gap-4 md:gap-5">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.1 }}
          >
            <GlassCard>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>Total Payments</p>
                  <p className="text-2xl sm:text-3xl font-bold text-white mt-1">{stats.total}</p>
                </div>
                <FileText className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: colors.primary }} />
              </div>
            </GlassCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.2 }}
          >
            <GlassCard>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>Pending Review</p>
                  <p className="text-2xl sm:text-3xl font-bold mt-1" style={{ color: colors.warning }}>{stats.pending}</p>
                </div>
                <Clock className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: colors.warning }} />
              </div>
            </GlassCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3 }}
          >
            <GlassCard>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>Approved</p>
                  <p className="text-2xl sm:text-3xl font-bold mt-1" style={{ color: colors.statusPaid }}>{stats.approved}</p>
                </div>
                <CheckCircle className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: colors.statusPaid }} />
              </div>
            </GlassCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.35 }}
          >
            <GlassCard>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>Waived</p>
                  <p className="text-2xl sm:text-3xl font-bold mt-1" style={{ color: colors.accentMint }}>{stats.waived}</p>
                </div>
                <Sparkles className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: colors.accentMint }} />
              </div>
            </GlassCard>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.4 }}
          >
            <GlassCard>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>Total Paid</p>
                  <p className="text-xl sm:text-2xl font-bold text-white mt-1">
                    {formatCurrency(stats.totalAmount)}
                  </p>
                </div>
                <DollarSign className="w-8 h-8 sm:w-10 sm:h-10" style={{ color: colors.statusPaid }} />
              </div>
            </GlassCard>
          </motion.div>
        </div>

        {/* Filters */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.5 }}
        >
          <GlassCard>
            <div className="flex flex-col sm:flex-row gap-4 min-w-0">
              {/* Search */}
              <div className="flex-1 min-w-0">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: colors.textSecondary }} />
                  <input
                    type="text"
                    placeholder="Search by payment type or reference..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full rounded-lg pl-10 pr-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.05)', 
                      border: '1px solid rgba(255, 255, 255, 0.1)'
                    }}
                  />
                </div>
              </div>

              {/* Status Filter */}
              <div className="flex flex-wrap gap-2 shrink-0">
                {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => setFilter(status)}
                    className="px-4 py-3 rounded-lg font-medium transition-all whitespace-nowrap"
                    style={{
                      background: filter === status ? gradients.primary : 'rgba(255, 255, 255, 0.05)',
                      color: filter === status ? 'white' : colors.textSecondary
                    }}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Payments List */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-4 border-t-transparent" 
                 style={{ borderColor: colors.primary, borderTopColor: 'transparent' }} />
          </div>
        ) : filteredPayments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
          >
            <GlassCard>
              <div className="text-center py-12">
                <AlertCircle className="w-16 h-16 mx-auto mb-4" style={{ color: colors.textSecondary }} />
                <p className="text-xl text-white mb-2">No payments found</p>
                <p style={{ color: colors.textSecondary }}>
                  {filter !== 'all'
                    ? `You have no ${filter} payments`
                    : 'You haven\'t made any payments yet'}
                </p>
              </div>
            </GlassCard>
          </motion.div>
        ) : (
          <>
            <div className="space-y-4">
            <AnimatePresence>
              {paginatedPayments.map((payment, index) => {
                const statusBadge = getStatusBadge(payment.status, payment.transaction_ref);
                const isWaived = payment.transaction_ref?.startsWith('WAIVED-');
                return (
                  <motion.div
                    key={payment.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20 }}
                    transition={{ delay: index * 0.05 }}
                    whileHover={{ scale: 1.01, y: -4 }}
                    className="relative group"
                  >
                    {/* Gradient border effect on hover */}
                    <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                         style={{ 
                           background: `linear-gradient(135deg, ${statusBadge.color}40, transparent)`,
                           filter: 'blur(8px)',
                           zIndex: -1
                         }} 
                    />
                    <GlassCard className="overflow-hidden transition-all duration-300 group-hover:shadow-xl">
                      <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
                        {/* Payment Info */}
                        <div className="flex-1 space-y-3 sm:space-y-4 min-w-0">
                          <div className="flex flex-col gap-2 sm:gap-3">
                            <div className="min-w-0">
                              <h3 className="text-base sm:text-lg lg:text-xl font-semibold text-white mb-1 wrap-break-word">
                                {payment.payment_types.title}
                              </h3>
                              <p className="text-xs sm:text-sm capitalize" style={{ color: colors.textSecondary }}>
                                {payment.payment_types.category.replace('_', ' ')}
                              </p>
                            </div>
                            <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                              {getStatusIcon(payment.status)}
                              <motion.span
                                animate={payment.status === 'pending' ? { scale: [1, 1.05, 1] } : {}}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="px-2 sm:px-3 py-1 rounded-full text-xs font-medium border whitespace-nowrap"
                                style={{ 
                                  background: statusBadge.bg,
                                  borderColor: statusBadge.border,
                                  color: statusBadge.color
                                }}
                              >
                                {statusBadge.label}
                              </motion.span>
                              {isWaived && (
                                <motion.span 
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="text-xs px-2 py-1 rounded-full whitespace-nowrap" 
                                  style={{
                                    background: 'rgba(6, 182, 212, 0.1)',
                                    color: colors.accentMint
                                  }}
                                >
                                  ✅ Waived
                                </motion.span>
                              )}
                            </div>
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                            <div className="p-2.5 sm:p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                              <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>
                                {isWaived ? 'Waived Amount' : 'Amount'}
                              </p>
                              <p className="text-base sm:text-lg font-semibold" style={{ 
                                color: isWaived ? colors.accentMint : 'white',
                                textDecoration: isWaived ? 'line-through' : 'none'
                              }}>
                                {formatCurrency(payment.amount)}
                              </p>
                              {isWaived && (
                                <p className="text-xs mt-1" style={{ color: colors.accentMint }}>
                                  Waived by admin
                                </p>
                              )}
                            </div>
                            <div className="p-2.5 sm:p-3 rounded-lg min-w-0" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                              <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Transaction Ref</p>
                              <p className="text-xs sm:text-sm font-mono text-white truncate">
                                {payment.transaction_ref}
                              </p>
                            </div>
                            <div className="p-2.5 sm:p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                              <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Submitted On</p>
                              <div className="flex items-center gap-2 text-white text-xs sm:text-sm">
                                <Calendar className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                <span>{formatDate(payment.created_at, 'short')}</span>
                              </div>
                            </div>
                            {payment.approved_at && (
                              <div className="p-2.5 sm:p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                                <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Approved On</p>
                                <div className="flex items-center gap-2 text-xs sm:text-sm" style={{ color: colors.statusPaid }}>
                                  <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                  <span>{formatDate(payment.approved_at, 'short')}</span>
                                </div>
                              </div>
                            )}
                          </div>

                          {payment.notes && (
                            <div className="p-2.5 sm:p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                              <p className="text-xs mb-1" style={{ color: colors.textSecondary }}>Your Notes</p>
                              <p className="text-white text-xs sm:text-sm">{payment.notes}</p>
                            </div>
                          )}

                          {payment.rejection_reason && (
                            <div className="p-3 sm:p-4 rounded-lg" style={{ background: `${colors.statusUnpaid}10`, border: `1px solid ${colors.statusUnpaid}40` }}>
                              <div className="flex items-start gap-2">
                                <XCircle className="w-4 h-4 sm:w-5 sm:h-5 shrink-0 mt-0.5" style={{ color: colors.statusUnpaid }} />
                                <div className="min-w-0">
                                  <p className="text-xs sm:text-sm font-medium mb-1" style={{ color: colors.statusUnpaid }}>
                                    Rejection Reason
                                  </p>
                                  <p className="text-xs sm:text-sm" style={{ color: colors.statusUnpaid }}>{payment.rejection_reason}</p>
                                </div>
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="flex flex-row lg:flex-col gap-2 lg:gap-3 lg:w-48">
                          <a
                            href={payment.receipt_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex-1 lg:flex-auto flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-3 rounded-lg font-medium transition-all text-sm hover:scale-105 hover:shadow-lg"
                            style={{ 
                              background: `${colors.primary}20`,
                              border: `1px solid ${colors.primary}40`,
                              color: colors.primary
                            }}
                          >
                            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span>View</span>
                          </a>
                          <a
                            href={payment.receipt_url}
                            download
                            className="flex-1 lg:flex-auto flex items-center justify-center gap-2 px-3 sm:px-4 py-2 sm:py-3 rounded-lg font-medium text-white transition-all text-sm hover:scale-105 hover:shadow-lg hover:bg-white/10"
                            style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
                          >
                            <Download className="w-4 h-4 sm:w-5 sm:h-5" />
                            <span>Download</span>
                          </a>
                        </div>
                      </div>
                    </GlassCard>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Pagination Controls */}
          {totalPages > 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6"
            >
              <GlassCard>
                <div className="flex flex-wrap items-center justify-between gap-4">
                  {/* Page Info */}
                  <div className="text-sm" style={{ color: colors.textSecondary }}>
                    Showing {startIndex + 1} - {Math.min(endIndex, filteredPayments.length)} of {filteredPayments.length} payments
                  </div>

                  {/* Page Numbers */}
                  <div className="flex flex-wrap items-center gap-2">
                    {/* Previous Button */}
                    <button
                      onClick={() => {
                        setCurrentPage(prev => Math.max(1, prev - 1));
                        scrollToTop();
                      }}
                      disabled={currentPage === 1}
                      className="px-3 sm:px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: currentPage === 1 ? 'rgba(255, 255, 255, 0.05)' : gradients.primary,
                        color: currentPage === 1 ? colors.textSecondary : 'white'
                      }}
                    >
                      <span className="hidden sm:inline">Previous</span>
                      <span className="sm:hidden">Prev</span>
                    </button>

                    {/* Page Numbers */}
                    <div className="hidden sm:flex items-center gap-2">
                      {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                        let pageNumber;
                        if (totalPages <= 5) {
                          pageNumber = i + 1;
                        } else if (currentPage <= 3) {
                          pageNumber = i + 1;
                        } else if (currentPage >= totalPages - 2) {
                          pageNumber = totalPages - 4 + i;
                        } else {
                          pageNumber = currentPage - 2 + i;
                        }

                        return (
                          <button
                            key={i}
                            onClick={() => {
                              setCurrentPage(pageNumber);
                              scrollToTop();
                            }}
                            className="w-10 h-10 rounded-lg font-medium transition-all"
                            style={{
                              background: currentPage === pageNumber ? gradients.primary : 'rgba(255, 255, 255, 0.05)',
                              color: currentPage === pageNumber ? 'white' : colors.textSecondary
                            }}
                          >
                            {pageNumber}
                          </button>
                        );
                      })}
                    </div>

                    {/* Mobile: Current Page Indicator */}
                    <div className="sm:hidden px-4 py-2 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
                      <span className="text-white font-medium">{currentPage}</span>
                      <span className="mx-1" style={{ color: colors.textSecondary }}>/</span>
                      <span style={{ color: colors.textSecondary }}>{totalPages}</span>
                    </div>

                    {/* Next Button */}
                    <button
                      onClick={() => {
                        setCurrentPage(prev => Math.min(totalPages, prev + 1));
                        scrollToTop();
                      }}
                      disabled={currentPage === totalPages}
                      className="px-3 sm:px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                      style={{
                        background: currentPage === totalPages ? 'rgba(255, 255, 255, 0.05)' : gradients.primary,
                        color: currentPage === totalPages ? colors.textSecondary : 'white'
                      }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}
          </>
        )}
        </div>
      </div>
      <Footer />
    </div>
  );
}
