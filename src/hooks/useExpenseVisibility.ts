import { useState, useEffect } from 'react'
import expenseVisibilityService from '@/services/expenseVisibilityService'

/**
 * Hook to check which expense details are visible to students
 * Returns object with visibility flags for each setting
 */
export function useExpenseVisibility() {
  const [visibleSettings, setVisibleSettings] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    loadVisibleSettings()

    // Listen for visibility changes from admin
    const handleVisibilityChange = () => {
      loadVisibleSettings()
    }

    window.addEventListener('expense-visibility-changed', handleVisibilityChange)

    return () => {
      window.removeEventListener('expense-visibility-changed', handleVisibilityChange)
    }
  }, [])

  async function loadVisibleSettings() {
    try {
      setLoading(true)
      const settings = await expenseVisibilityService.getVisibleSettings()
      setVisibleSettings(new Set(settings))
    } catch (error) {
      console.error('Failed to load visible expense settings:', error)
      // On error, show all settings by default
      setVisibleSettings(new Set([
        'show_total_collected',
        'show_total_spent',
        'show_remaining_balance',
        'show_expense_categories',
        'show_recent_expenses',
        'show_budget_usage'
      ]))
    } finally {
      setLoading(false)
    }
  }

  return {
    isVisible: (settingKey: string) => visibleSettings.has(settingKey),
    visibility: {
      showTotalCollected: visibleSettings.has('show_total_collected'),
      showTotalSpent: visibleSettings.has('show_total_spent'),
      showRemainingBalance: visibleSettings.has('show_remaining_balance'),
      showExpenseCategories: visibleSettings.has('show_expense_categories'),
      showRecentExpenses: visibleSettings.has('show_recent_expenses'),
      showExpenseDetails: visibleSettings.has('show_expense_details'),
      showBudgetUsage: visibleSettings.has('show_budget_usage'),
    },
    loading,
    refresh: loadVisibleSettings
  }
}
