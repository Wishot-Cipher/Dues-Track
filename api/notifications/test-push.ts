/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test Push Notification API
 * 
 * This endpoint sends a test push notification to verify the setup works.
 * Call this from browser console to test: 
 * 
 * fetch('/api/notifications/test-push', {
 *   method: 'POST',
 *   headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + yourToken },
 *   body: JSON.stringify({ userId: 'your-user-id' })
 * }).then(r => r.json()).then(console.log)
 */

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

export default async function handler(req: any, res: any) {
  // Only allow POST
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Log configuration status
  console.log('🔔 Test Push - Configuration check:');
  console.log('  - Supabase URL:', supabaseUrl ? '✅ Set' : '❌ Missing');
  console.log('  - Service Role:', serviceRole ? '✅ Set' : '❌ Missing');
  console.log('  - VAPID Public:', vapidPublicKey ? '✅ Set' : '❌ Missing');
  console.log('  - VAPID Private:', vapidPrivateKey ? '✅ Set' : '❌ Missing');
  console.log('  - VAPID Email:', vapidEmail);

  // Check configuration
  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ 
      error: 'Server configuration error',
      details: {
        supabaseUrl: !!supabaseUrl,
        serviceRole: !!serviceRole
      }
    });
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(200).json({ 
      ok: false, 
      message: 'VAPID keys not configured',
      details: {
        vapidPublicKey: !!vapidPublicKey,
        vapidPrivateKey: !!vapidPrivateKey
      }
    });
  }

  // Configure VAPID
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({ error: 'Missing userId' });
    }

    // Get user's push subscription
    const { data: subscription, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', userId)
      .single();

    console.log('🔔 Subscription lookup:', { userId, found: !!subscription, error: subError?.message });

    if (subError) {
      return res.status(200).json({ 
        ok: false, 
        message: 'Error fetching subscription',
        error: subError.message,
        hint: 'The push_subscriptions table may not exist. Run the SQL from supabase/push_subscriptions.sql'
      });
    }

    if (!subscription) {
      return res.status(200).json({ 
        ok: false, 
        message: 'No subscription found for user',
        hint: 'User needs to enable push notifications in the app first'
      });
    }

    // Construct notification payload
    const payload = JSON.stringify({
      title: '🔔 Test Notification',
      body: 'Push notifications are working! You will receive alerts here.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      url: '/',
      tag: 'test',
      timestamp: Date.now(),
    });

    // Send the push notification
    try {
      const result = await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: {
            p256dh: subscription.p256dh,
            auth: subscription.auth
          }
        } as never,
        payload,
        { TTL: 60, urgency: 'high' }
      );

      console.log('✅ Test push sent, status:', result.statusCode);
      
      return res.status(200).json({ 
        ok: true, 
        message: 'Test notification sent!',
        statusCode: result.statusCode
      });
    } catch (pushError: any) {
      console.error('❌ Push send error:', pushError);

      // Check for expired subscription
      if (pushError.statusCode === 410 || pushError.statusCode === 404) {
        // Remove invalid subscription
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', userId);

        return res.status(200).json({ 
          ok: false, 
          message: 'Subscription expired or invalid - removed from database',
          hint: 'User needs to re-enable push notifications',
          statusCode: pushError.statusCode
        });
      }

      return res.status(200).json({ 
        ok: false, 
        message: 'Failed to send push',
        error: pushError.message,
        statusCode: pushError.statusCode,
        body: pushError.body
      });
    }
  } catch (error: any) {
    console.error('❌ Test push error:', error);
    return res.status(500).json({ 
      error: 'Failed to send test notification',
      details: error.message
    });
  }
}
