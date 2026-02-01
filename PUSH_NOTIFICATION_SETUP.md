# Push Notification Setup Guide

This guide explains how to set up push notifications for the Class Dues Tracker app.

## Overview

Push notifications allow users to receive alerts when:
- Payments are **approved** ✅
- Payments are **rejected** ❌  
- Payments are **waived** 🎁
- New payments submitted (for **admins**) 💰

Notifications work even when the app is **closed** or in the background!

## Quick Debug Checklist

If push notifications aren't working, check:

1. **VAPID keys configured** in Vercel environment variables
2. **push_subscriptions table exists** in Supabase (run SQL migration)
3. **User has enabled notifications** in app settings
4. **Browser supports push** (Chrome, Firefox, Edge - NOT Safari on iOS < 16.4)

### Debug Endpoints

After deploying, visit these URLs to diagnose issues:

- `https://your-app.vercel.app/api/notifications/debug-push` - Check configuration
- Use the "Test" button in Settings → Push Notifications

---

## Prerequisites

1. HTTPS domain (required for Web Push API)
2. Service Worker (already configured via Vite PWA plugin)
3. VAPID keys for authentication

---

## Step 1: Generate VAPID Keys

VAPID (Voluntary Application Server Identification) keys are required to authenticate your push notifications.

```bash
# Install web-push globally
npm install -g web-push

# Generate VAPID keys
web-push generate-vapid-keys
```

This will output something like:
```
=======================================
Public Key:
BNxxx...your-public-key...xxx

Private Key:
Xxxxx...your-private-key...xxx
=======================================
```

**Keep your Private Key SECRET!** Never expose it in client-side code.

---

## Step 2: Configure Environment Variables

Add these to your `.env` or hosting platform (Vercel/Netlify):

### Client-side (safe to expose):
```env
VITE_VAPID_PUBLIC_KEY=BNxxx...your-public-key...xxx
```

### Server-side ONLY (keep secret):
```env
VAPID_PRIVATE_KEY=Xxxxx...your-private-key...xxx
VAPID_PUBLIC_KEY=BNxxx...your-public-key...xxx
VAPID_EMAIL=mailto:admin@yourschool.edu
```

### 🚀 Vercel Configuration (IMPORTANT!)

1. Go to your Vercel project dashboard
2. Click **Settings** → **Environment Variables**
3. Add ALL of these variables:

| Name | Value | Environment |
|------|-------|-------------|
| `VITE_VAPID_PUBLIC_KEY` | Your public key | Production, Preview |
| `VAPID_PUBLIC_KEY` | Your public key (same) | Production, Preview |
| `VAPID_PRIVATE_KEY` | Your private key | Production, Preview |
| `VAPID_EMAIL` | mailto:your@email.com | Production, Preview |
| `SUPABASE_SERVICE_ROLE_KEY` | From Supabase settings | Production, Preview |

4. Click **Save** and **Redeploy** for changes to take effect

---

## Step 3: Set Up Database Table

Run this SQL in your Supabase SQL Editor:

```sql
-- See supabase/push_subscriptions.sql for full schema
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES students(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT push_subscriptions_user_unique UNIQUE (user_id)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Add appropriate RLS policies (see supabase/push_subscriptions.sql)
```

---

## Step 4: Install Dependencies (Server)

For your serverless functions:

```bash
npm install web-push
```

---

## Step 5: Sending Push Notifications

When a payment status changes, call the push notification API:

```typescript
// In your admin review logic:
await fetch('/api/notifications/send-push', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    userId: studentId,
    title: 'Payment Approved ✅',
    body: 'Your payment of ₦5,000 for Class Dues has been approved!',
    url: '/payments',
    tag: 'payment-approved',
  }),
});
```

---

## Testing Push Notifications

### 1. Enable in Browser

Open the app and look for the push notification prompt. Click "Enable Notifications".

### 2. Check Permission

```javascript
// In browser console:
Notification.permission // Should be 'granted'
```

### 3. Test Local Notification

```javascript
// In browser console:
new Notification('Test', { body: 'Push notifications work!' });
```

### 4. Verify Subscription

Check your Supabase table:
```sql
SELECT * FROM push_subscriptions;
```

---

## Troubleshooting

### "Notifications not supported"
- Use a modern browser (Chrome, Firefox, Edge, Safari 16.4+)
- Must be on HTTPS (or localhost for development)

### "Permission denied"
- User blocked notifications
- Guide them to browser settings to re-enable

### Notifications not received
1. Check VAPID keys are correct
2. Verify subscription exists in database
3. Check server logs for push errors
4. Subscription may have expired - user needs to re-subscribe

### iOS Safari
- Push notifications on iOS Safari require iOS 16.4+
- User must add the app to Home Screen (PWA mode)
- Some limitations compared to Android/desktop

---

## Best Practices

1. **Don't spam** - Only send important notifications
2. **Respect user choice** - Let users disable anytime
3. **Test thoroughly** - Test on multiple browsers/devices
4. **Handle failures** - Remove invalid subscriptions
5. **Provide value** - Each notification should be actionable

---

## Architecture Diagram

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Browser/PWA   │────▶│  Push Service   │────▶│   Service Worker│
│                 │     │ (FCM, Mozilla)  │     │   (in app)      │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                                              │
        │ Subscribe                                    │ Show
        ▼                                              ▼
┌─────────────────┐                            ┌─────────────────┐
│   Supabase DB   │◀───────────────────────────│  User Device    │
│ (subscriptions) │     Your Backend sends     └─────────────────┘
└─────────────────┘     push via web-push
```

---

## Security Considerations

1. **Private Key**: Never expose VAPID private key in client code
2. **RLS**: Push subscriptions table has Row Level Security
3. **Service Role**: Only backend can access all subscriptions
4. **HTTPS**: Push API requires secure contexts

---

## Resources

- [Web Push Protocol](https://web.dev/push-notifications-overview/)
- [web-push NPM package](https://www.npmjs.com/package/web-push)
- [VAPID RFC](https://tools.ietf.org/html/draft-ietf-webpush-vapid)
- [PWA Push Notifications](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Re-engageable_Notifications_Push)
