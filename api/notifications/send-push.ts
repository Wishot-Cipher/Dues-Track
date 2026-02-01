/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Send Push Notification API
 * 
 * This endpoint sends push notifications to users via the Web Push API.
 * Called from backend after payment status changes.
 * 
 * Required Environment Variables:
 * - SUPABASE_URL
 * - SUPABASE_SERVICE_ROLE_KEY
 * - VAPID_PUBLIC_KEY
 * - VAPID_PRIVATE_KEY
 * - VAPID_EMAIL (your email for VAPID identification)
 */

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

// Configure VAPID details
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

export default async function handler(req: any, res: any) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Check configuration
  if (!supabaseUrl || !serviceRole) {
    console.error('Missing Supabase credentials');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    console.warn('VAPID keys not configured - push notifications disabled');
    return res.status(200).json({ ok: true, message: 'Push notifications not configured', sent: 0 });
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    const { userId, title, body, url, tag, data } = req.body;

    if (!userId || !title || !body) {
      return res.status(400).json({ error: 'Missing required fields: userId, title, body' });
    }

    // Get user's push subscription
    const { data: subscription, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (subError || !subscription) {
      console.log('No push subscription found for user:', userId);
      return res.status(200).json({ ok: true, message: 'No subscription found', sent: 0 });
    }

    // Construct the push subscription object
    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

    // Construct notification payload
    const payload = JSON.stringify({
      title,
      body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      url: url || '/',
      tag: tag || 'default',
      timestamp: Date.now(),
      data: data || {},
    });

    // For a real implementation, you would use the web-push library here:
    // 
    // import webpush from 'web-push';
    // 
    // webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
    // 
    // await webpush.sendNotification(pushSubscription, payload);
    //
    // Since web-push requires Node.js crypto, for Vercel Edge functions,
    // you may need alternative approaches or use a different runtime.

    // For now, we'll use the Web Push library
    const sent = await sendWebPush(pushSubscription, payload);

    if (sent) {
      console.log('✅ Push notification sent to:', userId);
      return res.status(200).json({ ok: true, sent: 1 });
    } else {
      // If push fails, the subscription might be invalid - consider removing it
      console.log('❌ Failed to send push to:', userId);
      
      // Remove invalid subscription
      await supabase
        .from('push_subscriptions')
        .delete()
        .eq('user_id', userId);
        
      return res.status(200).json({ ok: true, sent: 0, message: 'Push failed, subscription removed' });
    }
  } catch (error) {
    console.error('Push notification error:', error);
    return res.status(500).json({ error: 'Failed to send push notification' });
  }
}

/**
 * Send a Web Push notification using the web-push library
 */
async function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string
): Promise<boolean> {
  try {
    // Send the push notification - web-push accepts a simple object with endpoint and keys
    const result = await webpush.sendNotification(subscription as never, payload, {
      TTL: 86400, // 24 hours
      urgency: 'normal'
    });
    
    console.log('Push notification sent, status:', result.statusCode);
    return result.statusCode >= 200 && result.statusCode < 300;
  } catch (error: any) {
    console.error('Web Push send error:', error);
    
    // Check for specific error codes
    if (error.statusCode === 410 || error.statusCode === 404) {
      // Subscription expired or invalid
      console.log('Subscription expired or invalid');
    }
    
    return false;
  }
}
