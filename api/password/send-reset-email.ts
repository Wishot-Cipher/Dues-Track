/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured, passwordResetEmail } from '../_lib/email.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
const appUrl = process.env.VITE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'

function generateSecureToken(): string {
  // ✅ Use Web Crypto API (works everywhere)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    // Modern browsers/Node 19+
    return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  }
  
  // ✅ Fallback for older Node.js
  try {
    const nodeCrypto = require('crypto')
    return nodeCrypto.randomBytes(32).toString('hex')
  } catch (err) {
    console.error('Crypto not available:', err)
    // Emergency fallback (not cryptographically secure - use only as last resort)
    return Array.from({ length: 64 }, () => 
      Math.floor(Math.random() * 16).toString(16)
    ).join('')
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseUrl) {
    console.error('Missing SUPABASE_URL')
    return res.status(500).json({ error: 'Server configuration error: Missing database URL' })
  }
  
  if (!serviceRole) {
    console.error('Missing SUPABASE_SERVICE_ROLE_KEY')
    return res.status(500).json({ error: 'Server configuration error: Missing service role key' })
  }

  let supabaseAdmin
  try {
    supabaseAdmin = createClient(supabaseUrl, serviceRole)
  } catch (err) {
    console.error('Failed to create Supabase client:', err)
    return res.status(500).json({ error: 'Failed to connect to database' })
  }

  try {
    const { email, orgSlug } = req.body || {}
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const emailLower = String(email).trim().toLowerCase()

    // --------------------------------------------------
    // Resolve org name for email branding (optional)
    // --------------------------------------------------
    let orgName = 'Payvexo'
    if (orgSlug) {
      const { data: orgRow } = await supabaseAdmin
        .from('organizations')
        .select('name')
        .eq('slug', orgSlug)
        .maybeSingle()
      if (orgRow?.name) orgName = orgRow.name
    }

    // --------------------------------------------------
    // Lookup member by email from organization_members
    // --------------------------------------------------
    let memberQ = supabaseAdmin
      .from('organization_members')
      .select('id, email, full_name')
      .ilike('email', emailLower)
      .eq('is_active', true)

    // Scope to org if slug provided
    if (orgSlug) {
      const { data: org } = await supabaseAdmin
        .from('organizations')
        .select('id')
        .eq('slug', orgSlug)
        .maybeSingle()
      if (org?.id) {
        memberQ = memberQ.eq('organization_id', org.id)
      }
    }

    const { data: member, error: memberError } = await memberQ.maybeSingle()

    // Always return success to avoid disclosing accounts
    if (memberError || !member) {
      return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent' })
    }
    
    if (!member.email || !member.email.includes('@')) {
      return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent' })
    }

    // Delete previous unused tokens for this member
    try {
      await supabaseAdmin.from('password_reset_tokens').delete().eq('member_id', member.id).eq('used', false)
    } catch (delErr) {
      console.warn('Could not delete old tokens:', delErr)
    }

    const resetToken = generateSecureToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

    const { error: insertError } = await supabaseAdmin.from('password_reset_tokens').insert({
      member_id: member.id,
      token: resetToken,
      expires_at: expiresAt,
      used: false
    })

    if (insertError) {
      console.error('Error inserting reset token:', insertError)
      if (insertError.message?.includes('relation') || insertError.code === '42P01') {
        return res.status(500).json({ 
          error: 'Password reset tokens table not set up. Run migration 016_password_reset_tokens.sql in Supabase SQL Editor.'
        })
      }
      return res.status(500).json({ error: 'Failed to create reset token: ' + insertError.message })
    }

    const base = appUrl.replace(/\/$/, '')
    const resetUrl = orgSlug
      ? `${base}/${encodeURIComponent(orgSlug)}/reset-password?token=${resetToken}`
      : `${base}/reset-password?token=${resetToken}`

    // Send email via Gmail SMTP
    if (!isEmailConfigured()) {
      console.warn('Gmail SMTP not configured (GMAIL_USER / GMAIL_APP_PASSWORD missing)')
      return res.status(200).json({ 
        success: false, 
        emailSent: false,
        message: 'Email service not configured. Please contact your admin.',
        reason: 'GMAIL_USER or GMAIL_APP_PASSWORD not set'
      })
    }

    const html = passwordResetEmail({
      memberName: member.full_name,
      orgName,
      resetUrl,
    })

    const sent = await sendEmail(
      member.email,
      `${orgName} — Reset Your Password`,
      html
    )

    if (!sent) {
      return res.status(200).json({ 
        success: false, 
        emailSent: false,
        message: 'Failed to send email. Please try again or contact your admin.',
        reason: 'Email service error'
      })
    }

    return res.status(200).json({ 
      success: true, 
      emailSent: true,
      message: 'Password reset email sent successfully' 
    })
  } catch (err: any) {
    console.error('send-reset-email error:', err)
    return res.status(500).json({ error: err.message || String(err) })
  }
}
