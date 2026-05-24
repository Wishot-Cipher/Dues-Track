/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/notifications
 *
 * Consolidated notifications endpoint. Vercel Hobby caps us at 12
 * serverless functions, so the previous three files
 * (api/notifications/mark-read.ts, save-subscription.ts, send-push.ts)
 * are merged here behind an `action` body param.
 *
 * Body shape:
 *   { action: 'mark-read'        | 'save-subscription' | 'send-push',
 *     callerId: string,
 *     ...action-specific fields }
 *
 * SECURITY: every action calls verifyMember() first, so we always
 * know who the caller actually is (their callerId is verified against
 * organization_members; not trusted as-is).
 *
 * The three sub-handlers preserve the same input/output contract as
 * the legacy files so the migration is drop-in on the client side
 * (services just point at /api/notifications with `action` added).
 */

import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';
import { verifyMember, setCorsHeaders } from './_lib/auth.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const vapidPublicKey  = process.env.VAPID_PUBLIC_KEY  || process.env.VITE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail      = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
}

type Action = 'mark-read' | 'save-subscription' | 'send-push';

export default async function handler(req: any, res: any) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' });

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const action = (req.body?.action as Action) || '';
  if (!action) return res.status(400).json({ error: 'Missing `action`' });

  const supabase = createClient(supabaseUrl, serviceRole);

  // Universal auth gate
  const callerId = req.body?.callerId || req.body?.userId;
  if (!callerId) return res.status(400).json({ error: 'Missing callerId' });

  const auth = await verifyMember(supabase, callerId);
  if (!auth.valid || !auth.data) {
    return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' });
  }

  try {
    switch (action) {
      case 'mark-read':         return await handleMarkRead(supabase, auth.data, req, res);
      case 'save-subscription': return await handleSaveSubscription(supabase, auth.data, req, res);
      case 'send-push':         return await handleSendPush(supabase, auth.data, req, res);
      default:
        return res.status(400).json({ error: `Unknown action: ${action}` });
    }
  } catch (err) {
    console.error(`[notifications/${action}]`, err);
    return res.status(500).json({ error: (err as Error).message || 'Internal error' });
  }
}

// ── mark-read ────────────────────────────────────────────────────
// Marks a single notification (when notificationId is given) or all
// unread notifications for the verified member as read.
async function handleMarkRead(supabase: any, member: any, req: any, res: any) {
  const memberId = member.id;
  const orgId    = member.organization_id;
  const notificationId = req.body?.notificationId;

  let query = supabase
    .from('notifications')
    .update({ is_read: true, read_at: new Date().toISOString() });

  if (notificationId) {
    query = query
      .eq('id', notificationId)
      .eq('member_id', memberId)
      .or(`organization_id.eq.${orgId},organization_id.is.null`);
  } else {
    query = query
      .eq('member_id', memberId)
      .or(`organization_id.eq.${orgId},organization_id.is.null`)
      .eq('is_read', false);
  }

  const { error } = await query;
  if (error) return res.status(500).json({ error: error.message || 'Failed to mark read' });
  return res.status(200).json({ ok: true });
}

// ── save-subscription ────────────────────────────────────────────
// Upserts a Web Push subscription for the verified member.
async function handleSaveSubscription(supabase: any, member: any, req: any, res: any) {
  const { endpoint, p256dh, auth: authKey } = req.body || {};
  if (!endpoint || !p256dh || !authKey) {
    return res.status(400).json({
      error: 'Missing required fields',
      required: ['endpoint', 'p256dh', 'auth'],
    });
  }

  const { data, error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: member.id,
      endpoint,
      p256dh,
      auth: authKey,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'user_id' })
    .select();

  if (error) return res.status(500).json({ error: 'Failed to save subscription' });
  return res.status(200).json({ ok: true, message: 'Subscription saved', data });
}

// ── send-push ────────────────────────────────────────────────────
// Sends a push notification. `test:true` sends a fixed test push to
// the caller's own subscription. Otherwise the caller can target a
// member in the SAME organization (cross-org targets are rejected).
async function handleSendPush(supabase: any, member: any, req: any, res: any) {
  if (!vapidPublicKey || !vapidPrivateKey) {
    return res.status(200).json({ ok: true, message: 'Push notifications not configured', sent: 0 });
  }

  const callerId  = member.id;
  const orgId     = member.organization_id;
  const { userId: targetUserId, title, body, url, tag, data, test } = req.body;

  // ── TEST MODE ──
  if (test) {
    const { data: subscription, error: subError } = await supabase
      .from('push_subscriptions')
      .select('*')
      .eq('user_id', callerId)
      .single();

    if (subError || !subscription) {
      return res.status(200).json({ ok: false, message: 'No subscription found — enable push notifications first' });
    }

    const testPayload = JSON.stringify({
      title: '🔔 Test Notification',
      body:  'Push notifications are working! You will receive alerts here.',
      icon:  '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      url:   '/',
      tag:   'test',
      timestamp: Date.now(),
    });

    try {
      const result = await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } } as never,
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

  const finalTargetId = targetUserId || callerId;

  // Cross-org guard
  if (finalTargetId !== callerId) {
    const { data: target } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('id', finalTargetId)
      .single();
    if (!target || target.organization_id !== orgId) {
      return res.status(403).json({ error: 'Target user not in your organization' });
    }
  }

  const { data: subscription, error: subError } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', finalTargetId)
    .single();

  if (subError || !subscription) {
    return res.status(200).json({ ok: true, message: 'No subscription found', sent: 0 });
  }

  const payload = JSON.stringify({
    title,
    body,
    icon:  '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    url:   url || '/',
    tag:   tag || 'default',
    timestamp: Date.now(),
    data:  data || {},
  });

  try {
    const result = await webpush.sendNotification(
      { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } } as never,
      payload,
      { TTL: 86400, urgency: 'normal' }
    );
    if (result.statusCode >= 200 && result.statusCode < 300) {
      return res.status(200).json({ ok: true, sent: 1 });
    }
    return res.status(200).json({ ok: true, sent: 0, message: 'Push delivery uncertain' });
  } catch (pushErr: any) {
    if (pushErr.statusCode === 410 || pushErr.statusCode === 404) {
      await supabase.from('push_subscriptions').delete().eq('user_id', finalTargetId);
    }
    return res.status(200).json({ ok: true, sent: 0, message: 'Push failed' });
  }
}
