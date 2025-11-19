import { createClient } from '@supabase/supabase-js'

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

    let receipt_url: string | null = null

    if (receipt && receipt.base64 && receipt.name) {
      const path = `expense_${Date.now()}_${receipt.name}`
      const buffer = Buffer.from(receipt.base64, 'base64')

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
      amount,
      expense_date,
      recorded_by,
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
