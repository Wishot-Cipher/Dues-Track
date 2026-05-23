/**
 * DeadlineCountdown
 *
 * A live-ticking countdown timer for payment deadlines.
 * Shows days / hours / minutes / seconds with urgency state transitions:
 *   > 48h  → calm (amber/neutral)
 *   1–48h  → warning (amber, pulsing)
 *   < 1h   → critical (red, rapid pulse)
 *   passed → overdue (danger, shows days overdue)
 *
 * Drop-in usage:
 *   <DeadlineCountdown deadline={paymentType.deadline} />
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Clock, AlertTriangle, Flame } from 'lucide-react';

interface Props {
  deadline: string | null | undefined;
  /** Optional: show a compact inline version */
  compact?: boolean;
  className?: string;
}

interface TimeLeft {
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
  totalSeconds: number;
  overdue: boolean;
  daysOverdue: number;
}

type UrgencyLevel = 'safe' | 'warning' | 'critical' | 'overdue';

function calcTimeLeft(deadline: string): TimeLeft {
  const diff = new Date(deadline).getTime() - Date.now();

  if (diff <= 0) {
    const overdueSec = Math.abs(diff) / 1000;
    return {
      days: 0, hours: 0, minutes: 0, seconds: 0,
      totalSeconds: 0,
      overdue: true,
      daysOverdue: Math.floor(overdueSec / 86400),
    };
  }

  const totalSeconds = Math.floor(diff / 1000);
  return {
    days:    Math.floor(totalSeconds / 86400),
    hours:   Math.floor((totalSeconds % 86400) / 3600),
    minutes: Math.floor((totalSeconds % 3600) / 60),
    seconds: totalSeconds % 60,
    totalSeconds,
    overdue: false,
    daysOverdue: 0,
  };
}

function getUrgency(t: TimeLeft): UrgencyLevel {
  if (t.overdue)              return 'overdue';
  if (t.totalSeconds < 3600)  return 'critical';   // < 1 hour
  if (t.totalSeconds < 172800) return 'warning';   // < 48 hours
  return 'safe';
}

const URGENCY_STYLES: Record<UrgencyLevel, {
  color: string; bg: string; border: string; icon: typeof Clock; label: string;
}> = {
  safe: {
    color:  '#F59E0B',
    bg:     'rgba(245,158,11,0.07)',
    border: 'rgba(245,158,11,0.22)',
    icon:   Clock,
    label:  'Payment Due',
  },
  warning: {
    color:  '#F97316',
    bg:     'rgba(249,115,22,0.09)',
    border: 'rgba(249,115,22,0.28)',
    icon:   AlertTriangle,
    label:  'Deadline Approaching',
  },
  critical: {
    color:  '#EF4444',
    bg:     'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.35)',
    icon:   Flame,
    label:  'Due Very Soon!',
  },
  overdue: {
    color:  '#EF4444',
    bg:     'rgba(239,68,68,0.1)',
    border: 'rgba(239,68,68,0.35)',
    icon:   AlertTriangle,
    label:  'Overdue',
  },
};

// Individual flip-card digit
function Digit({ value, color }: { value: string; color: string }) {
  const prev = useRef(value);
  const changed = prev.current !== value;
  useEffect(() => { prev.current = value; }, [value]);

  return (
    <div className="relative overflow-hidden" style={{ width: 28, height: 36 }}>
      <AnimatePresence mode="popLayout" initial={false}>
        <motion.span
          key={value}
          className="absolute inset-0 flex items-center justify-center font-mono font-black text-xl tabular-nums"
          style={{ color }}
          initial={changed ? { y: -20, opacity: 0 } : false}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 20, opacity: 0 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
        >
          {value}
        </motion.span>
      </AnimatePresence>
    </div>
  );
}

// Unit block: two digits + label
function UnitBlock({
  value,
  label,
  color,
  bg,
}: {
  value: number;
  label: string;
  color: string;
  bg: string;
}) {
  const str = String(value).padStart(2, '0');

  return (
    <div className="flex flex-col items-center gap-1.5">
      <div
        className="flex items-center gap-0.5 rounded-xl px-2.5 py-2"
        style={{ background: bg, border: `1px solid ${color}30` }}
      >
        <Digit value={str[0]} color={color} />
        <Digit value={str[1]} color={color} />
      </div>
      <span
        className="text-[9px] font-bold uppercase tracking-[0.2em]"
        style={{ color: `${color}80` }}
      >
        {label}
      </span>
    </div>
  );
}

export default function DeadlineCountdown({ deadline, compact = false, className = '' }: Props) {
  const [timeLeft, setTimeLeft] = useState<TimeLeft | null>(
    deadline ? calcTimeLeft(deadline) : null
  );

  useEffect(() => {
    if (!deadline) return;
    setTimeLeft(calcTimeLeft(deadline));
    const id = setInterval(() => setTimeLeft(calcTimeLeft(deadline)), 1000);
    return () => clearInterval(id);
  }, [deadline]);

  if (!deadline || !timeLeft) return null;

  const urgency   = getUrgency(timeLeft);
  const style     = URGENCY_STYLES[urgency];
  const IconComp  = style.icon;
  const isPulsing = urgency === 'warning' || urgency === 'critical' || urgency === 'overdue';

  // ── Compact mode: one-liner ───────────────────────────────────────────────
  if (compact) {
    return (
      <motion.span
        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${className}`}
        style={{ background: style.bg, color: style.color, border: `1px solid ${style.border}` }}
        animate={isPulsing ? { opacity: [1, 0.7, 1] } : {}}
        transition={{ duration: 1.8, repeat: Infinity }}
      >
        <IconComp className="w-3 h-3" />
        {timeLeft.overdue
          ? `${timeLeft.daysOverdue}d overdue`
          : timeLeft.days > 0
            ? `${timeLeft.days}d ${timeLeft.hours}h left`
            : `${timeLeft.hours}h ${timeLeft.minutes}m left`}
      </motion.span>
    );
  }

  // ── Full countdown ────────────────────────────────────────────────────────
  return (
    <motion.div
      className={`rounded-2xl overflow-hidden ${className}`}
      style={{ background: style.bg, border: `1px solid ${style.border}` }}
      animate={urgency === 'critical' ? { boxShadow: [`0 0 0px ${style.color}00`, `0 0 18px ${style.color}40`, `0 0 0px ${style.color}00`] } : {}}
      transition={{ duration: 1.4, repeat: Infinity }}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ borderBottom: `1px solid ${style.border}` }}
      >
        <div className="flex items-center gap-2">
          <motion.div
            animate={isPulsing ? { scale: [1, 1.2, 1] } : {}}
            transition={{ duration: 1.2, repeat: Infinity }}
          >
            <IconComp className="w-4 h-4" style={{ color: style.color }} />
          </motion.div>
          <span className="text-xs font-bold uppercase tracking-widest" style={{ color: style.color }}>
            {style.label}
          </span>
        </div>
        <span className="text-[10px] font-mono" style={{ color: `${style.color}70` }}>
          {new Date(deadline).toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' })}
        </span>
      </div>

      {/* Digits */}
      <div className="px-4 py-3">
        {timeLeft.overdue ? (
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-6 h-6 shrink-0" style={{ color: style.color }} />
            <div>
              <p className="font-bold text-white text-sm">
                {timeLeft.daysOverdue === 0
                  ? 'Deadline passed today'
                  : `${timeLeft.daysOverdue} day${timeLeft.daysOverdue > 1 ? 's' : ''} overdue`}
              </p>
              <p className="text-xs mt-0.5" style={{ color: `${style.color}90` }}>
                Late fees may apply. Submit payment now.
              </p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-3">
            {timeLeft.days > 0 && (
              <>
                <UnitBlock value={timeLeft.days}    label="days"  color={style.color} bg={`${style.color}12`} />
                <span className="text-lg font-black pb-4 opacity-40" style={{ color: style.color }}>:</span>
              </>
            )}
            <UnitBlock value={timeLeft.hours}   label="hrs"   color={style.color} bg={`${style.color}12`} />
            <span className="text-lg font-black pb-4 opacity-40" style={{ color: style.color }}>:</span>
            <UnitBlock value={timeLeft.minutes} label="min"   color={style.color} bg={`${style.color}12`} />
            <span className="text-lg font-black pb-4 opacity-40" style={{ color: style.color }}>:</span>
            <UnitBlock value={timeLeft.seconds} label="sec"   color={style.color} bg={`${style.color}12`} />

            {urgency === 'critical' && (
              <motion.span
                className="ml-2 text-xs font-bold px-2 py-1 rounded-full"
                style={{ background: `${style.color}20`, color: style.color }}
                animate={{ opacity: [1, 0.4, 1] }}
                transition={{ duration: 0.8, repeat: Infinity }}
              >
                URGENT
              </motion.span>
            )}
          </div>
        )}
      </div>
    </motion.div>
  );
}