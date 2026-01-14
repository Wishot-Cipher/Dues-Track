/* eslint-disable @typescript-eslint/no-unused-vars */
import { supabase } from '@/config/supabase';

export type NotificationType = 'welcome' | 'payment_approved' | 'payment_rejected' | 'payment_pending' | 'payment_waived' | 'system';

interface CreateNotificationParams {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedPaymentId?: string;
}

class NotificationService {
  /**
   * Create a new notification for a user
   */
  async createNotification(params: CreateNotificationParams): Promise<boolean> {
    try {
      const link = params.relatedPaymentId ? `/payment/${params.relatedPaymentId}` : null;

      const { error } = await supabase.from('notifications').insert({
        recipient_id: params.recipientId,
        type: params.type,
        title: params.title,
        message: params.message,
        link,
        is_read: false,
      });

      if (error) {
        console.error('Error creating notification:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error creating notification:', error);
      return false;
    }
  }

  /**
   * Send welcome notification to new user
   */
  async sendWelcomeNotification(userId: string, userName: string): Promise<boolean> {
    return this.createNotification({
      recipientId: userId,
      type: 'welcome',
      title: 'Welcome to Class Dues Tracker! 🎉',
      message: `Hi ${userName}! Your profile has been completed successfully. You can now view and manage your class dues payments. Check your dashboard for active payment types.`,
    });
  }

  /**
   * Send payment approved notification
   */
  async sendPaymentApprovedNotification(
    userId: string,
    userName: string,
    paymentTypeName: string,
    amount: number,
    paymentId: string
  ): Promise<boolean> {
    return this.createNotification({
      recipientId: userId,
      type: 'payment_approved',
      title: 'Payment Approved ✅',
      message: `Great news ${userName}! Your payment of ₦${amount.toLocaleString()} for "${paymentTypeName}" has been approved by the admin. Keep up the good work!`,
      relatedPaymentId: paymentId,
    });
  }

  /**
   * Send payment rejected notification
   */
  async sendPaymentRejectedNotification(
    userId: string,
    userName: string,
    paymentTypeName: string,
    amount: number,
    rejectionReason: string,
    paymentId: string
  ): Promise<boolean> {
    return this.createNotification({
      recipientId: userId,
      type: 'payment_rejected',
      title: 'Payment Rejected ❌',
      message: `Hi ${userName}, your payment of ₦${amount.toLocaleString()} for "${paymentTypeName}" was rejected. Reason: ${rejectionReason}. You can resubmit your payment from the payment details page.`,
      relatedPaymentId: paymentId,
    });
  }

  /**
   * Send payment pending notification
   */
  async sendPaymentPendingNotification(
    userId: string,
    userName: string,
    paymentTypeName: string,
    amount: number,
    paymentId: string
  ): Promise<boolean> {
    return this.createNotification({
      recipientId: userId,
      type: 'payment_pending',
      title: 'Payment Submitted ⏳',
      message: `Hi ${userName}! Your payment of ₦${amount.toLocaleString()} for "${paymentTypeName}" has been submitted successfully and is awaiting admin review. You'll be notified once it's processed.`,
      relatedPaymentId: paymentId,
    });
  }

  /**
   * Send payment waived notification
   */
  async sendPaymentWaivedNotification(
    userId: string,
    userName: string,
    paymentTypeName: string,
    amount: number,
    waiverReason: string
  ): Promise<boolean> {
    return this.createNotification({
      recipientId: userId,
      type: 'payment_waived',
      title: 'Payment Waived 🎁',
      message: `Hi ${userName}! Your payment of ₦${amount.toLocaleString()} for "${paymentTypeName}" has been waived. Reason: ${waiverReason}. You don't need to make this payment.`,
    });
  }

  /**
   * Notify all approvers (admins/finsec) that a new payment was submitted
   */
  async notifyApproversOfNewPayment(paymentId: string, studentId: string, amount: number, paymentTypeId: string): Promise<boolean> {
    try {
      // Call server API which uses Supabase service role to insert notifications
      const res = await fetch('/api/notify-approvers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ paymentId, studentId, amount, paymentTypeId }),
      });

      if (!res.ok) {
        const txt = await res.text();
        console.error('notify-approvers API failed:', txt);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error calling notify-approvers API:', error);
      return false;
    }
  }

  /**
   * Mark notification as read
   */
  async markAsRead(notificationId: string): Promise<boolean> {
    try {
      const userId = localStorage.getItem('current_user_id');
      if (!userId) throw new Error('Not authenticated');

      const res = await fetch('/api/notifications/mark-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notificationId, userId }),
      });

      if (!res.ok) {
        // If serverless API isn't available in dev (Vite), fall back to direct Supabase update
        if (res.status === 404) {
          console.warn('mark-read endpoint not found (404). Falling back to direct Supabase update for local dev.');
          const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('id', notificationId)
            .eq('recipient_id', userId);
          if (error) {
            console.error('Supabase fallback error marking as read:', error);
            return false;
          }
          return true;
        }

        const txt = await res.text();
        console.error('mark-read API error:', txt);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return false;
    }
  }

  /**
   * Mark all notifications as read for a user
   */
  async markAllAsRead(userId: string): Promise<boolean> {
    try {
      const currentUserId = localStorage.getItem('current_user_id');
      if (!currentUserId || currentUserId !== userId) {
        throw new Error('Not authenticated or mismatched user');
      }

      const res = await fetch('/api/notifications/mark-all-read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      if (!res.ok) {
        // Fallback for local dev when serverless API routes are not present
        if (res.status === 404) {
          console.warn('mark-all-read endpoint not found (404). Falling back to direct Supabase update for local dev.');
          const { error } = await supabase
            .from('notifications')
            .update({ is_read: true })
            .eq('recipient_id', userId)
            .eq('is_read', false);
          if (error) {
            console.error('Supabase fallback error marking all as read:', error);
            return false;
          }
          return true;
        }

        const txt = await res.text();
        console.error('mark-all-read API error:', txt);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return false;
    }
  }

  /**
   * Delete a notification
   */
  async deleteNotification(notificationId: string): Promise<boolean> {
    try {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);

      if (error) {
        console.error('Error deleting notification:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting notification:', error);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;
