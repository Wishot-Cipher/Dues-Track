/**
 * DueNextList — the section under the hero showing the next few dues.
 *
 * Visual recipe (matches the Payvexo mockup):
 *   • Section header: "Due Next" + small "See all →" link on the right
 *   • Vertical list of rows, each row is its own rounded card with:
 *       - Category icon in a tinted circle (left)
 *       - Title + small subtitle ("Class dues" / "Mandatory")
 *       - Amount on the right (with currency symbol)
 *       - Deadline pill below the amount ("Due in 3 days" / "Overdue")
 *       - Whole row is tappable, with subtle press feedback
 *   • Status colors: orange (due soon), red (overdue), mint (paid/partial)
 *   • Theme-aware via getDashboardTokens
 *   • Empty state when there's nothing pending — a small "all clear"
 *     card with a checkmark icon
 *
 * The component is purely presentational. The parent passes in already-
 * sorted dues; we just render them and call onPayClick on tap.
 */

import { motion } from 'framer-motion';
import { ChevronRight, CheckCircle2, Calendar, Wallet, GraduationCap, Heart, BookOpen, Sparkles, Ticket, AlertCircle } from 'lucide-react';
import type { ResolvedTheme } from '@/hooks/useTheme';
import { getDashboardTokens } from '@/hooks/useTheme';

export interface DueNextItem {
  id: string;
  title: string;
  amount: number;
  /** Status of this due for the current member. */
  status: 'unpaid' | 'partial' | 'pending' | 'paid';
  /** Days until deadline (negative = overdue). null = no deadline. */
  daysLeft: number | null;
  /** Whether this due is mandatory (vs optional). */
  isMandatory: boolean;
  /** Category key for the icon (e.g. 'tuition', 'donation'). Falls back
   *  to a generic wallet icon. */
  categoryKey?: string | null;
  /** How much has been paid already (for partial). */
  paidAmount?: number;
}

export interface DueNextListProps {
  theme: ResolvedTheme;
  /** Currency symbol. Defaults to ₦. */
  currencySymbol?: string;
  /** Privacy mask state — blurs amounts when on. */
  privacyOn?: boolean;
  /** The dues to render. Already sorted by the parent. Max ~5 shown. */
  items: DueNextItem[];
  /** Tap handler for an individual due row. */
  onItemClick?: (id: string) => void;
  /** "See all" handler. If omitted, the link is hidden. */
  onSeeAllClick?: () => void;
  /** Optional total count (for the "See all (N)" link). */
  totalCount?: number;
  /** Whether the parent is still loading. */
  loading?: boolean;
}

// ── Category → icon mapping ────────────────────────────────────
// Keep this tiny — anything not matched falls back to Wallet.
function iconForCategory(key?: string | null) {
  const k = (key || '').toLowerCase();
  if (k.includes('tuition') || k.includes('fee')) return GraduationCap;
  if (k.includes('don') || k.includes('charity')) return Heart;
  if (k.includes('book') || k.includes('material')) return BookOpen;
  if (k.includes('event') || k.includes('ticket')) return Ticket;
  if (k.includes('party') || k.includes('social')) return Sparkles;
  if (k.includes('calendar') || k.includes('annual')) return Calendar;
  return Wallet;
}

function formatMoney(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

function deadlinePill(daysLeft: number | null, status: DueNextItem['status']): {
  label: string;
  tint: 'mint' | 'amber' | 'danger' | 'neutral';
} {
  if (status === 'paid')    return { label: 'Paid',    tint: 'mint' };
  if (status === 'pending') return { label: 'Awaiting review', tint: 'amber' };
  if (daysLeft === null)    return { label: 'No deadline', tint: 'neutral' };
  if (daysLeft < 0)         return { label: `${Math.abs(daysLeft)}d overdue`, tint: 'danger' };
  if (daysLeft === 0)       return { label: 'Due today',  tint: 'danger' };
  if (daysLeft === 1)       return { label: 'Due tomorrow', tint: 'amber' };
  if (daysLeft <= 7)        return { label: `${daysLeft}d left`, tint: 'amber' };
  return { label: `${daysLeft}d left`, tint: 'neutral' };
}

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

  const visible = items.slice(0, 5);
  const isEmpty = !loading && visible.length === 0;

  return (
    <section className="space-y-3">
      {/* ── Section header ───────────────────────────────────── */}
      <header className="flex items-end justify-between px-1">
        <div>
          <p
            className="text-[10px] uppercase tracking-[0.14em] font-bold"
            style={{ color: t.primary }}
          >
            Coming up
          </p>
          <h2
            className="text-base sm:text-lg font-extrabold tracking-tight"
            style={{ color: t.text }}
          >
            Due Next
          </h2>
        </div>
        {onSeeAllClick && (
          <button
            type="button"
            onClick={onSeeAllClick}
            className="text-[11px] font-semibold inline-flex items-center gap-0.5 hover:opacity-80 transition-opacity"
            style={{ color: t.primary }}
          >
            See all{typeof totalCount === 'number' ? ` (${totalCount})` : ''}
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        )}
      </header>

      {/* ── Loading skeleton ─────────────────────────────────── */}
      {loading && visible.length === 0 && (
        <div className="space-y-2.5">
          {[0, 1, 2].map((i) => (
            <DueRowSkeleton key={i} theme={theme} />
          ))}
        </div>
      )}

      {/* ── Empty state ──────────────────────────────────────── */}
      {isEmpty && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="rounded-2xl px-5 py-6 flex items-center gap-3"
          style={{
            background: theme === 'light' ? '#F5FFFA' : 'rgba(48,255,172,0.06)',
            border: `1px solid ${theme === 'light' ? '#CCF2DE' : 'rgba(48,255,172,0.18)'}`,
          }}
        >
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center shrink-0"
            style={{ background: theme === 'light' ? '#E6FAEF' : 'rgba(48,255,172,0.14)' }}
          >
            <CheckCircle2 size={20} color={t.mint} />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold" style={{ color: t.text }}>
              You're all clear
            </p>
            <p className="text-xs" style={{ color: t.textSec }}>
              No dues coming up. We'll notify you when something's published.
            </p>
          </div>
        </motion.div>
      )}

      {/* ── Rows ────────────────────────────────────────────── */}
      {visible.length > 0 && (
        <div className="space-y-2.5">
          {visible.map((item, i) => (
            <DueRow
              key={item.id}
              item={item}
              index={i}
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

// ── Row ─────────────────────────────────────────────────────────
function DueRow({
  item,
  index,
  theme,
  tokens,
  currencySymbol,
  privacyOn,
  onClick,
}: {
  item: DueNextItem;
  index: number;
  theme: ResolvedTheme;
  tokens: ReturnType<typeof getDashboardTokens>;
  currencySymbol: string;
  privacyOn: boolean;
  onClick: () => void;
}) {
  const Icon = iconForCategory(item.categoryKey);
  const pill = deadlinePill(item.daysLeft, item.status);
  const isLight = theme === 'light';

  const pillBg = {
    mint:   isLight ? '#E7FAF1' : 'rgba(48,255,172,0.16)',
    amber:  isLight ? '#FFF3DC' : 'rgba(245,158,11,0.18)',
    danger: isLight ? '#FEE6E6' : 'rgba(239,68,68,0.18)',
    neutral: isLight ? '#F1EDEA' : 'rgba(255,255,255,0.06)',
  }[pill.tint];

  const pillColor = {
    mint:   '#0E9F62',
    amber:  '#B86E00',
    danger: '#C82A2A',
    neutral: tokens.textSec,
  }[pill.tint];

  // Icon tint follows the urgency too: mandatory dues + urgent get the
  // brand orange; everything else gets a calm slate. Subtle but
  // important — keeps the eye on what matters.
  const iconTint =
    item.status === 'paid'   ? tokens.mint
  : pill.tint === 'danger'   ? tokens.danger
  : item.isMandatory         ? tokens.primary
  : tokens.blue;

  return (
    <motion.button
      type="button"
      onClick={onClick}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.04 * index, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className="relative w-full text-left rounded-2xl pl-4 pr-3 py-3 flex items-center gap-3 group overflow-hidden"
      style={{
        background: tokens.card,
        border: `1px solid ${tokens.cardBorder}`,
        boxShadow: isLight
          ? '0 1px 0 rgba(255,255,255,0.7) inset, 0 6px 18px -10px rgba(15,7,3,0.12)'
          : '0 1px 0 rgba(255,255,255,0.02) inset',
      }}
    >
      {/* Left urgency accent bar — colours the card edge by deadline
          state (red overdue / amber soon / mint settled). The neutral
          case stays faint so calm cards don't shout. */}
      <span
        className="absolute left-0 top-0 bottom-0 w-1"
        style={{ background: pillColor, opacity: pill.tint === 'neutral' ? 0.25 : 0.9 }}
        aria-hidden
      />

      {/* Category icon chip */}
      <div
        className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
        style={{
          background: isLight ? hexAlpha(iconTint, 0.10) : hexAlpha(iconTint, 0.16),
          border: `1px solid ${hexAlpha(iconTint, isLight ? 0.18 : 0.22)}`,
        }}
      >
        <Icon size={19} color={iconTint} />
      </div>

      {/* Title + sub */}
      <div className="flex-1 min-w-0">
        <p
          className="text-[14px] font-bold truncate"
          style={{ color: tokens.text }}
        >
          {item.title}
        </p>
        <div className="flex items-center gap-1.5 mt-1">
          {/* Required/Optional as a clear pill, not a faint word — a member
              should know at a glance what they actually owe. */}
          <span
            className="inline-flex items-center gap-1 text-[9.5px] font-extrabold uppercase tracking-wider px-1.5 py-0.5 rounded-md"
            style={
              item.isMandatory
                ? { color: isLight ? '#B45309' : '#FCD9A6', background: isLight ? '#FFF3DC' : 'rgba(245,158,11,0.16)' }
                : { color: tokens.textSec, background: isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.06)' }
            }
          >
            <span
              className="w-1.5 h-1.5 rounded-full"
              style={{ background: item.isMandatory ? '#E0820B' : tokens.textTer }}
            />
            {item.isMandatory ? 'Required' : 'Optional'}
          </span>
          {item.status === 'partial' && typeof item.paidAmount === 'number' && item.paidAmount > 0 && (
            <span
              className="text-[10px] font-bold uppercase tracking-wider"
              style={{ color: tokens.amber }}
            >
              · Part-paid
            </span>
          )}
        </div>

        {/* Partial-payment progress — a thin bar so the member sees how
            much of this due is already settled at a glance. */}
        {item.status === 'partial' && typeof item.paidAmount === 'number' && item.paidAmount > 0 && item.amount > 0 && (
          <div className="flex items-center gap-2 mt-2 pr-1">
            <div
              className="flex-1 h-1 rounded-full overflow-hidden"
              style={{ background: isLight ? 'rgba(15,7,3,0.08)' : 'rgba(255,255,255,0.08)' }}
            >
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, (item.paidAmount / item.amount) * 100)}%`,
                  background: tokens.amber,
                }}
              />
            </div>
            <span className="text-[9.5px] font-extrabold tabular-nums shrink-0" style={{ color: tokens.amber }}>
              {Math.round((item.paidAmount / item.amount) * 100)}%
            </span>
          </div>
        )}
      </div>

      {/* Right: amount + deadline pill */}
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <span
          className="text-[15px] font-extrabold leading-none"
          style={{
            color: tokens.text,
            fontVariantNumeric: 'tabular-nums',
            filter: privacyOn ? 'blur(4px)' : 'none',
          }}
        >
          {formatMoney(item.amount, currencySymbol)}
        </span>
        <span
          className="inline-flex items-center gap-1 text-[10px] font-bold rounded-full px-2 py-0.5"
          style={{
            background: pillBg,
            color: pillColor,
          }}
        >
          {pill.tint === 'danger' && <AlertCircle className="w-2.5 h-2.5" />}
          {pill.label}
        </span>
      </div>

      {/* Chevron */}
      <ChevronRight
        className="w-4 h-4 ml-1 shrink-0 transition-transform group-hover:translate-x-0.5"
        style={{ color: tokens.textTer }}
      />
    </motion.button>
  );
}

// ── Skeleton ────────────────────────────────────────────────────
function DueRowSkeleton({ theme }: { theme: ResolvedTheme }) {
  const t = getDashboardTokens(theme);
  return (
    <div
      className="rounded-2xl px-3.5 py-3 flex items-center gap-3 animate-pulse"
      style={{
        background: t.card,
        border: `1px solid ${t.cardBorder}`,
      }}
    >
      <div
        className="w-11 h-11 rounded-2xl shrink-0"
        style={{ background: theme === 'light' ? '#EEE9E5' : 'rgba(255,255,255,0.05)' }}
      />
      <div className="flex-1 space-y-2">
        <div
          className="h-3.5 rounded"
          style={{ background: theme === 'light' ? '#EEE9E5' : 'rgba(255,255,255,0.05)', width: '60%' }}
        />
        <div
          className="h-2.5 rounded"
          style={{ background: theme === 'light' ? '#F5F1ED' : 'rgba(255,255,255,0.03)', width: '35%' }}
        />
      </div>
      <div className="space-y-2">
        <div
          className="h-4 w-16 rounded"
          style={{ background: theme === 'light' ? '#EEE9E5' : 'rgba(255,255,255,0.05)' }}
        />
        <div
          className="h-3 w-12 rounded-full"
          style={{ background: theme === 'light' ? '#F5F1ED' : 'rgba(255,255,255,0.03)' }}
        />
      </div>
    </div>
  );
}

function hexAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#') || color.length !== 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
