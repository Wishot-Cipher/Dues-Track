/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'
import { sendEmail, passwordChangedEmail } from '../_lib/email'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
const appUrl = process.env.VITE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Missing Supabase admin credentials on server.' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole)

  try {
    const { token, newPassword } = req.body
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and password are required' })
    if (typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

    // Verify token
    const { data: resetRow, error: tokenError } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('id, member_id, used, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (tokenError || !resetRow) {
      return res.status(400).json({ error: 'Invalid or expired reset link' })
    }

    if (resetRow.used) return res.status(400).json({ error: 'Reset link already used' })
    if (new Date(resetRow.expires_at) < new Date()) return res.status(400).json({ error: 'Reset link expired' })

    // Use reset_member_password RPC to hash with pgcrypto and update
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('reset_member_password', {
      p_member_id: resetRow.member_id,
      p_new_password: newPassword,
    })

    if (rpcError) {
      console.error('RPC error setting password:', rpcError)
      return res.status(500).json({ error: 'Failed to update password' })
    }

    // Check RPC result
    if (rpcData && rpcData.success === false) {
      return res.status(400).json({ error: rpcData.error || 'Failed to reset password' })
    }

    // Mark token used
    const { error: markError } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('id', resetRow.id)

    if (markError) console.warn('Failed to mark token used:', markError)

    // Send password changed confirmation email
    try {
      const { data: member } = await supabaseAdmin
        .from('organization_members')
        .select('email, full_name, organization_id')
        .eq('id', resetRow.member_id)
        .single()

      if (member?.email) {
        let orgName = 'Payvexo'
        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('name, slug')
          .eq('id', member.organization_id)
          .maybeSingle()
        if (org?.name) orgName = org.name
        const loginUrl = `${appUrl.replace(/\/$/, '')}/${org?.slug || ''}/login`

        const html = passwordChangedEmail({
          memberName: member.full_name,
          orgName,
          loginUrl,
        })
        await sendEmail(member.email, `${orgName} — Password Changed Successfully`, html)
      }
    } catch {
      // Non-critical — password is already changed
    }

    return res.status(200).json({ success: true, message: 'Password reset successfully' })
  } catch (err: any) {
    console.error('reset-password error:', err)
    return res.status(500).json({ error: err.message || String(err) })
  }
}
