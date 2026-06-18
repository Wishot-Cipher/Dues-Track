/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { sendEmail, isEmailConfigured, passwordResetEmail } from '../_lib/email.js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
const appUrl = process.env.VITE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'

function generateSecureToken(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '')
  }
  try {
    const nodeCrypto = require('crypto')
    return nodeCrypto.randomBytes(32).toString('hex')
  } catch (err) {
    console.error('Crypto not available:', err)
    return Array.from({ length: 64 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('')
  }
}

// --------------------------------------------------
// /api/password/send-reset-email
// --------------------------------------------------
async function handleSendResetEmail(req: any, res: any, supabaseAdmin: any) {
  const { email, orgSlug } = req.body || {}
  if (!email) {
    return res.status(400).json({ error: 'Email is required' })
  }

  const emailLower = String(email).trim().toLowerCase()

  let orgName = 'Payvexo'
  if (orgSlug) {
    const { data: orgRow } = await supabaseAdmin
      .from('organizations')
      .select('name')
      .eq('slug', orgSlug)
      .maybeSingle()
    if (orgRow?.name) orgName = orgRow.name
  }

  let memberQ = supabaseAdmin
    .from('organization_members')
    .select('id, email, full_name')
    .ilike('email', emailLower)
    .eq('is_active', true)

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

  if (memberError || !member) {
    return res.status(200).json({
      success: false,
      emailSent: false,
      reason: 'MEMBER_NOT_FOUND_IN_ORG',
      message: 'That email is not registered in this organization.',
    })
  }

  if (!member.email || !member.email.includes('@')) {
    return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent' })
  }

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
    used: false,
  })

  if (insertError) {
    console.error('Error inserting reset token:', insertError)
    if (insertError.message?.includes('relation') || insertError.code === '42P01') {
      return res.status(500).json({
        error: 'Password reset tokens table not set up. Run migration 016_password_reset_tokens.sql in Supabase SQL Editor.',
      })
    }
    return res.status(500).json({ error: 'Failed to create reset token: ' + insertError.message })
  }

  const resetUrl = orgSlug
    ? `${appUrl.replace(/\/$/, '')}/${orgSlug}/reset-password?token=${resetToken}`
    : `${appUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`

  if (!isEmailConfigured()) {
    console.warn('Gmail SMTP not configured (GMAIL_USER / GMAIL_APP_PASSWORD missing)')
    return res.status(200).json({
      success: false,
      emailSent: false,
      message: 'Email service not configured. Please contact your admin.',
      reason: 'GMAIL_USER or GMAIL_APP_PASSWORD not set',
    })
  }

  const html = passwordResetEmail({
    memberName: member.full_name,
    orgName,
    resetUrl,
  })

  const sent = await sendEmail(member.email, `${orgName} — Reset Your Password`, html)

  if (!sent) {
    return res.status(200).json({
      success: false,
      emailSent: false,
      message: 'Failed to send email. Please try again or contact your admin.',
      reason: 'Email service error',
    })
  }

  return res.status(200).json({
    success: true,
    emailSent: true,
    message: 'Password reset email sent successfully',
  })
}

// --------------------------------------------------
// /api/password/reset
// --------------------------------------------------
async function handleReset(req: any, res: any, supabaseAdmin: any) {
  const { token, newPassword } = req.body || {}

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ success: false, error: 'Reset token is required' })
  }
  if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
    return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' })
  }

  const { data: resetRow, error: lookupError } = await supabaseAdmin
    .from('password_reset_tokens')
    .select('id, member_id, expires_at, used')
    .eq('token', token)
    .maybeSingle()

  if (lookupError) {
    console.error('Error looking up reset token:', lookupError)
    return res.status(500).json({ success: false, error: 'Failed to verify reset link' })
  }

  if (!resetRow) {
    return res.status(400).json({ success: false, error: 'This reset link is invalid. Please request a new one.' })
  }

  if (resetRow.used) {
    return res.status(400).json({ success: false, error: 'This reset link has already been used. Please request a new one.' })
  }

  if (new Date(resetRow.expires_at).getTime() < Date.now()) {
    return res.status(400).json({ success: false, error: 'This reset link has expired. Please request a new one.' })
  }

  const { data: rpcResult, error: rpcError } = await supabaseAdmin.rpc('reset_member_password', {
    p_member_id: resetRow.member_id,
    p_new_password: newPassword,
  })

  if (rpcError) {
    console.error('Error calling reset_member_password:', rpcError)
    return res.status(500).json({ success: false, error: 'Failed to reset password: ' + rpcError.message })
  }

  if (!rpcResult?.success) {
    return res.status(400).json({ success: false, error: rpcResult?.error || 'Failed to reset password' })
  }

  const { error: markUsedError } = await supabaseAdmin
    .from('password_reset_tokens')
    .update({ used: true, used_at: new Date().toISOString() })
    .eq('id', resetRow.id)

  if (markUsedError) {
    console.warn('Could not mark reset token as used:', markUsedError)
  }

  return res.status(200).json({ success: true, message: 'Password reset successfully' })
}

// --------------------------------------------------
// Router
// --------------------------------------------------
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

  const action = req.query?.action

  try {
    if (action === 'send-reset-email') {
      return await handleSendResetEmail(req, res, supabaseAdmin)
    }
    if (action === 'reset') {
      return await handleReset(req, res, supabaseAdmin)
    }
    return res.status(404).json({ error: `Unknown action: ${action}` })
  } catch (err: any) {
    console.error(`password/${action} error:`, err)
    return res.status(500).json({ error: err.message || String(err) })
  }
}