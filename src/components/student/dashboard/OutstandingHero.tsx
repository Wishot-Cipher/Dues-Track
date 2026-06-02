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

import { motion, useMotionValue, useTransform, animate, useSpring } from 'framer-motion';
import { Eye, EyeOff, Sparkles, TrendingUp, CheckCircle2 } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

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
  /** Optional member ID — surfaces a faint embossed line at the foot of the card. */
  memberId?: string | null;
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
  memberId,
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

  // ── Animated count-up of the balance — premium fintech touch.
  //   The integer climbs from 0 to its real value over ~1.1s on mount.
  const target = Math.max(0, Math.round(outstandingAmount));
  const motionVal = useMotionValue(0);
  const display = useTransform(motionVal, (v) => Math.round(v).toLocaleString('en-NG'));
  const [displayInt, setDisplayInt] = useState('0');
  useEffect(() => {
    const controls = animate(motionVal, target, {
      duration: 1.15,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = display.on('change', setDisplayInt);
    return () => { controls.stop(); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // ── Mouse-tracked highlight — a subtle radial brighten that follows
  //   the cursor. Springs so it feels physical, not jumpy. Only kicks
  //   in on pointer-fine devices (CSS handles that via pointer-events).
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mx = useSpring(50, { stiffness: 120, damping: 18 });
  const my = useSpring(50, { stiffness: 120, damping: 18 });
  const highlight = useTransform<number, string>(
    [mx, my],
    ([x, y]) => `radial-gradient(280px 200px at ${x}% ${y}%, rgba(255,255,255,0.22), transparent 60%)`,
  );

  // ── Contextual status copy — surfaces "what to do" under the amount.
  let statusLabel: string;
  let StatusIcon: typeof TrendingUp;
  if (isZero) {
    statusLabel = 'All paid up — nice work';
    StatusIcon = CheckCircle2;
  } else if (paidPct >= 0.66) {
    statusLabel = 'Almost there — keep going';
    StatusIcon = TrendingUp;
  } else if (paidPct >= 0.33) {
    statusLabel = 'Making steady progress';
    StatusIcon = TrendingUp;
  } else {
    statusLabel = `${pendingCount} ${pendingCount === 1 ? 'item' : 'items'} need your attention`;
    StatusIcon = Sparkles;
  }

  return (
    <motion.div
      ref={wrapRef}
      onMouseMove={(e) => {
        const r = wrapRef.current?.getBoundingClientRect();
        if (!r) return;
        mx.set(((e.clientX - r.left) / r.width) * 100);
        my.set(((e.clientY - r.top) / r.height) * 100);
      }}
      onMouseLeave={() => { mx.set(50); my.set(50); }}
      initial={{ opacity: 0, y: 16, scale: 0.985 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full rounded-[28px] overflow-hidden"
      style={{
        // Multi-stop gradient — toned down from the previous "neon
        // orange" with warmer, earthier stops. Reads as a real card
        // (Monzo Hot Coral / Revolut amber) instead of a CSS swatch.
        // The dark hot-spot in the lower right is what gives it that
        // "light falling on a curved surface" feel.
        background:
          'radial-gradient(120% 110% at 18% 0%, #FF9558 0%, #F47424 28%, #E25E0B 58%, #B84800 100%)',
        boxShadow:
          // Layer 1: rich tinted drop shadow (the card is lifted) ─
          '0 22px 50px -22px rgba(184, 72, 0, 0.55),' +
          // Layer 2: tight drop shadow for crisp edge against bg ─
          ' 0 4px 12px -2px rgba(184, 72, 0, 0.28),' +
          // Layer 3: inset highlight along the top edge (bevel) ─
          ' inset 0 1px 0 rgba(255, 255, 255, 0.28),' +
          // Layer 4: inset darker line along the bottom (depth) ─
          ' inset 0 -1px 0 rgba(0, 0, 0, 0.10)',
      }}
    >
      {/* ── Mouse-tracked radial highlight — follows the cursor across
            the card. Reads as "real material catching the light". */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: highlight, mixBlendMode: 'soft-light' }}
        aria-hidden
      />

      {/* ── Holographic stripe — narrow rainbow band low-opacity,
            visible only on hover. The "premium card foil" detail. */}
      <div
        className="absolute inset-0 pointer-events-none opacity-0 hover:opacity-100 transition-opacity duration-500"
        style={{
          background:
            'linear-gradient(115deg, transparent 38%, rgba(255,228,178,0.10) 44%, rgba(255,180,255,0.14) 49%, rgba(176,222,255,0.10) 54%, transparent 60%)',
          mixBlendMode: 'overlay',
        }}
        aria-hidden
      />
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

      {/* ── Wavy line ribbons (the "line thing at the back") ──
            Now with a slightly hand-drawn cadence: the strokes wobble
            instead of being perfect ease curves, and an extra "scribble"
            line gives the card a sketched, human feel — the kind of
            detail you'd see on a postcard, not a stock template. */}
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
        <path d="M -10 58 C 60 24, 138 28, 200 80 S 318 132, 400 96"
              stroke="url(#oh-line)" strokeWidth={1.5} strokeLinecap="round" opacity={0.95} />
        <path d="M -10 92 C 68 48, 150 62, 212 100 S 322 148, 400 124"
              stroke="#fff" strokeWidth={1.25} strokeLinecap="round" opacity={0.22} />
        <path d="M -10 122 C 80 78, 158 96, 222 128 S 322 178, 400 148"
              stroke="#fff" strokeWidth={1} strokeLinecap="round" opacity={0.13} />
        {/* Hand-drawn underline — a wobbly highlight you'd doodle in a
            notebook under the headline. Sits behind the "Total Outstanding"
            label and the amount. */}
        <path
          d="M 22 102 q 30 -6 64 -2 t 70 0"
          stroke="#FFFFFF"
          strokeWidth={2.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          opacity={0.18}
          fill="none"
        />
      </svg>

      {/* ── Soft "thumbprint" mark in the lower-left — three tiny dots
            and an arc, like a stamp left by a hand. Adds warmth and the
            sense that a real person designed this. */}
      <svg
        className="absolute pointer-events-none"
        style={{ left: 14, bottom: 22, opacity: 0.18 }}
        width={22} height={26} viewBox="0 0 22 26" fill="none" aria-hidden
      >
        <path d="M3 13 C 3 7, 8 3, 11 3 C 15 3, 19 7, 19 13 C 19 18, 16 22, 11 24"
              stroke="#FFFFFF" strokeWidth={1.4} strokeLinecap="round" />
        <path d="M7 13 C 7 10, 9 8, 11 8 C 13 8, 15 10, 15 13 C 15 16, 13 18, 11 20"
              stroke="#FFFFFF" strokeWidth={1.2} strokeLinecap="round" />
        <circle cx={11} cy={13} r={1.6} fill="#FFFFFF" />
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
      <div className="relative px-5 sm:px-6 pt-5 sm:pt-6 pb-8 sm:pb-9 flex items-center gap-4">

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

          {/* Big amount — premium fintech typography with live count-up.
              The prefix is half-height, the integer is the headline,
              the decimals are a muted trailing weight on the same
              baseline. The integer climbs from 0 on mount. */}
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
                  {displayInt}
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

          {/* Contextual status line — what's happening, in one breath. */}
          <motion.p
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold"
            style={{ color: 'rgba(255,255,255,0.85)' }}
          >
            <StatusIcon size={12} />
            {statusLabel}
          </motion.p>

          {/* Status pill + CTA */}
          <div className="mt-3 flex items-center gap-2 flex-wrap">
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
                  className="absolute w-2.5 h-2.5 rounded-full animate-ping"
                  style={{ background: '#fff', opacity: 0.45 }}
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

      {/* ── Embossed footer row — member ID + brand mark, set very low
            opacity to read as a "card surface" detail, not an info row.
            Same finish you see on the bottom of real bank cards. */}
      {(memberId || true) && (
        <div
          className="absolute bottom-2 left-5 right-5 flex items-end justify-between pointer-events-none select-none"
          aria-hidden
        >
          <span
            className="text-[9px] font-bold tracking-[0.32em] uppercase"
            style={{
              color: 'rgba(255,255,255,0.55)',
              textShadow: '0 1px 0 rgba(0,0,0,0.18), 0 0 1px rgba(255,255,255,0.4)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
            }}
          >
            {memberId ? `MEMBER · ${memberId}` : 'PAYVEXO · MEMBER'}
          </span>
          <span
            className="text-[9px] font-extrabold tracking-[0.32em] uppercase"
            style={{
              color: 'rgba(255,255,255,0.55)',
              textShadow: '0 1px 0 rgba(0,0,0,0.18)',
            }}
          >
            PVX
          </span>
        </div>
      )}

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

      {/* ── Tiny celebratory burst when fully paid — three sparkle
            chips fade in around the donut. Reads as "achievement",
            not as decoration. */}
      {isZero && (
        <>
          {[
            { top: 18, right: 110, delay: 0.6, size: 10 },
            { top: 60, right: 28,  delay: 0.8, size: 12 },
            { top: 110, right: 90, delay: 1.0, size: 9 },
          ].map((s, i) => (
            <motion.span
              key={i}
              className="absolute pointer-events-none"
              style={{ top: s.top, right: s.right, color: '#FFFFFF' }}
              initial={{ scale: 0, opacity: 0, rotate: -20 }}
              animate={{ scale: 1, opacity: 0.85, rotate: 0 }}
              transition={{ delay: s.delay, duration: 0.5, type: 'spring', stiffness: 240, damping: 18 }}
              aria-hidden
            >
              <Sparkles size={s.size} />
            </motion.span>
          ))}
        </>
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
