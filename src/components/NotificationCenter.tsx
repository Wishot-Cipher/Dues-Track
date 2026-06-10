/**
 * NotificationCenter — the bell icon + live unread badge.
 *
 * Tapping the bell routes to the full /notifications page (no dropdown):
 * reading is the default action, and the page owns preview → detail,
 * mark-as-read, and full history. This component's only jobs are:
 *   • show an accurate unread count (member-wide, all tiers)
 *   • keep the device PWA app-icon badge in sync
 *   • play a sound when a new notification arrives (respects settings)
 */

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell } from 'lucide-react';
import { supabase } from '@/config/supabase';
import { useAppAuth as useAuth } from '@/hooks/useAppAuth';
import { colors, gradients } from '@/config/colors';
import { useAppNav } from '@/hooks/useAppNav';
import { useSettings } from '@/contexts/SettingsContext';
import { getOrgScope } from '@/utils/orgScope';
import { notificationSound } from '@/utils/notificationSound';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';

interface NewNotification {
  id: string;
  type?: string;
  is_read?: boolean;
}

/**
 * Sync the home-screen app-icon badge (PWA Badging API). The count
 * shows on the installed app icon even when the app is closed, so
 * users see "you have N unread" without opening it. No-op on browsers
 * that don't support it.
 */
function syncAppBadge(count: number): void {
  try {
    const nav = navigator as Navigator & {
      setAppBadge?: (n?: number) => Promise<void>;
      clearAppBadge?: () => Promise<void>;
    };
    if (count > 0) void nav.setAppBadge?.(count);
    else void nav.clearAppBadge?.();
  } catch {
    /* Badging API unsupported — ignore */
  }
}

export const NotificationCenter = () => {
  const { user } = useAuth();
  const { go: navigate } = useAppNav();
  const { playNotificationSound } = useSettings();
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);
  const [unreadCount, setUnreadCount] = useState(0);

  // Count ALL the member's unread notifications across the org — NOT
  // group-scoped. The badge must reflect every unread item (same set
  // the /notifications page shows); the old group_id filter undercounted
  // and could show 0 while other-tier notifications were unread.
  const refreshCount = useCallback(async () => {
    if (!user?.id) { setUnreadCount(0); syncAppBadge(0); return; }
    try {
      const scope = getOrgScope();
      let q = supabase
        .from('notifications')
        .select('id', { count: 'exact', head: true })
        .eq('member_id', user.id)
        .eq('is_read', false);
      if (scope) q = q.eq('organization_id', scope.orgId);
      const { count } = await q;
      const c = count ?? 0;
      setUnreadCount(c);
      syncAppBadge(c);
    } catch {
      /* leave the last known count */
    }
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id) return;
    void refreshCount();
    void notificationSound.forceInit();

    const channel = supabase
      .channel('notifications-badge')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notifications', filter: `member_id=eq.${user.id}` },
        (payload) => {
          const n = payload.new as NewNotification;
          const type = String(n.type || '');
          // Sound by type (the hook respects the user's sound setting).
          if (type.includes('approved') || type.includes('paid')) playNotificationSound('success');
          else if (type.includes('rejected') || type.includes('failed')) playNotificationSound('warning');
          else if (type.includes('waived')) playNotificationSound('ding');
          else playNotificationSound('info');
          void refreshCount();
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'notifications', filter: `member_id=eq.${user.id}` },
        () => { void refreshCount(); },
      )
      .subscribe();

    // Re-sync when the tab regains focus — catches reads done on the
    // notifications page / another device while this was backgrounded.
    const onVisible = () => { if (document.visibilityState === 'visible') void refreshCount(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      supabase.removeChannel(channel);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [user?.id, refreshCount, playNotificationSound]);

  return (
    <motion.button
      onClick={() => navigate('/notifications')}
      className="relative p-2.5 rounded-xl transition-all duration-300"
      style={{
        background: theme === 'light' ? 'rgba(15, 7, 3, 0.04)' : 'rgba(255, 255, 255, 0.05)',
        border: `1px solid ${tk.cardBorder}`,
      }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      aria-label={unreadCount > 0 ? `Notifications, ${unreadCount} unread` : 'Notifications'}
    >
      <Bell className="w-5 h-5" style={{ color: tk.text }} />
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
  );
};

export default NotificationCenter;
