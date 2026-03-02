# Complete Guide: Building Push Notifications from Scratch

> **A comprehensive learning guide based on real-world implementation experience**

This document captures everything we learned while building push notifications for the Class Dues Tracker app. It includes the challenges we faced, the mistakes we made, and how we solved them. This is written for learning purposes - to help you build similar features in your own projects.

---

## Table of Contents

1. [What Are Push Notifications?](#1-what-are-push-notifications)
2. [The Big Picture: How It All Works](#2-the-big-picture-how-it-all-works)
3. [The Architecture We Built](#3-the-architecture-we-built)
4. [Step-by-Step Implementation](#4-step-by-step-implementation)
5. [The Challenges We Faced & How We Solved Them](#5-the-challenges-we-faced--how-we-solved-them)
6. [Complete Code Examples](#6-complete-code-examples)
7. [Debugging Guide](#7-debugging-guide)
8. [Lessons Learned](#8-lessons-learned)
9. [Quick Reference Checklist](#9-quick-reference-checklist)

---

## 1. What Are Push Notifications?

### The Simple Explanation

Push notifications are messages that pop up on your phone or computer even when you're not using the app. Think of WhatsApp messages - you get notified even when WhatsApp is closed.

There are **two types** of notifications in web apps:

| Type | When It Works | How It Works |
|------|---------------|--------------|
| **In-App Notifications** | Only when app is open | Browser shows a notification using JavaScript |
| **Push Notifications** | Even when app is closed | A server sends a message to your device through browser's push service |

### Why Push Notifications Are Harder

In-app notifications are simple:
```javascript
// This only works if the user has the app open
new Notification("Hello!", { body: "You have a new message" });
```

Push notifications require:
1. A **Service Worker** (background script that runs even when app is closed)
2. **VAPID Keys** (like passwords that prove your server is allowed to send notifications)
3. A **Push Subscription** (the user's unique address where notifications are sent)
4. A **Backend Server** (to actually send the push when something happens)

---

## 2. The Big Picture: How It All Works

### The Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           PUSH NOTIFICATION FLOW                             │
└─────────────────────────────────────────────────────────────────────────────┘

STEP 1: User Enables Notifications (One-time setup)
┌──────────────┐    "Can I send you notifications?"     ┌──────────────┐
│   Your App   │ ─────────────────────────────────────> │    User      │
│  (Browser)   │ <───────────────────────────────────── │   (Human)    │
└──────────────┘         "Yes, I allow it"              └──────────────┘
       │
       │ Creates a "Push Subscription" (unique address for this user)
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  Push Subscription = { endpoint: "https://fcm.google.com/abc123...",         │
│                        keys: { p256dh: "...", auth: "..." } }                │
└──────────────────────────────────────────────────────────────────────────────┘
       │
       │ Save subscription to database
       ▼
┌──────────────┐                                        ┌──────────────┐
│   Your API   │ ─────────────────────────────────────> │   Database   │
│   Server     │        INSERT INTO push_subscriptions  │  (Supabase)  │
└──────────────┘                                        └──────────────┘


STEP 2: Something Happens (e.g., payment approved)
┌──────────────┐    "Hey, approve this payment"         ┌──────────────┐
│    Admin     │ ─────────────────────────────────────> │   Your App   │
│   (Human)    │                                        │   (Browser)  │
└──────────────┘                                        └──────────────┘
       │
       │ App updates database and calls API
       ▼
┌──────────────┐                                        ┌──────────────┐
│   Your App   │ ─────────────────────────────────────> │  Your API    │
│  (Browser)   │    POST /api/notifications/send-push   │   Server     │
└──────────────┘                                        └──────────────┘


STEP 3: Server Sends Push Notification
┌──────────────┐    Get subscription from database      ┌──────────────┐
│  Your API    │ ─────────────────────────────────────> │   Database   │
│   Server     │ <───────────────────────────────────── │  (Supabase)  │
└──────────────┘                                        └──────────────┘
       │
       │ Send notification using VAPID keys
       ▼
┌──────────────┐    "Send this to user abc123"          ┌──────────────┐
│  Your API    │ ─────────────────────────────────────> │   Browser's  │
│   Server     │        (using web-push library)        │ Push Service │
└──────────────┘                                        │ (Google/Mozilla)
                                                        └──────────────┘
       │
       │ Push service wakes up user's browser
       ▼
┌──────────────┐    "You have a notification!"          ┌──────────────┐
│   Browser's  │ ─────────────────────────────────────> │   User's     │
│ Push Service │                                        │  Service     │
└──────────────┘                                        │   Worker     │
                                                        └──────────────┘
       │
       │ Service Worker shows the notification
       ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│  🔔 Payment Approved!                                                        │
│  Your payment of ₦5,000 has been approved.                                   │
└──────────────────────────────────────────────────────────────────────────────┘
```

### Key Concepts Explained

**Service Worker**: A JavaScript file that runs in the background, separate from your app. It can receive push messages even when your app is closed.

**VAPID Keys**: "Voluntary Application Server Identification" - a pair of keys (public + private) that identify your server. Think of it like a username and password for your push service.

**Push Subscription**: A unique "address" that identifies a specific user's browser on a specific device. It includes:
- `endpoint`: URL where to send the push (provided by Chrome/Firefox/etc.)
- `keys`: Encryption keys so only the intended recipient can read the message

**web-push Library**: A Node.js library that handles all the complex encryption and sending of push notifications.

---

## 3. The Architecture We Built

### Files and Their Purposes

```
Class-dues-tracker/
├── src/
│   ├── services/
│   │   ├── pushNotificationService.ts   # Client-side: subscribe/unsubscribe
│   │   └── notificationService.ts        # Client-side: send notification requests
│   ├── components/
│   │   └── PushNotificationPrompt.tsx    # UI: Enable/disable button
│   └── sw.ts                             # Service Worker: receives push messages
├── api/
│   └── notifications/
│       ├── save-subscription.ts          # API: Save subscription to database
│       ├── send-push.ts                  # API: Send push to a single user
│       ├── test-push.ts                  # API: Test if push works
│       └── debug-push.ts                 # API: Check configuration status
└── supabase/
    └── COMPLETE_PUSH_FIX.sql             # Database: push_subscriptions table
```

### The Database Table

```sql
CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY,
  user_id UUID NOT NULL,              -- Which user this subscription belongs to
  endpoint TEXT NOT NULL,             -- Where to send the push (Chrome/Firefox URL)
  p256dh TEXT NOT NULL,               -- Encryption key (part 1)
  auth TEXT NOT NULL,                 -- Encryption key (part 2)
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ,
  
  CONSTRAINT push_subscriptions_user_unique UNIQUE (user_id)
);
```

---

## 4. Step-by-Step Implementation

### Step 1: Generate VAPID Keys

First, you need to generate your unique keys. Run this command once:

```bash
npx web-push generate-vapid-keys
```

You'll get output like:
```
Public Key:  BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkrxZJjSgSnfckjBJuBkr3qBUYIHBQFLXYp5Nksh8U
Private Key: UUxI4O8-FbRouADVXc-hJpnlVZmxxLrxYzjJdFdjN8Y
```

**Save these somewhere safe!** You'll need them in your environment variables.

### Step 2: Set Up Environment Variables

Add these to your Vercel project (Settings → Environment Variables):

```
VITE_VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa...  (your public key)
VAPID_PUBLIC_KEY=BEl62iUYgUivxIkv69yViEuiBIa...      (same public key, for server)
VAPID_PRIVATE_KEY=UUxI4O8-FbRouADVXc...              (your private key - SECRET!)
VAPID_EMAIL=mailto:your-email@example.com            (your contact email)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key      (from Supabase dashboard)
```

### Step 3: Create the Database Table

Run this SQL in Supabase Dashboard → SQL Editor:

```sql
-- Create the table
CREATE TABLE push_subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT push_subscriptions_user_unique UNIQUE (user_id)
);

-- Enable Row Level Security
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users and service role to access
CREATE POLICY "Allow all for authenticated" ON push_subscriptions
  FOR ALL TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Service role full access" ON push_subscriptions
  FOR ALL TO service_role
  USING (true)
  WITH CHECK (true);
```

### Step 4: Create the Service Worker

The service worker runs in the background and receives push messages:

```typescript
// src/sw.ts
/// <reference lib="webworker" />
declare const self: ServiceWorkerGlobalScope;

// Listen for push messages
self.addEventListener('push', (event) => {
  console.log('🔔 Push received!', event);
  
  // Get the notification data
  const data = event.data?.json() || {};
  
  const title = data.title || 'New Notification';
  const options = {
    body: data.body || 'You have a new notification',
    icon: '/icons/icon-192.png',
    badge: '/icons/icon-72.png',
    tag: data.tag || 'default',
    data: { url: data.url || '/' }
  };
  
  // Show the notification
  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// When user clicks the notification
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  
  // Open the app to the relevant page
  const url = event.notification.data?.url || '/';
  event.waitUntil(
    clients.openWindow(url)
  );
});
```

### Step 5: Create the Push Notification Service (Client-Side)

This service handles subscribing and unsubscribing:

```typescript
// src/services/pushNotificationService.ts

// Your VAPID public key from environment
const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

class PushNotificationService {
  // Check if push is supported in this browser
  isSupported(): boolean {
    return 'serviceWorker' in navigator && 
           'PushManager' in window && 
           'Notification' in window;
  }

  // Request permission from user
  async requestPermission(): Promise<NotificationPermission> {
    const permission = await Notification.requestPermission();
    console.log('Permission:', permission); // 'granted', 'denied', or 'default'
    return permission;
  }

  // Subscribe to push notifications
  async subscribe(userId: string): Promise<boolean> {
    // 1. Check if supported
    if (!this.isSupported()) {
      console.log('Push not supported');
      return false;
    }

    // 2. Request permission
    const permission = await this.requestPermission();
    if (permission !== 'granted') {
      console.log('Permission denied');
      return false;
    }

    // 3. Get service worker registration
    const registration = await navigator.serviceWorker.ready;

    // 4. Create push subscription
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,  // Browser requires this
      applicationServerKey: this.urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
    });

    // 5. Save subscription to database via API
    const saved = await this.saveSubscription(userId, subscription);
    
    return saved;
  }

  // Save subscription to database via API (not direct Supabase)
  private async saveSubscription(userId: string, subscription: PushSubscription): Promise<boolean> {
    const subscriptionJSON = subscription.toJSON();
    
    const response = await fetch('/api/notifications/save-subscription', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        endpoint: subscription.endpoint,
        p256dh: subscriptionJSON.keys?.p256dh || '',
        auth: subscriptionJSON.keys?.auth || '',
      }),
    });

    const result = await response.json();
    return result.ok;
  }

  // Helper function to convert VAPID key format
  private urlBase64ToUint8Array(base64String: string): ArrayBuffer {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = window.atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray.buffer;
  }
}

export default new PushNotificationService();
```

### Step 6: Create the Save Subscription API

This API saves the subscription to the database:

```typescript
// api/notifications/save-subscription.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  const { userId, endpoint, p256dh, auth } = req.body;

  // Save to database (upsert = update if exists, insert if not)
  const { error } = await supabase
    .from('push_subscriptions')
    .upsert({
      user_id: userId,
      endpoint,
      p256dh,
      auth,
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'user_id',  // If user already has subscription, update it
    });

  if (error) {
    return res.status(500).json({ error: 'Failed to save' });
  }

  return res.status(200).json({ ok: true });
}
```

### Step 7: Create the Send Push API

This API actually sends the push notification:

```typescript
// api/notifications/send-push.ts
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabaseUrl = process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;
const vapidEmail = process.env.VAPID_EMAIL;

// Configure web-push with your VAPID keys
webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const supabase = createClient(supabaseUrl, serviceRole);
  const { userId, title, body, url, tag } = req.body;

  // 1. Get user's subscription from database
  const { data: subscription, error } = await supabase
    .from('push_subscriptions')
    .select('*')
    .eq('user_id', userId)
    .single();

  if (!subscription) {
    return res.status(200).json({ ok: true, sent: 0, message: 'No subscription' });
  }

  // 2. Prepare the notification payload
  const payload = JSON.stringify({
    title,
    body,
    icon: '/icons/icon-192.png',
    url: url || '/',
    tag: tag || 'default',
  });

  // 3. Send the push notification
  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: {
          p256dh: subscription.p256dh,
          auth: subscription.auth,
        },
      },
      payload,
      { TTL: 86400, urgency: 'high' }
    );

    return res.status(200).json({ ok: true, sent: 1 });
  } catch (error) {
    console.error('Push failed:', error);
    return res.status(200).json({ ok: true, sent: 0, message: 'Push failed' });
  }
}
```

### Step 8: Trigger Push Notifications When Events Happen

Now you need to call the send-push API when something happens:

```typescript
// Example: When admin approves a payment
async function handleApprovePayment(payment) {
  // 1. Update the payment status in database
  await supabase
    .from('payments')
    .update({ status: 'approved' })
    .eq('id', payment.id);

  // 2. Send push notification to the student
  await fetch('/api/notifications/send-push', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      userId: payment.student_id,
      title: 'Payment Approved ✅',
      body: `Your payment of ₦${payment.amount} has been approved!`,
      url: `/payment/${payment.id}`,
      tag: 'payment-approved',
    }),
  });
}
```

---

## 5. The Challenges We Faced & How We Solved Them

### Challenge 1: "401 Unauthorized" When Saving Subscription

**The Problem:**
When users clicked "Enable Notifications", we got this error:
```
POST https://supabase.co/rest/v1/push_subscriptions 401 (Unauthorized)
```

**Why It Happened:**
Our app uses **custom authentication** (username/password stored in our own `students` table), not Supabase Auth. When we tried to insert into `push_subscriptions` directly from the browser, Supabase didn't recognize the user as authenticated.

**The Solution:**
Instead of saving directly to Supabase from the browser, we created an API endpoint that uses the **service role key** (which bypasses authentication):

```typescript
// ❌ BEFORE: Direct Supabase call from browser (fails with 401)
const { error } = await supabase
  .from('push_subscriptions')
  .insert({ user_id: userId, ... });

// ✅ AFTER: Call API endpoint which uses service role
const response = await fetch('/api/notifications/save-subscription', {
  method: 'POST',
  body: JSON.stringify({ userId, endpoint, p256dh, auth }),
});
```

The API uses the service role key which has full access:
```typescript
// In the API
const supabase = createClient(supabaseUrl, serviceRoleKey); // Full access!
```

### Challenge 2: "No auth token available" for Notifications

**The Problem:**
When a student submitted a payment, the code tried to get a Supabase auth token:
```typescript
const { data: sessionData } = await supabase.auth.getSession();
const token = sessionData?.session?.access_token; // Always null!
```

**Why It Happened:**
Same issue - our app doesn't use Supabase Auth, so `getSession()` always returns null.

**The Solution:**
We removed the auth token requirement and instead validate by checking if the payment exists:

```typescript
// ❌ BEFORE: Required Supabase auth token
const authHeader = req.headers.authorization;
const { data: { user } } = await supabase.auth.getUser(token);

// ✅ AFTER: Validate by checking payment exists
const { data: payment } = await supabase
  .from('payments')
  .select('*')
  .eq('id', paymentId)
  .eq('student_id', studentId)
  .single();

if (!payment) {
  return res.status(403).json({ error: 'Invalid payment' });
}
```

### Challenge 3: Foreign Key Constraint Error

**The Problem:**
The `push_subscriptions` table had a foreign key to `students`:
```sql
user_id UUID REFERENCES students(id) ON DELETE CASCADE
```

But sometimes `auth.uid()` didn't match any `students.id`, causing inserts to fail.

**The Solution:**
We removed the foreign key constraint:

```sql
-- ❌ BEFORE: With foreign key (can cause issues)
user_id UUID NOT NULL REFERENCES students(id)

-- ✅ AFTER: Without foreign key (more flexible)
user_id UUID NOT NULL  -- Just stores the ID, no constraint
```

### Challenge 4: Old Code Still Running After Deployment

**The Problem:**
After pushing fixes to GitHub, the old broken code was still running.

**Why It Happened:**
- Browser cache was serving old JavaScript
- Vercel deployment wasn't complete yet

**The Solution:**
1. Wait 1-2 minutes for Vercel deployment
2. Hard refresh: `Ctrl + Shift + R`
3. Or clear site data: DevTools → Application → Storage → Clear site data

### Challenge 5: Notifications Not Received

**The Problem:**
Push notifications weren't being received even though everything seemed configured.

**Why It Happened:**
The user hadn't actually subscribed! The subscription wasn't being saved to the database.

**The Solution:**
We added a debug endpoint to check the status:

```typescript
// api/notifications/debug-push.ts
export default async function handler(req, res) {
  const { data } = await supabase
    .from('push_subscriptions')
    .select('*');
  
  return res.json({
    total_subscriptions: data?.length || 0,
    environment: {
      vapidPublicKey: !!process.env.VAPID_PUBLIC_KEY ? '✅' : '❌',
      vapidPrivateKey: !!process.env.VAPID_PRIVATE_KEY ? '✅' : '❌',
    }
  });
}
```

---

## 6. Complete Code Examples

### The Push Notification Prompt Component

```tsx
// src/components/PushNotificationPrompt.tsx
import { useState, useEffect } from 'react';
import pushNotificationService from '@/services/pushNotificationService';

export function PushNotificationPrompt() {
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Check if already subscribed
    checkSubscriptionStatus();
  }, []);

  const checkSubscriptionStatus = async () => {
    const subscribed = await pushNotificationService.isSubscribed();
    setIsSubscribed(subscribed);
  };

  const handleEnable = async () => {
    setLoading(true);
    try {
      const userId = localStorage.getItem('current_user_id');
      const success = await pushNotificationService.subscribe(userId);
      
      if (success) {
        setIsSubscribed(true);
        alert('Notifications enabled! 🔔');
      } else {
        alert('Failed to enable notifications');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async () => {
    setLoading(true);
    try {
      const userId = localStorage.getItem('current_user_id');
      await pushNotificationService.unsubscribe(userId);
      setIsSubscribed(false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-4 bg-gray-100 rounded-lg">
      <h3 className="font-bold mb-2">Push Notifications</h3>
      <p className="text-sm text-gray-600 mb-4">
        Get notified when your payments are approved or rejected.
      </p>
      
      {isSubscribed ? (
        <button
          onClick={handleDisable}
          disabled={loading}
          className="bg-red-500 text-white px-4 py-2 rounded"
        >
          {loading ? 'Disabling...' : 'Disable Notifications'}
        </button>
      ) : (
        <button
          onClick={handleEnable}
          disabled={loading}
          className="bg-blue-500 text-white px-4 py-2 rounded"
        >
          {loading ? 'Enabling...' : 'Enable Notifications'}
        </button>
      )}
    </div>
  );
}
```

### The Complete Service Worker

```typescript
// src/sw.ts
/// <reference lib="webworker" />
import { precacheAndRoute } from 'workbox-precaching';

declare const self: ServiceWorkerGlobalScope;

// Precache static assets (for PWA)
precacheAndRoute(self.__WB_MANIFEST);

// Handle push notifications
self.addEventListener('push', (event) => {
  console.log('🔔 Push event received');
  
  if (!event.data) {
    console.log('No data in push event');
    return;
  }

  try {
    const data = event.data.json();
    
    const options: NotificationOptions = {
      body: data.body || 'You have a new notification',
      icon: data.icon || '/icons/icon-192.png',
      badge: data.badge || '/icons/icon-72.png',
      tag: data.tag || `notification-${Date.now()}`,
      data: {
        url: data.url || '/',
        timestamp: data.timestamp || Date.now(),
      },
      requireInteraction: true,  // Don't auto-dismiss
      vibrate: [200, 100, 200],  // Vibration pattern
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Notification', options)
    );
  } catch (error) {
    console.error('Error showing notification:', error);
  }
});

// Handle notification click
self.addEventListener('notificationclick', (event) => {
  console.log('🔔 Notification clicked');
  
  event.notification.close();
  
  const url = event.notification.data?.url || '/';
  
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if app is already open
        for (const client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            client.navigate(url);
            return client.focus();
          }
        }
        // Open new window if app is not open
        return clients.openWindow(url);
      })
  );
});
```

---

## 7. Debugging Guide

### Step 1: Check Environment Variables

Go to `/api/notifications/debug-push` and check the response:

```json
{
  "environment": {
    "supabaseUrl": "✅ Configured",
    "serviceRole": "✅ Configured",
    "vapidPublicKey": "✅ Configured",
    "vapidPrivateKey": "✅ Configured"
  },
  "database": {
    "push_subscriptions_table": "✅ Exists",
    "total_subscriptions": 1
  }
}
```

If any show ❌, add the missing environment variable in Vercel.

### Step 2: Check Browser Console

When enabling notifications, you should see:
```
🔔 Starting push notification subscription for user: abc123
✅ VAPID public key found
🔔 Requesting notification permission...
✅ Permission granted
🔔 Getting service worker registration...
✅ Service worker registration found
🔔 Creating new push subscription...
✅ New push subscription created
🔔 Saving subscription to database...
✅ Subscription saved successfully via API
```

### Step 3: Test Push Manually

Go to Settings, enable notifications, then click "Test" button. You should receive a test notification.

### Step 4: Check Vercel Logs

Go to Vercel Dashboard → Your Project → Deployments → (Latest) → Functions → View logs

Look for:
```
📤 send-push API called
📤 Push request for user: abc123
✅ Found subscription for user: abc123
Push notification sent, status: 201
```

### Common Issues and Fixes

| Issue | Cause | Fix |
|-------|-------|-----|
| 401 Unauthorized | Using Supabase client without auth | Use API with service role |
| "No subscription found" | User hasn't enabled notifications | Enable in Settings |
| "VAPID keys not configured" | Missing environment variables | Add to Vercel |
| Old code running | Browser cache | Hard refresh (Ctrl+Shift+R) |
| Push not received | Service worker not registered | Check in DevTools → Application |

---

## 8. Lessons Learned

### 1. Custom Auth vs Supabase Auth

If your app uses custom authentication (like we do), you can't use Supabase's RLS policies that rely on `auth.uid()`. Instead:
- Create API endpoints that use the service role
- Validate requests by checking data in the database (e.g., "does this payment exist?")

### 2. Always Log Everything During Development

We added extensive logging:
```typescript
console.log('🔔 Saving push subscription for user:', userId);
console.log('📤 Push API response:', result);
console.log('✅ Subscription saved successfully');
```

This made debugging 10x easier. Remove or reduce logging in production if needed.

### 3. Create Debug Endpoints

The `/api/notifications/debug-push` endpoint saved us hours of debugging. It showed:
- Are environment variables set?
- Does the database table exist?
- How many subscriptions are there?

### 4. Browser Cache Is Your Enemy

After deploying fixes, always:
1. Wait for deployment to complete
2. Hard refresh (`Ctrl + Shift + R`)
3. Or clear site data

### 5. Push Subscriptions Are Per-Device

Each browser/device gets its own subscription. If a user enables notifications on their phone AND laptop, they'll have two subscriptions.

### 6. Subscriptions Can Expire

Browser push subscriptions can expire or become invalid. Handle this gracefully:
```typescript
try {
  await webpush.sendNotification(subscription, payload);
} catch (error) {
  if (error.statusCode === 410) {
    // Subscription expired - delete from database
    await supabase.from('push_subscriptions').delete().eq('id', subscriptionId);
  }
}
```

### 7. Test on Real Devices

Push notifications behave differently on:
- Desktop Chrome
- Mobile Chrome (Android)
- Safari (requires different setup!)
- Firefox

Always test on the platforms your users actually use.

---

## 9. Quick Reference Checklist

### Before You Start
- [ ] Generate VAPID keys: `npx web-push generate-vapid-keys`
- [ ] Add environment variables to Vercel
- [ ] Create `push_subscriptions` table in Supabase
- [ ] Install web-push: `npm install web-push`

### Files to Create
- [ ] Service Worker (`src/sw.ts`)
- [ ] Push Notification Service (`src/services/pushNotificationService.ts`)
- [ ] Save Subscription API (`api/notifications/save-subscription.ts`)
- [ ] Send Push API (`api/notifications/send-push.ts`)
- [ ] Debug API (`api/notifications/debug-push.ts`)
- [ ] UI Component (`src/components/PushNotificationPrompt.tsx`)

### Testing Checklist
- [ ] Enable notifications in browser
- [ ] Check subscription saved to database
- [ ] Send test notification
- [ ] Test with app open
- [ ] Test with app closed
- [ ] Test notification click opens app

### Production Checklist
- [ ] All environment variables set in Vercel
- [ ] Database table has correct RLS policies
- [ ] Service worker registered correctly
- [ ] Icons exist (`/icons/icon-192.png`, `/icons/icon-72.png`)
- [ ] Test on multiple browsers/devices

---

## Summary

Building push notifications is complex because it involves:
1. **Browser APIs** (Service Workers, Push Manager, Notifications)
2. **Encryption** (VAPID keys, subscription keys)
3. **Backend APIs** (to store subscriptions and send pushes)
4. **Database** (to persist subscriptions)

The key insight from our journey: **if your app uses custom authentication, you need API endpoints that bypass Supabase RLS**.

Push notifications are powerful when they work, but debugging them requires patience and good logging. Use the debug endpoint, check browser console, and check Vercel logs.

Good luck with your implementation! 🚀

---

*This guide was created based on the real implementation experience with Class Dues Tracker. Last updated: February 2026.*
