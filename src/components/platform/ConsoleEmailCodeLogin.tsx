/**
 * ConsoleEmailCodeLogin — passwordless email-code sign-in for the
 * Payvexo platform console.
 *
 * Two-step flow:
 *   1. Email step  — user types email → POST /api/console/request-code
 *                    → server emails a 6-digit code → we get back a
 *                    request_token
 *   2. Code step   — user types the 6 digits → verify_admin_login_code
 *                    RPC exchanges it for a session token → onLogin()
 *
 * Backed by mig 050 + api/console/request-code.ts.
 *
 * Visual: matches the rest of the platform (dark canvas, brand orange,
 * mint for success). Uses framer-motion for the step transition and a
 * segmented 6-cell input for the code (paste-friendly, autosubmits).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  KeyRound,
  Loader2,
  Mail,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import {
  platformAdminRequestCode,
  platformAdminVerifyCode,
  type PlatformAdmin,
} from '@/services/platformAdminService';

const tk = {
  bg:       '#0F0703',
  panel:    'rgba(255,255,255,0.03)',
  border:   'rgba(255,255,255,0.08)',
  text:     '#FFFFFF',
  textSec:  'rgba(255,255,255,0.65)',
  textTer:  'rgba(255,255,255,0.40)',
  primary:  '#FF6803',
  primaryHi:'#FFAC5F',
  mint:     '#30FFAC',
  danger:   '#ef4444',
};

const CODE_LEN = 6;

interface Props {
  onLogin: (admin: PlatformAdmin) => void;
  /**
   * If true, also render a small "use password instead" link that
   * defers to the existing password form (caller decides how that's
   * rendered). Default true while migrating to passwordless.
   */
  showPasswordFallback?: boolean;
  onPasswordFallback?: () => void;
}

type Step = 'email' | 'code' | 'success';

export default function ConsoleEmailCodeLogin({
  onLogin,
  showPasswordFallback = true,
  onPasswordFallback,
}: Props) {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [requestToken, setRequestToken] = useState<string | null>(null);
  const [expiresAt, setExpiresAt] = useState<string | null>(null);
  const [requestSent, setRequestSent] = useState(false);
  const [requestDebug, setRequestDebug] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Code state — array of single chars
  const [codeChars, setCodeChars] = useState<string[]>(
    () => Array.from({ length: CODE_LEN }, () => ''),
  );
  const cellRefs = useRef<(HTMLInputElement | null)[]>([]);
  const codeJoined = useMemo(() => codeChars.join(''), [codeChars]);

  // Countdown for expiry
  const [secondsLeft, setSecondsLeft] = useState<number | null>(null);
  useEffect(() => {
    if (!expiresAt) return;
    const tick = () => {
      const ms = new Date(expiresAt).getTime() - Date.now();
      setSecondsLeft(Math.max(0, Math.floor(ms / 1000)));
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [expiresAt]);

  // ── Step 1 — request code ──
  const submitEmail = useCallback(async () => {
    if (!email.trim() || busy) return;
    setBusy(true);
    setError(null);

    const res = await platformAdminRequestCode(email);

    setBusy(false);
    if (!res.ok) {
      setError(res.error || 'Could not request a code.');
      return;
    }
    setRequestToken(res.request_token ?? null);
    setExpiresAt(res.expires_at ?? null);
    setRequestSent(Boolean(res.sent));
    setRequestDebug(res.debug ?? null);
    setStep('code');
    // Focus first cell after the transition
    setTimeout(() => cellRefs.current[0]?.focus(), 320);
  }, [email, busy]);

  // ── Step 2 — verify code ──
  const submitCode = useCallback(async () => {
    if (codeJoined.length < CODE_LEN || busy || !requestToken) return;
    setBusy(true);
    setError(null);

    try {
      const admin = await platformAdminVerifyCode(requestToken, codeJoined);
      setStep('success');
      // Give the success state a beat to show, then hand off
      setTimeout(() => onLogin(admin), 800);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Verification failed.');
      // Clear code so they can retype
      setCodeChars(Array.from({ length: CODE_LEN }, () => ''));
      setTimeout(() => cellRefs.current[0]?.focus(), 0);
    } finally {
      setBusy(false);
    }
  }, [codeJoined, busy, requestToken, onLogin]);

  // Auto-submit when all 6 cells filled
  useEffect(() => {
    if (step === 'code' && codeJoined.length === CODE_LEN && !busy) {
      void submitCode();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeJoined]);

  // ── Cell input handlers ──
  const onCellChange = (i: number, v: string) => {
    setError(null);
    const ch = v.replace(/\D/g, '').slice(0, 1);
    setCodeChars((prev) => {
      const next = [...prev];
      next[i] = ch;
      return next;
    });
    if (ch && i < CODE_LEN - 1) cellRefs.current[i + 1]?.focus();
  };
  const onCellKey = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeChars[i] && i > 0) cellRefs.current[i - 1]?.focus();
    else if (e.key === 'ArrowLeft' && i > 0)             { e.preventDefault(); cellRefs.current[i - 1]?.focus(); }
    else if (e.key === 'ArrowRight' && i < CODE_LEN - 1) { e.preventDefault(); cellRefs.current[i + 1]?.focus(); }
    else if (e.key === 'Enter' && codeJoined.length === CODE_LEN) void submitCode();
  };
  const onCellPaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, CODE_LEN);
    if (!pasted) return;
    setCodeChars(Array.from({ length: CODE_LEN }, (_, i) => pasted[i] ?? ''));
    const focusIdx = Math.min(pasted.length, CODE_LEN - 1);
    setTimeout(() => cellRefs.current[focusIdx]?.focus(), 0);
  };

  const resend = async () => {
    setError(null);
    setCodeChars(Array.from({ length: CODE_LEN }, () => ''));
    setStep('email');
    // Trigger another request right away — user already entered the email
    await submitEmail();
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4" style={{ background: tk.bg, minHeight: '100dvh' }}>
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <motion.div
          className="absolute rounded-full blur-[180px]"
          style={{
            width: 600, height: 600,
            background: `radial-gradient(circle, ${tk.primary} 0%, transparent 70%)`,
            top: '-12%', right: '-10%', opacity: 0.18,
          }}
          animate={{ opacity: [0.16, 0.22, 0.16] }}
          transition={{ duration: 5, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative w-full max-w-md"
      >
        <div
          className="rounded-3xl p-7 sm:p-8"
          style={{ background: tk.panel, border: `1px solid ${tk.border}`, backdropFilter: 'blur(12px)' }}
        >
          {/* Header */}
          <div className="text-center mb-7">
            <motion.div
              initial={{ scale: 0.8, rotate: -10 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 220, damping: 18 }}
              className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(255,104,3,0.20) 0%, rgba(48,255,172,0.18) 100%)',
                border: `1px solid ${tk.primary}40`,
              }}
            >
              <ShieldCheck className="w-7 h-7" style={{ color: tk.primary }} />
            </motion.div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-white tracking-tight">
              Payvexo console
            </h1>
            <p className="text-xs sm:text-sm mt-1.5" style={{ color: tk.textSec }}>
              {step === 'email' && 'Enter your email — we\'ll send a sign-in code.'}
              {step === 'code'  && `Code sent to ${email}. Check your inbox.`}
              {step === 'success' && 'Verified. Loading the console…'}
            </p>
          </div>

          <AnimatePresence mode="wait">
            {/* ── STEP: EMAIL ────────────────────────────────────────────── */}
            {step === 'email' && (
              <motion.form
                key="email"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.24 }}
                onSubmit={(e) => { e.preventDefault(); void submitEmail(); }}
                className="space-y-4"
              >
                <label className="block">
                  <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: tk.textSec }}>
                    <Mail className="w-3 h-3 inline-block mr-1.5" />Email
                  </span>
                  <input
                    type="email"
                    autoFocus
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@payvexo.com"
                    className="mt-1.5 w-full rounded-xl px-3.5 py-3 text-sm outline-none transition-colors"
                    style={{
                      background: 'rgba(26,14,9,0.85)',
                      border: `1px solid ${tk.border}`,
                      color: tk.text,
                      caretColor: tk.primary,
                    }}
                    onFocus={(e) => { e.currentTarget.style.borderColor = `${tk.primary}50`; e.currentTarget.style.boxShadow = `0 0 0 3px ${tk.primary}14`; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = tk.border; e.currentTarget.style.boxShadow = 'none'; }}
                  />
                </label>

                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="text-xs flex items-start gap-1.5"
                      style={{ color: tk.danger }}
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>{error}</span>
                    </motion.p>
                  )}
                </AnimatePresence>

                <motion.button
                  type="submit"
                  disabled={busy || !email.includes('@')}
                  className="w-full px-5 py-3.5 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
                    boxShadow: busy || !email.includes('@') ? 'none' : '0 8px 28px rgba(255,104,3,0.4)',
                  }}
                  whileHover={!busy && email.includes('@') ? { scale: 1.02 } : undefined}
                  whileTap={!busy && email.includes('@') ? { scale: 0.97 } : undefined}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {busy ? 'Sending code…' : 'Send sign-in code'}
                  {!busy && <ArrowRight className="w-4 h-4" />}
                </motion.button>

                <p className="text-[11px] text-center" style={{ color: tk.textTer }}>
                  No password needed. The code lasts 10 minutes.
                </p>

                {showPasswordFallback && onPasswordFallback && (
                  <button
                    type="button"
                    onClick={onPasswordFallback}
                    className="block mx-auto text-[11px] mt-2 hover:underline"
                    style={{ color: tk.textTer }}
                  >
                    Use password instead
                  </button>
                )}
              </motion.form>
            )}

            {/* ── STEP: CODE ─────────────────────────────────────────────── */}
            {step === 'code' && (
              <motion.div
                key="code"
                initial={{ opacity: 0, x: 12 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -12 }}
                transition={{ duration: 0.24 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-center gap-1.5 sm:gap-2">
                  {codeChars.map((c, i) => (
                    <input
                      key={i}
                      ref={(el) => { cellRefs.current[i] = el; }}
                      type="text"
                      inputMode="numeric"
                      maxLength={1}
                      value={c}
                      onChange={(e) => onCellChange(i, e.target.value)}
                      onKeyDown={(e) => onCellKey(i, e)}
                      onPaste={i === 0 ? onCellPaste : undefined}
                      onFocus={(e) => {
                        e.currentTarget.style.borderColor = 'rgba(255,104,3,0.60)';
                        e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255,104,3,0.18)';
                        e.currentTarget.select();
                      }}
                      onBlur={(e) => {
                        const filled = Boolean(c);
                        e.currentTarget.style.borderColor = filled ? 'rgba(255,104,3,0.35)' : 'rgba(255,255,255,0.10)';
                        e.currentTarget.style.boxShadow = filled ? '0 4px 12px rgba(255,104,3,0.15)' : 'none';
                      }}
                      autoComplete="off"
                      spellCheck={false}
                      className="w-11 h-13 sm:w-12 sm:h-14 text-center font-mono font-bold text-xl sm:text-2xl rounded-xl outline-none transition-all"
                      style={{
                        background: c ? 'rgba(255,104,3,0.10)' : 'rgba(26,14,9,0.85)',
                        border: `1.5px solid ${c ? 'rgba(255,104,3,0.35)' : 'rgba(255,255,255,0.10)'}`,
                        color: tk.text,
                        caretColor: tk.primary,
                        boxShadow: c ? '0 4px 12px rgba(255,104,3,0.15)' : 'none',
                      }}
                    />
                  ))}
                </div>

                {/* Status + countdown */}
                {requestSent ? (
                  <p className="text-[11px] text-center" style={{ color: tk.textTer }}>
                    {typeof secondsLeft === 'number' && secondsLeft > 0
                      ? `Code sent. Check your inbox & spam folder. Expires in ${Math.floor(secondsLeft / 60)}:${String(secondsLeft % 60).padStart(2, '0')}.`
                      : 'Code expired. Send a new one.'}
                  </p>
                ) : (
                  <div className="text-[11px] text-center space-y-2" style={{ color: tk.textTer }}>
                    <p>
                      If this email is a registered admin and a code was already sent recently,
                      we used the existing one to avoid spamming you. Check your inbox &amp; spam.
                    </p>
                    {requestDebug && (
                      <p
                        className="rounded-lg px-3 py-2 inline-block max-w-[420px] text-left"
                        style={{
                          background: 'rgba(255,172,95,0.08)',
                          border: '1px solid rgba(255,172,95,0.22)',
                          color: tk.primaryHi,
                        }}
                      >
                        <strong>Dev hint:</strong> {requestDebug}
                      </p>
                    )}
                  </div>
                )}

                <AnimatePresence>
                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="text-xs flex items-start gap-1.5 justify-center text-center"
                      style={{ color: tk.danger }}
                    >
                      <AlertCircle className="w-3.5 h-3.5 shrink-0 mt-px" />
                      <span>{error}</span>
                    </motion.p>
                  )}
                </AnimatePresence>

                <motion.button
                  type="button"
                  onClick={() => void submitCode()}
                  disabled={busy || codeJoined.length < CODE_LEN}
                  className="w-full px-5 py-3 rounded-2xl text-white font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-40"
                  style={{
                    background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
                    boxShadow: busy || codeJoined.length < CODE_LEN ? 'none' : '0 8px 28px rgba(255,104,3,0.4)',
                  }}
                  whileHover={!busy && codeJoined.length === CODE_LEN ? { scale: 1.02 } : undefined}
                  whileTap={!busy && codeJoined.length === CODE_LEN ? { scale: 0.97 } : undefined}
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {busy ? 'Verifying…' : 'Verify and sign in'}
                </motion.button>

                <div className="flex items-center justify-between text-[11px]" style={{ color: tk.textTer }}>
                  <button
                    type="button"
                    onClick={() => { setStep('email'); setError(null); }}
                    className="inline-flex items-center gap-1 hover:text-white"
                  >
                    <ArrowLeft className="w-3 h-3" /> Change email
                  </button>
                  <button
                    type="button"
                    onClick={() => void resend()}
                    className="hover:text-white"
                  >
                    Resend code
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── STEP: SUCCESS ──────────────────────────────────────────── */}
            {step === 'success' && (
              <motion.div
                key="success"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0 }}
                className="text-center"
              >
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 230, damping: 18 }}
                  className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center"
                  style={{ background: 'rgba(48,255,172,0.10)', border: '1px solid rgba(48,255,172,0.28)' }}
                >
                  <CheckCircle2 className="w-8 h-8" style={{ color: tk.mint }} strokeWidth={2.4} />
                </motion.div>
                <p className="text-sm" style={{ color: tk.textSec }}>Welcome back.</p>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <p className="text-[10px] text-center mt-4" style={{ color: tk.textTer }}>
          Protected. Codes are single-use and expire in 10 minutes.
        </p>
      </motion.div>
    </div>
  );
}
