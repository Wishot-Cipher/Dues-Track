/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Create Expense API
 *
 * Allows admins with can_create_payments permission to create expenses.
 *
 * SECURITY: Verifies caller is an admin with can_create_payments permission.
 *           Forces recorded_by from verified admin ID (never from client).
 *           Adds organization_id to expense insert for org isolation.
 *           Uses member_admins table (not legacy admins).
 */

import { createClient } from '@supabase/supabase-js'
import { verifyAdmin } from './_lib/auth'

const BUCKET = 'expense-receipts'

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ error: 'Missing Supabase admin credentials on server (SUPABASE_SERVICE_ROLE_KEY).' })
  }

  const supabaseAdmin = createClient(supabaseUrl, serviceRole)

  try {
    const body = req.body
    const callerId = body?.callerId

    if (!callerId) {
      return res.status(400).json({ error: 'Missing callerId' })
    }

    // ── Verify caller is an admin with expense creation permission ──
    const auth = await verifyAdmin(supabaseAdmin, callerId, 'can_create_payments')
    if (!auth.valid || !auth.data) {
      return res.status(auth.status || 401).json({ error: auth.error || 'Unauthorized' })
    }

    const callerOrgId = auth.data.organization_id

    const {
      payment_type_id = null,
      title,
      description = null,
      category = null,
      amount,
      expense_date = new Date().toISOString(),
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

    // If payment_type_id is provided, verify it belongs to the caller's org
    if (payment_type_id) {
      const { data: pt } = await supabaseAdmin
        .from('payment_types')
        .select('id')
        .eq('id', payment_type_id)
        .eq('organization_id', callerOrgId)
        .single()

      if (!pt) {
        return res.status(400).json({ error: 'Payment type not found in your organization' })
      }
    }

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

    // Force recorded_by from verified admin — NEVER from client
    const insertPayload = {
      payment_type_id,
      title,
      description,
      category,
      amount: numAmount,
      expense_date,
      recorded_by: callerId,
      receipt_url,
      organization_id: callerOrgId,
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
