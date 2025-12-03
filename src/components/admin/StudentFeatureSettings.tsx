import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Settings, Eye, EyeOff, Save, RefreshCw } from 'lucide-react'
import { colors, gradients } from '@/config/colors'
import { useAuth } from '@/hooks/useAuth'
import studentFeatureService, { type StudentFeatureSetting } from '@/services/studentFeatureService'

export default function StudentFeatureSettings() {
  const { user } = useAuth()
  const [settings, setSettings] = useState<StudentFeatureSetting[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null)

  useEffect(() => {
    loadSettings()
  }, [])

  async function loadSettings() {
    try {
      setLoading(true)
      console.log('Loading student feature settings...')
      const data = await studentFeatureService.getAllFeatureSettings()
      console.log('Loaded student feature settings:', data)
      setSettings(data)
    } catch (error) {
      console.error('Failed to load settings:', error)
      setMessage({ type: 'error', text: 'Failed to load settings' })
    } finally {
      setLoading(false)
    }
  }

  async function handleToggle(featureKey: string, currentValue: boolean) {
    if (!user?.id) return

    // Optimistically update UI
    setSettings(prev => prev.map(s => 
      s.feature_key === featureKey ? { ...s, is_enabled: !currentValue } : s
    ))

    const success = await studentFeatureService.toggleFeature(featureKey, !currentValue, user.id)
    
    if (!success) {
      // Revert on failure
      setSettings(prev => prev.map(s => 
        s.feature_key === featureKey ? { ...s, is_enabled: currentValue } : s
      ))
      setMessage({ type: 'error', text: 'Failed to update setting' })
    } else {
      setMessage({ type: 'success', text: 'Setting updated successfully' })
    }

    // Clear message after 3 seconds
    setTimeout(() => setMessage(null), 3000)
  }

  async function handleSaveAll() {
    if (!user?.id) return

    try {
      setSaving(true)
      const updates = settings.map(s => ({
        feature_key: s.feature_key,
        is_enabled: s.is_enabled
      }))
      
      const success = await studentFeatureService.updateBulkSettings(updates, user.id)
      
      if (success) {
        setMessage({ type: 'success', text: 'All settings saved successfully' })
      } else {
        setMessage({ type: 'error', text: 'Failed to save settings' })
      }
    } catch (error) {
      console.error('Failed to save settings:', error)
      setMessage({ type: 'error', text: 'Failed to save settings' })
    } finally {
      setSaving(false)
      setTimeout(() => setMessage(null), 3000)
    }
  }

  if (loading) {
    return (
      <div className="p-6 rounded-xl border" style={{ background: 'rgba(255,255,255,0.03)', borderColor: colors.borderLight }}>
        <div className="text-center py-8">
          <div className="w-8 h-8 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-3" 
            style={{ borderColor: `${colors.primary}40`, borderTopColor: colors.primary }} 
          />
          <p className="text-sm" style={{ color: colors.textSecondary }}>Loading settings...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="p-6 rounded-xl border" style={{ 
      background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
      borderColor: colors.borderLight 
    }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: gradients.primary }}>
            <Settings className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-xl font-bold text-white">Student Feature Visibility</h3>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Control which features students can see on their dashboard
            </p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={loadSettings}
            className="p-2 rounded-lg transition-colors"
            style={{ background: 'rgba(255,255,255,0.1)' }}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4 text-white" />
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleSaveAll}
            disabled={saving}
            className="px-4 py-2 rounded-lg font-medium text-sm flex items-center gap-2 disabled:opacity-50"
            style={{ background: gradients.primary, color: 'white' }}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save All'}
          </motion.button>
        </div>
      </div>

      {/* Success/Error Message */}
      {message && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          className="mb-4 p-3 rounded-lg"
          style={{
            background: message.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
            border: `1px solid ${message.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
            color: message.type === 'success' ? '#22c55e' : '#ef4444'
          }}
        >
          <p className="text-sm font-medium">{message.text}</p>
        </motion.div>
      )}

      {/* Settings List */}
      <div className="space-y-3">
        {settings.map((setting, index) => (
          <motion.div
            key={setting.feature_key}
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: index * 0.05 }}
            className="p-4 rounded-xl border transition-all"
            style={{
              background: setting.is_enabled ? 'rgba(34, 197, 94, 0.05)' : 'rgba(255,255,255,0.03)',
              borderColor: setting.is_enabled ? 'rgba(34, 197, 94, 0.2)' : colors.borderLight
            }}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h4 className="font-semibold text-white">{setting.display_name}</h4>
                  <div
                    className="px-2 py-0.5 rounded-full text-xs font-medium"
                    style={{
                      background: setting.is_enabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 68, 68, 0.2)',
                      color: setting.is_enabled ? '#22c55e' : '#ef4444'
                    }}
                  >
                    {setting.is_enabled ? 'Visible' : 'Hidden'}
                  </div>
                </div>
                {setting.description && (
                  <p className="text-sm" style={{ color: colors.textSecondary }}>
                    {setting.description}
                  </p>
                )}
              </div>

              {/* Toggle Button */}
              <motion.button
                whileHover={{ scale: 1.05 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => handleToggle(setting.feature_key, setting.is_enabled)}
                className="p-2.5 rounded-lg transition-all"
                style={{
                  background: setting.is_enabled ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 68, 68, 0.2)',
                  border: `2px solid ${setting.is_enabled ? '#22c55e' : '#ef4444'}`
                }}
                title={setting.is_enabled ? 'Hide from students' : 'Show to students'}
              >
                {setting.is_enabled ? (
                  <Eye className="w-5 h-5 text-green-400" />
                ) : (
                  <EyeOff className="w-5 h-5 text-red-400" />
                )}
              </motion.button>
            </div>
          </motion.div>
        ))}
      </div>

      {/* Info Box */}
      <div className="mt-6 p-4 rounded-lg" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
        <p className="text-sm text-blue-400 font-medium mb-2">ℹ️ How it works:</p>
        <ul className="text-xs space-y-1" style={{ color: colors.textSecondary }}>
          <li>• <strong>Visible</strong> features appear on the student dashboard</li>
          <li>• <strong>Hidden</strong> features are completely removed from student view</li>
          <li>• Changes take effect immediately for all students</li>
          <li>• Use this to gradually roll out features or remove them during issues</li>
        </ul>
      </div>
    </div>
  )
}
