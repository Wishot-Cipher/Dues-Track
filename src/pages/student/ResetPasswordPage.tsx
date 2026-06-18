/**
 * ResetPasswordPage — token-based password reset.
 *
 * Reached via the link in the forgot-password email:
 *   /:orgSlug/reset-password?token=<token>
 *
 * Flow:
 *   1. Read token from URL query params
 *   2. Show new password + confirm password only (no current password)
 *   3. POST { token, newPassword } to /api/password/reset
 *   4. On success → redirect to /:orgSlug/login
 *
 * No session required. The token IS the auth.
 */

import { useState, useEffect } from 'react';
import {
  Lock, CheckCircle, AlertCircle,
  Eye, EyeOff, KeyRound, ArrowLeft,
} from 'lucide-react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '@/components/ui/PageWrapper';

// ── Design tokens ─────────────────────────────────────────────────
const tk = {
  bg:            '#080401',
  surface:       'rgba(255,255,255,0.03)',
  border:        'rgba(255,255,255,0.07)',
  borderFocus:   'rgba(255,104,3,0.55)',
  primary:       '#FF6803',
  primaryGlow:   'rgba(255,104,3,0.22)',
  mint:          '#30FFAC',
  mintBg:        'rgba(48,255,172,0.07)',
  mintBorder:    'rgba(48,255,172,0.2)',
  danger:        '#FF4444',
  dangerBg:      'rgba(255,68,68,0.08)',
  dangerBorder:  'rgba(255,68,68,0.28)',
  warn:          '#F59E0B',
  textPrimary:   '#FFFFFF',
  textSecondary: 'rgba(255,255,255,0.55)',
  textTertiary:  'rgba(255,255,255,0.3)',
  textMuted:     'rgba(255,255,255,0.18)',
};

// ── Strength ───────────────────────────────────────────────────────
const STRENGTH_CONFIG = [
  { label: 'Too short', color: tk.danger,  width: '15%'  },
  { label: 'Weak',      color: '#FF6B35',  width: '30%'  },
  { label: 'Fair',      color: tk.warn,    width: '55%'  },
  { label: 'Good',      color: '#84CC16',  width: '75%'  },
  { label: 'Strong',    color: tk.mint,    width: '100%' },
];

function calcStrength(pw: string): number {
  if (pw.length === 0) return -1;
  if (pw.length < 6)   return 0;
  let s = 1;
  if (pw.length >= 8)           s++;
  if (/[A-Z]/.test(pw))         s++;
  if (/[0-9]/.test(pw))         s++;
  if (/[^A-Za-z0-9]/.test(pw)) s++;
  return Math.min(s, 4);
}

// ── Background geometry ────────────────────────────────────────────
function VaultGeometry() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {[320, 520, 720].map((size, i) => (
        <motion.div
          key={size}
          className="absolute rounded-full border"
          style={{
            width: size, height: size,
            top: '50%', left: '50%',
            marginLeft: -size / 2, marginTop: -size / 2,
            borderColor: `rgba(255,104,3,${0.06 - i * 0.015})`,
          }}
          animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
          transition={{ duration: 60 + i * 30, repeat: Infinity, ease: 'linear' }}
        />
      ))}
      <div className="absolute" style={{
        width: 600, height: 600,
        top: '50%', left: '50%',
        transform: 'translate(-50%, -50%)',
        background: 'radial-gradient(circle, rgba(255,104,3,0.07) 0%, transparent 65%)',
        pointerEvents: 'none',
      }} />
    </div>
  );
}

// ── Secure input ───────────────────────────────────────────────────
function SecureInput({
  label, value, onChange, placeholder, disabled, autoComplete, suffix,
}: {
  label: string; value: string; onChange: (v: string) => void;
  placeholder: string; disabled?: boolean; autoComplete?: string;
  suffix?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-2">
      <label className="block text-xs font-semibold uppercase tracking-[0.12em]"
        style={{ color: focused ? tk.primary : tk.textTertiary }}>
        {label}
      </label>
      <div className="relative flex items-center rounded-2xl transition-all duration-200"
        style={{
          background: focused ? 'rgba(255,104,3,0.04)' : tk.surface,
          border: `1px solid ${focused ? tk.borderFocus : tk.border}`,
          boxShadow: focused ? `0 0 0 3px ${tk.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.03)` : 'none',
        }}>
        <Lock className="absolute left-4 w-4 h-4 shrink-0 transition-colors duration-200"
          style={{ color: focused ? tk.primary : tk.textMuted }} />
        <input
          type={show ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full pl-11 pr-11 py-3.5 bg-transparent text-sm text-white placeholder:text-white/15 outline-none font-mono tracking-wider"
        />
        <button type="button" onClick={() => setShow(s => !s)} tabIndex={-1}
          className="absolute right-4 p-0.5 transition-colors duration-150"
          style={{ color: show ? tk.primary : tk.textMuted }}>
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {suffix}
    </div>
  );
}

// ── Strength meter ─────────────────────────────────────────────────
function StrengthMeter({ password }: { password: string }) {
  const strength = calcStrength(password);
  if (strength < 0) return null;
  const cfg = STRENGTH_CONFIG[strength];
  const reqs = [
    { label: 'At least 8 characters', met: password.length >= 8 },
    { label: 'Uppercase letter',       met: /[A-Z]/.test(password) },
    { label: 'Number',                 met: /[0-9]/.test(password) },
    { label: 'Special character',      met: /[^A-Za-z0-9]/.test(password) },
  ];
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }}
      className="mt-3 space-y-3 overflow-hidden">
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: tk.textTertiary }}>
            Strength
          </span>
          <motion.span key={cfg.label} initial={{ opacity: 0, x: 6 }} animate={{ opacity: 1, x: 0 }}
            className="text-[10px] font-bold uppercase tracking-widest" style={{ color: cfg.color }}>
            {cfg.label}
          </motion.span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <motion.div className="h-full rounded-full"
            style={{ background: cfg.color, boxShadow: `0 0 8px ${cfg.color}80` }}
            animate={{ width: cfg.width }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }} />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        {reqs.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5">
            <motion.div animate={{ scale: r.met ? [1, 1.3, 1] : 1 }} transition={{ duration: 0.25 }}>
              {r.met
                ? <CheckCircle className="w-3 h-3" style={{ color: tk.mint }} />
                : <div className="w-3 h-3 rounded-full border" style={{ borderColor: tk.border }} />}
            </motion.div>
            <span className="text-[10px] leading-tight"
              style={{ color: r.met ? tk.textSecondary : tk.textMuted }}>
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Banner ────────────────────────────────────────────────────────
function Banner({ variant, icon, children }: {
  variant: 'info' | 'error' | 'success' | 'warn';
  icon: React.ReactNode; children: React.ReactNode;
}) {
  const styles = {
    info:    { bg: tk.mintBg,   border: tk.mintBorder,   color: tk.mint   },
    error:   { bg: tk.dangerBg, border: tk.dangerBorder, color: tk.danger  },
    success: { bg: 'rgba(48,255,172,0.09)', border: 'rgba(48,255,172,0.25)', color: tk.mint },
    warn:    { bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.25)', color: tk.warn },
  }[variant];
  return (
    <motion.div className="flex items-start gap-3 p-4 rounded-2xl text-sm leading-6"
      style={{ background: styles.bg, border: `1px solid ${styles.border}`, color: styles.color }}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}>
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </motion.div>
  );
}

// ── Submit button ─────────────────────────────────────────────────
function SubmitButton({ loading, disabled, children }: {
  loading?: boolean; disabled?: boolean; children: React.ReactNode;
}) {
  const isDisabled = loading || disabled;
  return (
    <motion.button type="submit" disabled={isDisabled}
      className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide relative overflow-hidden"
      style={{
        background: isDisabled ? 'rgba(255,255,255,0.06)' : 'linear-gradient(135deg, #FF6803 0%, #FF9040 100%)',
        color: isDisabled ? tk.textMuted : '#fff',
        boxShadow: isDisabled ? 'none' : '0 10px 30px rgba(255,104,3,0.4)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${isDisabled ? tk.border : 'transparent'}`,
      }}
      whileHover={!isDisabled ? { scale: 1.015, boxShadow: '0 14px 36px rgba(255,104,3,0.5)' } : {}}
      whileTap={!isDisabled ? { scale: 0.985 } : {}}
      transition={{ duration: 0.15 }}>
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <motion.span className="w-4 h-4 border-2 rounded-full border-white/25 border-t-white block"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }} />
          Setting new password…
        </span>
      ) : children}
      {!isDisabled && (
        <motion.div className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
          animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }} />
      )}
    </motion.button>
  );
}

// ── Main page ─────────────────────────────────────────────────────
type Step = 'reset' | 'done';

export default function ResetPasswordPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const token = searchParams.get('token');

  const [step, setStep] = useState<Step>('reset');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // If no token in URL, show an error immediately
  const [tokenMissing] = useState(!token);

  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit = !loading && newPassword.length >= 8 && passwordsMatch;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!token) {
      setError('Reset link is invalid or has expired. Please request a new one.');
      return;
    }
    if (newPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });
      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success) {
        setError(data.error || 'Failed to reset password. The link may have expired.');
        return;
      }

      setStep('done');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // Redirect to login after success
  useEffect(() => {
    if (step !== 'done') return;
    const t = setTimeout(() => {
      navigate(orgSlug ? `/${orgSlug}/login` : '/');
    }, 2800);
    return () => clearTimeout(t);
  }, [step, orgSlug, navigate]);

  const loginPath = orgSlug ? `/${orgSlug}/login` : '/';

  return (
    <PageWrapper centered noPadding className="min-h-screen p-4 sm:p-8">
      <div
        className="relative w-full max-w-lg min-h-screen sm:min-h-0 sm:rounded-[40px] overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, #0b0502 0%, #0f0603 100%)',
          border: '1px solid rgba(255,104,3,0.1)',
          boxShadow: '0 40px 120px rgba(0,0,0,0.9)',
        }}
      >
        <VaultGeometry />

        <div className="relative z-10 p-8 sm:p-12">

          {/* Back to login */}
          <motion.div className="mb-8" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <button onClick={() => navigate(loginPath)}
              className="inline-flex items-center gap-1.5 text-xs font-medium"
              style={{ color: tk.textTertiary }}>
              <ArrowLeft className="w-3.5 h-3.5" />
              Back to login
            </button>
          </motion.div>

          <AnimatePresence mode="wait">

            {/* ── Token missing ── */}
            {tokenMissing && (
              <motion.div key="no-token" className="space-y-6 text-center py-8"
                initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}>
                <div className="w-16 h-16 rounded-2xl mx-auto flex items-center justify-center"
                  style={{ background: tk.dangerBg, border: `1px solid ${tk.dangerBorder}` }}>
                  <AlertCircle className="w-8 h-8" style={{ color: tk.danger }} />
                </div>
                <div>
                  <h2 className="text-2xl font-extrabold text-white mb-2">Link invalid</h2>
                  <p className="text-sm" style={{ color: tk.textSecondary }}>
                    This reset link is missing or malformed. Please request a new one from the login page.
                  </p>
                </div>
                <button onClick={() => navigate(loginPath)}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-2xl text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(135deg, #FF6803, #FF9040)' }}>
                  Go to login
                </button>
              </motion.div>
            )}

            {/* ── Reset form ── */}
            {!tokenMissing && step === 'reset' && (
              <motion.div key="reset" className="space-y-6"
                initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}>

                {/* Header */}
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4"
                    style={{ background: `${tk.primary}15`, color: tk.primary, border: `1px solid ${tk.primary}25` }}>
                    <KeyRound className="w-3.5 h-3.5" />
                    Password Reset
                  </div>
                  <h2 className="text-3xl font-extrabold text-white">Set new password</h2>
                  <p className="mt-2 text-sm leading-6" style={{ color: tk.textSecondary }}>
                    Choose a strong password. You'll use it to sign in from now on.
                  </p>
                </div>

                <AnimatePresence>
                  {error && (
                    <Banner variant="error" icon={<AlertCircle className="w-4 h-4" />}>
                      {error}
                    </Banner>
                  )}
                </AnimatePresence>

                <form onSubmit={handleSubmit} className="space-y-5">
                  <SecureInput
                    label="New Password"
                    value={newPassword}
                    onChange={setNewPassword}
                    placeholder="At least 8 characters"
                    disabled={loading}
                    autoComplete="new-password"
                    suffix={
                      <AnimatePresence>
                        {newPassword && <StrengthMeter password={newPassword} />}
                      </AnimatePresence>
                    }
                  />

                  <SecureInput
                    label="Confirm New Password"
                    value={confirmPassword}
                    onChange={setConfirmPassword}
                    placeholder="Re-enter new password"
                    disabled={loading}
                    autoComplete="new-password"
                    suffix={
                      <AnimatePresence>
                        {confirmPassword && (
                          <motion.div className="flex items-center gap-2 mt-2"
                            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                            {passwordsMatch ? (
                              <>
                                <CheckCircle className="w-3.5 h-3.5" style={{ color: tk.mint }} />
                                <span className="text-xs font-medium" style={{ color: tk.mint }}>
                                  Passwords match
                                </span>
                              </>
                            ) : (
                              <>
                                <AlertCircle className="w-3.5 h-3.5" style={{ color: tk.danger }} />
                                <span className="text-xs font-medium" style={{ color: tk.danger }}>
                                  Passwords don't match
                                </span>
                              </>
                            )}
                          </motion.div>
                        )}
                      </AnimatePresence>
                    }
                  />

                  <SubmitButton loading={loading} disabled={!canSubmit}>
                    <span className="flex items-center justify-center gap-2">
                      <Lock className="w-4 h-4" />
                      Set new password
                    </span>
                  </SubmitButton>
                </form>

                <p className="text-center text-xs" style={{ color: tk.textTertiary }}>
                  This link expires after 1 hour and can only be used once.
                </p>
              </motion.div>
            )}

            {/* ── Done ── */}
            {step === 'done' && (
              <motion.div key="done"
                className="flex flex-col items-center text-center py-8 space-y-6"
                initial={{ opacity: 0, scale: 0.94 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ duration: 0.5, type: 'spring', stiffness: 180 }}>

                <div className="relative">
                  <motion.div
                    className="w-24 h-24 rounded-[28px] flex items-center justify-center"
                    style={{
                      background: 'linear-gradient(135deg, rgba(48,255,172,0.15), rgba(48,255,172,0.05))',
                      border: '1px solid rgba(48,255,172,0.25)',
                    }}
                    initial={{ scale: 0.6, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}>
                    <CheckCircle className="w-12 h-12" style={{ color: tk.mint }} />
                  </motion.div>
                  {[1, 2].map((i) => (
                    <motion.div key={i} className="absolute inset-0 rounded-[28px]"
                      style={{ border: '1px solid rgba(48,255,172,0.3)' }}
                      animate={{ scale: [1, 1.5 + i * 0.3], opacity: [0.6, 0] }}
                      transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.4, ease: 'easeOut' }} />
                  ))}
                </div>

                <div>
                  <h2 className="text-3xl font-extrabold text-white">Password updated!</h2>
                  <p className="mt-3 text-sm leading-6" style={{ color: tk.textSecondary }}>
                    Your password has been reset successfully.
                    <br />Taking you to login…
                  </p>
                </div>

                <motion.div className="w-full max-w-xs h-1 rounded-full overflow-hidden"
                  style={{ background: 'rgba(255,255,255,0.07)' }}>
                  <motion.div className="h-full rounded-full"
                    style={{ background: tk.mint }}
                    initial={{ width: '0%' }}
                    animate={{ width: '100%' }}
                    transition={{ duration: 2.6, ease: 'linear' }} />
                </motion.div>

                <button onClick={() => navigate(loginPath)}
                  className="text-sm font-semibold underline underline-offset-2"
                  style={{ color: tk.primary }}>
                  Go to login now
                </button>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </div>
    </PageWrapper>
  );
}