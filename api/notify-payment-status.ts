/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Notify Payment Status Endpoint
 * Sends professional email to member when their payment is approved or rejected.
 * Called from AdminReviewPage after admin action.
 *
 * SECURITY: Verifies the caller is an admin with can_approve_payments
 *           in the same org as the payment. Never trusts client-provided
 *           adminName or orgSlug — derives them server-side.
 */
import { createClient } from '@supabase/supabase-js'
import { verifyAdmin, escapeHtml } from './_lib/auth'
import {
  sendEmail,
  isEmailConfigured,
  paymentApprovedEmail,
  paymentRejectedEmail,
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
      paymentId,
      status,
      rejectionReason,
      callerId,          // admin's member UUID — verified server-side
    } = req.body || {}

    if (!paymentId || !status || !callerId) {
      return res.status(400).json({ error: 'Missing required fields: paymentId, status, callerId' })
    }

    if (status !== 'approved' && status !== 'rejected') {
      return res.status(400).json({ error: 'Status must be "approved" or "rejected"' })
    }

    // ── Verify caller is an admin with approval permissions ──
    const auth = await verifyAdmin(supabaseAdmin, callerId, 'can_approve_payments')
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 403).json({ error: auth.error || 'Unauthorized' })
    }

    const callerOrgId = auth.data.organization_id

    // ── Fetch payment — scoped to caller's org ──
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select(`
        id,
        amount,
        created_at,
        approved_at,
        organization_id,
        member_id,
        member:organization_members!payments_member_id_fkey (
          full_name,
          email,
          member_id
        ),
        payment_types (
          title
        )
      `)
      .eq('id', paymentId)
      .eq('organization_id', callerOrgId)    // ← org isolation
      .single()

    if (paymentError || !payment) {
      return res.status(404).json({ error: 'Payment not found in your organization' })
    }

    const memberEmail = (payment.member as any)?.email
    const memberName = escapeHtml((payment.member as any)?.full_name) || 'Member'
    const paymentType = escapeHtml((payment.payment_types as any)?.title) || 'Payment'
    const amount = `₦${Number(payment.amount).toLocaleString()}`

    if (!memberEmail) {
      return res.status(200).json({ 
        success: false, 
        reason: 'Member has no email address on file' 
      })
    }

    // ── Derive org info server-side (never trust client) ──
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('name, slug')
      .eq('id', callerOrgId)
      .single()

    const orgName = escapeHtml(org?.name) || 'Payvexo'
    const orgSlug = org?.slug || ''
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL || 'https://payvexo.com'
    const dashboardUrl = `${appUrl}/${orgSlug}/dashboard`

    // ── Use server-verified admin name ──
    const adminName = escapeHtml(auth.data.full_name)

    let subject: string
    let html: string

    if (status === 'approved') {
      subject = `✓ Payment Approved — ${paymentType}`
      html = paymentApprovedEmail({
        memberName,
        paymentType,
        amount,
        orgName,
        approvedBy: adminName,
        dashboardUrl,
        date: payment.approved_at
          ? new Date(payment.approved_at).toLocaleDateString('en-NG', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
          : undefined,
      })
    } else {
      subject = `Payment Not Approved — ${paymentType}`
      html = paymentRejectedEmail({
        memberName,
        paymentType,
        amount,
        orgName,
        rejectedBy: adminName,
        reason: escapeHtml(rejectionReason) || undefined,
        dashboardUrl,
      })
    }

    const sent = await sendEmail(memberEmail, subject, html)

    return res.status(200).json({
      success: sent,
      reason: sent ? undefined : 'Email send failed',
    })
  } catch (err: any) {
    console.error('notify-payment-status error:', err)
    return res.status(500).json({ error: 'Internal server error' })
  }
}
