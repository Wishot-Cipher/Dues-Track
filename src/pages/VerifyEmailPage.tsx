/**
 * VerifyEmailPage — a pending founder/exec proves they hold a school email
 * whose domain matches the org, unlocking the admin surface (Blueprint §13.2,
 * Layer 2). Two steps: enter institutional email → enter the 6-digit code.
 *
 * On success the member_admins row flips to email_verified (layer 2), the
 * session is refreshed, and they're sent to the admin dashboard.
 */

import { useState } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, MailCheck, Loader2, ShieldCheck, KeyRound, RefreshCw } from 'lucide-react';
import { useAppNav } from '@/hooks/useAppNav';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useToast } from '@/hooks/useToast';
import { multiTenantAuthService } from '@/services/multiTenantAuthService';

const tk = {
  bg:      '#0F0703',
  panel:   'rgba(255,255,255,0.03)',
  border:  'rgba(255,255,255,0.08)',
  text:    '#FFFFFF',
  textSec: 'rgba(255,255,255,0.65)',
  textTer: 'rgba(255,255,255,0.40)',
  primary: '#FF6803',
  mint:    '#30FFAC',
  inputBg: 'rgba(0,0,0,0.25)',
};

export default function VerifyEmailPage() {
  const { go } = useAppNav();
  const { user, organization, refreshSession } = useMultiTenantAuth();
  const toast = useToast();

  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState(user?.email || '');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const requestCode = async () => {
    if (!user?.id) { toast?.error?.('Sign in required.'); return; }
    const e = email.trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e)) { toast?.error?.('Enter a valid email address.'); return; }
    setBusy(true);
    const res = await multiTenantAuthService.requestSchoolEmailCode(user.id, e);
    setBusy(false);
    if (!res.ok) { toast?.error?.(res.error || 'Could not send the code.'); return; }
    setSentTo(res.sentTo || e);
    setStep('code');
    toast?.success?.('Code sent — check your email.');
  };

  const confirmCode = async () => {
    if (!user?.id) return;
    const c = code.trim();
    if (c.length < 4) { toast?.error?.('Enter the code from your email.'); return; }
    setBusy(true);
    const res = await multiTenantAuthService.confirmSchoolEmailCode(user.id, c);
    setBusy(false);
    if (!res.ok) { toast?.error?.(res.error || 'Could not verify the code.'); return; }
    toast?.success?.(res.message || 'Verified!');
    await refreshSession();
    go('/admin/dashboard');
  };

  return (
    <div className="min-h-screen px-4 sm:px-6 py-6" style={{ background: tk.bg }}>
      <div className="max-w-md mx-auto">
        <button
          onClick={() => go('/dashboard')}
          className="inline-flex items-center gap-1.5 text-sm mb-6"
          style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>

        <div className="flex items-center gap-2 mb-1">
          <ShieldCheck className="w-5 h-5" style={{ color: tk.primary }} />
          <h1 className="text-xl font-bold" style={{ color: tk.text }}>Verify your role</h1>
        </div>
        <p className="text-sm mb-6" style={{ color: tk.textSec }}>
          Confirm a school email for <span style={{ color: tk.text }}>{organization?.name || 'your organization'}</span> to
          unlock creating dues, events and payouts.
        </p>

        {step === 'email' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5" style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
          >
            <label className="block text-xs font-semibold mb-1.5" style={{ color: tk.textSec }}>School email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@school.edu.ng"
              disabled={busy}
              className="w-full rounded-xl px-3 py-2.5 text-sm outline-none mb-4"
              style={{ background: tk.inputBg, border: `1px solid ${tk.border}`, color: tk.text }}
            />
            <motion.button
              onClick={requestCode}
              disabled={busy}
              whileTap={!busy ? { scale: 0.98 } : undefined}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
              style={{ background: tk.primary, color: '#1A0E09' }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <MailCheck className="w-4 h-4" />}
              {busy ? 'Sending…' : 'Send code'}
            </motion.button>
            <p className="text-[11px] mt-3" style={{ color: tk.textTer }}>
              Use the email issued by your institution (it must match the org's domain).
            </p>
          </motion.div>
        )}

        {step === 'code' && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5" style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
          >
            <p className="text-sm mb-4" style={{ color: tk.textSec }}>
              Enter the 6-digit code sent to <span style={{ color: tk.text }}>{sentTo}</span>.
            </p>
            <label className="block text-xs font-semibold mb-1.5" style={{ color: tk.textSec }}>Verification code</label>
            <div className="relative mb-4">
              <KeyRound className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2" style={{ color: tk.textTer }} />
              <input
                inputMode="numeric"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="123456"
                disabled={busy}
                className="w-full rounded-xl pl-9 pr-3 py-2.5 text-base outline-none font-mono tracking-[0.4em]"
                style={{ background: tk.inputBg, border: `1px solid ${tk.border}`, color: tk.text }}
              />
            </div>
            <motion.button
              onClick={confirmCode}
              disabled={busy}
              whileTap={!busy ? { scale: 0.98 } : undefined}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-bold disabled:opacity-50"
              style={{ background: tk.mint, color: '#06281C' }}
            >
              {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
              {busy ? 'Verifying…' : 'Verify & unlock'}
            </motion.button>
            <button
              onClick={() => { setStep('email'); setCode(''); }}
              disabled={busy}
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold"
              style={{ color: tk.textSec }}
            >
              <RefreshCw className="w-3 h-3" /> Use a different email
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
