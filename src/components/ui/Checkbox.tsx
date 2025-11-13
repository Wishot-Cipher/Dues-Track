import type React from 'react';
import type { CSSProperties, InputHTMLAttributes, ReactNode } from 'react';
import { Check } from 'lucide-react';
import { colors } from '@/config/colors';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: ReactNode;
  error?: string;
  helperText?: string;
}

const Checkbox: React.FC<CheckboxProps> = ({
  label,
  error,
  helperText,
  className = '',
  checked,
  disabled,
  ...props
}) => {
  const checkboxStyles: CSSProperties = {
    width: '20px',
    height: '20px',
    borderRadius: '6px',
    border: error 
      ? `2px solid ${colors.statusUnpaid}` 
      : `2px solid ${checked ? colors.primary : 'rgba(255, 255, 255, 0.2)'}`,
    background: checked 
      ? colors.primary 
      : 'rgba(255, 255, 255, 0.05)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    cursor: disabled ? 'not-allowed' : 'pointer',
    opacity: disabled ? 0.5 : 1,
    transition: 'all 0.3s ease',
  };

  return (
    <div>
      <label className={`flex items-start gap-3 cursor-pointer ${className}`}>
        <div className="relative shrink-0 mt-0.5">
          <input
            type="checkbox"
            checked={checked}
            disabled={disabled}
            {...props}
            className="sr-only"
          />
          <div style={checkboxStyles}>
            {checked && (
              <Check 
                size={14} 
                className="text-white" 
                strokeWidth={3}
              />
            )}
          </div>
        </div>

        {label && (
          <span 
            className="text-sm flex-1"
            style={{ 
              color: error ? colors.statusUnpaid : colors.textPrimary,
              opacity: disabled ? 0.5 : 1,
            }}
          >
            {label}
          </span>
        )}
      </label>

      {error && (
        <p className="text-xs mt-2 ml-8" style={{ color: colors.statusUnpaid }}>
          {error}
        </p>
      )}

      {!error && helperText && (
        <p className="text-xs mt-2 ml-8" style={{ color: colors.textSecondary }}>
          {helperText}
        </p>
      )}
    </div>
  );
};

export default Checkbox;
