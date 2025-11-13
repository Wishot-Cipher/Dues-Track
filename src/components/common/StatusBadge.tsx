import { CheckCircle, Clock, XCircle } from 'lucide-react';

interface StatusBadgeProps {
  status: 'approved' | 'pending' | 'rejected';
  size?: 'sm' | 'md' | 'lg';
  showIcon?: boolean;
}

const colors = {
  statusPaid: '#10b981',
  warning: '#f59e0b',
  statusUnpaid: '#ef4444',
};

export function StatusBadge({ status, size = 'md', showIcon = true }: StatusBadgeProps) {
  const getStatusConfig = () => {
    switch (status) {
      case 'approved':
        return {
          text: 'PAID',
          color: colors.statusPaid,
          icon: <CheckCircle className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
          emoji: '✅'
        };
      case 'pending':
        return {
          text: 'PENDING',
          color: colors.warning,
          icon: <Clock className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
          emoji: '🟡'
        };
      case 'rejected':
        return {
          text: 'REJECTED',
          color: colors.statusUnpaid,
          icon: <XCircle className={size === 'sm' ? 'w-3 h-3' : 'w-4 h-4'} />,
          emoji: '🔴'
        };
    }
  };

  const config = getStatusConfig();
  const sizeClasses = {
    sm: 'px-2 py-0.5 text-[10px]',
    md: 'px-3 py-1 text-xs',
    lg: 'px-4 py-1.5 text-sm'
  };

  return (
    <div 
      className={`${sizeClasses[size]} rounded-full flex items-center gap-1.5 font-medium shrink-0`}
      style={{ 
        background: `${config.color}20`,
        color: config.color,
        border: `1px solid ${config.color}30`
      }}
    >
      {showIcon && config.icon}
      <span className="hidden sm:inline">{config.text}</span>
      <span className="sm:hidden">{config.emoji}</span>
    </div>
  );
}
