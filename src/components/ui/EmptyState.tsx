import type React from 'react';
import type { ReactNode } from 'react';
import { motion } from 'framer-motion';
import { colors, gradients } from '@/config/colors';
import { Wallet, Search, AlertTriangle, CheckCircle2, Inbox, CreditCard, Receipt, Trophy } from 'lucide-react';

type IllustrationType = 'inbox' | 'search' | 'error' | 'success' | 'payments' | 'wallet' | 'receipt' | 'achievement';

interface EmptyStateProps {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
  illustration?: IllustrationType;
  size?: 'sm' | 'md' | 'lg';
  animated?: boolean;
}

const EmptyState: React.FC<EmptyStateProps> = ({
  icon,
  title,
  description,
  action,
  illustration,
  size = 'md',
  animated = true,
}) => {
  const illustrationConfig: Record<IllustrationType, { Icon: typeof Wallet; color: string; gradient: string }> = {
    inbox: { 
      Icon: Inbox, 
      color: colors.primary, 
      gradient: 'linear-gradient(135deg, rgba(255, 104, 3, 0.15) 0%, rgba(255, 172, 95, 0.1) 100%)' 
    },
    search: { 
      Icon: Search, 
      color: colors.accentCyan, 
      gradient: 'linear-gradient(135deg, rgba(0, 230, 255, 0.15) 0%, rgba(138, 43, 226, 0.1) 100%)' 
    },
    error: { 
      Icon: AlertTriangle, 
      color: colors.error, 
      gradient: 'linear-gradient(135deg, rgba(255, 77, 77, 0.15) 0%, rgba(255, 195, 0, 0.1) 100%)' 
    },
    success: { 
      Icon: CheckCircle2, 
      color: colors.accentMint, 
      gradient: 'linear-gradient(135deg, rgba(48, 255, 172, 0.15) 0%, rgba(22, 244, 86, 0.1) 100%)' 
    },
    payments: { 
      Icon: CreditCard, 
      color: colors.primary, 
      gradient: 'linear-gradient(135deg, rgba(255, 104, 3, 0.15) 0%, rgba(48, 255, 172, 0.1) 100%)' 
    },
    wallet: { 
      Icon: Wallet, 
      color: colors.accentMint, 
      gradient: 'linear-gradient(135deg, rgba(48, 255, 172, 0.15) 0%, rgba(0, 230, 255, 0.1) 100%)' 
    },
    receipt: { 
      Icon: Receipt, 
      color: colors.primary, 
      gradient: gradients.glass 
    },
    achievement: { 
      Icon: Trophy, 
      color: '#FFD700', 
      gradient: 'linear-gradient(135deg, rgba(255, 215, 0, 0.15) 0%, rgba(255, 104, 3, 0.1) 100%)' 
    },
  };

  const sizeConfig = {
    sm: { icon: 40, container: 'py-8 px-4', iconBox: 'w-14 h-14', title: 'text-base', desc: 'text-xs' },
    md: { icon: 48, container: 'py-12 px-6', iconBox: 'w-20 h-20', title: 'text-xl', desc: 'text-sm' },
    lg: { icon: 56, container: 'py-16 px-8', iconBox: 'w-24 h-24', title: 'text-2xl', desc: 'text-base' },
  };

  const config = sizeConfig[size];
  const illusConfig = illustration ? illustrationConfig[illustration] : null;

  const content = (
    <>
      {/* Icon/Illustration */}
      {icon ? (
        <motion.div
          className={`${config.iconBox} rounded-2xl flex items-center justify-center mb-6`}
          style={{
            background: `${colors.primary}10`,
            border: `1px solid ${colors.primary}30`,
          }}
          initial={animated ? { scale: 0, rotate: -180 } : undefined}
          animate={animated ? { scale: 1, rotate: 0 } : undefined}
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
        >
          {icon}
        </motion.div>
      ) : illusConfig ? (
        <motion.div
          className={`${config.iconBox} rounded-2xl flex items-center justify-center mb-6 relative overflow-hidden`}
          style={{
            background: illusConfig.gradient,
            border: `1px solid ${illusConfig.color}30`,
            boxShadow: `0 8px 32px ${illusConfig.color}20`,
          }}
          initial={animated ? { scale: 0, rotate: -180 } : undefined}
          animate={animated ? { scale: 1, rotate: 0 } : undefined}
          transition={{ type: 'spring', stiffness: 200, delay: 0.2 }}
        >
          {/* Background glow effect */}
          <div 
            className="absolute inset-0 opacity-50"
            style={{
              background: `radial-gradient(circle at center, ${illusConfig.color}20 0%, transparent 70%)`,
            }}
          />
          <motion.div
            animate={animated ? { y: [-5, 5, -5] } : undefined}
            transition={{ duration: 3, repeat: Infinity, ease: 'easeInOut' }}
          >
            <illusConfig.Icon 
              size={config.icon} 
              style={{ color: illusConfig.color }}
              strokeWidth={1.5}
            />
          </motion.div>
        </motion.div>
      ) : null}

      {/* Title */}
      <h3 
        className={`${config.title} font-bold mb-2`}
        style={{ color: colors.textPrimary }}
      >
        {title}
      </h3>

      {/* Description */}
      {description && (
        <p 
          className={`${config.desc} max-w-md mb-4`}
          style={{ color: colors.textSecondary }}
        >
          {description}
        </p>
      )}

      {/* Action */}
      {action && (
        <motion.div 
          className="mt-4"
          initial={animated ? { opacity: 0, y: 10 } : undefined}
          animate={animated ? { opacity: 1, y: 0 } : undefined}
          transition={{ delay: 0.4 }}
        >
          {action}
        </motion.div>
      )}
    </>
  );

  return animated ? (
    <motion.div
      className={`flex flex-col items-center justify-center ${config.container} text-center`}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5, ease: 'easeOut' }}
    >
      {content}
    </motion.div>
  ) : (
    <div className={`flex flex-col items-center justify-center ${config.container} text-center`}>
      {content}
    </div>
  );
};

export default EmptyState;

// Pre-built empty state variants for common use cases
export const NoPaymentsState = ({ onAction }: { onAction?: () => void }) => (
  <EmptyState
    illustration="payments"
    title="No payments yet"
    description="You haven't made any payments. Start by checking your pending dues."
    action={
      onAction && (
        <button
          onClick={onAction}
          className="px-6 py-2.5 rounded-xl font-semibold text-sm transition-transform hover:scale-105"
          style={{
            background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
            color: 'white',
          }}
        >
          View Pending Dues
        </button>
      )
    }
  />
);

export const AllPaidState = () => (
  <EmptyState
    illustration="success"
    title="All caught up! 🎉"
    description="You've paid all your dues. Great job staying on top of things!"
  />
);

export const NoSearchResultsState = ({ query }: { query?: string }) => (
  <EmptyState
    illustration="search"
    title="No results found"
    description={query ? `We couldn't find anything matching "${query}". Try a different search term.` : "Try adjusting your search or filters."}
    size="sm"
  />
);
