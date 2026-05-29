/**
 * BringMySchoolPage — onboard a new community-tier organization.
 *
 * URL: /bring-school?seed=<uuid>  (when promoting from a seed_institutions row)
 *      /bring-school?name=<text>  (when no seed exists; user typed it free-form)
 *
 * Flow:
 *   1. If ?seed=<id>, fetch and prefill the form from seed_institutions.
 *   2. Founder fills three sections (school → first faculty/class → account).
 *   3. Single submit → `organizationService.bringSchoolOnline()` runs the
 *      atomic RPC (migration 023). All 5 rows are created in one tx.
 *   4. On success, the founder's session is stored in localStorage (matching
 *      the existing `pvx_*` pattern) and they land on /:slug/overview.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  ArrowRight,
  Building2,
  Check,
  GraduationCap,
  Layers,
  Loader2,
  Lock,
  Mail,
  MapPin,
  Phone,
  Sparkles,
  User,
  AlertCircle,
} from 'lucide-react';
import { organizationService } from '@/services/organizationService';
import { APP_NAME } from '@/config/constants';
import TrustBadge from '@/components/trust/TrustBadge';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import type { SeedInstitution } from '@/types/multiTenant';

type BringTokens = {
  primary: string;
  mint: string;
  bg: string;
  panel: string;
  panelHov: string;
  border: string;
  borderHov: string;
  text: string;
  textSec: string;
  textTer: string;
  textTertiary: string;
  danger: string;
  inputBg: string;
  inputBgHov: string;
};

function buildBringTokens(theme: 'light' | 'dark'): BringTokens {
  const dtk = getDashboardTokens(theme);
  return {
    primary: dtk.primary,
    mint: dtk.mint,
    bg: dtk.bg,
    panel: dtk.card,
    panelHov: dtk.cardHover,
    border: dtk.cardBorder,
    borderHov: dtk.primaryRing,
    text: dtk.text,
    textSec: dtk.textSec,
    textTer: dtk.textTer,
    textTertiary: dtk.textTer,
    danger: dtk.danger,
    inputBg: dtk.card,
    inputBgHov: dtk.cardHover,
  };
}

const ORG_TYPES: { value: string; label: string }[] = [
  { value: 'university',           label: 'University' },
  { value: 'polytechnic',          label: 'Polytechnic' },
  { value: 'college_of_education', label: 'College of Education' },
  { value: 'monotechnic',          label: 'Monotechnic' },
  { value: 'seminary',             label: 'Seminary' },
  { value: 'church',               label: 'Church' },
  { value: 'club',                 label: 'Club' },
  { value: 'association',          label: 'Association' },
  { value: 'company',              label: 'Company' },
  { value: 'other',                label: 'Other' },
];

const GROUP_KINDS = [
  { value: 'class',       label: 'Class / Level (e.g. ECE 300L)' },
  { value: 'department',  label: 'Department (e.g. Computer Science)' },
  { value: 'fellowship',  label: 'Fellowship / Ministry' },
  { value: 'chapter',     label: 'Chapter / Branch' },
  { value: 'general',     label: 'General group' },
];

// Session keys — must match what existing services read on auth.
const SESSION_KEYS = {
  AUTH:      'pvx_auth',
  ORG_ID:    'pvx_org_id',
  ORG_SLUG:  'pvx_org_slug',
  MEMBER_ID: 'pvx_member_id',
  GROUP_ID:  'pvx_group_id',
} as const;

interface FormState {
  // Founder
  fullName: string;
  email: string;
  phone: string;
  memberNumber: string;
  password: string;
  passwordConfirm: string;

  // Org
  orgName: string;
  orgShortName: string;
  orgType: string;
  countryCode: string;
  state: string;
  city: string;
  website: string;

  // First faculty + class
  facultyName: string;
  facultyShort: string;
  groupName: string;
  groupShort: string;
  groupKind: string;
  userLevel: string;
}

const EMPTY_FORM: FormState = {
  fullName: '',
  email: '',
  phone: '',
  memberNumber: '',
  password: '',
  passwordConfirm: '',
  orgName: '',
  orgShortName: '',
  orgType: 'university',
  countryCode: 'NG',
  state: '',
  city: '',
  website: '',
  facultyName: '',
  facultyShort: '',
  groupName: '',
  groupShort: '',
  groupKind: 'class',
  userLevel: '',
};

// ────────────────────────────────────────────────────────────────────────────
// Inputs
// ────────────────────────────────────────────────────────────────────────────

function Field({
  tk,
  label,
  hint,
  required,
  icon,
  children,
  className = '',
}: {
  tk: BringTokens;
  label: string;
  hint?: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: tk.textSec }}>
          {icon}
          <span className="ml-1.5 inline-block align-middle">
            {label}
            {required && <span style={{ color: tk.primary }}> *</span>}
          </span>
        </span>
        {hint && <span className="text-[10px]" style={{ color: tk.textTer }}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function TextInput({
  tk,
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
  required,
}: {
  tk: BringTokens;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
  required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      autoComplete={autoComplete}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors"
      style={{
        background: tk.inputBg,
        border: `1px solid ${tk.border}`,
        color: tk.text,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = tk.borderHov; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = tk.border; }}
    />
  );
}

function SelectInput({
  tk,
  value,
  onChange,
  options,
}: {
  tk: BringTokens;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors appearance-none"
      style={{
        background: tk.inputBg,
        border: `1px solid ${tk.border}`,
        color: tk.text,
      }}
    >
      {options.map((o) => (
        <option key={o.value} value={o.value} style={{ background: tk.bg, color: tk.text }}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Main component
// ────────────────────────────────────────────────────────────────────────────

export default function BringMySchoolPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { theme } = useTheme();
  const tk = buildBringTokens(theme);
  const seedId = params.get('seed');
  const prefillName = params.get('name') || '';

  const [seed, setSeed] = useState<SeedInstitution | null>(null);
  const [seedLoading, setSeedLoading] = useState(Boolean(seedId));
  const [form, setForm] = useState<FormState>({ ...EMPTY_FORM, orgName: prefillName });

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // ── Prefill from seed ──
  useEffect(() => {
    if (!seedId) return;
    let cancelled = false;
    (async () => {
      const s = await organizationService.getSeedInstitution(seedId);
      if (cancelled || !s) return setSeedLoading(false);
      setSeed(s);
      setForm((f) => ({
        ...f,
        orgName:      s.name,
        orgShortName: s.short_name ?? f.orgShortName,
        orgType:      s.type ?? f.orgType,
        countryCode:  s.country_code ?? f.countryCode,
        state:        s.state ?? '',
        city:         s.city ?? '',
        website:      s.website ?? '',
      }));
      setSeedLoading(false);
    })();
    return () => { cancelled = true; };
  }, [seedId]);

  // ── Derived ──
  const pwMismatch = form.password.length >= 6 && form.passwordConfirm.length >= 6 && form.password !== form.passwordConfirm;
  const canSubmit  = useMemo(() => {
    return (
      form.fullName.trim().length > 1 &&
      form.email.includes('@') &&
      form.memberNumber.trim().length > 1 &&
      form.password.length >= 6 &&
      form.password === form.passwordConfirm &&
      form.orgName.trim().length > 2 &&
      form.orgType &&
      form.groupName.trim().length > 1
    );
  }, [form]);

  // ── Submit ──
  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);

    const res = await organizationService.bringSchoolOnline({
      fullName:     form.fullName,
      email:        form.email,
      phone:        form.phone,
      memberNumber: form.memberNumber,
      password:     form.password,
      orgName:      form.orgName,
      orgShortName: form.orgShortName || undefined,
      orgType:      form.orgType,
      countryCode:  form.countryCode,
      state:        form.state,
      city:         form.city,
      website:      form.website,
      seedId:       seedId || null,
      facultyName:  form.facultyName || undefined,
      facultyShort: form.facultyShort || undefined,
      groupName:    form.groupName,
      groupShort:   form.groupShort || undefined,
      groupKind:    form.groupKind,
      userLevel:    form.userLevel || undefined,
    });

    if (!res.ok || !res.slug || !res.member_id || !res.group_id || !res.org_id) {
      setError(res.error || 'Could not create your organization. Please try again.');
      setSubmitting(false);
      return;
    }

    // Persist session for the new founder so they land logged in.
    try {
      localStorage.setItem(SESSION_KEYS.AUTH,      'active');
      localStorage.setItem(SESSION_KEYS.ORG_ID,    res.org_id);
      localStorage.setItem(SESSION_KEYS.ORG_SLUG,  res.slug);
      localStorage.setItem(SESSION_KEYS.MEMBER_ID, res.member_id);
      localStorage.setItem(SESSION_KEYS.GROUP_ID,  res.group_id);
    } catch {
      // ignore — session keys are best-effort; user can still log in manually
    }

    navigate(`/${res.slug}/overview`);
  };

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh', background: tk.bg }}>
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full blur-[160px]"
          style={{
            width: 560, height: 560,
            background: `radial-gradient(circle, ${tk.primary} 0%, transparent 70%)`,
            top: '-10%', right: '-12%', opacity: 0.14,
          }}
        />
        <div
          className="absolute rounded-full blur-[140px]"
          style={{
            width: 400, height: 400,
            background: `radial-gradient(circle, ${tk.mint} 0%, transparent 70%)`,
            bottom: '5%', left: '-8%', opacity: 0.08,
          }}
        />
      </div>

      {/* ── Top bar ── */}
      <nav className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back
        </button>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-sm"
            style={{ background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)' }}
          >
            P
          </div>
          <span className="text-base font-bold" style={{ color: tk.text }}>{APP_NAME}</span>
        </div>
      </nav>

      {/* ── Header ── */}
      <header className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pt-4 pb-8">
        <motion.div
          className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full text-xs font-semibold"
          style={{ background: `${tk.primary}14`, color: tk.primary, border: `1px solid ${tk.primary}25` }}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <Sparkles className="w-3.5 h-3.5" />
          Bring your school online
        </motion.div>

        <motion.h1
          className="text-3xl sm:text-4xl font-extrabold tracking-tight leading-tight mb-3"
          style={{ color: tk.text }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          {seedLoading
            ? 'Loading your school…'
            : seed
              ? <>Activate <span style={{ color: tk.primary }}>{seed.name}</span> on Payvexo</>
              : 'Add a new organization'}
        </motion.h1>

        <motion.p
          className="text-sm sm:text-base max-w-2xl leading-7"
          style={{ color: tk.textSec }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.15 }}
        >
          You'll become the founding member. Your school launches at{' '}
          <span className="inline-flex translate-y-0.5">
            <TrustBadge level="community" size="sm" />
          </span>{' '}
          trust. Once a verified executive (HOD, treasurer, class rep) claims it, the trust level rises automatically.
        </motion.p>
      </header>

      {/* ── Form ── */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pb-24 space-y-6"
      >
        {/* ── Section 1: Your school ── */}
        <Panel tk={tk} title="Your school" subtitle="The organization you're bringing online." icon={<Building2 className="w-4 h-4" />}>
          <Field tk={tk} label="Organization name" required>
            <TextInput tk={tk} value={form.orgName} onChange={(v) => setField('orgName', v)} placeholder="University of Nigeria, Nsukka" required />
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field tk={tk} label="Short name" hint="e.g. UNN">
              <TextInput tk={tk} value={form.orgShortName} onChange={(v) => setField('orgShortName', v.toUpperCase())} placeholder="UNN" />
            </Field>
            <Field tk={tk} label="Type" required>
              <SelectInput tk={tk} value={form.orgType} onChange={(v) => setField('orgType', v)} options={ORG_TYPES} />
            </Field>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Field tk={tk} label="State" icon={<MapPin className="w-3 h-3" />}>
              <TextInput tk={tk} value={form.state} onChange={(v) => setField('state', v)} placeholder="Enugu" />
            </Field>
            <Field tk={tk} label="City">
              <TextInput tk={tk} value={form.city} onChange={(v) => setField('city', v)} placeholder="Nsukka" />
            </Field>
            <Field tk={tk} label="Website" hint="optional">
              <TextInput tk={tk} value={form.website} onChange={(v) => setField('website', v)} placeholder="https://example.edu.ng" />
            </Field>
          </div>
        </Panel>

        {/* ── Section 2: Your faculty + class ──
            Faculty subgroup only makes sense for academic orgs.
            A church / club / NGO doesn't have a Faculty — hiding it
            keeps the form honest. The leaf group is always required
            (church → first ministry; club → first chapter; uni → first class). */}
        {(() => {
          const t = form.orgType;
          const isAcademic = t === 'university' || t === 'polytechnic'
            || t === 'college_of_education' || t === 'monotechnic' || t === 'seminary';
          const sectionTitle = isAcademic
            ? 'Your faculty and class'
            : t === 'church'
              ? 'Your ministry / fellowship'
              : t === 'club' || t === 'association'
                ? 'Your chapter / unit'
                : 'Your first group';
          const sectionSubtitle = isAcademic
            ? "We create the hierarchy with you in your class. Skip the faculty if your org doesn't use them."
            : "We'll create this as the founding group. You can add more later.";
          const leafLabel = isAcademic
            ? 'Your class / department name'
            : t === 'church'
              ? 'Ministry name'
              : t === 'club' || t === 'association'
                ? 'Chapter name'
                : 'Group name';
          const leafPlaceholder = isAcademic
            ? 'Electrical Engineering'
            : t === 'church'
              ? 'Youth Ministry'
              : t === 'club' || t === 'association'
                ? 'Lagos Chapter'
                : 'Founding group';
          const levelLabel = isAcademic
            ? 'Your level / position'
            : 'Your role';
          const levelPlaceholder = isAcademic ? '200L' : 'Member';

          return (
            <Panel
              tk={tk}
              title={sectionTitle}
              subtitle={sectionSubtitle}
              icon={<GraduationCap className="w-4 h-4" />}
            >
              {isAcademic && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Field tk={tk} label="Faculty name" hint="optional">
                    <TextInput tk={tk} value={form.facultyName} onChange={(v) => setField('facultyName', v)} placeholder="School of Engineering" />
                  </Field>
                  <Field tk={tk} label="Faculty short name" hint="e.g. SOE">
                    <TextInput tk={tk} value={form.facultyShort} onChange={(v) => setField('facultyShort', v.toUpperCase())} placeholder="SOE" />
                  </Field>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field tk={tk} label={leafLabel} required icon={<Layers className="w-3 h-3" />}>
                  <TextInput tk={tk} value={form.groupName} onChange={(v) => setField('groupName', v)} placeholder={leafPlaceholder} required />
                </Field>
                <Field tk={tk} label="Short name" hint="e.g. EEE">
                  <TextInput tk={tk} value={form.groupShort} onChange={(v) => setField('groupShort', v.toUpperCase())} placeholder="EEE" />
                </Field>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field tk={tk} label="Group kind" required>
                  <SelectInput tk={tk} value={form.groupKind} onChange={(v) => setField('groupKind', v)} options={GROUP_KINDS} />
                </Field>
                <Field tk={tk} label={levelLabel} hint={isAcademic ? 'e.g. 200L, SS2, Member' : undefined}>
                  <TextInput tk={tk} value={form.userLevel} onChange={(v) => setField('userLevel', v)} placeholder={levelPlaceholder} />
                </Field>
              </div>
            </Panel>
          );
        })()}

        {/* ── Section 3: Your account ── */}
        <Panel
          tk={tk}
          title="Your account"
          subtitle="You'll log in with this. Your member ID + password get you back to your dashboard."
          icon={<User className="w-4 h-4" />}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field tk={tk} label="Full name" required>
              <TextInput tk={tk} value={form.fullName} onChange={(v) => setField('fullName', v)} placeholder="John Doe" required autoComplete="name" />
            </Field>
            <Field tk={tk} label="Member ID" required hint="matric / staff / member number">
              <TextInput tk={tk} value={form.memberNumber} onChange={(v) => setField('memberNumber', v)} placeholder="2018/1/12345" required />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field tk={tk} label="Email" required icon={<Mail className="w-3 h-3" />}>
              <TextInput tk={tk} value={form.email} onChange={(v) => setField('email', v)} placeholder="you@example.com" type="email" required autoComplete="email" />
            </Field>
            <Field tk={tk} label="Phone" icon={<Phone className="w-3 h-3" />}>
              <TextInput tk={tk} value={form.phone} onChange={(v) => setField('phone', v)} placeholder="+234 800 000 0000" autoComplete="tel" />
            </Field>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field tk={tk} label="Password" required icon={<Lock className="w-3 h-3" />} hint="at least 6 chars">
              <TextInput tk={tk} value={form.password} onChange={(v) => setField('password', v)} placeholder="••••••••" type="password" required autoComplete="new-password" />
            </Field>
            <Field tk={tk} label="Confirm password" required>
              <TextInput tk={tk} value={form.passwordConfirm} onChange={(v) => setField('passwordConfirm', v)} placeholder="••••••••" type="password" required autoComplete="new-password" />
            </Field>
          </div>
          {pwMismatch && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: tk.danger }}>
              <AlertCircle className="w-3.5 h-3.5" />
              Passwords do not match.
            </p>
          )}
        </Panel>

        {/* ── Error ── */}
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
              <p className="text-sm leading-6" style={{ color: tk.text }}>
                {error}
              </p>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Submit ── */}
        <div className="pt-2 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs leading-5" style={{ color: tk.textTer, maxWidth: 380 }}>
            By creating, you agree to {APP_NAME}'s terms. Your data is isolated to this organization and never shared with others.
          </p>
          <motion.button
            type="submit"
            disabled={!canSubmit || submitting}
            className="px-7 py-3.5 rounded-2xl font-bold text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
              color: tk.text,
              boxShadow: canSubmit ? '0 8px 30px rgba(255,104,3,0.4)' : 'none',
            }}
            whileHover={canSubmit && !submitting ? { scale: 1.03 } : undefined}
            whileTap={canSubmit && !submitting ? { scale: 0.97 } : undefined}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Check className="w-4 h-4" />
                Bring my school online
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
        </div>
      </form>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Panel
// ────────────────────────────────────────────────────────────────────────────

function Panel({
  tk,
  title,
  subtitle,
  icon,
  children,
}: {
  tk: BringTokens;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-2xl p-5 sm:p-6"
      style={{
        background: tk.panel,
        border: `1px solid ${tk.border}`,
        backdropFilter: 'blur(8px)',
      }}
    >
      <header className="mb-5">
        <h2 className="flex items-center gap-2 text-base font-bold" style={{ color: tk.text }}>
          {icon && (
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: `${tk.primary}15`, color: tk.primary }}
            >
              {icon}
            </span>
          )}
          {title}
        </h2>
        {subtitle && (
          <p className="text-xs mt-1.5 leading-5" style={{ color: tk.textSec }}>
            {subtitle}
          </p>
        )}
      </header>

      <div className="space-y-4">{children}</div>
    </motion.section>
  );
}
