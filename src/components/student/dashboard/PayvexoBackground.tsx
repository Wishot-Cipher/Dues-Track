/**
 * PayvexoBackground — the layered decorative background behind the
 * student dashboard surfaces (the soft peach blob in the upper-left,
 * the smaller blob lower-right, and the subtle dot grid).
 *
 * Pinned `fixed` so it scrolls with the page but stays edge-to-edge.
 * Theme-aware via getDashboardTokens — same component renders the
 * warm cream wash in light mode and the deep ember wash in dark.
 *
 * All decoration is purely visual: `pointer-events-none` so it never
 * intercepts taps/clicks.
 */

import type { ResolvedTheme } from '@/hooks/useTheme';
import { getDashboardTokens } from '@/hooks/useTheme';

export default function PayvexoBackground({ theme }: { theme: ResolvedTheme }) {
  const t = getDashboardTokens(theme);

  return (
    <div
      className="fixed inset-0 pointer-events-none overflow-hidden -z-10"
      aria-hidden
      style={{ background: t.bg }}
    >
      {/* Warm wash overlay — softens the page from top to bottom */}
      <div className="absolute inset-0" style={{ background: t.bgWash }} />

      {/* Upper-left ambient blob — gives the page its "designed" feel */}
      <div
        className="absolute rounded-full"
        style={{
          width:  520,
          height: 520,
          top:    -180,
          left:   -160,
          background: `radial-gradient(circle, ${t.blob1} 0%, transparent 70%)`,
          filter: 'blur(40px)',
        }}
      />

      {/* Lower-right secondary blob — balances the composition */}
      <div
        className="absolute rounded-full"
        style={{
          width:  420,
          height: 420,
          bottom: -120,
          right:  -120,
          background: `radial-gradient(circle, ${t.blob2} 0%, transparent 70%)`,
          filter: 'blur(50px)',
        }}
      />

      {/* Subtle dot pattern — what gives the bg texture without noise.
          Uses a tiled SVG via CSS background-image. The dot color
          tracks the theme. */}
      <div
        className="absolute inset-0"
        style={{
          backgroundImage: `radial-gradient(circle, ${t.dot} 1px, transparent 1px)`,
          backgroundSize: '22px 22px',
          opacity: 0.7,
        }}
      />

      {/* Top-left swoosh — the long thin curve you can just see in the
          mockup. Hand-drawn SVG so it has soul (not a perfect arc). */}
      <svg
        className="absolute"
        style={{ top: -40, left: -20, width: 360, height: 240, opacity: theme === 'light' ? 0.35 : 0.18 }}
        viewBox="0 0 360 240"
        fill="none"
      >
        <path
          d="M-20 80 C 60 20, 160 60, 220 120 S 340 200, 380 160"
          stroke={t.primary}
          strokeWidth={1.25}
          strokeLinecap="round"
          opacity={0.45}
        />
        <path
          d="M-20 110 C 80 60, 180 90, 240 150 S 340 220, 380 190"
          stroke={t.primary}
          strokeWidth={1}
          strokeLinecap="round"
          opacity={0.25}
        />
      </svg>
    </div>
  );
}
