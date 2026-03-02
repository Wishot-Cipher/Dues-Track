import { motion } from 'framer-motion';
import { RefreshCw } from 'lucide-react';
import { colors } from '@/config/colors';

interface PullToRefreshIndicatorProps {
  pullDistance: number;
  isRefreshing: boolean;
  isReady: boolean;
  threshold?: number;
}

export default function PullToRefreshIndicator({
  pullDistance,
  isRefreshing,
  isReady,
  threshold = 80,
}: PullToRefreshIndicatorProps) {
  if (pullDistance <= 0 && !isRefreshing) return null;

  const progress = Math.min(pullDistance / threshold, 1);
  const opacity = Math.min(progress * 1.2, 1);
  const rotation = progress * 180;

  return (
    <motion.div
      className="flex justify-center items-center pointer-events-none"
      style={{
        height: isRefreshing ? 50 : pullDistance * 0.6,
        opacity: isRefreshing ? 1 : opacity,
        overflow: 'hidden',
      }}
      animate={isRefreshing ? { height: 50 } : {}}
      transition={{ duration: 0.2 }}
    >
      <motion.div
        className="w-10 h-10 rounded-full flex items-center justify-center"
        style={{
          background: isReady || isRefreshing
            ? `${colors.primary}25`
            : 'rgba(255, 255, 255, 0.08)',
          border: `2px solid ${isReady || isRefreshing ? colors.primary : 'rgba(255, 255, 255, 0.15)'}`,
          transform: isRefreshing ? undefined : `rotate(${rotation}deg)`,
        }}
        animate={isRefreshing ? { rotate: 360 } : {}}
        transition={isRefreshing ? { duration: 0.8, repeat: Infinity, ease: 'linear' } : {}}
      >
        <RefreshCw
          className="w-5 h-5"
          style={{
            color: isReady || isRefreshing ? colors.primary : colors.textSecondary,
          }}
        />
      </motion.div>
    </motion.div>
  );
}
