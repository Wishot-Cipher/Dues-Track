import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Bell, 
  X, 
  CheckCircle, 
  BellOff, 
  Sparkles, 
  CreditCard,
  Users,
  Clock,
  ChevronRight,
  Zap,
  TrendingUp,
} from 'lucide-react';
import { supabase } from '@/config/supabase';
import notificationService from '@/services/notificationService';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/utils/formatters';
import { colors, gradients } from '@/config/colors';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '@/contexts/SettingsContext';
import { notificationSound } from '@/utils/notificationSound';

interface Notification {
  id: string;
  type: 'payment_pending' | 'payment_approved' | 'payment_rejected' | 'payment_waived' | 'system';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  metadata?: {
    payment_id?: string;
    payment_type_id?: string;
    amount?: number;
    student_name?: string;
  };
  link?: string | null;
}

interface GroupedNotifications {
  pending: Notification[];
  recent: Notification[];
}

// Quick action buttons for admin
function QuickActions({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  
  const actions = [
    {
      icon: CreditCard,
      label: 'Review Payments',
      description: 'Approve pending submissions',
      path: '/admin/review',
      color: colors.primary,
      count: null,
    },
    {
      icon: Users,
      label: 'Manage Students',
      description: 'View student dues status',
      path: '/admin/manage-students',
      color: colors.accentMint,
      count: null,
    },
    {
      icon: TrendingUp,
      label: 'Analytics',
      description: 'Collection statistics',
      path: '/admin/analytics',
      color: colors.accentBlue,
      count: null,
    },
  ];

  return (
    <div className="p-4 border-b" style={{ borderColor: 'rgba(255, 255, 255, 0.08)' }}>
      <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>
        Quick Actions
      </p>
      <div className="grid grid-cols-3 gap-2">
        {actions.map((action) => {
          const Icon = action.icon;
          return (
            <motion.button
              key={action.path}
              onClick={() => {
                navigate(action.path);
                onClose();
              }}
              className="p-3 rounded-xl text-center transition-all"
              style={{ background: `${action.color}10` }}
              whileHover={{ scale: 1.02, background: `${action.color}20` }}
              whileTap={{ scale: 0.98 }}
            >
              <div 
                className="w-8 h-8 rounded-lg mx-auto mb-2 flex items-center justify-center"
                style={{ background: `${action.color}20` }}
              >
                <Icon className="w-4 h-4" style={{ color: action.color }} />
              </div>
              <p className="text-[10px] font-medium text-white truncate">{action.label}</p>
            </motion.button>
          );
        })}
      </div>
    </div>
  );
}

export const AdminNotificationCenter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { playNotificationSound } = useSettings();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [pendingPaymentsCount, setPendingPaymentsCount] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(false);

  // Group notifications for better organization
  const groupedNotifications: GroupedNotifications = {
    pending: notifications.filter(n => n.type === 'payment_pending' && !n.is_read),
    recent: notifications.filter(n => n.type !== 'payment_pending' || n.is_read).slice(0, 10),
  };

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(30);

      if (error) throw error;
      
      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.is_read).length || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Fetch pending payments count for badge
  const fetchPendingCount = useCallback(async () => {
    try {
      const { count } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      setPendingPaymentsCount(count || 0);
    } catch (error) {
      console.error('Error fetching pending count:', error);
    }
  }, []);

  useEffect(() => {
    setUnreadCount(notifications.filter(n => !n.is_read).length);
  }, [notifications]);

  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
      fetchPendingCount();
      
      void notificationSound.forceInit();
      
      const channel = supabase
        .channel('admin-notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            const notification = payload.new as Notification;
            if (notification.type === 'payment_pending') {
              playNotificationSound('info');
            } else {
              playNotificationSound('ding');
            }
            fetchNotifications();
            fetchPendingCount();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            const updated = payload.new as Notification;
            setNotifications(prev => prev.map(n => n.id === updated.id ? { ...n, ...updated } : n));
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id, fetchNotifications, fetchPendingCount, playNotificationSound]);

  useEffect(() => {
    if (showPanel) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [showPanel]);

  const markAsRead = async (notificationId: string) => {
    try {
      const ok = await notificationService.markAsRead(notificationId);
      if (!ok) throw new Error('Failed to mark read');
      return true;
    } catch (error) {
      console.error('Failed to mark notification as read:', error);
      return false;
    }
  };

  const markAllAsRead = async () => {
    try {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      const ok = await notificationService.markAllAsRead(userId);
      if (!ok) throw new Error('Failed to mark all as read');

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
      return true;
    } catch (error) {
      console.error('Error marking all as read:', error);
      return false;
    }
  };

  const formatTimeAgo = (timestamp: string) => {
    const now = new Date();
    const time = new Date(timestamp);
    const diff = now.getTime() - time.getTime();
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return 'Now';
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days === 1) return 'Yesterday';
    return `${days}d`;
  };

  const handleNotificationClick = async (notification: Notification) => {
    try {
      if (!notification.is_read) {
        setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
        const ok = await markAsRead(notification.id);
        if (!ok) {
          setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: false } : n));
        }
      }

      const targetLink = notification.link || '/admin/review';
      navigate(targetLink);
      setShowPanel(false);
    } catch (err) {
      console.error('Error on notification click:', err);
    }
  };

  const totalBadgeCount = pendingPaymentsCount > 0 ? pendingPaymentsCount : unreadCount;

  return (
    <>
      {/* Notification Bell Button */}
      <motion.button
        onClick={() => {
          setShowPanel(prev => {
            if (!prev) {
              void fetchNotifications();
              void fetchPendingCount();
            }
            return !prev;
          });
        }}
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

      {/* Notification Panel */}
      <AnimatePresence>
        {showPanel && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              style={{ touchAction: 'none' }}
              onClick={() => setShowPanel(false)}
              onWheel={(e) => e.stopPropagation()}
            />
            
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute right-0 top-full mt-3 w-[400px] max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden z-50"
              style={{ 
                background: '#0D0907',
                border: `1px solid rgba(255, 107, 53, 0.15)`,
                boxShadow: `0 25px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 107, 53, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
              }}
              onWheel={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div 
                className="px-5 py-4 border-b relative overflow-hidden"
                style={{ 
                  borderColor: 'rgba(255, 255, 255, 0.08)',
                  background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, transparent 50%)'
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-xl flex items-center justify-center relative"
                      style={{ background: gradients.primary }}
                    >
                      <Zap className="w-5 h-5 text-white" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">Command Center</h3>
                      <p className="text-xs" style={{ color: colors.textSecondary }}>
                        {pendingPaymentsCount > 0 
                          ? `${pendingPaymentsCount} payment${pendingPaymentsCount > 1 ? 's' : ''} pending review`
                          : 'All caught up! 🎉'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {unreadCount > 0 && (
                      <motion.button
                        onClick={markAllAsRead}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all"
                        style={{
                          color: colors.primary,
                          background: `${colors.primary}15`,
                        }}
                        whileHover={{ background: `${colors.primary}25` }}
                        whileTap={{ scale: 0.95 }}
                      >
                        Clear all
                      </motion.button>
                    )}
                    <motion.button
                      onClick={() => setShowPanel(false)}
                      className="p-2 rounded-lg transition-colors"
                      style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                      whileHover={{ background: 'rgba(255, 255, 255, 0.1)' }}
                      whileTap={{ scale: 0.95 }}
                    >
                      <X className="w-4 h-4" style={{ color: colors.textSecondary }} />
                    </motion.button>
                  </div>
                </div>
              </div>

              {/* Quick Actions */}
              <QuickActions onClose={() => setShowPanel(false)} />

              {/* Pending Payments Section */}
              {groupedNotifications.pending.length > 0 && (
                <div className="px-4 pt-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Clock className="w-4 h-4" style={{ color: colors.warning }} />
                      <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: colors.warning }}>
                        Awaiting Review
                      </p>
                    </div>
                    <motion.button
                      onClick={() => {
                        navigate('/admin/review');
                        setShowPanel(false);
                      }}
                      className="text-xs font-medium flex items-center gap-1"
                      style={{ color: colors.primary }}
                      whileHover={{ x: 2 }}
                    >
                      View all
                      <ChevronRight className="w-3 h-3" />
                    </motion.button>
                  </div>
                  <div className="space-y-2 mb-4">
                    {groupedNotifications.pending.slice(0, 3).map((notification, index) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="p-3 rounded-xl cursor-pointer"
                        style={{
                          background: `${colors.warning}08`,
                          border: `1px solid ${colors.warning}20`,
                        }}
                        onClick={() => handleNotificationClick(notification)}
                        whileHover={{ background: `${colors.warning}15` }}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-medium text-white truncate pr-2">
                              {notification.title.replace('💰 New Payment - ', '')}
                            </p>
                            <p className="text-xs truncate" style={{ color: colors.textSecondary }}>
                              {notification.message.split(' submitted')[0]}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {notification.metadata?.amount && (
                              <span 
                                className="text-xs font-bold px-2 py-1 rounded-lg"
                                style={{ 
                                  color: colors.accentMint,
                                  background: `${colors.accentMint}15`
                                }}
                              >
                                {formatCurrency(notification.metadata.amount)}
                              </span>
                            )}
                            <span className="text-[10px]" style={{ color: colors.textSecondary }}>
                              {formatTimeAgo(notification.created_at)}
                            </span>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                    {groupedNotifications.pending.length > 3 && (
                      <motion.button
                        onClick={() => {
                          navigate('/admin/review');
                          setShowPanel(false);
                        }}
                        className="w-full py-2 text-xs font-medium rounded-lg"
                        style={{ color: colors.primary, background: `${colors.primary}10` }}
                        whileHover={{ background: `${colors.primary}20` }}
                      >
                        +{groupedNotifications.pending.length - 3} more pending
                      </motion.button>
                    )}
                  </div>
                </div>
              )}

              {/* Recent Activity */}
              <div 
                className="max-h-[250px] overflow-y-auto custom-scrollbar"
                onWheel={(e) => e.stopPropagation()}
              >
                {loading ? (
                  <div className="p-6 text-center">
                    <motion.div
                      className="w-6 h-6 border-2 border-white/20 border-t-white rounded-full mx-auto"
                      animate={{ rotate: 360 }}
                      transition={{ duration: 1, repeat: Infinity, ease: 'linear' }}
                    />
                  </div>
                ) : notifications.length === 0 ? (
                  <motion.div 
                    className="flex flex-col items-center justify-center py-10 px-6"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div 
                      className="w-14 h-14 rounded-2xl flex items-center justify-center mb-4"
                      style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                    >
                      <BellOff className="w-7 h-7" style={{ color: colors.textSecondary }} />
                    </div>
                    <p className="text-sm font-medium text-white mb-1">No notifications</p>
                    <p className="text-xs text-center" style={{ color: colors.textSecondary }}>
                      You'll be notified when students<br />submit payments for review
                    </p>
                  </motion.div>
                ) : groupedNotifications.recent.length > 0 && (
                  <div className="px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: colors.textSecondary }}>
                      Recent Activity
                    </p>
                    <div className="space-y-2">
                      {groupedNotifications.recent.map((notification, index) => (
                        <motion.div
                          key={notification.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: index * 0.03 }}
                          className="p-3 rounded-xl cursor-pointer transition-all"
                          style={{
                            background: notification.is_read ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.05)',
                          }}
                          onClick={() => handleNotificationClick(notification)}
                          whileHover={{ background: 'rgba(255, 255, 255, 0.08)' }}
                        >
                          <div className="flex items-center gap-3">
                            <div 
                              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                              style={{ 
                                background: notification.type === 'payment_pending' 
                                  ? `${colors.warning}15` 
                                  : `${colors.primary}15` 
                              }}
                            >
                              {notification.type === 'payment_pending' ? (
                                <Clock className="w-4 h-4" style={{ color: colors.warning }} />
                              ) : (
                                <CheckCircle className="w-4 h-4" style={{ color: colors.accentMint }} />
                              )}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p 
                                className="text-xs truncate"
                                style={{ color: notification.is_read ? colors.textSecondary : 'white' }}
                              >
                                {notification.message.length > 50 
                                  ? notification.message.substring(0, 50) + '...'
                                  : notification.message}
                              </p>
                            </div>
                            <span className="text-[10px] shrink-0" style={{ color: colors.textSecondary }}>
                              {formatTimeAgo(notification.created_at)}
                            </span>
                          </div>
                        </motion.div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* Footer */}
              <div 
                className="px-4 py-3 border-t text-center"
                style={{ 
                  borderColor: 'rgba(255, 255, 255, 0.08)',
                  background: 'rgba(255, 255, 255, 0.02)'
                }}
              >
                <motion.button
                  onClick={() => {
                    navigate('/admin/review');
                    setShowPanel(false);
                  }}
                  className="text-xs font-medium flex items-center justify-center gap-1.5 mx-auto"
                  style={{ color: colors.primary }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  Go to Review Dashboard
                </motion.button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
