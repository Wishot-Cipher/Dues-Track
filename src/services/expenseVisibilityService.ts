import { supabase } from '@/config/supabase'
import { getOrgScope } from '@/utils/orgScope'

export interface ExpenseVisibilitySetting {
  id: string
  setting_key: string
  is_visible: boolean
  display_name: string
  description: string | null
  updated_at: string
  updated_by: string | null
}

// Default visibility definitions
const DEFAULT_VISIBILITY: Record<string, { display_name: string; description: string; default_visible: boolean }> = {
  show_total_collected: { display_name: 'Total Collected', description: 'Show total amount collected', default_visible: true },
  show_total_spent: { display_name: 'Total Spent', description: 'Show total amount spent on expenses', default_visible: true },
  show_remaining_balance: { display_name: 'Remaining Balance', description: 'Show remaining class balance', default_visible: true },
  show_expense_categories: { display_name: 'Expense Categories', description: 'Show expense category breakdown', default_visible: true },
  show_recent_expenses: { display_name: 'Recent Expenses', description: 'Show recent expense entries', default_visible: true },
  show_budget_usage: { display_name: 'Budget Usage', description: 'Show budget usage charts', default_visible: true },
}

class ExpenseVisibilityService {
  private getOrgId(): string | null {
    const scope = getOrgScope()
    if (scope?.orgId) return scope.orgId
    try {
      const orgId = localStorage.getItem('pvx_org_id')
      if (orgId) return orgId
    } catch { /* ignore */ }
    return null
  }

  /**
   * Read visibility flags from organization_settings.custom_settings JSONB.
   * Stored under the key "expense_visibility".
   */
  private async getVisibilityMap(): Promise<Record<string, boolean>> {
    const orgId = this.getOrgId()
    if (!orgId) return {}

    const { data, error } = await supabase
      .from('organization_settings')
      .select('custom_settings')
      .eq('organization_id', orgId)
      .maybeSingle()

    if (error) {
      console.error('expenseVisibilityService: Error fetching settings:', error)
      return {}
    }

    const customSettings = (data?.custom_settings as Record<string, unknown>) || {}
    return (customSettings.expense_visibility as Record<string, boolean>) || {}
  }

  async getAllSettings(): Promise<ExpenseVisibilitySetting[]> {
    const visMap = await this.getVisibilityMap()

    return Object.entries(DEFAULT_VISIBILITY).map(([key, def]) => ({
      id: key,
      setting_key: key,
      is_visible: visMap[key] ?? def.default_visible,
      display_name: def.display_name,
      description: def.description,
      updated_at: new Date().toISOString(),
      updated_by: null,
    }))
  }

  async getVisibleSettings(): Promise<string[]> {
    const visMap = await this.getVisibilityMap()

    return Object.entries(DEFAULT_VISIBILITY)
      .filter(([key, def]) => visMap[key] ?? def.default_visible)
      .map(([key]) => key)
  }

  async isVisible(settingKey: string): Promise<boolean> {
    const visMap = await this.getVisibilityMap()
    const def = DEFAULT_VISIBILITY[settingKey]
    return visMap[settingKey] ?? def?.default_visible ?? true
  }

  async toggleVisibility(settingKey: string, isVisible: boolean, _memberId?: string): Promise<boolean> { // eslint-disable-line @typescript-eslint/no-unused-vars
    const orgId = this.getOrgId()
    if (!orgId) {
      console.error('expenseVisibilityService: No org scope')
      return false
    }

    // Read current custom_settings
    const { data: settingsRow, error: fetchError } = await supabase
      .from('organization_settings')
      .select('custom_settings')
      .eq('organization_id', orgId)
      .maybeSingle()

    if (fetchError) {
      console.error(`Error fetching settings for toggle ${settingKey}:`, fetchError)
      return false
    }

    const customSettings = (settingsRow?.custom_settings as Record<string, unknown>) || {}
    const visMap = (customSettings.expense_visibility as Record<string, boolean>) || {}
    visMap[settingKey] = isVisible

    const updatedCustomSettings = { ...customSettings, expense_visibility: visMap }

    const { error } = await supabase
      .from('organization_settings')
      .update({
        custom_settings: updatedCustomSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId)

    if (error) {
      console.error(`Error toggling visibility for ${settingKey}:`, error)
      return false
    }

    return true
  }

  async updateBulkSettings(
    updates: Array<{ setting_key: string; is_visible: boolean }>,
    _memberId?: string // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<boolean> {
    try {
      const orgId = this.getOrgId()
      if (!orgId) return false

      // Read current custom_settings
      const { data: settingsRow, error: fetchError } = await supabase
        .from('organization_settings')
        .select('custom_settings')
        .eq('organization_id', orgId)
        .maybeSingle()

      if (fetchError) {
        console.error('Error fetching settings for bulk update:', fetchError)
        return false
      }

      const customSettings = (settingsRow?.custom_settings as Record<string, unknown>) || {}
      const visMap = (customSettings.expense_visibility as Record<string, boolean>) || {}

      for (const update of updates) {
        visMap[update.setting_key] = update.is_visible
      }

      const updatedCustomSettings = { ...customSettings, expense_visibility: visMap }

      const { error } = await supabase
        .from('organization_settings')
        .update({
          custom_settings: updatedCustomSettings,
          updated_at: new Date().toISOString(),
        })
        .eq('organization_id', orgId)

      if (error) {
        console.error('Error updating bulk settings:', error)
        return false
      }
      return true
    } catch (error) {
      console.error('Error updating bulk settings:', error)
      return false
    }
  }
}

export const expenseVisibilityService = new ExpenseVisibilityService()
export default expenseVisibilityService
