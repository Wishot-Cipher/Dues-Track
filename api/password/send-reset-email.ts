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
        from: process.env.FROM_EMAIL || 'onboarding@resend.dev',
        to: student.email,
        subject: 'ECE Class Dues - Reset Your Password',
        html: `
          <!DOCTYPE html>
          <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Reset Your Password</title>
          </head>
          <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #0F0703;">
            <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #0F0703; padding: 40px 20px;">
              <tr>
                <td align="center">
                  <table width="600" cellpadding="0" cellspacing="0" style="background: linear-gradient(135deg, #1A0E09 0%, #0F0703 100%); border-radius: 16px; border: 1px solid rgba(255, 107, 53, 0.2); overflow: hidden;">
                    <!-- Header -->
                    <tr>
                      <td style="background: linear-gradient(90deg, #FF6B35, #F59E0B); padding: 3px 0;"></td>
                    </tr>
                    <tr>
                      <td style="padding: 40px 30px; text-align: center;">
                        <h1 style="color: #FFFFFF; margin: 0 0 10px 0; font-size: 28px; font-weight: 700;">Reset Your Password</h1>
                        <p style="color: rgba(255, 255, 255, 0.6); margin: 0; font-size: 14px;">ECE Class Dues Tracker</p>
                      </td>
                    </tr>
                    
                    <!-- Body -->
                    <tr>
                      <td style="padding: 0 30px 30px 30px;">
                        <p style="color: #FFFFFF; font-size: 16px; line-height: 1.6; margin: 0 0 20px 0;">
                          Hi <strong>${student.full_name}</strong>,
                        </p>
                        <p style="color: rgba(255, 255, 255, 0.8); font-size: 15px; line-height: 1.6; margin: 0 0 25px 0;">
                          We received a request to reset your password for the ECE Class Dues Tracker. Click the button below to create a new password:
                        </p>
                        
                        <!-- Reset Button -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0;">
                          <tr>
                            <td align="center">
                              <a href="${resetUrl}" style="display: inline-block; padding: 14px 32px; background: linear-gradient(135deg, #FF6B35, #F59E0B); color: #FFFFFF; text-decoration: none; border-radius: 8px; font-weight: 600; font-size: 16px;">Reset Password</a>
                            </td>
                          </tr>
                        </table>
                        
                        <p style="color: rgba(255, 255, 255, 0.6); font-size: 13px; line-height: 1.6; margin: 25px 0 0 0;">
                          Or copy and paste this link into your browser:
                        </p>
                        <p style="color: #FF6B35; font-size: 13px; word-break: break-all; margin: 10px 0 0 0;">
                          ${resetUrl}
                        </p>
                        
                        <!-- Warning Box -->
                        <table width="100%" cellpadding="0" cellspacing="0" style="margin: 30px 0; background: rgba(245, 158, 11, 0.1); border-left: 3px solid #F59E0B; border-radius: 4px;">
                          <tr>
                            <td style="padding: 15px;">
                              <p style="color: #F59E0B; font-size: 13px; margin: 0; line-height: 1.5;">
                                <strong>⚠️ Security Notice:</strong><br>
                                This link expires in 1 hour. If you didn't request this reset, please ignore this email or contact your class admin.
                              </p>
                            </td>
                          </tr>
                        </table>
                      </td>
                    </tr>
                    
                    <!-- Footer -->
                    <tr>
                      <td style="padding: 20px 30px; background: rgba(255, 255, 255, 0.03); border-top: 1px solid rgba(255, 255, 255, 0.1);">
                        <p style="color: rgba(255, 255, 255, 0.5); font-size: 12px; margin: 0; text-align: center; line-height: 1.5;">
                          ECE Class Dues Tracker<br>
                          Federal University of Technology, Owerri
                        </p>
                      </td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>
          </body>
          </html>
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
