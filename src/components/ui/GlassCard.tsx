import React, { useState } from 'react'
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react'
import { getDashboardTokens, useTheme } from '@/hooks/useTheme'

type Intensity = 'light' | 'medium' | 'strong'

interface GlassCardProps {
  children?: ReactNode
  className?: string
  onClick?: MouseEventHandler<HTMLDivElement>
  hover?: boolean
  intensity?: Intensity
}

const GlassCard: React.FC<GlassCardProps> = ({
  children,
  className = '',
  onClick,
  hover = true,
  intensity = 'light',
}) => {
  const [isHovered, setIsHovered] = useState(false)
  const { theme } = useTheme()
  const tokens = getDashboardTokens(theme)

  // disable hover effects on touch devices to avoid layout shifts when tapping
  const isTouchDevice =
    typeof window !== 'undefined' && (
      'ontouchstart' in window || (navigator.maxTouchPoints ?? 0) > 0)


  const baseStylesByIntensity: Record<Intensity, CSSProperties> = {
    light: {
      background: tokens.card,
      border: `1px solid ${tokens.cardBorder}`,
      boxShadow: '0 8px 32px rgba(15, 7, 3, 0.06)',
    },
    medium: {
      background: theme === 'light' ? '#FFF9F2' : 'rgba(255, 255, 255, 0.04)',
      border: `1px solid ${theme === 'light' ? 'rgba(15, 7, 3, 0.08)' : tokens.cardBorder}`,
      boxShadow: '0 12px 48px rgba(15, 7, 3, 0.10)',
    },
    strong: {
      background: theme === 'light' ? '#FFFFFF' : 'rgba(255, 255, 255, 0.06)',
      border: `1px solid ${tokens.primaryRing}`,
      boxShadow: `0 20px 60px ${theme === 'light' ? 'rgba(255, 104, 3, 0.10)' : 'rgba(255, 104, 3, 0.22)'}`,
    },
  }

  const glassStyles = baseStylesByIntensity[intensity]

  const hoverStyles: CSSProperties =
    hover && isHovered
      ? {
          background: theme === 'light' ? '#FFF7EE' : 'rgba(32, 20, 13, 0.8)',
          borderColor: tokens.primaryRing,
          boxShadow: theme === 'light'
            ? '0 12px 48px 0 rgba(255, 104, 3, 0.12)'
            : '0 12px 48px 0 rgba(255, 104, 3, 0.3)',
          transform: 'translateY(-4px)',
        }
      : (glassStyles as CSSProperties)

  const style: CSSProperties = {
    ...hoverStyles,
    backdropFilter: glassStyles?.backdropFilter,
  }

  return (
    <div
      onClick={onClick}
  onMouseEnter={() => hover && !isTouchDevice && setIsHovered(true)}
  onMouseLeave={() => !isTouchDevice && setIsHovered(false)}
  className={`relative rounded-2xl p-6 transition-all duration-300 transform-gpu ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

export default GlassCard
