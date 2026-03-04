import { supabase } from '@/config/supabase'
import { getOrgScope } from '@/utils/orgScope'

export interface StudentFeatureSetting {
  id: string
  feature_key: string
  is_enabled: boolean
  display_name: string
  description: string | null
  updated_at: string
  updated_by: string | null
}

// Default feature definitions
const DEFAULT_FEATURES: Record<string, { display_name: string; description: string; default_enabled: boolean }> = {
  qr_payments: { display_name: 'QR Code Payments', description: 'Allow members to scan QR codes for payments', default_enabled: true },
  payment_history: { display_name: 'Payment History', description: 'Allow members to view their payment history', default_enabled: true },
  expense_transparency: { display_name: 'Expense Transparency', description: 'Allow members to view expense reports', default_enabled: true },
  notifications: { display_name: 'Notifications', description: 'Enable push and in-app notifications', default_enabled: true },
  pay_for_others: { display_name: 'Pay for Others', description: 'Allow members to pay on behalf of others', default_enabled: false },
  achievements: { display_name: 'Achievements', description: 'Enable gamification and achievement system', default_enabled: false },
  deadline_reminders: { display_name: 'Deadline Reminders', description: 'Send deadline reminder notifications', default_enabled: true },
  class_progress: { display_name: 'Class Progress', description: 'Show class-wide payment progress visualization', default_enabled: true },
  payment_summary: { display_name: 'Payment Summary', description: 'Show quick payment summary card on dashboard', default_enabled: true },
  progress_bar: { display_name: 'Progress Bar', description: 'Show payment progress bar on member dashboard', default_enabled: true },
}

class StudentFeatureService {
  private getOrgId(): string | null {
    const scope = getOrgScope()
    if (scope?.orgId) return scope.orgId

    // Fallback: try to get org_id from localStorage directly
    try {
      const orgId = localStorage.getItem('pvx_org_id')
      if (orgId) return orgId
    } catch { /* ignore */ }

    return null
  }

  /**
   * Read feature flags from organization_settings.custom_settings JSONB field.
   * The custom_settings column stores arbitrary JSON, and we namespace our
   * feature flags under the key "student_features".
   */
  private async getFeatureMap(): Promise<Record<string, boolean>> {
    const orgId = this.getOrgId()
    if (!orgId) {
      console.warn('studentFeatureService: No org ID available')
      return {}
    }

    const { data, error } = await supabase
      .from('organization_settings')
      .select('custom_settings')
      .eq('organization_id', orgId)
      .maybeSingle()

    if (error) {
      console.error('studentFeatureService: Error fetching settings:', error)
      return {}
    }

    // custom_settings is JSONB: { student_features: { qr_payments: true, ... }, ... }
    const customSettings = (data?.custom_settings as Record<string, unknown>) || {}
    return (customSettings.student_features as Record<string, boolean>) || {}
  }

  async getAllFeatureSettings(): Promise<StudentFeatureSetting[]> {
    const featureMap = await this.getFeatureMap()

    return Object.entries(DEFAULT_FEATURES).map(([key, def]) => ({
      id: key,
      feature_key: key,
      is_enabled: featureMap[key] ?? def.default_enabled,
      display_name: def.display_name,
      description: def.description,
      updated_at: new Date().toISOString(),
      updated_by: null,
    }))
  }

  async getEnabledFeatures(): Promise<string[]> {
    const featureMap = await this.getFeatureMap()

    return Object.entries(DEFAULT_FEATURES)
      .filter(([key, def]) => featureMap[key] ?? def.default_enabled)
      .map(([key]) => key)
  }

  async isFeatureEnabled(featureKey: string): Promise<boolean> {
    const featureMap = await this.getFeatureMap()
    const def = DEFAULT_FEATURES[featureKey]
    return featureMap[featureKey] ?? def?.default_enabled ?? false
  }

  async toggleFeature(featureKey: string, isEnabled: boolean, _memberId?: string): Promise<boolean> { // eslint-disable-line @typescript-eslint/no-unused-vars
    const orgId = this.getOrgId()
    if (!orgId) {
      console.error('studentFeatureService: No org scope — cannot toggle feature')
      return false
    }

    // Read current custom_settings
    const { data: settingsRow, error: fetchError } = await supabase
      .from('organization_settings')
      .select('custom_settings')
      .eq('organization_id', orgId)
      .maybeSingle()

    if (fetchError) {
      console.error(`Error fetching settings for toggle ${featureKey}:`, fetchError)
      return false
    }

    const customSettings = (settingsRow?.custom_settings as Record<string, unknown>) || {}
    const featureMap = (customSettings.student_features as Record<string, boolean>) || {}
    featureMap[featureKey] = isEnabled

    const updatedCustomSettings = { ...customSettings, student_features: featureMap }

    const { error } = await supabase
      .from('organization_settings')
      .update({
        custom_settings: updatedCustomSettings,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', orgId)

    if (error) {
      console.error(`Error toggling feature ${featureKey}:`, error)
      return false
    }

    return true
  }

  async updateBulkSettings(
    updates: Array<{ feature_key: string; is_enabled: boolean }>,
    _memberId?: string // eslint-disable-line @typescript-eslint/no-unused-vars
  ): Promise<boolean> {
    try {
      const orgId = this.getOrgId()
      if (!orgId) {
        console.error('studentFeatureService: No org scope — cannot update bulk settings')
        return false
      }

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
      const featureMap = (customSettings.student_features as Record<string, boolean>) || {}

      for (const update of updates) {
        featureMap[update.feature_key] = update.is_enabled
      }

      const updatedCustomSettings = { ...customSettings, student_features: featureMap }

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

export const studentFeatureService = new StudentFeatureService()
export default studentFeatureService
