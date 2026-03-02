/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Save Push Subscription API
 * 
 * This endpoint saves a push subscription to the database.
 * Uses service role to bypass RLS since app uses custom auth.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

// Allowed origins — restrict to your production domain(s)
const ALLOWED_ORIGINS = [
  process.env.VITE_APP_URL,
  process.env.NEXT_PUBLIC_APP_URL,
  'http://localhost:5173',
  'http://localhost:3000',
].filter(Boolean) as string[];

function getAllowedOrigin(origin?: string): string {
  if (!origin) return '';
  return ALLOWED_ORIGINS.some(o => origin.startsWith(o)) ? origin : '';
}

export default async function handler(req: any, res: any) {
  // Set CORS headers — restricted to known origins
  const origin = req.headers?.origin || '';
  const allowed = getAllowedOrigin(origin);
  if (allowed) res.setHeader('Access-Control-Allow-Origin', allowed);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  if (!supabaseUrl || !serviceRole) {
    console.error('Missing Supabase configuration');
    return res.status(500).json({ error: 'Server configuration error' });
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    const { userId, endpoint, p256dh, auth } = req.body;

    if (!userId || !endpoint || !p256dh || !auth) {
      return res.status(400).json({ 
        error: 'Missing required fields',
        required: ['userId', 'endpoint', 'p256dh', 'auth']
      });
    }

    // Verify the userId actually exists in the students table
    const { data: student, error: studentErr } = await supabase
      .from('students')
      .select('id')
      .eq('id', userId)
      .maybeSingle();

    if (studentErr || !student) {
      return res.status(403).json({ error: 'Invalid user ID' });
    }

    // Upsert the subscription (update if exists, insert if not)
    const { data, error } = await supabase
      .from('push_subscriptions')
      .upsert({
        user_id: userId,
        endpoint,
        p256dh,
        auth,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'user_id',
      })
      .select();

    if (error) {
      console.error('❌ Error saving subscription:', error);
      return res.status(500).json({ 
        error: 'Failed to save subscription',
        details: error.message
      });
    }

    console.log('✅ Subscription saved successfully');
    return res.status(200).json({ 
      ok: true, 
      message: 'Subscription saved',
      data
    });

  } catch (error: any) {
    console.error('❌ Exception:', error);
    return res.status(500).json({ 
      error: 'Internal server error',
      details: error.message
    });
  }
}
