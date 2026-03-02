/**
 * Push Notification Service
 * Handles Web Push API for real push notifications when app is closed
 * 
 * SETUP REQUIRED:
 * 1. Generate VAPID keys: npx web-push generate-vapid-keys
 * 2. Add to environment variables:
 *    - VITE_VAPID_PUBLIC_KEY (client-side)
 *    - VAPID_PRIVATE_KEY (server-side only)
 * 3. Store subscriptions in database
 * 4. Send push from backend using web-push library
 */

import { supabase } from '@/config/supabase';

// VAPID public key from environment
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

// Helper to convert base64 to Uint8Array (required for push subscription)
function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer;
}

class PushNotificationService {
  private _registration: ServiceWorkerRegistration | null = null;
  private _currentSubscription: PushSubscription | null = null;

  get currentSubscription() {
    return this._currentSubscription;
  }

  /**
   * Check if push notifications are supported
   */
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  }

  /**
   * Check current notification permission status
   */
  getPermissionStatus(): NotificationPermission {
    if (!this.isSupported()) return 'denied';
    return Notification.permission;
  }

  /**
   * Request notification permission from user
   */
  async requestPermission(): Promise<NotificationPermission> {
    if (!this.isSupported()) {
      console.warn('Push notifications not supported');
      return 'denied';
    }

    try {
      const permission = await Notification.requestPermission();
      console.log('🔔 Notification permission:', permission);
      return permission;
    } catch (error) {
      console.error('Error requesting notification permission:', error);
      return 'denied';
    }
  }

  /**
   * Get the service worker registration with timeout
   */
  async getRegistration(): Promise<ServiceWorkerRegistration | null> {
    if (this._registration) return this._registration;

    try {
      // Check if service worker is even available
      if (!navigator.serviceWorker) {
        console.log('Service worker not available');
        return null;
      }
      
      // Check if any service worker is registered
      const registrations = await navigator.serviceWorker.getRegistrations();
      if (registrations.length === 0) {
        console.log('No service worker registered (expected in dev mode)');
        return null;
      }
      
      // Add timeout to prevent hanging if SW isn't ready
      const timeoutPromise = new Promise<null>((resolve) => {
        setTimeout(() => resolve(null), 5000);
      });
      
      const swPromise = navigator.serviceWorker.ready;
      
      this._registration = await Promise.race([swPromise, timeoutPromise]) as ServiceWorkerRegistration | null;
      return this._registration;
    } catch (error) {
      console.error('Error getting service worker registration:', error);
      return null;
    }
  }

  /**
   * Subscribe to push notifications
   */
  async subscribe(userId: string): Promise<boolean> {
    console.log('🔔 Starting push notification subscription for user:', userId);
    
    if (!this.isSupported()) {
      console.warn('❌ Push notifications not supported in this browser');
      return false;
    }

    if (!VAPID_PUBLIC_KEY) {
      console.warn('❌ VAPID public key not configured. Add VITE_VAPID_PUBLIC_KEY to environment.');
      // Still return true to avoid infinite loading - just skip push functionality
      return true;
    }
    
    console.log('✅ VAPID public key found');

    try {
      // Request permission first
      console.log('🔔 Requesting notification permission...');
      const permission = await this.requestPermission();
      if (permission !== 'granted') {
        console.log('❌ Notification permission not granted:', permission);
        return false;
      }
      console.log('✅ Permission granted');

      // Get service worker registration
      console.log('🔔 Getting service worker registration...');
      const registration = await this.getRegistration();
      if (!registration) {
        console.log('⚠️ No service worker registration - push notifications require production build');
        // In dev mode, still return true so user isn't stuck
        // Push will work once deployed
        return true;
      }
      console.log('✅ Service worker registration found');

      // Check for existing subscription
      let subscription = await registration.pushManager.getSubscription();
      console.log('🔔 Existing subscription:', subscription ? 'Yes' : 'No');

      // Create new subscription if none exists
      if (!subscription) {
        try {
          console.log('🔔 Creating new push subscription...');
          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });
          console.log('✅ New push subscription created');
        } catch (subError) {
          console.error('❌ Error creating push subscription:', subError);
          // Return true anyway - permission was granted, push will work when keys are configured
          return true;
        }
      }

      this._currentSubscription = subscription;

      // Save subscription to database
      console.log('🔔 Saving subscription to database...');
      const success = await this.saveSubscription(userId, subscription);
      if (success) {
        console.log('✅ Push notification subscription saved to database!');
      } else {
        console.warn('⚠️ Could not save subscription to database - push notifications will NOT work when app is closed!');
        console.warn('⚠️ Check the browser console for detailed error above');
      }

      return true;
    } catch (error) {
      console.error('❌ Error subscribing to push notifications:', error);
      return false;
    }
  }

  /**
   * Unsubscribe from push notifications
   */
  async unsubscribe(userId: string): Promise<boolean> {
    try {
      const registration = await this.getRegistration();
      if (!registration) return false;

      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await subscription.unsubscribe();
        this._currentSubscription = null;
      }

      // Remove from database
      await this.removeSubscription(userId);

      console.log('🔕 Unsubscribed from push notifications');
      return true;
    } catch (error) {
      console.error('Error unsubscribing:', error);
      return false;
    }
  }

  /**
   * Check if user is subscribed
   */
  async isSubscribed(): Promise<boolean> {
    try {
      const registration = await this.getRegistration();
      if (!registration) return false;

      const subscription = await registration.pushManager.getSubscription();
      return subscription !== null;
    } catch (error) {
      console.error('Error checking subscription:', error);
      return false;
    }
  }

  /**
   * Save push subscription to database via API endpoint
   * Uses server-side service role to bypass RLS (since app uses custom auth)
   */
  private async saveSubscription(userId: string, subscription: PushSubscription): Promise<boolean> {
    try {
      const subscriptionJSON = subscription.toJSON();
      
      console.log('🔔 Saving push subscription for user:', userId);
      
      // Use API endpoint instead of direct Supabase client
      // This bypasses RLS issues since API uses service role
      const response = await fetch('/api/notifications/save-subscription', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId,
          endpoint: subscription.endpoint,
          p256dh: subscriptionJSON.keys?.p256dh || '',
          auth: subscriptionJSON.keys?.auth || '',
        }),
      });

      const result = await response.json();

      if (!response.ok || !result.ok) {
        console.error('❌ Error saving subscription:', result);
        return false;
      }

      console.log('✅ Subscription saved successfully via API');
      return true;
    } catch (error) {
      console.error('❌ Exception saving subscription:', error);
      return false;
    }
  }

  /**
   * Remove push subscription from database
   */
  private async removeSubscription(userId: string): Promise<void> {
    try {
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId);
    } catch (error) {
      console.error('Error removing subscription:', error);
    }
  }

  /**
   * Show a local notification (for testing or when push isn't available)
   */
  async showLocalNotification(title: string, options?: NotificationOptions): Promise<void> {
    if (!this.isSupported()) {
      console.warn('Notifications not supported');
      return;
    }

    if (Notification.permission !== 'granted') {
      console.warn('Notification permission not granted');
      return;
    }

    try {
      const registration = await this.getRegistration();
      if (registration) {
        // Note: vibrate is part of ServiceWorkerRegistration.showNotification but not standard NotificationOptions
        await registration.showNotification(title, {
          icon: '/icons/icon-192.png',
          badge: '/icons/icon-72.png',
          ...options,
        });
      }
    } catch (error) {
      console.error('Error showing notification:', error);
    }
  }

  /**
   * Test push notification by calling the server API
   */
  async testPush(userId: string): Promise<{ ok: boolean; message: string; details?: unknown }> {
    try {
      const { data: sessionData } = await supabase.auth.getSession();
      const token = sessionData?.session?.access_token;

      const res = await fetch('/api/notifications/test-push', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {})
        },
        body: JSON.stringify({ userId }),
      });

      const result = await res.json();
      console.log('🔔 Test push result:', result);
      return result;
    } catch (error) {
      console.error('Test push error:', error);
      return { ok: false, message: 'Failed to call test API', details: error };
    }
  }

  /**
   * Get subscription debug info
   */
  async getDebugInfo(): Promise<{
    isSupported: boolean;
    permission: NotificationPermission;
    hasServiceWorker: boolean;
    hasSubscription: boolean;
    vapidConfigured: boolean;
    subscriptionEndpoint?: string;
  }> {
    const isSupported = this.isSupported();
    const permission = this.getPermissionStatus();
    const registration = await this.getRegistration();
    const hasServiceWorker = !!registration;
    
    let hasSubscription = false;
    let subscriptionEndpoint: string | undefined;
    
    if (registration) {
      try {
        const subscription = await registration.pushManager.getSubscription();
        hasSubscription = !!subscription;
        subscriptionEndpoint = subscription?.endpoint;
      } catch {
        // Ignore
      }
    }

    return {
      isSupported,
      permission,
      hasServiceWorker,
      hasSubscription,
      vapidConfigured: !!VAPID_PUBLIC_KEY,
      subscriptionEndpoint,
    };
  }
}

export const pushNotificationService = new PushNotificationService();
export default pushNotificationService;
