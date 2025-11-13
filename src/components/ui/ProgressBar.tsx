import React from 'react'
import { colors } from '../../config/colors'

interface ProgressBarProps {
  progress?: number
  color?: string
  height?: string
  showLabel?: boolean
  label?: string
  animated?: boolean
  showPercentage?: boolean
}

const ProgressBar: React.FC<ProgressBarProps> = ({
  progress = 0,
  color = colors.primary,
  height = 'h-2.5',
  showLabel = false,
  label = '',
  animated = true,
  showPercentage = false,
}) => {
  const clampedProgress = Math.min(Math.max(progress, 0), 100)

  return (
    <div className="w-full">
      {(showLabel || showPercentage) && (
        <div className="flex justify-between items-center text-sm mb-2">
          {showLabel && (
            <span style={{ color: colors.textSecondary }}>
              {label || 'Progress'}
            </span>
          )}
          {showPercentage && (
            <span className="font-semibold" style={{ color: color }}>
              {Math.round(clampedProgress)}%
            </span>
          )}
        </div>
      )}

      <div className={`w-full bg-white/5 rounded-full ${height} overflow-hidden border border-white/10`}>
        <div
          className={`${height} rounded-full transition-all duration-500 relative`}
          style={{
            width: `${clampedProgress}%`,
            background: `linear-gradient(90deg, ${color}, ${colors.accentMint})`,
            boxShadow: `0 0 20px ${color}80`,
          }}
        >
          {animated && clampedProgress > 0 && (
            <div
              className="absolute inset-0 bg-linear-to-r from-transparent via-white/30 to-transparent"
              style={{ animation: 'shimmer 2s linear infinite' }}
            />
          )}
        </div>
      </div>
    </div>
  )
}

export default ProgressBar
