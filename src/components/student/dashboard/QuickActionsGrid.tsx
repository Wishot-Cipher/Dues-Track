/**
 * QuickActionsGrid — the 4-tile quick-tools row under "Due Next".
 *
 * Mature redesign (less "neon AI", more "premium fintech"):
 *   • Tile background: near-neutral surface (white in light, glass in
 *     dark) instead of a tinted gradient. Tints now live ONLY on the
 *     icon chip — so the page reads calm and the icon is the accent.
 *   • Icon chip: rounded square with the brand tint at a SOFT
 *     opacity, paired with a tiny shadow halo in the same tint —
 *     looks dimensional, not flat.
 *   • Subtle border + crisp 1px inset highlight in light mode for
 *     paper-like depth (matches Wise / Revolut card aesthetic).
 *   • A small triangular "corner glint" SVG in the upper-right of
 *     each tile — the kind of hand-placed detail real product cards
 *     have. Off most of the time, only visible on hover.
 *
 * Theme-aware via getDashboardTokens.
 *
 * Reusable beyond the dashboard — any 2×2 or 4×1 quick-action row
 * can drop this in.
 */

import { motion } from 'framer-motion';
import type { ResolvedTheme } from '@/hooks/useTheme';
import { getDashboardTokens } from '@/hooks/useTheme';
import type { LucideIcon } from 'lucide-react';

export interface QuickActionTile {
  /** Lucide icon component (e.g. CreditCard) */
  icon: LucideIcon;
  /** Short label — one or two words max */
  label: string;
  /** Tiny secondary line — a count, status, etc. Optional. */
  hint?: string;
  /** Tint colour — drives the icon chip + corner glint. */
  tint: string;
  /** Click handler */
  onClick?: () => void;
}

export interface QuickActionsGridProps {
  theme: ResolvedTheme;
  tiles: QuickActionTile[];
}

export default function QuickActionsGrid({ theme, tiles }: QuickActionsGridProps) {
  return (
    <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
      {tiles.map((tile, i) => (
        <QuickActionTileEl
          key={tile.label}
          tile={tile}
          theme={theme}
          index={i}
        />
      ))}
    </div>
  );
}

function QuickActionTileEl({
  tile, theme, index,
}: { tile: QuickActionTile; theme: ResolvedTheme; index: number }) {
  const Icon = tile.icon;
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  return (
    <motion.button
      type="button"
      onClick={tile.onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -1 }}
      whileTap={{ scale: 0.97 }}
      className="relative rounded-2xl p-3 sm:p-3.5 text-left overflow-hidden group"
      style={{
        // Neutral surface in both themes — colour now belongs to the icon.
        background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.035)',
        border: `1px solid ${isLight ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255,255,255,0.08)'}`,
        boxShadow: isLight
          ? '0 1px 0 rgba(255,255,255,0.85) inset, 0 6px 16px -10px rgba(15, 7, 3, 0.08)'
          : '0 1px 0 rgba(255,255,255,0.03) inset',
      }}
      aria-label={tile.label + (tile.hint ? ' — ' + tile.hint : '')}
    >
      {/* Corner glint — subtle triangular accent upper-right. Stays at
          very low opacity, brightens slightly on hover. The hand-placed
          detail that separates "designed" tiles from generic ones. */}
      <svg
        className="absolute top-0 right-0 pointer-events-none transition-opacity duration-300 group-hover:opacity-80"
        style={{ opacity: 0.35 }}
        width={28} height={28} viewBox="0 0 28 28" fill="none"
        aria-hidden
      >
        <path
          d="M28 0 L28 28 L0 0 Z"
          fill={tile.tint}
          opacity={isLight ? 0.08 : 0.10}
        />
        <path
          d="M28 0 L28 12 L16 0 Z"
          fill={tile.tint}
          opacity={isLight ? 0.14 : 0.16}
        />
      </svg>

      {/* Icon chip — the only saturated element on the tile */}
      <div
        className="relative w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-2.5"
        style={{
          background: isLight ? hexAlpha(tile.tint, 0.10) : hexAlpha(tile.tint, 0.18),
          border: `1px solid ${hexAlpha(tile.tint, isLight ? 0.18 : 0.26)}`,
          // Soft shadow halo in the tint colour — looks like the icon
          // is sitting on a thin glow plate.
          boxShadow: isLight
            ? `0 6px 14px -8px ${hexAlpha(tile.tint, 0.36)}`
            : 'none',
        }}
      >
        <Icon size={17} color={tile.tint} strokeWidth={2.2} />
      </div>

      {/* Label */}
      <p
        className="text-[12px] sm:text-[13px] font-bold leading-tight tracking-tight"
        style={{ color: t.text }}
      >
        {tile.label}
      </p>

      {/* Hint */}
      {tile.hint && (
        <p
          className="text-[10px] sm:text-[11px] font-semibold leading-tight mt-0.5 truncate"
          style={{ color: t.textTer }}
        >
          {tile.hint}
        </p>
      )}
    </motion.button>
  );
}

// Tiny helper: hex (#RRGGBB) + alpha → rgba. Passes non-hex through.
function hexAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
