import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, BellOff, Smartphone, X, Loader2, Send, Shield } from 'lucide-react';
import { colors, gradients } from '@/config/colors';
import { useAppAuth as useAuth } from '@/hooks/useAppAuth';
import { useToast } from '@/hooks/useToast';
import pushNotificationService from '@/services/pushNotificationService';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';

interface PushNotificationPromptProps {
  mode?: 'banner' | 'inline' | 'settings';
  onDismiss?: () => void;
}

export function PushNotificationPrompt({ mode = 'banner', onDismiss }: PushNotificationPromptProps) {
  const { user } = useAuth();
  const toast = useToast();
  const [isSupported, setIsSupported] = useState(false);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [permission, setPermission] = useState<NotificationPermission>('default');
  const [loading, setLoading] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setIsSupported(pushNotificationService.isSupported());
    setPermission(pushNotificationService.getPermissionStatus());
    const subscribed = await pushNotificationService.isSubscribed();
    setIsSubscribed(subscribed);
  };

  const handleEnable = async () => {
    if (!user?.id) {
      toast.error('Please log in to enable notifications');
      return;
    }

    setLoading(true);
    
    // Add a timeout to prevent infinite loading
    const timeoutId = setTimeout(() => {
      setLoading(false);
      toast.error('Request timed out. Please try again.');
    }, 15000); // 15 second timeout
    
    try {
      const success = await pushNotificationService.subscribe(user.id);
      clearTimeout(timeoutId);
      
      if (success) {
        setIsSubscribed(true);
        toast.success('Push notifications enabled! 🔔');
        
        // Show a test notification
        try {
          await pushNotificationService.showLocalNotification(
            '🎉 Notifications Enabled!',
            {
              body: "You'll now receive alerts when payments are approved or rejected.",
              tag: 'welcome',
            }
          );
        } catch (notifError) {
          console.log('Could not show test notification:', notifError);
        }
      } else {
        const perm = pushNotificationService.getPermissionStatus();
        if (perm === 'denied') {
          toast.error('Notifications blocked. Please enable in browser settings.');
        } else {
          toast.error('Failed to enable notifications. Check console for details.');
        }
      }
    } catch (error) {
      clearTimeout(timeoutId);
      console.error('Error enabling notifications:', error);
      toast.error('Failed to enable notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    if (!user?.id) return;

    setLoading(true);
    try {
      await pushNotificationService.unsubscribe(user.id);
      setIsSubscribed(false);
      toast.info('Push notifications disabled');
    } catch (error) {
      console.error('Error disabling notifications:', error);
      toast.error('Failed to disable notifications');
    } finally {
      setLoading(false);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    onDismiss?.();
    // Remember dismissal for 7 days
    localStorage.setItem('push_prompt_dismissed', Date.now().toString());
  };

  // Check if prompt was recently dismissed (only for banner mode)
  useEffect(() => {
    if (mode !== 'banner') return; // Only apply dismissal to banner mode
    
    const dismissedAt = localStorage.getItem('push_prompt_dismissed');
    if (dismissedAt) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        setDismissed(true);
      }
    }
  }, [mode]);

  // Settings mode: Always show the SettingsView
  if (mode === 'settings') {
    return (
      <SettingsView
        isSupported={isSupported}
        isSubscribed={isSubscribed}
        permission={permission}
        loading={loading}
        onEnable={handleEnable}
        onDisable={handleDisable}
      />
    );
  }

  // For banner/inline: Don't show if not supported, already subscribed, permission denied, or dismissed
  if (!isSupported || isSubscribed || permission === 'denied' || dismissed) {
    return null;
  }

  if (mode === 'inline') {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="p-4 rounded-xl"
        style={{
          background: `linear-gradient(135deg, ${colors.primary}15 0%, ${colors.accentMint}10 100%)`,
          border: `1px solid ${colors.primary}30`,
        }}
      >
        <div className="flex items-start gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${colors.primary}20` }}
          >
            <BellRing className="w-5 h-5" style={{ color: colors.primary }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-white mb-1">Enable Push Notifications</p>
            <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
              Get instant alerts when payments are approved or rejected, even when the app is closed.
            </p>
            <div className="flex gap-2">
              <motion.button
                onClick={handleEnable}
                disabled={loading}
                className="px-4 py-2 rounded-lg text-xs font-semibold flex items-center gap-2"
                style={{ background: gradients.primary }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Bell className="w-3 h-3" />
                )}
                Enable
              </motion.button>
              <motion.button
                onClick={handleDismiss}
                className="px-4 py-2 rounded-lg text-xs font-medium"
                style={{ color: colors.textSecondary }}
                whileHover={{ background: 'rgba(255, 255, 255, 0.05)' }}
              >
                Later
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    );
  }

  // Banner mode (default)
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        className="fixed bottom-20 left-4 right-4 z-40 max-w-md mx-auto"
      >
        <div
          className="p-4 rounded-2xl relative overflow-hidden"
          style={{
            background: '#0D0907',
            border: `1px solid ${colors.primary}30`,
            boxShadow: `0 10px 40px rgba(0, 0, 0, 0.6), 0 0 0 1px rgba(255, 107, 53, 0.1)`,
          }}
        >
          {/* Gradient accent */}
          <div className="absolute top-0 left-0 w-full h-1" style={{ background: gradients.primary }} />
          
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-3 right-3 p-1.5 rounded-lg"
            style={{ background: 'rgba(255, 255, 255, 0.05)' }}
          >
            <X className="w-4 h-4" style={{ color: colors.textSecondary }} />
          </button>

          <div className="flex items-start gap-4 pr-8">
            <motion.div
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: gradients.primary }}
              animate={{ rotate: [0, -10, 10, -5, 5, 0] }}
              transition={{ duration: 0.5, delay: 0.5 }}
            >
              <Smartphone className="w-6 h-6 text-white" />
            </motion.div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-bold text-white mb-1">Never Miss an Update!</h3>
              <p className="text-xs mb-3" style={{ color: colors.textSecondary }}>
                Enable push notifications to get instant alerts when your payments are approved, rejected, or waived.
              </p>
              <motion.button
                onClick={handleEnable}
                disabled={loading}
                className="w-full py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
                style={{ background: gradients.primary }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {loading ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Enabling...
                  </>
                ) : (
                  <>
                    <BellRing className="w-4 h-4" />
                    Enable Notifications
                  </>
                )}
              </motion.button>
            </div>
          </div>
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

// Settings view for the settings page
function SettingsView({
  isSupported,
  isSubscribed,
  permission,
  loading,
  onEnable,
  onDisable,
}: {
  isSupported: boolean;
  isSubscribed: boolean;
  permission: NotificationPermission;
  loading: boolean;
  onEnable: () => void;
  onDisable: () => void;
}) {
  const { user } = useAuth();
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);
  const toast = useToast();
  const [testing, setTesting] = useState(false);

  const handleTestPush = async () => {
    if (!user?.id) return;
    setTesting(true);
    try {
      const result = await pushNotificationService.testPush(user.id);
      if (result.ok) {
        toast.success('Test notification sent! Check your device.');
      } else {
        toast.error(result.message || 'Test failed');
        console.log('Test push details:', result);
      }
    } catch (error) {
      toast.error('Failed to send test notification');
      console.error('Test push error:', error);
    } finally {
      setTesting(false);
    }
  };

  // Status config
  const statusCfg = !isSupported
    ? { label: 'Unsupported', color: colors.textSecondary, dotColor: colors.textSecondary }
    : permission === 'denied'
    ? { label: 'Blocked', color: '#ef4444', dotColor: '#ef4444' }
    : isSubscribed
    ? { label: 'Active', color: '#22c55e', dotColor: '#22c55e' }
    : { label: 'Off', color: colors.textSecondary, dotColor: colors.textSecondary };

  return (
    <motion.div
      className="rounded-2xl overflow-hidden"
      style={{
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(12px)',
        border: `1px solid ${isSubscribed ? 'rgba(34,197,94,0.15)' : 'rgba(255,255,255,0.08)'}`,
      }}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* ── Header Row ── */}
      <div className="px-4 py-3.5 flex items-center gap-3">
        {/* Icon with pulse */}
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative"
          style={{
            background: isSubscribed
              ? 'linear-gradient(135deg, rgba(34,197,94,0.15), rgba(34,197,94,0.05))'
              : `${colors.primary}15`,
          }}
        >
          {isSubscribed ? (
            <BellRing className="w-[18px] h-[18px]" style={{ color: '#22c55e' }} />
          ) : !isSupported ? (
            <BellOff className="w-[18px] h-[18px]" style={{ color: tk.textSec }} />
          ) : (
            <Bell className="w-[18px] h-[18px]" style={{ color: tk.primary }} />
          )}
          {isSubscribed && (
            <motion.div
              className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full"
              style={{ background: '#22c55e', boxShadow: '0 0 6px rgba(34,197,94,0.6)' }}
              animate={{ scale: [1, 1.3, 1] }}
              transition={{ repeat: Infinity, duration: 2, ease: 'easeInOut' }}
            />
          )}
        </div>

        {/* Title & subtitle */}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-white">Push Notifications</p>
          <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
            {isSubscribed
              ? 'Receiving real-time alerts'
              : permission === 'denied'
              ? 'Blocked by browser settings'
              : !isSupported
              ? 'Not available in this browser'
              : 'Get notified even when app is closed'}
          </p>
        </div>

        {/* Status pill */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-1 rounded-full shrink-0"
          style={{ background: `${statusCfg.dotColor}18` }}
        >
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: statusCfg.dotColor }} />
          <span className="text-[11px] font-semibold" style={{ color: statusCfg.color }}>
            {statusCfg.label}
          </span>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="px-4 pb-4 space-y-3" style={{ borderTop: '1px solid rgba(255,255,255,0.04)' }}>
        {/* Not supported info */}
        {!isSupported && (
          <div className="p-3 rounded-xl flex items-start gap-3 mt-1" style={{ background: 'rgba(255,255,255,0.03)' }}>
            <Shield size={14} className="mt-0.5 shrink-0" style={{ color: colors.textSecondary }} />
            <p className="text-[11px] leading-relaxed" style={{ color: colors.textSecondary }}>
              Requires Chrome, Edge, Firefox, or Safari 16.4+. Try a supported browser.
            </p>
          </div>
        )}

        {/* Permission denied steps */}
        {isSupported && permission === 'denied' && (
          <div className="p-3 rounded-xl space-y-2 mt-1" style={{ background: 'rgba(239,68,68,0.05)' }}>
            <p className="text-[11px] font-medium" style={{ color: '#fca5a5' }}>To unblock notifications:</p>
            <div className="space-y-1">
              {['Click the lock icon in your address bar', 'Set "Notifications" to Allow', 'Refresh this page'].map((step, i) => (
                <div key={i} className="flex items-center gap-2">
                  <span className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-bold shrink-0"
                    style={{ background: 'rgba(239,68,68,0.12)', color: '#fca5a5' }}>{i + 1}</span>
                  <span className="text-[11px]" style={{ color: colors.textSecondary }}>{step}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enable / Disable + Test */}
        {isSupported && permission !== 'denied' && (
          <div className="flex items-center gap-2 mt-1">
            {/* Main action button */}
            <motion.button
              onClick={isSubscribed ? onDisable : onEnable}
              disabled={loading}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2"
              style={{
                background: isSubscribed ? 'rgba(255,255,255,0.04)' : gradients.primary,
                color: isSubscribed ? colors.textSecondary : 'white',
                border: isSubscribed ? '1px solid rgba(255,255,255,0.08)' : 'none',
              }}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : isSubscribed ? (
                <X className="w-4 h-4" />
              ) : (
                <BellRing className="w-4 h-4" />
              )}
              <span>{loading ? (isSubscribed ? 'Disabling...' : 'Enabling...') : isSubscribed ? 'Disable' : 'Enable'}</span>
            </motion.button>

            {/* Test button (when subscribed) */}
            {isSubscribed && (
              <motion.button
                onClick={handleTestPush}
                disabled={testing}
                className="px-4 py-2.5 rounded-xl text-sm font-medium flex items-center gap-2 shrink-0"
                style={{
                  background: 'rgba(59,130,246,0.08)',
                  color: '#60a5fa',
                  border: '1px solid rgba(59,130,246,0.1)',
                }}
                whileHover={{ scale: 1.01 }}
                whileTap={{ scale: 0.98 }}
              >
                {testing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                <span>Test</span>
              </motion.button>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}

export default PushNotificationPrompt;
