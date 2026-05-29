/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * POST /api/auth/verify-email
 *
 * School-email verification for a pending exec/founder (Blueprint §13.2 Layer 2).
 *
 *   { action: 'request', memberId, email }
 *     - Validates the email's domain against the org (or its seed institution).
 *     - Emails a 6-digit code (15-min expiry).
 *
 *   { action: 'confirm', memberId, code }
 *     - Verifies the code, then promotes the caller's pending member_admins
 *       row(s) to verification_status='email_verified', verification_layer >= 2.
 *
 * Service-role only; codes never reach the client.
 */

import { createClient } from '@supabase/supabase-js';
import { verifyMember } from '../_lib/auth.js';
import { sendEmail, schoolEmailVerifyEmail } from '../_lib/email.js';

const TRUSTED = ['email_verified', 'document_verified', 'admin_verified', 'member_confirmed'];
const PURPOSE = 'exec_school_email';

function maskEmail(email: string): string {
  const [user, domain] = email.split('@');
  if (!domain) return email;
  const head = user.slice(0, 2);
  return `${head}${'*'.repeat(Math.max(1, user.length - 2))}@${domain}`;
}

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE;
  if (!supabaseUrl || !serviceRole) {
    return res.status(500).json({ ok: false, error: 'Server config error: Supabase env missing' });
  }

  const supabase = createClient(supabaseUrl, serviceRole);
  const body = req.body || {};
  const action = String(body.action || '');
  const memberId = String(body.memberId || '');

  const auth = await verifyMember(supabase, memberId);
  if (!auth.valid || !auth.data) {
    return res.status(auth.status || 401).json({ ok: false, error: auth.error || 'Auth failed' });
  }
  const member = auth.data;

  try {
    if (action === 'request') {
      const email = String(body.email || '').trim().toLowerCase();
      if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
        return res.status(400).json({ ok: false, error: 'Enter a valid email address.' });
      }

      // Resolve the org's accepted email domain (org first, then its seed)
      const { data: org } = await supabase
        .from('organizations')
        .select('name, email_domain, seed_institution_id')
        .eq('id', member.organization_id)
        .maybeSingle();

      let domain = (org?.email_domain || '').trim().toLowerCase();
      if (!domain && org?.seed_institution_id) {
        const { data: seed } = await supabase
          .from('seed_institutions')
          .select('email_domain')
          .eq('id', org.seed_institution_id)
          .maybeSingle();
        domain = (seed?.email_domain || '').trim().toLowerCase();
      }

      if (!domain) {
        return res.status(400).json({
          ok: false,
          error: 'Your organization has no verified school-email domain on file yet. Ask the platform admin to set it, or use another verification method.',
        });
      }

      const emailDomain = email.split('@')[1];
      const matches = emailDomain === domain || emailDomain.endsWith('.' + domain);
      if (!matches) {
        return res.status(400).json({ ok: false, error: `Use your @${domain} school email to verify.` });
      }

      const code = String(Math.floor(100000 + Math.random() * 900000));
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

      // Invalidate older unconsumed codes, then store the new one
      await supabase
        .from('email_verifications')
        .update({ consumed_at: new Date().toISOString() })
        .eq('member_id', member.id)
        .eq('purpose', PURPOSE)
        .is('consumed_at', null);

      const { error: insErr } = await supabase.from('email_verifications').insert({
        member_id: member.id,
        organization_id: member.organization_id,
        email,
        code,
        purpose: PURPOSE,
        expires_at: expiresAt,
      });
      if (insErr) {
        console.error('[verify-email] insert error', insErr);
        return res.status(500).json({ ok: false, error: 'Could not start verification. Try again.' });
      }

      const sent = await sendEmail(
        email,
        `Your ${org?.name || 'Payvexo'} verification code`,
        schoolEmailVerifyEmail({ memberName: member.full_name || 'there', orgName: org?.name || 'your organization', code }),
      );

      if (!sent) {
        return res.status(502).json({ ok: false, error: 'Could not send the verification email. Try again shortly.' });
      }
      return res.status(200).json({ ok: true, sentTo: maskEmail(email) });
    }

    if (action === 'confirm') {
      const code = String(body.code || '').trim();
      if (!code) return res.status(400).json({ ok: false, error: 'Enter the code from your email.' });

      const { data: rec } = await supabase
        .from('email_verifications')
        .select('*')
        .eq('member_id', member.id)
        .eq('purpose', PURPOSE)
        .is('consumed_at', null)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!rec) {
        return res.status(400).json({ ok: false, error: 'No active code. Request a new one.' });
      }
      if (new Date(rec.expires_at).getTime() < Date.now()) {
        return res.status(400).json({ ok: false, error: 'That code expired. Request a new one.' });
      }
      if (rec.attempts >= 5) {
        return res.status(429).json({ ok: false, error: 'Too many attempts. Request a new code.' });
      }
      if (String(rec.code) !== code) {
        await supabase.from('email_verifications').update({ attempts: rec.attempts + 1 }).eq('id', rec.id);
        return res.status(400).json({ ok: false, error: 'Incorrect code. Please check and try again.' });
      }

      // Consume the code
      await supabase
        .from('email_verifications')
        .update({ consumed_at: new Date().toISOString() })
        .eq('id', rec.id);

      // Promote the caller's pending exec role(s) to email_verified (Layer 2)
      const { data: updated } = await supabase
        .from('member_admins')
        .update({
          verification_status: 'email_verified',
          verification_method: 'email',
          verification_layer: 2,
          verified_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('member_id', member.id)
        .eq('organization_id', member.organization_id)
        .eq('is_active', true)
        .not('verification_status', 'in', `(${TRUSTED.map((s) => `"${s}"`).join(',')})`)
        .select('id');

      const promoted = (updated || []).length;
      return res.status(200).json({
        ok: true,
        verified: true,
        promoted,
        message: promoted > 0
          ? 'Your school email is verified — your exec role is now active.'
          : 'Email verified. You have no pending exec role to activate; submit a claim to become an exec.',
      });
    }

    return res.status(400).json({ ok: false, error: 'Unknown action.' });
  } catch (err) {
    const e = err as Error;
    console.error('[verify-email] error', e?.stack || e);
    return res.status(500).json({ ok: false, error: 'Verification failed. Please try again.' });
  }
}
