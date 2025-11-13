import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff, Wifi } from 'lucide-react';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { colors } from '@/config/colors';

export default function OfflineIndicator() {
  const isOnline = useOnlineStatus();
  const [showOnlineNotification, setShowOnlineNotification] = useState(false);
  const [wasOffline, setWasOffline] = useState(false);

  useEffect(() => {
    if (!isOnline) {
      setWasOffline(true);
    } else if (wasOffline) {
      // Show "back online" notification briefly
      setShowOnlineNotification(true);
      const timer = setTimeout(() => {
        setShowOnlineNotification(false);
        setWasOffline(false);
      }, 3000); // Show for 3 seconds

      return () => clearTimeout(timer);
    }
  }, [isOnline, wasOffline]);

  return (
    <AnimatePresence>
      {!isOnline && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          className="fixed top-0 left-0 right-0 z-50 px-4 py-3 text-center text-white font-medium shadow-lg"
          style={{ 
            background: 'linear-gradient(135deg, #ef4444 0%, #dc2626 100%)',
            backdropFilter: 'blur(10px)'
          }}
        >
          <div className="flex items-center justify-center gap-2">
            <WifiOff className="w-5 h-5 animate-pulse" />
            <span>You're offline. Some features may be limited.</span>
          </div>
        </motion.div>
      )}
      
      {/* Show brief "Back Online" notification */}
      {showOnlineNotification && (
        <motion.div
          initial={{ y: -100, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -100, opacity: 0 }}
          transition={{ duration: 0.3 }}
          className="fixed top-0 left-0 right-0 z-50 px-4 py-3 text-center text-white font-medium shadow-lg"
          style={{ 
            background: `linear-gradient(135deg, ${colors.statusPaid} 0%, #059669 100%)`,
            backdropFilter: 'blur(10px)'
          }}
        >
          <motion.div
            initial={{ scale: 0.9 }}
            animate={{ scale: 1 }}
            className="flex items-center justify-center gap-2"
          >
            <Wifi className="w-5 h-5" />
            <span>Back online!</span>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
