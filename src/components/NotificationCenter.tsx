import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, AlertCircle, DollarSign, CheckCircle } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useAuth } from '@/hooks/useAuth';
import { formatCurrency } from '@/utils/formatters';
import { colors } from '@/config/colors';
import { useNavigate } from 'react-router-dom';
import { notificationSound } from '@/utils/notificationSound';

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

export const NotificationCenter = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
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
            // Play sound for new notification
            const notification = payload.new as Notification;
            if (notification.type === 'payment_approved') {
              notificationSound.play('success');
            } else if (notification.type === 'payment_rejected') {
              notificationSound.play('warning');
            } else if (notification.type === 'payment_waived') {
              notificationSound.playDing();
            } else {
              notificationSound.play('info');
            }
            
            fetchNotifications();
          }
        )
        .subscribe();

      return () => {
        supabase.removeChannel(channel);
      };
    }
  }, [user?.id, fetchNotifications]);

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
    switch (type) {
      case 'payment_approved':
        return <CheckCircle className="w-5 h-5" style={{ color: colors.statusPaid }} />;
      case 'payment_rejected':
        return <AlertCircle className="w-5 h-5" style={{ color: colors.statusUnpaid }} />;
      case 'payment_waived':
        return <DollarSign className="w-5 h-5" style={{ color: colors.accentMint }} />;
      default:
        return <Bell className="w-5 h-5" style={{ color: colors.accent }} />;
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
        return colors.accent;
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
    return `${days}d ago`;
  };

  // The dedicated portal content was duplicated inside the component return and
  // caused nested/imbalanced JSX fragments; the panel is rendered directly in the
  // return's AnimatePresence to avoid fragment errors.

  return (
    <>
      {/* Notification Bell */}
      <button
        onClick={() => {
          // Toggle panel and fetch fresh notifications when opening
          setShowPanel(prev => {
            const opening = !prev;
            if (opening) {
              // load latest notifications when the user opens the panel
              void fetchNotifications();
            }
            return !prev;
          });
        }}
        className="relative p-2 rounded-lg transition-all duration-200 hover:scale-105"
        style={{
          background: showPanel ? `${colors.accent}20` : 'transparent',
          border: showPanel ? `1px solid ${colors.accent}40` : '1px solid transparent',
        }}
      >
        <Bell className="w-6 h-6" style={{ color: colors.accent }} />
        {unreadCount > 0 && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold text-white"
            style={{ background: colors.statusUnpaid }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </motion.div>
        )}
      </button>
                        

      {/* Notification Panel */}
      <AnimatePresence>
        {showPanel && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="absolute right-0 mt-2 top-0 w-[360px] max-h-[60vh] bg-[#0B0B0C] rounded-lg shadow-lg z-50 flex flex-col"
            style={{ boxShadow: '0 10px 30px rgba(0,0,0,0.5)' }}
          >
              {/* Header */}
              <div className="p-4 border-b" style={{ borderColor: colors.borderMedium }}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xl font-bold text-white flex items-center gap-2">
                    <Bell className="w-6 h-6" style={{ color: colors.accent }} />
                    Notifications
                  </h3>
                  <button
                    onClick={() => setShowPanel(false)}
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                  >
                    <X className="w-5 h-5 text-white" />
                  </button>
                </div>
                {unreadCount > 0 && (
                  <button
                    onClick={markAllAsRead}
                    className="text-sm px-3 py-1 rounded-lg transition-colors"
                    style={{
                      color: colors.accent,
                      background: `${colors.accent}20`,
                    }}
                  >
                    Mark all as read
                  </button>
                )}
              </div>

              {/* Notifications List */}
              <div className="flex-1 overflow-y-auto">
                {loading ? (
                  <div className="flex items-center justify-center h-32">
                    <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin"
                      style={{ borderColor: colors.accent, borderTopColor: 'transparent' }}
                    />
                  </div>
                ) : notifications.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-32 px-4">
                        <Bell className="w-12 h-12 mb-2" style={{ color: colors.textSecondary }} />
                    <p className="text-center" style={{ color: colors.textSecondary }}>
                      No notifications yet
                    </p>
                  </div>
                ) : (
                  <div className="divide-y" style={{ borderColor: colors.borderMedium }}>
                    {notifications.map((notification) => (
                      <motion.div
                        key={notification.id}
                        initial={{ opacity: 0, y: 20 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="p-4 cursor-pointer transition-colors hover:bg-white/5"
                        style={{
                          background: notification.is_read ? 'transparent' : `${getNotificationColor(notification.type)}14`,
                          borderLeft: notification.is_read ? '2px solid transparent' : `3px solid ${getNotificationColor(notification.type)}`,
                        }}
                        onClick={async () => {
                          // Mark notification as read and navigate if a link exists
                          try {
                            if (!notification.is_read) {
                              await markAsRead(notification.id);
                            }
                            // Navigate to linked resource if present (e.g., '/payments')
                            if (notification.link) {
                              navigate(notification.link);
                              setShowPanel(false);
                            }
                          } catch (err) {
                            console.error('Error on notification click:', err);
                          }
                        }}
                      >
                        <div className="flex gap-3">
                          <div className="shrink-0 mt-1">
                            {getNotificationIcon(notification.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2 mb-1">
                              <h4 className="text-sm font-semibold text-white line-clamp-1">
                                {notification.title}
                              </h4>
                              {!notification.is_read && (
                                <div
                                  className="w-2 h-2 rounded-full shrink-0"
                                  style={{ background: colors.accent }}
                                />
                              )}
                            </div>
                            <p
                              className="text-xs mb-2 whitespace-pre-line line-clamp-3"
                              style={{ color: notification.is_read ? colors.textSecondary : colors.textPrimary }}
                            >
                              {notification.message}
                            </p>
                            <div className="flex items-center justify-between">
                              <span className="text-xs" style={{ color: colors.textSecondary }}>
                                {formatTimeAgo(notification.created_at)}
                              </span>
                              {notification.metadata?.amount && (
                                <span className="text-xs font-semibold" style={{ color: getNotificationColor(notification.type) }}>
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
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
