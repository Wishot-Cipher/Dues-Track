/**
 * Audit Service
 * 
 * Logs sensitive actions for compliance and security monitoring.
 * All audit entries are scoped to the organization.
 * 
 * NOTE: When integrating, update import to: import { supabase } from '@/lib/supabase';
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = null; // TODO: Replace with actual import when integrating
import type { AuditLogEntry, AuditAction } from '../types';

// ============================================================
// Types
// ============================================================

export interface CreateAuditLogInput {
  organization_id: string;
  user_id?: string;
  action: AuditAction;
  entity_type?: string;
  entity_id?: string;
  old_values?: Record<string, unknown>;
  new_values?: Record<string, unknown>;
  ip_address?: string;
  user_agent?: string;
}

export interface AuditLogFilter {
  organization_id: string;
  user_id?: string;
  action?: AuditAction | AuditAction[];
  entity_type?: string;
  entity_id?: string;
  from_date?: string;
  to_date?: string;
  limit?: number;
  offset?: number;
}

// ============================================================
// Audit Service
// ============================================================

export const auditService = {
  /**
   * Log an action
   */
  async log(input: CreateAuditLogInput): Promise<void> {
    try {
      const { error } = await supabase
        .from('audit_logs')
        .insert({
          organization_id: input.organization_id,
          user_id: input.user_id,
          action: input.action,
          entity_type: input.entity_type,
          entity_id: input.entity_id,
          old_values: input.old_values,
          new_values: input.new_values,
          ip_address: input.ip_address,
          user_agent: input.user_agent || (typeof navigator !== 'undefined' ? navigator.userAgent : undefined),
        });

      if (error) {
        // Don't throw - audit logging should never break the main flow
        console.error('[auditService.log] Error:', error);
      }
    } catch (err) {
      console.error('[auditService.log] Exception:', err);
    }
  },

  /**
   * Log a login attempt
   */
  async logLogin(orgId: string, userId: string, success: boolean, ipAddress?: string): Promise<void> {
    await this.log({
      organization_id: orgId,
      user_id: userId,
      action: success ? 'login' : 'login_failed',
      ip_address: ipAddress,
    });
  },

  /**
   * Log a logout
   */
  async logLogout(orgId: string, userId: string): Promise<void> {
    await this.log({
      organization_id: orgId,
      user_id: userId,
      action: 'logout',
    });
  },

  /**
   * Log a password change
   */
  async logPasswordChange(orgId: string, userId: string): Promise<void> {
    await this.log({
      organization_id: orgId,
      user_id: userId,
      action: 'password_changed',
      entity_type: 'student',
      entity_id: userId,
    });
  },

  /**
   * Log a student creation
   */
  async logStudentCreated(orgId: string, adminId: string, studentId: string, studentData: Record<string, unknown>): Promise<void> {
    await this.log({
      organization_id: orgId,
      user_id: adminId,
      action: 'student_created',
      entity_type: 'student',
      entity_id: studentId,
      new_values: studentData,
    });
  },

  /**
   * Log a student update
   */
  async logStudentUpdated(
    orgId: string, 
    adminId: string, 
    studentId: string, 
    oldData: Record<string, unknown>, 
    newData: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      organization_id: orgId,
      user_id: adminId,
      action: 'student_updated',
      entity_type: 'student',
      entity_id: studentId,
      old_values: oldData,
      new_values: newData,
    });
  },

  /**
   * Log a payment approval
   */
  async logPaymentApproved(orgId: string, adminId: string, paymentId: string, paymentData: Record<string, unknown>): Promise<void> {
    await this.log({
      organization_id: orgId,
      user_id: adminId,
      action: 'payment_approved',
      entity_type: 'payment',
      entity_id: paymentId,
      new_values: paymentData,
    });
  },

  /**
   * Log a payment rejection
   */
  async logPaymentRejected(orgId: string, adminId: string, paymentId: string, reason: string): Promise<void> {
    await this.log({
      organization_id: orgId,
      user_id: adminId,
      action: 'payment_rejected',
      entity_type: 'payment',
      entity_id: paymentId,
      new_values: { rejection_reason: reason },
    });
  },

  /**
   * Log an expense approval
   */
  async logExpenseApproved(orgId: string, adminId: string, expenseId: string, expenseData: Record<string, unknown>): Promise<void> {
    await this.log({
      organization_id: orgId,
      user_id: adminId,
      action: 'expense_approved',
      entity_type: 'expense',
      entity_id: expenseId,
      new_values: expenseData,
    });
  },

  /**
   * Log admin assignment
   */
  async logAdminAssigned(orgId: string, assignerId: string, adminId: string, role: string): Promise<void> {
    await this.log({
      organization_id: orgId,
      user_id: assignerId,
      action: 'admin_assigned',
      entity_type: 'admin',
      entity_id: adminId,
      new_values: { role },
    });
  },

  /**
   * Log settings update
   */
  async logSettingsUpdated(
    orgId: string, 
    adminId: string, 
    oldSettings: Record<string, unknown>, 
    newSettings: Record<string, unknown>
  ): Promise<void> {
    await this.log({
      organization_id: orgId,
      user_id: adminId,
      action: 'settings_updated',
      entity_type: 'organization_settings',
      entity_id: orgId,
      old_values: oldSettings,
      new_values: newSettings,
    });
  },

  /**
   * Get audit logs with filters
   */
  async getLogs(filter: AuditLogFilter): Promise<{ logs: AuditLogEntry[]; total: number }> {
    let query = supabase
      .from('audit_logs')
      .select('*', { count: 'exact' })
      .eq('organization_id', filter.organization_id)
      .order('created_at', { ascending: false });

    if (filter.user_id) {
      query = query.eq('user_id', filter.user_id);
    }

    if (filter.action) {
      if (Array.isArray(filter.action)) {
        query = query.in('action', filter.action);
      } else {
        query = query.eq('action', filter.action);
      }
    }

    if (filter.entity_type) {
      query = query.eq('entity_type', filter.entity_type);
    }

    if (filter.entity_id) {
      query = query.eq('entity_id', filter.entity_id);
    }

    if (filter.from_date) {
      query = query.gte('created_at', filter.from_date);
    }

    if (filter.to_date) {
      query = query.lte('created_at', filter.to_date);
    }

    if (filter.limit) {
      query = query.limit(filter.limit);
    }

    if (filter.offset) {
      query = query.range(filter.offset, filter.offset + (filter.limit || 50) - 1);
    }

    const { data, error, count } = await query;

    if (error) {
      console.error('[auditService.getLogs] Error:', error);
      throw new Error('Failed to fetch audit logs');
    }

    return {
      logs: data || [],
      total: count || 0,
    };
  },

  /**
   * Get recent activity for a user
   */
  async getUserActivity(orgId: string, userId: string, limit = 20): Promise<AuditLogEntry[]> {
    const { logs } = await this.getLogs({
      organization_id: orgId,
      user_id: userId,
      limit,
    });
    return logs;
  },

  /**
   * Get security events (login failures, etc.)
   */
  async getSecurityEvents(orgId: string, limit = 50): Promise<AuditLogEntry[]> {
    const { logs } = await this.getLogs({
      organization_id: orgId,
      action: ['login', 'login_failed', 'password_changed', 'admin_assigned', 'admin_revoked'],
      limit,
    });
    return logs;
  },
};

export default auditService;
