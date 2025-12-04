import type React from 'react';
import type { CSSProperties } from 'react';
import { Loader2 } from 'lucide-react';
import { colors } from '@/config/colors';

interface LoadingSpinnerProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  color?: string;
  text?: string;
  fullScreen?: boolean;
  overlay?: boolean;
}

const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  size = 'lg',
  color = colors.primary,
  text,
  fullScreen = false,
  overlay = false,
}) => {
  const sizeMap = {
    sm: 20,
    md: 32,
    lg: 48,
    xl: 64,
  };

  const iconSize = sizeMap[size];

  const containerStyles: CSSProperties = fullScreen || overlay
    ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100vw',
        height: '100dvh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: '#0F0703',
        backdropFilter: overlay ? 'blur(8px)' : 'none',
        zIndex: 9999,
        padding: '16px',
      }
    : {
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '12px',
      };

  return (
    <div style={containerStyles}>
      {/* Gradient orbs for visual interest */}
      {(fullScreen || overlay) && (
        <>
          <div
            style={{
              position: 'absolute',
              top: '10%',
              left: '20%',
              width: '300px',
              height: '300px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(255, 104, 3, 0.15) 0%, transparent 70%)',
              filter: 'blur(40px)',
              pointerEvents: 'none',
            }}
          />
          <div
            style={{
              position: 'absolute',
              bottom: '20%',
              right: '10%',
              width: '250px',
              height: '250px',
              borderRadius: '50%',
              background: 'radial-gradient(circle, rgba(48, 255, 172, 0.1) 0%, transparent 70%)',
              filter: 'blur(40px)',
              pointerEvents: 'none',
            }}
          />
        </>
      )}
      
      <Loader2
        size={iconSize}
        className="animate-spin"
        style={{ color, position: 'relative', zIndex: 1 }}
      />
      {text && (
        <p 
          className="text-sm font-medium text-center"
          style={{ color: colors.textSecondary, position: 'relative', zIndex: 1 }}
        >
          {text}
        </p>
      )}

      <style>{`
        @keyframes spin {
          from {
            transform: rotate(0deg);
          }
          to {
            transform: rotate(360deg);
          }
        }
        .animate-spin {
          animation: spin 1s linear infinite;
        }
      `}</style>
    </div>
  );
};

export default LoadingSpinner;
