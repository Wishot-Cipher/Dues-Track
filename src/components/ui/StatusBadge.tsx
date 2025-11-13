import React from 'react'
import { colors } from '../../config/colors'

type Size = 'sm' | 'md' | 'lg'

interface StatusBadgeProps {
  status: 'paid' | 'unpaid' | 'partial' | 'pending' | 'rejected' | 'waived' | string
  size?: Size
  showIcon?: boolean
}

const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', showIcon = true }) => {
  const configs: Record<string, { color: string; label: string; icon: string; glow: string }> = {
    paid: {
      color: colors.statusPaid,
      label: 'Paid',
      icon: '✓',
      glow: 'rgba(22, 244, 86, 0.4)',
    },
    unpaid: {
      color: colors.statusUnpaid,
      label: 'Not Paid',
      icon: '●',
      glow: 'rgba(255, 77, 77, 0.4)',
    },
    partial: {
      color: colors.statusPartial,
      label: 'Partial',
      icon: '◐',
      glow: 'rgba(255, 195, 0, 0.4)',
    },
    pending: {
      color: colors.statusPending,
      label: 'Pending',
      icon: '◔',
      glow: 'rgba(48, 255, 172, 0.4)',
    },
    rejected: {
      color: colors.statusRejected,
      label: 'Rejected',
      icon: '✕',
      glow: 'rgba(255, 77, 77, 0.4)',
    },
    waived: {
      color: colors.statusWaived,
      label: 'Waived',
      icon: '⭐',
      glow: 'rgba(138, 43, 226, 0.4)',
    },
  }

  const config = configs[status] ?? configs.unpaid

  const sizes: Record<Size, string> = {
    sm: 'px-3 py-1 text-xs',
    md: 'px-4 py-2 text-sm',
    lg: 'px-5 py-2.5 text-base',
  }

  return (
    <span
      className={`
        ${sizes[size]} rounded-full font-bold 
        inline-flex items-center gap-2 backdrop-blur-sm
        transition-all duration-300
      `}
      style={{
        backgroundColor: `${config.color}15`,
        color: config.color,
        border: `1px solid ${config.color}50`,
        boxShadow: `0 0 20px ${config.glow}`,
      }}
    >
      {showIcon && <span>{config.icon}</span>}
      {config.label}
    </span>
  )
}

export default StatusBadge
