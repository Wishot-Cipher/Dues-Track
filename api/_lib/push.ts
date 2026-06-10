/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Server-side push fan-out.
 *
 * Lets API endpoints that create notifications SERVER-SIDE (payment
 * confirmations, approver alerts, free-ticket grants, …) also push to
 * the recipient's device(s) — so those notifications reach a closed
 * phone, not just the in-app bell. Client-created notifications already
 * push via /api/notifications (send-push); this is the server twin.
 *
 * Best-effort: never throws, never blocks the caller. Sends to every
 * subscription the member has (multi-device) and prunes dead ones.
 */
import webpush from 'web-push';

const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com';

let vapidReady = false;
function ensureVapid(): boolean {
  if (vapidReady) return true;
  if (vapidPublicKey && vapidPrivateKey) {
    webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);
    vapidReady = true;
  }
  return vapidReady;
}

export interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/**
 * Push to all of a member's devices. Returns how many were delivered.
 * Swallows every error — a push miss must never fail the action that
 * created the notification.
 */
export async function sendPushToUser(
  supabase: any,
  userId: string | null | undefined,
  payload: PushPayload,
): Promise<number> {
  try {
    if (!userId || !ensureVapid()) return 0;

    const { data: subs } = await supabase
      .from('push_subscriptions')
      .select('endpoint, p256dh, auth')
      .eq('user_id', userId);
    if (!subs || subs.length === 0) return 0;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-72.png',
      url: payload.url || '/notifications',
      tag: payload.tag || 'general',
      timestamp: Date.now(),
      data: payload.data || {},
    });

    let sent = 0;
    for (const s of subs as Array<{ endpoint: string; p256dh: string; auth: string }>) {
      try {
        const res = await webpush.sendNotification(
          { endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } } as never,
          body,
          { TTL: 86400, urgency: 'normal' },
        );
        if (res.statusCode >= 200 && res.statusCode < 300) sent++;
      } catch (err: any) {
        // Expired/gone subscription → prune it so we stop retrying.
        if (err?.statusCode === 410 || err?.statusCode === 404) {
          await supabase.from('push_subscriptions').delete().eq('endpoint', s.endpoint);
        }
      }
    }
    return sent;
  } catch {
    return 0;
  }
}
