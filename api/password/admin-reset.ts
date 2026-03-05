/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin Password Reset Endpoint
 * Allows admins to directly reset a member's password.
 * No email required — generates a temporary password.
 *
 * SECURITY: Verifies caller is an admin with can_manage_members permission.
 *           Verifies target member is in the SAME organization.
 *           Uses organization_members table (not legacy students).
 *           Uses PostgreSQL crypt() for password hashing.
 */
import { createClient } from '@supabase/supabase-js'
import { sendEmail, adminResetPasswordEmail } from '../_lib/email'
import { verifyAdmin, escapeHtml } from '../_lib/auth'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

// Generate a cryptographically random temporary password
function generateTempPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789'; // No confusing chars
  const array = new Uint8Array(10);
  (globalThis.crypto || window.crypto).getRandomValues(array);
  let password = '';
  for (let i = 0; i < array.length; i++) {
    password += chars.charAt(array[i] % chars.length);
  }
  return password;
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole)

  try {
    const { callerId, studentId } = req.body || {}

    if (!callerId) {
      return res.status(400).json({ error: 'Missing callerId' })
    }
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' })
    }

    // Validate studentId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(studentId)) {
      return res.status(400).json({ error: 'Invalid student ID format' })
    }

    // ── Verify caller is an admin with permission to manage members ──
    const auth = await verifyAdmin(supabaseAdmin, callerId, 'can_manage_members')
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' })
    }

    const callerOrgId = auth.data.organization_id
    const adminName = auth.data.full_name

    // ── Verify target member exists and is in the SAME organization ──
    const { data: targetMember, error: memberError } = await supabaseAdmin
      .from('organization_members')
      .select('id, full_name, member_id, email, organization_id')
      .eq('id', studentId)
      .eq('organization_id', callerOrgId)
      .single()

    if (memberError || !targetMember) {
      return res.status(404).json({ error: 'Member not found in your organization' })
    }

    // Generate temporary password
    const tempPassword = generateTempPassword()

    // Use PostgreSQL crypt() function to hash the password
    const { data: hashResult, error: hashError } = await supabaseAdmin
      .rpc('hash_password', { p_password: tempPassword })

    if (hashError) {
      return res.status(500).json({
        error: 'Password hashing failed. Please ensure hash_password function exists in database.',
      })
    }

    const hashedPassword = hashResult

    // Update member's password and set force_password_change flag
    const { error: updateError } = await supabaseAdmin
      .from('organization_members')
      .update({
        password_hash: hashedPassword,
        force_password_change: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', studentId)
      .eq('organization_id', callerOrgId)

    if (updateError) {
      return res.status(500).json({ error: 'Failed to reset password' })
    }

    // Create notification for the target member
    try {
      await supabaseAdmin.from('notifications').insert({
        member_id: studentId,
        organization_id: callerOrgId,
        type: 'force_password',
        title: 'Password Reset by Admin',
        message: `Your password was reset by ${escapeHtml(adminName)}. Please use the temporary password provided to you and change it immediately upon login.`,
        link: '/login',
        is_read: false,
      })
    } catch {
      // Non-critical
    }

    // Send email notification with temporary password (non-critical)
    try {
      const memberEmail = targetMember.email
      if (memberEmail) {
        const { data: org } = await supabaseAdmin
          .from('organizations')
          .select('name, slug')
          .eq('id', callerOrgId)
          .single()

        const orgName = org?.name || 'Payvexo'
        const orgSlug = org?.slug || ''
        const appUrlEnv = process.env.NEXT_PUBLIC_APP_URL || process.env.VITE_APP_URL || 'https://payvexo.com'
        const loginUrl = orgSlug ? `${appUrlEnv}/${orgSlug}/login` : `${appUrlEnv}/login`

        await sendEmail(
          memberEmail,
          `Your Password Has Been Reset — ${orgName}`,
          adminResetPasswordEmail({
            memberName: targetMember.full_name,
            orgName,
            tempPassword,
            loginUrl,
            adminName: adminName || 'Admin',
          })
        )
      }
    } catch {
      // Non-critical — temp password is shown in UI anyway
    }

    return res.status(200).json({
      success: true,
      tempPassword: tempPassword,
      message: 'Password reset successful',
      studentName: targetMember.full_name,
      regNumber: targetMember.member_id
    })

  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
