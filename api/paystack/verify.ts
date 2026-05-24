/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET  /api/paystack/verify?reference=<ref>
 * POST /api/paystack/verify           { reference }
 *
 * After Paystack redirects the user back to /:slug/payments/verify,
 * the verify page calls THIS endpoint to confirm the transaction.
 *
 * Idempotent:
 *   - If the payment row is already 'approved', we just echo the
 *     details — no second-write race with the webhook (P2).
 *   - If Paystack says success, we mark approved + insert into
 *     platform_earnings.
 *   - If Paystack says failed/abandoned, we mark accordingly.
 *
 * Returns:
 *   { ok, status, payment, paystack: { status, amount, channel, paid_at } }
 *
 * This endpoint exists so the verify page has an instant truthful
 * answer (the webhook may not have fired yet). The webhook in P2 will
 * still be the authoritative source for fan-out + receipts.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const paystackSecret = process.env.PAYSTACK_SECRET_KEY;

function getReference(req: any): string | null {
  if (req.method === 'GET') {
    const r = req.query?.reference;
    return typeof r === 'string' ? r : null;
  }
  const r = req.body?.reference;
  return typeof r === 'string' ? r : null;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ ok: false, error: 'Server config error: Supabase env missing' });
  }
  if (!paystackSecret) {
    return res.status(500).json({ ok: false, error: 'Server config error: PAYSTACK_SECRET_KEY missing' });
  }

  const reference = getReference(req);
  if (!reference) {
    return res.status(400).json({ ok: false, error: 'reference is required' });
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  // ── Look up the local payment row first ──
  const { data: paymentRow, error: paymentErr } = await supabase
    .from('payments')
    .select('id, status, paystack_status, organization_id, group_id, member_id, payment_type_id, dues_amount_kobo, platform_fee_kobo, total_charged_kobo, currency_code, amount, payer_email, payer_name')
    .eq('paystack_reference', reference)
    .maybeSingle();

  if (paymentErr) {
    console.error('verify lookup err', paymentErr);
    return res.status(500).json({ ok: false, error: 'Could not look up payment.' });
  }
  if (!paymentRow) {
    return res.status(404).json({ ok: false, error: 'Unknown reference — payment not found.' });
  }

  // ── Already approved? Short-circuit. ──
  if (paymentRow.status === 'approved' && paymentRow.paystack_status === 'success') {
    return res.status(200).json({
      ok: true,
      status: 'approved',
      payment: paymentRow,
    });
  }

  // ── Call Paystack verify ──
  let psRes: Response;
  try {
    psRes = await fetch(
      `https://api.paystack.co/transaction/verify/${encodeURIComponent(reference)}`,
      {
        method: 'GET',
        headers: { Authorization: `Bearer ${paystackSecret}` },
      },
    );
  } catch (e) {
    console.error('paystack verify network err', e);
    return res.status(502).json({ ok: false, error: 'Could not reach Paystack.' });
  }

  const psJson = await psRes.json().catch(() => ({} as any));
  if (!psRes.ok || psJson?.status !== true) {
    return res.status(502).json({
      ok: false,
      error: psJson?.message || 'Paystack rejected the verify call.',
    });
  }

  const ps = psJson.data || {};
  const psStatus = String(ps.status || '').toLowerCase(); // success | failed | abandoned

  // ── Reconcile ──
  if (psStatus === 'success') {
    const settledKobo = Number(ps.amount) || paymentRow.total_charged_kobo;
    await supabase
      .from('payments')
      .update({
        status:                     'approved',
        paystack_status:            'success',
        paystack_channel:           ps.channel || null,
        paystack_ip_address:        ps.ip_address || null,
        paystack_fees_breakdown:    ps.fees_breakdown || null,
        webhook_received_at:        null, // verify ≠ webhook; webhook fills this later
        webhook_verified:           false,
        org_amount_settled:         paymentRow.dues_amount_kobo,
        platform_amount_settled:    paymentRow.platform_fee_kobo,
        approved_at:                new Date().toISOString(),
      })
      .eq('id', paymentRow.id);

    // Insert platform_earnings (idempotent on payment_id unique constraint)
    if (paymentRow.platform_fee_kobo && paymentRow.platform_fee_kobo > 0) {
      await supabase
        .from('platform_earnings')
        .insert({
          payment_id:         paymentRow.id,
          organization_id:    paymentRow.organization_id,
          amount_kobo:        paymentRow.platform_fee_kobo,
          currency_code:      paymentRow.currency_code || 'NGN',
          paystack_reference: reference,
        })
        .select()
        .maybeSingle(); // ignore duplicate-on-conflict if webhook already wrote one

      void settledKobo; // referenced to keep ts happy if we later compare
    }

    return res.status(200).json({
      ok: true,
      status: 'approved',
      payment: { ...paymentRow, status: 'approved', paystack_status: 'success' },
      paystack: {
        status:   ps.status,
        amount:   ps.amount,
        channel:  ps.channel,
        paid_at:  ps.paid_at,
      },
    });
  }

  if (psStatus === 'failed' || psStatus === 'abandoned' || psStatus === 'reversed') {
    await supabase
      .from('payments')
      .update({
        status:          psStatus === 'failed' ? 'failed' : 'abandoned',
        paystack_status: psStatus,
      })
      .eq('id', paymentRow.id);

    return res.status(200).json({
      ok: true,
      status: psStatus,
      payment: paymentRow,
      paystack: { status: ps.status, amount: ps.amount, channel: ps.channel },
    });
  }

  // pending / ongoing — leave as-is, ask the client to poll
  return res.status(200).json({
    ok: true,
    status: 'pending',
    payment: paymentRow,
    paystack: { status: ps.status },
  });
}
