import React, { useState } from 'react'
import type { CSSProperties, MouseEventHandler, ReactNode } from 'react'
import { glass } from '@/config/colors'

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

  // glass may come from your config; keep it flexible
  const glassMap = glass as Record<Intensity, CSSProperties | undefined>
  const glassStyles = glassMap[intensity] ?? glassMap.light ?? ({} as CSSProperties)

  const hoverStyles: CSSProperties =
    hover && isHovered
      ? {
          background: 'rgba(32, 20, 13, 0.8)',
          borderColor: 'rgba(255, 104, 3, 0.3)',
          boxShadow: '0 12px 48px 0 rgba(255, 104, 3, 0.3)',
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
      onMouseEnter={() => hover && setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`relative rounded-2xl p-6 transition-all duration-300 ${onClick ? 'cursor-pointer' : ''} ${className}`}
      style={style}
    >
      {children}
    </div>
  )
}

export default GlassCard
