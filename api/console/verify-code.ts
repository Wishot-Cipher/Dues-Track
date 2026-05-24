/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/console/verify-code
 *
 * Step 2 of the passwordless console login flow.
 *
 * Body: { request_token: string, code: string }
 *
 * Calls verify_admin_login_code RPC and returns the matching
 * platform admin record when verification succeeds.
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;

const exposeErrors = !((globalThis as any).process?.env?.PAYVEXO_HIDE_API_ERRORS === '1');

export default async function handler(req: any, res: any) {
  try {
    return await _handler(req, res);
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

  if (data?.ok === false) {
    return res.status(401).json({ ok: false, error: data?.error || 'Invalid or expired code.' });
  }

  const admin = data?.admin || data?.platform_admin || data?.data || data;
  if (!admin) {
    return res.status(401).json({ ok: false, error: 'Invalid or expired code.' });
  }

  return res.status(200).json({ ok: true, admin });
}