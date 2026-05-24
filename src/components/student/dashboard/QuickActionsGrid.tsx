/**
 * QuickActionsGrid — the 2×2 colored-tile grid right under the hero.
 *
 * Visual recipe (matches the Payvexo mockup):
 *   • 4 tiles in a 2×2 grid on mobile (and 4×1 on desktop)
 *   • Each tile is its own brand-tinted card with a soft inner glow
 *   • Icon in a circular pill, tile title, tiny subtitle/metric
 *   • Subtle press feedback + hover lift
 *   • Theme-aware: light tiles in light mode, glassy tiles in dark
 *
 * Why this specific layout: it's the fastest-tappable surface in the
 * app. The four actions cover the 80% case — Pay, History, Help,
 * Profile — and the tile sizing is sized for one-thumb reach.
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
  /** Tint color — drives the gradient + icon color. Use a brand token. */
  tint: string;
  /** Click handler */
  onClick?: () => void;
}

export interface QuickActionsGridProps {
  theme: ResolvedTheme;
  tiles: QuickActionTile[];
}

export default function QuickActionsGrid({ theme, tiles }: QuickActionsGridProps) {
  const t = getDashboardTokens(theme);

  return (
    <div className="grid grid-cols-4 gap-2.5 sm:gap-3">
      {tiles.map((tile, i) => (
        <QuickActionTileEl
          key={tile.label}
          tile={tile}
          theme={theme}
          tokens={t}
          index={i}
        />
      ))}
    </div>
  );
}

function QuickActionTileEl({
  tile,
  theme,
  tokens,
  index,
}: {
  tile: QuickActionTile;
  theme: ResolvedTheme;
  tokens: ReturnType<typeof getDashboardTokens>;
  index: number;
}) {
  const Icon = tile.icon;

  // Light-mode tile: soft tinted background + crisp icon chip.
  // Dark-mode tile: glassy panel with the tinted icon chip.
  const isLight = theme === 'light';

  return (
    <motion.button
      type="button"
      onClick={tile.onClick}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.05 + index * 0.05, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      className="relative rounded-2xl p-2.5 sm:p-3 text-left overflow-hidden group"
      style={{
        background: isLight
          ? `linear-gradient(160deg, ${hexAlpha(tile.tint, 0.12)} 0%, ${hexAlpha(tile.tint, 0.04)} 100%)`
          : `linear-gradient(160deg, ${hexAlpha(tile.tint, 0.16)} 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${isLight ? hexAlpha(tile.tint, 0.18) : hexAlpha(tile.tint, 0.22)}`,
        boxShadow: isLight
          ? `0 1px 0 rgba(255,255,255,0.6) inset, 0 6px 20px -8px ${hexAlpha(tile.tint, 0.20)}`
          : `0 1px 0 rgba(255,255,255,0.04) inset`,
      }}
      aria-label={tile.label + (tile.hint ? ' — ' + tile.hint : '')}
    >
      {/* Icon chip */}
      <div
        className="w-9 h-9 sm:w-10 sm:h-10 rounded-xl flex items-center justify-center mb-2"
        style={{
          background: isLight ? '#FFFFFF' : hexAlpha(tile.tint, 0.18),
          boxShadow: isLight
            ? `0 4px 14px -4px ${hexAlpha(tile.tint, 0.36)}`
            : 'none',
          border: isLight ? `1px solid ${hexAlpha(tile.tint, 0.16)}` : `1px solid ${hexAlpha(tile.tint, 0.28)}`,
        }}
      >
        <Icon size={18} color={tile.tint} />
      </div>

      {/* Label */}
      <p
        className="text-[12px] sm:text-[13px] font-bold leading-tight"
        style={{ color: tokens.text }}
      >
        {tile.label}
      </p>

      {/* Hint */}
      {tile.hint && (
        <p
          className="text-[10px] sm:text-[11px] font-medium leading-tight mt-0.5 truncate"
          style={{ color: tokens.textSec }}
        >
          {tile.hint}
        </p>
      )}
    </motion.button>
  );
}

// Tiny helper: hex (#RRGGBB) + alpha → rgba string. Used for soft
// tints in both light and dark modes. If you pass a non-hex, returns
// the input unchanged so brand tokens with rgba already work.
function hexAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
