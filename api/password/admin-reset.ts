/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Admin Password Reset Endpoint
 * Allows admins to directly reset a student's password
 * No email required - generates a temporary password
 * 
 * SECURITY: Verifies admin through JWT token, not client-provided ID
 * 
 * IMPORTANT: Uses PostgreSQL crypt() for password hashing to match
 * the verify_student_login function. Do NOT use bcryptjs here.
 */
import { createClient } from '@supabase/supabase-js'


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


// Verify admin token and extract admin info
async function verifyAdminToken(supabase: any, authHeader: string): Promise<{ valid: boolean; adminId?: string; adminName?: string; error?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid authorization header' }
  }

  const token = authHeader.replace('Bearer ', '')
  
  try {
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      return { valid: false, error: 'Invalid or expired token' }
    }

    // Check if user is an admin with password reset permissions
    const { data: student } = await supabase
      .from('students')
      .select('id, full_name, role')
      .eq('id', user.id)
      .single()

    if (!student) {
      return { valid: false, error: 'User not found' }
    }

    if (student.role !== 'admin' && student.role !== 'super_admin' && student.role !== 'class_rep') {
      return { valid: false, error: 'Only admins can reset passwords' }
    }

    return { valid: true, adminId: user.id, adminName: student.full_name }
  } catch (err) {
    return { valid: false, error: 'Token verification failed' }
  }
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

  // Verify the caller is an authenticated admin via JWT token
  const authHeader = req.headers.authorization || req.headers['Authorization']
  const authResult = await verifyAdminToken(supabaseAdmin, authHeader)
  
  if (!authResult.valid) {
    return res.status(401).json({ error: authResult.error || 'Unauthorized' })
  }

  try {
    const { studentId } = req.body || {}
    
    if (!studentId) {
      return res.status(400).json({ error: 'Student ID is required' })
    }

    // Validate studentId format (UUID)
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
    if (!uuidRegex.test(studentId)) {
      return res.status(400).json({ error: 'Invalid student ID format' })
    }

    // Verify student exists
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('id, full_name, reg_number')
      .eq('id', studentId)
      .single()

    if (studentError || !student) {
      return res.status(404).json({ error: 'Student not found' })
    }

    // Generate temporary password
    const tempPassword = generateTempPassword()

    // Use PostgreSQL crypt() function to hash the password
    // This matches how verify_student_login verifies passwords
    const { data: hashResult, error: hashError } = await supabaseAdmin
      .rpc('hash_password', { p_password: tempPassword })

    if (hashError) {
      // Fallback: If RPC doesn't exist, try raw SQL (requires the function to be created)
      // The hash_password function should be: crypt(p_password, gen_salt('bf'))
      return res.status(500).json({ 
        error: 'Password hashing failed. Please ensure hash_password function exists in database.',
        details: 'Run: CREATE OR REPLACE FUNCTION hash_password(p_password TEXT) RETURNS TEXT AS $$ SELECT crypt(p_password, gen_salt(\'bf\')); $$ LANGUAGE SQL;'
      })
    }

    const hashedPassword = hashResult

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
      return res.status(500).json({ error: 'Failed to reset password' })
    }

    // Create notification for the student
    try {
      await supabaseAdmin.from('notifications').insert({
        recipient_id: studentId,
        type: 'force_password',
        title: 'Password Reset by Admin',
        message: `Your password was reset by ${authResult.adminName}. Please use the temporary password provided to you and change it immediately upon login.`,
        link: '/login',
      })
    } catch {
      // Non-critical, continue
    }

    return res.status(200).json({
      success: true,
      tempPassword: tempPassword,
      message: `Password reset successful`,
      studentName: student.full_name,
      regNumber: student.reg_number
    })

  } catch (err: any) {
    return res.status(500).json({ error: 'Internal server error' })
  }
}
