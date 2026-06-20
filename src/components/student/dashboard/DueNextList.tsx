/**
 * DueNextList — premium ledger-entry redesign.
 *
 * Signature element: every row is a two-column ledger entry.
 * The amount lives in its own left column (large mono, colored by
 * urgency), separated from the due detail by a thin vertical rule.
 * This is borrowed from printed bank statements and Nigerian payment
 * slips — the financial artifact the product replaces — not from
 * generic card-list UI patterns.
 *
 * Supporting decisions:
 *   – Amount column background tinted by urgency (not just a 4px rail)
 *   – Deadline is a mono rubber-stamp badge: uppercase, tracked, small
 *   – Category icon is small and secondary — the amount is primary
 *   – "Required" pill removed in favor of the amount-column tint signal
 *   – Partial progress sits inside the detail column, below the title
 *   – Skeleton mirrors the two-column structure so no layout jump
 */

import { motion } from 'framer-motion';
import {
  ChevronRight, CheckCircle2, Calendar, Wallet,
  GraduationCap, Heart, BookOpen, Sparkles, Ticket,
  Clock, AlertTriangle, BadgeCheck,
} from 'lucide-react';
import type { ResolvedTheme } from '@/hooks/useTheme';
import { getDashboardTokens } from '@/hooks/useTheme';

// ── Public types (unchanged shape — no parent changes needed) ─────
export interface DueNextItem {
  id: string;
  title: string;
  amount: number;
  status: 'unpaid' | 'partial' | 'pending' | 'paid' | 'waived';
  daysLeft: number | null;
  isMandatory: boolean;
  categoryKey?: string | null;
  paidAmount?: number;
}

export interface DueNextListProps {
  theme: ResolvedTheme;
  currencySymbol?: string;
  privacyOn?: boolean;
  items: DueNextItem[];
  onItemClick?: (id: string) => void;
  onSeeAllClick?: () => void;
  totalCount?: number;
  loading?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────
const MONO = '"JetBrains Mono","Fira Code","Cascadia Code",ui-monospace,monospace';
const EASE = [0.22, 1, 0.36, 1] as const;

// ── Urgency derivation ────────────────────────────────────────────
// Returns a single urgency level used for both color and copy.
type Urgency = 'settled' | 'waived' | 'pending' | 'overdue' | 'today' | 'soon' | 'upcoming' | 'open';

function getUrgency(item: DueNextItem): Urgency {
  if (item.status === 'paid')    return 'settled';
  if (item.status === 'waived')  return 'waived';
  if (item.status === 'pending') return 'pending';
  if (item.daysLeft === null)    return 'open';
  if (item.daysLeft < 0)        return 'overdue';
  if (item.daysLeft === 0)      return 'today';
  if (item.daysLeft <= 5)       return 'soon';
  return 'upcoming';
}

// Maps urgency → { label, color key }
// Color keys are resolved against the theme tokens at render time.
const URGENCY_META: Record<Urgency, { label: string; tint: 'mint' | 'amber' | 'danger' | 'primary' | 'neutral' }> = {
  settled:  { label: 'Settled',         tint: 'mint'    },
  waived:   { label: 'Waived',          tint: 'mint'    },
  pending:  { label: 'Under review',    tint: 'amber'   },
  overdue:  { label: 'Overdue',         tint: 'danger'  },
  today:    { label: 'Due today',       tint: 'danger'  },
  soon:     { label: 'Due soon',        tint: 'amber'   },
  upcoming: { label: 'Upcoming',        tint: 'neutral' },
  open:     { label: 'Open',            tint: 'neutral' },
};

// ── Category icons (unchanged logic) ─────────────────────────────
function iconForCategory(key?: string | null) {
  const k = (key || '').toLowerCase();
  if (k.includes('tuition') || k.includes('fee'))      return GraduationCap;
  if (k.includes('don')     || k.includes('charity'))  return Heart;
  if (k.includes('book')    || k.includes('material')) return BookOpen;
  if (k.includes('event')   || k.includes('ticket'))   return Ticket;
  if (k.includes('party')   || k.includes('social'))   return Sparkles;
  if (k.includes('calendar')|| k.includes('annual'))   return Calendar;
  return Wallet;
}

// ── Money formatter ───────────────────────────────────────────────
// function formatMoney(amount: number, symbol: string, masked: boolean): string {
//   if (masked) return `${symbol}••••`;
//   return `${symbol}${amount.toLocaleString('en-NG', {
//     minimumFractionDigits: 0,
//     maximumFractionDigits: 2,
//   })}`;
// }

// ── Hex → rgba helper ─────────────────────────────────────────────
function rgba(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

// ── Deadline status icon ──────────────────────────────────────────
function UrgencyIcon({ urgency, color }: { urgency: Urgency; color: string }) {
  const props = { size: 11, color, strokeWidth: 2.2 };
  if (urgency === 'settled' || urgency === 'waived') return <BadgeCheck {...props} />;
  if (urgency === 'overdue' || urgency === 'today')  return <AlertTriangle {...props} />;
  if (urgency === 'pending')                         return <Clock {...props} />;
  return null;
}

// ════════════════════════════════════════════════════════════════
// DueNextList — main export
// ════════════════════════════════════════════════════════════════
export default function DueNextList({
  theme,
  currencySymbol = '₦',
  privacyOn = false,
  items,
  onItemClick,
  onSeeAllClick,
  totalCount,
  loading,
}: DueNextListProps) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  const visible = items.slice(0, 5);
  const isEmpty  = !loading && visible.length === 0;

  return (
    <section>
      {/* ── Header ─────────────────────────────────────────── */}
      <header className="flex items-center justify-between mb-3 px-0.5">
        <div className="flex items-center gap-2.5">
          <h2
            className="text-[13px] font-bold uppercase tracking-[0.14em]"
            style={{ color: t.textTer }}
          >
            Due next
          </h2>
          {typeof totalCount === 'number' && totalCount > 0 && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full tabular-nums"
              style={{
                fontFamily: MONO,
                background: `${t.primary}14`,
                color: t.primary,
                border: `1px solid ${t.primary}28`,
              }}
            >
              {totalCount}
            </span>
          )}
        </div>
        {onSeeAllClick && (
          <button
            type="button"
            onClick={onSeeAllClick}
            className="text-[11px] font-semibold inline-flex items-center gap-0.5 transition-opacity hover:opacity-70"
            style={{ color: t.textSec }}
          >
            See all
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </header>

      {/* ── Loading skeleton ────────────────────────────────── */}
      {loading && visible.length === 0 && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <RowSkeleton key={i} theme={theme} />
          ))}
        </div>
      )}

      {/* ── Empty state ─────────────────────────────────────── */}
      {isEmpty && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, ease: EASE }}
          className="rounded-2xl px-5 py-6 flex items-center gap-4"
          style={{
            background: isLight ? '#F5FFFA' : 'rgba(16,212,155,0.05)',
            border: `1px solid ${isLight ? '#C8F0DC' : 'rgba(16,212,155,0.16)'}`,
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: isLight ? '#E2FAF0' : 'rgba(16,212,155,0.12)' }}
          >
            <CheckCircle2 size={20} color={t.mint} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: t.text }}>
              All caught up
            </p>
            <p className="text-xs mt-0.5" style={{ color: t.textSec }}>
              No dues right now. We'll let you know when something's published.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Ledger rows ─────────────────────────────────────── */}
      {visible.length > 0 && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            border: `1px solid ${t.cardBorder}`,
            background: t.card,
            boxShadow: isLight
              ? '0 1px 0 rgba(255,255,255,0.8) inset, 0 4px 20px -8px rgba(15,7,3,0.10)'
              : '0 1px 0 rgba(255,255,255,0.025) inset',
          }}
        >
          {visible.map((item, i) => (
            <LedgerRow
              key={item.id}
              item={item}
              index={i}
              isLast={i === visible.length - 1}
              theme={theme}
              tokens={t}
              currencySymbol={currencySymbol}
              privacyOn={privacyOn}
              onClick={() => onItemClick?.(item.id)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

// ════════════════════════════════════════════════════════════════
// LedgerRow — the signature two-column layout
// ════════════════════════════════════════════════════════════════
function LedgerRow({
  item,
  index,
  isLast,
  theme,
  tokens: t,
  currencySymbol,
  privacyOn,
  onClick,
}: {
  item: DueNextItem;
  index: number;
  isLast: boolean;
  theme: ResolvedTheme;
  tokens: ReturnType<typeof getDashboardTokens>;
  currencySymbol: string;
  privacyOn: boolean;
  onClick: () => void;
}) {
  const isLight = theme === 'light';
  const urgency = getUrgency(item);
  const meta    = URGENCY_META[urgency];
  const Icon    = iconForCategory(item.categoryKey);

  // Resolve the urgency color from tokens
  const urgencyColor: string =
    meta.tint === 'mint'    ? t.mint
    : meta.tint === 'amber' ? t.amber
    : meta.tint === 'danger'? (t.danger ?? '#E24B4A')
    : meta.tint === 'primary'? t.primary
    : t.textTer;

  // Amount-column background: a tinted wash that IS the urgency signal.
  // Mandatory + active dues get the brand-orange wash; settled/waived
  // get mint; overdue gets danger; everything else is neutral.
  const amountColBg =
    urgency === 'settled' || urgency === 'waived'
      ? rgba(t.mint, isLight ? 0.08 : 0.10)
    : urgency === 'overdue' || urgency === 'today'
      ? rgba(t.danger ?? '#E24B4A', isLight ? 0.07 : 0.10)
    : urgency === 'pending'
      ? rgba(t.amber, isLight ? 0.06 : 0.09)
    : item.isMandatory
      ? rgba(t.primary, isLight ? 0.06 : 0.08)
      : isLight ? 'rgba(15,7,3,0.025)' : 'rgba(255,255,255,0.025)';

  // Amount text color
  const amountColor =
    urgency === 'settled' || urgency === 'waived' ? t.mint
    : urgency === 'overdue' || urgency === 'today' ? (t.danger ?? '#E24B4A')
    : urgency === 'pending' ? t.amber
    : item.isMandatory ? t.primary
    : t.text;

  // Divider (between rows inside the container)
  const dividerStyle = !isLast ? {
    borderBottom: `1px solid ${t.cardBorder}`,
  } : {};

  const paidPct = item.status === 'partial' && item.paidAmount && item.amount
    ? Math.min(100, Math.round((item.paidAmount / item.amount) * 100))
    : null;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, x: -8 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.3, delay: 0.05 * index, ease: EASE }}
      whileHover={{ background: isLight ? 'rgba(15,7,3,0.018)' : 'rgba(255,255,255,0.018)' }}
      whileTap={{ scale: 0.995 }}
      className="w-full text-left flex items-stretch group"
      style={dividerStyle}
    >
      {/* ── LEFT COLUMN: amount ─────────────────────────────── */}
      {/* This is the signature element — the amount in its own
          column, colored by urgency, separated by a thin rule.
          Feels like a ledger entry or payment slip column. */}
      <div
        className="flex flex-col items-end justify-center px-4 py-4 shrink-0 relative"
        style={{
          width: 96,
          background: amountColBg,
          borderRight: `1px solid ${t.cardBorder}`,
        }}
      >
        <span
          className="text-[11px] font-bold mb-0.5 opacity-60 uppercase tracking-wider"
          style={{ color: amountColor, fontFamily: MONO }}
        >
          {currencySymbol}
        </span>
        <span
          className="text-[17px] font-extrabold leading-none tabular-nums"
          style={{
            color: amountColor,
            fontFamily: MONO,
            filter: privacyOn ? 'blur(5px)' : 'none',
            transition: 'filter 0.2s',
          }}
        >
          {privacyOn
            ? '••••'
            : item.amount.toLocaleString('en-NG', { maximumFractionDigits: 0 })}
        </span>
        {/* Partial paid indicator — thin arc below the amount */}
        {paidPct !== null && (
          <div
            className="mt-2 w-full h-1 rounded-full overflow-hidden"
            style={{ background: isLight ? 'rgba(15,7,3,0.08)' : 'rgba(255,255,255,0.08)' }}
          >
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${paidPct}%`, background: t.amber }}
            />
          </div>
        )}
      </div>

      {/* ── RIGHT COLUMN: detail ────────────────────────────── */}
      <div className="flex-1 min-w-0 flex items-center gap-3 px-4 py-4">
        {/* Category icon — small, secondary */}
        <div
          className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: isLight ? rgba(urgencyColor, 0.09) : rgba(urgencyColor, 0.14),
            border: `1px solid ${rgba(urgencyColor, isLight ? 0.16 : 0.2)}`,
          }}
        >
          <Icon size={15} color={urgencyColor} />
        </div>

        {/* Title + sub-row */}
        <div className="flex-1 min-w-0">
          <p
            className="text-[13px] sm:text-[14px] font-bold truncate leading-snug"
            style={{ color: t.text }}
          >
            {item.title}
          </p>

          {/* Sub-row: urgency stamp + mandatory signal */}
          <div className="flex items-center gap-2 mt-1 flex-wrap">
            {/* Deadline — rubber-stamp style badge */}
            <span
              className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.14em] px-1.5 py-0.5 rounded"
              style={{
                fontFamily: MONO,
                color: urgencyColor,
                background: rgba(urgencyColor, isLight ? 0.09 : 0.12),
                border: `1px solid ${rgba(urgencyColor, isLight ? 0.18 : 0.22)}`,
              }}
            >
              <UrgencyIcon urgency={urgency} color={urgencyColor} />
              {urgency === 'overdue' || urgency === 'today' || urgency === 'soon'
                ? meta.label
                : item.daysLeft != null && urgency !== 'settled' && urgency !== 'waived' && urgency !== 'pending'
                  ? `${item.daysLeft}d left`
                  : meta.label}
            </span>

            {/* Mandatory dot signal — small, doesn't shout */}
            {item.isMandatory && urgency !== 'settled' && urgency !== 'waived' && (
              <span
                className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.12em]"
                style={{ color: isLight ? '#B45309' : '#FCD9A6' }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ background: t.primary }}
                />
                Required
              </span>
            )}

            {/* Partial paid — amount paid so far */}
            {item.status === 'partial' && item.paidAmount != null && item.paidAmount > 0 && (
              <span
                className="text-[9.5px] font-bold uppercase tracking-wider"
                style={{ color: t.amber, fontFamily: MONO }}
              >
                {paidPct}% paid
              </span>
            )}
          </div>
        </div>

        {/* Chevron */}
        <ChevronRight
          className="w-4 h-4 shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
          style={{ color: t.textTer }}
        />
      </div>
    </motion.button>
  );
}

// ════════════════════════════════════════════════════════════════
// Skeleton — mirrors the two-column layout so load → content
// doesn't shift the layout at all.
// ════════════════════════════════════════════════════════════════
function RowSkeleton({ theme }: { theme: ResolvedTheme }) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  const shimmer = isLight ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.05)';
  const shimmerFaint = isLight ? 'rgba(15,7,3,0.04)' : 'rgba(255,255,255,0.03)';

  return (
    <div
      className="rounded-2xl overflow-hidden flex animate-pulse mb-2"
      style={{ border: `1px solid ${t.cardBorder}`, background: t.card }}
    >
      {/* Amount col skeleton */}
      <div
        className="flex flex-col items-end justify-center px-4 py-4 gap-1.5 shrink-0"
        style={{ width: 96, borderRight: `1px solid ${t.cardBorder}`, background: shimmerFaint }}
      >
        <div className="h-2 w-5 rounded" style={{ background: shimmer }} />
        <div className="h-4 w-12 rounded" style={{ background: shimmer }} />
      </div>
      {/* Detail col skeleton */}
      <div className="flex-1 flex items-center gap-3 px-4 py-4">
        <div className="w-8 h-8 rounded-xl shrink-0" style={{ background: shimmer }} />
        <div className="flex-1 space-y-2">
          <div className="h-3.5 rounded w-3/5" style={{ background: shimmer }} />
          <div className="h-2.5 rounded w-2/5" style={{ background: shimmerFaint }} />
        </div>
      </div>
    </div>
  );
}