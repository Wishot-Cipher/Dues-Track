import type React from 'react';
import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react';
import { colors } from '@/config/colors';

interface InputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  icon?: ReactNode;
  iconPosition?: 'left' | 'right';
  fullWidth?: boolean;
  variant?: 'default' | 'filled';
}

const Input: React.FC<InputProps> = ({
  label,
  error,
  helperText,
  icon,
  iconPosition = 'left',
  fullWidth = false,
  variant = 'default',
  className = '',
  style,
  disabled,
  ...props
}) => {
  const baseStyles: CSSProperties = {
    background: variant === 'filled' 
      ? 'rgba(255, 255, 255, 0.08)' 
      : 'rgba(255, 255, 255, 0.05)',
    border: error 
      ? `1px solid ${colors.statusUnpaid}` 
      : '1px solid rgba(255, 255, 255, 0.1)',
    color: colors.textPrimary,
    outline: 'none',
    transition: 'all 0.3s ease',
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'text',
  };

  const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!error && !disabled) {
      e.target.style.borderColor = colors.primary;
      e.target.style.boxShadow = `0 0 20px ${colors.primary}40`;
    }
    props.onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
    if (!error) {
      e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      e.target.style.boxShadow = 'none';
    }
    props.onBlur?.(e);
  };

  return (
    <div className={`${fullWidth ? 'w-full' : ''}`}>
      {label && (
        <label 
          className="block text-sm font-medium mb-2"
          style={{ color: error ? colors.statusUnpaid : colors.textPrimary }}
        >
          {label}
          {props.required && <span style={{ color: colors.primary }}> *</span>}
        </label>
      )}

      <div className="relative">
        {icon && iconPosition === 'left' && (
          <div
            className="absolute left-4 top-1/2 transform -translate-y-1/2 pointer-events-none"
            style={{ color: error ? colors.statusUnpaid : colors.textSecondary }}
          >
            {icon}
          </div>
        )}

        <input
          {...props}
          disabled={disabled}
          className={`w-full px-4 py-3 rounded-xl ${
            icon && iconPosition === 'left' ? 'pl-12' : ''
          } ${icon && iconPosition === 'right' ? 'pr-12' : ''} ${className}`}
          style={{ ...baseStyles, ...style }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        />

        {icon && iconPosition === 'right' && (
          <div
            className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none"
            style={{ color: error ? colors.statusUnpaid : colors.textSecondary }}
          >
            {icon}
          </div>
        )}
      </div>

      {error && (
        <p className="text-xs mt-2" style={{ color: colors.statusUnpaid }}>
          {error}
        </p>
      )}

      {!error && helperText && (
        <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
          {helperText}
        </p>
      )}
    </div>
  );
};

export default Input;
