/**
 * HoldToConfirm
 *
 * A press-and-hold button that requires the user to hold for `holdDuration`ms
 * before firing `onConfirm`. Prevents accidental payment submissions.
 *
 * Features:
 * - SVG ring fills as the user holds
 * - Haptic feedback via Vibration API (mobile)
 * - Cancel animation on release before completion
 * - Disabled state support
 * - Loading state after confirm fires
 *
 * Usage:
 *   <HoldToConfirm
 *     onConfirm={handleSubmit}
 *     loading={submitting}
 *     holdDuration={1500}
 *     label="Hold to Submit Payment"
 *     confirmLabel="Submitting…"
 *   />
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Lock } from 'lucide-react';

interface Props {
  onConfirm: () => void;
  loading?: boolean;
  disabled?: boolean;
  holdDuration?: number;
  label?: string;
  confirmLabel?: string;
  color?: string;
  className?: string;
}

const DEFAULT_COLOR = '#FF6803';
const RADIUS = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

export default function HoldToConfirm({
  onConfirm,
  loading = false,
  disabled = false,
  holdDuration = 1500,
  label = 'Hold to Confirm',
  confirmLabel = 'Processing…',
  color = DEFAULT_COLOR,
  className = '',
}: Props) {
  const [progress, setProgress] = useState(0);       // 0–1
  const [holding, setHolding]   = useState(false);
  const [complete, setComplete] = useState(false);

  const startTimeRef  = useRef<number | null>(null);
  const rafRef        = useRef<number | null>(null);
  const confirmedRef  = useRef(false);

  const cancelHold = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    startTimeRef.current = null;
    setHolding(false);
    setProgress(0);
  }, []);

  const tick = useCallback(() => {
    if (!startTimeRef.current) return;
    const elapsed = Date.now() - startTimeRef.current;
    const p = Math.min(elapsed / holdDuration, 1);
    setProgress(p);

    if (p >= 1 && !confirmedRef.current) {
      confirmedRef.current = true;
      setComplete(true);
      setHolding(false);
      // Haptic burst
      if (navigator.vibrate) navigator.vibrate([30, 10, 50]);
      onConfirm();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [holdDuration, onConfirm]);

  const startHold = useCallback(() => {
    if (disabled || loading || complete) return;
    confirmedRef.current = false;
    startTimeRef.current = Date.now();
    setHolding(true);
    // Initial haptic pulse
    if (navigator.vibrate) navigator.vibrate(10);
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, loading, complete, tick]);

  // Clean up on unmount
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); }, []);

  // Reset after loading finishes
  useEffect(() => {
    if (!loading && complete) {
      const t = setTimeout(() => { setComplete(false); setProgress(0); confirmedRef.current = false; }, 1200);
      return () => clearTimeout(t);
    }
  }, [loading, complete]);

  const isDisabled = disabled || loading;
  const strokeDashoffset = CIRCUMFERENCE * (1 - progress);
  const btnSize = 56;   // circle button size px

  return (
    <div className={`flex flex-col items-center gap-3 ${className}`}>
      {/* Instruction text */}
      <AnimatePresence mode="wait">
        <motion.p
          key={holding ? 'holding' : complete ? 'done' : 'idle'}
          className="text-xs font-semibold uppercase tracking-widest"
          style={{ color: `${color}90` }}
          initial={{ opacity: 0, y: -4 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 4 }}
          transition={{ duration: 0.18 }}
        >
          {holding ? 'Keep holding…' : complete ? 'Confirmed!' : 'Press & hold to submit'}
        </motion.p>
      </AnimatePresence>

      <div className="flex items-center gap-4 w-full">
        {/* Hold button with ring */}
        <div className="relative shrink-0" style={{ width: btnSize + 16, height: btnSize + 16 }}>
          {/* SVG ring */}
          <svg
            className="absolute inset-0"
            width={btnSize + 16}
            height={btnSize + 16}
            viewBox={`0 0 ${btnSize + 16} ${btnSize + 16}`}
          >
            {/* Track */}
            <circle
              cx={(btnSize + 16) / 2}
              cy={(btnSize + 16) / 2}
              r={RADIUS + 4}
              fill="none"
              stroke={`${color}20`}
              strokeWidth="3"
            />
            {/* Progress arc */}
            <motion.circle
              cx={(btnSize + 16) / 2}
              cy={(btnSize + 16) / 2}
              r={RADIUS + 4}
              fill="none"
              stroke={color}
              strokeWidth="3"
              strokeLinecap="round"
              strokeDasharray={CIRCUMFERENCE}
              strokeDashoffset={strokeDashoffset}
              style={{ rotate: '-90deg', transformOrigin: '50% 50%' }}
              animate={{
                filter: holding ? [`drop-shadow(0 0 4px ${color}80)`, `drop-shadow(0 0 8px ${color}cc)`, `drop-shadow(0 0 4px ${color}80)`] : `drop-shadow(0 0 0px transparent)`,
              }}
              transition={{ duration: 0.9, repeat: holding ? Infinity : 0 }}
            />
          </svg>

          {/* Button */}
          <motion.button
            type="button"
            disabled={isDisabled}
            className="absolute inset-2 rounded-full flex items-center justify-center select-none"
            style={{
              background: complete
                ? `linear-gradient(135deg, #22C55E, #16A34A)`
                : holding
                ? `linear-gradient(135deg, ${color}, #FF9040)`
                : `linear-gradient(135deg, ${color}cc, ${color})`,
              boxShadow: holding
                ? `0 0 20px ${color}60, 0 8px 24px rgba(0,0,0,0.4)`
                : `0 4px 16px ${color}30`,
              cursor: isDisabled ? 'not-allowed' : 'pointer',
              opacity: isDisabled && !loading ? 0.45 : 1,
            }}
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={(e) => { e.preventDefault(); startHold(); }}
            onTouchEnd={cancelHold}
            onTouchCancel={cancelHold}
            animate={holding ? { scale: [1, 0.94, 0.94] } : complete ? { scale: [0.94, 1.08, 1] } : { scale: 1 }}
            transition={{ duration: 0.2 }}
          >
            {loading ? (
              <motion.div
                className="w-5 h-5 border-2 rounded-full"
                style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
              />
            ) : complete ? (
              <motion.svg
                viewBox="0 0 24 24"
                className="w-6 h-6"
                fill="none"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                initial={{ pathLength: 0 }}
                animate={{ pathLength: 1 }}
                transition={{ duration: 0.4 }}
              >
                <motion.path d="M5 13l4 4L19 7" />
              </motion.svg>
            ) : (
              <Lock className="w-5 h-5 text-white" />
            )}
          </motion.button>
        </div>

        {/* Text button area — full width, shows progress */}
        <motion.div
          className="flex-1 relative overflow-hidden rounded-2xl py-4 px-5 cursor-pointer select-none"
          style={{
            background: `${color}10`,
            border: `1px solid ${complete ? '#22C55E50' : `${color}30`}`,
          }}
          onMouseDown={startHold}
          onMouseUp={cancelHold}
          onMouseLeave={cancelHold}
          onTouchStart={(e) => { e.preventDefault(); startHold(); }}
          onTouchEnd={cancelHold}
          onTouchCancel={cancelHold}
        >
          {/* Fill bar */}
          <motion.div
            className="absolute inset-0 origin-left"
            style={{
              background: complete
                ? 'linear-gradient(90deg,#22C55E30,#16A34A20)'
                : `linear-gradient(90deg,${color}25,${color}10)`,
              scaleX: progress,
              transformOrigin: 'left',
            }}
          />

          <div className="relative flex items-center justify-between">
            <div>
              <p className="text-sm font-bold text-white">
                {loading ? confirmLabel : complete ? 'Payment Submitted!' : label}
              </p>
              {!loading && !complete && (
                <p className="text-[10px] mt-0.5" style={{ color: `${color}80` }}>
                  {holding
                    ? `${Math.round(progress * 100)}% — release to cancel`
                    : 'Press the lock icon or here to begin'}
                </p>
              )}
            </div>
            {!loading && !complete && (
              <motion.div
                animate={holding ? { rotate: [0, 360] } : { rotate: 0 }}
                transition={{ duration: holdDuration / 1000, ease: 'linear', repeat: 0 }}
              >
                <Sparkles className="w-4 h-4" style={{ color: holding ? color : `${color}60` }} />
              </motion.div>
            )}
          </div>
        </motion.div>
      </div>

      {/* Progress label */}
      {holding && (
        <motion.div
          className="w-full h-1 rounded-full overflow-hidden"
          style={{ background: `${color}15` }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div
            className="h-full rounded-full"
            style={{ background: `linear-gradient(90deg, ${color}, #FF9040)`, width: `${progress * 100}%` }}
          />
        </motion.div>
      )}
    </div>
  );
}