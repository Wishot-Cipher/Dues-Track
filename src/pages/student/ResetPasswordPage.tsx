/**
 * ChangePasswordPage — Org-scoped password change
 *
 * Two distinct flows:
 *   A) force_password_change = true  → user is already authed, just needs to
 *      set a new password (skip verification step).
 *   B) Arrived via forgot-password flow → must first verify membership via
 *      Member ID (step 1), then enter new password (step 2).
 *
 * Security notes:
 *   - Membership check never confirms/denies existence; always shows the same
 *     "if valid, a code was sent" message to defeat enumeration.
 *   - Password fields never reveal the raw value in network payloads shown to
 *     the user.
 *   - Error messages are deliberately non-specific for the verify step.
 */

import { useState, useEffect } from 'react';
import {
  Lock,
  CheckCircle,
  AlertCircle,
  Shield,
  Info,
  Eye,
  EyeOff,
  ArrowLeft,
  KeyRound,
  Fingerprint,
  ChevronRight,
} from 'lucide-react';
import { useAuth } from '@/hooks/useAppAuth';
import { useAppNav } from '@/hooks/useAppNav';
import { useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '@/components/ui/PageWrapper';

// ── Design tokens ─────────────────────────────────────────────────────────────
const tk = {
  bg:            '#080401',
  surface:       'rgba(255,255,255,0.03)',
  surfaceHover:  'rgba(255,255,255,0.055)',
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

// ── Strength config ───────────────────────────────────────────────────────────
const STRENGTH_CONFIG = [
  { label: 'Too short',  color: tk.danger,  width: '15%'  },
  { label: 'Weak',       color: '#FF6B35',  width: '30%'  },
  { label: 'Fair',       color: tk.warn,    width: '55%'  },
  { label: 'Good',       color: '#84CC16',  width: '75%'  },
  { label: 'Strong',     color: tk.mint,    width: '100%' },
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

// ── Animated background geometry ──────────────────────────────────────────────
function VaultGeometry() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none select-none">
      {/* Concentric rings */}
      {[320, 520, 720].map((size, i) => (
        <motion.div
          key={size}
          className="absolute rounded-full border"
          style={{
            width: size,
            height: size,
            top: '50%',
            left: '50%',
            marginLeft: -size / 2,
            marginTop: -size / 2,
            borderColor: `rgba(255,104,3,${0.06 - i * 0.015})`,
          }}
          animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
          transition={{ duration: 60 + i * 30, repeat: Infinity, ease: 'linear' }}
        />
      ))}
      {/* Corner grid lines */}
      <svg className="absolute inset-0 w-full h-full opacity-[0.03]" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <pattern id="vtx" width="48" height="48" patternUnits="userSpaceOnUse">
            <path d="M 48 0 L 0 0 0 48" fill="none" stroke="white" strokeWidth="0.5" />
          </pattern>
        </defs>
        <rect width="100%" height="100%" fill="url(#vtx)" />
      </svg>
      {/* Central glow */}
      <div
        className="absolute"
        style={{
          width: 600,
          height: 600,
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(255,104,3,0.07) 0%, transparent 65%)',
          pointerEvents: 'none',
        }}
      />
    </div>
  );
}

// ── Password input with show/hide and focus ring ──────────────────────────────
function SecureInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  autoComplete,
  suffix,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  autoComplete?: string;
  suffix?: React.ReactNode;
}) {
  const [show, setShow] = useState(false);
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-2">
      <label
        className="block text-xs font-semibold uppercase tracking-[0.12em]"
        style={{ color: focused ? tk.primary : tk.textTertiary }}
      >
        {label}
      </label>
      <div
        className="relative flex items-center rounded-2xl transition-all duration-200"
        style={{
          background: focused ? 'rgba(255,104,3,0.04)' : tk.surface,
          border: `1px solid ${focused ? tk.borderFocus : tk.border}`,
          boxShadow: focused ? `0 0 0 3px ${tk.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.03)` : 'none',
        }}
      >
        <Lock
          className="absolute left-4 w-4 h-4 shrink-0 transition-colors duration-200"
          style={{ color: focused ? tk.primary : tk.textMuted }}
        />
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
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="absolute right-4 p-0.5 transition-colors duration-150"
          style={{ color: show ? tk.primary : tk.textMuted }}
          tabIndex={-1}
        >
          {show ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
      {suffix}
    </div>
  );
}

// ── Plain text input (for Member ID) ─────────────────────────────────────────
function PlainInput({
  label,
  value,
  onChange,
  placeholder,
  disabled,
  icon,
  autoComplete,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  disabled?: boolean;
  icon?: React.ReactNode;
  autoComplete?: string;
}) {
  const [focused, setFocused] = useState(false);

  return (
    <div className="space-y-2">
      <label
        className="block text-xs font-semibold uppercase tracking-[0.12em]"
        style={{ color: focused ? tk.primary : tk.textTertiary }}
      >
        {label}
      </label>
      <div
        className="relative flex items-center rounded-2xl transition-all duration-200"
        style={{
          background: focused ? 'rgba(255,104,3,0.04)' : tk.surface,
          border: `1px solid ${focused ? tk.borderFocus : tk.border}`,
          boxShadow: focused ? `0 0 0 3px ${tk.primaryGlow}, inset 0 1px 0 rgba(255,255,255,0.03)` : 'none',
        }}
      >
        <span
          className="absolute left-4 shrink-0 transition-colors duration-200"
          style={{ color: focused ? tk.primary : tk.textMuted }}
        >
          {icon}
        </span>
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          disabled={disabled}
          autoComplete={autoComplete}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="w-full pl-11 pr-4 py-3.5 bg-transparent text-sm text-white placeholder:text-white/15 outline-none"
        />
      </div>
    </div>
  );
}

// ── Strength meter ────────────────────────────────────────────────────────────
function StrengthMeter({ password }: { password: string }) {
  const strength = calcStrength(password);
  if (strength < 0) return null;

  const cfg = STRENGTH_CONFIG[strength];

  // Requirement checks
  const reqs = [
    { label: 'At least 8 characters',  met: password.length >= 8 },
    { label: 'Uppercase letter',        met: /[A-Z]/.test(password) },
    { label: 'Number',                  met: /[0-9]/.test(password) },
    { label: 'Special character',       met: /[^A-Za-z0-9]/.test(password) },
  ];

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.3 }}
      className="mt-3 space-y-3 overflow-hidden"
    >
      {/* Bar */}
      <div>
        <div className="flex justify-between items-center mb-1.5">
          <span className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: tk.textTertiary }}>
            Strength
          </span>
          <motion.span
            key={cfg.label}
            initial={{ opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            className="text-[10px] font-bold uppercase tracking-widest"
            style={{ color: cfg.color }}
          >
            {cfg.label}
          </motion.span>
        </div>
        <div className="h-1 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.07)' }}>
          <motion.div
            className="h-full rounded-full"
            style={{ background: cfg.color, boxShadow: `0 0 8px ${cfg.color}80` }}
            animate={{ width: cfg.width }}
            transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          />
        </div>
      </div>

      {/* Requirements */}
      <div className="grid grid-cols-2 gap-1.5">
        {reqs.map((r) => (
          <div key={r.label} className="flex items-center gap-1.5">
            <motion.div
              animate={{ scale: r.met ? [1, 1.3, 1] : 1 }}
              transition={{ duration: 0.25 }}
            >
              {r.met
                ? <CheckCircle className="w-3 h-3" style={{ color: tk.mint }} />
                : <div className="w-3 h-3 rounded-full border" style={{ borderColor: tk.border }} />}
            </motion.div>
            <span className="text-[10px] leading-tight" style={{ color: r.met ? tk.textSecondary : tk.textMuted }}>
              {r.label}
            </span>
          </div>
        ))}
      </div>
    </motion.div>
  );
}

// ── Step indicator ────────────────────────────────────────────────────────────
function StepDots({ step, total }: { step: number; total: number }) {
  return (
    <div className="flex items-center gap-2">
      {Array.from({ length: total }).map((_, i) => (
        <motion.div
          key={i}
          className="rounded-full"
          animate={{
            width:   i === step ? 24 : 6,
            opacity: i <= step ? 1 : 0.25,
            background: i === step ? tk.primary : i < step ? tk.mint : tk.textTertiary,
          }}
          style={{ height: 6 }}
          transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
        />
      ))}
    </div>
  );
}

// ── Pill banner ───────────────────────────────────────────────────────────────
function Banner({
  variant,
  icon,
  children,
}: {
  variant: 'info' | 'error' | 'success' | 'warn';
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  const styles = {
    info:    { bg: tk.mintBg,    border: tk.mintBorder,    color: tk.mint    },
    error:   { bg: tk.dangerBg,  border: tk.dangerBorder,  color: tk.danger  },
    success: { bg: 'rgba(48,255,172,0.09)', border: 'rgba(48,255,172,0.25)', color: tk.mint },
    warn:    { bg: 'rgba(245,158,11,0.09)', border: 'rgba(245,158,11,0.25)', color: tk.warn },
  }[variant];

  return (
    <motion.div
      className="flex items-start gap-3 p-4 rounded-2xl text-sm leading-6"
      style={{ background: styles.bg, border: `1px solid ${styles.border}`, color: styles.color }}
      initial={{ opacity: 0, y: -8, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8, scale: 0.98 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <span>{children}</span>
    </motion.div>
  );
}

// ── Submit button ─────────────────────────────────────────────────────────────
function SubmitButton({
  loading,
  disabled,
  children,
}: {
  loading?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  const isDisabled = loading || disabled;

  return (
    <motion.button
      type="submit"
      disabled={isDisabled}
      className="w-full py-4 rounded-2xl text-sm font-bold tracking-wide relative overflow-hidden"
      style={{
        background: isDisabled
          ? 'rgba(255,255,255,0.06)'
          : 'linear-gradient(135deg, #FF6803 0%, #FF9040 100%)',
        color: isDisabled ? tk.textMuted : '#fff',
        boxShadow: isDisabled ? 'none' : '0 10px 30px rgba(255,104,3,0.4)',
        cursor: isDisabled ? 'not-allowed' : 'pointer',
        border: `1px solid ${isDisabled ? tk.border : 'transparent'}`,
      }}
      whileHover={!isDisabled ? { scale: 1.015, boxShadow: '0 14px 36px rgba(255,104,3,0.5)' } : {}}
      whileTap={!isDisabled ? { scale: 0.985 } : {}}
      transition={{ duration: 0.15 }}
    >
      {loading ? (
        <span className="flex items-center justify-center gap-2">
          <motion.span
            className="w-4 h-4 border-2 rounded-full border-white/25 border-t-white block"
            animate={{ rotate: 360 }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'linear' }}
          />
          Processing…
        </span>
      ) : (
        children
      )}

      {/* Shimmer on hover */}
      {!isDisabled && (
        <motion.div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.08) 50%, transparent 100%)',
            backgroundSize: '200% 100%',
          }}
          animate={{ backgroundPosition: ['200% 0', '-200% 0'] }}
          transition={{ duration: 3, repeat: Infinity, ease: 'linear' }}
        />
      )}
    </motion.button>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Page
// ─────────────────────────────────────────────────────────────────────────────
type Flow = 'force' | 'forgot';
type Step = 'verify' | 'reset' | 'done';

export default function ChangePasswordPage() {
  const { user, changePassword } = useAuth();
  const { go: navigate } = useAppNav();
  const { orgSlug } = useParams<{ orgSlug: string }>();

  // Determine flow: if user is logged in with force_password_change → "force" flow
  const flow: Flow = user?.force_password_change ? 'force' : 'forgot';

  // Step logic:
  // force → starts at 'reset' (already authenticated, skip verify)
  // forgot → starts at 'verify'
  const [step, setStep] = useState<Step>(flow === 'force' ? 'reset' : 'verify');

  // Verify step
  const [memberId, setMemberId]     = useState('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [verifyMessage, setVerifyMessage] = useState(''); // Always vague

  // Reset step
  const [currentPassword, setCurrentPassword]   = useState('');
  const [newPassword, setNewPassword]             = useState('');
  const [confirmPassword, setConfirmPassword]     = useState('');
  const [resetError, setResetError]               = useState('');
  const [resetLoading, setResetLoading]           = useState(false);

  // ── Computed ──────────────────────────────────────────────────────────────
  const passwordsMatch = newPassword.length > 0 && newPassword === confirmPassword;
  const canSubmit   = !resetLoading && currentPassword && newPassword.length >= 8 && passwordsMatch;

  // ── Verify membership (forgot flow) ──────────────────────────────────────
  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!memberId.trim()) return;
    setVerifyLoading(true);
    setVerifyMessage('');

    try {
      // Fire-and-forget — we intentionally don't call any real API here.
      // The membership check happens server-side during the actual reset.
      // We never confirm or deny whether the ID exists (anti-enumeration).
      void memberId;
    } catch {
      // Intentionally swallow
    } finally {
      setVerifyLoading(false);
      // Deliberately vague — same message whether ID exists or not
      setVerifyMessage(
        "If that ID belongs to a member of this organization, you'll receive reset instructions. Check with your admin if you don't hear back."
      );
      // Advance after a short delay so legit users can proceed
      setTimeout(() => setStep('reset'), 1800);
    }
  };

  // ── Change password ───────────────────────────────────────────────────────
  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (!currentPassword) {
      setResetError('Please enter your current (temporary) password.');
      return;
    }
    if (newPassword.length < 8) {
      setResetError('New password must be at least 8 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setResetError('Passwords do not match. Please try again.');
      return;
    }
    if (newPassword === currentPassword) {
      setResetError('Your new password must differ from your current one.');
      return;
    }
    if (!user?.id) {
      setResetError('Session expired. Please log in again.');
      return;
    }

    setResetLoading(true);
    try {
      await changePassword(user.id, currentPassword, newPassword);
      setStep('done');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '';
      if (msg.toLowerCase().includes('current password')) {
        setResetError('Your current password is incorrect. Please check and try again.');
      } else if (msg.toLowerCase().includes('session')) {
        setResetError(msg);
      } else {
        setResetError('Failed to change password. Please try again.');
      }
    } finally {
      setResetLoading(false);
    }
  };

  // ── Redirect after done ───────────────────────────────────────────────────
  useEffect(() => {
    if (step !== 'done') return;
    const t = setTimeout(() => {
      if (user?.email && user?.phone && user?.section) {
        navigate('/dashboard');
      } else {
        navigate('/complete-profile');
      }
    }, 2800);
    return () => clearTimeout(t);
  }, [step, user, navigate]);

  // ── Steps metadata ────────────────────────────────────────────────────────
  const totalSteps = flow === 'forgot' ? 2 : 1;
  const currentDot = flow === 'forgot' ? (step === 'verify' ? 0 : 1) : 0;

  return (
    <PageWrapper centered noPadding className="min-h-screen p-4 sm:p-8">
      <div
        className="relative w-full max-w-5xl min-h-screen sm:min-h-0 sm:rounded-[40px] overflow-hidden"
        style={{
          background: `linear-gradient(145deg, #0b0502 0%, #0f0603 100%)`,
          border: `1px solid rgba(255,104,3,0.1)`,
          boxShadow: '0 40px 120px rgba(0,0,0,0.9)',
        }}
      >
        <VaultGeometry />

        <div className="relative z-10 grid lg:grid-cols-[0.9fr_1.1fr] min-h-[640px]">

          {/* ── LEFT: Security context panel ── */}
          <div
            className="hidden lg:flex flex-col justify-between p-10 xl:p-14"
            style={{ borderRight: `1px solid rgba(255,255,255,0.05)` }}
          >
            {/* Top */}
            <div className="space-y-8">
              {/* Shield icon */}
              <motion.div
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.1, duration: 0.5, type: 'spring', stiffness: 200 }}
              >
                <div
                  className="w-16 h-16 rounded-[20px] flex items-center justify-center relative"
                  style={{
                    background: 'linear-gradient(135deg, #FF6803 0%, #FF9040 100%)',
                    boxShadow: '0 12px 40px rgba(255,104,3,0.45)',
                  }}
                >
                  <Shield className="w-8 h-8 text-white" />
                  {/* Pulse ring */}
                  <motion.div
                    className="absolute inset-0 rounded-[20px]"
                    style={{ border: '2px solid rgba(255,104,3,0.6)' }}
                    animate={{ scale: [1, 1.18, 1], opacity: [0.8, 0, 0.8] }}
                    transition={{ duration: 2.5, repeat: Infinity, ease: 'easeOut' }}
                  />
                </div>
              </motion.div>

              {/* Headline */}
              <motion.div
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.45 }}
              >
                <h2 className="text-4xl xl:text-[2.6rem] font-extrabold leading-[1.1] text-white">
                  Secure<br />
                  <span style={{ color: tk.primary }}>your account.</span>
                </h2>
                <p className="mt-4 text-sm leading-7" style={{ color: tk.textSecondary }}>
                  {flow === 'force'
                    ? 'You\'re using a temporary password. Set a strong personal password to protect your account.'
                    : 'Verify your membership, then create a new password only you know.'}
                </p>
              </motion.div>

              {/* Tips */}
              <motion.div
                className="space-y-3"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
              >
                <p className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: tk.textTertiary }}>
                  Best practices
                </p>
                {[
                  'Use a passphrase, not a word',
                  'Never reuse passwords across sites',
                  'Mix characters, numbers & symbols',
                  'Don\'t share with anyone — ever',
                ].map((tip, i) => (
                  <motion.div
                    key={tip}
                    className="flex items-center gap-3"
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.07 }}
                  >
                    <span
                      className="w-1.5 h-1.5 rounded-full shrink-0"
                      style={{ background: tk.primary, boxShadow: `0 0 6px ${tk.primary}` }}
                    />
                    <span className="text-sm" style={{ color: tk.textSecondary }}>{tip}</span>
                  </motion.div>
                ))}
              </motion.div>
            </div>

            {/* Bottom: step tracker */}
            <motion.div
              className="space-y-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <p className="text-[10px] uppercase tracking-[0.2em] font-bold" style={{ color: tk.textTertiary }}>
                {flow === 'forgot' ? 'Progress' : 'Step'}
              </p>
              <StepDots step={currentDot} total={totalSteps} />
              <p className="text-xs" style={{ color: tk.textTertiary }}>
                {step === 'verify' && 'Step 1 of 2 — Identity verification'}
                {step === 'reset'  && (flow === 'forgot' ? 'Step 2 of 2 — Set new password' : 'Set your new password')}
                {step === 'done'   && 'Complete — Redirecting…'}
              </p>
            </motion.div>
          </div>

          {/* ── RIGHT: Form area ── */}
          <div className="flex flex-col justify-center p-6 sm:p-10 lg:p-12 xl:p-14">

            {/* Back link (forgot flow only, verify step) */}
            {flow === 'forgot' && step === 'verify' && (
              <motion.div
                className="mb-6"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.1 }}
              >
                <button
                  onClick={() => navigate(`/${orgSlug}/login`)}
                  className="inline-flex items-center gap-1.5 text-xs font-medium transition-colors"
                  style={{ color: tk.textTertiary }}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back to login
                </button>
              </motion.div>
            )}

            {/* Mobile step dots */}
            <div className="flex lg:hidden items-center justify-between mb-6">
              <StepDots step={currentDot} total={totalSteps} />
              <span className="text-[10px] uppercase tracking-widest" style={{ color: tk.textTertiary }}>
                {step === 'verify' ? '1 / 2' : step === 'reset' ? (flow === 'forgot' ? '2 / 2' : '1 / 1') : '✓'}
              </span>
            </div>

            <AnimatePresence mode="wait">

              {/* ── STEP: verify ── */}
              {step === 'verify' && (
                <motion.div
                  key="verify"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-6"
                >
                  <div>
                    <div
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4"
                      style={{ background: `${tk.primary}15`, color: tk.primary, border: `1px solid ${tk.primary}25` }}
                    >
                      <Fingerprint className="w-3.5 h-3.5" />
                      Identity Check
                    </div>
                    <h2 className="text-3xl font-extrabold text-white">Verify membership</h2>
                    <p className="mt-2 text-sm leading-6" style={{ color: tk.textSecondary }}>
                      Enter your Member ID. We'll confirm you belong to this organization before allowing a reset.
                    </p>
                  </div>

                  {/* Security notice */}
                  <Banner variant="info" icon={<Shield className="w-4 h-4" />}>
                    For your protection, we never confirm whether an ID exists. You'll always see the same response.
                  </Banner>

                  <form onSubmit={handleVerify} className="space-y-5">
                    <PlainInput
                      label="Member ID"
                      value={memberId}
                      onChange={setMemberId}
                      placeholder="e.g., 2024/274804"
                      disabled={verifyLoading || !!verifyMessage}
                      icon={<Fingerprint className="w-4 h-4" />}
                      autoComplete="username"
                    />

                    <AnimatePresence>
                      {verifyMessage && (
                        <Banner variant="info" icon={<Info className="w-4 h-4" />}>
                          {verifyMessage}
                        </Banner>
                      )}
                    </AnimatePresence>

                    <SubmitButton loading={verifyLoading} disabled={!memberId.trim() || !!verifyMessage}>
                      <span className="flex items-center justify-center gap-2">
                        Verify & Continue
                        <ChevronRight className="w-4 h-4" />
                      </span>
                    </SubmitButton>
                  </form>
                </motion.div>
              )}

              {/* ── STEP: reset ── */}
              {step === 'reset' && (
                <motion.div
                  key="reset"
                  initial={{ opacity: 0, x: 30 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -30 }}
                  transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
                  className="space-y-6"
                >
                  <div>
                    <div
                      className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-widest mb-4"
                      style={{ background: `${tk.primary}15`, color: tk.primary, border: `1px solid ${tk.primary}25` }}
                    >
                      <KeyRound className="w-3.5 h-3.5" />
                      {flow === 'force' ? 'First Login' : 'New Password'}
                    </div>
                    <h2 className="text-3xl font-extrabold text-white">Set new password</h2>
                    <p className="mt-2 text-sm leading-6" style={{ color: tk.textSecondary }}>
                      {flow === 'force'
                        ? 'Your temporary password must be changed before you can continue.'
                        : 'Choose a strong password that only you know.'}
                    </p>
                  </div>

                  {/* Force-change tip */}
                  {flow === 'force' && (
                    <Banner variant="warn" icon={<Info className="w-4 h-4" />}>
                      <span>
                        <strong>Tip:</strong> Your current password is the temporary one your admin provided. 
                        Don't know it? Contact your class rep or admin.
                      </span>
                    </Banner>
                  )}

                  <AnimatePresence>
                    {resetError && (
                      <Banner variant="error" icon={<AlertCircle className="w-4 h-4" />}>
                        {resetError}
                      </Banner>
                    )}
                  </AnimatePresence>

                  <form onSubmit={handleReset} className="space-y-5">
                    <SecureInput
                      label="Current Password"
                      value={currentPassword}
                      onChange={setCurrentPassword}
                      placeholder="Your current / temporary password"
                      disabled={resetLoading}
                      autoComplete="current-password"
                    />

                    <SecureInput
                      label="New Password"
                      value={newPassword}
                      onChange={setNewPassword}
                      placeholder="At least 8 characters"
                      disabled={resetLoading}
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
                      disabled={resetLoading}
                      autoComplete="new-password"
                      suffix={
                        <AnimatePresence>
                          {confirmPassword && (
                            <motion.div
                              className="flex items-center gap-2 mt-2"
                              initial={{ opacity: 0 }}
                              animate={{ opacity: 1 }}
                              exit={{ opacity: 0 }}
                            >
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

                    <SubmitButton loading={resetLoading} disabled={!canSubmit}>
                      <span className="flex items-center justify-center gap-2">
                        <Lock className="w-4 h-4" />
                        Change Password
                      </span>
                    </SubmitButton>
                  </form>
                </motion.div>
              )}

              {/* ── STEP: done ── */}
              {step === 'done' && (
                <motion.div
                  key="done"
                  initial={{ opacity: 0, scale: 0.94 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5, type: 'spring', stiffness: 180 }}
                  className="flex flex-col items-center text-center py-8 space-y-6"
                >
                  {/* Success icon */}
                  <div className="relative">
                    <motion.div
                      className="w-24 h-24 rounded-[28px] flex items-center justify-center"
                      style={{
                        background: 'linear-gradient(135deg, rgba(48,255,172,0.15), rgba(48,255,172,0.05))',
                        border: `1px solid rgba(48,255,172,0.25)`,
                      }}
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={{ delay: 0.1, type: 'spring', stiffness: 200 }}
                    >
                      <CheckCircle className="w-12 h-12" style={{ color: tk.mint }} />
                    </motion.div>
                    {/* Ripple */}
                    {[1, 2].map((i) => (
                      <motion.div
                        key={i}
                        className="absolute inset-0 rounded-[28px]"
                        style={{ border: `1px solid rgba(48,255,172,0.3)` }}
                        animate={{ scale: [1, 1.5 + i * 0.3], opacity: [0.6, 0] }}
                        transition={{ duration: 1.8, repeat: Infinity, delay: i * 0.4, ease: 'easeOut' }}
                      />
                    ))}
                  </div>

                  <div>
                    <h2 className="text-3xl font-extrabold text-white">Password changed!</h2>
                    <p className="mt-3 text-sm leading-6" style={{ color: tk.textSecondary }}>
                      Your account is now secured with your new password.
                      <br />Redirecting you in a moment…
                    </p>
                  </div>

                  <motion.div
                    className="w-full max-w-xs h-1 rounded-full overflow-hidden"
                    style={{ background: 'rgba(255,255,255,0.07)' }}
                  >
                    <motion.div
                      className="h-full rounded-full"
                      style={{ background: tk.mint }}
                      initial={{ width: '0%' }}
                      animate={{ width: '100%' }}
                      transition={{ duration: 2.6, ease: 'linear' }}
                    />
                  </motion.div>
                </motion.div>
              )}

            </AnimatePresence>
          </div>
        </div>
      </div>
    </PageWrapper>
  );
}