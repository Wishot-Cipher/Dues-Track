/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Save Push Subscription API
 *
 * Saves a push subscription to the database.
 * Uses service role to bypass RLS since app uses custom auth.
 *
 * SECURITY: Verifies the caller is a real, active member before
 *           saving the subscription. The subscription is tied to
 *           the verified member ID (not client-provided userId).
 */

import { createClient } from '@supabase/supabase-js';
import { verifyMember, setCorsHeaders } from '../_lib/auth.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

export default async function handler(req: any, res: any) {
  // Set restricted CORS headers
  setCorsHeaders(req, res);

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    // Support both "callerId" and legacy "userId" for backward compat
    const callerId = req.body?.callerId || req.body?.userId;
    const { endpoint, p256dh, auth: authKey } = req.body || {};

    if (!callerId || !endpoint || !p256dh || !authKey) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['callerId', 'endpoint', 'p256dh', 'auth']
      });
    }

    // ── Verify the caller is a real, active member ──
    const authResult = await verifyMember(supabase, callerId);
    if (!authResult.valid || !authResult.data) {
      return res.status(authResult.status || 401).json({ error: authResult.error || 'Unauthorized' });
    }

    const verifiedUserId = authResult.data.id;

    // Upsert the subscription using the VERIFIED user ID
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: verifiedUserId,
        endpoint,
        p256dh,
        auth: authKey,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })
      .select();

    if (error) {
      console.error('❌ Error saving subscription:', error);
      return res.status(500).json({
        error: 'Failed to save subscription',
      });
    }

    return res.status(200).json({
      ok: true,
      message: 'Subscription saved',
      data
    });

  } catch (error: any) {
    console.error('❌ Exception:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
