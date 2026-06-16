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
import { verifyMember, verifyAdmin } from '../_lib/auth.js';

const TRUSTED_VERIFICATION = ['email_verified', 'document_verified', 'admin_verified', 'member_confirmed'];

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

// ── Fee math ─────────────────────────────────────────────────
// Model: the ORG always nets EXACTLY the dues it set. We add a single,
// transparent SERVICE FEE on top (the student pays it), sized to:
//   (a) COVER Paystack's processing cost so the org is never shorted, and
//   (b) an optional platform MARGIN (default 0 — set per-org from the
//       console once trust is built).
// The split is configured (transaction_charge = serviceFee, bearer =
// 'account') so the subaccount's slice (total − serviceFee = dues) is
// never touched by Paystack's fee.

// Paystack NGN local pricing, WORST case = bank transfer: 1.5% + ₦100 flat
// on amounts over ₦2,500, capped at ₦2,000. Card has no ₦100 flat — so
// grossing up for transfer means the org is never shorted on ANY channel
// (a card payer's lower fee just leaves a few naira in the platform
// account). Ref: paystack.com/pricing.
const PS_PERCENT = 0.015;
const PS_FLAT_KOBO = 10000;            // ₦100
const PS_FLAT_THRESHOLD_KOBO = 250000; // ₦2,500
const PS_CAP_KOBO = 200000;            // ₦2,000

// Paystack's fee on a charged amount (worst-case transfer).
function paystackFeeKobo(amountKobo: number): number {
  let fee = Math.ceil(amountKobo * PS_PERCENT);
  if (amountKobo > PS_FLAT_THRESHOLD_KOBO) fee += PS_FLAT_KOBO;
  return Math.min(fee, PS_CAP_KOBO);
}

// The "cover" — the amount that, added to the dues, lets Paystack take its
// (worst-case) fee while the org still nets EXACTLY the dues. Grossed up so
// the fee is computed on the total, the ₦2,000 cap respected, rounded up a
// hair so the platform's main account is never short when it bears the fee.
function paystackCoverKobo(duesKobo: number): number {
  // T = (D + flat) / (1 − percent); cover = T − D. Drop the flat if the
  // grossed-up total stays under the ₦2,500 threshold.
  let total = (duesKobo + PS_FLAT_KOBO) / (1 - PS_PERCENT);
  if (total <= PS_FLAT_THRESHOLD_KOBO) total = duesKobo / (1 - PS_PERCENT);
  let cover = Math.ceil(total - duesKobo);
  if (cover > PS_CAP_KOBO) cover = PS_CAP_KOBO;
  // Never below the actual fee on (dues + cover).
  const actual = paystackFeeKobo(duesKobo + cover);
  if (cover < actual) cover = actual;
  return cover;
}

// Optional platform margin ON TOP of the Paystack cover. Defaults to 0 —
// the org nets the dues and the student pays only Paystack's true cost
// until a margin is configured per-org from the console.
const DEFAULT_FEE_PERCENT = 0;
const DEFAULT_FEE_FLAT_KOBO = 0;
const DEFAULT_FEE_MIN_KOBO = 0;
const DEFAULT_FEE_CAP_KOBO = 200000; // ₦2,000 — sane upper bound on margin

function computeMarginKobo(
  duesKobo: number,
  cfg: { percent?: number; flat?: number; min?: number; cap?: number; mode?: string },
): number {
  const mode = (cfg.mode || 'percent').toLowerCase();
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
    case 'banks':
      return handleListBanks(req, res);
    case 'subaccount':
      return handleSubaccount(req, res, body);
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

  const { memberId, paymentTypeId, callbackPath, tierId, guestName, guestEmail } = body || {};
  const isGuestCheckout = !memberId;
  let member: any = null;

  if (!paymentTypeId || typeof paymentTypeId !== 'string') {
    return res.status(400).json({ ok: false, error: 'paymentTypeId is required' });
  }

  // Phase 1 — auth + payment-type lookup run in PARALLEL. They're
  // independent (one keys off memberId, the other off paymentTypeId), so
  // awaiting them serially just doubled the latency before redirect. This
  // (and Phase 2 below) is the bulk of why "tap Pay" felt slow.
  const [auth, ptRes] = await Promise.all([
    isGuestCheckout ? Promise.resolve(null) : verifyMember(supabase, memberId),
    supabase.from('payment_types').select('*').eq('id', paymentTypeId).maybeSingle(),
  ]);

  if (!isGuestCheckout) {
    if (!auth || !auth.valid || !auth.data) {
      return res.status(auth?.status || 401).json({ ok: false, error: auth?.error || 'Auth failed' });
    }
    member = auth.data;
  }

  const { data: pt, error: ptErr } = ptRes;
  if (ptErr) {
    console.error('payment_type lookup failed', ptErr);
    return res.status(500).json({ ok: false, error: `Lookup failed: ${ptErr.message || 'unknown'}` });
  }
  if (!pt) {
    return res.status(404).json({ ok: false, error: 'Payment type not found.' });
  }
  if (pt.is_active === false) {
    return res.status(400).json({ ok: false, error: 'This payment is no longer accepting contributions.' });
  }
  if (pt.accepts_paystack === false) {
    return res.status(400).json({ ok: false, error: 'This payment is not configured for online checkout.' });
  }

  if (isGuestCheckout) {
    if (pt.category !== 'event' || !pt.is_public) {
      return res.status(403).json({ ok: false, error: 'This event is not open for public checkout.' });
    }
    if (!guestName || typeof guestName !== 'string' || !guestName.trim()) {
      return res.status(400).json({ ok: false, error: 'guestName is required' });
    }
    if (!guestEmail || typeof guestEmail !== 'string' || !guestEmail.trim()) {
      return res.status(400).json({ ok: false, error: 'guestEmail is required' });
    }
  } else if (member?.organization_id !== pt.organization_id) {
    return res.status(403).json({ ok: false, error: 'Payment type not found in your organization' });
  }

  const isDue = pt.category !== 'event' && Number(pt.amount) > 0;
  const isEvent = pt.category === 'event';

  // Dues are never guest-payable (events only) — fail fast before spending
  // more round-trips.
  if (isDue && isGuestCheckout) {
    return res.status(403).json({ ok: false, error: 'Public checkout is only available for event tickets.' });
  }

  // Phase 2 — everything that only needs `pt` (+ the member) runs in
  // PARALLEL: resolve the org (for fees), the double-payment guard, the
  // event tiers, and retiring stale pending inits. Previously four serial
  // awaits. The retire-update only touches OLD pending rows, never the
  // fresh one we insert below, so it's safe in the same batch.
  const [orgRes, priorRes, tiersRes] = await Promise.all([
    supabase
      .from('organizations')
      .select('id, slug, name, currency_code, platform_fee_percent, platform_fee_flat, platform_fee_min, platform_fee_cap, platform_fee_mode, paystack_subaccount_code')
      .eq('id', pt.organization_id)
      .maybeSingle(),
    (isDue && !isGuestCheckout)
      ? supabase
          .from('payments')
          .select('amount')
          .eq('member_id', member.id)
          .eq('payment_type_id', pt.id)
          .in('status', ['approved', 'successful', 'paid'])
      : Promise.resolve({ data: null as any }),
    isEvent
      ? supabase
          .from('event_ticket_tiers')
          .select('id, name, price, quantity, sold_count, is_active')
          .eq('payment_type_id', pt.id)
          .eq('is_active', true)
      : Promise.resolve({ data: null as any }),
    (!isGuestCheckout)
      ? supabase
          .from('payments')
          .update({ status: 'abandoned' })
          .eq('member_id', member.id)
          .eq('payment_type_id', pt.id)
          .eq('status', 'pending')
          .is('paystack_status', null)
      : Promise.resolve(null),
  ]);

  const { data: org, error: orgErr } = orgRes;
  if (orgErr || !org) {
    return res.status(500).json({ ok: false, error: 'Could not resolve organization.' });
  }

  // ── Double-payment guard (dues only) ──
  // A due that's already fully paid must not be payable again. (Events are
  // tickets — a member may legitimately buy more than one, so skip them.)
  if (isDue) {
    const alreadyPaid = (priorRes.data || []).reduce((s: number, r: any) => s + Number(r.amount || 0), 0);
    if (alreadyPaid >= Number(pt.amount)) {
      return res.status(409).json({ ok: false, error: 'You have already paid this due.' });
    }
  }

  // Events: the price comes from the chosen ticket tier, not pt.amount.
  let baseNaira = Number(pt.amount);
  let resolvedTierId: string | null = null;
  if (isEvent) {
    const tierList = tiersRes.data || [];
    if (tierList.length > 0) {
      const chosen = tierId ? tierList.find((t: any) => t.id === tierId) : null;
      if (!chosen) {
        return res.status(400).json({ ok: false, error: 'Please choose a ticket type.' });
      }
      if (chosen.quantity != null && Number(chosen.sold_count) >= Number(chosen.quantity)) {
        return res.status(400).json({ ok: false, error: `"${chosen.name}" is sold out.` });
      }
      baseNaira = Number(chosen.price);
      resolvedTierId = chosen.id;
    }
  }

  const duesKobo = Math.round(baseNaira * 100);
  if (!duesKobo || duesKobo < 100) {
    return res.status(400).json({ ok: false, error: 'Invalid payment amount.' });
  }
  // Per-org fee (set from the Platform Console — a 'pro'/'enterprise' org
  // simply has a lower platform_fee_percent/cap). Falls back to the system
  // default when the org hasn't been configured.
  // Optional platform margin (default 0). Set per-org from the console.
  const marginKobo = computeMarginKobo(duesKobo, {
    percent: org.platform_fee_percent ?? undefined,
    flat:    org.platform_fee_flat ?? undefined,
    min:     org.platform_fee_min ?? undefined,
    cap:     org.platform_fee_cap ?? undefined,
    mode:    org.platform_fee_mode ?? undefined,
  });
  // Cover Paystack's fee so the org nets EXACTLY the dues, then add the
  // margin. This single serviceFee is what the student pays on top.
  const coverKobo = org.paystack_subaccount_code ? paystackCoverKobo(duesKobo) : 0;
  const serviceFeeKobo = coverKobo + marginKobo;
  const totalKobo = duesKobo + serviceFeeKobo;

  const payerEmail = isGuestCheckout
    ? String(guestEmail).trim()
    : (member.email || `${member.member_id}@payvexo.app`);
  const payerName = isGuestCheckout
    ? String(guestName).trim()
    : member.full_name;

  // Pre-generate the row id so the Paystack reference is derived BEFORE the
  // insert. The old code inserted, then issued a SECOND update purely to
  // stamp the reference back onto the row — an extra write on the hot path.
  // Providing the id up front folds it into a single insert.
  const paymentId = crypto.randomUUID();
  const reference = genReference(paymentId);

  const paymentRow: Record<string, unknown> = {
    id:                  paymentId,
    organization_id:     pt.organization_id,
    group_id:            isGuestCheckout ? null : member.group_id,
    member_id:           isGuestCheckout ? null : member.id,
    payment_type_id:     pt.id,
    event_tier_id:       resolvedTierId,
    amount:              baseNaira,
    dues_amount_kobo:    duesKobo,
    platform_fee_kobo:   marginKobo,
    total_charged_kobo:  totalKobo,
    currency_code:       (pt.currency_code || org.currency_code || 'NGN').toUpperCase(),
    payment_method:      'paystack',
    status:              'pending',
    payer_email:         payerEmail,
    payer_name:          payerName,
    paystack_reference:  reference,
    transaction_ref:     reference,
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
        organization_id:  pt.organization_id,
        member_id:        isGuestCheckout ? null : member.id,
        group_id:         isGuestCheckout ? null : member.group_id,
      dues_kobo:        duesKobo,
      platform_fee_kobo: marginKobo,
      service_fee_kobo: serviceFeeKobo,
      total_kobo:       totalKobo,
      currency_code:    paymentRow.currency_code,
        payer_name:       payerName,
        payer_email:      payerEmail,
        guest_checkout:   isGuestCheckout,
    },
  };

  if (org.paystack_subaccount_code) {
    // Split so the ORG NETS EXACTLY THE DUES. transaction_charge (the full
    // service fee) goes to the platform's main account, which BEARS
    // Paystack's processing fee out of it (bearer:'account'). The
    // subaccount's slice is therefore total − serviceFee = dues, untouched.
    // The platform keeps serviceFee − Paystack's fee (≈ the configured
    // margin; ~0 by default). Without a subaccount the whole charge lands
    // in the platform account — the org must register its bank to collect.
    paystackBody.subaccount = org.paystack_subaccount_code;
    paystackBody.transaction_charge = serviceFeeKobo;
    paystackBody.bearer = 'account';
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

  const psJson: any = await psRes.json().catch(() => ({}));
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
    .select('id, status, paystack_status, organization_id, group_id, member_id, payment_type_id, event_tier_id, dues_amount_kobo, platform_fee_kobo, total_charged_kobo, currency_code, amount, payer_email, payer_name')
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
    const ticketResult = await supabase.rpc('issue_event_ticket', { p_payment_id: paymentRow.id });
    return res.status(200).json({
      ok: true,
      status: 'approved',
      payment: paymentRow,
      ticket_code: ticketResult?.data?.ticket_code || null,
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

  const psJson: any = await psRes.json().catch(() => ({}));
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

    // If this was an event purchase, mint the ticket (idempotent; no-ops for dues)
    const ticketResult = await supabase.rpc('issue_event_ticket', { p_payment_id: paymentRow.id });

    return res.status(200).json({
      ok: true,
      status: 'approved',
      payment: { ...paymentRow, status: 'approved', paystack_status: 'success' },
      ticket_code: ticketResult?.data?.ticket_code || null,
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

  // Mint an event ticket if this payment was for an event (idempotent; no-ops for dues)
  await supabase.rpc('issue_event_ticket', { p_payment_id: paymentRow.id });
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

// ── /banks — list Nigerian banks for the payout-setup dropdown ─
async function handleListBanks(req: any, res: any) {
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!paystackSecret) return res.status(500).json({ ok: false, error: 'Server config error: PAYSTACK_SECRET_KEY missing' });
  try {
    const r = await fetch('https://api.paystack.co/bank?country=nigeria&currency=NGN&perPage=100', {
      headers: { Authorization: `Bearer ${paystackSecret}` },
    });
    const j: any = await r.json().catch(() => ({}));
    if (!r.ok || j?.status !== true) {
      return res.status(502).json({ ok: false, error: j?.message || 'Could not load banks.' });
    }
    const banks = (j.data || []).map((b: any) => ({ name: b.name, code: b.code }));
    return res.status(200).json({ ok: true, banks });
  } catch {
    return res.status(502).json({ ok: false, error: 'Could not reach Paystack.' });
  }
}

// ── /subaccount — resolve the org's bank account + create/update
//    its Paystack subaccount so dues settle to the org's own bank.
//    Until this is set, all charges land in the platform account.
async function handleSubaccount(req: any, res: any, body: any) {
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });
  if (!supabaseUrl || !serviceRole) return res.status(500).json({ ok: false, error: 'Server config error: Supabase env missing' });
  if (!paystackSecret) return res.status(500).json({ ok: false, error: 'Server config error: PAYSTACK_SECRET_KEY missing' });

  const supabase = createClient(supabaseUrl, serviceRole);
  // `groupId` is the new tier-aware extension: when present, the
  // subaccount is persisted on organization_groups (via mig 092's
  // set_group_payout RPC) instead of on the org. Each tier owns its
  // own money plumbing — strict ownership, no cascade — so a class
  // rep's class collects to the class's bank, not the org's.
  const { memberId, bankCode, accountNumber, businessName, groupId, password } = body || {};

  // Caller must be an admin with settings permission...
  const auth = await verifyAdmin(supabase, memberId, 'can_manage_settings');
  if (!auth.valid || !auth.data) {
    return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'Admin access required' });
  }
  const orgId = auth.data.organization_id;

  // ── Payout security Layer 2: password re-verification (mig 106/107).
  //    Proves the person redirecting where money settles is actually
  //    the account holder, not someone who grabbed an unlocked phone.
  //    Checked BEFORE Paystack so a wrong password costs nothing. ──
  if (!password || typeof password !== 'string') {
    return res.status(400).json({ ok: false, error: 'Confirm your password to change payout details.' });
  }
  const { data: pwOk, error: pwErr } = await supabase.rpc('verify_member_password', {
    p_member_id: auth.data.id,
    p_password: password,
  });
  if (pwErr || !pwOk) {
    return res.status(401).json({ ok: false, error: 'Incorrect password. Payout details were not changed.' });
  }

  // ...and that admin must be VERIFIED (trusted) — a pending exec can't set payout.
  const { data: verifiedRow } = await supabase
    .from('member_admins')
    .select('id')
    .eq('member_id', auth.data.id)
    .eq('organization_id', orgId)
    .eq('is_active', true)
    .in('verification_status', TRUSTED_VERIFICATION)
    .limit(1)
    .maybeSingle();
  if (!verifiedRow) {
    return res.status(403).json({ ok: false, error: 'Only a verified exec can set up the payout account.' });
  }

  // ── Payout security Layer 1: finance-role gate (mig 106).
  //    Only president / treasurer / fin sec (can_manage_payout) may
  //    touch payout. set_group_payout enforces this again server-side
  //    (defense in depth); we check here for a clean early error and
  //    to cover the org-level direct-update path below too. ──
  // Bounded so a stalled query (e.g. a group-hierarchy cycle before
  // mig 112's depth guard is applied) fails fast instead of hanging
  // the whole payout request. 8s is far past a healthy round-trip.
  let payoutOk: boolean | null = null;
  try {
    const payoutCheck = await Promise.race([
      supabase.rpc('can_member_manage_payout', {
        p_member_id: auth.data.id,
        p_group_id: groupId || null,
      }),
      new Promise<{ data: null }>((_, reject) =>
        setTimeout(() => reject(new Error('payout-check-timeout')), 8_000),
      ),
    ]);
    payoutOk = (payoutCheck as { data: boolean | null }).data;
  } catch {
    return res.status(503).json({
      ok: false,
      error: 'Could not verify your payout permission in time. Please try again (and ensure migration 112 has been applied).',
    });
  }
  if (!payoutOk) {
    return res.status(403).json({
      ok: false,
      error: 'Only the president, treasurer or financial secretary can manage the payout account.',
    });
  }

  if (!bankCode || !accountNumber || String(accountNumber).replace(/\D/g, '').length < 10) {
    return res.status(400).json({ ok: false, error: 'A valid bank and 10-digit account number are required.' });
  }
  const acctNum = String(accountNumber).replace(/\D/g, '');

  // 1) Resolve the account → confirm it's real + get the account name.
  //    Bounded to 12s so a slow/unreachable Paystack fails fast with a
  //    clear error rather than hanging the request (which surfaced as
  //    "the payout service took too long" on the client).
  let resolveJson: any;
  try {
    const rc = new AbortController();
    const rt = setTimeout(() => rc.abort(), 12_000);
    let rr: Response;
    try {
      rr = await fetch(
        `https://api.paystack.co/bank/resolve?account_number=${encodeURIComponent(acctNum)}&bank_code=${encodeURIComponent(bankCode)}`,
        { headers: { Authorization: `Bearer ${paystackSecret}` }, signal: rc.signal },
      );
    } finally {
      clearTimeout(rt);
    }
    resolveJson = await rr.json().catch(() => ({}));
    if (!rr.ok || resolveJson?.status !== true) {
      return res.status(400).json({ ok: false, error: resolveJson?.message || 'Could not verify that account number with the selected bank.' });
    }
  } catch {
    return res.status(502).json({ ok: false, error: 'Could not reach Paystack to verify the account. Please try again.' });
  }
  const accountName = resolveJson?.data?.account_name || null;

  // 2) Resolve the BUSINESS context. For a tier-scoped setup we pull
  //    the group's name + any existing subaccount; otherwise we pull
  //    the org's. Either way we read the existing subaccount so a
  //    re-setup updates Paystack in place rather than creating a
  //    duplicate.
  let businessLabel: string | null = null;
  let existingSubaccount: string | null = null;

  if (groupId) {
    const { data: g } = await supabase
      .from('organization_groups')
      .select('id, organization_id, name, paystack_subaccount_code')
      .eq('id', groupId)
      .maybeSingle();
    if (!g) {
      return res.status(400).json({ ok: false, error: 'Target group not found.' });
    }
    if (g.organization_id !== orgId) {
      return res.status(403).json({ ok: false, error: "Target group isn't in your organization." });
    }
    businessLabel      = g.name as string;
    existingSubaccount = (g.paystack_subaccount_code as string) || null;
  } else {
    const { data: org } = await supabase
      .from('organizations')
      .select('id, name, paystack_subaccount_code')
      .eq('id', orgId)
      .maybeSingle();
    businessLabel      = (org?.name as string) || null;
    existingSubaccount = (org?.paystack_subaccount_code as string) || null;
  }

  const subBusinessName = (businessName && String(businessName).trim())
    || businessLabel
    || accountName
    || 'Payvexo Org';

  // 3) Create or update the subaccount (percentage_charge 0 — the platform
  //    keeps its fee via transaction_charge on each payment, not here)
  const payload = {
    business_name: subBusinessName,
    settlement_bank: bankCode,
    account_number: acctNum,
    percentage_charge: 0,
  };

  let saJson: any;
  try {
    const url = existingSubaccount
      ? `https://api.paystack.co/subaccount/${encodeURIComponent(existingSubaccount)}`
      : 'https://api.paystack.co/subaccount';
    const sr = await fetch(url, {
      method: existingSubaccount ? 'PUT' : 'POST',
      headers: { Authorization: `Bearer ${paystackSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    saJson = await sr.json().catch(() => ({}));
    if (!sr.ok || saJson?.status !== true) {
      return res.status(502).json({ ok: false, error: saJson?.message || 'Could not create the payout account.' });
    }
  } catch {
    return res.status(502).json({ ok: false, error: 'Could not reach Paystack to create the payout account.' });
  }

  const subaccountCode = saJson?.data?.subaccount_code;
  const subaccountId   = saJson?.data?.id != null ? String(saJson.data.id) : null;

  // 4) Persist — tier-aware. Groups go through set_group_payout (mig 092)
  //    which validates that the caller actually owns this tier. Org
  //    falls back to the legacy direct UPDATE on organizations.
  if (groupId) {
    const { data: setResult, error: setErr } = await supabase.rpc('set_group_payout', {
      p_caller_member_id:         auth.data.id,
      p_group_id:                 groupId,
      p_paystack_subaccount_code: subaccountCode,
      p_paystack_subaccount_id:   subaccountId,
      p_bank_name:                null,        // can be enriched later from listBanks()
      p_bank_code:                bankCode,
      p_account_name:             accountName,
      p_account_number:           acctNum,
    });
    if (setErr || !(setResult as { ok?: boolean })?.ok) {
      const code = (setResult as { code?: string })?.code;
      console.error('[paystack/subaccount] set_group_payout error', setErr, setResult);
      return res.status(500).json({
        ok: false,
        error: code === 'not_your_group'
          ? "You're not authorised to set payout for this tier."
          : 'Payout account created with Paystack but could not be saved on the tier. Contact support.',
      });
    }
  } else {
    // Capture the prior org account so the audit row records old→new.
    const { data: priorOrg } = await supabase
      .from('organizations')
      .select('paystack_account_number, paystack_settlement_bank')
      .eq('id', orgId)
      .maybeSingle();
    const priorAcct = (priorOrg as { paystack_account_number?: string | null })?.paystack_account_number || '';
    const hadOrgAccount = priorAcct.trim() !== '';

    const { error: updErr } = await supabase
      .from('organizations')
      .update({
        paystack_subaccount_code: subaccountCode,
        paystack_settlement_bank: bankCode,
        paystack_account_number: acctNum,
        paystack_account_name: accountName,
        paystack_business_name: subBusinessName,
        paystack_verified: true,
        updated_at: new Date().toISOString(),
      })
      .eq('id', orgId);
    if (updErr) {
      console.error('[paystack/subaccount] org update error', updErr);
      return res.status(500).json({ ok: false, error: 'Payout account created but could not be saved. Contact support.' });
    }

    // Org-level audit (the group path writes its own row inside
    // set_group_payout; org direct-update mirrors it here). group_id
    // NULL marks this as an org-tier change. Best-effort — never block
    // a successful payout save on the audit write.
    void supabase.from('payout_audit').insert({
      organization_id: orgId,
      group_id: null,
      changed_by: auth.data.id,
      changed_by_name: (auth.data as { full_name?: string }).full_name || null,
      action: hadOrgAccount ? 'change' : 'setup',
      old_account_last4: priorAcct.slice(-4),
      new_account_last4: acctNum.slice(-4),
      old_bank_code: (priorOrg as { paystack_settlement_bank?: string | null })?.paystack_settlement_bank || null,
      new_bank_code: bankCode,
    });
  }

  return res.status(200).json({
    ok: true,
    subaccount_code: subaccountCode,
    account_name: accountName,
    bank_code: bankCode,
    account_number: acctNum,
    group_id: groupId || null,
  });
}
