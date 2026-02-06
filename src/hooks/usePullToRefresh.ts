import { useState, useRef, useCallback, useEffect } from 'react';
import haptics from '@/lib/haptics';

interface UsePullToRefreshOptions {
  onRefresh: () => Promise<void>;
  threshold?: number;
  maxPull?: number;
}

export default function usePullToRefresh({
  onRefresh,
  threshold = 80,
  maxPull = 130,
}: UsePullToRefreshOptions) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const startY = useRef(0);
  const isPulling = useRef(false);
  const hasTriggeredHaptic = useRef(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const handleTouchStart = useCallback((e: TouchEvent) => {
    // Only activate when scrolled to top
    if (window.scrollY > 5 || isRefreshing) return;
    startY.current = e.touches[0].clientY;
    isPulling.current = true;
    hasTriggeredHaptic.current = false;
  }, [isRefreshing]);

  const handleTouchMove = useCallback((e: TouchEvent) => {
    if (!isPulling.current || isRefreshing) return;
    
    const currentY = e.touches[0].clientY;
    const diff = currentY - startY.current;
    
    if (diff < 0) {
      isPulling.current = false;
      setPullDistance(0);
      return;
    }

    // Apply resistance — gets harder to pull the further you go
    const resistance = Math.min(diff * 0.5, maxPull);
    setPullDistance(resistance);

    // Haptic feedback when crossing threshold
    if (resistance >= threshold && !hasTriggeredHaptic.current) {
      haptics.medium();
      hasTriggeredHaptic.current = true;
    } else if (resistance < threshold) {
      hasTriggeredHaptic.current = false;
    }

    // Prevent default scroll if pulling down
    if (diff > 10 && window.scrollY <= 0) {
      e.preventDefault();
    }
  }, [isRefreshing, maxPull, threshold]);

  const handleTouchEnd = useCallback(async () => {
    if (!isPulling.current) return;
    isPulling.current = false;

    if (pullDistance >= threshold && !isRefreshing) {
      setIsRefreshing(true);
      haptics.success();
      try {
        await onRefresh();
      } finally {
        setIsRefreshing(false);
        setPullDistance(0);
      }
    } else {
      setPullDistance(0);
    }
  }, [pullDistance, threshold, isRefreshing, onRefresh]);

  useEffect(() => {
    const container = containerRef.current || document;
    
    container.addEventListener('touchstart', handleTouchStart as EventListener, { passive: true });
    container.addEventListener('touchmove', handleTouchMove as EventListener, { passive: false });
    container.addEventListener('touchend', handleTouchEnd as EventListener, { passive: true });

    return () => {
      container.removeEventListener('touchstart', handleTouchStart as EventListener);
      container.removeEventListener('touchmove', handleTouchMove as EventListener);
      container.removeEventListener('touchend', handleTouchEnd as EventListener);
    };
  }, [handleTouchStart, handleTouchMove, handleTouchEnd]);

  const isReady = pullDistance >= threshold;

  return {
    pullDistance,
    isRefreshing,
    isReady,
    containerRef,
  };
}
