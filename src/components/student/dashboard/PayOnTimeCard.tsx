'use client';

/**
 * PayOnTimeCard — Payvexo · Mobile-first · World-class
 * Author: Wishot
 *
 * Image reality:
 *   /Trusted.png is a wide 2-panel image (1334 × ~800px approx) with a black
 *   background. Left half = students scene. Right half = orange shield/lock.
 *   We always show ONLY the right half (shield) via object-position.
 *   Black background is neutralised with mix-blend-mode: multiply on light
 *   and mix-blend-mode: screen on dark — both modes handled correctly.
 *
 * Mobile  (< 640 px):
 *   Single column. Shield is a FULL-WIDTH hero at the top of the card,
 *   overflowing upward by ~40 px so it feels like a product poster.
 *   Text lives cleanly below.
 *
 * Desktop (≥ 640 px):
 *   50 / 50 grid. Text left, shield right, grounded at bottom.
 */

import { motion, useReducedMotion } from 'framer-motion';
import { useEffect, useState } from 'react';

// ─── Types ────────────────────────────────────────────────────────────────────

export type ResolvedTheme = 'light' | 'dark';

export interface PayOnTimeCardProps {
  theme: ResolvedTheme;
  firstName?: string;
  /** Full sprite sheet path. Defaults to /Trusted.png */
  illustrationSrc?: string;
}

// ─── SSR-safe viewport hook ───────────────────────────────────────────────────

function useIsMobile(breakpoint = 640): boolean {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mq.matches);
    const h = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', h);
    return () => mq.removeEventListener('change', h);
  }, [breakpoint]);
  return isMobile;
}

// ─── Animation variants ───────────────────────────────────────────────────────

const cardVariants = {
  hidden:  { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1] as const } },
};

const imgVariants = {
  hidden:  { opacity: 0, scale: 0.93, y: 16 },
  visible: { opacity: 1, scale: 1, y: 0,
    transition: { delay: 0.12, duration: 0.65, ease: [0.22, 1, 0.36, 1] as const } },
};

const textVariants = {
  hidden:  { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0,
    transition: { delay: 0.28, duration: 0.48, ease: [0.22, 1, 0.36, 1] as const } },
};

// ─── Pill tag ─────────────────────────────────────────────────────────────────

function PillTag({ isLight }: { isLight: boolean }) {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      borderRadius: 100, padding: '5px 13px', marginBottom: 16,
      width: 'fit-content',
      background: isLight ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.07)',
      border: `1px solid ${isLight ? 'rgba(255,255,255,0.60)' : 'rgba(255,255,255,0.11)'}`,
      backdropFilter: 'blur(14px)', WebkitBackdropFilter: 'blur(14px)',
    }}>
      <span style={{
        width: 7, height: 7, borderRadius: '50%',
        background: '#FF5C00', flexShrink: 0, display: 'inline-block',
      }} />
      <span style={{
        fontSize: 10.5, fontWeight: 600, letterSpacing: '0.075em',
        textTransform: 'uppercase' as const, lineHeight: 1,
        color: isLight ? '#8A3300' : '#FFAA76',
      }}>
        Smart Payments
      </span>
    </div>
  );
}

// ─── Headlines ────────────────────────────────────────────────────────────────

function Headlines({ isLight, firstName, fs }: {
  isLight: boolean; firstName?: string; fs: number;
}) {
  const base: React.CSSProperties = {
    margin: 0, display: 'block',
    fontSize: fs, fontWeight: 900, lineHeight: 1.06, letterSpacing: '-0.032em',
    color: isLight ? '#161616' : '#FFFFFF',
  };
  return (
    <div style={{ marginBottom: 14 }}>
      <span style={base}>Pay on time.</span>
      <span style={base}>Avoid late fees.</span>
      <span style={{ ...base, color: isLight ? '#C44E00' : '#FFAB6E', marginTop: 5 }}>
        {firstName ? `You're in control, ${firstName}.` : `You're in control.`}
      </span>
    </div>
  );
}

// ─── The shield illustration ──────────────────────────────────────────────────
//
// The sprite is ~2:1 wide. The shield occupies the right half.
// We show a square window onto the right half using:
//   width: 200% on the img  →  img is twice the container
//   object-position: right center  →  show right half
//   mix-blend-mode to knock out the black bg
//
// Container controls the visible crop size.

function ShieldImage({ isLight, src = '/Trusted.png', style, preferVisibility = false }: {
  isLight: boolean;
  src?: string;
  style?: React.CSSProperties;
  preferVisibility?: boolean;
}) {
  return (
    <div style={{
      position: 'relative',
      overflow: 'hidden',
      ...style,
    }}>
      <motion.img
        variants={imgVariants}
        initial="hidden"
        animate="visible"
        src={src}
        alt=""
        role="presentation"
        draggable={false}
        style={{
          /**
           * The image is a 2-panel sprite (~2:1 aspect).
           * width: 200% makes the img fill double the container width,
           * then object-position: 100% snaps to show only the right panel.
           * mix-blend-mode: multiply  →  black becomes transparent on light bg.
           * mix-blend-mode: screen    →  black becomes transparent on dark bg.
           */
          display: 'block',
          width: '200%',
          height: '100%',
          objectFit: 'cover',
          objectPosition: '100% center',
          mixBlendMode: preferVisibility ? 'normal' : (isLight ? 'multiply' : 'screen'),
          filter: preferVisibility
            ? (isLight ? 'drop-shadow(0 10px 20px rgba(168, 78, 11, 0.18))' : 'drop-shadow(0 12px 24px rgba(0, 0, 0, 0.45))')
            : undefined,
          userSelect: 'none',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ─── Decorative rings ─────────────────────────────────────────────────────────

function Rings({ isLight, mobile }: { isLight: boolean; mobile: boolean }) {
  const c1 = isLight ? 'rgba(255,138,58,0.30)' : 'rgba(255,148,78,0.15)';
  const c2 = isLight ? 'rgba(255,138,58,0.17)' : 'rgba(255,148,78,0.08)';
  if (mobile) {
    return <>
      <div aria-hidden style={{ position:'absolute', top:'5%', left:'50%', transform:'translateX(-50%)', width:280, height:280, borderRadius:'50%', border:`1.5px solid ${c1}`, pointerEvents:'none', zIndex:1 }} />
      <div aria-hidden style={{ position:'absolute', top:'14%', left:'50%', transform:'translateX(-50%)', width:190, height:190, borderRadius:'50%', border:`1px solid ${c2}`, pointerEvents:'none', zIndex:1 }} />
    </>;
  }
  return <>
    <div aria-hidden style={{ position:'absolute', top:-34, right:-42, width:220, height:220, borderRadius:'50%', border:`1.5px solid ${c1}`, pointerEvents:'none' }} />
    <div aria-hidden style={{ position:'absolute', top:8, right:-14, width:134, height:134, borderRadius:'50%', border:`1px solid ${c2}`, pointerEvents:'none' }} />
  </>;
}

// ─── Glow blob ────────────────────────────────────────────────────────────────

function Glow({ isLight, mobile }: { isLight: boolean; mobile: boolean }) {
  const bg = isLight
    ? 'radial-gradient(circle, rgba(255,120,18,0.26) 0%, transparent 65%)'
    : 'radial-gradient(circle, rgba(255,100,18,0.16) 0%, transparent 65%)';
  if (mobile) {
    return <div aria-hidden style={{ position:'absolute', top:'10%', left:'50%', transform:'translateX(-50%)', width:300, height:300, borderRadius:'50%', background:bg, pointerEvents:'none', zIndex:0 }} />;
  }
  return <div aria-hidden style={{ position:'absolute', bottom:-70, right:-70, width:340, height:340, borderRadius:'50%', background:bg, pointerEvents:'none' }} />;
}

// ─── Dot texture ──────────────────────────────────────────────────────────────

function DotTexture({ isLight }: { isLight: boolean }) {
  return (
    <div aria-hidden style={{
      position:'absolute', inset:0, borderRadius:'inherit',
      zIndex:1, pointerEvents:'none', overflow:'hidden',
      opacity: isLight ? 0.12 : 0.05,
      backgroundImage: `radial-gradient(circle, ${isLight ? 'rgba(160,60,0,0.40)' : 'rgba(255,255,255,0.15)'} 1px, transparent 1px)`,
      backgroundSize: '15px 15px',
    }} />
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

export default function PayOnTimeCard({
  theme,
  firstName,
  illustrationSrc = '/Trusted.png',
}: PayOnTimeCardProps) {
  const isLight   = theme === 'light';
  const isMobile  = useIsMobile(640);
  const noMotion  = useReducedMotion();

  const cardBg = isLight
    ? 'linear-gradient(140deg, #FFF5EC 0%, #FFE2C6 55%, #FFD4AE 100%)'
    : 'linear-gradient(140deg, rgba(255,140,58,0.13) 0%, rgba(255,90,4,0.07) 100%)';

  const cardBorder = isLight
    ? '1px solid rgba(255,163,90,0.34)'
    : '1px solid rgba(255,158,98,0.16)';

  const cardShadow = isLight
    ? '0 4px 48px -12px rgba(210,82,0,0.22)'
    : '0 4px 48px -12px rgba(0,0,0,0.44)';

  // ══════════════════════════════════════════════════════════════
  // MOBILE
  // ══════════════════════════════════════════════════════════════
  if (isMobile) {
    return (
      <motion.div
        variants={cardVariants}
        initial="hidden"
        animate="visible"
        style={{
          position: 'relative',
          borderRadius: 28,
          overflow: 'hidden',
          background: cardBg,
          border: cardBorder,
          boxShadow: cardShadow,
        }}
      >
        <DotTexture isLight={isLight} />

        {/* ── Hero image zone ── */}
        <div style={{
          position: 'relative',
          zIndex: 4,
          marginTop: 0,
          paddingTop: 12,
          height: 206,
          display: 'flex',
          alignItems: 'flex-end',
          justifyContent: 'center',
          overflow: 'hidden',
        }}>
          <Glow isLight={isLight} mobile />
          <Rings isLight={isLight} mobile />

          {/*
           * Shield crop container.
           * Height matches the zone. Width is a square so the shield fills it.
           * The img inside is width:200% to show only right half of sprite.
           */}
          <motion.div
            variants={imgVariants}
            initial="hidden"
            animate="visible"
            whileHover={noMotion ? undefined : {
              scale: 1.04, y: -6,
              transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
            }}
            style={{
              position: 'relative',
              zIndex: 2,
              width: '82vw',
              maxWidth: 320,
              height: 184,
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <ShieldImage
              isLight={isLight}
              src={illustrationSrc}
              preferVisibility
              style={{ width: '100%', height: '100%' }}
            />
          </motion.div>
        </div>

        {/* ── Text zone ── */}
        <motion.div
          variants={textVariants}
          initial="hidden"
          animate="visible"
          style={{
            position: 'relative',
            zIndex: 2,
            padding: '12px 26px 30px',
          }}
        >
          {/* Accent nub */}
          <div style={{
            width: 32, height: 3, borderRadius: 2, marginBottom: 18,
            background: isLight ? 'rgba(195,85,0,0.20)' : 'rgba(255,155,75,0.20)',
          }} />
          <PillTag isLight={isLight} />
          <Headlines isLight={isLight} firstName={firstName} fs={27} />
          <p style={{
            margin: 0, fontSize: 14, lineHeight: 1.60,
            color: isLight ? 'rgba(20,20,20,0.64)' : 'rgba(255,255,255,0.60)',
          }}>
            Smart reminders. Clear payment tracking. Zero confusion.
          </p>
        </motion.div>
      </motion.div>
    );
  }

  // ══════════════════════════════════════════════════════════════
  // DESKTOP  (50 / 50 grid)
  // ══════════════════════════════════════════════════════════════
  return (
    <motion.div
      variants={cardVariants}
      initial="hidden"
      animate="visible"
      style={{
        position: 'relative',
        display: 'grid',
        gridTemplateColumns: '1fr 1fr',
        minHeight: 268,
        borderRadius: 30,
        overflow: 'hidden',
        background: cardBg,
        border: cardBorder,
        boxShadow: cardShadow,
      }}
    >
      <DotTexture isLight={isLight} />

      {/* Vertical panel divider */}
      <div aria-hidden style={{
        position: 'absolute', left: '50%', top: '12%', bottom: '12%',
        width: 1, zIndex: 3, pointerEvents: 'none',
        background: isLight
          ? 'linear-gradient(to bottom, transparent, rgba(210,100,40,0.20), transparent)'
          : 'linear-gradient(to bottom, transparent, rgba(255,148,78,0.12), transparent)',
      }} />

      {/* LEFT — text */}
      <motion.div
        variants={textVariants}
        initial="hidden"
        animate="visible"
        style={{
          position: 'relative', zIndex: 2,
          display: 'flex', flexDirection: 'column', justifyContent: 'center',
          padding: '32px 22px 32px 34px',
        }}
      >
        <PillTag isLight={isLight} />
        <Headlines isLight={isLight} firstName={firstName} fs={25} />
        <p style={{
          margin: 0, fontSize: 13, lineHeight: 1.58, maxWidth: 192,
          color: isLight ? 'rgba(20,20,20,0.65)' : 'rgba(255,255,255,0.62)',
        }}>
          Smart reminders. Clear payment tracking. Zero confusion.
        </p>
      </motion.div>

      {/* RIGHT — illustration */}
      <div style={{
        position: 'relative',
        display: 'flex', alignItems: 'flex-end', justifyContent: 'center',
        overflow: 'hidden',
      }}>
        <Glow isLight={isLight} mobile={false} />
        <Rings isLight={isLight} mobile={false} />

        {/*
         * Desktop: image container fills the whole right panel.
         * width:200% on img + objectPosition:100% = right half of sprite only.
         */}
        <motion.div
          variants={imgVariants}
          initial="hidden"
          animate="visible"
          whileHover={noMotion ? undefined : {
            scale: 1.04, y: -7,
            transition: { duration: 0.38, ease: [0.22, 1, 0.36, 1] },
          }}
          style={{
            position: 'relative', zIndex: 2,
            width: '100%', height: '100%',
            minHeight: 200,
            overflow: 'hidden',
          }}
        >
          <img
            src={illustrationSrc}
            alt=""
            role="presentation"
            draggable={false}
            style={{
              display: 'block',
              width: '200%',
              height: '100%',
              objectFit: 'cover',
              objectPosition: '100% center',
              mixBlendMode: isLight ? 'multiply' : 'screen',
              userSelect: 'none',
              pointerEvents: 'none',
            }}
          />
        </motion.div>
      </div>
    </motion.div>
  );
}