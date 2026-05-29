/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Consolidated console auth endpoint (single serverless function).
 *
 * Routes:
 *   POST /api/console/request-code
 *   POST /api/console/verify-code
 */

import { createClient } from '@supabase/supabase-js';
import { sendEmail, emailLayout, isEmailConfigured } from '../_lib/email.js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

const exposeErrors = !((globalThis as any).process?.env?.PAYVEXO_HIDE_API_ERRORS === '1');

function resolveSubPath(req: any): string {
  const route = req.query?.route;
  if (Array.isArray(route)) return route.join('/');
  if (typeof route === 'string') return route;

  const rawPath = String(req.url || '').split('?')[0];
  const parts = rawPath.split('/').filter(Boolean);
  const idx = parts.indexOf('console');
  if (idx >= 0) return parts.slice(idx + 1).join('/');
  return parts.join('/');
}

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

export default async function handler(req: any, res: any) {
  const subPath = resolveSubPath(req);
  if (!subPath) return res.status(404).json({ ok: false, error: 'Unknown console route' });

  switch (subPath) {
    case 'request-code':
      return handleRequestCode(req, res);
    case 'verify-code':
      return handleVerifyCode(req, res);
    default:
      return res.status(404).json({ ok: false, error: `Unknown console route: ${subPath}` });
  }
}

async function handleRequestCode(req: any, res: any) {
  try {
    return await handleRequestCodeCore(req, res);
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

async function handleRequestCodeCore(req: any, res: any) {
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

  const { data, error } = await supabase.rpc('request_admin_login_code', {
    p_email: email,
    p_ip: ip,
    p_ua: ua,
  });

  if (error) {
    console.error('request_admin_login_code RPC error', error);
    return res.status(500).json({ ok: false, error: 'Could not start sign-in.' });
  }

  if (data?.ok === false) {
    return res.status(429).json({ ok: false, error: data?.error || 'Too many requests.' });
  }

  const code = data?.code as string | null;
  const requestToken = data?.request_token as string;
  const expiresAt = data?.expires_at as string;

  if (code && isEmailConfigured()) {
    const expiresInMinutes = 10;
    const ok = await sendEmail(
      email,
      'Your Payvexo console sign-in code',
      codeEmailHtml(code, expiresInMinutes),
    );
    if (!ok) {
      console.warn('Console code email failed to send for', email);
      return res.status(502).json({
        ok: false,
        error: 'We generated a code but could not email it. Please try again in a minute.',
      });
    }
  }

  const sent = Boolean(code && isEmailConfigured());
  const isProd = (process.env.NODE_ENV || '').toLowerCase() === 'production'
              || (process.env.VERCEL_ENV || '') === 'production';

  let debug: string | undefined;
  if (!sent && !isProd) {
    if (!code) {
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

async function handleVerifyCode(req: any, res: any) {
  try {
    return await handleVerifyCodeCore(req, res);
  } catch (err) {
    const e = err as Error;
    console.error('[console/verify-code] uncaught:', e?.stack || e);
    return res.status(500).json({
      ok: false,
      error: exposeErrors ? `Verify-code crashed: ${e?.message || String(e)}` : 'Internal error',
      ...(exposeErrors && e?.stack ? { stack: e.stack.split('\n').slice(0, 5) } : {}),
    });
  }
}

async function handleVerifyCodeCore(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const missing: string[] = [];
  if (!supabaseUrl) missing.push('VITE_SUPABASE_URL (or SUPABASE_URL)');
  if (!serviceRole) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length) {
    return res.status(500).json({
      ok: false,
      error: `Server config error — missing env var(s): ${missing.join(', ')}.`,
    });
  }

  const requestToken = String((req.body || {}).request_token || '').trim();
  const code = String((req.body || {}).code || '').trim();
  if (!requestToken || !code) {
    return res.status(400).json({ ok: false, error: 'request_token and code are required.' });
  }

  const supabase = createClient(supabaseUrl as string, serviceRole as string);

  const { data, error } = await supabase.rpc('verify_admin_login_code', {
    p_request_token: requestToken,
    p_code: code,
  });

  if (error) {
    console.error('verify_admin_login_code RPC error', error);
    return res.status(500).json({ ok: false, error: 'Could not verify sign-in code.' });
  }

  // verify_admin_login_code RETURNS TABLE → Supabase gives an array of rows.
  // A wrong/expired code yields an EMPTY array (the RPC RETURNs with no row).
  // We must check rows[0], not truthiness of the array (an empty array is truthy).
  const rows = Array.isArray(data) ? data : (data ? [data] : []);
  const admin = rows[0];
  if (!admin || !admin.id) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired code.' });
  }

  return res.status(200).json({ ok: true, admin });
}
