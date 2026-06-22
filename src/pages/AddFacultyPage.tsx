/**
 * AddFacultyPage — add a new faculty (top-level unit) to an existing org.
 *
 * Route: /:orgSlug/add-faculty
 *
 * Distinct from AddDepartmentPage:
 *   - Faculty is the PARENT container (School of Engineering, Faculty of Arts)
 *   - Departments live INSIDE a faculty
 *   - Adding a faculty requires no founder credentials (just the name) —
 *     this is org-level structural setup
 *
 * The departments under this new faculty get added later via
 * /:orgSlug/f/:facultyShort/new (AddDepartmentPage).
 *
 * Fully theme-aware (light + dark) via useThemeTokens.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  GraduationCap,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { organizationService } from '@/services/organizationService';
import TrustBadge from '@/components/trust/TrustBadge';
import AppLogo from '@/components/ui/Applogo';
import { useThemeTokens, type ThemeTokens } from '@/hooks/useThemeTokens';
import type { Organization, TrustLevel } from '@/types/multiTenant';

export default function AddFacultyPage() {
  const t = useThemeTokens();
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Organization | null>(null);

  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orgSlug) return;
      setLoading(true);
      const o = await organizationService.getBySlug(orgSlug);
      if (cancelled) return;
      setOrg(o);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgSlug]);

  const canSubmit = useMemo(() => name.trim().length > 1, [name]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting || !org) return;
    setSubmitting(true);
    setError(null);

    const res = await organizationService.addFacultyToOrg({
      orgSlug: org.slug,
      facultyName: name,
      facultyShortName: shortName || undefined,
    });

    if (!res.ok || !res.slug || !res.faculty_short) {
      setError(res.error || 'Could not create the faculty.');
      setSubmitting(false);
      return;
    }

    // Land on the new faculty page so the user can immediately add departments.
    navigate(`/${res.slug}/f/${encodeURIComponent(res.faculty_short)}`);
  };

  if (loading) {
    return (
      <Centered t={t}>
        <motion.div
          className="w-10 h-10 border-2 rounded-full"
          style={{ borderColor: `${t.primary}30`, borderTopColor: t.primary }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        />
        <p className="text-xs tracking-wider mt-3" style={{ color: t.textTer }}>
          Loading…
        </p>
      </Centered>
    );
  }

  if (!org) {
    return (
      <Centered t={t}>
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: t.text }}>Organization not found</h1>
          <p className="text-sm leading-6 mb-6" style={{ color: t.textSec }}>
            We couldn't find <span className="font-semibold" style={{ color: t.text }}>/{orgSlug}</span>.
          </p>
          <motion.button
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-xl font-semibold text-sm"
            style={{ background: 'linear-gradient(135deg, #FF6803, #FFAC5F)', color: '#FFFFFF' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Back to search
          </motion.button>
        </div>
      </Centered>
    );
  }

  const unitLabel = (org as { unit_label?: string }).unit_label ?? 'Faculty';

  return (
    <div
      className="min-h-screen relative overflow-x-hidden"
      style={{ minHeight: '100dvh', background: t.bg, backgroundImage: t.bgWash, color: t.text }}
    >
      {/* Ambient brand glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full blur-[160px]"
          style={{
            width: 560, height: 560,
            background: `radial-gradient(circle, ${t.blue} 0%, transparent 70%)`,
            top: '-10%', right: '-12%', opacity: t.isLight ? 0.10 : 0.14,
          }}
        />
      </div>

      {/* Top nav with breadcrumb */}
      <nav className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
        <button
          onClick={() => navigate(`/${org.slug}/overview`)}
          className="inline-flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded-lg transition-colors"
          style={{ color: t.textSec }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span>{org.short_name}</span>
          <ChevronRight className="w-3 h-3" style={{ color: t.textTer }} />
          <span className="font-semibold" style={{ color: t.text }}>New {unitLabel.toLowerCase()}</span>
        </button>
        <AppLogo size={32} textSize="text-base" isLight={t.isLight} />
      </nav>

      <header className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pt-2 pb-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-5 sm:p-6 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${t.blue}14, ${t.card})`,
            border: `1px solid ${t.cardBorder}`,
            boxShadow: t.shadow,
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: `${t.blue}18`, border: `1px solid ${t.blue}30` }}
            >
              <GraduationCap className="w-6 h-6" style={{ color: t.blue }} />
            </div>
            <div className="min-w-0 flex-1">
              <p
                className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-1"
                style={{ color: t.textTer }}
              >
                {org.name}
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold leading-tight tracking-tight" style={{ color: t.text }}>
                Add a {unitLabel.toLowerCase()}
              </h1>
              <p className="text-sm leading-6 mt-1.5" style={{ color: t.textSec }}>
                A {unitLabel.toLowerCase()} is the top-level container. You'll add departments inside it on the next screen.
              </p>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <TrustBadge level={(org.trust_level as TrustLevel) ?? 'community'} size="sm" />
              </div>
            </div>
          </div>
        </motion.div>
      </header>

      <form onSubmit={handleSubmit} className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pb-24">
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-5 sm:p-6 space-y-4"
          style={{ background: t.card, border: `1px solid ${t.cardBorder}`, boxShadow: t.shadow }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4" style={{ color: t.primary }} />
              <h2 className="text-base font-bold" style={{ color: t.text }}>The {unitLabel.toLowerCase()}</h2>
            </div>
            <p className="text-xs leading-5 mb-3" style={{ color: t.textSec }}>
              Just the name and a short tag. Everything else is set up on the next screen.
            </p>
          </div>

          <Field t={t} label={`${unitLabel} name`} required>
            <Input t={t} value={name} onChange={setName} placeholder="School of Engineering" required autoFocus />
          </Field>

          <Field t={t} label="Short name" hint="e.g. SOE — auto-generated if empty">
            <Input t={t} value={shortName} onChange={(v) => setShortName(v.toUpperCase())} placeholder="SOE" />
            {shortName.trim().length > 0 && shortName.trim().length < 2 && (
              <p className="text-[11px] mt-1.5 flex items-center gap-1.5" style={{ color: t.danger }}>
                <AlertCircle className="w-3 h-3" /> Short name needs at least 2 characters.
              </p>
            )}
          </Field>

          <AnimatePresence>
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                className="rounded-xl px-4 py-3 flex items-start gap-3"
                style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
              >
                <AlertCircle className="w-5 h-5 shrink-0" style={{ color: t.danger, marginTop: 1 }} />
                <p className="text-sm leading-6" style={{ color: t.danger }}>{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-2 flex items-center justify-between gap-3 flex-wrap">
            <p className="text-[11px] leading-5" style={{ color: t.textTer, maxWidth: 320 }}>
              You can keep refining the structure (departments, classes) after this step.
            </p>
            <motion.button
              type="submit"
              disabled={!canSubmit || submitting}
              className="px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
                color: '#FFFFFF',
                boxShadow: canSubmit ? '0 8px 28px rgba(255,104,3,0.35)' : 'none',
              }}
              whileHover={canSubmit && !submitting ? { scale: 1.03 } : undefined}
              whileTap={canSubmit && !submitting ? { scale: 0.97 } : undefined}
            >
              {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
              Create {unitLabel.toLowerCase()}
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </div>
        </motion.div>
      </form>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Form bits — receive `t` so they render theme-aware in both light/dark.
// ────────────────────────────────────────────────────────────────────────────
function Centered({ t, children }: { t: ThemeTokens; children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ minHeight: '100dvh', background: t.bg, backgroundImage: t.bgWash, color: t.text }}
    >
      <div className="flex flex-col items-center justify-center gap-3">{children}</div>
    </div>
  );
}

function Field({
  t, label, hint, required, children,
}: {
  t: ThemeTokens;
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: t.textSec }}>
          {label}
          {required && <span style={{ color: t.primary }}> *</span>}
        </span>
        {hint && <span className="text-[10px]" style={{ color: t.textTer }}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Input({
  t, value, onChange, placeholder, required, autoFocus,
}: {
  t: ThemeTokens;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
  autoFocus?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      required={required}
      autoFocus={autoFocus}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors"
      style={{
        background: t.input,
        border: `1px solid ${t.inputBorder}`,
        color: t.text,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = t.primaryRing; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = t.inputBorder; }}
    />
  );
}
