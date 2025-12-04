import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Save, Shield, DollarSign } from 'lucide-react'
import { colors, gradients } from '@/config/colors'
import { useAuth } from '@/hooks/useAuth'
import expenseVisibilityService, { type ExpenseVisibilitySetting } from '@/services/expenseVisibilityService'
import GlassCard from '@/components/ui/GlassCard'

export default function ExpenseVisibilitySettings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<ExpenseVisibilitySetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      setLoading(true)
      const data = await expenseVisibilityService.getAllSettings()
      setSettings(data)
    } catch (error) {
      console.error('Failed to load expense visibility settings:', error)
      setMessage({ type: 'error', text: 'Failed to load settings. Check console for details.' })
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(settingKey: string) {
    const setting = settings.find(s => s.setting_key === settingKey)
    if (!setting || !user?.id) return

    // Update local state immediately for better UX
    const newVisibility = !setting.is_visible
    setSettings(prev => prev.map(s => 
      s.setting_key === settingKey 
        ? { ...s, is_visible: newVisibility }
        : s
    ))

    // Save immediately to database
    try {
      const success = await expenseVisibilityService.toggleVisibility(
        settingKey, 
        newVisibility, 
        user.id
      )

      if (success) {
        // Broadcast change event for student dashboards to refresh
        window.dispatchEvent(new CustomEvent('expense-visibility-changed'))
        setMessage({ 
          type: 'success', 
          text: `${setting.display_name} ${newVisibility ? 'shown' : 'hidden'} successfully!` 
        })
        setTimeout(() => setMessage(null), 2000)
      } else {
        // Revert on failure
        setSettings(prev => prev.map(s => 
          s.setting_key === settingKey 
            ? { ...s, is_visible: !newVisibility }
            : s
        ))
        setMessage({ type: 'error', text: 'Failed to update setting. Please try again.' })
      }
    } catch (error) {
      console.error('Error toggling visibility:', error)
      // Revert on error
      setSettings(prev => prev.map(s => 
        s.setting_key === settingKey 
          ? { ...s, is_visible: !newVisibility }
          : s
      ))
      setMessage({ type: 'error', text: 'An error occurred while updating.' })
    }
  }

  async function handleSave() {
    if (!user?.id) return

    try {
      setSaving(true)
      setMessage(null)

      const updates = settings.map(s => ({
        setting_key: s.setting_key,
        is_visible: s.is_visible
      }))

      const success = await expenseVisibilityService.updateBulkSettings(updates, user.id)

      if (success) {
        // Broadcast change event for student dashboards to refresh
        window.dispatchEvent(new CustomEvent('expense-visibility-changed'))
        setMessage({ type: 'success', text: 'All expense visibility settings saved successfully!' })
        setTimeout(() => setMessage(null), 3000)
      } else {
        setMessage({ type: 'error', text: 'Failed to save settings. Please try again.' })
      }
    } catch (error) {
      console.error('Error saving settings:', error)
      setMessage({ type: 'error', text: 'An error occurred while saving settings.' })
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return (
      <GlassCard className="p-6">
        <div className="text-center py-8">
          <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3" 
            style={{ borderColor: `${colors.primary}40`, borderTopColor: colors.primary }} 
          />
          <p className="text-sm" style={{ color: colors.textSecondary }}>Loading settings...</p>
        </div>
      </GlassCard>
    )
  }

  const visibleCount = settings.filter(s => s.is_visible).length

  return (
    <GlassCard className="p-4 sm:p-6">
      {/* Header */}
      <div className="flex items-start justify-between mb-6 gap-4">
        <div className="flex-1 min-w-0">
          <h3 className="text-lg sm:text-xl font-bold text-white flex items-center gap-2">
            <DollarSign className="w-5 h-5 sm:w-6 sm:h-6 shrink-0" style={{ color: colors.accentMint }} />
            <span className="truncate">Expense Visibility Control</span>
          </h3>
          <p className="text-xs sm:text-sm mt-1" style={{ color: colors.textSecondary }}>
            Control what financial details students can see to prevent unnecessary questioning
          </p>
        </div>
        <div className="shrink-0 text-right">
          <div className="text-2xl font-bold" style={{ 
            background: gradients.primary,
            WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
            backgroundClip: 'text'
          }}>
            {visibleCount}/{settings.length}
          </div>
          <p className="text-xs" style={{ color: colors.textSecondary }}>visible</p>
        </div>
      </div>

      {/* Info Alert */}
      <div className="mb-6 p-3 rounded-lg" style={{ 
        background: 'rgba(59, 130, 246, 0.1)', 
        border: '1px solid rgba(59, 130, 246, 0.2)' 
      }}>
        <div className="flex items-start gap-2">
          <Shield className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
          <p className="text-xs text-blue-400">
            <strong>Professional Tip:</strong> Hide sensitive financial details to maintain transparency while preventing over-questioning. 
            Students will only see what you enable.
          </p>
        </div>
      </div>

      {/* Settings List */}
      <div className="space-y-3 mb-6">
        {settings.map((setting, index) => (
          <motion.div
            key={setting.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            className="p-4 rounded-lg border transition-all"
            style={{
              background: setting.is_visible 
                ? 'rgba(34, 197, 94, 0.05)' 
                : 'rgba(156, 163, 175, 0.05)',
              borderColor: setting.is_visible
                ? 'rgba(34, 197, 94, 0.2)'
                : 'rgba(156, 163, 175, 0.2)'
            }}
          >
            <div className="flex items-start gap-3">
              {/* Icon */}
              <div 
                className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
                style={{ 
                  background: setting.is_visible ? gradients.primary : 'rgba(156, 163, 175, 0.2)'
                }}
              >
                {setting.is_visible ? (
                  <Eye className="w-5 h-5 text-white" />
                ) : (
                  <EyeOff className="w-5 h-5 text-gray-400" />
                )}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <h4 className="text-sm font-semibold text-white mb-1">
                  {setting.display_name}
                </h4>
                <p className="text-xs" style={{ color: colors.textSecondary }}>
                  {setting.description}
                </p>
              </div>

              {/* Toggle Switch */}
              <button
                onClick={() => handleToggle(setting.setting_key)}
                className="shrink-0 relative w-12 h-6 rounded-full transition-all"
                style={{
                  background: setting.is_visible ? colors.primary : 'rgba(156, 163, 175, 0.3)'
                }}
              >
                <motion.div
                  className="absolute top-1 w-4 h-4 bg-white rounded-full"
                  animate={{ left: setting.is_visible ? '28px' : '4px' }}
                  transition={{ type: 'spring', stiffness: 500, damping: 30 }}
                />
              </button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Save Button */}
      <motion.button
        whileHover={{ scale: 1.02 }}
        whileTap={{ scale: 0.98 }}
        onClick={handleSave}
        disabled={saving}
        className="w-full py-3 px-4 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        style={{ background: gradients.primary }}
      >
        {saving ? (
          <>
            <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            <span>Saving Changes...</span>
          </>
        ) : (
          <>
            <Save className="w-5 h-5" />
            <span>Save Visibility Settings</span>
          </>
        )}
      </motion.button>

      {/* Success/Error Message */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mt-4 p-3 rounded-lg"
          style={{
            background: message.type === 'success' 
              ? 'rgba(34, 197, 94, 0.1)' 
              : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${message.type === 'success' 
              ? 'rgba(34, 197, 94, 0.3)' 
              : 'rgba(239, 68, 68, 0.3)'}`
          }}
        >
          <p 
            className="text-sm font-medium"
            style={{ color: message.type === 'success' ? '#22C55E' : '#EF4444' }}
          >
            {message.text}
          </p>
        </motion.div>
      )}
    </GlassCard>
  )
}
