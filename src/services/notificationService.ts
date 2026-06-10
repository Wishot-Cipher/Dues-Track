import { supabase } from '@/config/supabase';
import { getOrgScope } from '@/utils/orgScope';

export type NotificationType = 'welcome' | 'payment_approved' | 'payment_rejected' | 'payment_pending' | 'payment_waived' | 'system';

interface CreateNotificationParams {
  recipientId: string;
  type: NotificationType;
  title: string;
  message: string;
  relatedPaymentId?: string;
}

/**
 * Send a push notification to a user via the server API
 */
async function sendPushNotification(
  userId: string,
  title: string,
  body: string,
  url?: string,
  tag?: string
): Promise<boolean> {
  try {
    // Current logged-in user is the caller
    const callerId = localStorage.getItem('pvx_member_id') || localStorage.getItem('current_user_id');
    
    const res = await fetch('/api/notifications/send-push', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        callerId: callerId || userId,
        userId,
        title,
        body,
        url: url || '/',
        tag: tag || 'general',
      }),
    });

    const result = await res.json();

    if (!res.ok) {
      return false;
    }

    return result.sent > 0;
  } catch {
    return false;
  }
}

class NotificationService {
  /**
   * Create a new notification for a user
   */
  async createNotification(params: CreateNotificationParams): Promise<boolean> {
    try {
      const link = params.relatedPaymentId ? `/payment/${params.relatedPaymentId}` : null;
      const scope = getOrgScope();

      const insertData: Record<string, unknown> = {
        member_id: params.recipientId,
        type: params.type,
        title: params.title,
        message: params.message,
        link,
        is_read: false,
      };
      if (scope) {
        insertData.organization_id = scope.orgId;
        insertData.group_id = scope.groupId;
      }

      const { error } = await supabase.from('notifications').insert(insertData);

      if (error) {
        console.error('Error creating notification:', error);
        return false;
      }

      // Best-effort "top of phone" push for EVERY notification created
      // through here (welcome, role, ticket, handover…), not just the
      // hardcoded payment ones. In-app sound + the unread badge come
      // from the realtime subscription; this reaches the device when
      // the app is backgrounded or closed. Non-blocking — a push miss
      // never fails the notification.
      void sendPushNotification(
        params.recipientId,
        params.title,
        params.message,
        link || '/notifications',
        params.type,
      );

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
      title: 'Welcome to Payvexo! 🎉',
      message: `Hi ${userName}! Your profile has been completed successfully. You can now view and manage your payments. Check your dashboard for active payment types.`,
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
    const title = 'Payment Approved ✅';
    const message = `Great news ${userName}! Your payment of ₦${amount.toLocaleString()} for "${paymentTypeName}" has been approved by the admin. Keep up the good work!`;
    
    // Send in-app notification
    const inAppResult = await this.createNotification({
      recipientId: userId,
      type: 'payment_approved',
      title,
      message,
      relatedPaymentId: paymentId,
    });

    // Also send push notification (non-blocking)
    sendPushNotification(
      userId,
      title,
      `Your payment of ₦${amount.toLocaleString()} for "${paymentTypeName}" has been approved!`,
      `/payment/${paymentId}`,
      'payment-approved'
    ).catch(() => {}); // Ignore push failures

    return inAppResult;
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
    const title = 'Payment Rejected ❌';
    const message = `Hi ${userName}, your payment of ₦${amount.toLocaleString()} for "${paymentTypeName}" was rejected. Reason: ${rejectionReason}. You can resubmit your payment from the payment details page.`;
    
    // Send in-app notification
    const inAppResult = await this.createNotification({
      recipientId: userId,
      type: 'payment_rejected',
      title,
      message,
      relatedPaymentId: paymentId,
    });

    // Also send push notification (non-blocking)
    sendPushNotification(
      userId,
      title,
      `Your payment of ₦${amount.toLocaleString()} for "${paymentTypeName}" was rejected. Reason: ${rejectionReason}`,
      `/payment/${paymentId}`,
      'payment-rejected'
    ).catch(() => {}); // Ignore push failures

    return inAppResult;
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
    const title = 'Payment Submitted ⏳';
    const message = `Hi ${userName}! Your payment of ₦${amount.toLocaleString()} for "${paymentTypeName}" has been submitted successfully and is awaiting admin review. You'll be notified once it's processed.`;
    
    // Send in-app notification
    const inAppResult = await this.createNotification({
      recipientId: userId,
      type: 'payment_pending',
      title,
      message,
      relatedPaymentId: paymentId,
    });

    // Push notification is optional for pending (less urgent)
    return inAppResult;
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
    const title = 'Payment Waived 🎁';
    const message = `Hi ${userName}! Your payment of ₦${amount.toLocaleString()} for "${paymentTypeName}" has been waived. Reason: ${waiverReason}. You don't need to make this payment.`;
    
    // Send in-app notification
    const inAppResult = await this.createNotification({
      recipientId: userId,
      type: 'payment_waived',
      title,
      message,
    });

    // Also send push notification for waived payments (good news!)
    sendPushNotification(
      userId,
      title,
      `Your payment of ₦${amount.toLocaleString()} for "${paymentTypeName}" has been waived!`,
      '/dashboard',
      'payment-waived'
    ).catch(() => {}); // Ignore push failures

    return inAppResult;
  }

  /**
   * Notify all approvers (admins/finsec) that a new payment was submitted
   */
  async notifyApproversOfNewPayment(paymentId: string, studentId: string, amount: number, paymentTypeId: string): Promise<boolean> {
    try {
      console.log('📩 Notifying approvers of new payment:', { paymentId, studentId, amount, paymentTypeId });
      
      // Call server API which uses Supabase service role to insert notifications
      // No auth token needed - API validates payment exists in database
      const res = await fetch('/api/notify-approvers', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ paymentId, studentId, amount, paymentTypeId }),
      });

      const result = await res.json();
      console.log('📩 notify-approvers response:', result);

      if (!res.ok) {
        console.error('notify-approvers API failed:', result);
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
      const userId = localStorage.getItem('pvx_member_id') || localStorage.getItem('current_user_id');
      if (!userId) throw new Error('Not authenticated');

      // Update Supabase DIRECTLY. A member marking THEIR OWN notification
      // read is allowed by RLS (notifications_update: member_id =
      // auth.uid()), so we don't need the serverless API for this — and
      // relying on it broke dev: Vite's SPA fallback serves index.html
      // with 200 OK for /api/* so `res.ok` was true while nothing was
      // ever updated. Match on id + member_id only (NEVER group_id — a
      // notification's group is often a different tier than the reader's
      // active group, which silently matched 0 rows).
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('id', notificationId)
        .eq('member_id', userId);
      if (error) {
        console.error('Error marking notification as read:', error);
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
      const currentUserId = localStorage.getItem('pvx_member_id') || localStorage.getItem('current_user_id');
      if (!currentUserId || currentUserId !== userId) {
        throw new Error('Not authenticated or mismatched user');
      }

      // Direct Supabase update (see markAsRead for why we don't use the
      // serverless API). Member-scoped only — NOT group-scoped, so every
      // unread notification across all tiers clears and the bell count
      // actually reaches zero.
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true, read_at: new Date().toISOString() })
        .eq('member_id', userId)
        .eq('is_read', false);
      if (error) {
        console.error('Error marking all notifications as read:', error);
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
      const dScope = getOrgScope();
      let delQ = supabase
        .from('notifications')
        .delete()
        .eq('id', notificationId);
      if (dScope) {
        delQ = delQ.eq('organization_id', dScope.orgId);
        delQ = delQ.eq('group_id', dScope.groupId);
      }
      const { error } = await delQ;

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

  /**
   * Delete all read notifications for a user
   * Safe to call — payment proof lives in the payments table, not notifications.
   */
  async deleteAllRead(userId: string): Promise<boolean> {
    try {
      const dScope = getOrgScope();
      let delQ = supabase
        .from('notifications')
        .delete()
        .eq('member_id', userId)
        .eq('is_read', true);
      if (dScope) {
        delQ = delQ.eq('organization_id', dScope.orgId);
        delQ = delQ.eq('group_id', dScope.groupId);
      }
      const { error } = await delQ;

      if (error) {
        console.error('Error deleting read notifications:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('Error deleting read notifications:', error);
      return false;
    }
  }
}

export const notificationService = new NotificationService();
export default notificationService;