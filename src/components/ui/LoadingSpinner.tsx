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
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: '16px',
        background: overlay ? 'rgba(15, 7, 3, 0.9)' : 'rgba(15, 7, 3, 1)',
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
      <Loader2
        size={iconSize}
        className="animate-spin"
        style={{ color }}
      />
      {text && (
        <p 
          className="text-sm font-medium text-center"
          style={{ color: colors.textSecondary }}
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
