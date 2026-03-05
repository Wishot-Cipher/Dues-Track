/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Send Push Notification API
 *
 * Sends push notifications to users via the Web Push API.
 * Called from backend or frontend after payment status changes.
 *
 * SECURITY: Verifies the caller is a real, active member.
 *           Verifies the target user is in the SAME organization.
 *           Prevents cross-org push notification injection.
 */

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { verifyMember } from '../_lib/auth';

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
    const { userId: targetUserId, title, body, url, tag, data } = req.body;

    if (!callerId || !title || !body) {
      return res.status(400).json({ error: 'Missing required fields: callerId, title, body' });
    }

    // ── Verify the caller is a real, active member ──
    const auth = await verifyMember(supabase, callerId);
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' });
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
