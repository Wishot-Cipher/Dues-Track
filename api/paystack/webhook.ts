/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/paystack/webhook
 *
 * Authoritative server-to-server event receiver for Paystack.
 *
 * What it does:
 *   1. Reads the raw request body (bodyParser disabled so HMAC matches).
 *   2. Verifies the `x-paystack-signature` header — HMAC-SHA512 of the
 *      raw body using PAYSTACK_SECRET_KEY. If it doesn't match → 401.
 *   3. Handles `charge.success` and `charge.failed` events idempotently:
 *      - looks up the local payments row by reference
 *      - if not already approved/failed, updates status + records
 *        webhook timestamps + writes platform_earnings (unique on
 *        payment_id so a double-insert from verify+webhook errors
 *        out cleanly and we just log the dup).
 *   4. ALWAYS responds 200 quickly to Paystack — anything else triggers
 *      a retry storm. Internal errors are logged but we still 200.
 *
 * Why this exists in addition to /api/paystack/verify:
 *   - verify runs from the user's browser when they get redirected back.
 *     If the user closes the tab, verify never fires.
 *   - The webhook runs server-to-server regardless of the user. It's
 *     the SOURCE OF TRUTH for "did Paystack actually settle this".
 *   - Both writes go through the same column set; the unique constraint
 *     on platform_earnings.payment_id guarantees we never double-credit.
 *
 * Configure in Paystack dashboard:
 *   Settings → API Keys & Webhooks → Webhook URL:
 *   https://your-app.vercel.app/api/paystack/webhook
 */

import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

// CRITICAL: disable Vercel's automatic body parser so we get the raw
// request bytes for HMAC verification. If you let it JSON-parse first,
// the re-serialized string won't byte-match what Paystack signed.
export const config = {
  api: { bodyParser: false },
};

const supabaseUrl    = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole    = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
const paystackSecret = process.env.PAYSTACK_SECRET_KEY;

// ── Helpers ──────────────────────────────────────────────────

function getRawBody(req: any): Promise<string> {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding?.('utf8');
    req.on('data', (chunk: string) => { data += chunk; });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function verifySignature(rawBody: string, signature: string | undefined, secret: string): boolean {
  if (!signature || typeof signature !== 'string') return false;
  const expected = crypto.createHmac('sha512', secret).update(rawBody, 'utf8').digest('hex');
  // Constant-time compare prevents timing leaks. Both inputs must be
  // the same length or timingSafeEqual throws — guard with length check.
  if (expected.length !== signature.length) return false;
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
  } catch {
    return false;
  }
}

// ── Handler ──────────────────────────────────────────────────

export default async function handler(req: any, res: any) {
  // Paystack hits this with POST and expects a fast 200. Reject anything
  // else with 405 (Paystack's docs say method-not-allowed is fine).
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  if (!supabaseUrl || !serviceRole || !paystackSecret) {
    // Don't tell Paystack about our env situation — they'd just retry.
    // Log the misconfiguration and return 200 so the retry storm stops.
    console.error('[paystack/webhook] missing server env vars');
    return res.status(200).json({ ok: false, error: 'server-misconfigured' });
  }

  // 1) Raw body for HMAC ─────────────────────────────────────
  let rawBody: string;
  try {
    rawBody = await getRawBody(req);
  } catch (e) {
    console.error('[paystack/webhook] could not read raw body', e);
    return res.status(200).json({ ok: false, error: 'bad-body' });
  }

  // 2) HMAC verification ─────────────────────────────────────
  const signature = (req.headers?.['x-paystack-signature'] ||
                     req.headers?.['X-Paystack-Signature']) as string | undefined;
  if (!verifySignature(rawBody, signature, paystackSecret)) {
    // Unauthorised. This is the ONE place we don't return 200 — we want
    // failed signature checks to be loud + counted by the Paystack side.
    return res.status(401).json({ ok: false, error: 'invalid-signature' });
  }

  // 3) Parse + dispatch ──────────────────────────────────────
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
        // Unhandled event — log + 200 so Paystack stops retrying.
        console.log(`[paystack/webhook] ignored event: ${eventType}`);
    }
  } catch (e) {
    console.error(`[paystack/webhook] handler error (${eventType}):`, e);
    // Still 200 — we don't want Paystack to retry. We'll catch the gap
    // either via the verify endpoint or via a manual reconcile later.
  }

  return res.status(200).json({ ok: true });
}

// ── Event handlers ───────────────────────────────────────────

async function handleChargeSuccess(supabase: any, reference: string, data: any) {
  // Look up our local payment row
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
    // The webhook fired before our init returned and wrote the row?
    // Very rare, but we log instead of crashing. Verify-page will heal it.
    console.warn(`[paystack/webhook] no local row for reference ${reference}`);
    return;
  }

  // Idempotent: if we're already approved, just stamp webhook metadata.
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

  // Write platform_earnings if there's a fee. UNIQUE(payment_id) on the
  // table guarantees idempotency — if verify already inserted, we get a
  // 23505 and silently skip. Anything else is a real error.
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

  // Don't downgrade an already-approved payment from a delayed failed event.
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
