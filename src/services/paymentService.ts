/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { supabase } from '@/config/supabase';
import type { Payment, PaymentType, PaymentStats } from '@/types';
import notificationService from '@/services/notificationService';
import { getOrgScope } from '@/utils/orgScope';
import { organizationService } from '@/services/organizationService';

/**
 * Payment Service
 * Handles all payment-related data fetching and mutations.
 *
 * MULTI-TENANT: When an org session is active (pvx_auth), queries are
 * scoped to the current organization and group via organization_id + group_id filters.
 */

class PaymentService {
  /**
   * Get the current member's level info.
   * In multi-tenant mode queries organization_members; in legacy mode queries students.
   */
  private async getMemberLevel(memberId: string): Promise<{ level: string; department: string; group_id?: string } | null> {
    const scope = getOrgScope();
    if (scope) {
      const { data } = await supabase
        .from('organization_members')
        .select('level, section, group_id')
        .eq('id', memberId)
        .eq('organization_id', scope.orgId)
        .single();
      if (!data) return null;
      return { level: data.level || '', department: data.section || '', group_id: data.group_id };
    }
    const { data } = await supabase
      .from('organization_members')
      .select('level, section, group_id')
      .eq('id', memberId)
      .single();
    return data ? { level: data.level || '', department: data.section || '', group_id: data.group_id } : null;
  }

  /**
   * Every active group the member belongs to (class + association + club …).
   * Multi-group dues span all of these. Falls back to the session's primary
   * group when the group_memberships RPC isn't available yet.
   */
  private async getMemberGroupIds(memberId: string): Promise<string[]> {
    const scope = getOrgScope();
    // Preferred: every group the member belongs to PLUS all ancestor groups, so
    // a due placed on a parent unit (department/faculty) still matches a member
    // in a class below it. Falls back to direct memberships, then primary group.
    try {
      const { data } = await supabase.rpc('get_my_billing_group_ids', { p_member_id: memberId });
      const ids = data && (data as { ok?: boolean }).ok ? (data as { group_ids?: string[] }).group_ids : null;
      if (Array.isArray(ids) && ids.length) return ids.filter(Boolean);
    } catch {
      // RPC not deployed yet — fall through.
    }
    try {
      const { data } = await supabase.rpc('get_my_groups', { p_member_id: memberId });
      const groups = data && (data as { ok?: boolean }).ok ? (data as { groups?: Array<{ group_id: string }> }).groups : null;
      if (Array.isArray(groups) && groups.length) {
        return groups.map((g) => g.group_id).filter(Boolean);
      }
    } catch {
      // RPC not deployed yet — fall through to the primary group.
    }
    return scope?.groupId ? [scope.groupId] : [];
  }
  /**
   * Get payment statistics for a student/member
   */
  async getStudentPaymentStats(studentId: string): Promise<PaymentStats> {
    try {
      const member = await this.getMemberLevel(studentId);

      if (!member) {
        return {
          totalPaid: 0,
          totalDue: 0,
          paymentsMade: 0,
          pendingPayments: 0,
        };
      }

      // Canonicalize member level for consistent matching
      const memberLevel = organizationService.canonicalizeLevel(member.level || '');
      const scope = getOrgScope();
      let orgType: string | null = null;
      if (scope) {
        const org = await organizationService.getById(scope.orgId);
        orgType = org?.organization_type || null;
      }
      
      // Fetch all active payment types for scope and filter client-side to allow
      // payment types with no `target_levels` to apply to all members in the org.
      let ptQuery = supabase
        .from('payment_types')
        .select('id, amount, deadline, late_fee_per_day, target_levels, group_id')
        .eq('is_active', true);
      if (scope) {
        ptQuery = ptQuery.eq('organization_id', scope.orgId);
        ptQuery = ptQuery.eq('group_id', scope.groupId);
      }

      const { data: allPaymentTypes, error: typesError } = await ptQuery;
      if (typesError) throw typesError;

      const activePaymentTypes = (allPaymentTypes || []).filter((pt: any) => {
        const targets: string[] = pt.target_levels || [];
        // If org is a university, require group match when payment type is tied to a group.
        if (orgType === 'university') {
          if (pt.group_id) {
            // only include if member is in same group
            if (!member.group_id || member.group_id !== pt.group_id) return false;
          }
        }
        if (!targets || targets.length === 0) return true; // applies to all members
        const canonicalTargets = targets.map((l: string) => organizationService.canonicalizeLevel(l));
        return canonicalTargets.includes(memberLevel);
      });

      // Get all payments for this member
      let pmtQuery = supabase
        .from('payments')
        .select('payment_type_id, amount, status, transaction_ref')
        .eq('member_id', studentId);
      if (scope) {
        pmtQuery = pmtQuery.eq('organization_id', scope.orgId);
        pmtQuery = pmtQuery.eq('group_id', scope.groupId);
      }
      const { data: allPayments } = await pmtQuery;

      // Calculate stats
      let totalPaid = 0;
      let totalDue = 0;
      let paymentsMade = 0;
      let pendingPayments = 0;

      // Go through each payment type and check if student has paid
      activePaymentTypes?.forEach(pt => {
        const studentPayments = allPayments?.filter(p => p.payment_type_id === pt.id) || [];
        
        // Check if payment is waived
        const isWaived = studentPayments.some(p => 
          p.status === 'approved' && p.transaction_ref?.startsWith('WAIVED-')
        );
        
        // Calculate total approved amount for this payment type (excluding waived)
        const paidForType = studentPayments
          .filter(p => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-'))
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);
        
        // Only count as "payment made" if there's at least one approved payment (not waived)
        if (paidForType > 0) {
          paymentsMade++;
          totalPaid += paidForType;
        }
        
        // Check if there are pending payments for this type
        const hasPending = studentPayments.some(p => p.status === 'pending');
        if (hasPending) {
          pendingPayments++;
        }
        
        // Calculate outstanding for this payment type (0 if waived)
        if (!isWaived) {
          const outstanding = (Number(pt.amount) || 0) - paidForType;
          if (outstanding > 0) {
            // Base outstanding
            totalDue += outstanding;

            // If past deadline, add accumulated late fees only if student still owed at deadline
            try {
              if (pt.deadline) {
                const deadlineDate = new Date(pt.deadline);
                const now = new Date();
                if (now > deadlineDate) {
                  const perDay = Number(pt.late_fee_per_day || 0);
                  if (perDay > 0) {
                    // Calculate how much was paid before deadline
                    const paidBeforeDeadline = studentPayments
                      .filter(p => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-'))
                      .reduce((sum, p) => {
                        const submittedAt = (p as any).submitted_at ? new Date((p as any).submitted_at) : ((p as any).created_at ? new Date((p as any).created_at) : null);
                        if (submittedAt && submittedAt.getTime() <= deadlineDate.getTime()) {
                          return sum + Number(p.amount || 0);
                        }
                        return sum;
                      }, 0);
                    const remainingAtDeadline = Math.max(0, (Number(pt.amount) || 0) - paidBeforeDeadline);
                    // Only apply late fees if student still owed at deadline
                    if (remainingAtDeadline > 0) {
                      const daysOverdue = Math.floor((now.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24));
                      if (daysOverdue > 0) {
                        totalDue += daysOverdue * perDay;
                      }
                    }
                  }
                }
              }
            } catch (e) {
              // ignore date parsing issues and continue
            }
          }
        }
      });

      // Get next due date from unpaid payment types (excluding waived)
      const unpaidTypeIds = activePaymentTypes
        ?.filter(pt => {
          const studentPayments = allPayments?.filter(p => p.payment_type_id === pt.id) || [];
          
          // Check if waived
          const isWaived = studentPayments.some(p => 
            p.status === 'approved' && p.transaction_ref?.startsWith('WAIVED-')
          );
          
          if (isWaived) return false; // Don't include waived in unpaid types
          
          const paidForType = studentPayments
            .filter(p => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-'))
            .reduce((sum, p) => sum + Number(p.amount || 0), 0) || 0;
          return paidForType < pt.amount;
        })
        .map(pt => pt.id) || [];

      let nextDueDate: string | undefined;
      if (unpaidTypeIds.length > 0) {
        const { data: nextDue } = await supabase
          .from('payment_types')
          .select('deadline')
          .in('id', unpaidTypeIds)
          .gte('deadline', new Date().toISOString())
          .order('deadline', { ascending: true })
          .limit(1)
          .single();
        
        nextDueDate = nextDue?.deadline;
      }

      return {
        totalPaid,
        totalDue,
        paymentsMade,
        pendingPayments,
        nextDueDate,
      };
    } catch (error) {
      console.error('Error fetching payment stats:', error);
      return {
        totalPaid: 0,
        totalDue: 0,
        paymentsMade: 0,
        pendingPayments: 0,
      };
    }
  }

  /**
   * Get recent payments for a student
   */
  async getRecentPayments(studentId: string, limit = 5): Promise<Payment[]> {
    try {
      const scope = getOrgScope();
      let query = supabase
        .from('payments')
        .select(`
          *,
          payment_types (
            title,
            category,
            icon,
            color
          )
        `)
        .eq('member_id', studentId);
      if (scope) {
        query = query.eq('organization_id', scope.orgId);
        query = query.eq('group_id', scope.groupId);
      }
      query = query.order('created_at', { ascending: false }).limit(limit);

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching recent payments:', error);
      return [];
    }
  }

  /**
   * Get upcoming payment types (active dues not yet paid)
   */
  async getUpcomingPaymentTypes(studentId: string): Promise<PaymentType[]> {
    try {
      const member = await this.getMemberLevel(studentId);
      if (!member) return [];

      const scope = getOrgScope();
      let orgType: string | null = null;
      if (scope) {
        const org = await organizationService.getById(scope.orgId);
        orgType = org?.organization_type || null;
      }

      // Get ALL active payment types (scoped to org if applicable)
      let ptQuery = supabase
        .from('payment_types')
        .select('*')
        .eq('is_active', true)
        .order('deadline', { ascending: true });
      if (scope) {
        ptQuery = ptQuery.eq('organization_id', scope.orgId);
        ptQuery = ptQuery.eq('group_id', scope.groupId);
      }

      const { data: allPaymentTypes, error } = await ptQuery;

      if (error) {
        console.error('Error fetching payment types:', error);
        throw error;
      }

      // Filter payment types for this member's level (allow null/empty target_levels as wildcard)
      const memberLevelCanonical = organizationService.canonicalizeLevel(member.level || '');
      const paymentTypes = (allPaymentTypes || []).filter((pt: any) => {
        // For university orgs, if a payment type is tied to a group, require group match
        if (orgType === 'university' && pt.group_id) {
          if (!member.group_id || member.group_id !== pt.group_id) return false;
        }
        const targets: string[] = pt.target_levels || [];
        if (!targets || targets.length === 0) return true;
        const t = targets.map((l: string) => organizationService.canonicalizeLevel(l));
        return t.includes(memberLevelCanonical);
      });

      // Filter out payment types already fully paid
      const filteredTypes: PaymentType[] = [];
      
      for (const type of paymentTypes) {
        let pQuery = supabase
          .from('payments')
          .select('amount')
          .eq('member_id', studentId)
          .eq('payment_type_id', type.id)
          .eq('status', 'approved');
        if (scope) {
          pQuery = pQuery.eq('organization_id', scope.orgId);
          pQuery = pQuery.eq('group_id', scope.groupId);
        }

        const { data: payments } = await pQuery;

        const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

        // Only include if not fully paid
        if (totalPaid < type.amount) {
          filteredTypes.push(type);
        }
      }

      return filteredTypes;
    } catch (error) {
      console.error('Error fetching upcoming payment types:', error);
      return [];
    }
  }

  /**
   * Get all payments for a student/member (for payment history)
   */
  async getAllPayments(studentId: string): Promise<Payment[]> {
    try {
      const scope = getOrgScope();
      let query = supabase
        .from('payments')
        .select(`
          *,
          payment_types (
            title,
            category,
            icon,
            color
          )
        `)
        .eq('member_id', studentId);
      if (scope) {
        query = query.eq('organization_id', scope.orgId);
        query = query.eq('group_id', scope.groupId);
      }
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching all payments:', error);
      return [];
    }
  }

  /**
   * Submit a new payment
   */
  async submitPayment(paymentData: {
    studentId: string;
    paymentTypeId: string;
    amountPaid: number;
    paymentMethod: 'bank_transfer' | 'cash' | 'pos';
    transactionRef?: string;
    receiptUrl?: string;
    notes?: string;
  }): Promise<Payment | null> {
    try {
      const scope = getOrgScope();
      const insertData: Record<string, unknown> = {
        member_id: paymentData.studentId,
        payment_type_id: paymentData.paymentTypeId,
        amount: paymentData.amountPaid,
        payment_method: paymentData.paymentMethod,
        transaction_ref: paymentData.transactionRef,
        receipt_url: paymentData.receiptUrl,
        notes: paymentData.notes,
        status: 'pending',
      };
      // Include org and group IDs for multi-tenant data isolation
      if (scope) {
        insertData.organization_id = scope.orgId;
        insertData.group_id = scope.groupId;
      }

      const { data, error } = await supabase
        .from('payments')
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Notify approvers (admins / finsec) that a new payment was submitted
      try {
        await notificationService.notifyApproversOfNewPayment(
          data.id,
          paymentData.studentId,
          Number(paymentData.amountPaid || 0),
          paymentData.paymentTypeId
        );
      } catch (e) {
        console.error('Failed to notify approvers of new payment:', e);
      }

      return data;
    } catch (error) {
      console.error('Error submitting payment:', error);
      throw error;
    }
  }

  /**
   * Get payment summary (total paid, outstanding, etc.)
   */
  async getPaymentSummary(studentId: string): Promise<{
    totalPaid: number;
    totalOutstanding: number;
    totalPending: number;
    completedPayments: number;
    pendingPayments: number;
  }> {
    try {
      // Get member info for level
      const student = await this.getMemberLevel(studentId);

      if (!student) {
        return {
          totalPaid: 0,
          totalOutstanding: 0,
          totalPending: 0,
          completedPayments: 0,
          pendingPayments: 0,
        };
      }

      // Get all active payment types for this member's level
      const scope2 = getOrgScope();
      let ptQuery2 = supabase
        .from('payment_types')
        .select('id, amount, deadline, late_fee_per_day, target_levels')
        .eq('is_active', true);
      if (scope2) {
        ptQuery2 = ptQuery2.eq('organization_id', scope2.orgId);
        ptQuery2 = ptQuery2.eq('group_id', scope2.groupId);
      }
      const { data: allActivePaymentTypes } = await ptQuery2;
      const activePaymentTypes = (allActivePaymentTypes || []).filter((pt: any) => {
        const targets: string[] = pt.target_levels || [];
        if (!targets || targets.length === 0) return true;
        const t = targets.map((l: string) => organizationService.canonicalizeLevel(l));
        return t.includes(organizationService.canonicalizeLevel(student.level || ''));
      });

      // Get all payments for this member
      let pmtQuery2 = supabase
        .from('payments')
        .select('payment_type_id, amount, status, transaction_ref')
        .eq('member_id', studentId);
      if (scope2) {
        pmtQuery2 = pmtQuery2.eq('organization_id', scope2.orgId);
        pmtQuery2 = pmtQuery2.eq('group_id', scope2.groupId);
      }
      const { data: allPayments } = await pmtQuery2;

      let totalPaid = 0;
      let totalOutstanding = 0;
      let completedPayments = 0;
      let pendingPayments = 0;

      // Go through each payment type
      activePaymentTypes?.forEach(pt => {
        const studentPayments = allPayments?.filter(p => p.payment_type_id === pt.id) || [];
        
        // Calculate total approved amount for this payment type (excluding waived payments)
        const paidForType = studentPayments
          .filter(p => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-'))
          .reduce((sum, p) => sum + Number(p.amount || 0), 0);
        
        // Check if payment is waived
        const isWaived = studentPayments.some(p => 
          p.status === 'approved' && p.transaction_ref?.startsWith('WAIVED-')
        );
        
        // Add to total paid (only actual payments, not waived)
        totalPaid += paidForType;
        
        // Count as completed payment if fully paid OR waived
        if (paidForType >= pt.amount || isWaived) {
          completedPayments++;
        }
        
        // Check for pending payments
        const hasPending = studentPayments.some(p => p.status === 'pending');
        if (hasPending) {
          pendingPayments++;
        }
        
        // Calculate outstanding for this payment type (0 if waived)
        if (!isWaived) {
          const outstanding = (Number(pt.amount) || 0) - paidForType;
          if (outstanding > 0) {
            // Base outstanding
            totalOutstanding += outstanding;

            // If past deadline, add accumulated late fees only if student still owed at deadline
            try {
              if (pt.deadline) {
                const deadlineDate = new Date(pt.deadline);
                const now = new Date();
                if (now > deadlineDate) {
                  const perDay = Number(pt.late_fee_per_day || 0);
                  if (perDay > 0) {
                    // Calculate how much was paid before deadline
                    const paidBeforeDeadline = studentPayments
                      .filter(p => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-'))
                      .reduce((sum, p) => {
                        const submittedAt = (p as any).submitted_at ? new Date((p as any).submitted_at) : ((p as any).created_at ? new Date((p as any).created_at) : null);
                        if (submittedAt && submittedAt.getTime() <= deadlineDate.getTime()) {
                          return sum + Number(p.amount || 0);
                        }
                        return sum;
                      }, 0);
                    const remainingAtDeadline = Math.max(0, (Number(pt.amount) || 0) - paidBeforeDeadline);
                    // Only apply late fees if student still owed at deadline
                    if (remainingAtDeadline > 0) {
                      const daysOverdue = Math.floor((now.getTime() - deadlineDate.getTime()) / (1000 * 60 * 60 * 24));
                      if (daysOverdue > 0) {
                        totalOutstanding += daysOverdue * perDay;
                      }
                    }
                  }
                }
              }
            } catch (e) {
              // ignore date parsing issues
            }
          }
        }
      });

      return {
        totalPaid,
        totalOutstanding,
        totalPending: 0, // Not tracking total pending amount separately
        completedPayments,
        pendingPayments,
      };
    } catch (error) {
      console.error('Error fetching payment summary:', error);
      return {
        totalPaid: 0,
        totalOutstanding: 0,
        totalPending: 0,
        completedPayments: 0,
        pendingPayments: 0,
      };
    }
  }

  /**
   * Get active payment types for a student with their payment status
   */
  async getActivePaymentTypesForStudent(studentId: string): Promise<PaymentType[]> {
    try {
      // Get member info
      const student = await this.getMemberLevel(studentId);

      if (!student) return [];

      const scope = getOrgScope();
      // Multi-group: a member's dues span EVERY group they belong to.
      const groupIds = new Set(await this.getMemberGroupIds(studentId));
      // Fetch all active types for the org; filter by the member's groups below.
      let ptQuery = supabase
        .from('payment_types')
        .select('*')
        .eq('is_active', true)
        .order('deadline', { ascending: true });
      if (scope) {
        ptQuery = ptQuery.eq('organization_id', scope.orgId);
      }
      const { data: allPaymentTypesRes, error } = await ptQuery;
      if (error) throw error;
      const memberLevelCanon = organizationService.canonicalizeLevel(student.level || '');

      const matchesLevel = (pt: any): boolean => {
        const targets: string[] = pt.target_levels || [];
        if (!targets || targets.length === 0) return true;
        return targets.map((l: string) => organizationService.canonicalizeLevel(l)).includes(memberLevelCanon);
      };

      const paymentTypes = (allPaymentTypesRes || []).filter((pt: any) => {
        // Group/unit-scoped due: the member must belong to that group (or a class
        // below it — groupIds already includes ancestor units), AND match any
        // level filter the exec set (e.g. "300L across the whole department").
        if (pt.group_id) return groupIds.has(pt.group_id) && matchesLevel(pt);

        // Org-wide due: applies by level target (or to everyone when untargeted).
        return matchesLevel(pt);
      });

      return paymentTypes || [];
    } catch (error) {
      console.error('Error fetching active payment types:', error);
      return [];
    }
  }

  /**
   * Get all payments for a student
   */
  async getStudentPayments(studentId: string): Promise<Payment[]> {
    try {
      const scope = getOrgScope();
      let query = supabase
        .from('payments')
        .select(`
          *,
          payment_types (
            title,
            category,
            icon,
            color,
            amount
          )
        `)
        .eq('member_id', studentId);
      // Payments are member-scoped already; don't pin to the primary group, so
      // dues paid to ANY of the member's groups (class, association, club) show.
      if (scope) {
        query = query.eq('organization_id', scope.orgId);
      }
      query = query.order('created_at', { ascending: false });

      const { data, error } = await query;

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching member payments:', error);
      return [];
    }
  }

  /**
   * Get payment type by ID with full details
   */
  async getPaymentTypeById(paymentTypeId: string): Promise<PaymentType | null> {
    try {
      const scope = getOrgScope();
      let query = supabase
        .from('payment_types')
        .select(`
          *,
          created_by_admin:member_admins!payment_types_created_by_fkey (
            id,
            role
          )
        `)
        .eq('id', paymentTypeId);
      if (scope) {
        query = query.eq('organization_id', scope.orgId);
        query = query.eq('group_id', scope.groupId);
      }
      const { data, error } = await query.single();

      if (error) throw error;

      return data;
    } catch (error) {
      console.error('Error fetching payment type:', error);
      return null;
    }
  }

  /**
   * Get payment progress for a specific payment type
   */
  async getPaymentProgress(paymentTypeId: string): Promise<{
    totalStudents: number;
    paidCount: number;
    pendingCount: number;
    unpaidCount: number;
    totalCollected: number;
    totalExpected: number;
  }> {
    try {
      // Get payment type info
      const { data: paymentType } = await supabase
        .from('payment_types')
        .select('amount, target_levels, organization_id, group_id')
        .eq('id', paymentTypeId)
        .single();

      if (!paymentType) {
        throw new Error('Payment type not found');
      }

      // Count total members in target levels (scoped to org)
      const scope = getOrgScope();
      let memberQuery = supabase
        .from('organization_members')
        .select('*', { count: 'exact', head: true })
        .eq('is_active', true);

      // If paymentType has explicit target_levels, filter by them; otherwise count all members in org
      if (paymentType.target_levels && (paymentType.target_levels as any[]).length > 0) {
        memberQuery = memberQuery.in('level', paymentType.target_levels || []);
      }

      if (scope) memberQuery = memberQuery.eq('organization_id', scope.orgId);
      if (scope) memberQuery = memberQuery.eq('group_id', scope.groupId);
      else if (paymentType.organization_id) memberQuery = memberQuery.eq('organization_id', paymentType.organization_id);
      if (!scope && paymentType.group_id) memberQuery = memberQuery.eq('group_id', paymentType.group_id);
      const { count: totalStudents } = await memberQuery;

      // Count paid (approved)
      let paidQuery = supabase
        .from('payments')
        .select('amount', { count: 'exact' })
        .eq('payment_type_id', paymentTypeId)
        .eq('status', 'approved');
      if (scope) paidQuery = paidQuery.eq('organization_id', scope.orgId);
      if (scope) paidQuery = paidQuery.eq('group_id', scope.groupId);
      else if (paymentType.organization_id) paidQuery = paidQuery.eq('organization_id', paymentType.organization_id);
      if (!scope && paymentType.group_id) paidQuery = paidQuery.eq('group_id', paymentType.group_id);
      const { count: paidCount, data: paidPayments } = await paidQuery;

      // Count pending
      let pendingQuery = supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('payment_type_id', paymentTypeId)
        .eq('status', 'pending');
      if (scope) pendingQuery = pendingQuery.eq('organization_id', scope.orgId);
      if (scope) pendingQuery = pendingQuery.eq('group_id', scope.groupId);
      else if (paymentType.organization_id) pendingQuery = pendingQuery.eq('organization_id', paymentType.organization_id);
      if (!scope && paymentType.group_id) pendingQuery = pendingQuery.eq('group_id', paymentType.group_id);
      const { count: pendingCount } = await pendingQuery;

      const totalCollected = paidPayments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;
      const totalExpected = (totalStudents || 0) * paymentType.amount;
      const unpaidCount = (totalStudents || 0) - (paidCount || 0) - (pendingCount || 0);

      return {
        totalStudents: totalStudents || 0,
        paidCount: paidCount || 0,
        pendingCount: pendingCount || 0,
        unpaidCount,
        totalCollected,
        totalExpected,
      };
    } catch (error) {
      console.error('Error fetching payment progress:', error);
      return {
        totalStudents: 0,
        paidCount: 0,
        pendingCount: 0,
        unpaidCount: 0,
        totalCollected: 0,
        totalExpected: 0,
      };
    }
  }

  /**
   * Get student's payment status for a specific payment type
   */
  async getStudentPaymentStatus(
    studentId: string,
    paymentTypeId: string
  ): Promise<{
    payment: Payment | null;
    status: 'paid' | 'pending' | 'partial' | 'not_paid';
    amountPaid: number;
    progress: number;
  }> {
    try {
      // Get payment type
      const scope = getOrgScope();
      let ptQuery = supabase
        .from('payment_types')
        .select('amount')
        .eq('id', paymentTypeId);
      if (scope) {
        ptQuery = ptQuery.eq('organization_id', scope.orgId);
        ptQuery = ptQuery.eq('group_id', scope.groupId);
      }
      const { data: paymentType } = await ptQuery.single();

      if (!paymentType) {
        throw new Error('Payment type not found');
      }

      // Get student's payment
      let pmtQuery = supabase
        .from('payments')
        .select('*')
        .eq('member_id', studentId)
        .eq('payment_type_id', paymentTypeId)
        .order('created_at', { ascending: false })
        .limit(1);
      if (scope) {
        pmtQuery = pmtQuery.eq('organization_id', scope.orgId);
        pmtQuery = pmtQuery.eq('group_id', scope.groupId);
      }
      const { data: payments } = await pmtQuery;

      const payment = payments?.[0] || null;

      if (!payment) {
        return {
          payment: null,
          status: 'not_paid',
          amountPaid: 0,
          progress: 0,
        };
      }

      const amountPaid = payment.amount || 0;
      const progress = (amountPaid / paymentType.amount) * 100;

      let status: 'paid' | 'pending' | 'partial' | 'not_paid' = 'not_paid';
      
      if (payment.status === 'approved') {
        status = progress >= 100 ? 'paid' : 'partial';
      } else if (payment.status === 'pending') {
        status = 'pending';
      } else if (payment.status === 'partial') {
        status = 'partial';
      }

      return {
        payment,
        status,
        amountPaid,
        progress,
      };
    } catch (error) {
      console.error('Error fetching payment status:', error);
      return {
        payment: null,
        status: 'not_paid',
        amountPaid: 0,
        progress: 0,
      };
    }
  }
}

export default new PaymentService();
