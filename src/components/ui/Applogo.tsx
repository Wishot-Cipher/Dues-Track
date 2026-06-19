/**
 * AppLogo — reusable Payvexo brand mark.
 *
 * Renders the logo image + "Pay" (orange) + "vexo" (muted) wordmark.
 * Use this everywhere instead of hardcoding the logo + APP_NAME.
 *
 * Props:
 *   size     — logo image size in px (default 32)
 *   textSize — Tailwind text class (default 'text-sm')
 *   showText — whether to show the wordmark (default true)
 *   isLight  — theme mode, affects vexo color (default false)
 */

import { motion } from 'framer-motion';

interface AppLogoProps {
  size?: number;
  textSize?: string;
  showText?: boolean;
  isLight?: boolean;
  animate?: boolean;
  className?: string;
}

export default function AppLogo({
  size = 32,
  textSize = 'text-sm',
  showText = true,
  isLight = false,
  animate = false,
  className = '',
}: AppLogoProps) {
  const imgEl = (
    <div
      className="rounded-lg overflow-hidden shrink-0"
      style={{
        width: size,
        height: size,
        boxShadow: '0 4px 12px rgba(255,104,3,0.35)',
      }}
    >
      <img
        src="/pavexoLogo.jpeg"
        alt="Payvexo"
        className="w-full h-full object-cover"
        style={{ transform: 'scale(1.25)' }}
      />
    </div>
  );

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {animate ? (
        <motion.div
          whileHover={{ rotate: [0, -5, 5, 0], scale: 1.1 }}
          transition={{ duration: 0.4 }}
        >
          {imgEl}
        </motion.div>
      ) : imgEl}

      {showText && (
        <span className={`font-extrabold tracking-tight ${textSize}`}>
          <span style={{ color: '#FF6803' }}>Pay</span>
          <span style={{ color: isLight ? '#C2A98E' : '#FAF0E6' }}>vexo</span>
        </span>
      )}
    </div>
  );
}