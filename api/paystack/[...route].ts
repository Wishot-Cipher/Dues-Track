/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Consolidated Paystack endpoint (single serverless function).
 *
 * Routes:
 *   POST /api/paystack/init
 *   GET  /api/paystack/verify?reference=<ref>
 *   POST /api/paystack/verify { reference }
 *   POST /api/paystack/webhook
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';
import { verifyMember } from '../_lib/auth.js';

// Body parser disabled so we can verify webhook HMAC from the raw body.
export const config = {
  api: { bodyParser: false },
};

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
const appUrl = (process.env.VITE_APP_URL || process.env.NEXT_PUBLIC_APP_URL || '').replace(/\/$/, '');

const exposeErrors = !((globalThis as any).process?.env?.PAYVEXO_HIDE_API_ERRORS === '1');

// ── Route resolution ─────────────────────────────────────────
function resolveSubPath(req: any): string {
  const route = req.query?.route;
  if (Array.isArray(route)) return route.join('/');
  if (typeof route === 'string') return route;

  const rawPath = String(req.url || '').split('?')[0];
  const parts = rawPath.split('/').filter(Boolean);
  const idx = parts.indexOf('paystack');
  if (idx >= 0) return parts.slice(idx + 1).join('/');
  return parts.join('/');
}

// ── Body helpers ─────────────────────────────────────────────
function getRawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding?.('utf8');
    req.on('data', (chunk: string) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function parseJson(raw: string): any {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

// ── Fee math (matches Blueprint §8.3) ────────────────────────
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
  const short = paymentId.replace(/-/g, '').slice(0, 16);
  return `pvx_${short}_${Date.now()}`;
}

// ── Webhook helpers ─────────────────────────────────────────
function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature || typeof signature !== 'string') return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Main handler ─────────────────────────────────────────────
export default async function handler(req: any, res: any) {
  const subPath = resolveSubPath(req);
  if (!subPath) return res.status(404).json({ ok: false, error: 'Unknown Paystack route' });

  const isPost = req.method === 'POST';
  const rawBody = isPost ? await getRawBody(req) : '';
  const body = isPost ? parseJson(rawBody) : {};

  switch (subPath) {
    case 'init':
      return handleInit(req, res, body);
    case 'verify':
      return handleVerify(req, res, body);
    case 'webhook':
      return handleWebhook(req, res, rawBody);
    default:
      return res.status(404).json({ ok: false, error: `Unknown Paystack route: ${subPath}` });
  }
}

// ── /init ────────────────────────────────────────────────────
async function handleInit(req: any, res: any, body: any) {
  try {
    return await handleInitCore(req, res, body);
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

async function handleInitCore(req: any, res: any, body: any) {
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

  const { memberId, paymentTypeId, callbackPath } = body || {};
  const auth = await verifyMember(supabase, memberId);
  if (!auth.valid || !auth.data) {
    return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'Auth failed' });
  }
  const member = auth.data;

  if (!paymentTypeId || typeof paymentTypeId !== 'string') {
    return res.status(400).json({ ok: false, error: 'paymentTypeId is required' });
  }

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
  if (pt.accepts_paystack === false) {
    return res.status(400).json({ ok: false, error: 'This payment is not configured for online checkout.' });
  }

  const { data: org, error: orgErr } = await supabase
    .from('organizations')
    .select('id, slug, name, currency_code, platform_fee_percent, platform_fee_flat, platform_fee_min, platform_fee_cap, platform_fee_mode, paystack_subaccount_code')
    .eq('id', member.organization_id)
    .maybeSingle();
  if (orgErr || !org) {
    return res.status(500).json({ ok: false, error: 'Could not resolve organization.' });
  }

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

  const payerEmail = member.email || `${member.member_id}@payvexo.app`;

  const paymentRow: Record<string, unknown> = {
    organization_id:     member.organization_id,
    group_id:            member.group_id,
    member_id:           member.id,
    payment_type_id:     pt.id,
    amount:              Number(pt.amount),
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

  await supabase
    .from('payments')
    .update({ paystack_reference: reference, transaction_ref: reference })
    .eq('id', inserted.id);

  const orgSlug = org.slug || 'org';
  const callbackBase = appUrl || (req.headers.origin ? String(req.headers.origin).replace(/\/$/, '') : '');
  const path = (typeof callbackPath === 'string' && callbackPath.startsWith('/'))
    ? callbackPath
    : `/${orgSlug}/payments/verify`;
  const callbackUrl = `${callbackBase}${path}?reference=${encodeURIComponent(reference)}`;

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
      organization_id:  member.organization_id,
      member_id:        member.id,
      group_id:         member.group_id,
      dues_kobo:        duesKobo,
      platform_fee_kobo: feeKobo,
      total_kobo:       totalKobo,
      currency_code:    paymentRow.currency_code,
      payer_name:       member.full_name,
    },
  };

  if (org.paystack_subaccount_code) {
    paystackBody.subaccount = org.paystack_subaccount_code;
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
    console.error('paystack init network err', e);
    return res.status(502).json({ ok: false, error: 'Could not reach Paystack.' });
  }

  const psJson = await psRes.json().catch(() => ({} as any));
  if (!psRes.ok || psJson?.status !== true) {
    return res.status(502).json({
      ok: false,
      error: psJson?.message || 'Paystack rejected the init call.',
    });
  }

  return res.status(200).json({
    ok: true,
    authorization_url: psJson?.data?.authorization_url,
    reference,
    payment_id: inserted.id,
    total_kobo: totalKobo,
  });
}

// ── /verify ─────────────────────────────────────────────────
function getReference(req: any, body: any): string | null {
  if (req.method === 'GET') {
    const r = req.query?.reference;
    return typeof r === 'string' ? r : null;
  }
  const r = body?.reference;
  return typeof r === 'string' ? r : null;
}

async function handleVerify(req: any, res: any, body: any) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ ok: false, error: 'Server config error: Supabase env missing' });
  }
  if (!paystackSecret) {
    return res.status(500).json({ ok: false, error: 'Server config error: PAYSTACK_SECRET_KEY missing' });
  }

  const reference = getReference(req, body);
  if (!reference) {
    return res.status(400).json({ ok: false, error: 'reference is required' });
  }

  const supabase = createClient(supabaseUrl, serviceRole);

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

  if (paymentRow.status === 'approved' && paymentRow.paystack_status === 'success') {
    return res.status(200).json({
      ok: true,
      status: 'approved',
      payment: paymentRow,
    });
  }

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
  const psStatus = String(ps.status || '').toLowerCase();

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
        webhook_received_at:        null,
        webhook_verified:           false,
        org_amount_settled:         paymentRow.dues_amount_kobo,
        platform_amount_settled:    paymentRow.platform_fee_kobo,
        approved_at:                new Date().toISOString(),
      })
      .eq('id', paymentRow.id);

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
        .maybeSingle();

      void settledKobo;
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

  return res.status(200).json({
    ok: true,
    status: 'pending',
    payment: paymentRow,
    paystack: { status: ps.status },
  });
}

// ── /webhook ────────────────────────────────────────────────
async function handleWebhook(req: any, res: any, rawBody: string) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!supabaseUrl || !serviceRole || !paystackSecret) {
    console.error('[paystack/webhook] missing server env vars');
    return res.status(200).json({ ok: false, error: 'server-misconfigured' });
  }

  const signature = (req.headers?.['x-paystack-signature'] ||
                     req.headers?.['X-Paystack-Signature']) as string | undefined;
  if (!verifySignature(rawBody, signature, paystackSecret)) {
    return res.status(401).json({ ok: false, error: 'invalid-signature' });
  }

  let event: any;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return res.status(200).json({ ok: false, error: 'bad-json' });
  }

  const eventType = String(event?.event || '').toLowerCase();
  const data      = event?.data || {};
  const reference = String(data?.reference || '');

  if (!reference) {
    return res.status(200).json({ ok: true, message: 'no-reference; ignored' });
  }

  const supabase = createClient(supabaseUrl, serviceRole);

  try {
    switch (eventType) {
      case 'charge.success':
        await handleChargeSuccess(supabase, reference, data);
        break;
      case 'charge.failed':
      case 'charge.abandoned':
        await handleChargeFailed(supabase, reference, data, eventType.split('.')[1]);
        break;
      default:
        console.log(`[paystack/webhook] ignored event: ${eventType}`);
    }
  } catch (e) {
    console.error(`[paystack/webhook] handler error (${eventType}):`, e);
  }

  return res.status(200).json({ ok: true });
}

async function handleChargeSuccess(supabase: any, reference: string, data: any) {
  const { data: paymentRow, error: lookupErr } = await supabase
    .from('payments')
    .select('id, status, paystack_status, organization_id, dues_amount_kobo, platform_fee_kobo, currency_code')
    .eq('paystack_reference', reference)
    .maybeSingle();

  if (lookupErr) {
    console.error('[paystack/webhook] payment lookup error', lookupErr);
    return;
  }
  if (!paymentRow) {
    console.warn(`[paystack/webhook] no local row for reference ${reference}`);
    return;
  }

  const wasApproved = paymentRow.status === 'approved'
                    && paymentRow.paystack_status === 'success';

  await supabase
    .from('payments')
    .update({
      status:                  'approved',
      paystack_status:         'success',
      paystack_channel:        data.channel || null,
      paystack_ip_address:     data.ip_address || null,
      paystack_fees_breakdown: data.fees_breakdown || null,
      webhook_received_at:     new Date().toISOString(),
      webhook_verified:        true,
      org_amount_settled:      paymentRow.dues_amount_kobo,
      platform_amount_settled: paymentRow.platform_fee_kobo,
      ...(wasApproved ? {} : { approved_at: new Date().toISOString() }),
    })
    .eq('id', paymentRow.id);

  if (paymentRow.platform_fee_kobo && paymentRow.platform_fee_kobo > 0) {
    const { error: earningErr } = await supabase
      .from('platform_earnings')
      .insert({
        payment_id:         paymentRow.id,
        organization_id:    paymentRow.organization_id,
        amount_kobo:        paymentRow.platform_fee_kobo,
        currency_code:      paymentRow.currency_code || 'NGN',
        paystack_reference: reference,
      });
    if (earningErr && earningErr.code !== '23505') {
      console.error('[paystack/webhook] earning insert err', earningErr);
    }
  }
}

async function handleChargeFailed(
  supabase: any,
  reference: string,
  _data: any,
  variant: string,
) {
  const { data: paymentRow } = await supabase
    .from('payments')
    .select('id, status')
    .eq('paystack_reference', reference)
    .maybeSingle();

  if (!paymentRow) {
    console.warn(`[paystack/webhook] no local row for failed ref ${reference}`);
    return;
  }

  if (paymentRow.status === 'approved') {
    console.warn(`[paystack/webhook] received failed event for already-approved ${reference} — ignoring`);
    return;
  }

  await supabase
    .from('payments')
    .update({
      status:              variant === 'abandoned' ? 'abandoned' : 'failed',
      paystack_status:     variant,
      webhook_received_at: new Date().toISOString(),
      webhook_verified:    true,
    })
    .eq('id', paymentRow.id);
}
