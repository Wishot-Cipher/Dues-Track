import type React from 'react';
import type { CSSProperties, SelectHTMLAttributes } from 'react';
import { ChevronDown } from 'lucide-react';
import { colors } from '@/config/colors';

interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'size'> {
  label?: string;
  error?: string;
  helperText?: string;
  options: SelectOption[];
  placeholder?: string;
  fullWidth?: boolean;
}

const Select: React.FC<SelectProps> = ({
  label,
  error,
  helperText,
  options,
  placeholder = 'Select an option',
  fullWidth = false,
  className = '',
  style,
  disabled,
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
    appearance: 'none',
    opacity: disabled ? 0.5 : 1,
    cursor: disabled ? 'not-allowed' : 'pointer',
  };

  const handleFocus = (e: React.FocusEvent<HTMLSelectElement>) => {
    if (!error && !disabled) {
      e.target.style.borderColor = colors.primary;
      e.target.style.boxShadow = `0 0 20px ${colors.primary}40`;
    }
    props.onFocus?.(e);
  };

  const handleBlur = (e: React.FocusEvent<HTMLSelectElement>) => {
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
        <select
          {...props}
          disabled={disabled}
          className={`w-full px-4 py-3 pr-10 rounded-xl ${className}`}
          style={{ ...baseStyles, ...style }}
          onFocus={handleFocus}
          onBlur={handleBlur}
        >
          <option value="" disabled>
            {placeholder}
          </option>
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
              style={{
                background: '#1A0E09',
                color: colors.textPrimary,
              }}
            >
              {option.label}
            </option>
          ))}
        </select>

        <div
          className="absolute right-4 top-1/2 transform -translate-y-1/2 pointer-events-none"
          style={{ color: colors.textSecondary }}
        >
          <ChevronDown size={20} />
        </div>
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

export default Select;
