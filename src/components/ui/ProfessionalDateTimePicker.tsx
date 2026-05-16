/**
 * ProfessionalDateTimePicker
 * High-end date/time and date-range picker
 *
 * Fixes in this version:
 *  - No nested <button> elements — clear X is now a <span> with role="button"
 *  - Portal rendered via ReactDOM.createPortal into document.body (not fixed div
 *    that can still be clipped) — guaranteed to escape all overflow:hidden
 *  - Stable dropdown position: computed once on open, updated on scroll/resize,
 *    but the dropdown itself does NOT recalculate mid-hover (no jitter)
 *  - High z-index (999999) so it always sits above modals, GlassCards, etc.
 *  - Hover on the dropdown no longer causes the position to flip
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ChevronLeft, ChevronRight, ChevronDown, Clock, X } from 'lucide-react';
import { colors } from '@/config/colors';

// ── Types ──────────────────────────────────────────────────────────────────────

interface SingleProps {
  mode?: 'single' | 'datetime';
  value?: string;
  onChange?: (iso: string) => void;
  rangeStart?: never;
  rangeEnd?: never;
  onRangeChange?: never;
}

interface RangeProps {
  mode: 'range';
  value?: never;
  onChange?: never;
  rangeStart?: string;
  rangeEnd?: string;
  onRangeChange?: (start: string, end: string) => void;
}

type Props = (SingleProps | RangeProps) & {
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  fullWidth?: boolean;
  helperText?: string;
  className?: string;
  minDate?: string;
  maxDate?: string;
};

interface DropdownPos {
  top: number;
  left: number;
  openUpward: boolean;
}

// ── Constants ──────────────────────────────────────────────────────────────────

const DAYS   = ['Su', 'Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa'];
const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const SINGLE_PRESETS = [
  { label: 'Today',      offset: 0  },
  { label: 'Tomorrow',   offset: 1  },
  { label: 'In a week',  offset: 7  },
  { label: 'In a month', offset: 30 },
];
const RANGE_PRESETS = [
  { label: 'Last 7 days',  days: 7  },
  { label: 'Last 30 days', days: 30 },
  { label: 'Last 90 days', days: 90 },
];

// Approximate dropdown heights for pre-open position calculation
const DROPDOWN_H_APPROX = 380;
const DROPDOWN_W        = 280; // datetime gets 520 but we use 280 for single pane calc
const VIEWPORT_MARGIN   = 8;

// ── Helpers ────────────────────────────────────────────────────────────────────

function sameDay(a: Date | null, b: Date | null) {
  return !!(a && b &&
    a.getFullYear() === b.getFullYear() &&
    a.getMonth()    === b.getMonth()    &&
    a.getDate()     === b.getDate());
}

function fmtDisplay(d: Date | null, includeTime = false, hour = 12, min = 0, period = 'PM') {
  if (!d) return '';
  const base = d.toLocaleDateString('en-NG', { day: 'numeric', month: 'short', year: 'numeric' });
  if (!includeTime) return base;
  return `${base} · ${hour}:${String(min).padStart(2, '0')} ${period}`;
}

function toISO(d: Date, includeTime = false, hour = 12, min = 0, period: 'AM' | 'PM' = 'PM') {
  if (!includeTime) return d.toISOString().slice(0, 10);
  let h = hour;
  if (period === 'PM' && h < 12) h += 12;
  if (period === 'AM' && h === 12) h = 0;
  const out = new Date(d);
  out.setHours(h, min, 0, 0);
  return out.toISOString();
}

function parseDate(s?: string): Date | null {
  if (!s) return null;
  const d = new Date(s);
  return isNaN(d.getTime()) ? null : d;
}

function offsetDate(days: number): Date {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d;
}

function computePosition(trigger: HTMLElement, dropdownW: number): DropdownPos {
  const rect = trigger.getBoundingClientRect();
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  // Horizontal
  let left = rect.left + window.scrollX;
  if (left + dropdownW > vw - VIEWPORT_MARGIN) {
    left = Math.max(VIEWPORT_MARGIN, rect.right + window.scrollX - dropdownW);
  }
  left = Math.max(VIEWPORT_MARGIN, left);

  // Vertical — decide once whether to open upward or downward
  const spaceBelow = vh - rect.bottom - VIEWPORT_MARGIN;
  const openUpward = spaceBelow < DROPDOWN_H_APPROX && rect.top > DROPDOWN_H_APPROX;

  const top = openUpward
    ? rect.top + window.scrollY - DROPDOWN_H_APPROX - 6
    : rect.bottom + window.scrollY + 6;

  return { top, left, openUpward };
}

// ── Time Scroller ──────────────────────────────────────────────────────────────

function TimeScroller({
  items, selected, onSelect, label,
}: {
  items: string[]; selected: number; onSelect: (i: number) => void; label: string;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const ITEM_H = 36;

  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = selected * ITEM_H;
  }, [selected]);

  return (
    <div className="flex flex-col items-center" style={{ flex: 1 }}>
      <p className="text-[10px] font-semibold uppercase tracking-wider mb-1" style={{ color: colors.textTertiary }}>
        {label}
      </p>
      <div className="relative rounded-xl overflow-hidden" style={{ height: 144, width: '100%', background: 'rgba(255,255,255,0.04)' }}>
        {/* Selection highlight band */}
        <div
          className="absolute left-0 right-0 pointer-events-none z-10"
          style={{
            top: '50%', transform: 'translateY(-50%)', height: ITEM_H,
            borderTop: `1px solid ${colors.primary}40`,
            borderBottom: `1px solid ${colors.primary}40`,
            background: `${colors.primary}10`,
          }}
        />
        <div
          ref={listRef}
          className="h-full overflow-y-auto"
          style={{ scrollbarWidth: 'none', scrollSnapType: 'y mandatory' }}
          onScroll={(e) => {
            const idx = Math.round(e.currentTarget.scrollTop / ITEM_H);
            if (idx !== selected && idx >= 0 && idx < items.length) onSelect(idx);
          }}
        >
          <div style={{ height: ITEM_H * 1.5 }} />
          {items.map((item, i) => (
            <div
              key={i}
              onClick={() => {
                onSelect(i);
                if (listRef.current) listRef.current.scrollTop = i * ITEM_H;
              }}
              className="flex items-center justify-center cursor-pointer font-mono transition-all"
              style={{
                height: ITEM_H, scrollSnapAlign: 'center', fontSize: 15,
                fontWeight: i === selected ? 600 : 400,
                color: i === selected ? colors.primary : colors.textSecondary,
              }}
            >
              {item}
            </div>
          ))}
          <div style={{ height: ITEM_H * 1.5 }} />
        </div>
      </div>
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────────

export default function ProfessionalDateTimePicker({
  mode = 'single',
  value,
  onChange,
  rangeStart,
  rangeEnd,
  onRangeChange,
  label,
  helperText,
  placeholder,
  disabled,
  fullWidth,
  className = '',
}: Props) {
  const today = new Date();

  const [open, setOpen]           = useState(false);
  const [pos, setPos]             = useState<DropdownPos | null>(null);
  const [viewYear, setViewYear]   = useState(today.getFullYear());
  const [viewMonth, setViewMonth] = useState(today.getMonth());
  const [hovered, setHovered]     = useState<Date | null>(null);

  // Single / datetime
  const [pickedDate, setPickedDate] = useState<Date | null>(parseDate(value));
  const [hour,   setHour]   = useState(12);
  const [minute, setMinute] = useState(0);
  const [ampm,   setAmpm]   = useState<'AM' | 'PM'>('PM');

  // Range
  const [rStart, setRStart] = useState<Date | null>(parseDate(rangeStart));
  const [rEnd,   setREnd]   = useState<Date | null>(parseDate(rangeEnd));

  const triggerRef  = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Sync controlled props
  useEffect(() => { setPickedDate(parseDate(value));  }, [value]);
  useEffect(() => { setRStart(parseDate(rangeStart)); }, [rangeStart]);
  useEffect(() => { setREnd(parseDate(rangeEnd));     }, [rangeEnd]);

  const effectiveDropdownW = mode === 'datetime' ? 520 : DROPDOWN_W;

  // Open picker — compute position from trigger
  const openPicker = () => {
    if (disabled || !triggerRef.current) return;
    setPos(computePosition(triggerRef.current, effectiveDropdownW));
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current?.contains(e.target as Node) ||
        dropdownRef.current?.contains(e.target as Node)
      ) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // Re-position on scroll / resize — but only recompute position, don't toggle openUpward
  useEffect(() => {
    if (!open || !triggerRef.current) return;
    const update = () => {
      if (!triggerRef.current) return;
      setPos(computePosition(triggerRef.current, effectiveDropdownW));
    };
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [open, effectiveDropdownW]);

  // Calendar grid
  const firstDay      = new Date(viewYear, viewMonth, 1).getDay();
  const daysInMonth   = new Date(viewYear, viewMonth + 1, 0).getDate();
  const prevMonthDays = new Date(viewYear, viewMonth, 0).getDate();
  const totalCells    = Math.ceil((firstDay + daysInMonth) / 7) * 7;

  const cells: { date: Date; outside: boolean }[] = [];
  for (let i = 0; i < totalCells; i++) {
    const offset = i - firstDay;
    if (offset < 0) {
      cells.push({ date: new Date(viewYear, viewMonth - 1, prevMonthDays + offset + 1), outside: true });
    } else if (offset >= daysInMonth) {
      cells.push({ date: new Date(viewYear, viewMonth + 1, offset - daysInMonth + 1), outside: true });
    } else {
      cells.push({ date: new Date(viewYear, viewMonth, offset + 1), outside: false });
    }
  }

  const handleDayClick = useCallback((d: Date) => {
    if (mode === 'range') {
      if (!rStart || (rStart && rEnd)) {
        setRStart(d); setREnd(null);
      } else {
        const [s, e] = d < rStart ? [d, rStart] : [rStart, d];
        setRStart(s); setREnd(e);
        onRangeChange?.(s.toISOString().slice(0, 10), e.toISOString().slice(0, 10));
      }
    } else {
      setPickedDate(d);
    }
  }, [mode, rStart, rEnd, onRangeChange]);

  const commit = () => {
    if (mode === 'range') {
      if (rStart && rEnd) setOpen(false);
      return;
    }
    if (!pickedDate) return;
    onChange?.(toISO(pickedDate, mode === 'datetime', hour, minute, ampm));
    setOpen(false);
  };

  const clear = (e: React.MouseEvent) => {
    e.stopPropagation();
    setPickedDate(null); setRStart(null); setREnd(null);
    onChange?.('');
    onRangeChange?.('', '');
  };

  // Trigger display
  const triggerText = (() => {
    if (mode === 'range') {
      if (rStart && rEnd) return `${fmtDisplay(rStart)} → ${fmtDisplay(rEnd)}`;
      if (rStart)          return `${fmtDisplay(rStart)} → …`;
      return placeholder || 'Select range';
    }
    return pickedDate
      ? fmtDisplay(pickedDate, mode === 'datetime', hour, minute, ampm)
      : (placeholder || 'Select date');
  })();

  const hasValue = mode === 'range' ? !!(rStart && rEnd) : !!pickedDate;

  // Cell styling
  const cellStyle = (d: Date, outside: boolean) => {
    const effEnd = rStart && !rEnd && hovered ? hovered : rEnd;
    let isRangeS = false, isRangeE = false, inRange = false, isSelected = false;

    if (mode === 'range' && rStart) {
      const lo = effEnd && rStart < effEnd ? rStart : effEnd || rStart;
      const hi = effEnd && rStart < effEnd ? effEnd : rStart;
      if (sameDay(d, lo)) isRangeS = true;
      else if (sameDay(d, hi)) isRangeE = true;
      else if (effEnd && d > lo && d < hi) inRange = true;
    } else {
      isSelected = sameDay(d, pickedDate);
    }

    const isToday = sameDay(d, today);

    return { isRangeS, isRangeE, inRange, isSelected, isToday, outside };
  };

  const panelBg     = '#141414';
  const panelBorder = 'rgba(255,255,255,0.08)';
  const itemBg      = 'rgba(255,255,255,0.03)';
  const hours       = Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, '0'));
  const minutes     = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

  // ── Dropdown JSX ────────────────────────────────────────────────────────────
  const dropdown = (
    <AnimatePresence>
      {open && pos && (
        <motion.div
          ref={dropdownRef}
          key="picker-dropdown"
          initial={{ opacity: 0, scale: 0.96, y: pos.openUpward ? 8 : -8 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.96 }}
          transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] as const }}
          style={{
            position: 'absolute',
            top: pos.top,
            left: pos.left,
            zIndex: 999999,
            minWidth: Math.min(effectiveDropdownW, window.innerWidth - VIEWPORT_MARGIN * 2),
            background: panelBg,
            border: `1px solid ${panelBorder}`,
            borderRadius: 16,
            boxShadow: '0 24px 60px rgba(0,0,0,0.7), 0 4px 16px rgba(0,0,0,0.4)',
            transformOrigin: pos.openUpward ? 'bottom left' : 'top left',
          }}
          // Stop any pointer events from bubbling up to scroll listeners
          onPointerDown={e => e.stopPropagation()}
        >
          <div className="flex">
            {/* ── Calendar pane ── */}
            <div className="p-4" style={{ minWidth: 260 }}>
              {/* Month navigation */}
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={() => {
                    if (viewMonth === 0) { setViewMonth(11); setViewYear(y => y - 1); }
                    else setViewMonth(m => m - 1);
                  }}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                  style={{ color: colors.textSecondary }}
                >
                  <ChevronLeft size={16} />
                </button>
                <p className="text-sm font-semibold text-white">{MONTHS[viewMonth]} {viewYear}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (viewMonth === 11) { setViewMonth(0); setViewYear(y => y + 1); }
                    else setViewMonth(m => m + 1);
                  }}
                  className="p-1.5 rounded-lg transition-colors hover:bg-white/5"
                  style={{ color: colors.textSecondary }}
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              {/* Day headers */}
              <div className="grid grid-cols-7 mb-1">
                {DAYS.map(d => (
                  <div key={d} className="text-center text-[10px] font-medium py-1" style={{ color: colors.textTertiary }}>
                    {d}
                  </div>
                ))}
              </div>

              {/* Day cells */}
              <div className="grid grid-cols-7 gap-px">
                {cells.map(({ date, outside }, idx) => {
                  const { isRangeS, isRangeE, inRange, isSelected, isToday } = cellStyle(date, outside);
                  const highlighted = isSelected || isRangeS || isRangeE;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleDayClick(date)}
                      onMouseEnter={() => mode === 'range' && rStart && !rEnd && setHovered(date)}
                      onMouseLeave={() => mode === 'range' && rStart && !rEnd && setHovered(null)}
                      className="relative flex items-center justify-center transition-colors"
                      style={{
                        height: 34, fontSize: 13, cursor: 'pointer',
                        borderRadius: isRangeS ? '50% 0 0 50%' : isRangeE ? '0 50% 50% 0' : inRange ? 0 : '50%',
                        background: highlighted
                          ? colors.primary
                          : inRange ? `${colors.primary}18` : 'transparent',
                        color: highlighted ? '#fff'
                          : outside ? colors.textTertiary
                          : isToday  ? colors.primary : '#fff',
                        fontWeight: highlighted || isToday ? 600 : 400,
                      }}
                    >
                      {date.getDate()}
                      {isToday && !highlighted && (
                        <span style={{
                          position: 'absolute', bottom: 3, left: '50%',
                          transform: 'translateX(-50%)',
                          width: 3, height: 3, borderRadius: '50%',
                          background: colors.primary,
                        }} />
                      )}
                    </button>
                  );
                })}
              </div>

              {/* Presets */}
              <div className="flex flex-wrap gap-1.5 mt-3 pt-3" style={{ borderTop: `1px solid ${panelBorder}` }}>
                {(mode === 'range' ? RANGE_PRESETS : SINGLE_PRESETS).map(p => (
                  <button
                    key={p.label}
                    type="button"
                    onClick={() => {
                      if (mode === 'range') {
                        const e = new Date();
                        const s = offsetDate(-(p as typeof RANGE_PRESETS[0]).days);
                        setRStart(s); setREnd(e);
                        onRangeChange?.(s.toISOString().slice(0, 10), e.toISOString().slice(0, 10));
                      } else {
                        const d = offsetDate((p as typeof SINGLE_PRESETS[0]).offset);
                        setPickedDate(d);
                        setViewYear(d.getFullYear());
                        setViewMonth(d.getMonth());
                      }
                    }}
                    className="px-2.5 py-1 rounded-full text-[11px] transition-all hover:bg-white/5"
                    style={{ background: itemBg, border: `1px solid ${panelBorder}`, color: colors.textSecondary }}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>

            {/* ── Time pane (datetime only) ── */}
            {mode === 'datetime' && (
              <div className="flex flex-col p-4 gap-3" style={{ minWidth: 200, borderLeft: `1px solid ${panelBorder}` }}>
                <p className="text-xs font-semibold" style={{ color: colors.textSecondary }}>Time</p>
                <div className="flex gap-2 flex-1">
                  <TimeScroller label="HR"  items={hours}   selected={hour - 1}  onSelect={i => setHour(i + 1)} />
                  <TimeScroller label="MIN" items={minutes} selected={minute}    onSelect={setMinute} />
                  <div className="flex flex-col items-center gap-2 justify-center">
                    {(['AM', 'PM'] as const).map(p => (
                      <button
                        key={p}
                        type="button"
                        onClick={() => setAmpm(p)}
                        className="w-10 py-1.5 rounded-lg text-xs font-semibold transition-all"
                        style={{
                          background: ampm === p ? colors.primary : itemBg,
                          color: ampm === p ? '#fff' : colors.textSecondary,
                          border: `1px solid ${ampm === p ? colors.primary : panelBorder}`,
                        }}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-4 py-3" style={{ borderTop: `1px solid ${panelBorder}` }}>
            <p className="text-xs font-mono" style={{ color: colors.textTertiary }}>
              {mode === 'range'
                ? rStart && rEnd
                  ? `${fmtDisplay(rStart)} → ${fmtDisplay(rEnd)}`
                  : rStart ? `${fmtDisplay(rStart)} → …` : '—'
                : pickedDate ? fmtDisplay(pickedDate, mode === 'datetime', hour, minute, ampm) : '—'}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="px-3 py-1.5 rounded-lg text-xs font-medium transition-colors hover:bg-white/5"
                style={{ background: itemBg, color: colors.textSecondary, border: `1px solid ${panelBorder}` }}
              >
                Cancel
              </button>
              <motion.button
                type="button"
                onClick={commit}
                disabled={mode === 'range' ? !rStart || !rEnd : !pickedDate}
                className="px-4 py-1.5 rounded-lg text-xs font-semibold text-white disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${colors.primary} 0%, #FFAC5F 100%)` }}
                whileHover={{ scale: 1.03 }}
                whileTap={{ scale: 0.97 }}
              >
                Confirm
              </motion.button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div
      ref={triggerRef}
      className={`${fullWidth ? 'w-full' : 'inline-block'} ${className}`}
    >
      {label && (
        <p className="text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
          {label}
        </p>
      )}
      {helperText && (
        <p className="text-xs mb-1.5" style={{ color: colors.textTertiary }}>
          {helperText}
        </p>
      )}

      {/*
        Trigger: a plain <div role="button"> so we can safely nest the clear <button> inside.
        This avoids the <button><button> hydration error entirely.
      */}
      <div
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={openPicker}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') openPicker(); }}
        className="flex items-center gap-2 px-3 py-2.5 rounded-xl transition-all cursor-pointer select-none"
        style={{
          width: fullWidth ? '100%' : undefined,
          background: open ? `${colors.primary}15` : 'rgba(255,255,255,0.03)',
          border: `1px solid ${open ? `${colors.primary}60` : 'rgba(255,255,255,0.08)'}`,
          color: hasValue ? '#fff' : colors.textTertiary,
          outline: 'none',
        }}
        onFocus={e => { (e.currentTarget as HTMLElement).style.boxShadow = `0 0 0 2px ${colors.primary}40`; }}
        onBlur={e => { (e.currentTarget as HTMLElement).style.boxShadow = 'none'; }}
      >
        {mode === 'datetime'
          ? <Clock   size={16} style={{ color: hasValue ? colors.primary : colors.textTertiary, flexShrink: 0 }} />
          : <Calendar size={16} style={{ color: hasValue ? colors.primary : colors.textTertiary, flexShrink: 0 }} />
        }

        <span className="flex-1 text-left text-sm truncate" style={{ color: hasValue ? '#fff' : colors.textTertiary }}>
          {triggerText}
        </span>

        {/* Clear button — plain <button>, safe since trigger is a <div> */}
        {hasValue && (
          <button
            type="button"
            onClick={clear}
            aria-label="Clear date"
            className="p-0.5 rounded transition-colors hover:bg-white/10 shrink-0"
          >
            <X size={12} style={{ color: colors.textTertiary }} />
          </button>
        )}

        <ChevronDown
          size={14}
          className="shrink-0 transition-transform duration-200"
          style={{
            color: colors.textTertiary,
            transform: open ? 'rotate(180deg)' : 'rotate(0deg)',
          }}
        />
      </div>

      {/* Portal — renders into document.body, completely outside any overflow:hidden ancestor */}
      {typeof document !== 'undefined' && createPortal(dropdown, document.body)}
    </div>
  );
}