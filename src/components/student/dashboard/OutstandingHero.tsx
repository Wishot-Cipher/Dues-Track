/**
 * OutstandingHero — the orange-gradient hero showing the member's
 * total outstanding amount + a donut visualising paid vs pending.
 *
 * Visual recipe (faithfully matches the Payvexo mockup):
 *   • Card: deep orange → bright orange diagonal gradient, with a
 *     subtle inner highlight along the top edge
 *   • Background art: layered wavy strokes (white, very low opacity)
 *     that emerge from the upper-left and arc across — this is the
 *     "line thing at the back" the brief called out specifically
 *   • Top-left small wallet chip in a circular white pill
 *   • Big amount: ₦ amount in tabular-nums so digits don't jitter
 *   • Right side: SVG donut with the count + label in the center
 *   • Tiny status pill at the bottom-left ("2 dues pending")
 *   • Sparkle in the top-right corner for warmth
 *   • Privacy mask supported (taps mask the amount)
 *
 * Theme-aware: in light mode the surrounding page is cream so the
 * orange pops. In dark mode the same hero renders correctly against
 * the deep-ember page background — no special-casing needed.
 *
 * The component is purely presentational. Pass in the numbers and
 * the privacy state; the parent owns the data.
 */

import { motion } from 'framer-motion';
import { Eye, EyeOff, Sparkles, Wallet } from 'lucide-react';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

export interface OutstandingHeroProps {
  /** Total amount owed (in the org's currency, naira units not kobo). */
  outstandingAmount: number;
  /** Currency symbol — defaults to ₦. */
  currencySymbol?: string;
  /** Number of pending dues. */
  pendingCount: number;
  /** Total dues the member has been assigned (for the donut completion). */
  totalCount?: number;
  /** Privacy mask state. */
  privacyOn: boolean;
  onTogglePrivacy: () => void;
  /** Optional CTA label + onClick. If omitted, no button rendered. */
  ctaLabel?: string;
  onCtaClick?: () => void;
}

function formatMoney(amount: number, symbol: string): string {
  // Always show two decimals so the figure feels final, not rounded.
  return `${symbol}${amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export default function OutstandingHero({
  outstandingAmount,
  currencySymbol = '₦',
  pendingCount,
  totalCount,
  privacyOn,
  onTogglePrivacy,
  ctaLabel,
  onCtaClick,
}: OutstandingHeroProps) {
  const { theme } = useTheme();
  const dt = getDashboardTokens(theme);

  // ── Donut math ───────────────────────────────────────────────
  // We render a single ring. The "pending" arc is the unfilled
  // portion — visually communicating "this is what you still owe".
  // When totalCount isn't known, we treat the whole ring as pending.
  const total = Math.max(1, totalCount ?? pendingCount);
  const pending = Math.max(0, Math.min(total, pendingCount));
  const paid = Math.max(0, total - pending);
  const paidPct = paid / total;
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  // Stroke-dasharray trick: paid arc is drawn solid, the rest is gap.
  const paidArc = paidPct * circumference;

  // The mockup's amount is one big visually-confident figure. We split
  // currency symbol + integer + decimals so each part is tunable.
  const displayed = privacyOn ? '•••••' : formatMoney(outstandingAmount, currencySymbol);

  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full rounded-[28px] overflow-hidden"
      style={{
        background:
          'linear-gradient(135deg, #FF7A1E 0%, #FF6803 38%, #E55A02 100%)',
        boxShadow:
          '0 18px 40px -20px rgba(255, 104, 3, 0.55),' +
          ' 0 4px 12px -2px rgba(255, 104, 3, 0.25),' +
          ' inset 0 1px 0 rgba(255, 255, 255, 0.22)',
      }}
    >
      {/* ── Wavy line decoration (the "line thing at the back") ──
          Three nested paths give it depth — each at a different opacity
          so they read as parallel ribbons. Path geometry intentionally
          imperfect: hand-drawn feel beats a textbook arc. */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 380 200"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        <defs>
          <linearGradient id="oh-line" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%"   stopColor="#fff" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#fff" stopOpacity="0.05" />
          </linearGradient>
        </defs>
        {/* Outer wave (boldest, lowest) */}
        <path
          d="M -10 60 C 60 20, 140 30, 200 80 S 320 130, 400 100"
          stroke="url(#oh-line)"
          strokeWidth={1.5}
          strokeLinecap="round"
          opacity={0.9}
        />
        {/* Middle wave */}
        <path
          d="M -10 90 C 70 50, 150 60, 210 100 S 320 150, 400 120"
          stroke="#fff"
          strokeWidth={1.25}
          strokeLinecap="round"
          opacity={0.20}
        />
        {/* Inner wave (faintest) */}
        <path
          d="M -10 120 C 80 80, 160 95, 220 130 S 320 175, 400 150"
          stroke="#fff"
          strokeWidth={1}
          strokeLinecap="round"
          opacity={0.12}
        />
      </svg>

      {/* Subtle vignette at the bottom-right so the donut sits on a
          slightly darker patch — improves contrast without a hard edge. */}
      <div
        className="absolute pointer-events-none"
        style={{
          right: -40,
          bottom: -40,
          width: 220,
          height: 220,
          background: 'radial-gradient(circle, rgba(0,0,0,0.16) 0%, transparent 65%)',
        }}
      />

      {/* Top-right sparkle — small piece of delight */}
      <Sparkles
        className="absolute"
        style={{ top: 14, right: 14, opacity: 0.55 }}
        size={14}
        color="#fff"
      />

      {/* ── Content row ───────────────────────────────────────── */}
      <div className="relative px-5 sm:px-6 py-5 sm:py-6 flex items-center gap-4">
        {/* Left: label + amount + status pill + privacy toggle */}
        <div className="flex-1 min-w-0">
          {/* Wallet chip */}
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-full flex items-center justify-center shrink-0"
              style={{
                background: 'rgba(255, 255, 255, 0.18)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
              }}
            >
              <Wallet size={16} color="#fff" />
            </div>
            <p
              className="text-[11px] uppercase tracking-[0.12em] font-semibold"
              style={{ color: 'rgba(255, 255, 255, 0.78)' }}
            >
              Total Outstanding
            </p>
            {/* Privacy toggle — same row, secondary visual weight */}
            <button
              type="button"
              onClick={onTogglePrivacy}
              className="ml-auto sm:ml-3 h-8 rounded-full flex items-center justify-center gap-1.5 px-2.5 transition-colors"
              style={{
                color: '#fff',
                background: 'rgba(255, 255, 255, 0.16)',
                border: '1px solid rgba(255, 255, 255, 0.22)',
                boxShadow: '0 1px 2px rgba(0, 0, 0, 0.12)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.24)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = 'rgba(255, 255, 255, 0.16)';
              }}
              aria-label={privacyOn ? 'Show balance' : 'Hide balance'}
            >
              {privacyOn ? <EyeOff size={15} color={theme === 'light' ? dt.primary : '#fff'} /> : <Eye size={15} color={theme === 'light' ? dt.primary : '#fff'} />}
              <span className="hidden sm:inline text-[11px] font-semibold uppercase tracking-[0.12em]" style={{ color: '#fff' }}>
                {privacyOn ? 'Show' : 'Hide'}
              </span>
            </button>
          </div>

          {/* The big number */}
          <div
            className="mt-2 text-3xl sm:text-4xl font-black text-white leading-none"
            style={{
              fontVariantNumeric: 'tabular-nums',
              letterSpacing: '-0.02em',
              filter: privacyOn ? 'blur(4px)' : 'none',
              transition: 'filter 0.2s',
            }}
          >
            {displayed}
          </div>

          {/* Status pill */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{
                background: 'rgba(255, 255, 255, 0.18)',
                color: '#fff',
                backdropFilter: 'blur(4px)',
              }}
            >
              <span
                className="w-1.5 h-1.5 rounded-full"
                style={{
                  background: '#fff',
                  boxShadow: '0 0 0 3px rgba(255,255,255,0.25)',
                }}
              />
              {pendingCount === 0
                ? 'All clear'
                : `${pendingCount} ${pendingCount === 1 ? 'due' : 'dues'} pending`}
            </span>

            {ctaLabel && (
              <button
                type="button"
                onClick={onCtaClick}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-white hover:underline ml-auto"
              >
                {ctaLabel} <span aria-hidden>→</span>
              </button>
            )}
          </div>
        </div>

        {/* Right: donut */}
        <div className="relative shrink-0">
          <svg width={104} height={104} viewBox="0 0 100 100" className="block">
            {/* Track (full circle, low-opacity white) */}
            <circle
              cx={50}
              cy={50}
              r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.22)"
              strokeWidth={9}
            />
            {/* Paid arc (solid white). Rotated -90° so 0% starts at top. */}
            <motion.circle
              cx={50}
              cy={50}
              r={radius}
              fill="none"
              stroke="#fff"
              strokeWidth={9}
              strokeLinecap="round"
              strokeDasharray={`${paidArc} ${circumference}`}
              transform="rotate(-90 50 50)"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.6, delay: 0.15 }}
            />
          </svg>

          {/* Inner label */}
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span
              className="text-2xl font-black text-white leading-none"
              style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.02em' }}
            >
              {pendingCount}
            </span>
            <span
              className="text-[10px] uppercase tracking-[0.14em] font-semibold mt-1"
              style={{ color: 'rgba(255, 255, 255, 0.82)' }}
            >
              {pendingCount === 1 ? 'Pending' : 'Pending'}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
