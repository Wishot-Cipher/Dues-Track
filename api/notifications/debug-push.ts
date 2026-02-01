/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Debug Push Subscriptions API
 * 
 * Returns debug info about push subscription setup.
 * Helps diagnose why push notifications might not be working.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY;
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY;

export default async function handler(req: any, res: any) {
  // Only allow GET
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const diagnostics: Record<string, any> = {
    timestamp: new Date().toISOString(),
    environment: {
      supabaseUrl: supabaseUrl ? '✅ Configured' : '❌ Missing',
      serviceRole: serviceRole ? '✅ Configured' : '❌ Missing',
      vapidPublicKey: vapidPublicKey ? '✅ Configured' : '❌ Missing',
      vapidPrivateKey: vapidPrivateKey ? '✅ Configured' : '❌ Missing',
    },
  };

  if (!supabaseUrl || !serviceRole) {
    diagnostics.error = 'Missing Supabase credentials';
    return res.status(200).json(diagnostics);
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    // Check if push_subscriptions table exists
    const { data: subscriptions, error: tableError } = await supabase
      .from('push_subscriptions')
      .select('id, user_id, created_at')
      .limit(10);

    if (tableError) {
      diagnostics.database = {
        push_subscriptions_table: '❌ Error or does not exist',
        error: tableError.message,
        hint: 'Run the SQL from supabase/push_subscriptions.sql to create the table'
      };
    } else {
      diagnostics.database = {
        push_subscriptions_table: '✅ Exists',
        total_subscriptions: subscriptions?.length || 0,
        sample_user_ids: subscriptions?.map(s => s.user_id.slice(0, 8) + '...') || []
      };
    }

    // Get admin users who should receive notifications
    const { data: admins, error: adminError } = await supabase
      .from('admins')
      .select('student_id, role, can_approve_payments')
      .or('can_approve_payments.eq.true,role.eq.finsec');

    if (adminError) {
      diagnostics.admins = { error: adminError.message };
    } else {
      // Check which admins have push subscriptions
      const adminIds = (admins || []).map(a => a.student_id).filter(Boolean);
      
      if (adminIds.length === 0) {
        diagnostics.admins = {
          total_approvers: 0,
          approvers_with_push: 0,
          message: 'No admins with approval permissions found'
        };
      } else {
        const { data: adminSubs } = await supabase
          .from('push_subscriptions')
          .select('user_id')
          .in('user_id', adminIds);

        diagnostics.admins = {
          total_approvers: admins?.length || 0,
          approvers_with_push: adminSubs?.length || 0,
          approver_ids: adminIds.map(id => id ? id.slice(0, 8) + '...' : 'null'),
          subscribed_ids: (adminSubs || []).map(s => s.user_id ? s.user_id.slice(0, 8) + '...' : 'null')
        };
      }
    }

    return res.status(200).json(diagnostics);
  } catch (error: any) {
    diagnostics.error = error.message;
    return res.status(200).json(diagnostics);
  }
}
