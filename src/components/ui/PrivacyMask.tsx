import { Eye, EyeOff } from 'lucide-react';
import { motion } from 'framer-motion';
import { useSettings } from '@/contexts/SettingsContext';
import { colors } from '@/config/colors';
import type { ReactNode } from 'react';

/**
 * Masks sensitive financial text when privacy mode is on.
 * Wraps the value in a blur filter for a professional "hidden" look.
 */
export function PrivacyMask({ children, className = '' }: {
  children: ReactNode;
  className?: string;
}) {
  const { settings } = useSettings();
  const hidden = !settings.appearance.showBalance;

  return (
    <span
      className={className}
      style={hidden ? { filter: 'blur(8px)', userSelect: 'none', pointerEvents: 'none', display: 'inline-block' } : { display: 'inline-block' }}
      aria-hidden={hidden}
    >
      {children}
    </span>
  );
}

/**
 * Compact eye toggle button to show/hide balances.
 * Place next to a section header or in the dashboard toolbar.
 */
export function PrivacyToggle({ size = 'md' }: { size?: 'sm' | 'md' }) {
  const { settings, updateSetting } = useSettings();
  const visible = settings.appearance.showBalance;
  const Icon = visible ? Eye : EyeOff;
  const px = size === 'sm' ? 'p-1.5' : 'p-2';
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <motion.button
      type="button"
      onClick={() => updateSetting('appearance', 'showBalance', !visible)}
      className={`${px} rounded-xl transition-all duration-200`}
      style={{
        background: visible ? 'rgba(255,255,255,0.05)' : `${colors.primary}18`,
        border: `1px solid ${visible ? 'rgba(255,255,255,0.1)' : colors.primary + '40'}`,
      }}
      whileTap={{ scale: 0.9 }}
      title={visible ? 'Hide balances' : 'Show balances'}
      aria-label={visible ? 'Hide balances' : 'Show balances'}
    >
      <Icon size={iconSize} style={{ color: visible ? colors.textSecondary : colors.primary }} />
    </motion.button>
  );
}
