import { supabase } from '@/config/supabase'

export interface StudentFeatureSetting {
  id: string
  feature_key: string
  is_enabled: boolean
  display_name: string
  description: string | null
  updated_at: string
  updated_by: string | null
}

class StudentFeatureService {
  /**
   * Get all feature settings (admin view)
   */
  async getAllFeatureSettings(): Promise<StudentFeatureSetting[]> {
    // console.log('studentFeatureService: Fetching all settings...')
    const { data, error } = await supabase
      .from('student_feature_settings')
      .select('*')
      .order('display_name', { ascending: true })

    if (error) {
      console.error('studentFeatureService: Error fetching settings:', error)
      return []
    }

    // console.log('studentFeatureService: Fetched settings:', data)
    return data || []
  }

  /**
   * Get only enabled features (student view)
   */
  async getEnabledFeatures(): Promise<string[]> {
    const { data, error } = await supabase
      .from('student_feature_settings')
      .select('feature_key')
      .eq('is_enabled', true)

    if (error) {
      console.error('Error fetching enabled features:', error)
      return []
    }

    return data?.map(f => f.feature_key) || []
  }

  /**
   * Check if a specific feature is enabled
   */
  async isFeatureEnabled(featureKey: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('student_feature_settings')
      .select('is_enabled')
      .eq('feature_key', featureKey)
      .single()

    if (error) {
      console.error(`Error checking feature ${featureKey}:`, error)
      return false // Default to disabled if error
    }

    return data?.is_enabled || false
  }

  /**
   * Toggle feature on/off (admin only)
   */
  async toggleFeature(featureKey: string, isEnabled: boolean, studentId: string): Promise<boolean> {
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
        .from('student_feature_settings')
        .update({ 
          is_enabled: isEnabled,
          updated_at: new Date().toISOString()
        })
        .eq('feature_key', featureKey)

      if (error) {
        console.error(`Error toggling feature ${featureKey}:`, error)
        return false
      }
      return true
    }

    // Update with admin ID
    const { error } = await supabase
      .from('student_feature_settings')
      .update({ 
        is_enabled: isEnabled,
        updated_by: adminData.id,
        updated_at: new Date().toISOString()
      })
      .eq('feature_key', featureKey)

    if (error) {
      console.error(`Error toggling feature ${featureKey}:`, error)
      return false
    }

    return true
  }

  /**
   * Update feature settings in bulk (admin only)
   */
  async updateBulkSettings(
    updates: Array<{ feature_key: string; is_enabled: boolean }>,
    studentId: string
  ): Promise<boolean> {
    try {
      for (const update of updates) {
        await this.toggleFeature(update.feature_key, update.is_enabled, studentId)
      }
      return true
    } catch (error) {
      console.error('Error updating bulk settings:', error)
      return false
    }
  }
}

export const studentFeatureService = new StudentFeatureService()
export default studentFeatureService
