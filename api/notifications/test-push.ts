/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Test Push Notification API
 *
 * Sends a test push notification to verify the setup works.
 *
 * SECURITY: Verifies the caller is a real, active member.
 *           Only sends test push to the caller's own subscription (no cross-user targeting).
 */

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { verifyMember } from '../_lib/auth';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(200).json({ ok: false, message: 'VAPID keys not configured' });
  }

  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    const callerId = req.body?.callerId || req.body?.userId;

    if (!callerId) {
      return res.status(400).json({ error: 'Missing callerId' });
    }

    // ── Verify the caller is a real, active member ──
    const auth = await verifyMember(supabase, callerId);
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' });
    }

    // Only test push to the caller's own subscription
    const { data: subscription, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', callerId)
      .single();

    if (subError || !subscription) {
      return res.status(200).json({
        ok: false,
        message: 'No subscription found — enable push notifications first',
      });
    }

    const payload = JSON.stringify({
      title: '🔔 Test Notification',
      body: 'Push notifications are working! You will receive alerts here.',
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      url: '/',
      tag: 'test',
      timestamp: Date.now(),
    });

    try {
      const result = await webpush.sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        } as never,
        payload,
        { TTL: 60, urgency: 'high' }
      );

      return res.status(200).json({ ok: true, message: 'Test notification sent!', statusCode: result.statusCode });
    } catch (pushError: any) {
      if (pushError.statusCode === 410 || pushError.statusCode === 404) {
        await supabase.from('push_subscriptions').delete().eq('user_id', callerId);
        return res.status(200).json({ ok: false, message: 'Subscription expired — removed' });
      }
      return res.status(200).json({ ok: false, message: 'Failed to send push' });
    }
  } catch (error: any) {
    console.error('Test push error:', error);
    return res.status(500).json({ error: 'Failed to send test notification' });
  }
}
