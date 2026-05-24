/**
 * OutstandingHero — the headline orange card on the student dashboard.
 *
 * World-class fintech card design. Reference points: Revolut "Personal"
 * card, Wise "Balance" card, Cash App home tile. Things that make those
 * cards read as PREMIUM and not "AI-generated":
 *
 *   • Real dimensionality — multi-layered shadows, inset top-edge
 *     highlight (mimics a card's bevel), and a darker hot spot in the
 *     lower right (light falling on a curved surface).
 *   • Tabular numbers with split prefix/integer/decimal styling — the
 *     decimals visually recede so the integer reads as the headline.
 *   • Physical-card "chip" (gold pad with contact lines), not a
 *     Lucide icon — the same finish you see on a real bank card.
 *   • Donut: animated paid arc with end-cap dot anchor, plus a thin
 *     two-tone progress hairline along the bottom of the card.
 *   • Foil shimmer sweeps across once on mount — premium-card finish
 *     (Apple Card / Curve style).
 *   • Privacy mask blurs the amount in a "deliberate redaction" way.
 *
 * The hero always renders orange — that's the brand anchor. The
 * surrounding page can be light or dark; the card pops on both.
 */

import { motion } from 'framer-motion';
import { Eye, EyeOff, Sparkles } from 'lucide-react';

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

// Split amount into integer and decimal so we can render the decimals
// at a slightly muted weight — gives the number a premium bank-balance
// feel instead of a flat "₦18,500.00" string.
function splitAmount(amount: number, symbol: string): {
  prefix: string; integer: string; decimal: string;
} {
  const fixed = amount.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  const [int, dec] = fixed.split('.');
  return { prefix: symbol, integer: int, decimal: dec || '00' };
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
  // ── Donut math ───────────────────────────────────────────────
  const total = Math.max(1, totalCount ?? Math.max(pendingCount, 1));
  const pending = Math.max(0, Math.min(total, pendingCount));
  const paid = Math.max(0, total - pending);
  const paidPct = paid / total;
  const radius = 38;
  const circumference = 2 * Math.PI * radius;
  const paidArc = paidPct * circumference;

  // End-cap dot position — sits at the tip of the paid arc so the eye
  // has something to anchor on. Math: start at top (-90°), travel
  // paidPct of the way clockwise.
  const angleDeg = -90 + paidPct * 360;
  const angleRad = (angleDeg * Math.PI) / 180;
  const capX = 50 + radius * Math.cos(angleRad);
  const capY = 50 + radius * Math.sin(angleRad);

  const isZero = outstandingAmount <= 0;
  const amount = splitAmount(outstandingAmount, currencySymbol);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full rounded-[28px] overflow-hidden"
      style={{
        // Multi-stop gradient with a darker hot-spot in lower-right
        // — gives the card the "light falling on a curved surface" feel
        // that real card photographs have.
        background:
          'radial-gradient(120% 110% at 18% 0%, #FF8C42 0%, #FF7A1E 28%, #FF6803 55%, #D85402 100%)',
        boxShadow:
          // Layer 1: rich tinted drop shadow (the card is lifted) ─
          '0 22px 50px -22px rgba(216, 84, 2, 0.65),' +
          // Layer 2: tight drop shadow for crisp edge against bg ─
          ' 0 4px 12px -2px rgba(216, 84, 2, 0.30),' +
          // Layer 3: inset highlight along the top edge (bevel) ─
          ' inset 0 1px 0 rgba(255, 255, 255, 0.30),' +
          // Layer 4: inset darker line along the bottom (depth) ─
          ' inset 0 -1px 0 rgba(0, 0, 0, 0.08)',
      }}
    >
      {/* ── Foil shimmer — sweeps across once on mount.
          A diagonal white-translucent band that slides from left to
          right. Apple-Card-style "fresh from the wallet" finish. */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(115deg, transparent 30%, rgba(255,255,255,0.20) 48%, rgba(255,255,255,0.32) 50%, rgba(255,255,255,0.20) 52%, transparent 70%)',
          mixBlendMode: 'overlay',
        }}
        initial={{ x: '-110%' }}
        animate={{ x: '110%' }}
        transition={{ duration: 1.4, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden
      />

      {/* ── Wavy line ribbons (the "line thing at the back") ── */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 380 220"
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
        <path d="M -10 60 C 60 20, 140 30, 200 80 S 320 130, 400 100"
              stroke="url(#oh-line)" strokeWidth={1.5} strokeLinecap="round" opacity={0.95} />
        <path d="M -10 90 C 70 50, 150 60, 210 100 S 320 150, 400 120"
              stroke="#fff" strokeWidth={1.25} strokeLinecap="round" opacity={0.22} />
        <path d="M -10 120 C 80 80, 160 95, 220 130 S 320 175, 400 150"
              stroke="#fff" strokeWidth={1} strokeLinecap="round" opacity={0.13} />
      </svg>

      {/* ── Bottom-right vignette so the donut sits on a slightly
          darker patch — improves contrast without a hard edge. */}
      <div
        className="absolute pointer-events-none"
        style={{
          right: -60, bottom: -60, width: 260, height: 260,
          background: 'radial-gradient(circle, rgba(0,0,0,0.20) 0%, transparent 65%)',
        }}
      />

      {/* ── Sparkle in top-right (small piece of delight) ── */}
      <Sparkles
        className="absolute"
        style={{ top: 14, right: 14, opacity: 0.55, color: '#fff' }}
        size={14}
      />

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="relative px-5 sm:px-6 py-5 sm:py-6 flex items-center gap-4">

        {/* Left column */}
        <div className="flex-1 min-w-0">
          {/* Wallet chip row */}
          <div className="flex items-center gap-2.5">
            <WalletChip />
            <p
              className="text-[10px] sm:text-[11px] uppercase tracking-[0.14em] font-bold"
              style={{ color: 'rgba(255, 255, 255, 0.82)' }}
            >
              Total Outstanding
            </p>
            <button
              type="button"
              onClick={onTogglePrivacy}
              className="ml-auto sm:ml-3 w-7 h-7 rounded-full flex items-center justify-center hover:bg-white/15 transition-colors"
              style={{ color: 'rgba(255, 255, 255, 0.78)' }}
              aria-label={privacyOn ? 'Show balance' : 'Hide balance'}
            >
              {privacyOn ? <EyeOff size={14} /> : <Eye size={14} />}
            </button>
          </div>

          {/* Big amount — premium fintech typography. The prefix is
              half-height, the integer is the headline, the decimals
              are a muted trailing weight on the same baseline. */}
          <div className="mt-2.5 flex items-baseline">
            {privacyOn ? (
              <span
                className="text-3xl sm:text-[40px] font-black text-white leading-none tracking-tight"
                style={{ filter: 'blur(8px)', userSelect: 'none' }}
              >
                ••••••••
              </span>
            ) : (
              <>
                <span
                  className="text-xl sm:text-2xl font-bold text-white leading-none mr-1"
                  style={{ opacity: 0.85 }}
                >
                  {amount.prefix}
                </span>
                <span
                  className="text-3xl sm:text-[40px] font-black text-white leading-none tracking-tight"
                  style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.025em' }}
                >
                  {amount.integer}
                </span>
                <span
                  className="text-lg sm:text-xl font-bold leading-none ml-0.5"
                  style={{ color: 'rgba(255, 255, 255, 0.65)', fontVariantNumeric: 'tabular-nums' }}
                >
                  .{amount.decimal}
                </span>
              </>
            )}
          </div>

          {/* Status pill + CTA */}
          <div className="mt-3.5 flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold"
              style={{
                background: 'rgba(255, 255, 255, 0.18)',
                color: '#fff',
                backdropFilter: 'blur(4px)',
              }}
            >
              <span className="relative flex items-center justify-center w-1.5 h-1.5">
                <span
                  className="absolute w-2.5 h-2.5 rounded-full"
                  style={{ background: '#fff', opacity: 0.35 }}
                />
                <span className="absolute w-1.5 h-1.5 rounded-full bg-white" />
              </span>
              {isZero
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

        {/* Right column — premium donut */}
        <div className="relative shrink-0">
          <svg width={108} height={108} viewBox="0 0 100 100" className="block">
            <defs>
              <linearGradient id="oh-paid-arc" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%"   stopColor="#fff" stopOpacity="1" />
                <stop offset="100%" stopColor="#fff" stopOpacity="0.85" />
              </linearGradient>
            </defs>

            {/* Track (subtle white) */}
            <circle
              cx={50} cy={50} r={radius}
              fill="none"
              stroke="rgba(255, 255, 255, 0.22)"
              strokeWidth={9}
            />

            {/* Paid arc — drawn from top, animated on mount */}
            <motion.circle
              cx={50} cy={50} r={radius}
              fill="none"
              stroke="url(#oh-paid-arc)"
              strokeWidth={9}
              strokeLinecap="round"
              transform="rotate(-90 50 50)"
              strokeDasharray={`${circumference} ${circumference}`}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference - paidArc }}
              transition={{ duration: 1.1, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
            />

            {/* End-cap dot at the tip of the paid arc — only when
                there's actually any paid progress, otherwise it'd sit
                at 12 o'clock and look like a decoration. */}
            {paid > 0 && (
              <motion.circle
                cx={capX} cy={capY} r={3}
                fill="#fff"
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.3, delay: 1.0 }}
              />
            )}
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
              className="text-[9px] uppercase tracking-[0.14em] font-bold mt-1"
              style={{ color: 'rgba(255, 255, 255, 0.85)' }}
            >
              Pending
            </span>
            {/* Tiny "of total" subline only when total is meaningful */}
            {totalCount && totalCount > pendingCount && (
              <span
                className="text-[9px] font-bold mt-0.5"
                style={{ color: 'rgba(255, 255, 255, 0.55)' }}
              >
                of {totalCount}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* ── Bottom hairline progress ribbon ──
          A thin two-tone bar at the very bottom of the card gives a
          second, more obvious read on "how much done". Reads as a
          refined "card finish" detail. */}
      {totalCount && totalCount > 0 && paid > 0 && (
        <div
          className="absolute bottom-0 inset-x-0 h-[3px] overflow-hidden"
          style={{ background: 'rgba(255, 255, 255, 0.12)' }}
        >
          <motion.div
            className="h-full"
            style={{ background: 'linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.85) 100%)' }}
            initial={{ width: 0 }}
            animate={{ width: `${(paid / totalCount) * 100}%` }}
            transition={{ duration: 1.1, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      )}
    </motion.div>
  );
}

// ── WalletChip — physical-card style chip pad. Same recipe as the
// chip on the Pay-with card but smaller. Anchors the "this is a
// premium fintech card" reading at first glance.
function WalletChip() {
  return (
    <div
      className="relative w-9 h-9 rounded-full flex items-center justify-center shrink-0"
      style={{
        background: 'rgba(255, 255, 255, 0.20)',
        backdropFilter: 'blur(8px)',
        border: '1px solid rgba(255, 255, 255, 0.32)',
        boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.18), 0 4px 10px -4px rgba(0, 0, 0, 0.18)',
      }}
      aria-hidden
    >
      <div
        className="relative w-4 h-3 rounded-[3px] overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, #F8D571 0%, #C79B2A 100%)',
          boxShadow: 'inset 0 0 0 0.5px rgba(0,0,0,0.22)',
        }}
      >
        <div className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2"
             style={{ background: 'rgba(0,0,0,0.30)' }} />
        <div className="absolute top-1/2 left-0 right-0 h-px -translate-y-1/2"
             style={{ background: 'rgba(0,0,0,0.30)' }} />
      </div>
    </div>
  );
}
