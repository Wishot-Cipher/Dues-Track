/**
 * OptionalContributions — the calm, opt-in counterpart to DueNextList.
 *
 * Non-mandatory dues are NOT debt: paymentService already excludes them
 * from the Outstanding hero / balance. But members should still be able
 * to SEE them and chip in if they want. Surfacing them inside "Due Next"
 * made the dashboard read as "you owe all of this" — so they live here
 * instead, in a softer mint-tinted card that explicitly says they don't
 * affect the balance and can be skipped.
 *
 * Hides itself entirely when there are no optional dues, so the section
 * never shows an empty shell.
 */

import { motion } from 'framer-motion';
import { Heart, GraduationCap, BookOpen, Ticket, Sparkles, Calendar, Wallet } from 'lucide-react';
import type { ResolvedTheme } from '@/hooks/useTheme';
import { getDashboardTokens } from '@/hooks/useTheme';
import type { DueNextItem } from './DueNextList';

// Small category → icon pick. Optional dues are "give" items, so they
// default to a heart rather than a wallet.
function iconForCategory(key?: string | null) {
  const k = (key || '').toLowerCase();
  if (k.includes('tuition') || k.includes('fee')) return GraduationCap;
  if (k.includes('book') || k.includes('material')) return BookOpen;
  if (k.includes('event') || k.includes('ticket')) return Ticket;
  if (k.includes('party') || k.includes('social')) return Sparkles;
  if (k.includes('calendar') || k.includes('annual')) return Calendar;
  if (k.includes('wallet') || k.includes('levy')) return Wallet;
  return Heart;
}

export interface OptionalContributionsProps {
  theme: ResolvedTheme;
  /** Currency symbol. Defaults to ₦. */
  currencySymbol?: string;
  /** Privacy mask state — masks amounts when on. */
  privacyOn?: boolean;
  /** The optional (non-mandatory) dues to render. */
  items: DueNextItem[];
  /** Tap handler for the "Give" CTA on a row. */
  onGive?: (id: string) => void;
}

function formatMoney(amount: number, symbol: string): string {
  return `${symbol}${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  })}`;
}

export default function OptionalContributions({
  theme,
  currencySymbol = '₦',
  privacyOn = false,
  items,
  onGive,
}: OptionalContributionsProps) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  // Nothing optional → render nothing (no empty shell).
  if (!items || items.length === 0) return null;

  return (
    <section className="space-y-3">
      {/* ── Section header ───────────────────────────────────── */}
      <header className="px-1">
        <p
          className="text-[10px] uppercase tracking-[0.14em] font-bold"
          style={{ color: t.mint }}
        >
          Give if you'd like
        </p>
        <h2
          className="text-base sm:text-lg font-extrabold tracking-tight"
          style={{ color: t.text }}
        >
          Optional contributions
        </h2>
      </header>

      <div
        className="rounded-2xl p-3 sm:p-4 space-y-2.5"
        style={{
          background: isLight ? '#F5FFFA' : 'rgba(48,255,172,0.05)',
          border: `1px solid ${isLight ? '#CCF2DE' : 'rgba(48,255,172,0.16)'}`,
        }}
      >
        <p className="text-xs px-0.5" style={{ color: t.textSec }}>
          These don't count toward your balance — pay only if you'd like to chip in.
        </p>

        {items.map((item, i) => {
          const Icon = iconForCategory(item.categoryKey) || Heart;
          const isPending = item.status === 'pending';
          return (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
              className="rounded-xl px-3 py-2.5 flex items-center gap-3"
              style={{ background: t.card, border: `1px solid ${t.cardBorder}` }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  background: isLight ? 'rgba(14,159,98,0.10)' : 'rgba(48,255,172,0.14)',
                  border: `1px solid ${isLight ? 'rgba(14,159,98,0.18)' : 'rgba(48,255,172,0.22)'}`,
                }}
              >
                <Icon size={18} color={t.mint} />
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-[13.5px] font-bold truncate" style={{ color: t.text }}>
                  {item.title}
                </p>
                <p
                  className="text-[11px] font-semibold tabular-nums mt-0.5"
                  style={{ color: t.textSec }}
                >
                  {privacyOn ? '••••' : formatMoney(item.amount, currencySymbol)}
                  {isPending ? ' · Awaiting review' : ' · Optional'}
                </p>
              </div>

              <button
                type="button"
                onClick={() => onGive?.(item.id)}
                disabled={isPending}
                className="px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-[0.97] disabled:opacity-60 shrink-0"
                style={{
                  background: isPending ? t.cardBorder : t.mint,
                  color: isPending ? t.textSec : '#FFFFFF',
                  boxShadow: isPending ? 'none' : `0 6px 16px -8px ${t.mint}`,
                }}
              >
                {isPending ? 'Pending' : 'Give'}
              </button>
            </motion.div>
          );
        })}
      </div>
    </section>
  );
}
