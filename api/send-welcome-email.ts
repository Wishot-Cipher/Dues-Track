/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Send Welcome Email Endpoint
 * Sends a branded welcome email to a newly added member.
 *
 * SECURITY: Verifies the caller is a real, active member in the same org.
 *           Accepts both admins and regular members (for self-join flow).
 *           Verifies the target member actually exists in that org.
 */
import { createClient } from '@supabase/supabase-js'
import { verifyMember, escapeHtml } from './_lib/auth'
import {
  sendEmail,
  isEmailConfigured,
  welcomeEmail,
} from './_lib/email'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!isEmailConfigured()) {
    return res.status(200).json({ success: false, reason: 'Email not configured' })
  }

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole)

  try {
    const {
      callerId,         // admin's member UUID
      memberEmail,      // target member's email
      memberName,       // target member's name
      orgSlug,          // org slug (will be verified against caller's org)
      role,
    } = req.body || {}

    if (!callerId || !memberEmail || !memberName) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // ── Verify caller is a real, active member ──
    const auth = await verifyMember(supabaseAdmin, callerId)
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 403).json({ error: auth.error || 'Unauthorized' })
    }

    const callerOrgId = auth.data.organization_id

    // ── Verify the target member exists in the SAME org ──
    const { data: targetMember } = await supabaseAdmin
      .from('organization_members')
      .select('id, email')
      .eq('email', memberEmail)
      .eq('organization_id', callerOrgId)
      .maybeSingle()

    if (!targetMember) {
      return res.status(200).json({ success: false, reason: 'Member not found in your organization' })
    }

    // ── Get org name from caller's org (not from client) ──
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, slug')
      .eq('id', callerOrgId)
      .single()

    const orgName = escapeHtml(org?.name) || 'Payvexo'
    const verifiedSlug = org?.slug || orgSlug || ''
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL || 'https://payvexo.com'
    const loginUrl = `${appUrl}/${verifiedSlug}/login`

    const subject = `Welcome to ${orgName}! 🎉`
    const html = welcomeEmail({
      memberName: escapeHtml(memberName),
      orgName,
      loginUrl,
      role: role || undefined,
    })

    const sent = await sendEmail(memberEmail, subject, html)

    return res.status(200).json({
      success: sent,
      reason: sent ? undefined : 'Email send failed',
    })
  } catch (err: any) {
    console.error('send-welcome-email error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
