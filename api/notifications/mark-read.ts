/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Mark Notification(s) as Read API
 *
 * - POST { callerId, notificationId }  → marks a single notification as read
 * - POST { callerId }                  → marks ALL unread notifications as read
 *
 * SECURITY: Verifies the caller is a real, active member.
 *           Only allows marking their OWN notifications as read,
 *           scoped to their organization.
 */
import { createClient } from '@supabase/supabase-js'
import { verifyMember } from '../_lib/auth'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole)

  try {
    // Support both new "callerId" and legacy "userId" field for backward compat
    const callerId = req.body?.callerId || req.body?.userId
    const notificationId = req.body?.notificationId

    if (!callerId) return res.status(400).json({ error: 'Missing required field: callerId' })

    // ── Verify the caller is a real, active member ──
    const auth = await verifyMember(supabaseAdmin, callerId)
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' })
    }

    const memberId = auth.data.id
    const orgId = auth.data.organization_id

    let query = supabaseAdmin
      .from('notifications')
      .update({ is_read: true, read_at: new Date().toISOString() })

    if (notificationId) {
      // Mark single notification — must belong to this member AND org
      query = query
        .eq('id', notificationId)
        .eq('member_id', memberId)
        .eq('organization_id', orgId)
    } else {
      // Mark all unread — scoped to this member AND org
      query = query
        .eq('member_id', memberId)
        .eq('organization_id', orgId)
        .eq('is_read', false)
    }

    const { error } = await query

    if (error) {
      return res.status(500).json({ error: error.message || error })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message || String(err) })
  }
}
