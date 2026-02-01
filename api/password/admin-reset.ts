/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin Password Reset Endpoint
 * Allows admins to directly reset a student's password
 * No email required - generates a temporary password
 */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

// Generate a random temporary password
function generateTempPassword(): string {
  const chars = 'abcdefghjkmnpqrstuvwxyz23456789' // Removed confusing characters like 0/O, 1/l/I
  let password = ''
  for (let i = 0; i < 8; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

// Simple hash function for temporary passwords (bcrypt would be better but adds complexity)
async function hashPassword(password: string): Promise<string> {
  // Use bcryptjs if available
  try {
    const bcrypt = await import('bcryptjs')
    return bcrypt.hash(password, 10)
  } catch {
    // Fallback: This is less secure but works without external deps
    // In production, ensure bcryptjs is installed
    console.warn('bcryptjs not available, using simple hash')
    const encoder = new TextEncoder()
    const data = encoder.encode(password + 'class-dues-salt')
    const hashBuffer = await crypto.subtle.digest('SHA-256', data)
    const hashArray = Array.from(new Uint8Array(hashBuffer))
    return '$sha256$' + hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  }
}

export default async function handler(req: any, res: any) {
  res.setHeader('Content-Type', 'application/json')
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  if (!supabaseUrl || !serviceRole) {
    console.error('❌ Missing Supabase environment variables')
    return res.status(500).json({ error: 'Server configuration error' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole)

  try {
    const { studentId, adminId } = req.body || {}
    
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' })
    }
    
    if (!adminId) {
      return res.status(400).json({ error: 'Admin ID is required' })
    }

    console.log('🔑 Admin password reset requested:', { studentId, adminId })

    // Verify admin exists and has permission
    const { data: admin, error: adminError } = await supabaseAdmin
      .from('students')
      .select('id, role, full_name')
      .eq('id', adminId)
      .single()

    if (adminError || !admin) {
      console.error('❌ Admin not found:', adminError)
      return res.status(403).json({ error: 'Invalid admin credentials' })
    }

    if (admin.role !== 'admin' && admin.role !== 'super_admin') {
      console.error('❌ User is not an admin:', admin.role)
      return res.status(403).json({ error: 'Only admins can reset passwords' })
    }

    // Verify student exists
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('id, full_name, reg_number')
      .eq('id', studentId)
      .single()

    if (studentError || !student) {
      console.error('❌ Student not found:', studentError)
      return res.status(404).json({ error: 'Student not found' })
    }

    // Generate temporary password
    const tempPassword = generateTempPassword()
    const hashedPassword = await hashPassword(tempPassword)

    console.log('🔐 Generated temp password for:', student.full_name)

    // Update student's password and set force_password_change flag
    const { error: updateError } = await supabaseAdmin
      .from('students')
      .update({
        password_hash: hashedPassword,
        force_password_change: true,
        updated_at: new Date().toISOString()
      })
      .eq('id', studentId)

    if (updateError) {
      console.error('❌ Failed to update password:', updateError)
      return res.status(500).json({ error: 'Failed to reset password: ' + updateError.message })
    }

    // Create notification for the student
    try {
      await supabaseAdmin.from('notifications').insert({
        recipient_id: studentId,
        type: 'force_password',
        title: 'Password Reset by Admin',
        message: `Your password was reset by ${admin.full_name}. Please use the temporary password provided to you and change it immediately upon login.`,
        link: '/login',
      })
    } catch (notifErr) {
      console.warn('Could not create notification:', notifErr)
    }

    console.log('✅ Password reset successful for:', student.full_name)

    return res.status(200).json({
      success: true,
      tempPassword: tempPassword,
      message: `Password reset for ${student.full_name}. Temporary password: ${tempPassword}`,
      studentName: student.full_name,
      regNumber: student.reg_number
    })

  } catch (err: any) {
    console.error('❌ Admin password reset error:', err)
    return res.status(500).json({ error: err.message || 'Internal server error' })
  }
}
