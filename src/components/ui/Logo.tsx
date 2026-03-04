import { motion } from 'framer-motion';
import { colors } from '@/config/colors';
import logoIcon from '@/assets/logo-icon.svg';
import logoLight from '@/assets/logo-light.svg';

interface LogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  showText?: boolean;
  variant?: 'default' | 'light';
  className?: string;
}

const sizeMap = {
  sm: { icon: 'w-10 h-10', text: 'text-lg', sub: 'text-[10px]' },
  md: { icon: 'w-12 h-12', text: 'text-xl', sub: 'text-xs' },
  lg: { icon: 'w-16 h-16', text: 'text-2xl', sub: 'text-xs' },
  xl: { icon: 'w-24 h-24', text: 'text-3xl', sub: 'text-sm' },
};

export default function Logo({ size = 'md', showText = true, variant = 'default', className = '' }: LogoProps) {
  const { icon, text, sub } = sizeMap[size];
  const src = variant === 'light' ? logoLight : logoIcon;
  
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <motion.div
        className={`${icon} flex items-center justify-center relative shrink-0`}
        whileHover={{ scale: 1.04 }}
        whileTap={{ scale: 0.96 }}
      >
        <img 
          src={src} 
          alt="Payvexo" 
          className="w-full h-full object-contain"
          draggable={false}
        />
      </motion.div>
      
      {showText && (
        <div className="leading-tight">
          <h1 className={`${text} font-extrabold text-white tracking-tight`}>
            Pay<span style={{ color: colors.primary }}>vexo</span>
          </h1>
          <p className={`${sub} font-medium tracking-widest uppercase`} style={{ color: colors.textTertiary }}>
            Payment Management
          </p>
        </div>
      )}
    </div>
  );
}

// Compact version for navbar — uses the transparent light mark
export function LogoCompact({ className = '' }: { className?: string }) {
  return (
    <motion.div
      className={`w-12 h-12 sm:w-14 sm:h-14 shrink-0 ${className}`}
      style={{ 
        minWidth: '48px',
        minHeight: '48px',
      }}
      whileHover={{ scale: 1.04 }}
      whileTap={{ scale: 0.96 }}
    >
      <img 
        src={logoLight} 
        alt="Payvexo" 
        width={56}
        height={56}
        className="block w-full h-full object-contain"
        draggable={false}
      />
    </motion.div>
  );
}

// Inline mark for use inside text or receipts
export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <img 
      src={logoLight} 
      alt="DT" 
      width={size} 
      height={size} 
      className="inline-block"
      draggable={false}
    />
  );
}
