/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Notify Approvers API
 *
 * When a member submits a payment, this endpoint notifies all admins
 * who can approve payments via in-app notification, email, and push.
 *
 * SECURITY: Verifies the caller (studentId) is a real, active member.
 *           All data is scoped to the payment's organization_id.
 *           payment_types query is org-scoped to prevent cross-org leakage.
 */

import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'
import { sendEmail, paymentSubmittedEmail } from './_lib/email.js'
import { verifyMember, escapeHtml } from './_lib/auth.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
const appUrl = process.env.VITE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app'

// VAPID keys for push notifications
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com'

// Configure VAPID details
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole)

  // Note: The caller is the member who submitted the payment (studentId)
  // We verify they are a real, active member before proceeding.

  try {
    const { paymentId, studentId, amount, paymentTypeId } = req.body

    if (!paymentId || !studentId || !paymentTypeId) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // ── Verify the caller (studentId) is a real, active member ──
    const auth = await verifyMember(supabaseAdmin, studentId)
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' })
    }

    // Validate the payment exists, belongs to this member, and same org
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('id, member_id, amount, status, organization_id, group_id')
      .eq('id', paymentId)
      .eq('member_id', studentId)
      .eq('organization_id', auth.data.organization_id)
      .single();

    if (paymentError || !payment) {
      return res.status(403).json({ error: 'Payment not found or does not belong to member' });
    }

    // Validate amount
    const numAmount = Number(amount || 0)
    if (numAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' })
    }

    const organizationId = payment.organization_id;

    // Fetch the DUE's title + OWNING TIER. The approver is the exec who
    // owns the due's tier (payment_type.group_id) — NOT the payer's group.
    // A class member can pay a DEPT due; the dept exec must be notified,
    // not the class rep. (Keying off payment.group_id missed them.)
    const { data: pt } = await supabaseAdmin
      .from('payment_types')
      .select('title, group_id')
      .eq('id', paymentTypeId)
      .eq('organization_id', organizationId)
      .single()
    const dueGroupId: string | null = (pt as any)?.group_id ?? null
    const { data: member } = await supabaseAdmin
      .from('organization_members')
      .select('full_name, member_id')
      .eq('id', studentId)
      .eq('organization_id', organizationId)
      .single()

    // Get org slug and name for notification links and emails
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('slug, name')
      .eq('id', organizationId)
      .single()
    const orgSlug = org?.slug || ''
    const orgName = org?.name || 'Payvexo'

    const paymentTypeName = escapeHtml(pt?.title || 'Payment')
    const memberName = escapeHtml(member?.full_name || 'A member')
    const memberId = member?.member_id || ''
    const formattedAmount = `₦${Number(amount || 0).toLocaleString()}`

    // Find approvers: admins who can approve payments (or treasurer/owner)
    // who OWN the due's tier. Tier due → admins of that exact group; org-wide
    // due (no group) → org-scope admins. This mirrors the Review queue's
    // own-tier rule so the people who actually see the payment are the ones
    // pinged about it.
    let approverQ = supabaseAdmin
      .from('member_admins')
      .select(`
        member_id,
        organization_members!member_admins_member_id_fkey (
          id,
          email,
          full_name
        )
      `)
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .or('can_approve_payments.eq.true,role.eq.treasurer,role.eq.org_owner,role.eq.org_admin')

    if (dueGroupId) {
      approverQ = approverQ.eq('group_id', dueGroupId)
    } else {
      approverQ = approverQ.eq('scope_level', 'org')
    }

    const { data: approvers } = await approverQ

    if (!approvers || approvers.length === 0) return res.status(200).json({ ok: true, inserted: 0 })

    const reviewLink = orgSlug ? `/${orgSlug}/admin/review` : `/admin/review`

    // Insert in-app notifications (multi-tenant: member_id + organization_id)
    const inserts = approvers.map((a: any) => ({
      member_id: a.member_id,
      organization_id: organizationId,
      group_id: dueGroupId || null,
      type: 'payment_pending',
      title: `💰 New Payment - ${paymentTypeName}`,
      message: `${memberName} (${memberId}) submitted ${formattedAmount} for "${paymentTypeName}". Tap to review.`,
      link: reviewLink,
      is_read: false,
    }))

    const { error } = await supabaseAdmin.from('notifications').insert(inserts)
    if (error) {
      console.error('❌ Notification insert error:', error);
      // Non-critical, continue with other notifications
    }
    // (Push to approvers is sent below — this file already fans out via
    // web-push to each approver's push_subscription.)

    // Send email notifications to admins with valid emails
    const reviewUrl = `${appUrl.replace(/\/$/, '')}${reviewLink}`
    let emailsSent = 0

    for (const approver of approvers) {
      const adminEmail = (approver.organization_members as any)?.email
      const adminName = (approver.organization_members as any)?.full_name || 'Admin'
      
      if (adminEmail && adminEmail.includes('@')) {
        const html = paymentSubmittedEmail({
          adminName,
          memberName,
          memberId,
          paymentType: paymentTypeName,
          amount: formattedAmount,
          orgName,
          reviewUrl,
        })
        const emailSent = await sendEmail(
          adminEmail,
          `New Payment: ${memberName} — ${formattedAmount}`,
          html
        );
        if (emailSent) emailsSent++;
      }
    }

    // Send push notifications to all admins who have subscribed
    let pushSent = 0;
    if (vapidPublicKey && vapidPrivateKey) {
      for (const approver of approvers) {
        try {
          // Get push subscription for this admin (user_id = organization_members.id)
          const { data: subscription } = await supabaseAdmin
            .from('push_subscriptions')
            .select('endpoint, p256dh, auth')
            .eq('user_id', approver.member_id)
            .single();

          if (subscription) {
            const pushPayload = JSON.stringify({
              title: `💰 New Payment - ${paymentTypeName}`,
              body: `${memberName} submitted ${formattedAmount}. Tap to review.`,
              icon: '/icon-512.png',
              badge: '/icon-192.png',
              url: reviewLink,
              tag: 'new-payment',
            });

            await webpush.sendNotification(
              {
                endpoint: subscription.endpoint,
                keys: {
                  p256dh: subscription.p256dh,
                  auth: subscription.auth
                }
              } as never,
              pushPayload,
              { TTL: 86400, urgency: 'high' }
            );
            pushSent++;
          }
        } catch {
          // Continue to next admin even if one fails
        }
      }
    }

    return res.status(200).json({ ok: true, inserted: inserts.length, emailsSent, pushSent })
  } catch {
    return res.status(500).json({ error: 'Failed to send notifications' })
  }
}
