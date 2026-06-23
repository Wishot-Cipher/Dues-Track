/**
 * QuickActionsGrid — 2×2 premium fintech tile grid.
 *
 * Key upgrade: "Pay" is context-aware.
 *   • 0 unpaid dues  → goes to /payments (history)
 *   • 1 unpaid due   → goes directly to that payment
 *   • 2+ unpaid dues → opens an inline bottom sheet with every due
 *                      ranked by urgency (overdue first, then deadline,
 *                      then mandatory, then alphabetical). Tap a row
 *                      to go directly to that payment. No ambiguous
 *                      "which one did I just tap Pay for?" confusion.
 *
 * Design:
 *   • 2×2 grid — feels like a real app home screen, not a cramped row
 *   • Icon chips: gradient fill, not just a tint opacity
 *   • Badge count on Pay tile when dues are outstanding
 *   • Corner glint detail retained (sub-brand premium signal)
 *   • Bottom sheet: spring physics, backdrop blur, swipe-dismiss feel
 */

import { useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  X,
  ChevronRight,
  AlertCircle,
  Clock,
  Calendar,
  Flame,
} from 'lucide-react';
import type { ResolvedTheme } from '@/hooks/useTheme';
import { getDashboardTokens } from '@/hooks/useTheme';
import type { LucideIcon } from 'lucide-react';
import { formatCurrency } from '@/utils/formatters';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DueSheetItem {
  id: string;
  title: string;
  amount: number;
  daysLeft: number | null;
  isMandatory: boolean;
  status: 'unpaid' | 'partial';
  paidAmount: number;
}

export interface QuickActionTile {
  icon: LucideIcon;
  label: string;
  hint?: string;
  tint: string;
  onClick?: () => void;
  /** Badge count shown on the tile (e.g. unpaid dues count) */
  badge?: number;
  /** If provided and badge > 1, tapping shows the dues sheet instead of onClick */
  dueItems?: DueSheetItem[];
  onDueSelect?: (id: string) => void;
}

export interface QuickActionsGridProps {
  theme: ResolvedTheme;
  tiles: QuickActionTile[];
}

// ── Urgency helpers ───────────────────────────────────────────────────────────

function urgencyRank(item: DueSheetItem): number {
  const d = item.daysLeft;
  if (d !== null && d < 0) return 0;   // overdue
  if (d === 0) return 1;               // due today
  if (d !== null && d <= 3) return 2;  // due very soon
  if (d !== null && d <= 14) return 3; // due soon
  if (item.isMandatory) return 4;      // mandatory, no deadline
  return 5;                            // optional, no deadline
}

function urgencyBadge(item: DueSheetItem, amberColor: string, dangerColor: string, blueColor: string, textTer: string) {
  const d = item.daysLeft;
  if (d !== null && d < 0) return { label: `${Math.abs(d)}d overdue`, color: dangerColor, Icon: Flame };
  if (d === 0) return { label: 'Due today', color: dangerColor, Icon: AlertCircle };
  if (d !== null && d <= 3) return { label: `${d}d left`, color: amberColor, Icon: Clock };
  if (d !== null && d <= 14) return { label: `${d}d left`, color: blueColor, Icon: Calendar };
  if (d !== null) return { label: `${d}d left`, color: textTer, Icon: Calendar };
  return null;
}

// ── Dues Bottom Sheet ─────────────────────────────────────────────────────────

function DuesSheet({
  items,
  theme,
  onSelect,
  onClose,
}: {
  items: DueSheetItem[];
  theme: ResolvedTheme;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  const sorted = [...items].sort((a, b) => urgencyRank(a) - urgencyRank(b));

  const totalOwed = sorted.reduce((s, item) => s + (item.amount - item.paidAmount), 0);

  return createPortal(
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[200] flex items-end justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Backdrop */}
        <motion.div
          className="absolute inset-0"
          style={{ background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }}
          onClick={onClose}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        />

        {/* Sheet */}
        <motion.div
          className="relative w-full max-w-lg rounded-t-[28px] overflow-hidden"
          style={{
            background: isLight ? '#FFFFFF' : '#140B06',
            border: `1px solid ${t.cardBorder}`,
            borderBottom: 'none',
            boxShadow: '0 -20px 60px rgba(0,0,0,0.35)',
            maxHeight: '82vh',
            display: 'flex',
            flexDirection: 'column',
          }}
          initial={{ y: '100%' }}
          animate={{ y: 0 }}
          exit={{ y: '100%' }}
          transition={{ type: 'spring', stiffness: 340, damping: 34 }}
        >
          {/* Handle */}
          <div className="flex justify-center pt-3 pb-1 shrink-0">
            <div
              className="w-9 h-1 rounded-full"
              style={{ background: isLight ? 'rgba(15,7,3,0.12)' : 'rgba(255,255,255,0.15)' }}
            />
          </div>

          {/* Header */}
          <div
            className="flex items-center justify-between px-5 py-3 shrink-0"
            style={{ borderBottom: `1px solid ${t.cardBorder}` }}
          >
            <div>
              <h3 className="text-base font-extrabold tracking-tight" style={{ color: t.text }}>
                Which due to pay?
              </h3>
              <p className="text-[11px] mt-0.5" style={{ color: t.textTer }}>
                {sorted.length} outstanding · total{' '}
                <span className="font-bold" style={{ color: t.danger }}>
                  {formatCurrency(totalOwed)}
                </span>
              </p>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center transition-colors"
              style={{
                background: isLight ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.08)',
                color: t.textSec,
              }}
            >
              <X size={15} />
            </button>
          </div>

          {/* Due rows */}
          <div className="overflow-y-auto flex-1">
            {sorted.map((item, i) => {
              const badge = urgencyBadge(item, t.amber, t.danger, t.blue, t.textTer);
              const BadgeIcon = badge?.Icon;
              const remaining = item.amount - item.paidAmount;
              const isPartial = item.status === 'partial';

              return (
                <motion.button
                  key={item.id}
                  onClick={() => { onClose(); onSelect(item.id); }}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.04 }}
                  whileTap={{ scale: 0.985 }}
                  className="w-full flex items-center gap-3.5 px-5 py-4 text-left transition-colors"
                  style={{
                    borderBottom: `1px solid ${t.cardBorder}`,
                  }}
                >
                  {/* Urgency dot */}
                  <div
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{
                      background: badge?.color ?? t.primary,
                      boxShadow: badge ? `0 0 6px ${badge.color}60` : 'none',
                    }}
                  />

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-[13px] font-bold truncate" style={{ color: t.text }}>
                        {item.title}
                      </p>
                      {item.isMandatory && (
                        <span
                          className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                          style={{ background: `${t.primary}18`, color: t.primary }}
                        >
                          Required
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                      {isPartial && (
                        <span className="text-[11px]" style={{ color: t.textTer }}>
                          {formatCurrency(item.paidAmount)} paid ·
                        </span>
                      )}
                      {badge && BadgeIcon && (
                        <span
                          className="inline-flex items-center gap-1 text-[10px] font-semibold"
                          style={{ color: badge.color }}
                        >
                          <BadgeIcon size={10} />
                          {badge.label}
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Amount */}
                  <div className="text-right shrink-0">
                    <p className="text-[14px] font-extrabold tabular-nums" style={{ color: t.text }}>
                      {formatCurrency(remaining)}
                    </p>
                    {isPartial && (
                      <p className="text-[10px]" style={{ color: t.textTer }}>remaining</p>
                    )}
                  </div>

                  <ChevronRight size={15} style={{ color: t.textTer, flexShrink: 0 }} />
                </motion.button>
              );
            })}

            {/* Bottom padding for safe area */}
            <div className="h-6" />
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}

// ── Main grid ─────────────────────────────────────────────────────────────────

export default function QuickActionsGrid({ theme, tiles }: QuickActionsGridProps) {
  const [sheetTile, setSheetTile] = useState<QuickActionTile | null>(null);

  const handleTilePress = (tile: QuickActionTile) => {
    // If this tile has multiple dues, show the sheet
    if (tile.dueItems && tile.dueItems.length > 1) {
      setSheetTile(tile);
      return;
    }
    // Otherwise run the normal onClick
    tile.onClick?.();
  };

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {tiles.map((tile, i) => (
          <QuickActionTileEl
            key={tile.label}
            tile={tile}
            theme={theme}
            index={i}
            onPress={() => handleTilePress(tile)}
          />
        ))}
      </div>

      {/* Dues sheet — only mounts when open */}
      {sheetTile?.dueItems && sheetTile.onDueSelect && (
        <DuesSheet
          items={sheetTile.dueItems}
          theme={theme}
          onSelect={sheetTile.onDueSelect}
          onClose={() => setSheetTile(null)}
        />
      )}
    </>
  );
}

// ── Tile element ──────────────────────────────────────────────────────────────

function QuickActionTileEl({
  tile,
  theme,
  index,
  onPress,
}: {
  tile: QuickActionTile;
  theme: ResolvedTheme;
  index: number;
  onPress: () => void;
}) {
  const Icon = tile.icon;
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  return (
    <motion.button
      type="button"
      onClick={onPress}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: 0.05 + index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.96 }}
      className="relative rounded-2xl p-4 text-left overflow-hidden group flex flex-col items-start"
      style={{
        background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.04)',
        border: `1px solid ${isLight ? 'rgba(15,7,3,0.07)' : 'rgba(255,255,255,0.09)'}`,
        boxShadow: isLight
          ? '0 1px 0 rgba(255,255,255,0.9) inset, 0 4px 16px -8px rgba(15,7,3,0.10)'
          : '0 1px 0 rgba(255,255,255,0.04) inset',
        minHeight: 100,
      }}
      aria-label={tile.label + (tile.hint ? ` — ${tile.hint}` : '')}
    >
      {/* Corner glint */}
      <svg
        className="absolute top-0 right-0 pointer-events-none transition-opacity duration-300"
        style={{ opacity: isLight ? 0.5 : 0.4 }}
        width={36} height={36} viewBox="0 0 36 36" fill="none"
        aria-hidden
      >
        <path d="M36 0 L36 36 L0 0 Z" fill={tile.tint} opacity={0.07} />
        <path d="M36 0 L36 14 L22 0 Z" fill={tile.tint} opacity={0.14} />
      </svg>

      {/* Badge count */}
      {tile.badge !== undefined && tile.badge > 0 && (
        <motion.span
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 22, delay: 0.15 + index * 0.06 }}
          className="absolute top-2.5 right-2.5 min-w-[18px] h-[18px] rounded-full flex items-center justify-center text-[10px] font-black text-white px-1"
          style={{
            background: tile.tint,
            boxShadow: `0 2px 8px ${tile.tint}55`,
          }}
        >
          {tile.badge > 9 ? '9+' : tile.badge}
        </motion.span>
      )}

      {/* Icon chip — gradient fill, dimensional */}
      <div
        className="w-11 h-11 rounded-xl flex items-center justify-center mb-3"
        style={{
          background: isLight
            ? `linear-gradient(135deg, ${hexAlpha(tile.tint, 0.12)}, ${hexAlpha(tile.tint, 0.07)})`
            : `linear-gradient(135deg, ${hexAlpha(tile.tint, 0.22)}, ${hexAlpha(tile.tint, 0.12)})`,
          border: `1px solid ${hexAlpha(tile.tint, isLight ? 0.18 : 0.25)}`,
          boxShadow: isLight ? `0 4px 12px -6px ${hexAlpha(tile.tint, 0.35)}` : 'none',
        }}
      >
        <Icon size={20} color={tile.tint} strokeWidth={2.1} />
      </div>

      {/* Label */}
      <p
        className="text-[13px] sm:text-[14px] font-extrabold leading-tight tracking-tight"
        style={{ color: t.text }}
      >
        {tile.label}
      </p>

      {/* Hint */}
      {tile.hint && (
        <p
          className="text-[10px] sm:text-[11px] font-medium leading-tight mt-0.5 truncate w-full"
          style={{ color: t.textTer }}
        >
          {tile.hint}
        </p>
      )}
    </motion.button>
  );
}

// ── Hex + alpha helper ────────────────────────────────────────────────────────

function hexAlpha(hex: string, alpha: number): string {
  if (!hex.startsWith('#') || hex.length !== 7) return hex;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}