import type React from 'react';
import type { ReactNode } from 'react';
import { colors } from '@/config/colors';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  illustration?: 'inbox' | 'search' | 'error' | 'success';
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  illustration,
}) => {
  const getIllustrationEmoji = () => {
    switch (illustration) {
      case 'inbox':
        return '📭';
      case 'search':
        return '🔍';
      case 'error':
        return '⚠️';
      case 'success':
        return '✅';
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      {/* Icon/Illustration */}
      {icon ? (
        <div
          className="w-20 h-20 rounded-2xl flex items-center justify-center mb-6"
          style={{
            background: `${colors.primary}10`,
            border: `1px solid ${colors.primary}30`,
          }}
        >
          {icon}
        </div>
      ) : illustration ? (
        <div className="text-6xl mb-6">
          {getIllustrationEmoji()}
        </div>
      ) : null}

      {/* Title */}
      <h3 
        className="text-xl font-bold mb-2"
        style={{ color: colors.textPrimary }}
      >
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p 
          className="text-sm max-w-md mb-6"
          style={{ color: colors.textSecondary }}
        >
          {description}
        </p>
      )}

      {/* Action */}
      {action && (
        <div className="mt-4">
          {action}
        </div>
      )}
    </div>
  );
};

export default EmptyState;
