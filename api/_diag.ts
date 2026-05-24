/* eslint-disable @typescript-eslint/no-explicit-any */
// `process` lives on Node — no @types/node in this app's tsconfig, so we
// punt to `any` rather than fight the type checker for a diagnostic file.
const proc = ((globalThis as any).process ?? { env: {}, versions: {} }) as {
  env: Record<string, string | undefined>;
  versions?: { node?: string };
};
/**
 * GET /api/_diag
 *
 * Reports which environment variables are present (boolean only —
 * never reveals values). Use it to debug "why am I getting 500s"
 * without grepping logs.
 *
 *   curl https://your-app.vercel.app/api/_diag
 *
 * Or in the browser: open /api/_diag while running `vercel dev`.
 *
 * Safe to ship to production — no secrets leak. Returns all-or-nothing
 * presence flags for every server-side env var the app uses.
 */

const VARS = [
  // Supabase
  'VITE_SUPABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SERVICE_ROLE_KEY',
  'SUPABASE_SERVICE_ROLE',
  'VITE_SUPABASE_ANON_KEY',
  // Paystack
  'PAYSTACK_SECRET_KEY',
  'PAYSTACK_PUBLIC_KEY',
  // Email
  'GMAIL_USER',
  'GMAIL_APP_PASSWORD',
  'FROM_EMAIL',
  // Push notifications
  'VAPID_PUBLIC_KEY',
  'VAPID_PRIVATE_KEY',
  'VAPID_EMAIL',
  // App
  'VITE_APP_URL',
  'NEXT_PUBLIC_APP_URL',
];

export default function handler(req: any, res: any) {
  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'GET only' });
  }

  const present: Record<string, boolean> = {};
  for (const k of VARS) {
    present[k] = Boolean(proc.env[k]);
  }

  // Convenience checks: what's needed for which flow
  const needs = {
    paystack_init: {
      ready: Boolean(
        (proc.env.VITE_SUPABASE_URL || proc.env.SUPABASE_URL) &&
        (proc.env.SUPABASE_SERVICE_ROLE_KEY || proc.env.SUPABASE_SERVICE_ROLE) &&
        proc.env.PAYSTACK_SECRET_KEY,
      ),
      requires: ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'PAYSTACK_SECRET_KEY'],
    },
    console_email_code: {
      ready: Boolean(
        (proc.env.VITE_SUPABASE_URL || proc.env.SUPABASE_URL) &&
        (proc.env.SUPABASE_SERVICE_ROLE_KEY || proc.env.SUPABASE_SERVICE_ROLE) &&
        proc.env.GMAIL_USER &&
        proc.env.GMAIL_APP_PASSWORD,
      ),
      requires: ['VITE_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'GMAIL_USER', 'GMAIL_APP_PASSWORD'],
    },
    push_notifications: {
      ready: Boolean(
        proc.env.VAPID_PUBLIC_KEY &&
        proc.env.VAPID_PRIVATE_KEY,
      ),
      requires: ['VAPID_PUBLIC_KEY', 'VAPID_PRIVATE_KEY'],
    },
  };

  return res.status(200).json({
    ok: true,
    runtime: proc.versions?.node ? `node ${proc.versions.node}` : 'unknown',
    env_vars_present: present,
    flows: needs,
    hint: 'Each flow shows `ready: true` only when all its `requires` env vars are present. If a flow is not ready, add the missing vars to .env.local (for `vercel dev`) or to Vercel Project Settings → Environment Variables (for production).',
  });
}
