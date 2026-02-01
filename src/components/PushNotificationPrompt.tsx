import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bell, BellRing, BellOff, Smartphone, Check, X, Loader2, Info } from 'lucide-react';
import { colors, gradients } from '@/config/colors';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/useToast';
import pushNotificationService from '@/services/pushNotificationService';

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

  // Check if prompt was recently dismissed
  useEffect(() => {
    const dismissedAt = localStorage.getItem('push_prompt_dismissed');
    if (dismissedAt) {
      const daysSinceDismissed = (Date.now() - parseInt(dismissedAt)) / (1000 * 60 * 60 * 24);
      if (daysSinceDismissed < 7) {
        setDismissed(true);
      }
    }
  }, []);

  // Don't show if not supported, already subscribed, permission denied, or dismissed
  if (!isSupported || isSubscribed || permission === 'denied' || dismissed) {
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
    return null;
  }

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

  if (!isSupported) {
    return (
      <div 
        className="p-4 rounded-xl"
        style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}
      >
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255, 255, 255, 0.05)' }}
          >
            <BellOff className="w-5 h-5" style={{ color: colors.textSecondary }} />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Push Notifications</p>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              Not supported in this browser
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (permission === 'denied') {
    return (
      <div 
        className="p-4 rounded-xl"
        style={{ background: `${colors.statusUnpaid}08`, border: `1px solid ${colors.statusUnpaid}20` }}
      >
        <div className="flex items-start gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: `${colors.statusUnpaid}20` }}
          >
            <BellOff className="w-5 h-5" style={{ color: colors.statusUnpaid }} />
          </div>
          <div>
            <p className="text-sm font-medium text-white">Push Notifications Blocked</p>
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
              Notifications are blocked in your browser settings. To enable them:
            </p>
            <ol className="text-xs mt-2 space-y-1" style={{ color: colors.textSecondary }}>
              <li>1. Click the lock/info icon in your browser's address bar</li>
              <li>2. Find "Notifications" and set it to "Allow"</li>
              <li>3. Refresh this page</li>
            </ol>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div 
      className="p-4 rounded-xl"
      style={{ 
        background: isSubscribed ? `${colors.accentMint}08` : 'rgba(255, 255, 255, 0.03)', 
        border: `1px solid ${isSubscribed ? colors.accentMint + '20' : 'rgba(255, 255, 255, 0.1)'}` 
      }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div 
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: isSubscribed ? `${colors.accentMint}20` : `${colors.primary}20` }}
          >
            {isSubscribed ? (
              <BellRing className="w-5 h-5" style={{ color: colors.accentMint }} />
            ) : (
              <Bell className="w-5 h-5" style={{ color: colors.primary }} />
            )}
          </div>
          <div>
            <p className="text-sm font-medium text-white">Push Notifications</p>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              {isSubscribed ? 'Enabled - You\'ll receive alerts' : 'Get notified when app is closed'}
            </p>
          </div>
        </div>
        <motion.button
          onClick={isSubscribed ? onDisable : onEnable}
          disabled={loading}
          className="px-4 py-2 rounded-xl text-sm font-semibold flex items-center gap-2"
          style={{
            background: isSubscribed ? 'rgba(255, 255, 255, 0.05)' : gradients.primary,
            color: isSubscribed ? colors.textSecondary : 'white',
          }}
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
        >
          {loading ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : isSubscribed ? (
            <>
              <Check className="w-4 h-4" style={{ color: colors.accentMint }} />
              Enabled
            </>
          ) : (
            'Enable'
          )}
        </motion.button>
      </div>
      
      {!isSubscribed && (
        <div 
          className="mt-3 p-3 rounded-lg flex items-start gap-2"
          style={{ background: 'rgba(255, 255, 255, 0.03)' }}
        >
          <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: colors.accentBlue }} />
          <p className="text-xs" style={{ color: colors.textSecondary }}>
            Receive instant push notifications when your payments are approved, rejected, or waived - even when the app is closed!
          </p>
        </div>
      )}

      {isSubscribed && (
        <div className="mt-3 flex items-center justify-between">
          <p className="text-xs" style={{ color: colors.textSecondary }}>
            Test if notifications work on your device
          </p>
          <motion.button
            onClick={handleTestPush}
            disabled={testing}
            className="px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5"
            style={{ 
              background: `${colors.accentBlue}20`, 
              color: colors.accentBlue,
              border: `1px solid ${colors.accentBlue}30`
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            {testing ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Bell className="w-3 h-3" />
            )}
            Test
          </motion.button>
        </div>
      )}
    </div>
  );
}

export default PushNotificationPrompt;
