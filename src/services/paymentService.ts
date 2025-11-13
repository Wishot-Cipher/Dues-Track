import { supabase } from '@/config/supabase';
import type { Payment, PaymentType, PaymentStats } from '@/types';

/**
 * Payment Service
 * Handles all payment-related data fetching and mutations
 */

class PaymentService {
  /**
   * Get payment statistics for a student
   */
  async getStudentPaymentStats(studentId: string): Promise<PaymentStats> {
    try {
      // Get student info first
      const { data: student } = await supabase
        .from('students')
        .select('level, department')
        .eq('id', studentId)
        .single();

      if (!student) {
        return {
          totalPaid: 0,
          totalDue: 0,
          paymentsMade: 0,
          pendingPayments: 0,
        };
      }

      // Get all active payment types for this student's level
      const { data: activePaymentTypes, error: typesError } = await supabase
        .from('payment_types')
        .select('id, amount')
        .eq('is_active', true)
        .contains('target_levels', [student.level]);

      if (typesError) throw typesError;

      // Get all payments for this student
      const { data: allPayments } = await supabase
        .from('payments')
        .select('payment_type_id, amount, status, transaction_ref')
        .eq('student_id', studentId);

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
          const outstanding = pt.amount - paidForType;
          if (outstanding > 0) {
            totalDue += outstanding;
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
      const { data, error } = await supabase
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
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false })
        .limit(limit);

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
      // Get student info
      const { data: student } = await supabase
        .from('students')
        .select('level, department')
        .eq('id', studentId)
        .single();

      if (!student) return [];

      console.log('Student level:', student.level);

      // Get ALL active payment types first (easier filtering)
      // Temporarily remove deadline filter to see all payment types
      const { data: allPaymentTypes, error } = await supabase
        .from('payment_types')
        .select('*')
        .eq('is_active', true)
        // .gte('deadline', new Date().toISOString()) // Commented out for debugging
        .order('deadline', { ascending: true });

      if (error) {
        console.error('Error fetching payment types:', error);
        throw error;
      }

      console.log('All active payment types:', allPaymentTypes);
      console.log('Current time:', new Date().toISOString());
      
      // Log deadline comparison for each payment type
      allPaymentTypes?.forEach(pt => {
        console.log(`${pt.title}: deadline=${pt.deadline}, isFuture=${new Date(pt.deadline) > new Date()}`);
      });

      // Filter payment types for this student's level
      const paymentTypes = allPaymentTypes?.filter(pt => 
        pt.target_levels?.includes(student.level)
      ) || [];

      console.log('Filtered payment types for level:', paymentTypes);

      // Filter out payment types already fully paid
      const filteredTypes: PaymentType[] = [];
      
      for (const type of paymentTypes) {
        const { data: payments } = await supabase
          .from('payments')
          .select('amount')
          .eq('student_id', studentId)
          .eq('payment_type_id', type.id)
          .eq('status', 'approved');

        const totalPaid = payments?.reduce((sum, p) => sum + Number(p.amount), 0) || 0;

        // Only include if not fully paid
        if (totalPaid < type.amount) {
          filteredTypes.push(type);
        }
      }

      console.log('Final filtered types (unpaid):', filteredTypes);
      return filteredTypes;
    } catch (error) {
      console.error('Error fetching upcoming payment types:', error);
      return [];
    }
  }

  /**
   * Get all payments for a student (for payment history)
   */
  async getAllPayments(studentId: string): Promise<Payment[]> {
    try {
      const { data, error } = await supabase
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
        .eq('student_id', studentId)
        .order('submitted_at', { ascending: false });

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
      const { data, error } = await supabase
        .from('payments')
        .insert({
          student_id: paymentData.studentId,
          payment_type_id: paymentData.paymentTypeId,
          amount: paymentData.amountPaid,
          payment_method: paymentData.paymentMethod,
          transaction_ref: paymentData.transactionRef,
          receipt_url: paymentData.receiptUrl,
          notes: paymentData.notes,
          status: 'pending',
        })
        .select()
        .single();

      if (error) throw error;

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
      // Get student info for level
      const { data: student } = await supabase
        .from('students')
        .select('level')
        .eq('id', studentId)
        .single();

      if (!student) {
        return {
          totalPaid: 0,
          totalOutstanding: 0,
          totalPending: 0,
          completedPayments: 0,
          pendingPayments: 0,
        };
      }

      // Get all active payment types for this student's level
      const { data: activePaymentTypes } = await supabase
        .from('payment_types')
        .select('id, amount')
        .eq('is_active', true)
        .contains('target_levels', [student.level]);

      // Get all payments for this student
      const { data: allPayments } = await supabase
        .from('payments')
        .select('payment_type_id, amount, status, transaction_ref')
        .eq('student_id', studentId);

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
          const outstanding = pt.amount - paidForType;
          if (outstanding > 0) {
            totalOutstanding += outstanding;
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
      // Get student info
      const { data: student } = await supabase
        .from('students')
        .select('level, department')
        .eq('id', studentId)
        .single();

      if (!student) return [];

      // Get all active payment types for this student's level
      const { data: paymentTypes, error } = await supabase
        .from('payment_types')
        .select('*')
        .eq('is_active', true)
        .contains('target_levels', [student.level])
        .order('deadline', { ascending: true });

      if (error) throw error;

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
      const { data, error } = await supabase
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
        .eq('student_id', studentId)
        .order('created_at', { ascending: false });

      if (error) throw error;

      return data || [];
    } catch (error) {
      console.error('Error fetching student payments:', error);
      return [];
    }
  }

  /**
   * Get payment type by ID with full details
   */
  async getPaymentTypeById(paymentTypeId: string): Promise<PaymentType | null> {
    try {
      const { data, error } = await supabase
        .from('payment_types')
        .select(`
          *,
          admins!payment_types_created_by_fkey (
            id,
            full_name,
            role
          )
        `)
        .eq('id', paymentTypeId)
        .single();

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
        .select('amount, target_levels')
        .eq('id', paymentTypeId)
        .single();

      if (!paymentType) {
        throw new Error('Payment type not found');
      }

      // Count total students in target levels
      const { count: totalStudents } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .in('level', paymentType.target_levels || []);

      // Count paid (approved)
      const { count: paidCount, data: paidPayments } = await supabase
        .from('payments')
        .select('amount', { count: 'exact' })
        .eq('payment_type_id', paymentTypeId)
        .eq('status', 'approved');

      // Count pending
      const { count: pendingCount } = await supabase
        .from('payments')
        .select('*', { count: 'exact', head: true })
        .eq('payment_type_id', paymentTypeId)
        .eq('status', 'pending');

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
      const { data: paymentType } = await supabase
        .from('payment_types')
        .select('amount')
        .eq('id', paymentTypeId)
        .single();

      if (!paymentType) {
        throw new Error('Payment type not found');
      }

      // Get student's payment
      const { data: payment } = await supabase
        .from('payments')
        .select('*')
        .eq('student_id', studentId)
        .eq('payment_type_id', paymentTypeId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

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
