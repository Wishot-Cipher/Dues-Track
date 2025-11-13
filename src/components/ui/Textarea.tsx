import type React from 'react';
import type { CSSProperties, TextareaHTMLAttributes } from 'react';
import { colors } from '@/config/colors';

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
  helperText?: string;
  fullWidth?: boolean;
  showCharCount?: boolean;
  maxLength?: number;
}

const Textarea: React.FC<TextareaProps> = ({
  label,
  error,
  helperText,
  fullWidth = false,
  showCharCount = false,
  maxLength,
  className = '',
  style,
  disabled,
  value,
  ...props
}) => {
  const baseStyles: CSSProperties = {
    background: 'rgba(255, 255, 255, 0.05)',
    border: error 
      ? `1px solid ${colors.statusUnpaid}` 
      : '1px solid rgba(255, 255, 255, 0.1)',
    color: colors.textPrimary,
    outline: 'none',
    transition: 'all 0.3s ease',
    resize: 'vertical',
    minHeight: '100px',
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'text',
  };

  const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!error && !disabled) {
      e.target.style.borderColor = colors.primary;
      e.target.style.boxShadow = `0 0 20px ${colors.primary}40`;
    }
    props.onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
    if (!error) {
      e.target.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      e.target.style.boxShadow = 'none';
    }
    props.onBlur?.(e);
  };

  const charCount = typeof value === 'string' ? value.length : 0;

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

      <textarea
        {...props}
        value={value}
        maxLength={maxLength}
        disabled={disabled}
        className={`w-full px-4 py-3 rounded-xl ${className}`}
        style={{ ...baseStyles, ...style }}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />

      <div className="flex justify-between items-center mt-2">
        <div className="flex-1">
          {error && (
            <p className="text-xs" style={{ color: colors.statusUnpaid }}>
              {error}
            </p>
          )}

          {!error && helperText && (
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              {helperText}
            </p>
          )}
        </div>

        {showCharCount && maxLength && (
          <p 
            className="text-xs ml-4"
            style={{ 
              color: charCount > maxLength * 0.9 
                ? colors.statusUnpaid 
                : colors.textSecondary 
            }}
          >
            {charCount} / {maxLength}
          </p>
        )}
      </div>
    </div>
  );
};

export default Textarea;
