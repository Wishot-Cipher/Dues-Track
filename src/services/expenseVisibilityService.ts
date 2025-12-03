import { supabase } from '@/config/supabase'

export interface ExpenseVisibilitySetting {
  id: string
  setting_key: string
  is_visible: boolean
  display_name: string
  description: string | null
  updated_at: string
  updated_by: string | null
}

class ExpenseVisibilityService {
  /**
   * Get all expense visibility settings (admin view)
   */
  async getAllSettings(): Promise<ExpenseVisibilitySetting[]> {
    // console.log('expenseVisibilityService: Fetching all settings...')
    const { data, error } = await supabase
      .from('expense_visibility_settings')
      .select('*')
      .order('display_name', { ascending: true })

    if (error) {
      console.error('expenseVisibilityService: Error fetching settings:', error)
      return []
    }

    // console.log('expenseVisibilityService: Fetched settings:', data)
    return data || []
  }

  /**
   * Get only visible settings (student view)
   */
  async getVisibleSettings(): Promise<string[]> {
    const { data, error } = await supabase
      .from('expense_visibility_settings')
      .select('setting_key')
      .eq('is_visible', true)

    if (error) {
      console.error('Error fetching visible expense settings:', error)
      // Return all settings by default if table doesn't exist yet
      return [
        'show_total_collected',
        'show_total_spent', 
        'show_remaining_balance',
        'show_expense_categories',
        'show_recent_expenses',
        'show_budget_usage'
      ]
    }

    return data?.map(s => s.setting_key) || []
  }

  /**
   * Check if a specific setting is visible
   */
  async isVisible(settingKey: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('expense_visibility_settings')
      .select('is_visible')
      .eq('setting_key', settingKey)
      .single()

    if (error) {
      console.error(`Error checking visibility for ${settingKey}:`, error)
      return true // Default to visible if error
    }

    return data?.is_visible || false
  }

  /**
   * Toggle setting visibility (admin only)
   */
  async toggleVisibility(settingKey: string, isVisible: boolean, studentId: string): Promise<boolean> {
    // First, get the admin ID from the student ID
    const { data: adminData, error: adminError } = await supabase
      .from('admins')
      .select('id')
      .eq('student_id', studentId)
      .single()

    if (adminError || !adminData) {
      console.error(`Error finding admin for student ${studentId}:`, adminError)
      // Still try to update without updated_by (it's nullable)
      const { error } = await supabase
        .from('expense_visibility_settings')
        .update({ 
          is_visible: isVisible,
          updated_at: new Date().toISOString()
        })
        .eq('setting_key', settingKey)

      if (error) {
        console.error(`Error toggling visibility for ${settingKey}:`, error)
        return false
      }
      return true
    }

    // Update with admin ID
    const { error } = await supabase
      .from('expense_visibility_settings')
      .update({ 
        is_visible: isVisible,
        updated_by: adminData.id,
        updated_at: new Date().toISOString()
      })
      .eq('setting_key', settingKey)

    if (error) {
      console.error(`Error toggling visibility for ${settingKey}:`, error)
      return false
    }

    return true
  }

  /**
   * Update multiple settings in bulk (admin only)
   */
  async updateBulkSettings(
    updates: Array<{ setting_key: string; is_visible: boolean }>,
    studentId: string
  ): Promise<boolean> {
    try {
      for (const update of updates) {
        await this.toggleVisibility(update.setting_key, update.is_visible, studentId)
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
