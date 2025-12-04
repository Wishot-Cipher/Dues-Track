import type { ReactNode, CSSProperties } from 'react';
import { colors } from '@/config/colors';

interface PageWrapperProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  showGrid?: boolean;
  showOrbs?: boolean;
  showEceLogo?: boolean;
  noPadding?: boolean;
  centered?: boolean;
}

/**
 * PageWrapper - Consistent full-screen page layout
 * Ensures proper full-height on both desktop and mobile (including dynamic viewport)
 */
export default function PageWrapper({
  children,
  className = '',
  style = {},
  showGrid = true,
  showOrbs = true,
  showEceLogo = true,
  noPadding = false,
  centered = false,
}: PageWrapperProps) {
  return (
    <div
      className={`
        min-h-screen relative overflow-x-hidden
        ${centered ? 'flex items-center justify-center' : ''}
        ${noPadding ? '' : 'p-4 sm:p-6 lg:p-8'}
        ${className}
      `}
      style={{
        minHeight: '100dvh', // Dynamic viewport height for mobile
        width: '100%',
        background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)',
        ...style,
      }}
    >
      {/* Background Grid Pattern */}
      {showGrid && (
        <div
          className="fixed inset-0 opacity-20 pointer-events-none"
          style={{
            backgroundImage: `
              linear-gradient(${colors.primary}40 1px, transparent 1px),
              linear-gradient(90deg, ${colors.primary}40 1px, transparent 1px)
            `,
            backgroundSize: '50px 50px',
          }}
        />
      )}

      {/* Animated Gradient Orbs */}
      {showOrbs && (
        <div className="fixed inset-0 overflow-hidden pointer-events-none">
          <div
            className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30 animate-pulse"
            style={{
              background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
              top: '-10%',
              right: '-5%',
              animationDuration: '4s',
            }}
          />
          <div
            className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
            style={{
              background: `radial-gradient(circle, ${colors.accentMint} 0%, transparent 70%)`,
              bottom: '-5%',
              left: '-5%',
              animation: 'pulse 6s ease-in-out infinite',
            }}
          />

          {/* ECE Logo Background - Creative Element */}
          {showEceLogo && (
            <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none">
              <img
                src="/Ece picture.jpg"
                alt="ECE Background"
                className="w-full h-full object-contain"
                style={{
                  filter: 'grayscale(0.5) brightness(0.8)',
                  mixBlendMode: 'soft-light',
                }}
              />
            </div>
          )}
        </div>
      )}

      {/* Main Content - rendered directly without wrapper */}
      {children}
    </div>
  );
}
