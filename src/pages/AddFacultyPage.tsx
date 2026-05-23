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
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  Check,
  GraduationCap,
  Loader2,
  Sparkles,
} from 'lucide-react';
import { organizationService } from '@/services/organizationService';
import TrustBadge from '@/components/trust/TrustBadge';
import { APP_NAME } from '@/config/constants';
import type { Organization, TrustLevel } from '@/types/multiTenant';

const tk = {
  primary:   '#FF6803',
  mint:      '#30FFAC',
  blue:      '#3b82f6',
  bg:        '#0F0703',
  panel:     'rgba(255,255,255,0.025)',
  border:    'rgba(255,255,255,0.08)',
  borderHov: 'rgba(255,104,3,0.32)',
  text:      '#FFFFFF',
  textSec:   'rgba(255,255,255,0.65)',
  textTer:   'rgba(255,255,255,0.40)',
  danger:    '#ef4444',
};

export default function AddFacultyPage() {
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
      orgSlug:          org.slug,
      facultyName:      name,
      facultyShortName: shortName || undefined,
    });

    if (!res.ok || !res.slug || !res.faculty_short) {
      setError(res.error || 'Could not create the faculty.');
      setSubmitting(false);
      return;
    }

    // Land on the new faculty page so the user can immediately add departments
    navigate(`/${res.slug}/f/${encodeURIComponent(res.faculty_short)}`);
  };

  if (loading) {
    return (
      <Centered>
        <motion.div
          className="w-10 h-10 border-2 rounded-full"
          style={{ borderColor: `${tk.primary}30`, borderTopColor: tk.primary }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        />
      </Centered>
    );
  }

  if (!org) {
    return (
      <Centered>
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-white mb-3 tracking-tight">Organization not found</h1>
          <p className="text-sm leading-6 mb-6" style={{ color: tk.textSec }}>
            We couldn't find <span className="text-white font-semibold">/{orgSlug}</span>.
          </p>
          <motion.button
            onClick={() => navigate('/')}
            className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #FF6803, #FFAC5F)' }}
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
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh', background: tk.bg }}>
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full blur-[160px]"
          style={{
            width: 560, height: 560,
            background: `radial-gradient(circle, ${tk.blue} 0%, transparent 70%)`,
            top: '-10%', right: '-12%', opacity: 0.14,
          }}
        />
      </div>

      <nav className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
        <button
          onClick={() => navigate(`/${org.slug}/overview`)}
          className="flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {org.short_name}
        </button>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-white text-sm"
            style={{ background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)' }}
          >
            P
          </div>
          <span className="text-base font-bold text-white">{APP_NAME}</span>
        </div>
      </nav>

      <header className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pt-2 pb-6">
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-5 sm:p-6 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${tk.blue}14, rgba(255,255,255,0.02))`,
            border: `1px solid ${tk.border}`,
          }}
        >
          <div className="flex items-start gap-4">
            <div className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: `${tk.blue}18`, border: `1px solid ${tk.blue}30` }}>
              <GraduationCap className="w-6 h-6" style={{ color: tk.blue }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-1"
                style={{ color: tk.textTer }}>
                {org.name}
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight">
                Add a {unitLabel.toLowerCase()}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
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
          style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
        >
          <div>
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="w-4 h-4" style={{ color: tk.primary }} />
              <h2 className="text-base font-bold text-white">The {unitLabel.toLowerCase()}</h2>
            </div>
            <p className="text-xs leading-5 mb-5" style={{ color: tk.textSec }}>
              You'll add departments inside this {unitLabel.toLowerCase()} on the next screen.
            </p>
          </div>

          <Field label={`${unitLabel} name`} required>
            <Input value={name} onChange={setName} placeholder="School of Engineering" required />
          </Field>

          <Field label="Short name" hint="e.g. SOE — auto-generated if empty">
            <Input value={shortName} onChange={(v) => setShortName(v.toUpperCase())} placeholder="SOE" />
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
                <AlertCircle className="w-5 h-5 shrink-0" style={{ color: tk.danger, marginTop: 1 }} />
                <p className="text-sm leading-6" style={{ color: 'rgba(254,202,202,0.95)' }}>{error}</p>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="pt-2 flex items-center justify-end">
            <motion.button
              type="submit"
              disabled={!canSubmit || submitting}
              className="px-6 py-3 rounded-2xl text-white font-bold text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
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

function Field({
  label, hint, required, children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: tk.textSec }}>
          {label}
          {required && <span style={{ color: tk.primary }}> *</span>}
        </span>
        {hint && <span className="text-[10px]" style={{ color: tk.textTer }}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Input({
  value, onChange, placeholder, required,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  required?: boolean;
}) {
  return (
    <input
      type="text"
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors"
      style={{
        background: 'rgba(26,14,9,0.85)',
        border: `1px solid ${tk.border}`,
        color: tk.text,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = tk.borderHov; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = tk.border; }}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-5"
      style={{ background: tk.bg, minHeight: '100dvh' }}>
      <div className="w-full max-w-md flex flex-col items-center">{children}</div>
    </div>
  );
}
