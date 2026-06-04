/**
 * OrgChangePasswordPage — invite-flow step.
 *
 * The first screen a new member sees after using their invite code.
 * Forces a password reset before any other interaction; if the member
 * doesn't have email/phone yet either, the form routes to
 * /complete-profile after success. Same chrome as
 * OrgCompleteProfilePage so the two pages read as a sequence.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Lock, AlertCircle, ShieldCheck, Eye, EyeOff, CheckCircle2,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

const PASSWORD_RULES = [
  { label: 'At least 8 characters',     test: (p: string) => p.length >= 8 },
  { label: 'Contains a number',         test: (p: string) => /\d/.test(p) },
  { label: 'Contains an uppercase',     test: (p: string) => /[A-Z]/.test(p) },
];

export default function OrgChangePasswordPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, organization, changePassword, needsPasswordChange, isProfileComplete } = useMultiTenantAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const tt = getDashboardTokens(theme);
  const isLight = theme === 'light';

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const isFirstTime = needsPasswordChange;
  const basePath = `/${orgSlug}`;
  const orgInitial = organization?.short_name?.charAt(0) || 'P';
  const accent = organization?.primary_color || tt.primary;
  const memberLabel = organization?.member_label || 'Member';

  const validate = (): boolean => {
    if (!currentPassword) { setError('Enter your current password'); return false; }
    if (!newPassword) { setError('Enter a new password'); return false; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return false; }
    if (!confirmPassword) { setError('Confirm your new password'); return false; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return false; }
    if (newPassword === currentPassword) { setError('New password must differ from current'); return false; }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);
      if (!isProfileComplete) {
        navigate(`${basePath}/complete-profile`, { replace: true });
      } else {
        navigate(`${basePath}/dashboard`, { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Could not change password.';
      if (msg.toLowerCase().includes('incorrect')) {
        setError('Current password is incorrect. Try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const passedRules = PASSWORD_RULES.filter(r => r.test(newPassword));
  const strength = newPassword.length === 0 ? 0 : (passedRules.length / PASSWORD_RULES.length) * 100;
  const strengthColor =
    strength === 0 ? tt.cardBorder :
    strength < 67  ? tt.amber :
                     tt.mint;

  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 py-8"
      style={{ background: tt.bgWash, color: tt.text }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 w-[520px] h-[520px] rounded-full"
        style={{ background: tt.blob1, filter: 'blur(120px)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 w-[420px] h-[420px] rounded-full"
        style={{ background: tt.blob2, filter: 'blur(110px)' }}
      />

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 w-full max-w-md space-y-5"
      >
        {/* Step indicator — this is step 1 of 2 for first-time
            sign-ins. Returning members who change their password
            via settings see the same component but without the
            "Step X of Y" wording. */}
        {isFirstTime && (
          <div className="flex items-center justify-center gap-2">
            <StepDot active tt={tt} />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: tt.textTer }}>
              Step 1 of 2
            </span>
            <StepDot tt={tt} />
          </div>
        )}

        {/* Org identity card */}
        <div
          className="rounded-2xl p-4 flex items-center gap-3"
          style={{
            background: tt.card,
            border: `1px solid ${tt.cardBorder}`,
            boxShadow: isLight
              ? '0 10px 30px -16px rgba(15, 7, 3, 0.10)'
              : '0 10px 30px rgba(0, 0, 0, 0.25)',
          }}
        >
          {organization?.logo_url ? (
            <img
              src={organization.logo_url}
              alt={organization.short_name}
              className="w-11 h-11 rounded-xl object-cover shrink-0"
              style={{ boxShadow: `0 0 0 1px ${tt.cardBorder}` }}
            />
          ) : (
            <div
              className="w-11 h-11 rounded-xl flex items-center justify-center text-base font-extrabold shrink-0"
              style={{
                background: `linear-gradient(135deg, ${accent} 0%, ${accent}cc 100%)`,
                color: '#FFFFFF',
                boxShadow: `0 6px 16px -6px ${accent}66, inset 0 1px 0 rgba(255,255,255,0.30)`,
              }}
            >
              {orgInitial}
            </div>
          )}
          <div className="flex-1 min-w-0">
            <p className="text-sm font-extrabold truncate" style={{ color: tt.text }}>
              {organization?.name || organization?.short_name}
            </p>
            <p className="text-[11px] font-bold uppercase tracking-wider truncate" style={{ color: tt.textTer }}>
              {memberLabel} · {user?.member_id}
            </p>
          </div>
        </div>

        {/* Hero copy */}
        <div className="text-center space-y-1.5">
          <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight" style={{ color: tt.text }}>
            {isFirstTime ? 'Set a strong password' : 'Change your password'}
          </h1>
          <p className="text-sm" style={{ color: tt.textSec }}>
            {isFirstTime
              ? 'Pick something only you would guess. Your invite code is single-use.'
              : 'Replacing the password you currently sign in with.'}
          </p>
        </div>

        {/* Form card */}
        <form
          onSubmit={handleSubmit}
          className="rounded-2xl p-5 space-y-4"
          style={{
            background: tt.card,
            border: `1px solid ${tt.cardBorder}`,
            boxShadow: isLight
              ? '0 10px 30px -16px rgba(15, 7, 3, 0.10)'
              : '0 10px 30px rgba(0, 0, 0, 0.25)',
          }}
        >
          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                className="flex items-start gap-2.5 p-3 rounded-xl"
                style={{
                  background: `${tt.danger}12`,
                  border: `1px solid ${tt.danger}40`,
                  color: tt.danger,
                }}
              >
                <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                <p className="text-xs leading-relaxed">{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <PasswordField
            tt={tt} isLight={isLight}
            label={isFirstTime ? 'Invite code' : 'Current password'}
            hint={isFirstTime ? 'The temporary code you were given' : undefined}
            value={currentPassword}
            onChange={setCurrentPassword}
            visible={showCurrent}
            onToggleVisible={() => setShowCurrent(v => !v)}
            autoComplete={isFirstTime ? 'one-time-code' : 'current-password'}
          />

          <PasswordField
            tt={tt} isLight={isLight}
            label="New password"
            value={newPassword}
            onChange={setNewPassword}
            visible={showNew}
            onToggleVisible={() => setShowNew(v => !v)}
            autoComplete="new-password"
          />

          {/* Strength bar + rule checklist — gives the user a
              visible confidence cue as they type. The bar colour
              matches the rule-pass state so green = all rules met. */}
          {newPassword && (
            <div className="space-y-2">
              <div
                className="h-1.5 rounded-full overflow-hidden"
                style={{ background: isLight ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.06)' }}
              >
                <motion.div
                  className="h-full rounded-full"
                  animate={{ width: `${strength}%`, backgroundColor: strengthColor }}
                  transition={{ duration: 0.25 }}
                />
              </div>
              <ul className="space-y-1">
                {PASSWORD_RULES.map((rule) => {
                  const passed = rule.test(newPassword);
                  return (
                    <li key={rule.label} className="flex items-center gap-2 text-[11px]">
                      <span
                        className="w-3.5 h-3.5 rounded-full flex items-center justify-center"
                        style={{
                          background: passed ? `${tt.mint}25` : (isLight ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.06)'),
                          color: passed ? tt.mint : tt.textTer,
                        }}
                      >
                        {passed ? <CheckCircle2 className="w-2.5 h-2.5" /> : <span className="w-1 h-1 rounded-full" style={{ background: tt.textTer }} />}
                      </span>
                      <span style={{ color: passed ? tt.text : tt.textTer }}>{rule.label}</span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          <PasswordField
            tt={tt} isLight={isLight}
            label="Confirm new password"
            value={confirmPassword}
            onChange={setConfirmPassword}
            visible={showNew}
            onToggleVisible={() => setShowNew(v => !v)}
            autoComplete="new-password"
            mismatch={Boolean(confirmPassword) && confirmPassword !== newPassword}
          />

          {/* Reassurance */}
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
            style={{
              background: `${tt.mint}14`,
              border: `1px solid ${tt.mint}30`,
            }}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tt.mint }} />
            <p className="text-[11px] leading-relaxed" style={{ color: tt.text }}>
              <span className="font-bold">End-to-end encrypted.</span>{' '}
              Even {organization?.short_name || 'your organisation'} admins can't read your password.
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 rounded-xl text-sm font-extrabold transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-60 disabled:cursor-not-allowed"
            style={{
              background: tt.primary,
              color: '#FFFFFF',
              border: `1px solid ${tt.primary}`,
              boxShadow: `0 8px 22px -10px ${tt.primary}`,
            }}
          >
            {loading ? 'Saving…' : (isFirstTime ? 'Continue' : 'Change password')}
          </button>
        </form>
      </motion.div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────

function StepDot({
  active, complete, tt,
}: { active?: boolean; complete?: boolean; tt: ReturnType<typeof getDashboardTokens> }) {
  if (complete) {
    return (
      <span
        className="w-5 h-5 rounded-full flex items-center justify-center"
        style={{ background: tt.mint, color: '#0F0703' }}
      >
        <CheckCircle2 className="w-3 h-3" />
      </span>
    );
  }
  return (
    <span
      className="w-2 h-2 rounded-full"
      style={{
        background: active ? tt.primary : tt.cardBorder,
        boxShadow: active ? `0 0 10px ${tt.primary}` : 'none',
      }}
    />
  );
}

function PasswordField({
  label, hint, value, onChange, visible, onToggleVisible,
  autoComplete, mismatch, tt, isLight,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  visible: boolean;
  onToggleVisible: () => void;
  autoComplete?: string;
  mismatch?: boolean;
  tt: ReturnType<typeof getDashboardTokens>;
  isLight: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: tt.textTer }}>
          {label}
        </label>
        {mismatch ? (
          <span className="text-[11px] font-semibold" style={{ color: tt.danger }}>
            Doesn't match
          </span>
        ) : hint ? (
          <span className="text-[11px]" style={{ color: tt.textTer }}>
            {hint}
          </span>
        ) : null}
      </div>
      <div
        className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl transition-colors"
        style={{
          background: isLight ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.04)',
          border: `1px solid ${mismatch ? tt.danger + '60' : tt.cardBorder}`,
        }}
      >
        <Lock className="w-4 h-4 shrink-0" style={{ color: tt.textTer }} />
        <input
          type={visible ? 'text' : 'password'}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          autoComplete={autoComplete}
          className="flex-1 bg-transparent outline-none text-sm font-medium"
          style={{ color: tt.text }}
        />
        <button
          type="button"
          onClick={onToggleVisible}
          aria-label={visible ? 'Hide password' : 'Show password'}
          className="w-7 h-7 rounded-lg flex items-center justify-center transition-colors"
          style={{ color: tt.textTer }}
        >
          {visible ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
}
