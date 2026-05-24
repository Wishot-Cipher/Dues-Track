/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/paystack/init
 *
 * Initialize a Paystack transaction for a member paying a due.
 *
 * Body:
 *   {
 *     memberId:       string  (uuid, the payer's organization_members.id)
 *     paymentTypeId:  string  (uuid, the due being paid)
 *     amountKobo?:    number  (optional override; default = payment_type.amount * 100)
 *     callbackPath?:  string  (optional path the verify page lives at,
 *                              default `/<orgSlug>/payments/verify`)
 *   }
 *
 * Flow:
 *   1. Verify the caller via verifyMember (custom-auth model)
 *   2. Load the payment_type and the org (for slug + currency)
 *   3. Compute platform fee per the blueprint formula
 *      (org-configurable; defaults to 1.5% capped at ₦500, min ₦50)
 *   4. INSERT a pending payments row with reference + kobo breakdown
 *   5. Call Paystack `/transaction/initialize` with email, total in kobo,
 *      reference, callback_url, and rich metadata so the webhook (P2) can
 *      correlate without another DB lookup
 *   6. Return { authorization_url, reference, payment_id, total_kobo }
 *
 * SECURITY:
 *   - Service-role Supabase client; the caller never holds a DB token
 *   - PAYSTACK_SECRET_KEY is server-side only (never shipped to browser)
 *   - The amount sent to Paystack is computed server-side from the
 *     payment_type row — never trusted from the client body
 */

import { createClient } from '@supabase/supabase-js';
import { verifyMember } from '../_lib/auth.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
const appUrl = (process.env.VITE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

// ── Fee math (matches Blueprint §8.3) ─────────────────────────
// fee = clamp(round(amount * percent/100) + flat, min, cap)
const DEFAULT_FEE_PERCENT = 1.5;   // 1.5%
const DEFAULT_FEE_FLAT_KOBO = 0;   // 0 kobo (org may override)
const DEFAULT_FEE_MIN_KOBO = 5000; // ₦50
const DEFAULT_FEE_CAP_KOBO = 50000; // ₦500
function computeFeeKobo(
  duesKobo: number,
  cfg: { percent?: number; flat?: number; min?: number; cap?: number; mode?: string },
): number {
  const mode = (cfg.mode || 'hybrid').toLowerCase();
  const percent = typeof cfg.percent === 'number' ? cfg.percent : DEFAULT_FEE_PERCENT;
  const flat    = typeof cfg.flat    === 'number' ? cfg.flat    : DEFAULT_FEE_FLAT_KOBO;
  const min     = typeof cfg.min     === 'number' ? cfg.min     : DEFAULT_FEE_MIN_KOBO;
  const cap     = typeof cfg.cap     === 'number' ? cfg.cap     : DEFAULT_FEE_CAP_KOBO;

  let raw = 0;
  if (mode === 'flat')    raw = flat;
  else if (mode === 'percent') raw = Math.round((duesKobo * percent) / 100);
  else                    raw = Math.round((duesKobo * percent) / 100) + flat;
  return Math.max(min, Math.min(cap, raw));
}

function genReference(paymentId: string): string {
  // Paystack reference: alphanumeric, dashes, underscores. Max 100 chars.
  // pvx_<8-char-uuid>_<ts> — unique, traceable, fits comfortably.
  const short = paymentId.replace(/-/g, '').slice(0, 16);
  return `pvx_${short}_${Date.now()}`;
}

// Wraps the real handler so any thrown error returns a structured
// 500 with the actual message + stack — not just an opaque
// "Internal Server Error" the browser shows in the Network tab.
// Disable this `expose` flag in production by setting
// PAYVEXO_HIDE_API_ERRORS=1 in Vercel env vars.
const exposeErrors = !((globalThis as any).process?.env?.PAYVEXO_HIDE_API_ERRORS === '1');

export default async function handler(req: any, res: any) {
  try {
    return await _handler(req, res);
  } catch (err) {
    const e = err as Error;
    console.error('[paystack/init] uncaught:', e?.stack || e);
    return res.status(500).json({
      ok: false,
      error: exposeErrors
        ? `Paystack init crashed: ${e?.message || String(e)}`
        : 'Internal error',
      ...(exposeErrors && e?.stack ? { stack: e.stack.split('\n').slice(0, 5) } : {}),
    });
  }
}

async function _handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ ok: false, error: 'Server config error: Supabase env missing' });
  }
  if (!paystackSecret) {
    return res.status(500).json({ ok: false, error: 'Server config error: PAYSTACK_SECRET_KEY missing' });
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  // ── Auth ──
  const { memberId, paymentTypeId, callbackPath } = req.body || {};
  const auth = await verifyMember(supabase, memberId);
  if (!auth.valid || !auth.data) {
    return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'Auth failed' });
  }
  const member = auth.data;

  if (!paymentTypeId || typeof paymentTypeId !== 'string') {
    return res.status(400).json({ ok: false, error: 'paymentTypeId is required' });
  }

  // ── Load payment_type (must belong to caller's org) ──
  //
  // `*` select on purpose: tolerant against older schemas where
  // `accepts_paystack` (mig 031) or `currency_code` may not exist yet.
  // We only read the fields we need with explicit fallbacks.
  const { data: pt, error: ptErr } = await supabase
    .from('payment_types')
    .select('*')
    .eq('id', paymentTypeId)
    .eq('organization_id', member.organization_id)
    .maybeSingle();

  if (ptErr) {
    console.error('payment_type lookup failed', ptErr);
    return res.status(500).json({ ok: false, error: `Lookup failed: ${ptErr.message || 'unknown'}` });
  }
  if (!pt) {
    return res.status(404).json({ ok: false, error: 'Payment type not found in your organization' });
  }
  if (pt.is_active === false) {
    return res.status(400).json({ ok: false, error: 'This payment is no longer accepting contributions.' });
  }
  // Only honor accepts_paystack=false when the column actually exists with a
  // strict false; otherwise default to accepting (Paystack-first model).
  if (pt.accepts_paystack === false) {
    return res.status(400).json({ ok: false, error: 'This payment is not configured for online checkout.' });
  }

  // ── Load org for slug + fee config + currency ──
  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, slug, name, currency_code, platform_fee_percent, platform_fee_flat, platform_fee_min, platform_fee_cap, platform_fee_mode, paystack_subaccount_code')
    .eq('id', member.organization_id)
    .maybeSingle();
  if (orgErr || !org) {
    return res.status(500).json({ ok: false, error: 'Could not resolve organization.' });
  }

  // ── Amount math ──
  // payment_types.amount is stored as DECIMAL (naira). Convert to kobo
  // for Paystack. Total = dues + platform fee.
  const duesKobo = Math.round(Number(pt.amount) * 100);
  if (!duesKobo || duesKobo < 100) {
    return res.status(400).json({ ok: false, error: 'Invalid payment amount.' });
  }
  const feeKobo = computeFeeKobo(duesKobo, {
    percent: org.platform_fee_percent ?? undefined,
    flat:    org.platform_fee_flat ?? undefined,
    min:     org.platform_fee_min ?? undefined,
    cap:     org.platform_fee_cap ?? undefined,
    mode:    org.platform_fee_mode ?? undefined,
  });
  const totalKobo = duesKobo + feeKobo;

  // ── Resolve email for Paystack (required field) ──
  const payerEmail = member.email || `${member.member_id}@payvexo.app`;

  // ── Insert pending payments row ──
  const paymentRow: Record<string, unknown> = {
    organization_id:     member.organization_id,
    group_id:            member.group_id,
    member_id:           member.id,
    payment_type_id:     pt.id,
    amount:              Number(pt.amount),       // legacy naira decimal
    dues_amount_kobo:    duesKobo,
    platform_fee_kobo:   feeKobo,
    total_charged_kobo:  totalKobo,
    currency_code:       (pt.currency_code || org.currency_code || 'NGN').toUpperCase(),
    payment_method:      'paystack',
    status:              'pending',
    payer_email:         payerEmail,
    payer_name:          member.full_name,
  };

  const { data: inserted, error: insErr } = await supabase
    .from('payments')
    .insert(paymentRow)
    .select('id')
    .single();

  if (insErr || !inserted) {
    console.error('payments insert error', insErr);
    return res.status(500).json({ ok: false, error: 'Could not create payment record.' });
  }

  const reference = genReference(inserted.id);

  // Patch the reference back onto the row (so the webhook can correlate)
  await supabase
    .from('payments')
    .update({ paystack_reference: reference, transaction_ref: reference })
    .eq('id', inserted.id);

  // ── Build callback URL ──
  const orgSlug = org.slug || 'org';
  const callbackBase = appUrl || (req.headers.origin ? String(req.headers.origin).replace(/\/$/, '') : '');
  const path = (typeof callbackPath === 'string' && callbackPath.startsWith('/'))
    ? callbackPath
    : `/${orgSlug}/payments/verify`;
  const callbackUrl = `${callbackBase}${path}?reference=${encodeURIComponent(reference)}`;

  // ── Call Paystack ──
  //
  // Channel ordering matters in Nigeria. Many of our users are in
  // areas where debit cards are uncommon — bank transfer and USSD
  // are the dominant rails. Paystack respects the order of this
  // array when rendering payment options on the hosted page, so
  // putting bank/USSD first means the student sees the rail they
  // actually use as the primary option.
  const paystackBody: Record<string, unknown> = {
    email: payerEmail,
    amount: totalKobo,
    currency: paymentRow.currency_code,
    reference,
    callback_url: callbackUrl,
    channels: ['bank_transfer', 'ussd', 'bank', 'card', 'mobile_money', 'qr', 'eft'],
    metadata: {
      payment_id:       inserted.id,
      payment_type_id:  pt.id,
      payment_type_title: pt.title,
      organization_id:  org.id,
      organization_slug: org.slug,
      group_id:         member.group_id,
      member_id:        member.id,
      member_full_name: member.full_name,
      dues_kobo:        duesKobo,
      fee_kobo:         feeKobo,
      // The webhook (P2) uses these to send rich notifications + emails
      // without needing additional DB joins.
      custom_fields: [
        { display_name: 'Due',          variable_name: 'due',          value: pt.title },
        { display_name: 'Member',       variable_name: 'member_name',  value: member.full_name },
        { display_name: 'Organization', variable_name: 'organization', value: org.name },
      ],
    },
  };

  // If org has a Paystack subaccount, split: dues to org, fee to platform
  if (org.paystack_subaccount_code) {
    paystackBody.subaccount = org.paystack_subaccount_code;
    paystackBody.transaction_charge = feeKobo;
    paystackBody.bearer = 'account'; // platform bears Paystack's own processing cost
  }

  let psRes: Response;
  try {
    psRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${paystackSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(paystackBody),
    });
  } catch (e) {
    console.error('paystack init network error', e);
    await supabase.from('payments').update({ status: 'failed' }).eq('id', inserted.id);
    return res.status(502).json({ ok: false, error: 'Could not reach Paystack. Please try again.' });
  }

  const psJson = await psRes.json().catch(() => ({} as any));

  if (!psRes.ok || psJson?.status !== true) {
    console.error('paystack init failed', psRes.status, psJson);
    await supabase.from('payments').update({ status: 'failed' }).eq('id', inserted.id);
    return res.status(502).json({
      ok: false,
      error: psJson?.message || 'Paystack rejected this transaction. Try again or contact support.',
    });
  }

  return res.status(200).json({
    ok: true,
    payment_id: inserted.id,
    reference,
    authorization_url: psJson.data?.authorization_url,
    access_code: psJson.data?.access_code,
    total_kobo: totalKobo,
    dues_kobo: duesKobo,
    fee_kobo: feeKobo,
    currency: paymentRow.currency_code,
  });
}
