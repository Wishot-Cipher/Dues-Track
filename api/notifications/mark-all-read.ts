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
    const { userId } = req.body
    if (!userId) return res.status(400).json({ error: 'Missing required field: userId' })

    const { error } = await supabaseAdmin
      .from('notifications')
      .update({ is_read: true })
      .eq('recipient_id', userId)
      .eq('is_read', false)

    if (error) {
      return res.status(500).json({ error: error.message || error })
    }

    return res.status(200).json({ ok: true })
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message || String(err) })
  }
}
