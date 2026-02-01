/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE
const appUrl = process.env.VITE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5173'
const RESEND_API_KEY = process.env.RESEND_API_KEY || process.env.VITE_RESEND_API_KEY

function generateSecureToken(): string {
  try {
    const crypto = require('crypto')
    return crypto.randomBytes(32).toString('hex')
  } catch {
    // Fallback for environments without crypto
    return Math.random().toString(36).substring(2) + Date.now().toString(36) + Math.random().toString(36).substring(2)
  }
}

export default async function handler(req: any, res: any) {
  // Set CORS headers
  res.setHeader('Content-Type', 'application/json')
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  // Check for required env vars
  if (!supabaseUrl) {
    console.error('❌ Missing SUPABASE_URL environment variable')
    return res.status(500).json({ error: 'Server configuration error: Missing database URL' })
  }
  
  if (!serviceRole) {
    console.error('❌ Missing SUPABASE_SERVICE_ROLE_KEY environment variable')
    return res.status(500).json({ error: 'Server configuration error: Missing service role key' })
  }

  let supabaseAdmin
  try {
    supabaseAdmin = createClient(supabaseUrl, serviceRole)
  } catch (err) {
    console.error('❌ Failed to create Supabase client:', err)
    return res.status(500).json({ error: 'Failed to connect to database' })
  }

  try {
    const { email } = req.body || {}
    if (!email) {
      return res.status(400).json({ error: 'Email is required' })
    }

    const emailLower = String(email).trim().toLowerCase()
    console.log('📧 Password reset requested for:', emailLower)

    // Lookup student by email from students table (NOT Supabase auth.users)
    const { data: student, error: studentError } = await supabaseAdmin
      .from('students')
      .select('id, email, full_name, reg_number')
      .ilike('email', emailLower)
      .maybeSingle()

    console.log('🔍 Student lookup:', { found: !!student, error: studentError?.message })

    // Always return success to avoid disclosing accounts
    if (studentError || !student) {
      console.log('⚠️ Student not found or error:', studentError?.message || 'No student with this email')
      return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent' })
    }
    
    // Check if student has a valid email
    if (!student.email || !student.email.includes('@')) {
      console.log('⚠️ Student has no valid email:', student.full_name)
      return res.status(200).json({ success: true, message: 'If that email exists, a reset link has been sent' })
    }

    console.log('✅ Found student:', student.full_name, '| Email:', student.email)

    // Delete previous unused tokens for this student
    try {
      await supabaseAdmin.from('password_reset_tokens').delete().eq('student_id', student.id).eq('used', false)
    } catch (delErr) {
      console.warn('Could not delete old tokens (table may not exist):', delErr)
    }

    const resetToken = generateSecureToken()
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString() // 1 hour

    const { error: insertError } = await supabaseAdmin.from('password_reset_tokens').insert({
      student_id: student.id,
      token: resetToken,
      expires_at: expiresAt,
      used: false
    })

    if (insertError) {
      console.error('❌ Error inserting reset token:', insertError)
      // Check if table doesn't exist
      if (insertError.message?.includes('relation') || insertError.code === '42P01') {
        return res.status(500).json({ 
          error: 'Password reset tokens table not set up. Please run the database migration.',
          details: 'Run: CREATE TABLE password_reset_tokens (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), student_id uuid REFERENCES students(id), token text UNIQUE NOT NULL, expires_at timestamptz NOT NULL, used boolean DEFAULT false, created_at timestamptz DEFAULT now());'
        })
      }
      return res.status(500).json({ error: 'Failed to create reset token: ' + insertError.message })
    }

    const resetUrl = `${appUrl.replace(/\/$/, '')}/reset-password?token=${resetToken}`
    console.log('🔗 Reset URL generated:', resetUrl)

    // Send email via Resend (if configured)
    if (!RESEND_API_KEY) {
      console.warn('RESEND_API_KEY not configured; skipping sending email. Reset link:', resetUrl)
      return res.status(200).json({ success: true, message: 'Password reset link generated (email not sent in this environment).' })
    }

    const resendRes = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'onboarding@resend.dev',
        to: student.email,
        subject: 'Reset Your Password',
        html: `
          <p>Hi <strong>${student.full_name}</strong>,</p>
          <p>We received a request to reset your password. Click the link below to reset it (expires in 1 hour):</p>
          <p><a href="${resetUrl}">Reset Password</a></p>
          <p>If the button doesn't work, copy and paste: ${resetUrl}</p>
        `
      })
    })

    if (!resendRes.ok) {
      const body = await resendRes.text()
      console.error('Resend API error:', body)
      // still return 200 to caller to avoid leakage
      return res.status(200).json({ success: true, message: 'Password reset link generated (email sending failed).' })
    }

    return res.status(200).json({ success: true, message: 'Password reset email sent' })
  } catch (err: any) {
    console.error('send-reset-email error:', err)
    return res.status(500).json({ error: err.message || String(err) })
  }
}
