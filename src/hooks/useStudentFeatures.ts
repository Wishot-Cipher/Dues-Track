import { useState, useEffect } from 'react'
import studentFeatureService from '@/services/studentFeatureService'

/**
 * Hook to check if student features are enabled
 * Returns object with feature keys as properties
 */
export function useStudentFeatures() {
  const [enabledFeatures, setEnabledFeatures] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadEnabledFeatures()
  }, [])

  async function loadEnabledFeatures() {
    try {
      setLoading(true)
      const features = await studentFeatureService.getEnabledFeatures()
      
      // If no features returned (table doesn't exist yet), enable all by default
      if (features.length === 0) {
        setEnabledFeatures(new Set([
          'expense_transparency',
          'achievements', 
          'deadline_reminders',
          'class_progress',
          'payment_summary'
        ]))
      } else {
        setEnabledFeatures(new Set(features))
      }
    } catch (error) {
      console.error('Failed to load enabled features:', error)
      // On error, enable all features by default
      setEnabledFeatures(new Set([
        'expense_transparency',
        'achievements',
        'deadline_reminders', 
        'class_progress',
        'payment_summary'
      ]))
    } finally {
      setLoading(false)
    }
  }

  return {
    isEnabled: (featureKey: string) => enabledFeatures.has(featureKey),
    features: {
      expenseTransparency: enabledFeatures.has('expense_transparency'),
      achievements: enabledFeatures.has('achievements'),
      deadlineReminders: enabledFeatures.has('deadline_reminders'),
      classProgress: enabledFeatures.has('class_progress'),
      paymentSummary: enabledFeatures.has('payment_summary'),
    },
    loading,
    refresh: loadEnabledFeatures
  }
}
