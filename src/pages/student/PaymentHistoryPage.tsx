import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/config/supabase';
import { useToast } from '@/hooks/useToast';
import { useNavigate } from 'react-router-dom';
import { colors, gradients } from '@/config/colors';
import PageWrapper from '@/components/ui/PageWrapper';
import { PaymentCardSkeleton } from '@/components/ui/Skeleton';
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
  Sparkles,
  TrendingUp,
  Filter,
  Receipt,
  Eye,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight
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
    <PageWrapper noPadding>
      
      {/* Main Content Container */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="space-y-5 sm:space-y-6 relative z-10">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <motion.button
            onClick={() => navigate('/dashboard')}
            className="flex items-center gap-2 mb-5 px-3 py-2 rounded-xl transition-all"
            style={{ 
              color: colors.textSecondary,
              background: 'rgba(255, 107, 53, 0.08)',
              border: `1px solid ${colors.primary}30`
            }}
            whileHover={{ scale: 1.02, background: 'rgba(255, 107, 53, 0.15)' }}
            whileTap={{ scale: 0.98 }}
          >
            <ArrowLeft size={18} style={{ color: colors.primary }} />
            <span className="font-medium text-sm" style={{ color: colors.primary }}>Back to Dashboard</span>
          </motion.button>
          
          {/* Hero Header */}
          <div 
            className="rounded-2xl p-6 sm:p-8 relative overflow-hidden"
            style={{ 
              background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.15) 0%, rgba(15, 7, 3, 0.9) 100%)',
              border: '1px solid rgba(255, 107, 53, 0.2)'
            }}
          >
            {/* Background decoration */}
            <div className="absolute top-0 right-0 w-64 h-64 opacity-10 pointer-events-none">
              <Receipt className="w-full h-full" style={{ color: colors.primary }} />
            </div>
            
            <div className="relative flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
              <div>
                <div className="flex items-center gap-3 mb-2">
                  <div 
                    className="w-12 h-12 rounded-xl flex items-center justify-center"
                    style={{ background: gradients.primary }}
                  >
                    <FileText className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-2xl sm:text-3xl font-bold text-white">Payment History</h1>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                      Track and manage your payment records
                    </p>
                  </div>
                </div>
              </div>
              
              {/* Quick stat */}
              <div 
                className="flex items-center gap-3 px-4 py-3 rounded-xl"
                style={{ background: 'rgba(255, 255, 255, 0.05)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
              >
                <TrendingUp className="w-5 h-5" style={{ color: colors.statusPaid }} />
                <div>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Total Paid</p>
                  <p className="text-lg font-bold text-white">{formatCurrency(stats.totalAmount)}</p>
                </div>
              </div>
            </div>
          </div>
        </motion.div>

        {/* Stats Cards - Redesigned */}
        <motion.div 
          className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
        >
          {[
            { label: 'Total', value: stats.total, icon: FileText, color: colors.primary },
            { label: 'Pending', value: stats.pending, icon: Clock, color: colors.warning },
            { label: 'Approved', value: stats.approved, icon: CheckCircle, color: colors.statusPaid },
            { label: 'Waived', value: stats.waived, icon: Sparkles, color: colors.accentMint },
          ].map((stat, index) => (
            <motion.div
              key={stat.label}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 + index * 0.05 }}
              whileHover={{ scale: 1.02, y: -2 }}
              className="rounded-xl p-4 relative overflow-hidden group cursor-default"
              style={{ 
                background: `linear-gradient(135deg, ${stat.color}10 0%, rgba(15, 7, 3, 0.8) 100%)`,
                border: `1px solid ${stat.color}20`
              }}
            >
              {/* Hover glow */}
              <div 
                className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                style={{ background: `radial-gradient(circle at center, ${stat.color}10 0%, transparent 70%)` }}
              />
              
              <div className="relative flex items-center justify-between">
                <div>
                  <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>{stat.label}</p>
                  <p className="text-2xl sm:text-3xl font-bold" style={{ color: stat.color }}>{stat.value}</p>
                </div>
                <div 
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ background: `${stat.color}15` }}
                >
                  <stat.icon className="w-5 h-5" style={{ color: stat.color }} />
                </div>
              </div>
            </motion.div>
          ))}
        </motion.div>

        {/* Search & Filters - Redesigned */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="rounded-xl p-4"
          style={{ 
            background: 'rgba(255, 255, 255, 0.02)',
            border: '1px solid rgba(255, 255, 255, 0.08)'
          }}
        >
          <div className="flex flex-col lg:flex-row gap-4">
            {/* Search */}
            <div className="flex-1 relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: colors.textSecondary }} />
              <input
                type="text"
                placeholder="Search by payment type or reference..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full rounded-xl pl-12 pr-4 py-3.5 text-white placeholder-gray-500 focus:outline-none transition-all"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.05)', 
                  border: '1px solid rgba(255, 255, 255, 0.1)'
                }}
              />
            </div>

            {/* Filter Pills */}
            <div className="flex items-center gap-2 flex-wrap">
              <div className="flex items-center gap-1.5 mr-2">
                <Filter className="w-4 h-4" style={{ color: colors.textSecondary }} />
                <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>Filter:</span>
              </div>
              {(['all', 'pending', 'approved', 'rejected'] as const).map((status) => {
                const isActive = filter === status;
                const statusColors: Record<string, string> = {
                  all: colors.primary,
                  pending: colors.warning,
                  approved: colors.statusPaid,
                  rejected: colors.statusUnpaid
                };
                return (
                  <motion.button
                    key={status}
                    onClick={() => setFilter(status)}
                    className="px-4 py-2 rounded-lg text-sm font-medium transition-all"
                    style={{
                      background: isActive ? `${statusColors[status]}20` : 'rgba(255, 255, 255, 0.03)',
                      border: `1px solid ${isActive ? statusColors[status] + '50' : 'rgba(255, 255, 255, 0.08)'}`,
                      color: isActive ? statusColors[status] : colors.textSecondary
                    }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    {status.charAt(0).toUpperCase() + status.slice(1)}
                    {status !== 'all' && (
                      <span className="ml-1.5 text-xs opacity-70">
                        ({status === 'pending' ? stats.pending : status === 'approved' ? stats.approved : stats.rejected})
                      </span>
                    )}
                  </motion.button>
                );
              })}
            </div>
          </div>
        </motion.div>

        {/* Payments List */}
        {loading ? (
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <PaymentCardSkeleton key={i} />
            ))}
          </div>
        ) : filteredPayments.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="rounded-2xl p-12 text-center"
            style={{ 
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid rgba(255, 255, 255, 0.08)'
            }}
          >
            <div 
              className="w-20 h-20 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{ background: 'rgba(255, 255, 255, 0.05)' }}
            >
              <AlertCircle className="w-10 h-10" style={{ color: colors.textSecondary }} />
            </div>
            <p className="text-xl font-semibold text-white mb-2">No payments found</p>
            <p style={{ color: colors.textSecondary }}>
              {filter !== 'all'
                ? `You have no ${filter} payments`
                : 'You haven\'t made any payments yet'}
            </p>
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
                    transition={{ delay: index * 0.03 }}
                    className="group"
                  >
                    <div 
                      className="rounded-xl overflow-hidden transition-all duration-300 hover:shadow-xl"
                      style={{ 
                        background: 'rgba(255, 255, 255, 0.02)',
                        border: `1px solid ${statusBadge.border}`,
                      }}
                    >
                      {/* Status indicator bar */}
                      <div className="h-1" style={{ background: statusBadge.color }} />
                      
                      <div className="p-4 sm:p-5">
                        <div className="flex flex-col lg:flex-row gap-4 lg:gap-6">
                          {/* Left: Payment Info */}
                          <div className="flex-1 min-w-0">
                            {/* Header row */}
                            <div className="flex items-start justify-between gap-3 mb-4">
                              <div className="flex items-center gap-3 min-w-0">
                                <div 
                                  className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
                                  style={{ background: `${statusBadge.color}15` }}
                                >
                                  {getStatusIcon(payment.status)}
                                </div>
                                <div className="min-w-0">
                                  <h3 className="text-base sm:text-lg font-semibold text-white truncate">
                                    {payment.payment_types.title}
                                  </h3>
                                  <p className="text-xs capitalize" style={{ color: colors.textSecondary }}>
                                    {payment.payment_types.category.replace('_', ' ')}
                                  </p>
                                </div>
                              </div>
                              
                              {/* Status badge */}
                              <motion.span
                                animate={payment.status === 'pending' ? { opacity: [1, 0.7, 1] } : {}}
                                transition={{ duration: 2, repeat: Infinity }}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0"
                                style={{ 
                                  background: statusBadge.bg,
                                  color: statusBadge.color,
                                  border: `1px solid ${statusBadge.border}`
                                }}
                              >
                                {statusBadge.label}
                              </motion.span>
                            </div>

                            {/* Details grid */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                              <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                                <p className="text-[11px] font-medium mb-1 uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                  Amount
                                </p>
                                <p className="text-base font-bold" style={{ 
                                  color: isWaived ? colors.accentMint : 'white',
                                  textDecoration: isWaived ? 'line-through' : 'none'
                                }}>
                                  {formatCurrency(payment.amount)}
                                </p>
                              </div>
                              
                              <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                                <p className="text-[11px] font-medium mb-1 uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                  Reference
                                </p>
                                <p className="text-xs font-mono text-white truncate">
                                  {payment.transaction_ref.slice(0, 12)}...
                                </p>
                              </div>
                              
                              <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                                <p className="text-[11px] font-medium mb-1 uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                  Submitted
                                </p>
                                <div className="flex items-center gap-1.5 text-white text-xs">
                                  <Calendar className="w-3.5 h-3.5" style={{ color: colors.textSecondary }} />
                                  <span>{formatDate(payment.created_at, 'short')}</span>
                                </div>
                              </div>
                              
                              {payment.approved_at && (
                                <div className="p-3 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                                  <p className="text-[11px] font-medium mb-1 uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                                    {isWaived ? 'Waived' : 'Approved'}
                                  </p>
                                  <div className="flex items-center gap-1.5 text-xs" style={{ color: colors.statusPaid }}>
                                    <CheckCircle className="w-3.5 h-3.5" />
                                    <span>{formatDate(payment.approved_at, 'short')}</span>
                                  </div>
                                </div>
                              )}
                            </div>

                            {/* Rejection reason */}
                            {payment.rejection_reason && (
                              <div 
                                className="mt-3 p-3 rounded-lg flex items-start gap-2"
                                style={{ background: `${colors.statusUnpaid}10`, border: `1px solid ${colors.statusUnpaid}30` }}
                              >
                                <XCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: colors.statusUnpaid }} />
                                <div>
                                  <p className="text-xs font-medium mb-0.5" style={{ color: colors.statusUnpaid }}>Rejection Reason</p>
                                  <p className="text-xs" style={{ color: colors.statusUnpaid }}>{payment.rejection_reason}</p>
                                </div>
                              </div>
                            )}
                          </div>

                          {/* Right: Actions */}
                          <div className="flex flex-row lg:flex-col gap-2 lg:w-36 shrink-0">
                            <motion.a
                              href={payment.receipt_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="flex-1 lg:flex-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all"
                              style={{ 
                                background: `${colors.primary}15`,
                                border: `1px solid ${colors.primary}30`,
                                color: colors.primary
                              }}
                              whileHover={{ scale: 1.02, background: `${colors.primary}25` }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <Eye className="w-4 h-4" />
                              <span>View</span>
                            </motion.a>
                            <motion.a
                              href={payment.receipt_url}
                              download
                              className="flex-1 lg:flex-auto flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium text-sm transition-all"
                              style={{ 
                                background: 'rgba(255, 255, 255, 0.03)', 
                                border: '1px solid rgba(255, 255, 255, 0.1)',
                                color: colors.textSecondary
                              }}
                              whileHover={{ scale: 1.02, background: 'rgba(255, 255, 255, 0.08)' }}
                              whileTap={{ scale: 0.98 }}
                            >
                              <Download className="w-4 h-4" />
                              <span>Download</span>
                            </motion.a>
                          </div>
                        </div>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>

          {/* Pagination - Redesigned */}
          {totalPages > 1 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4"
              style={{ 
                background: 'rgba(255, 255, 255, 0.02)',
                border: '1px solid rgba(255, 255, 255, 0.08)'
              }}
            >
              {/* Page Info */}
              <div className="text-sm" style={{ color: colors.textSecondary }}>
                Showing <span className="font-semibold text-white">{startIndex + 1}-{Math.min(endIndex, filteredPayments.length)}</span> of <span className="font-semibold text-white">{filteredPayments.length}</span>
              </div>

              {/* Pagination Controls */}
              <div className="flex items-center gap-1">
                {/* First Page */}
                <motion.button
                  onClick={() => { setCurrentPage(1); scrollToTop(); }}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  whileHover={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  whileTap={{ scale: 0.95 }}
                >
                  <ChevronsLeft className="w-4 h-4" style={{ color: colors.textSecondary }} />
                </motion.button>
                
                {/* Previous */}
                <motion.button
                  onClick={() => { setCurrentPage(prev => Math.max(1, prev - 1)); scrollToTop(); }}
                  disabled={currentPage === 1}
                  className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  whileHover={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  whileTap={{ scale: 0.95 }}
                >
                  <ChevronLeft className="w-4 h-4" style={{ color: colors.textSecondary }} />
                </motion.button>

                {/* Page Numbers */}
                <div className="flex items-center gap-1 mx-2">
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

                    const isActive = currentPage === pageNumber;
                    return (
                      <motion.button
                        key={i}
                        onClick={() => { setCurrentPage(pageNumber); scrollToTop(); }}
                        className="w-9 h-9 rounded-lg font-medium text-sm transition-all"
                        style={{
                          background: isActive ? gradients.primary : 'rgba(255, 255, 255, 0.05)',
                          color: isActive ? 'white' : colors.textSecondary,
                          boxShadow: isActive ? `0 4px 12px ${colors.primary}40` : 'none'
                        }}
                        whileHover={!isActive ? { background: 'rgba(255, 255, 255, 0.1)' } : {}}
                        whileTap={{ scale: 0.95 }}
                      >
                        {pageNumber}
                      </motion.button>
                    );
                  })}
                </div>

                {/* Next */}
                <motion.button
                  onClick={() => { setCurrentPage(prev => Math.min(totalPages, prev + 1)); scrollToTop(); }}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  whileHover={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  whileTap={{ scale: 0.95 }}
                >
                  <ChevronRight className="w-4 h-4" style={{ color: colors.textSecondary }} />
                </motion.button>
                
                {/* Last Page */}
                <motion.button
                  onClick={() => { setCurrentPage(totalPages); scrollToTop(); }}
                  disabled={currentPage === totalPages}
                  className="p-2 rounded-lg transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                  whileHover={{ background: 'rgba(255, 255, 255, 0.1)' }}
                  whileTap={{ scale: 0.95 }}
                >
                  <ChevronsRight className="w-4 h-4" style={{ color: colors.textSecondary }} />
                </motion.button>
              </div>
            </motion.div>
          )}
          </>
        )}
        </div>
      </div>
      <Footer />
    </PageWrapper>
  );
}
