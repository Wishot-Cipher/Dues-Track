import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Check, Search, X } from 'lucide-react';
import { colors } from '@/config/colors';

interface DropdownOption {
  value: string;
  label: string;
  icon?: React.ReactNode;
  description?: string;
  disabled?: boolean;
}

interface ProfessionalDropdownProps {
  options: DropdownOption[];
  value: string | string[];
  onChange: (value: string | string[]) => void;
  placeholder?: string;
  label?: string;
  multiple?: boolean;
  searchable?: boolean;
  disabled?: boolean;
  error?: string;
  helperText?: string;
  icon?: React.ReactNode;
  variant?: 'default' | 'filled' | 'outlined';
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  maxHeight?: number;
  clearable?: boolean;
}

export default function ProfessionalDropdown({
  options,
  value,
  onChange,
  placeholder = 'Select an option',
  label,
  multiple = false,
  searchable = false,
  disabled = false,
  error,
  helperText,
  icon,
  variant = 'default',
  size = 'md',
  className = '',
  maxHeight = 280,
  clearable = false,
}: ProfessionalDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState(-1);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchQuery('');
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Focus search input when opened
  useEffect(() => {
    if (isOpen && searchable && searchInputRef.current) {
      setTimeout(() => searchInputRef.current?.focus(), 100);
    }
  }, [isOpen, searchable]);

  const getFilteredOptions = useCallback(() => {
    if (!searchQuery) return options;
    return options.filter(opt =>
      opt.label.toLowerCase().includes(searchQuery.toLowerCase()) ||
      opt.description?.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, options]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const filteredOptions = getFilteredOptions();
      
      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          setHighlightedIndex(prev => 
            prev < filteredOptions.length - 1 ? prev + 1 : 0
          );
          break;
        case 'ArrowUp':
          e.preventDefault();
          setHighlightedIndex(prev => 
            prev > 0 ? prev - 1 : filteredOptions.length - 1
          );
          break;
        case 'Enter':
          e.preventDefault();
          if (highlightedIndex >= 0 && filteredOptions[highlightedIndex]) {
            const selectedValue = filteredOptions[highlightedIndex].value;
            if (multiple) {
              const currentValues = Array.isArray(value) ? value : [];
              if (currentValues.includes(selectedValue)) {
                onChange(currentValues.filter(v => v !== selectedValue));
              } else {
                onChange([...currentValues, selectedValue]);
              }
            } else {
              onChange(selectedValue);
              setIsOpen(false);
              setSearchQuery('');
            }
          }
          break;
        case 'Escape':
          setIsOpen(false);
          setSearchQuery('');
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, highlightedIndex, getFilteredOptions, multiple, value, onChange]);

  const handleSelect = (optionValue: string) => {
    if (multiple) {
      const currentValues = Array.isArray(value) ? value : [];
      if (currentValues.includes(optionValue)) {
        onChange(currentValues.filter(v => v !== optionValue));
      } else {
        onChange([...currentValues, optionValue]);
      }
    } else {
      onChange(optionValue);
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    onChange(multiple ? [] : '');
  };

  const getDisplayValue = (): string => {
    if (multiple) {
      const values = Array.isArray(value) ? value : [];
      if (values.length === 0) return '';
      if (values.length === 1) {
        const opt = options.find(o => o.value === values[0]);
        return opt?.label || values[0];
      }
      return `${values.length} selected`;
    }
    const opt = options.find(o => o.value === value);
    return opt?.label || '';
  };

  const isSelected = (optionValue: string): boolean => {
    if (multiple) {
      return Array.isArray(value) && value.includes(optionValue);
    }
    return value === optionValue;
  };

  const hasValue = multiple 
    ? Array.isArray(value) && value.length > 0 
    : Boolean(value);

  // Size styles
  const sizeStyles = {
    sm: { padding: 'py-1.5 px-3', text: 'text-sm', iconSize: 'w-4 h-4' },
    md: { padding: 'py-2.5 px-4', text: 'text-base', iconSize: 'w-5 h-5' },
    lg: { padding: 'py-3.5 px-5', text: 'text-lg', iconSize: 'w-6 h-6' },
  };

  // Variant styles
  const variantStyles = {
    default: {
      base: 'bg-white/5 border border-white/10 hover:border-white/20',
      focus: 'focus-within:border-orange-500 focus-within:ring-2 focus-within:ring-orange-500/20',
    },
    filled: {
      base: 'bg-white/10 border-transparent hover:bg-white/15',
      focus: 'focus-within:bg-white/5 focus-within:ring-2 focus-within:ring-orange-500/20',
    },
    outlined: {
      base: 'bg-transparent border-2 border-white/20 hover:border-white/30',
      focus: 'focus-within:border-orange-500',
    },
  };

  const currentSize = sizeStyles[size];
  const currentVariant = variantStyles[variant];
  const filteredOptions = getFilteredOptions();

  return (
    <div className={`relative ${className}`} ref={dropdownRef} style={{ zIndex: isOpen ? 9999 : 'auto' }}>
      {/* Label */}
      {label && (
        <label className="block text-sm font-medium text-white mb-2">
          {label}
        </label>
      )}

      {/* Trigger Button */}
      <motion.button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        whileTap={{ scale: disabled ? 1 : 0.99 }}
        className={`
          w-full flex items-center justify-between gap-3 rounded-xl
          transition-all duration-200 cursor-pointer
          ${currentSize.padding} ${currentSize.text}
          ${currentVariant.base} ${currentVariant.focus}
          ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
          ${error ? 'border-red-500 focus-within:border-red-500 focus-within:ring-red-500/20' : ''}
          ${isOpen ? 'ring-2 ring-orange-500/20 border-orange-500' : ''}
        `}
        style={{ 
          color: hasValue ? 'white' : colors.textSecondary,
        }}
      >
        <div className="flex items-center gap-3 flex-1 min-w-0">
          {icon && (
            <span className={`${currentSize.iconSize} shrink-0`} style={{ color: colors.primary }}>
              {icon}
            </span>
          )}
          <span className="truncate">
            {hasValue ? getDisplayValue() : placeholder}
          </span>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {clearable && hasValue && !disabled && (
            <motion.span
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              onClick={handleClear}
              className="p-1 rounded-full hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" style={{ color: colors.textSecondary }} />
            </motion.span>
          )}
          <motion.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
          >
            <ChevronDown className="w-5 h-5" style={{ color: colors.textSecondary }} />
          </motion.span>
        </div>
      </motion.button>

      {/* Dropdown Menu */}
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: -10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -10, scale: 0.95 }}
            transition={{ duration: 0.15 }}
            className="absolute w-full mt-2 rounded-xl overflow-hidden shadow-2xl"
            style={{
              zIndex: 9999,
              background: 'linear-gradient(180deg, #1A1A2E 0%, #16162A 100%)',
              border: '1px solid rgba(255, 107, 53, 0.2)',
              boxShadow: '0 20px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 107, 53, 0.1)',
            }}
          >
            {/* Search Input */}
            {searchable && (
              <div className="p-3 border-b border-white/10">
                <div className="relative">
                  <Search 
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" 
                    style={{ color: colors.textSecondary }}
                  />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value);
                      setHighlightedIndex(0);
                    }}
                    placeholder="Search..."
                    className="w-full pl-10 pr-4 py-2 text-sm rounded-lg bg-white/5 border border-white/10 
                             text-white placeholder-gray-500 focus:outline-none focus:border-orange-500/50"
                  />
                </div>
              </div>
            )}

            {/* Options List */}
            <div 
              className="overflow-y-auto custom-scrollbar"
              style={{ maxHeight }}
            >
              {filteredOptions.length === 0 ? (
                <div className="py-8 text-center" style={{ color: colors.textSecondary }}>
                  <p className="text-sm">No options found</p>
                </div>
              ) : (
                filteredOptions.map((option, index) => (
                  <motion.button
                    key={option.value}
                    type="button"
                    onClick={() => !option.disabled && handleSelect(option.value)}
                    disabled={option.disabled}
                    whileHover={{ backgroundColor: 'rgba(255, 255, 255, 0.05)' }}
                    className={`
                      w-full flex items-center gap-3 px-4 py-3 text-left transition-colors
                      ${option.disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
                      ${highlightedIndex === index ? 'bg-white/10' : ''}
                      ${isSelected(option.value) ? 'bg-orange-500/10' : ''}
                    `}
                    style={{
                      borderBottom: index < filteredOptions.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
                    }}
                  >
                    {/* Selection indicator */}
                    <div 
                      className={`
                        w-5 h-5 rounded-md flex items-center justify-center shrink-0
                        transition-all duration-200
                        ${isSelected(option.value) 
                          ? 'bg-orange-500 text-white' 
                          : 'border border-white/20'
                        }
                      `}
                    >
                      {isSelected(option.value) && <Check className="w-3.5 h-3.5" />}
                    </div>

                    {/* Option icon */}
                    {option.icon && (
                      <span className="w-5 h-5 shrink-0" style={{ color: colors.primary }}>
                        {option.icon}
                      </span>
                    )}

                    {/* Option content */}
                    <div className="flex-1 min-w-0">
                      <p className={`
                        truncate font-medium
                        ${isSelected(option.value) ? 'text-orange-400' : 'text-white'}
                      `}>
                        {option.label}
                      </p>
                      {option.description && (
                        <p className="text-xs truncate mt-0.5" style={{ color: colors.textSecondary }}>
                          {option.description}
                        </p>
                      )}
                    </div>
                  </motion.button>
                ))
              )}
            </div>

            {/* Multi-select footer */}
            {multiple && filteredOptions.length > 0 && (
              <div 
                className="px-4 py-3 border-t border-white/10 flex items-center justify-between"
                style={{ background: 'rgba(0,0,0,0.2)' }}
              >
                <span className="text-sm" style={{ color: colors.textSecondary }}>
                  {Array.isArray(value) ? value.length : 0} of {options.length} selected
                </span>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => onChange(options.filter(o => !o.disabled).map(o => o.value))}
                    className="text-xs px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 text-white transition-colors"
                  >
                    Select All
                  </button>
                  <button
                    type="button"
                    onClick={() => onChange([])}
                    className="text-xs px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 transition-colors"
                    style={{ color: colors.textSecondary }}
                  >
                    Clear
                  </button>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>

      {/* Helper/Error Text */}
      {(error || helperText) && (
        <p className={`mt-2 text-sm ${error ? 'text-red-400' : ''}`} 
           style={{ color: error ? undefined : colors.textSecondary }}>
          {error || helperText}
        </p>
      )}
    </div>
  );
}
