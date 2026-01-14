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
    const { paymentId, studentId, amount, paymentTypeId } = req.body

    if (!paymentId || !studentId || !paymentTypeId) {
      return res.status(400).json({ error: 'Missing required fields' })
    }

    // Fetch names for message
    const { data: pt } = await supabaseAdmin.from('payment_types').select('title').eq('id', paymentTypeId).single()
    const { data: student } = await supabaseAdmin.from('students').select('full_name').eq('id', studentId).single()

    const paymentTypeName = pt?.title || 'Payment'
    const studentName = student?.full_name || 'A student'

    // Find approvers: admins who can approve payments or have role finsec
    const { data: approvers } = await supabaseAdmin
      .from('admins')
      .select('student_id')
      .or('can_approve_payments.eq.true,role.eq.finsec')

    if (!approvers || approvers.length === 0) return res.status(200).json({ ok: true, inserted: 0 })

    const inserts = approvers.map((a: any) => ({
      recipient_id: a.student_id,
      type: 'payment_pending',
      title: `New Payment Submitted - ${paymentTypeName}`,
      message: `${studentName} submitted a payment of ₦${Number(amount || 0).toLocaleString()} for "${paymentTypeName}". Review and approve it in the admin panel.`,
      link: `/payment/${paymentId}`,
      is_read: false,
    }))

    const { error } = await supabaseAdmin.from('notifications').insert(inserts)
    if (error) {
      return res.status(500).json({ error: error.message || error })
    }

    return res.status(200).json({ ok: true, inserted: inserts.length })
  } catch (err) {
    return res.status(500).json({ error: (err as Error).message || String(err) })
  }
}
