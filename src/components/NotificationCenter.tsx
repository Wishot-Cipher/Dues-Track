import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, X, AlertCircle, DollarSign, CheckCircle, BellOff, Sparkles, Trash2, Vote as VoteIcon, ShieldCheck } from 'lucide-react';
import { supabase } from '@/config/supabase';
import notificationService from '@/services/notificationService';
import { useAppAuth as useAuth } from '@/hooks/useAppAuth';
import { formatCurrency } from '@/utils/formatters';
import { colors, gradients } from '@/config/colors';
import { useAppNav } from '@/hooks/useAppNav';
import { useSettings } from '@/contexts/SettingsContext';
import { getOrgScope } from '@/utils/orgScope';
import { notificationSound } from '@/utils/notificationSound';

type NotificationType =
  | 'payment_approved'
  | 'payment_rejected'
  | 'payment_waived'
  | 'claim_vote_requested'
  | 'claim_confirm_requested'
  | 'claim_approved'
  | 'claim_rejected';

interface Notification {
  id: string;
  type: NotificationType;
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
  related_type?: string | null;
  related_id?: string | null;
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
  const { go: navigate } = useAppNav();
  const { playNotificationSound } = useSettings();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showPanel, setShowPanel] = useState(false);
  const [loading, setLoading] = useState(false);

  const fetchNotifications = useCallback(async () => {
    if (!user?.id) {
      console.log('🔔 NotificationCenter: No user ID, skipping fetch');
      return;
    }

    try {
      setLoading(true);
      console.log('🔔 Fetching notifications for user:', user.id);
      
      const scope = getOrgScope();
      let q = supabase
        .from('notifications')
        .select('id, type, title, message, is_read, created_at, metadata, link, related_type, related_id, organization_id, group_id, member_id')
        .eq('member_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (scope) {
        q = q.eq('organization_id', scope.orgId);
        q = q.eq('group_id', scope.groupId);
      }
      const { data, error } = await q;

      if (error) {
        console.error('🔔 Error fetching notifications:', error);
        throw error;
      }
      
      console.log('🔔 Notifications loaded:', data?.length || 0, 'items');

      setNotifications(data || []);
      setUnreadCount(data?.filter(n => !n.is_read).length || 0);
    } catch (error) {
      console.error('Error fetching notifications:', error);
    } finally {
      setLoading(false);
    }
  }, [user?.id]);

  // Keep unread count in sync with local notifications state
  useEffect(() => {
    setUnreadCount(notifications.filter(n => !n.is_read).length);
  }, [notifications]);

  useEffect(() => {
    if (user?.id) {
      fetchNotifications();
      
      // Pre-initialize audio context for notifications
      void notificationSound.forceInit();
      
      // Subscribe to new notifications and updates (keeps read state in sync across clients)
      const channel = supabase
        .channel('notifications')
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'notifications',
            filter: `member_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('🔔 New notification received:', payload.new);

            // Play sound for new notification (respects user settings)
            const notification = payload.new as Notification;
            if (notification.type === 'payment_approved' || notification.type === 'claim_approved') {
              playNotificationSound('success');
            } else if (notification.type === 'payment_rejected' || notification.type === 'claim_rejected') {
              playNotificationSound('warning');
            } else if (notification.type === 'payment_waived') {
              playNotificationSound('ding');
            } else if (notification.type === 'claim_vote_requested' || notification.type === 'claim_confirm_requested') {
              playNotificationSound('info');
            } else {
              playNotificationSound('info');
            }

            fetchNotifications();
          }
        )
        .on(
          'postgres_changes',
          {
            event: 'UPDATE',
            schema: 'public',
            table: 'notifications',
            filter: `member_id=eq.${user.id}`,
          },
          (payload) => {
            console.log('🔔 Notification updated:', payload.new);
            const updated = payload.new as Notification;
            setNotifications(prev => {
              const next = prev.map(n => n.id === updated.id ? { ...n, ...updated } : n);
              setUnreadCount(next.filter(n => !n.is_read).length);
              return next;
            });
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

  const clearReadNotifications = async () => {
    try {
      const userId = user?.id;
      if (!userId) throw new Error('Not authenticated');

      const ok = await notificationService.deleteAllRead(userId);
      if (!ok) throw new Error('Failed to clear read notifications');

      setNotifications(prev => prev.filter(n => !n.is_read));
      return true;
    } catch (error) {
      console.error('Error clearing read notifications:', error);
      return false;
    }
  };

  const getNotificationIcon = (type: string) => {
    const iconClass = "w-5 h-5";
    switch (type) {
      case 'payment_approved':
      case 'claim_approved':
        return (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.statusPaid}20` }}>
            <CheckCircle className={iconClass} style={{ color: colors.statusPaid }} />
          </div>
        );
      case 'payment_rejected':
      case 'claim_rejected':
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
      case 'claim_vote_requested':
        return (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
            <VoteIcon className={iconClass} style={{ color: colors.primary }} />
          </div>
        );
      case 'claim_confirm_requested':
        return (
          <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
            <ShieldCheck className={iconClass} style={{ color: colors.primary }} />
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
      case 'claim_approved':
        return colors.statusPaid;
      case 'payment_rejected':
      case 'claim_rejected':
        return colors.statusUnpaid;
      case 'payment_waived':
        return colors.accentMint;
      case 'claim_vote_requested':
      case 'claim_confirm_requested':
        return colors.primary;
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
              className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 rounded-full flex items-center justify-center text-[11px] font-bold text-white"
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
              className="fixed top-16 left-3 right-3 sm:left-auto sm:right-4 sm:w-[380px] rounded-2xl overflow-hidden z-50"
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
                    {notifications.some(n => n.is_read) && (
                      <motion.button
                        onClick={clearReadNotifications}
                        className="text-xs px-3 py-1.5 rounded-lg font-medium transition-all flex items-center gap-1"
                        style={{
                          color: colors.statusUnpaid,
                          background: `${colors.statusUnpaid}15`,
                        }}
                        whileHover={{ background: `${colors.statusUnpaid}25` }}
                        whileTap={{ scale: 0.95 }}
                        title="Delete all read notifications"
                      >
                        <Trash2 className="w-3 h-3" />
                        Clear read
                      </motion.button>
                    )}
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
                className="max-h-[min(400px,calc(100vh-14rem))] overflow-y-auto custom-scrollbar overscroll-contain"
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
                              // Optimistic UI update
                              setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: true } : n));
                              const ok = await markAsRead(notification.id);
                              if (!ok) {
                                // Revert if DB update failed
                                setNotifications(prev => prev.map(n => n.id === notification.id ? { ...n, is_read: false } : n));
                              }
                            }

                            // Resolve target route from notification type.
                            // The DB writes a `link` field, but for claim notifications it
                            // emits the un-scoped `/claims/<uuid>` shape — we must rewrite
                            // it to the org-scoped vote/confirm pages here.
                            let targetLink = notification.link;
                            const claimId =
                              (notification.related_type === 'claim_request' && notification.related_id) ||
                              (targetLink?.startsWith('/claims/') ? targetLink.replace('/claims/', '') : null);

                            if ((notification.type === 'claim_vote_requested' || notification.type === 'claim_confirm_requested') && claimId) {
                              // One landing page for both — it auto-detects what the viewer can do.
                              targetLink = `/claim/${claimId}/decide`;
                            } else if (notification.type === 'claim_approved' || notification.type === 'claim_rejected') {
                              targetLink = '/dashboard';
                            } else if (targetLink && targetLink.startsWith('/payments/') && !targetLink.includes('/payments/history')) {
                              // Legacy payment link rewrite
                              const paymentId = targetLink.replace('/payments/', '');
                              targetLink = `/payment/${paymentId}`;
                            }

                            // If still no link, fall back by type
                            if (!targetLink) {
                              if (notification.type === 'payment_approved' || notification.type === 'payment_rejected') {
                                targetLink = notification.metadata?.payment_id
                                  ? `/payment/${notification.metadata.payment_id}`
                                  : '/payments';
                              } else if (notification.type === 'payment_waived') {
                                targetLink = '/payments';
                              } else {
                                targetLink = '/dashboard';
                              }
                            }

                            navigate(targetLink);
                            setShowPanel(false);
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
