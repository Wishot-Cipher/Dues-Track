/**
 * PromoBanner — soft horizontal call-out card under "Due Next".
 *
 * Use it for:
 *   • Encouraging on-time payment ("Pay early, save 5%")
 *   • Announcing new features ("Bank transfer now live")
 *   • Nudging the user to enable notifications
 *
 * Visual recipe:
 *   • Rounded card with a tinted gradient + 1px tinted border
 *   • Left: small icon chip in the tint colour
 *   • Middle: title + sub
 *   • Right (optional): a subtle "Got it" / "Open" pill button
 *   • Theme-aware via getDashboardTokens
 *   • Subtle motion on mount; press-feedback on the action button
 *
 * Reusable in other pages where the same shape works.
 */

import { motion } from 'framer-motion';
import type { ResolvedTheme } from '@/hooks/useTheme';
import { getDashboardTokens } from '@/hooks/useTheme';
import type { LucideIcon } from 'lucide-react';
import { X } from 'lucide-react';

export interface PromoBannerProps {
  theme: ResolvedTheme;
  icon: LucideIcon;
  title: string;
  subtitle?: string;
  /** Tint colour (drives the gradient + chip). Use a brand token. */
  tint: string;
  /** Optional action button. */
  actionLabel?: string;
  onAction?: () => void;
  /** Optional dismiss button (renders a small X on the right). */
  onDismiss?: () => void;
}

export default function PromoBanner({
  theme,
  icon: Icon,
  title,
  subtitle,
  tint,
  actionLabel,
  onAction,
  onDismiss,
}: PromoBannerProps) {
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl px-4 py-3.5 flex items-center gap-3 relative overflow-hidden"
      style={{
        background: isLight
          ? `linear-gradient(135deg, ${hexAlpha(tint, 0.10)} 0%, ${hexAlpha(tint, 0.04)} 100%)`
          : `linear-gradient(135deg, ${hexAlpha(tint, 0.12)} 0%, rgba(255,255,255,0.02) 100%)`,
        border: `1px solid ${hexAlpha(tint, isLight ? 0.18 : 0.22)}`,
      }}
    >
      {/* Decorative diagonal stripe — subtle texture */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: `linear-gradient(135deg, transparent 48%, ${hexAlpha(tint, isLight ? 0.04 : 0.06)} 49%, transparent 51%)`,
          backgroundSize: '14px 14px',
          opacity: 0.6,
        }}
        aria-hidden
      />

      {/* Icon chip */}
      <div
        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 relative z-10"
        style={{
          background: isLight ? '#FFFFFF' : hexAlpha(tint, 0.18),
          border: `1px solid ${hexAlpha(tint, isLight ? 0.20 : 0.30)}`,
          boxShadow: isLight ? `0 4px 12px -4px ${hexAlpha(tint, 0.30)}` : 'none',
        }}
      >
        <Icon size={18} color={tint} />
      </div>

      {/* Text */}
      <div className="flex-1 min-w-0 relative z-10">
        <p className="text-[13px] font-bold leading-tight" style={{ color: t.text }}>
          {title}
        </p>
        {subtitle && (
          <p className="text-[11px] leading-snug mt-0.5" style={{ color: t.textSec }}>
            {subtitle}
          </p>
        )}
      </div>

      {/* Action */}
      {actionLabel && (
        <motion.button
          type="button"
          onClick={onAction}
          whileTap={{ scale: 0.96 }}
          className="relative z-10 shrink-0 px-3 py-1.5 rounded-full text-[11px] font-bold transition-colors"
          style={{
            background: tint,
            color: '#fff',
            boxShadow: `0 6px 14px -6px ${hexAlpha(tint, 0.60)}`,
          }}
        >
          {actionLabel}
        </motion.button>
      )}

      {/* Dismiss */}
      {onDismiss && !actionLabel && (
        <button
          type="button"
          onClick={onDismiss}
          className="relative z-10 shrink-0 w-7 h-7 rounded-full flex items-center justify-center hover:bg-black/5 transition-colors"
          aria-label="Dismiss"
        >
          <X size={14} color={t.textTer} />
        </button>
      )}
    </motion.div>
  );
}

function hexAlpha(color: string, alpha: number): string {
  if (!color.startsWith('#') || color.length !== 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
