/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Send Push Notification API
 *
 * Sends push notifications to users via the Web Push API.
 * Called from backend or frontend after payment status changes.
 *
 * Supports a "test" mode: when `test: true` is passed in the body,
 * sends a fixed test notification to the caller's own subscription.
 *
 * SECURITY: Verifies the caller is a real, active member.
 *           Verifies the target user is in the SAME organization.
 *           Prevents cross-org push notification injection.
 */

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { verifyMember } from '../_lib/auth.js';

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
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(200).json({ ok: true, message: 'Push notifications not configured', sent: 0 });
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    // Support both "callerId" and legacy fallback (userId = callerId)
    const callerId = req.body?.callerId || req.body?.userId;
    const { userId: targetUserId, title, body, url, tag, data, test } = req.body;

    if (!callerId) {
      return res.status(400).json({ error: 'Missing callerId' });
    }

    // ── Verify the caller is a real, active member ──
    const auth = await verifyMember(supabase, callerId);
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' });
    }

    // ── TEST MODE: send a fixed test push to the caller's own subscription ──
    if (test) {
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

      const testPayload = JSON.stringify({
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
          testPayload,
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
    }

    // ── NORMAL MODE ──
    if (!title || !body) {
      return res.status(400).json({ error: 'Missing required fields: title, body' });
    }

    const callerOrgId = auth.data.organization_id;

    // Determine target: if no separate targetUserId, push to self
    const finalTargetId = targetUserId || callerId;

    // ── Verify target is in the same organization ──
    if (finalTargetId !== callerId) {
      const { data: target } = await supabase
        .from('organization_members')
        .select('organization_id')
        .eq('id', finalTargetId)
        .single();

      if (!target || target.organization_id !== callerOrgId) {
        return res.status(403).json({ error: 'Target user not in your organization' });
      }
    }

    // Get target's push subscription
    const { data: subscription, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', finalTargetId)
      .single();

    if (subError || !subscription) {
      return res.status(200).json({ ok: true, message: 'No subscription found', sent: 0 });
    }

    const pushSubscription = {
      endpoint: subscription.endpoint,
      keys: {
        p256dh: subscription.p256dh,
        auth: subscription.auth,
      },
    };

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

    try {
      const result = await webpush.sendNotification(pushSubscription as never, payload, {
        TTL: 86400,
        urgency: 'normal'
      });

      if (result.statusCode >= 200 && result.statusCode < 300) {
        return res.status(200).json({ ok: true, sent: 1 });
      }
      return res.status(200).json({ ok: true, sent: 0, message: 'Push delivery uncertain' });
    } catch (pushErr: any) {
      // Subscription expired — remove it
      if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
        await supabase
          .from('push_subscriptions')
          .delete()
          .eq('user_id', finalTargetId);
      }
      return res.status(200).json({ ok: true, sent: 0, message: 'Push failed' });
    }
  } catch (error) {
    console.error('Push notification error:', error);
    return res.status(500).json({ error: 'Failed to send push notification' });
  }
}
