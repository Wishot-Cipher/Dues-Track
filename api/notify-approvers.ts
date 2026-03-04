/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY
const appUrl = process.env.VITE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'https://your-app.vercel.app'

// VAPID keys for push notifications
const vapidPublicKey = process.env.VAPID_PUBLIC_KEY || process.env.VITE_VAPID_PUBLIC_KEY
const vapidPrivateKey = process.env.VAPID_PRIVATE_KEY
const vapidEmail = process.env.VAPID_EMAIL || 'mailto:admin@example.com'

// Configure VAPID details
if (vapidPublicKey && vapidPrivateKey) {
  webpush.setVapidDetails(vapidEmail, vapidPublicKey, vapidPrivateKey)
}

// Helper to send email via Resend
async function sendEmailNotification(to: string, subject: string, html: string): Promise<boolean> {
  if (!RESEND_API_KEY) {
    return false;
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'Payvexo <notifications@resend.dev>',
        to,
        subject,
        html
      })
    });

    return res.ok;
  } catch {
    return false;
  }
}

// Verify authenticated user
async function verifyAuth(supabase: any, authHeader: string): Promise<{ valid: boolean; userId?: string; error?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing authorization' }
  }

  const token = authHeader.replace('Bearer ', '')
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    if (error || !user) {
      return { valid: false, error: 'Invalid token' }
    }
    return { valid: true, userId: user.id }
  } catch {
    return { valid: false, error: 'Auth failed' }
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole)

  // Note: We validate by checking the payment exists in the database
  // rather than requiring Supabase Auth (since app uses custom auth)

  try {
    const { paymentId, studentId, amount, paymentTypeId } = req.body

    console.log('📩 notify-approvers called:', { paymentId, studentId, amount, paymentTypeId });

    if (!paymentId || !studentId || !paymentTypeId) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Validate the payment exists and belongs to this member (security check)
    const { data: payment, error: paymentError } = await supabaseAdmin
      .from('payments')
      .select('id, member_id, amount, status, organization_id')
      .eq('id', paymentId)
      .eq('member_id', studentId)
      .single();

    if (paymentError || !payment) {
      console.log('❌ Payment validation failed:', paymentError);
      return res.status(403).json({ error: 'Payment not found or does not belong to member' });
    }

    // Validate amount
    const numAmount = Number(amount || 0)
    if (numAmount <= 0) {
      return res.status(400).json({ error: 'Invalid amount' })
    }

    const organizationId = payment.organization_id;

    // Fetch names for message (multi-tenant: organization_members table)
    const { data: pt } = await supabaseAdmin.from('payment_types').select('title').eq('id', paymentTypeId).single()
    const { data: member } = await supabaseAdmin
      .from('organization_members')
      .select('full_name, member_id')
      .eq('id', studentId)
      .single()

    // Get org slug for notification links
    const { data: org } = await supabaseAdmin
      .from('organizations')
      .select('slug')
      .eq('id', organizationId)
      .single()
    const orgSlug = org?.slug || ''

    const paymentTypeName = pt?.title || 'Payment'
    const memberName = member?.full_name || 'A member'
    const memberId = member?.member_id || ''
    const formattedAmount = `₦${Number(amount || 0).toLocaleString()}`

    // Find approvers: admins who can approve payments or have role treasurer
    // Scoped to the same organization as the payment
    const { data: approvers } = await supabaseAdmin
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

    if (!approvers || approvers.length === 0) return res.status(200).json({ ok: true, inserted: 0 })

    const reviewLink = orgSlug ? `/${orgSlug}/admin/review` : `/admin/review`

    // Insert in-app notifications (multi-tenant: member_id + organization_id)
    const inserts = approvers.map((a: any) => ({
      member_id: a.member_id,
      organization_id: organizationId,
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

    // Send email notifications to admins with valid emails
    const reviewUrl = `${appUrl.replace(/\/$/, '')}${reviewLink}`
    let emailsSent = 0

    for (const approver of approvers) {
      const adminEmail = (approver.organization_members as any)?.email
      const adminName = (approver.organization_members as any)?.full_name || 'Admin'
      
      if (adminEmail && adminEmail.includes('@')) {
        const emailSent = await sendEmailNotification(
          adminEmail,
          `💰 New Payment: ${memberName} - ${formattedAmount}`,
          `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #FF6803, #FF8534); padding: 20px; border-radius: 12px 12px 0 0; text-align: center;">
                <h1 style="color: white; margin: 0; font-size: 24px;">💰 New Payment Submitted</h1>
              </div>
              
              <div style="background: #1A1A1A; padding: 24px; border-radius: 0 0 12px 12px; color: #E5E5E5;">
                <p style="margin: 0 0 16px; font-size: 16px;">Hi <strong>${adminName}</strong>,</p>
                
                <p style="margin: 0 0 20px; font-size: 15px;">A new payment has been submitted and requires your review:</p>
                
                <div style="background: #2A2A2A; padding: 16px; border-radius: 8px; margin-bottom: 20px;">
                  <table style="width: 100%; color: #E5E5E5; font-size: 14px;">
                    <tr>
                      <td style="padding: 8px 0; color: #888;">Member:</td>
                      <td style="padding: 8px 0; font-weight: bold;">${memberName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #888;">Member ID:</td>
                      <td style="padding: 8px 0;">${memberId}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #888;">Payment Type:</td>
                      <td style="padding: 8px 0;">${paymentTypeName}</td>
                    </tr>
                    <tr>
                      <td style="padding: 8px 0; color: #888;">Amount:</td>
                      <td style="padding: 8px 0; font-weight: bold; color: #4ADE80;">${formattedAmount}</td>
                    </tr>
                  </table>
                </div>
                
                <a href="${reviewUrl}" style="display: inline-block; background: linear-gradient(135deg, #FF6803, #FF8534); color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: bold; font-size: 14px;">
                  Review Payment →
                </a>
                
                <p style="margin: 24px 0 0; font-size: 12px; color: #666;">
                  This is an automated notification from Payvexo.
                </p>
              </div>
            </div>
          `
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
              icon: '/icons/icon-192.png',
              badge: '/icons/icon-72.png',
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
