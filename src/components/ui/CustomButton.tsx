import React from 'react'
import type { CSSProperties } from 'react'
import { colors, gradients, glows } from '../../config/colors'
import { motion } from 'framer-motion'

type Variant = 'primary' | 'secondary' | 'success' | 'danger' | 'ghost'
type Size = 'sm' | 'md' | 'lg'

interface CustomButtonProps {
  children?: React.ReactNode
  variant?: Variant
  icon?: React.ComponentType<{ size?: number }>
  onClick?: React.ButtonHTMLAttributes<HTMLButtonElement>['onClick']
  type?: 'button' | 'submit' | 'reset'
  className?: string
  disabled?: boolean
  loading?: boolean
  fullWidth?: boolean
  size?: Size
}

const CustomButton: React.FC<CustomButtonProps> = ({
  children,
  variant = 'primary',
  icon: Icon,
  onClick,
  type = 'button',
  className = '',
  disabled = false,
  loading = false,
  fullWidth = false,
  size = 'md',
}) => {
  const [isHovered, setIsHovered] = React.useState(false)

  const variants: Record<Variant, { background: string; color: string; hoverGlow: string; border?: string }>
    = {
      primary: {
        background: gradients.primary,
        color: colors.textPrimary,
        hoverGlow: glows.amber,
      },
      secondary: {
        background: 'rgba(255, 255, 255, 0.1)',
        color: colors.textPrimary,
        hoverGlow: glows.mint,
        border: '1px solid rgba(255, 255, 255, 0.2)',
      },
      success: {
        background: gradients.secondary,
        color: colors.textPrimary,
        hoverGlow: glows.green,
      },
      danger: {
        background: `linear-gradient(135deg, ${colors.error}, ${colors.warning})`,
        color: colors.textPrimary,
        hoverGlow: glows.red,
      },
      ghost: {
        background: 'transparent',
        color: colors.textPrimary,
        hoverGlow: 'none',
        border: '1px solid transparent',
      },
    }

  const sizes: Record<Size, string> = {
    sm: 'px-4 py-2 text-sm',
    md: 'px-6 py-3 text-sm',
    lg: 'px-8 py-4 text-base',
  }

  const styleDef = variants[variant]

  const style: CSSProperties = {
    background: styleDef.background,
    color: styleDef.color,
    border: styleDef.border,
    boxShadow: isHovered && !disabled ? styleDef.hoverGlow : 'none',
    transform: isHovered && !disabled ? 'scale(1.02)' : 'scale(1)',
  }

  // Modern loading spinner component
  const LoadingSpinner = () => {
    const spinnerSize = size === 'sm' ? 16 : size === 'lg' ? 20 : 18
    
    return (
      <motion.div 
        className="flex items-center gap-2"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      >
        {/* Spinning circle loader */}
        <svg
          className="animate-spin"
          width={spinnerSize}
          height={spinnerSize}
          viewBox="0 0 24 24"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <circle
            className="opacity-25"
            cx="12"
            cy="12"
            r="10"
            stroke="currentColor"
            strokeWidth="3"
          />
          <path
            className="opacity-75"
            fill="currentColor"
            d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
          />
        </svg>
        
        {/* Alternative: Pulsing dots - uncomment to use instead of spinner */}
        {/* <div className="flex items-center gap-1">
          {[0, 1, 2].map((i) => (
            <motion.div
              key={i}
              className="rounded-full bg-current"
              style={{ width: size === 'sm' ? 4 : size === 'lg' ? 6 : 5, height: size === 'sm' ? 4 : size === 'lg' ? 6 : 5 }}
              animate={{
                scale: [1, 1.3, 1],
                opacity: [0.5, 1, 0.5],
              }}
              transition={{
                duration: 0.8,
                repeat: Infinity,
                delay: i * 0.15,
                ease: 'easeInOut',
              }}
            />
          ))}
        </div> */}
        
        {children && <span className="opacity-80">{children}</span>}
      </motion.div>
    )
  }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled || loading}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      className={`
        ${sizes[size]} rounded-xl font-semibold
        transition-all duration-300 
        flex items-center justify-center gap-2 
        disabled:opacity-50 disabled:cursor-not-allowed
        ${fullWidth ? 'w-full' : ''}
        ${className}
      `}
      style={style}
    >
      {loading ? (
        <LoadingSpinner />
      ) : (
        <>
          {Icon && <Icon size={size === 'sm' ? 16 : size === 'lg' ? 22 : 18} />}
          {children}
        </>
      )}
    </button>
  )
}

export default CustomButton
