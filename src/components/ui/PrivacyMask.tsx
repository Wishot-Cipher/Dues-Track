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
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <motion.button
      type="button"
      onClick={() => updateSetting('appearance', 'showBalance', !visible)}
      className="flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-all duration-200"
      style={{
        background: visible ? 'rgba(255,255,255,0.06)' : `${colors.primary}15`,
        border: `1px solid ${visible ? 'rgba(255,255,255,0.08)' : colors.primary + '30'}`,
      }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.95 }}
      title={visible ? 'Hide balances' : 'Show balances'}
      aria-label={visible ? 'Hide balances' : 'Show balances'}
    >
      <Icon size={iconSize} style={{ color: visible ? colors.textSecondary : colors.primary }} />
      <span 
        className="text-[10px] sm:text-xs font-medium hidden min-[360px]:inline"
        style={{ color: visible ? colors.textSecondary : colors.primary }}
      >
        {visible ? 'Hide' : 'Show'}
      </span>
    </motion.button>
  );
}
