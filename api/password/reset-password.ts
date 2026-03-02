/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Missing Supabase admin credentials on server (SUPABASE_SERVICE_ROLE_KEY).' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole)

  try {
    const { token, newPassword } = req.body
    if (!token || !newPassword) return res.status(400).json({ error: 'Token and password are required' })
    if (typeof newPassword !== 'string' || newPassword.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' })

    // Verify token
    const { data: resetRow, error: tokenError } = await supabaseAdmin
      .from('password_reset_tokens')
      .select('id, student_id, used, expires_at')
      .eq('token', token)
      .maybeSingle()

    if (tokenError || !resetRow) {
      return res.status(400).json({ error: 'Invalid or expired reset link' })
    }

    if (resetRow.used) return res.status(400).json({ error: 'Reset link already used' })
    if (new Date(resetRow.expires_at) < new Date()) return res.status(400).json({ error: 'Reset link expired' })

    // Use a server-side RPC to set password with pgcrypto (keeps format consistent)
    const { data: rpcData, error: rpcError } = await supabaseAdmin.rpc('admin_reset_student_password', {
      p_student_id: resetRow.student_id,
      p_new_password: newPassword,
    })

    if (rpcError) {
      console.error('RPC error setting password:', rpcError)
      return res.status(500).json({ error: 'Failed to update password' })
    }

    // Mark token used
    const { error: markError } = await supabaseAdmin
      .from('password_reset_tokens')
      .update({ used: true })
      .eq('id', resetRow.id)

    if (markError) console.warn('Failed to mark token used:', markError)

    return res.status(200).json({ success: true, message: 'Password reset successfully' })
  } catch (err: any) {
    console.error('reset-password error:', err)
    return res.status(500).json({ error: err.message || String(err) })
  }
}
