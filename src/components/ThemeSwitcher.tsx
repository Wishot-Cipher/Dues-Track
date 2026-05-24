/**
 * ThemeSwitcher — compact icon button that cycles light → dark → system.
 *
 * Tiny, fintech-style chip that fits in any header. Shows the icon for
 * the *current* choice so the user always sees what they have selected,
 * not what they're about to switch to (less confusing).
 *
 * The actual theme application lives in `useTheme`. This component is
 * just the UI affordance.
 */

import { Sun, Moon, MonitorSmartphone } from 'lucide-react';
import { motion } from 'framer-motion';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import type { ThemeChoice } from '@/hooks/useTheme';

const ORDER: ThemeChoice[] = ['light', 'dark', 'system'];

export default function ThemeSwitcher({
  className = '',
  size = 36,
}: {
  className?: string;
  size?: number;
}) {
  const { choice, theme, setTheme } = useTheme();
  const tokens = getDashboardTokens(theme);
  const isLight = theme === 'light';

  const Icon =
    choice === 'light'  ? Sun
  : choice === 'dark'   ? Moon
  : MonitorSmartphone;

  const label =
    choice === 'light'  ? 'Light mode — click to switch'
  : choice === 'dark'   ? 'Dark mode — click to switch'
  : 'System theme — click to switch';

  const cycleNext = () => {
    const i = ORDER.indexOf(choice);
    const next = ORDER[(i + 1) % ORDER.length];
    setTheme(next);
  };

  return (
    <motion.button
      type="button"
      onClick={cycleNext}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.04 }}
      className={`rounded-full flex items-center justify-center transition-colors ${className}`}
      style={{
        width: size,
        height: size,
        background: isLight ? '#FFFFFF' : 'rgba(255,255,255,0.06)',
        color: tokens.text,
        border: `1px solid ${tokens.cardBorder}`,
        boxShadow: isLight
          ? '0 6px 18px -8px rgba(15, 7, 3, 0.16)'
          : 'none',
      }}
      aria-label={label}
      title={label}
    >
      <Icon size={Math.round(size * 0.45)} />
    </motion.button>
  );
}
