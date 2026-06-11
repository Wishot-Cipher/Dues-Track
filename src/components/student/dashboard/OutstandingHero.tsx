/**
 * OutstandingHero — the headline balance card on the student dashboard.
 *
 * Design intent: the BALANCE is the hero. Modern fintech home cards
 * (Revolut, Mercury, Cash App, Wise) put one big number front-and-centre
 * and let everything else recede. The previous version layered a second
 * big number (a donut), a holographic stripe, foil, ribbons, a thumbprint,
 * a vignette, a status pill, an embossed footer and a celebration burst on
 * top of each other — so the eye had nowhere to land.
 *
 * What's kept (premium, not noisy):
 *   • Warm multi-stop gradient + layered shadow + top-edge bevel — the
 *     card reads as a real, lit object.
 *   • One foil shimmer that sweeps once on mount.
 *   • A cursor-tracked highlight (fine-pointer only) for a physical feel.
 *   • Count-up on the integer, premium split-weight typography.
 *   • A single slim "dues settled" progress bar — the progress info, with
 *     zero competition for the balance.
 *   • One clear primary action.
 *
 * Everything decorative that fought the balance for attention is gone.
 */

import { motion, useMotionValue, useTransform, animate, useSpring } from 'framer-motion';
import { Eye, EyeOff, ArrowRight, CheckCircle2, TrendingUp, Clock } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';

export interface OutstandingHeroProps {
  /** Total amount owed (in the org's currency, naira units not kobo). */
  outstandingAmount: number;
  /** Currency symbol — defaults to ₦. */
  currencySymbol?: string;
  /** Number of pending dues. */
  pendingCount: number;
  /** Total dues the member has been assigned (for the progress bar). */
  totalCount?: number;
  /** Privacy mask state. */
  privacyOn: boolean;
  onTogglePrivacy: () => void;
  /** Optional CTA label + onClick. If omitted, no button rendered. */
  ctaLabel?: string;
  onCtaClick?: () => void;
  /** Optional member ID — kept for API compatibility (no longer shown). */
  memberId?: string | null;
}

// Split the amount so the decimals render at a muted weight — gives the
// number a premium bank-balance feel rather than a flat string.
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
  // ── Progress math (for the slim bar only — no competing number) ──
  const total = Math.max(1, totalCount ?? Math.max(pendingCount, 1));
  const pending = Math.max(0, Math.min(total, pendingCount));
  const paid = Math.max(0, total - pending);
  const paidPct = paid / total;
  const settledPct = Math.round(paidPct * 100);
  const hasProgress = total > 1;

  const isZero = outstandingAmount <= 0;
  const amount = splitAmount(outstandingAmount, currencySymbol);

  // ── Count-up of the balance integer on mount. ──
  const target = Math.max(0, Math.round(outstandingAmount));
  const motionVal = useMotionValue(0);
  const display = useTransform(motionVal, (v) => Math.round(v).toLocaleString('en-NG'));
  const [displayInt, setDisplayInt] = useState('0');
  useEffect(() => {
    const controls = animate(motionVal, target, {
      duration: 1.05,
      ease: [0.22, 1, 0.36, 1],
    });
    const unsub = display.on('change', setDisplayInt);
    return () => { controls.stop(); unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target]);

  // ── Cursor-tracked highlight — subtle, fine-pointer only. ──
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const mx = useSpring(50, { stiffness: 120, damping: 18 });
  const my = useSpring(50, { stiffness: 120, damping: 18 });
  const highlight = useTransform<number, string>(
    [mx, my],
    ([x, y]) => `radial-gradient(300px 220px at ${x}% ${y}%, rgba(255,255,255,0.18), transparent 60%)`,
  );

  // ── One status line under the balance. ──
  let statusLabel: string;
  let StatusIcon: typeof TrendingUp;
  if (isZero) {
    statusLabel = "You're all paid up";
    StatusIcon = CheckCircle2;
  } else if (paidPct >= 0.5) {
    statusLabel = `Almost there — ${settledPct}% settled`;
    StatusIcon = TrendingUp;
  } else {
    statusLabel = `${pendingCount} ${pendingCount === 1 ? 'due needs' : 'dues need'} your attention`;
    StatusIcon = Clock;
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
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className="relative w-full rounded-[28px] overflow-hidden"
      style={{
        background:
          'radial-gradient(120% 110% at 18% 0%, #FF9558 0%, #F47424 28%, #E25E0B 58%, #B84800 100%)',
        boxShadow:
          '0 22px 50px -22px rgba(184, 72, 0, 0.55),' +
          ' 0 4px 12px -2px rgba(184, 72, 0, 0.28),' +
          ' inset 0 1px 0 rgba(255, 255, 255, 0.28),' +
          ' inset 0 -1px 0 rgba(0, 0, 0, 0.10)',
      }}
    >
      {/* Cursor-tracked highlight */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: highlight, mixBlendMode: 'soft-light' }}
        aria-hidden
      />

      {/* Foil shimmer — sweeps once on mount */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'linear-gradient(115deg, transparent 32%, rgba(255,255,255,0.18) 48%, rgba(255,255,255,0.28) 50%, rgba(255,255,255,0.18) 52%, transparent 68%)',
          mixBlendMode: 'overlay',
        }}
        initial={{ x: '-110%' }}
        animate={{ x: '110%' }}
        transition={{ duration: 1.3, delay: 0.25, ease: [0.22, 1, 0.36, 1] }}
        aria-hidden
      />

      {/* Two faint wave lines — the only background texture. Quiet enough
          that the balance owns the card. */}
      <svg
        className="absolute inset-0 w-full h-full pointer-events-none"
        viewBox="0 0 380 220"
        preserveAspectRatio="none"
        fill="none"
        aria-hidden
      >
        <path d="M -10 64 C 70 30, 150 36, 210 86 S 320 138, 400 104"
              stroke="#fff" strokeWidth={1.4} strokeLinecap="round" opacity={0.20} />
        <path d="M -10 104 C 80 64, 162 80, 224 112 S 322 160, 400 132"
              stroke="#fff" strokeWidth={1} strokeLinecap="round" opacity={0.10} />
      </svg>

      {/* ── Content ─────────────────────────────────────────── */}
      <div className="relative px-5 sm:px-7 pt-5 sm:pt-6 pb-6">
        {/* Label row */}
        <div className="flex items-center gap-2.5">
          <WalletChip />
          <p
            className="text-[10px] sm:text-[11px] uppercase tracking-[0.16em] font-bold"
            style={{ color: 'rgba(255, 255, 255, 0.82)' }}
          >
            Total outstanding
          </p>
          <button
            type="button"
            onClick={onTogglePrivacy}
            className="ml-auto w-8 h-8 rounded-full flex items-center justify-center hover:bg-white/15 transition-colors"
            style={{ color: 'rgba(255, 255, 255, 0.82)' }}
            aria-label={privacyOn ? 'Show balance' : 'Hide balance'}
          >
            {privacyOn ? <EyeOff size={15} /> : <Eye size={15} />}
          </button>
        </div>

        {/* The balance — the single hero element. */}
        <div className="mt-3.5 flex items-baseline">
          {privacyOn ? (
            <span
              className="text-[42px] sm:text-[52px] font-black text-white leading-none tracking-tight"
              style={{ filter: 'blur(9px)', userSelect: 'none' }}
            >
              ••••••
            </span>
          ) : (
            <>
              <span
                className="text-2xl sm:text-3xl font-bold text-white leading-none mr-1.5 self-start mt-1"
                style={{ opacity: 0.9 }}
              >
                {amount.prefix}
              </span>
              <span
                className="text-[42px] sm:text-[54px] font-black text-white leading-none tracking-tight"
                style={{ fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.03em' }}
              >
                {displayInt}
              </span>
              <span
                className="text-xl sm:text-2xl font-bold leading-none ml-1"
                style={{ color: 'rgba(255, 255, 255, 0.62)', fontVariantNumeric: 'tabular-nums' }}
              >
                .{amount.decimal}
              </span>
            </>
          )}
        </div>

        {/* One status line */}
        <motion.p
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.45, duration: 0.4 }}
          className="mt-2.5 inline-flex items-center gap-1.5 text-[12px] font-semibold"
          style={{ color: 'rgba(255,255,255,0.88)' }}
        >
          <StatusIcon size={13} />
          {statusLabel}
        </motion.p>

        {/* Slim progress bar — the only "how far along" indicator. */}
        {hasProgress && (
          <div className="mt-4">
            <div className="flex items-center justify-between mb-1.5">
              <span
                className="text-[10px] uppercase tracking-[0.12em] font-bold"
                style={{ color: 'rgba(255,255,255,0.62)' }}
              >
                Dues settled
              </span>
              <span
                className="text-[10px] font-extrabold tabular-nums"
                style={{ color: 'rgba(255,255,255,0.82)' }}
              >
                {paid} of {total}
              </span>
            </div>
            <div
              className="h-1.5 rounded-full overflow-hidden"
              style={{ background: 'rgba(255,255,255,0.20)' }}
            >
              <motion.div
                className="h-full rounded-full"
                style={{ background: 'linear-gradient(90deg, #fff 0%, rgba(255,255,255,0.82) 100%)' }}
                initial={{ width: 0 }}
                animate={{ width: `${paidPct * 100}%` }}
                transition={{ duration: 1.0, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
          </div>
        )}

        {/* One clear action — a real fintech "pay now" button, not a faint
            text link. Only shown when there's a next due to pay. */}
        {ctaLabel && (
          <motion.button
            type="button"
            onClick={onCtaClick}
            whileTap={{ scale: 0.985 }}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.4 }}
            className="mt-4 w-full h-11 rounded-2xl flex items-center justify-center gap-1.5 text-[14px] font-extrabold transition-transform"
            style={{
              background: '#FFFFFF',
              color: '#C24E04',
              boxShadow: '0 10px 24px -10px rgba(0,0,0,0.45), inset 0 1px 0 rgba(255,255,255,0.6)',
            }}
          >
            {ctaLabel}
            <ArrowRight size={16} />
          </motion.button>
        )}
      </div>
    </motion.div>
  );
}

// ── WalletChip — physical-card style chip pad. Anchors the "premium
// fintech card" reading at first glance. ──
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
