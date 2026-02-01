/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { createClient } from '@supabase/supabase-js'

const BUCKET = 'expense-receipts'

// Verify admin token and get admin ID
async function verifyAdminToken(supabase: any, authHeader: string): Promise<{ valid: boolean; adminId?: string; error?: string }> {
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing or invalid authorization header' }
  }

  const token = authHeader.replace('Bearer ', '')
  
  try {
    // Verify the JWT token with Supabase
    const { data: { user }, error } = await supabase.auth.getUser(token)
    
    if (error || !user) {
      return { valid: false, error: 'Invalid or expired token' }
    }

    // Check if user is an admin
    const { data: admin } = await supabase
      .from('admins')
      .select('id, can_create_payments')
      .eq('student_id', user.id)
      .single()

    if (!admin) {
      return { valid: false, error: 'User is not an admin' }
    }

    if (!admin.can_create_payments) {
      return { valid: false, error: 'Admin does not have permission to create expenses' }
    }

    return { valid: true, adminId: user.id }
  } catch (err) {
    return { valid: false, error: 'Token verification failed' }
  }
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Missing Supabase admin credentials on server (SUPABASE_SERVICE_ROLE_KEY).' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole)

  // Verify the caller is an authenticated admin
  const authHeader = req.headers.authorization || req.headers['Authorization']
  const authResult = await verifyAdminToken(supabaseAdmin, authHeader)
  
  if (!authResult.valid) {
    return res.status(401).json({ error: authResult.error || 'Unauthorized' })
  }

  try {
    const body = req.body

    const {
      payment_type_id = null,
      title,
      description = null,
      category = null,
      amount,
      expense_date = new Date().toISOString(),
      recorded_by = null,
      receipt = null,
    } = body

    // Validate required fields
    if (!title || !amount) {
      return res.status(400).json({ error: 'Title and amount are required' })
    }

    // Validate amount is a positive number
    const numAmount = Number(amount)
    if (isNaN(numAmount) || numAmount <= 0) {
      return res.status(400).json({ error: 'Amount must be a positive number' })
    }

    // Use the verified admin ID if recorded_by is not provided
    const finalRecordedBy = recorded_by || authResult.adminId

    let receipt_url: string | null = null

    if (receipt && receipt.base64 && receipt.name) {
      // Validate file type (only allow images and PDFs)
      const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'application/pdf']
      if (receipt.type && !allowedTypes.includes(receipt.type)) {
        return res.status(400).json({ error: 'Invalid file type. Only images and PDFs are allowed.' })
      }

      // Validate file size (max 5MB)
      const buffer = Buffer.from(receipt.base64, 'base64')
      if (buffer.length > 5 * 1024 * 1024) {
        return res.status(400).json({ error: 'File too large. Maximum size is 5MB.' })
      }

      const path = `expense_${Date.now()}_${receipt.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`

      const { error: uploadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .upload(path, buffer, { contentType: receipt.type || 'application/octet-stream', upsert: false })

      if (uploadError) {
        return res.status(500).json({ error: `Storage upload failed: ${uploadError.message || uploadError}` })
      }

      const { data } = supabaseAdmin.storage.from(BUCKET).getPublicUrl(path)
      receipt_url = data?.publicUrl ?? null
    }

    const insertPayload = {
      payment_type_id,
      title,
      description,
      category,
      amount: numAmount,
      expense_date,
      recorded_by: finalRecordedBy,
      receipt_url,
    }

    const { data: inserted, error: insertError } = await supabaseAdmin
      .from('expenses')
      .insert([insertPayload])
      .select()
      .single()

    if (insertError) {
      return res.status(500).json({ error: `Insert failed: ${insertError.message || insertError}` })
    }

    return res.status(200).json(inserted)
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message || String(err) })
  }
}
