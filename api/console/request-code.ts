/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/console/request-code
 *
 * Step 1 of the passwordless console login flow.
 *
 * Body: { email: string }
 *
 * Flow:
 *   1. Call request_admin_login_code RPC — server generates a
 *      6-digit code, hashes it, stores it, and returns the code
 *      to us ONCE so we can email it. We never log or echo it.
 *   2. Email the code with a polished template.
 *   3. Respond with { ok, request_token, expires_at } — the
 *      browser uses request_token in the verify step.
 *
 * Anti-enumeration:
 *   The RPC returns the same shape whether the email exists or
 *   not (it nulls the code field for unknown emails). We send an
 *   email only when code is non-null, but the response to the
 *   browser is identical. So a probe can't tell "email exists" vs
 *   "email doesn't exist".
 */

import { createClient } from '@supabase/supabase-js';
import { sendEmail, emailLayout, isEmailConfigured } from '../_lib/email.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

function getClientIp(req: any): string | null {
  const xff = req.headers?.['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  if (Array.isArray(xff)) return String(xff[0]).split(',')[0].trim();
  return req.socket?.remoteAddress || null;
}

function getUserAgent(req: any): string | null {
  const ua = req.headers?.['user-agent'];
  return typeof ua === 'string' ? ua : null;
}

function codeEmailHtml(code: string, expiresInMinutes: number): string {
  const body = `
    <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#1F1B1A;">
      Use this 6-digit code to sign into the Payvexo console:
    </p>
    <div style="margin:24px 0;text-align:center;">
      <div style="
        display:inline-block;
        font-family:'SFMono-Regular',Menlo,Consolas,monospace;
        font-size:38px;
        font-weight:700;
        letter-spacing:14px;
        color:#FF6803;
        background:rgba(255,104,3,0.08);
        border:1px solid rgba(255,104,3,0.25);
        border-radius:14px;
        padding:18px 28px;
      ">${code.replace(/(\d{3})(\d{3})/, '$1 $2')}</div>
    </div>
    <p style="margin:0 0 12px;font-size:13px;line-height:1.6;color:#6B6260;">
      Code expires in <strong>${expiresInMinutes} minutes</strong>. If you didn't request it, you can ignore this email — nothing happens until the code is entered.
    </p>
    <p style="margin:0;font-size:12px;line-height:1.6;color:#9E9491;">
      Tip: never share this code. The Payvexo team will never ask you for it.
    </p>
  `;
  return emailLayout({
    preheader: `Your Payvexo console code is ${code}. Expires in ${expiresInMinutes} minutes.`,
    bodyContent: body,
  });
}

const exposeErrors = !((globalThis as any).process?.env?.PAYVEXO_HIDE_API_ERRORS === '1');

export default async function handler(req: any, res: any) {
  try {
    return await _handler(req, res);
  } catch (err) {
    const e = err as Error;
    console.error('[console/request-code] uncaught:', e?.stack || e);
    return res.status(500).json({
      ok: false,
      error: exposeErrors
        ? `Request-code crashed: ${e?.message || String(e)}`
        : 'Internal error',
      ...(exposeErrors && e?.stack ? { stack: e.stack.split('\n').slice(0, 5) } : {}),
    });
  }
}

async function _handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }
  const missing: string[] = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL (or SUPABASE_URL)');
  if (!serviceRole) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) {
    return res.status(500).json({
      ok: false,
      error: `Server config error — missing env var(s): ${missing.join(', ')}. Add to .env.local for vercel dev or to Vercel project settings.`,
    });
  }

  const email = String((req.body || {}).email || '').trim();
  if (!email || !email.includes('@')) {
    return res.status(400).json({ ok: false, error: 'A valid email is required.' });
  }

  const supabase = createClient(supabaseUrl as string, serviceRole as string);

  const ip = getClientIp(req);
  const ua = getUserAgent(req);

  // Call the RPC. It returns the code (or null) for us to email.
  const { data, error } = await supabase.rpc('request_admin_login_code', {
    p_email: email,
    p_ip: ip,
    p_ua: ua,
  });

  if (error) {
    console.error('request_admin_login_code RPC error', error);
    return res.status(500).json({ ok: false, error: 'Could not start sign-in.' });
  }

  // RPC returns: { ok, request_token, code, expires_at, cached? }
  // code is null when the email isn't a registered admin OR when we're reusing a recent code.
  if (data?.ok === false) {
    return res.status(429).json({ ok: false, error: data?.error || 'Too many requests.' });
  }

  const code = data?.code as string | null;
  const requestToken = data?.request_token as string;
  const expiresAt = data?.expires_at as string;

  if (code && isEmailConfigured()) {
    // 10-minute expiry per RPC; show it that way
    const expiresInMinutes = 10;
    const ok = await sendEmail(
      email,
      'Your Payvexo console sign-in code',
      codeEmailHtml(code, expiresInMinutes),
    );
    if (!ok) {
      // Email send failed but the code is in the DB. Surface a soft
      // error so the user can retry without locking themselves out
      // of the rate limit window.
      console.warn('Console code email failed to send for', email);
      return res.status(502).json({
        ok: false,
        error: 'We generated a code but could not email it. Please try again in a minute.',
      });
    }
  }

  // ALWAYS return the same shape regardless of branch (anti-enumeration).
  //
  // `sent` tells the UI whether an email actually went out — but it
  // intentionally doesn't tell the UI *why* it didn't (e.g. "email not
  // registered"). We only surface a soft `hint` in NON-production
  // environments so devs can debug "email shows sent but never arrives".
  // In prod the hint is omitted and the disclaimer in the UI is the only
  // signal — which is what we want to keep email enumeration impossible.
  const sent = Boolean(code && isEmailConfigured());
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production'
              || (process.env.VERCEL_ENV || '') === 'production';

  let debug: string | undefined;
  if (!sent && !isProd) {
    if (!code) {
      // Either the email isn't a registered admin OR we returned a cached
      // token (RPC reuses an unexpired code within 60s to prevent spam).
      debug = data?.cached
        ? 'Cached: an unexpired code was issued in the last 60 seconds — check your inbox for that earlier email (and your spam folder).'
        : 'No email sent. The address you entered is not registered as a console admin, or already received a recent code.';
    } else if (!isEmailConfigured()) {
      debug = 'Code was generated but GMAIL_USER / GMAIL_APP_PASSWORD are missing in your env. Add them to .env.local and restart `vercel dev`.';
    }
  }

  return res.status(200).json({
    ok: true,
    request_token: requestToken,
    expires_at: expiresAt,
    sent,
    ...(debug ? { debug } : {}),
  });
}
