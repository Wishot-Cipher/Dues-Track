/**
 * Date Range Filter Component
 * Professional date range selector for filtering financial data
 * 
 * Features:
 * - Preset ranges (Today, Week, Month, Year, All Time)
 * - Custom date range selection
 * - Visual feedback for selected range
 * 
 * @author Dev_Wishot (@wishotstudio)
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { colors } from '@/config/colors'
import { Calendar, ChevronDown, X } from 'lucide-react'

export interface DateRange {
  start: Date | null
  end: Date | null
  label: string
}

interface DateRangeFilterProps {
  value: DateRange
  onChange: (range: DateRange) => void
  className?: string
}

// Preset date ranges
const PRESETS: { label: string; getValue: () => DateRange }[] = [
  {
    label: 'All Time',
    getValue: () => ({ start: null, end: null, label: 'All Time' })
  },
  {
    label: 'Today',
    getValue: () => {
      const today = new Date()
      today.setHours(0, 0, 0, 0)
      const endOfDay = new Date(today)
      endOfDay.setHours(23, 59, 59, 999)
      return { start: today, end: endOfDay, label: 'Today' }
    }
  },
  {
    label: 'Last 7 Days',
    getValue: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 7)
      start.setHours(0, 0, 0, 0)
      return { start, end, label: 'Last 7 Days' }
    }
  },
  {
    label: 'Last 30 Days',
    getValue: () => {
      const end = new Date()
      const start = new Date()
      start.setDate(start.getDate() - 30)
      start.setHours(0, 0, 0, 0)
      return { start, end, label: 'Last 30 Days' }
    }
  },
  {
    label: 'This Month',
    getValue: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth(), 1)
      const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
      return { start, end, label: 'This Month' }
    }
  },
  {
    label: 'Last Month',
    getValue: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
      return { start, end, label: 'Last Month' }
    }
  },
  {
    label: 'This Year',
    getValue: () => {
      const now = new Date()
      const start = new Date(now.getFullYear(), 0, 1)
      const end = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
      return { start, end, label: 'This Year' }
    }
  }
]

export default function DateRangeFilter({ value, onChange, className = '' }: DateRangeFilterProps) {
  const [isOpen, setIsOpen] = useState(false)
  const [showCustom, setShowCustom] = useState(false)
  const [customStart, setCustomStart] = useState('')
  const [customEnd, setCustomEnd] = useState('')

  const handlePresetClick = (preset: typeof PRESETS[0]) => {
    onChange(preset.getValue())
    setIsOpen(false)
    setShowCustom(false)
  }

  const handleCustomApply = () => {
    if (customStart && customEnd) {
      const start = new Date(customStart)
      start.setHours(0, 0, 0, 0)
      const end = new Date(customEnd)
      end.setHours(23, 59, 59, 999)
      
      const formatDate = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      
      onChange({
        start,
        end,
        label: `${formatDate(start)} - ${formatDate(end)}`
      })
      setIsOpen(false)
      setShowCustom(false)
    }
  }

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation()
    onChange({ start: null, end: null, label: 'All Time' })
    setCustomStart('')
    setCustomEnd('')
  }

  return (
    <div className={`relative ${className}`}>
      {/* Trigger Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all"
        style={{
          background: value.label !== 'All Time' 
            ? `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)` 
            : 'rgba(255,255,255,0.05)',
          border: `1px solid ${value.label !== 'All Time' ? colors.primary : 'rgba(255,255,255,0.1)'}`,
          color: value.label !== 'All Time' ? colors.primary : colors.textSecondary
        }}
      >
        <Calendar className="w-4 h-4" />
        <span className="text-sm font-medium">{value.label}</span>
        {value.label !== 'All Time' && (
          <button 
            onClick={handleClear}
            className="ml-1 p-0.5 rounded hover:bg-white/10"
          >
            <X className="w-3 h-3" />
          </button>
        )}
        <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </motion.button>

      {/* Dropdown */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop - Semi-transparent on mobile for better focus */}
            <div 
              className="fixed inset-0 z-40 bg-black/20 sm:bg-transparent" 
              onClick={() => setIsOpen(false)} 
            />
            
            {/* Menu - Bottom sheet style on mobile, dropdown on desktop */}
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.95 }}
              className="fixed inset-x-4 bottom-4 sm:bottom-auto sm:inset-x-auto sm:absolute sm:right-0 sm:top-full sm:mt-2 sm:w-64 rounded-xl overflow-hidden shadow-2xl z-50 max-h-[60vh] sm:max-h-[70vh] overflow-y-auto"
              style={{
                background: 'linear-gradient(135deg, rgba(30, 20, 15, 0.98), rgba(20, 12, 8, 0.98))',
                border: '1px solid rgba(255, 255, 255, 0.15)',
                backdropFilter: 'blur(20px)',
              }}
            >
              <div className="p-2">
                <p className="px-3 py-1.5 text-xs font-medium" style={{ color: colors.textSecondary }}>
                  Quick Select
                </p>
                
                {/* Presets */}
                {PRESETS.map((preset) => (
                  <motion.button
                    key={preset.label}
                    whileHover={{ x: 4, background: 'rgba(255, 255, 255, 0.05)' }}
                    onClick={() => handlePresetClick(preset)}
                    className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                      value.label === preset.label ? 'font-semibold' : ''
                    }`}
                    style={{
                      color: value.label === preset.label ? colors.primary : 'white',
                      background: value.label === preset.label ? `${colors.primary}15` : 'transparent'
                    }}
                  >
                    {preset.label}
                  </motion.button>
                ))}

                {/* Divider */}
                <div className="my-2 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }} />

                {/* Custom Range */}
                <motion.button
                  whileHover={{ x: 4, background: 'rgba(255, 255, 255, 0.05)' }}
                  onClick={() => setShowCustom(!showCustom)}
                  className="w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between"
                  style={{ color: 'white' }}
                >
                  <span>Custom Range</span>
                  <ChevronDown className={`w-4 h-4 transition-transform ${showCustom ? 'rotate-180' : ''}`} />
                </motion.button>

                {/* Custom Date Inputs */}
                <AnimatePresence>
                  {showCustom && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      className="overflow-hidden"
                    >
                      <div className="p-3 space-y-3">
                        <div>
                          <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>
                            Start Date
                          </label>
                          <input
                            type="date"
                            value={customStart}
                            onChange={(e) => setCustomStart(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm text-white"
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)'
                            }}
                          />
                        </div>
                        <div>
                          <label className="block text-xs mb-1" style={{ color: colors.textSecondary }}>
                            End Date
                          </label>
                          <input
                            type="date"
                            value={customEnd}
                            onChange={(e) => setCustomEnd(e.target.value)}
                            className="w-full px-3 py-2 rounded-lg text-sm text-white"
                            style={{
                              background: 'rgba(255,255,255,0.05)',
                              border: '1px solid rgba(255,255,255,0.1)'
                            }}
                          />
                        </div>
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleCustomApply}
                          disabled={!customStart || !customEnd}
                          className="w-full py-2 rounded-lg text-sm font-medium disabled:opacity-50"
                          style={{
                            background: `linear-gradient(135deg, ${colors.primary}, ${colors.primary}cc)`,
                            color: 'white'
                          }}
                        >
                          Apply Range
                        </motion.button>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  )
}
