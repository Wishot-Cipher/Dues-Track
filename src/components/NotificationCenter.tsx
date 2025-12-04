import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, AlertCircle, DollarSign, CheckCircle, BellOff, Sparkles } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/utils/formatters';
import { colors, gradients } from '@/config/colors';
import { useNavigate } from 'react-router-dom';
import { useSettings } from '@/contexts/SettingsContext';

interface Notification {
  id: string;
  type: 'payment_approved' | 'payment_rejected' | 'payment_waived';
  title: string;
  message: string;
  is_read: boolean;
  created_at: string;
  metadata?: {
    payment_id?: string;
    payment_type_id?: string;
    waiver_reason?: string;
    rejection_reason?: string;
    waived_by?: string;
    amount?: number;
  };
  link?: string | null;
}

// Notification skeleton loader
function NotificationSkeleton() {
  return (
    <div className="p-4 animate-pulse">
      <div className="flex gap-3">
        <div className="w-10 h-10 rounded-xl bg-white/10 shrink-0" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-white/10 rounded w-3/4" />
          <div className="h-3 bg-white/5 rounded w-full" />
          <div className="h-3 bg-white/5 rounded w-1/2" />
        </div>
      </div>
    </div>
  );
}

export const NotificationCenter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { playNotificationSound } = useSettings();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('recipient_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);

      if (error) throw error;

      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.is_read).length || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
      
      // Subscribe to new notifications
      const channel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `recipient_id=eq.${user.id}`,
          },
          (payload) => {
            // Play sound for new notification (respects user settings)
            const notification = payload.new as Notification;
            if (notification.type === 'payment_approved') {
              playNotificationSound('success');
            } else if (notification.type === 'payment_rejected') {
              playNotificationSound('warning');
            } else if (notification.type === 'payment_waived') {
              playNotificationSound('ding');
            } else {
              playNotificationSound('info');
            }
            
            fetchNotifications();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id, fetchNotifications, playNotificationSound]);

  // Lock body scroll when panel is open
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
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', notificationId);

      if (error) throw error;

      setNotifications(prev =>
        prev.map(n => n.id === notificationId ? { ...n, is_read: true } : n)
      );
      setUnreadCount(prev => Math.max(0, prev - 1));
    } catch (error) {
      console.error('Error marking notification as read:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('recipient_id', user?.id)
        .eq('is_read', false);

      if (error) throw error;

      setNotifications(prev => prev.map(n => ({ ...n, is_read: true })));
      setUnreadCount(0);
    } catch (error) {
      console.error('Error marking all as read:', error);
    }
  };

  const getNotificationIcon = (type: string) => {
    const iconClass = "w-5 h-5";
    switch (type) {
      case 'payment_approved':
        return (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.statusPaid}20` }}>
            <CheckCircle className={iconClass} style={{ color: colors.statusPaid }} />
          </div>
        );
      case 'payment_rejected':
        return (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.statusUnpaid}20` }}>
            <AlertCircle className={iconClass} style={{ color: colors.statusUnpaid }} />
          </div>
        );
      case 'payment_waived':
        return (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.accentMint}20` }}>
            <DollarSign className={iconClass} style={{ color: colors.accentMint }} />
          </div>
        );
      default:
        return (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
            <Bell className={iconClass} style={{ color: colors.primary }} />
          </div>
        );
    }
  };

  const getNotificationColor = (type: string) => {
    switch (type) {
      case 'payment_approved':
        return colors.statusPaid;
      case 'payment_rejected':
        return colors.statusUnpaid;
      case 'payment_waived':
        return colors.accentMint;
      default:
        return colors.primary;
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

  return (
    <>
      {/* Notification Bell Button */}
      <motion.button
        onClick={() => {
          setShowPanel(prev => {
            if (!prev) void fetchNotifications();
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
          {unreadCount > 0 && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0 }}
              className="absolute -top-1 -right-1 min-w-[20px] h-5 px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
              style={{ background: gradients.primary, boxShadow: `0 2px 8px ${colors.primary}50` }}
            >
              {unreadCount > 9 ? '9+' : unreadCount}
            </motion.div>
          )}
        </AnimatePresence>
      </motion.button>

      {/* Notification Panel */}
      <AnimatePresence>
        {showPanel && (
          <>
            {/* Backdrop - prevents page scroll and interaction */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/40 backdrop-blur-sm"
              style={{ touchAction: 'none' }}
              onClick={() => setShowPanel(false)}
              onWheel={(e) => e.stopPropagation()}
            />
            
            {/* Panel */}
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute right-0 top-full mt-3 w-[380px] max-w-[calc(100vw-2rem)] rounded-2xl overflow-hidden z-50"
              style={{ 
                background: '#0D0907',
                border: `1px solid rgba(255, 107, 53, 0.15)`,
                boxShadow: `0 25px 80px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 107, 53, 0.1), inset 0 1px 0 rgba(255, 255, 255, 0.05)`,
              }}
              onWheel={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div 
                className="px-5 py-4 border-b"
                style={{ 
                  borderColor: 'rgba(255, 255, 255, 0.08)',
                  background: 'rgba(255, 255, 255, 0.02)'
                }}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-9 h-9 rounded-xl flex items-center justify-center"
                      style={{ background: `${colors.primary}15` }}
                    >
                      <Bell className="w-4.5 h-4.5" style={{ color: colors.primary }} />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">Notifications</h3>
                      {unreadCount > 0 && (
                        <p className="text-xs" style={{ color: colors.textSecondary }}>
                          {unreadCount} unread
                        </p>
                      )}
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
                        Mark all read
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

              {/* Notifications List */}
              <div 
                className="max-h-[400px] overflow-y-auto custom-scrollbar overscroll-contain"
                onWheel={(e) => e.stopPropagation()}
              >
                {loading ? (
                  <>
                    <NotificationSkeleton />
                    <NotificationSkeleton />
                    <NotificationSkeleton />
                  </>
                ) : notifications.length === 0 ? (
                  <motion.div 
                    className="flex flex-col items-center justify-center py-12 px-6"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <div 
                      className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
                      style={{ background: 'rgba(255, 255, 255, 0.05)' }}
                    >
                      <BellOff className="w-8 h-8" style={{ color: colors.textSecondary }} />
                    </div>
                    <p className="text-sm font-medium text-white mb-1">No notifications yet</p>
                    <p className="text-xs text-center" style={{ color: colors.textSecondary }}>
                      You'll see payment updates and<br />important alerts here
                    </p>
                  </motion.div>
                ) : (
                  <div className="py-2">
                    {notifications.map((notification, index) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="mx-2 mb-2 rounded-xl cursor-pointer transition-all duration-200"
                        style={{
                          background: notification.is_read 
                            ? 'rgba(255, 255, 255, 0.02)' 
                            : `${getNotificationColor(notification.type)}08`,
                          border: notification.is_read 
                            ? '1px solid transparent' 
                            : `1px solid ${getNotificationColor(notification.type)}20`,
                        }}
                        onClick={async () => {
                          try {
                            if (!notification.is_read) {
                              await markAsRead(notification.id);
                            }
                            if (notification.link) {
                              navigate(notification.link);
                              setShowPanel(false);
                            }
                          } catch (err) {
                            console.error('Error on notification click:', err);
                          }
                        }}
                        whileHover={{ 
                          background: notification.is_read 
                            ? 'rgba(255, 255, 255, 0.05)' 
                            : `${getNotificationColor(notification.type)}15`,
                        }}
                      >
                        <div className="p-3.5 flex gap-3">
                          {/* Icon */}
                          <div className="shrink-0">
                            {getNotificationIcon(notification.type)}
                          </div>
                          
                          {/* Content */}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="text-sm font-semibold text-white line-clamp-1">
                                {notification.title}
                              </h4>
                              {!notification.is_read && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  className="w-2.5 h-2.5 rounded-full shrink-0 mt-1"
                                  style={{ 
                                    background: getNotificationColor(notification.type),
                                    boxShadow: `0 0 8px ${getNotificationColor(notification.type)}60`
                                  }}
                                />
                              )}
                            </div>
                            <p
                              className="text-xs mb-2 line-clamp-2 leading-relaxed"
                              style={{ color: notification.is_read ? colors.textSecondary : 'rgba(255, 255, 255, 0.8)' }}
                            >
                              {notification.message}
                            </p>
                            <div className="flex items-center justify-between">
                              <span 
                                className="text-[11px] font-medium"
                                style={{ color: colors.textSecondary }}
                              >
                                {formatTimeAgo(notification.created_at)}
                              </span>
                              {notification.metadata?.amount && (
                                <span 
                                  className="text-xs font-bold px-2 py-0.5 rounded-md"
                                  style={{ 
                                    color: getNotificationColor(notification.type),
                                    background: `${getNotificationColor(notification.type)}15`
                                  }}
                                >
                                  {formatCurrency(notification.metadata.amount)}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </motion.div>
                    ))}
                  </div>
                )}
              </div>

              {/* Footer */}
              {notifications.length > 0 && (
                <div 
                  className="px-4 py-3 border-t text-center"
                  style={{ 
                    borderColor: 'rgba(255, 255, 255, 0.08)',
                    background: 'rgba(255, 255, 255, 0.02)'
                  }}
                >
                  <motion.button
                    onClick={() => {
                      navigate('/payments');
                      setShowPanel(false);
                    }}
                    className="text-xs font-medium flex items-center justify-center gap-1.5 mx-auto"
                    style={{ color: colors.primary }}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    View payment history
                  </motion.button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
};
