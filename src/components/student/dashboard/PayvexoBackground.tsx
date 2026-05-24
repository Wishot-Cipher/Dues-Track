/**
 * PayvexoBackground — the warm, textured backdrop behind the student
 * dashboard. Designed to look "human and crafted" (not AI-flat):
 *
 *   • Warm cream/ember base (theme-aware)
 *   • Peach radial blob upper-left — the brand's signature glow
 *   • Smaller ember blob lower-right — balances the composition
 *   • Dot grid texture — visible enough to read as "designed paper",
 *     subtle enough not to fight the content
 *   • Hand-drawn double swoosh — gives the page its soul
 *   • Tiny scattered particles (the orange specks in the mockup) —
 *     these are what break the AI-uniformity and feel hand-placed
 *
 * Pinned `fixed` + `pointer-events-none` so it scrolls under the
 * content without intercepting taps.
 */

import type { ResolvedTheme } from '@/hooks/useTheme';
import { getDashboardTokens } from '@/hooks/useTheme';

export default function PayvexoBackground({ theme }: { theme: ResolvedTheme }) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden -z-10"
      aria-hidden
      style={{ background: t.bg }}
    >
      {/* Warm wash overlay — softens the page from top to bottom.
          Slightly stronger than before so the cream feels intentional. */}
      <div className="absolute inset-0" style={{ background: t.bgWash }} />

      {/* Upper-left ambient blob — the brand's signature glow */}
      <div
        className="absolute rounded-full"
        style={{
          width:  560,
          height: 560,
          top:    -200,
          left:   -180,
          background: `radial-gradient(circle, ${t.blob1} 0%, transparent 70%)`,
          filter: 'blur(50px)',
        }}
      />

      {/* Lower-right secondary blob — balances the composition */}
      <div
        className="absolute rounded-full"
        style={{
          width:  460,
          height: 460,
          bottom: -140,
          right:  -140,
          background: `radial-gradient(circle, ${t.blob2} 0%, transparent 70%)`,
          filter: 'blur(60px)',
        }}
      />

      {/* Dot grid — restored to a visible level. This is the texture
          that makes the page read as "designed paper" and not a flat
          AI mockup. Note the absolute opacity bumps in light mode. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle, ${t.dot} 1.25px, transparent 1.25px)`,
          backgroundSize: '20px 20px',
          backgroundPosition: '0 0',
          opacity: isLight ? 0.9 : 0.55,
        }}
      />

      {/* Hand-drawn double swoosh upper-left — the curve from the mockup */}
      <svg
        className="absolute"
        style={{ top: -40, left: -20, width: 380, height: 260, opacity: isLight ? 0.40 : 0.18 }}
        viewBox="0 0 380 260"
        fill="none"
      >
        <path
          d="M-20 80 C 60 20, 160 60, 220 120 S 340 200, 380 160"
          stroke={t.primary}
          strokeWidth={1.25}
          strokeLinecap="round"
          opacity={0.55}
        />
        <path
          d="M-20 110 C 80 60, 180 90, 240 150 S 340 220, 380 190"
          stroke={t.primary}
          strokeWidth={1}
          strokeLinecap="round"
          opacity={0.30}
        />
      </svg>

      {/* Scattered brand-color particles — the "hand-placed" specks
          you see in the mockup. Each is deliberately at a slightly off
          position so the page doesn't read as machine-generated.
          A small set is more designed than a uniform grid.
          ────────────────────────────────────────────────────────
          Two colour families:
            • Brand orange (the primary scatter)
            • Mature emerald green (secondary scatter)
          The green ones balance the orange and signal "success /
          all clear / trust" without being loud. */}
      <svg
        className="absolute inset-0 w-full h-full"
        viewBox="0 0 1000 1400"
        preserveAspectRatio="xMidYMid slice"
        fill="none"
      >
        {(() => {
          // Mature green — same family as gradGreen in the tokens.
          // Slightly different shade in dark mode so it stays visible
          // against the ember bg.
          const green = isLight ? '#10B981' : '#34D9A2';
          return (
            <>
              {/* ── Orange family ────────────────────────────────── */}
              {/* Upper-left cluster (denser, follows the swoosh) */}
              <circle cx="40"  cy="220"  r="2.5" fill={t.primary} opacity={isLight ? 0.45 : 0.30} />
              <circle cx="80"  cy="280"  r="1.5" fill={t.primary} opacity={isLight ? 0.30 : 0.20} />
              <circle cx="20"  cy="340"  r="2"   fill={t.primary} opacity={isLight ? 0.35 : 0.22} />
              <circle cx="120" cy="380"  r="1.5" fill={t.primary} opacity={isLight ? 0.25 : 0.18} />
              <circle cx="60"  cy="500"  r="2"   fill={t.primary} opacity={isLight ? 0.30 : 0.20} />
              <circle cx="30"  cy="640"  r="1.5" fill={t.primary} opacity={isLight ? 0.25 : 0.16} />

              {/* Mid-right scattered */}
              <circle cx="940" cy="380"  r="2"   fill={t.primary} opacity={isLight ? 0.30 : 0.20} />
              <circle cx="900" cy="460"  r="1.5" fill={t.primary} opacity={isLight ? 0.22 : 0.15} />
              <circle cx="960" cy="560"  r="2"   fill={t.primary} opacity={isLight ? 0.28 : 0.18} />
              <circle cx="880" cy="700"  r="1.5" fill={t.primary} opacity={isLight ? 0.20 : 0.14} />

              {/* Lower band */}
              <circle cx="200" cy="1000" r="2"   fill={t.primary} opacity={isLight ? 0.25 : 0.18} />
              <circle cx="800" cy="1100" r="2.5" fill={t.primary} opacity={isLight ? 0.30 : 0.20} />
              <circle cx="50"  cy="1200" r="1.5" fill={t.primary} opacity={isLight ? 0.22 : 0.14} />
              <circle cx="950" cy="1280" r="2"   fill={t.primary} opacity={isLight ? 0.28 : 0.18} />

              {/* ── Green family (balancing accent) ─────────────── */}
              {/* Upper-right cluster */}
              <circle cx="820" cy="200"  r="2"   fill={green} opacity={isLight ? 0.32 : 0.22} />
              <circle cx="870" cy="260"  r="1.5" fill={green} opacity={isLight ? 0.24 : 0.18} />
              <circle cx="780" cy="320"  r="1.75" fill={green} opacity={isLight ? 0.28 : 0.20} />

              {/* Mid-left scattered */}
              <circle cx="100" cy="780"  r="2"   fill={green} opacity={isLight ? 0.28 : 0.18} />
              <circle cx="160" cy="860"  r="1.5" fill={green} opacity={isLight ? 0.22 : 0.15} />
              <circle cx="50"  cy="920"  r="2"   fill={green} opacity={isLight ? 0.26 : 0.18} />

              {/* Lower band — mixed */}
              <circle cx="400" cy="1080" r="1.75" fill={green} opacity={isLight ? 0.26 : 0.18} />
              <circle cx="630" cy="1180" r="2"   fill={green} opacity={isLight ? 0.30 : 0.20} />
              <circle cx="900" cy="1240" r="1.5" fill={green} opacity={isLight ? 0.22 : 0.15} />

              {/* Two extra-tiny + shaped sparkles for character */}
              <path d="M510 320 l0 -6 m0 12 l0 -6 m-6 0 l12 0"
                    stroke={green} strokeWidth="1.5" strokeLinecap="round"
                    opacity={isLight ? 0.35 : 0.25} />
              <path d="M260 1140 l0 -5 m0 10 l0 -5 m-5 0 l10 0"
                    stroke={t.primary} strokeWidth="1.5" strokeLinecap="round"
                    opacity={isLight ? 0.32 : 0.22} />
            </>
          );
        })()}
      </svg>
    </div>
  );
}
