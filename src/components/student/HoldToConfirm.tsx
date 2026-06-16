/**
 * HoldToConfirm — hold-to-submit confirmation button.
 *
 * Design decisions in this version:
 *  - No percentage counter mid-hold — it reads as a loading bar
 *    and breaks the "hold" mental model. Replaced with a smooth
 *    fill sweep that communicates progress purely visually.
 *  - Label stays constant while holding — "Hold to confirm" does
 *    not change to "47%" which felt like a broken UI. Only changes
 *    on completion: "Hold to confirm" → "Confirmed".
 *  - Subtle pulse on the icon while holding gives tactile feedback
 *    without being distracting.
 *  - Fill uses a softer gradient rather than flat color — feels
 *    more premium and less like a loading bar.
 *  - Border transitions from faint to full color as fill progresses.
 *  - Released state drains with a spring — feels like releasing
 *    physical pressure, not a digital jump.
 *  - Complete state holds for 800ms then resets cleanly.
 *  - Touch and mouse both supported with proper event handling.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { ShieldCheck, CheckCircle2, Loader2, Lock } from 'lucide-react';

interface Props {
  onConfirm:     () => void;
  loading?:      boolean;
  disabled?:     boolean;
  holdDuration?: number;   // ms to hold before confirming, default 1600
  label?:        string;   // idle label
  doneLabel?:    string;   // shown briefly after confirm
  loadingLabel?: string;   // shown while loading prop is true
  color?:        string;
  className?:    string;
  size?:         'sm' | 'md' | 'lg';
}

const SIZES = {
  sm: { height: 44, text: 'text-xs',  iconSize: 14, px: 'px-4' },
  md: { height: 52, text: 'text-sm',  iconSize: 16, px: 'px-5' },
  lg: { height: 58, text: 'text-base',iconSize: 18, px: 'px-6' },
};

export default function HoldToConfirm({
  onConfirm,
  loading      = false,
  disabled     = false,
  holdDuration = 1600,
  label        = 'Hold to confirm',
  doneLabel    = 'Confirmed',
  loadingLabel = 'Processing…',
  color        = '#FF6803',
  className    = '',
  size         = 'md',
}: Props) {
  const sz = SIZES[size];

  const [phase, setPhase]   = useState<'idle' | 'holding' | 'done'>('idle');
  const phaseRef            = useRef<'idle' | 'holding' | 'done'>('idle');
  const startRef            = useRef<number | null>(null);
  const rafRef              = useRef<number | null>(null);
  const firedRef            = useRef(false);

  // Spring-driven fill 0→100. On release, spring drains naturally.
  const rawFill  = useSpring(0, { stiffness: 220, damping: 26 });
  const fillPct  = useTransform(rawFill, [0, 100], ['0%', '100%']);
  // Border opacity tracks fill — starts faint, reaches full at completion
  // const borderOp = useTransform(rawFill, [0, 100], [0.25, 0.85]);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const stopRaf = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
  }, []);

  const drain = useCallback(() => {
    if (phaseRef.current !== 'holding') return;
    stopRaf();
    startRef.current = null;
    setPhase('idle');
    rawFill.set(0);
  }, [stopRaf, rawFill]);

  const tick = useCallback(() => {
    if (!startRef.current) return;
    const elapsed  = Date.now() - startRef.current;
    const progress = Math.min((elapsed / holdDuration) * 100, 100);
    rawFill.set(progress);

    if (progress >= 100 && !firedRef.current) {
      firedRef.current = true;
      stopRaf();
      setPhase('done');
      rawFill.set(100);
      if (navigator.vibrate) navigator.vibrate(50);
      onConfirm();
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
  }, [holdDuration, onConfirm, stopRaf, rawFill]);

  const startHold = useCallback(() => {
    if (disabled || loading || phaseRef.current === 'done') return;
    firedRef.current  = false;
    startRef.current  = Date.now();
    setPhase('holding');
    rawFill.set(0);
    rafRef.current = requestAnimationFrame(tick);
  }, [disabled, loading, rawFill, tick]);

  // Cleanup on unmount
  useEffect(() => () => stopRaf(), [stopRaf]);

  // After loading resolves, reset cleanly after a short delay
  useEffect(() => {
    if (!loading && phase === 'done') {
      const t = setTimeout(() => {
        setPhase('idle');
        rawFill.set(0);
        firedRef.current = false;
      }, 900);
      return () => clearTimeout(t);
    }
  }, [loading, phase, rawFill]);

  const isDisabled = disabled || loading;
  const isHolding  = phase === 'holding';
  const isDone     = phase === 'done';

  // ── Derived label ─────────────────────────────────────────────
  const currentLabel = loading
    ? loadingLabel
    : isDone
    ? doneLabel
    : label;

  // ── Icon ──────────────────────────────────────────────────────
  const Icon = () => {
    if (loading) {
      return (
        <Loader2
          width={sz.iconSize}
          height={sz.iconSize}
          className="animate-spin"
          style={{ color }}
        />
      );
    }
    if (isDone) {
      return (
        <motion.div
          initial={{ scale: 0, rotate: -30 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 400, damping: 18 }}
        >
          <CheckCircle2
            width={sz.iconSize}
            height={sz.iconSize}
            style={{ color }}
          />
        </motion.div>
      );
    }
    if (isHolding) {
      return (
        <motion.div
          animate={{ scale: [1, 1.18, 1] }}
          transition={{ duration: 0.55, repeat: Infinity, ease: 'easeInOut' }}
        >
          <ShieldCheck
            width={sz.iconSize}
            height={sz.iconSize}
            style={{ color }}
          />
        </motion.div>
      );
    }
    return (
      <Lock
        width={sz.iconSize}
        height={sz.iconSize}
        style={{ color: `${color}99` }}
      />
    );
  };

  return (
    <motion.button
      type="button"
      disabled={isDisabled && !isDone}
      className={`relative overflow-hidden rounded-xl select-none touch-none w-full ${sz.px} ${className}`}
      style={{
        height:                   sz.height,
        background:               isDone
                                    ? `${color}1a`
                                    : isHolding
                                    ? `${color}10`
                                    : `${color}0c`,
        border:                   `1.5px solid ${color}`,
        borderColor:              color,
        opacity:                  disabled && !loading ? 0.4 : 1,
        cursor:                   isDisabled ? 'not-allowed' : 'pointer',
        WebkitUserSelect:         'none',
        WebkitTapHighlightColor:  'transparent',
        // Subtle border opacity animation handled inline via motion
      }}
      onMouseDown={startHold}
      onMouseUp={drain}
      onMouseLeave={drain}
      onTouchStart={(e) => { e.preventDefault(); startHold(); }}
      onTouchEnd={drain}
      onTouchCancel={drain}
      // Gentle press scale — not too much, just enough to feel physical
      whileTap={!isDisabled ? { scale: 0.985 } : undefined}
      animate={{
        borderColor: isDone
          ? color
          : isHolding
          ? color
          : `${color}44`,
      }}
      transition={{ duration: 0.2 }}
    >
      {/* ── Fill sweep ───────────────────────────────────────── */}
      {/* Gradient rather than flat — more premium, less loading-bar */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          width:           fillPct,
          transformOrigin: 'left center',
          background:      `linear-gradient(90deg, ${color}2a 0%, ${color}18 100%)`,
          borderRadius:    'inherit',
        }}
      />

      {/* ── Shimmer while holding ─────────────────────────────── */}
      {isHolding && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `linear-gradient(105deg, transparent 30%, ${color}14 50%, transparent 70%)`,
            borderRadius: 'inherit',
          }}
          animate={{ x: ['-100%', '200%'] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'linear' }}
        />
      )}

      {/* ── Content ───────────────────────────────────────────── */}
      <div className="relative h-full flex items-center justify-center gap-2.5">
        {/* Icon slot — fixed width so label never shifts */}
        <span className="shrink-0 flex items-center justify-center" style={{ width: sz.iconSize + 4 }}>
          <Icon />
        </span>

        {/* Label — transitions only on phase change, stays still while holding */}
        <AnimatePresence mode="wait">
          <motion.span
            key={loading ? 'loading' : isDone ? 'done' : 'idle'}
            className={`${sz.text} font-bold tracking-wide`}
            style={{ color: isDone ? color : isHolding ? color : `${color}cc` }}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.16 }}
          >
            {currentLabel}
          </motion.span>
        </AnimatePresence>

        {/* Right side: thin arc progress indicator while holding */}
        <AnimatePresence>
          {isHolding && (
            <motion.div
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
              transition={{ duration: 0.15 }}
              className="shrink-0"
            >
              <ArcProgress
                size={sz.iconSize + 2}
                progress={rawFill}
                color={color}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* ── Completion flash ──────────────────────────────────── */}
      <AnimatePresence>
        {isDone && (
          <motion.div
            className="absolute inset-0 pointer-events-none rounded-xl"
            style={{ background: `${color}18` }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            transition={{ duration: 0.5, times: [0, 0.2, 1] }}
          />
        )}
      </AnimatePresence>
    </motion.button>
  );
}

// ── Arc progress ring ──────────────────────────────────────────────
// Small SVG arc that shows progress while holding.
// Separate component so it can use useTransform cleanly.
import { useTransform as useT } from 'framer-motion';

function ArcProgress({
  size,
  progress,
  color,
}: {
  size:     number;
  progress: ReturnType<typeof useSpring>;
  color:    string;
}) {
  const r          = (size - 2.5) / 2;
  const circumference = 2 * Math.PI * r;
  const dashOffset = useT(progress, [0, 100], [circumference, 0]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      style={{ overflow: 'visible' }}
    >
      {/* Track */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={`${color}25`}
        strokeWidth={2}
      />
      {/* Fill arc */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={r}
        fill="none"
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeDasharray={circumference}
        style={{
          strokeDashoffset: dashOffset,
          rotate:           '-90deg',
          transformOrigin: `${size / 2}px ${size / 2}px`,
        }}
      />
    </svg>
  );
}