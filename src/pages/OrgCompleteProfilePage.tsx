/**
 * OrgCompleteProfilePage — invite-flow step.
 *
 * The page the new member sees right after their first sign-in
 * (force_password_change cleared on the previous screen). Asks
 * for email + phone so receipts, reminders, and dues notifications
 * have somewhere to land. Theme-aware, soft brand-blob backdrop,
 * stacked layout that reads identically on phone and desktop.
 *
 * Sister page: OrgChangePasswordPage — same chrome, same step
 * indicator, different field set. Together they form the
 * "set up your account" sequence after accepting an invite.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Mail, Phone, AlertCircle, CheckCircle2, ShieldCheck,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';

export default function OrgCompleteProfilePage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, organization, updateProfile } = useMultiTenantAuth();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const tt = getDashboardTokens(theme);
  const isLight = theme === 'light';

  const [formData, setFormData] = useState({
    email: user?.email || '',
    phone: user?.phone || '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const memberLabel = organization?.member_label || 'Member';
  const orgInitial = organization?.short_name?.charAt(0) || 'P';
  const accent = organization?.primary_color || tt.primary;

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) setErrors(prev => ({ ...prev, [field]: '' }));
  };

  const validate = (): boolean => {
    const next: Record<string, string> = {};
    if (!formData.email.trim()) {
      next.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      next.email = 'That doesn\'t look like a valid email';
    }
    if (!formData.phone.trim()) {
      next.phone = 'Phone number is required';
    } else if (formData.phone.replace(/\D/g, '').length < 10) {
      next.phone = 'Phone number is too short';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;
    setLoading(true);
    try {
      await updateProfile({
        email: formData.email.trim(),
        phone: formData.phone.trim(),
      });
      navigate(`/${orgSlug}/dashboard`, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not save. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden flex items-center justify-center px-4 py-8"
      style={{ background: tt.bgWash, color: tt.text }}
    >
      {/* Soft brand blobs — same chrome as the exec dashboards so
          the invite-onboarding sequence feels like part of the app,
          not a stranded login form. */}
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
        {/* Step indicator — places this in the "set up" sequence so
            the user understands what's left. They've just cleared
            password (step 1); this is step 2. */}
        <div className="flex items-center justify-center gap-2">
          <StepDot complete tt={tt} />
          <span className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: tt.textTer }}>
            Step 2 of 2
          </span>
          <StepDot active tt={tt} />
        </div>

        {/* Org identity card — the "you've landed at the right
            organisation" reassurance. Member ID + role chip up top
            so the user can verify before they type anything. */}
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
            Welcome, {user?.full_name?.split(' ')[0] || 'there'}
          </h1>
          <p className="text-sm" style={{ color: tt.textSec }}>
            One last step — how should we reach you?
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

          <FieldRow
            tt={tt}
            isLight={isLight}
            icon={<Mail className="w-4 h-4" />}
            label="Email address"
            hint="Where receipts and reminders land."
            error={errors.email}
          >
            <input
              type="email"
              autoComplete="email"
              value={formData.email}
              onChange={(e) => handleChange('email', e.target.value)}
              placeholder="your.email@example.com"
              className="w-full bg-transparent outline-none text-sm font-medium"
              style={{ color: tt.text }}
            />
          </FieldRow>

          <FieldRow
            tt={tt}
            isLight={isLight}
            icon={<Phone className="w-4 h-4" />}
            label="Phone number"
            hint="For SMS reminders + emergency updates."
            error={errors.phone}
          >
            <input
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              value={formData.phone}
              onChange={(e) => handleChange('phone', e.target.value)}
              placeholder="08012345678"
              className="w-full bg-transparent outline-none text-sm font-medium"
              style={{ color: tt.text }}
            />
          </FieldRow>

          {/* Privacy reassurance — sits below the inputs so it's the
              last thing they read before tapping continue. */}
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-xl"
            style={{
              background: `${tt.mint}14`,
              border: `1px solid ${tt.mint}30`,
            }}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tt.mint }} />
            <p className="text-[11px] leading-relaxed" style={{ color: tt.text }}>
              <span className="font-bold">Private to {organization?.short_name || 'your org'}.</span>{' '}
              Only verified admins in this organisation see your contact details.
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
            {loading ? (
              'Saving…'
            ) : (
              <>
                <CheckCircle2 className="w-4 h-4" />
                Continue to dashboard
              </>
            )}
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
        aria-label="step complete"
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
      aria-label={active ? 'current step' : 'pending step'}
    />
  );
}

function FieldRow({
  icon, label, hint, error, children, tt, isLight,
}: {
  icon: React.ReactNode;
  label: string;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  tt: ReturnType<typeof getDashboardTokens>;
  isLight: boolean;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: tt.textTer }}>
          {label}
        </label>
        {error ? (
          <span className="text-[11px] font-semibold" style={{ color: tt.danger }}>
            {error}
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
          border: `1px solid ${error ? tt.danger + '60' : tt.cardBorder}`,
        }}
      >
        <span className="shrink-0" style={{ color: tt.textTer }}>{icon}</span>
        {children}
      </div>
    </div>
  );
}
