import { CalendarDays, Clock3 } from 'lucide-react';

type ProfessionalDateTimePickerProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  helperText?: string;
  placeholder?: string;
  includeTime?: boolean;
  min?: string;
  max?: string;
  required?: boolean;
  disabled?: boolean;
  fullWidth?: boolean;
  className?: string;
};

export default function ProfessionalDateTimePicker({
  label,
  value,
  onChange,
  helperText,
  placeholder,
  includeTime = false,
  min,
  max,
  required,
  disabled,
  fullWidth = true,
  className = '',
}: ProfessionalDateTimePickerProps) {
  const icon = includeTime ? <Clock3 className="w-4 h-4" /> : <CalendarDays className="w-4 h-4" />;
  const inputType = includeTime ? 'datetime-local' : 'date';

  return (
    <label className={`block ${fullWidth ? 'w-full' : ''} ${className}`.trim()}>
      <span className="mb-1.5 flex items-center gap-1.5 text-xs font-medium uppercase tracking-wider text-white/60">
        {icon}
        {label}
        {required && <span className="text-orange-400">*</span>}
      </span>
      <div className="relative rounded-2xl overflow-hidden border transition-all focus-within:border-orange-500/50 focus-within:ring-2 focus-within:ring-orange-500/20" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,255,255,0.1)' }}>
        <div className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-white/35">
          {icon}
        </div>
        <input
          type={inputType}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          min={min}
          max={max}
          disabled={disabled}
          className="w-full bg-transparent px-10 py-3 text-sm text-white outline-none placeholder:text-white/20 disabled:cursor-not-allowed disabled:opacity-50"
        />
      </div>
      {helperText && (
        <p className="mt-1.5 text-[11px] leading-5 text-white/35">
          {helperText}
        </p>
      )}
    </label>
  );
}