/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  X, 
  CheckCircle, 
  Clock,
  ChevronRight,
  Wallet,
  TrendingUp,
  User,
  Eye,
  AlertCircle,
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import notificationService from '@/services/notificationService';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/utils/formatters';
import { colors, gradients } from '@/config/colors';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '@/contexts/SettingsContext';
import { notificationSound } from '@/utils/notificationSound';

interface PendingPayment {
  id: string;
  amount: number;
  created_at: string;
  receipt_url: string | null;
  students: {
    full_name: string;
    reg_number: string;
  } | null;
  payment_types: {
    title: string;
  } | null;
}

interface DashboardStats {
  pendingCount: number;
  todayApproved: number;
  todayAmount: number;
  weekAmount: number;
}

export const AdminNotificationCenter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { playNotificationSound } = useSettings();
  const [pendingPayments, setPendingPayments] = useState<PendingPayment[]>([]);
  const [stats, setStats] = useState<DashboardStats>({
    pendingCount: 0,
    todayApproved: 0,
    todayAmount: 0,
    weekAmount: 0,
  });
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(false);

  // Refs to store latest callbacks for stable subscription
  const fetchStatsRef = useRef<(() => Promise<void>) | null>(null);
  const playNotificationSoundRef = useRef<((type?: 'success' | 'info' | 'warning' | 'ding') => void) | null>(null);

  const fetchPendingPayments = useCallback(async () => {
    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('payments')
        .select(`
          id, amount, created_at, receipt_url,
          students!payments_student_id_fkey ( full_name, reg_number ),
          payment_types ( title )
        `)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      
      // Transform data to flatten the joined objects
      const transformedData: PendingPayment[] = (data || []).map((payment: any) => ({
        id: payment.id,
        amount: payment.amount,
        created_at: payment.created_at,
        receipt_url: payment.receipt_url,
        students: Array.isArray(payment.students) ? payment.students[0] : payment.students,
        payment_types: Array.isArray(payment.payment_types) ? payment.payment_types[0] : payment.payment_types,
      }));
      
      setPendingPayments(transformedData);
      setStats(prev => ({ ...prev, pendingCount: transformedData.length }));
    } catch (error) {
      console.error('Error fetching pending payments:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    try {
      const { count: pendingCount } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { data: todayPayments } = await supabase
        .from('payments')
        .select('amount, transaction_ref')
        .eq('status', 'approved')
        .gte('approved_at', today.toISOString());

      const todayFiltered = todayPayments?.filter(p => !p.transaction_ref?.startsWith('WAIVED-')) || [];
      const todayAmount = todayFiltered.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      const { data: weekPayments } = await supabase
        .from('payments')
        .select('amount, transaction_ref')
        .eq('status', 'approved')
        .gte('approved_at', weekAgo.toISOString());

      const weekFiltered = weekPayments?.filter(p => !p.transaction_ref?.startsWith('WAIVED-')) || [];
      const weekAmount = weekFiltered.reduce((sum, p) => sum + Number(p.amount || 0), 0);

      setStats({ pendingCount: pendingCount || 0, todayApproved: todayFiltered.length, todayAmount, weekAmount });

      if (user?.id) {
        const { count: unread } = await supabase
          .from('notifications')
          .select('*', { count: 'exact', head: true })
          .eq('recipient_id', user.id)
          .eq('is_read', false);
        setUnreadCount(unread || 0);
      }
    } catch (error) {
      console.error('Error fetching stats:', error);
    }
  }, [user?.id]);

  // Keep refs updated with latest callbacks
  useEffect(() => {
    fetchStatsRef.current = fetchStats;
    playNotificationSoundRef.current = playNotificationSound;
  }, [fetchStats, playNotificationSound]);

  useEffect(() => {
    if (user?.id) {
      fetchStats();
      void notificationSound.forceInit();
      
      // Create a stable subscription that doesn't depend on changing values
      const channel = supabase
        .channel('admin-payment-notifications-' + user.id)
        .on('postgres_changes', { 
          event: 'INSERT', 
          schema: 'public', 
          table: 'payments'
        }, (payload) => {
          console.log('🔔 New payment inserted:', payload);
          // Play sound for any new payment (we'll check status in the callback)
          if (payload.new && (payload.new as { status?: string }).status === 'pending') {
            playNotificationSoundRef.current?.('info');
          }
          fetchStatsRef.current?.();
        })
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'payments' 
        }, (payload) => {
          console.log('🔔 Payment updated:', payload);
          // Play sound when a payment becomes pending (e.g., submitted for review)
          const newData = payload.new as { status?: string } | undefined;
          const oldData = payload.old as { status?: string } | undefined;
          if (newData?.status === 'pending' && oldData?.status !== 'pending') {
            playNotificationSoundRef.current?.('info');
          }
          fetchStatsRef.current?.();
        })
        .subscribe((status) => {
          console.log('🔔 Realtime subscription status:', status);
        });
        
      return () => { 
        console.log('🔔 Cleaning up realtime subscription');
        supabase.removeChannel(channel); 
      };
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]); // Only depend on user.id - callbacks accessed via refs to keep subscription stable

  // Separate effect for fetching pending payments and handling body scroll when panel is open
  useEffect(() => {
    if (showPanel) {
      document.body.style.overflow = 'hidden';
      fetchPendingPayments();
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [showPanel, fetchPendingPayments]);

  const markAllNotificationsRead = async () => {
    try {
      if (!user?.id) return;
      await notificationService.markAllAsRead(user.id);
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);
    if (minutes < 1) return 'Just now';
    if (minutes < 60) return `${minutes}m ago`;
    if (hours < 24) return `${hours}h ago`;
    if (days === 1) return 'Yesterday';
    return `${days}d ago`;
  };

  const totalBadgeCount = stats.pendingCount > 0 ? stats.pendingCount : unreadCount;

  const handleOpenPanel = () => {
    setShowPanel(prev => {
      if (!prev) {
        fetchStats();
        fetchPendingPayments();
      }
      return !prev;
    });
  };

  const handleClosePanel = () => setShowPanel(false);

  const goToReview = () => {
    navigate('/admin/review');
    setShowPanel(false);
  };

  return (
    <>
      {/* Bell Button */}
      <motion.button
        onClick={handleOpenPanel}
        className="relative p-2.5 rounded-xl transition-all duration-300"
        style={{
          background: showPanel ? `${colors.primary}20` : 'rgba(255, 255, 255, 0.05)',
          border: `1px solid ${showPanel ? colors.primary + '40' : 'rgba(255, 255, 255, 0.1)'}`,
        }}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.95 }}
      >
        <Bell className="w-5 h-5" style={{ color: showPanel ? colors.primary : colors.textPrimary }} />
        <AnimatePresence>
          {totalBadgeCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: gradients.primary, boxShadow: `0 2px 8px ${colors.primary}50` }}
            >
              {totalBadgeCount > 9 ? '9+' : totalBadgeCount}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Panel Portal */}
      {createPortal(
        <AnimatePresence>
          {showPanel && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 bg-black/60 backdrop-blur-md"
                style={{ zIndex: 99998 }}
                onClick={handleClosePanel}
              />

              {/* Slide-in Panel */}
              <motion.div
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: 'spring', damping: 25, stiffness: 300 }}
                className="fixed top-0 right-0 bottom-0 w-full sm:w-[400px] flex flex-col"
                style={{
                  background: 'linear-gradient(180deg, #0F0A07 0%, #0D0705 100%)',
                  borderLeft: '1px solid rgba(255, 107, 53, 0.15)',
                  boxShadow: '-10px 0 50px rgba(0, 0, 0, 0.5)',
                  zIndex: 99999,
                }}
              >
                {/* Header */}
                <div
                  className="px-5 py-4 border-b relative overflow-hidden shrink-0"
                  style={{
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                    background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.1) 0%, transparent 60%)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center"
                        style={{ background: gradients.primary }}
                      >
                        <Bell className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">Activity Center</h3>
                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                          Real-time payment updates
                        </p>
                      </div>
                    </div>
                    <motion.button
                      onClick={handleClosePanel}
                      className="p-2.5 rounded-xl transition-colors"
                      style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                      whileHover={{ background: 'rgba(255, 255, 255, 0.1)' }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <X className="w-5 h-5" style={{ color: colors.textSecondary }} />
                    </motion.button>
                  </div>
                </div>

                {/* Stats Row */}
                <div className="p-4 border-b shrink-0" style={{ borderColor: 'rgba(255, 255, 255, 0.05)' }}>
                  <div className="grid grid-cols-3 gap-3">
                    {/* Pending */}
                    <motion.div
                      className="p-3 rounded-xl text-center cursor-pointer"
                      style={{
                        background: stats.pendingCount > 0 ? `${colors.warning}15` : 'rgba(255, 255, 255, 0.03)',
                        border: `1px solid ${stats.pendingCount > 0 ? colors.warning + '30' : 'rgba(255, 255, 255, 0.05)'}`,
                      }}
                      whileHover={{ scale: 1.02 }}
                      onClick={goToReview}
                    >
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <Clock className="w-3.5 h-3.5" style={{ color: stats.pendingCount > 0 ? colors.warning : colors.textSecondary }} />
                        <span className="text-[10px] uppercase font-semibold" style={{ color: colors.textSecondary }}>
                          Pending
                        </span>
                      </div>
                      <p className="text-xl font-bold" style={{ color: stats.pendingCount > 0 ? colors.warning : 'white' }}>
                        {stats.pendingCount}
                      </p>
                    </motion.div>

                    {/* Today */}
                    <div
                      className="p-3 rounded-xl text-center"
                      style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}
                    >
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <CheckCircle className="w-3.5 h-3.5" style={{ color: colors.accentMint }} />
                        <span className="text-[10px] uppercase font-semibold" style={{ color: colors.textSecondary }}>
                          Today
                        </span>
                      </div>
                      <p className="text-sm font-bold text-white truncate">{formatCurrency(stats.todayAmount)}</p>
                    </div>

                    {/* Week */}
                    <div
                      className="p-3 rounded-xl text-center"
                      style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.05)' }}
                    >
                      <div className="flex items-center justify-center gap-1.5 mb-1">
                        <TrendingUp className="w-3.5 h-3.5" style={{ color: colors.primary }} />
                        <span className="text-[10px] uppercase font-semibold" style={{ color: colors.textSecondary }}>
                          Week
                        </span>
                      </div>
                      <p className="text-sm font-bold text-white truncate">{formatCurrency(stats.weekAmount)}</p>
                    </div>
                  </div>
                </div>

                {/* Payment List */}
                <div className="flex-1 overflow-y-auto custom-scrollbar">
                  {loading ? (
                    <div className="flex items-center justify-center py-16">
                      <motion.div
                        className="w-8 h-8 border-3 border-white/20 border-t-white rounded-full"
                        animate={{ rotate: 360 }}
                        transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                      />
                    </div>
                  ) : pendingPayments.length === 0 ? (
                    <motion.div
                      className="flex flex-col items-center justify-center py-16 px-6"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                    >
                      <div
                        className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                        style={{ background: `${colors.accentMint}15` }}
                      >
                        <CheckCircle className="w-8 h-8" style={{ color: colors.accentMint }} />
                      </div>
                      <p className="text-base font-semibold text-white mb-1">All Caught Up!</p>
                      <p className="text-sm text-center" style={{ color: colors.textSecondary }}>
                        No payments waiting for review.
                        <br />
                        You'll be notified when students submit.
                      </p>
                    </motion.div>
                  ) : (
                    <div className="p-4 space-y-3">
                      <div className="flex items-center justify-between mb-2">
                        <p
                          className="text-xs font-semibold uppercase tracking-wider flex items-center gap-2"
                          style={{ color: colors.warning }}
                        >
                          <AlertCircle className="w-3.5 h-3.5" />
                          Awaiting Your Review
                        </p>
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllNotificationsRead}
                            className="text-[10px] font-medium px-2 py-1 rounded-lg transition-colors"
                            style={{ color: colors.primary, background: `${colors.primary}10` }}
                          >
                            Clear alerts
                          </button>
                        )}
                      </div>

                      {pendingPayments.map((payment, index) => (
                        <motion.div
                          key={payment.id}
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: index * 0.05 }}
                          className="p-4 rounded-xl cursor-pointer group"
                          style={{
                            background: 'rgba(255, 255, 255, 0.03)',
                            border: '1px solid rgba(255, 255, 255, 0.06)',
                          }}
                          onClick={goToReview}
                          whileHover={{
                            background: 'rgba(255, 255, 255, 0.06)',
                            borderColor: `${colors.primary}30`,
                          }}
                        >
                          <div className="flex items-start gap-3">
                            <div
                              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                              style={{ background: `${colors.primary}20` }}
                            >
                              <User className="w-5 h-5" style={{ color: colors.primary }} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <p className="text-sm font-semibold text-white truncate">
                                    {payment.students?.full_name || 'Unknown Student'}
                                  </p>
                                  <p className="text-xs truncate" style={{ color: colors.textSecondary }}>
                                    {payment.students?.reg_number} • {payment.payment_types?.title || 'Payment'}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="text-sm font-bold" style={{ color: colors.accentMint }}>
                                    {formatCurrency(payment.amount)}
                                  </p>
                                  <p className="text-[10px]" style={{ color: colors.textSecondary }}>
                                    {formatTimeAgo(payment.created_at)}
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-2 mt-2">
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                  style={{ background: `${colors.warning}20`, color: colors.warning }}
                                >
                                  <Clock className="w-2.5 h-2.5" />
                                  Pending Review
                                </span>
                                {payment.receipt_url && (
                                  <span
                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium"
                                    style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textSecondary }}
                                  >
                                    <Eye className="w-2.5 h-2.5" />
                                    Has Receipt
                                  </span>
                                )}
                              </div>
                            </div>
                            <ChevronRight
                              className="w-5 h-5 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                              style={{ color: colors.primary }}
                            />
                          </div>
                        </motion.div>
                      ))}

                      {stats.pendingCount > pendingPayments.length && (
                        <motion.button
                          onClick={goToReview}
                          className="w-full py-3 text-sm font-medium rounded-xl transition-all"
                          style={{
                            color: colors.primary,
                            background: `${colors.primary}10`,
                            border: `1px dashed ${colors.primary}30`,
                          }}
                          whileHover={{ background: `${colors.primary}20` }}
                        >
                          View all {stats.pendingCount} pending payments
                        </motion.button>
                      )}
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div
                  className="p-4 border-t shrink-0"
                  style={{ borderColor: 'rgba(255, 255, 255, 0.08)', background: 'rgba(0, 0, 0, 0.2)' }}
                >
                  <motion.button
                    onClick={goToReview}
                    className="w-full py-3 rounded-xl font-semibold text-white flex items-center justify-center gap-2"
                    style={{ background: gradients.primary, boxShadow: `0 4px 15px ${colors.primary}40` }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Wallet className="w-5 h-5" />
                    Open Review Dashboard
                  </motion.button>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>,
        document.body
      )}
    </>
  );
};
