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
  amber: string;
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
    // Amber is used by the review step's "what happens next" callout
    // (community-trust warning). Was missing from BringTokens and the
    // review block referenced tk.amber directly — type error.
    amber: dtk.amber,
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

  // ── Wizard state ──────────────────────────────────────────────
  // Was a single long page that asked for everything at once. The
  // user kept seeing "school → faculty → account" as a wall of
  // fields and bouncing off. Splitting into 4 focused steps + a
  // review screen keeps each moment small and lets us write a
  // helper paragraph per step explaining WHY we're asking.
  //   1. School       — name, slug-able short name, type, location
  //   2. Structure    — first faculty (academic only) + first group
  //   3. Account      — the founder's login + contact
  //   4. Review       — every choice, confirm, then create
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const totalSteps = 4;
  const reviewStep = 4;

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
      form.groupName.trim().length > 1 &&
      // Academic orgs must commit to a class level — every member
      // who joins this class will inherit it (mig 103). Inlined
      // because `isAcademicType` is declared a few lines below
      // (const TDZ), so referring to it here errors at runtime.
      (
        !(form.orgType === 'university' || form.orgType === 'polytechnic'
          || form.orgType === 'college_of_education' || form.orgType === 'monotechnic'
          || form.orgType === 'seminary')
        || form.userLevel.trim().length > 0
      )
    );
  }, [form]);

  // Convenience flags re-used across step rendering + the live preview.
  const isAcademicType = useMemo(() => {
    const t = form.orgType;
    return t === 'university' || t === 'polytechnic'
      || t === 'college_of_education' || t === 'monotechnic' || t === 'seminary';
  }, [form.orgType]);

  // Per-step validation. Returns an error message (string) when the
  // step is incomplete, or null when it's good to advance. Wraps the
  // existing canSubmit logic, but split by tier so the user sees the
  // exact field they missed rather than a blanket "fill everything".
  const validateStep = (n: number): string | null => {
    if (n === 1) {
      if (form.orgName.trim().length < 3) return 'Organisation name needs at least 3 characters.';
      if (!form.orgType) return 'Pick the organisation type so we set up the right terminology.';
    }
    if (n === 2) {
      if (form.groupName.trim().length < 2) {
        const what = isAcademicType ? 'class / department'
          : form.orgType === 'church' ? 'ministry'
          : form.orgType === 'club' || form.orgType === 'association' ? 'chapter'
          : 'group';
        return `Tell us the ${what} you belong to.`;
      }
      // Level is now required for academic orgs — the class carries
      // ONE level and every joiner inherits it (mig 103). Without
      // this, the founder lands in a class with no level set, and
      // every subsequent invite has no level to inherit.
      if (isAcademicType && form.userLevel.trim().length === 0) {
        return 'Tell us your class level (e.g. 200L). Members joining your class will inherit it automatically.';
      }
    }
    if (n === 3) {
      if (form.fullName.trim().length < 2) return 'Enter your full name.';
      if (!form.email.includes('@')) return 'Enter a valid email address.';
      if (form.memberNumber.trim().length < 2) return 'Enter your member / matric / staff ID.';
      if (form.password.length < 6) return 'Password needs to be at least 6 characters.';
      if (form.password !== form.passwordConfirm) return 'Passwords do not match.';
    }
    return null;
  };

  const nextStep = () => {
    const msg = validateStep(step);
    if (msg) { setError(msg); return; }
    setError(null);
    setStep((s) => (Math.min(reviewStep, s + 1) as 1 | 2 | 3 | 4));
  };
  const prevStep = () => {
    setError(null);
    setStep((s) => (Math.max(1, s - 1) as 1 | 2 | 3 | 4));
  };

  // Per-step labels for the chip + stepper + live preview "you are here".
  const stepLabel = (n: number): string => {
    if (n === 1) return 'Your school';
    if (n === 2) return isAcademicType ? 'Faculty + class' : 'Your first group';
    if (n === 3) return 'Your account';
    return 'Review';
  };
  // Per-step helper text. Was missing on several steps — the user
  // specifically called this out. Each paragraph explains WHAT the
  // step is for so they don't have to guess.
  const stepHelp = (n: number): string => {
    if (n === 1) return 'Tell us about your school. We use this to set the right labels everywhere — Faculty / Department / Ministry / Chapter — so the rest of the app speaks your dialect.';
    if (n === 2) {
      return isAcademicType
        ? 'Create the slice you actually belong to. We make the faculty (optional) and your class with you sitting in it. You can add more faculties, departments, and classes later from the Org Structure page.'
        : "Name the smallest unit you belong to — a ministry, a chapter, a working group. You're the founding member of this group; you can add more groups once you're inside.";
    }
    if (n === 3) return "This is the account you'll sign in with. Use the ID your members actually know you by (matric, staff number, member number) — the same one you use to identify yourself in real life.";
    return 'One last look. Confirm everything reads right — the slug becomes part of every URL your members see, and the org type controls labels across the whole app.';
  };

  // ── Submit ──
  const setField = <K extends keyof FormState>(k: K, v: FormState[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    // Hard guard: hitting Enter on a text input inside steps 1-3
    // would otherwise fire the form's onSubmit and try to provision
    // the org with half-filled state. Refuse unless the user is
    // actually on the review screen.
    if (step !== reviewStep) {
      // Behave like Continue did — validate the current step, advance.
      nextStep();
      return;
    }
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
      // Force 'class' for academic orgs regardless of the form
      // state — the picker is hidden there in G5c, so a stale
      // value from a flow that started non-academic shouldn't
      // sneak through. Non-academic flows keep whatever the user
      // picked.
      groupKind:    isAcademicType ? 'class' : form.groupKind,
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

      {/* ── Header (wizard) ─────────────────────────────────────
          Chip + step-aware H1 + helper paragraph. Previous version
          rendered the same hero for every page state, which made
          the long single-page form feel undifferentiated. Now the
          H1 tells the user what THIS screen is and the paragraph
          below explains WHY we're asking for it. */}
      <header className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pt-4 pb-6 space-y-3">
        <motion.div
          className="flex items-center gap-2 flex-wrap"
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-[0.18em]"
            style={{ background: `${tk.primary}14`, color: tk.primary, border: `1px solid ${tk.primary}25` }}
          >
            <Sparkles className="w-3 h-3" />
            Bring your school online
          </span>
          <span
            className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: tk.textTer }}
          >
            Step {step}/{totalSteps} · {stepLabel(step)}
          </span>
        </motion.div>

        <motion.h1
          className="text-2xl sm:text-[28px] font-extrabold tracking-tight leading-tight"
          style={{ color: tk.text }}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          {seedLoading
            ? 'Loading your school…'
            : step === 1 && seed
              ? <>Activate <span style={{ color: tk.primary }}>{seed.name}</span></>
              : stepLabel(step)}
        </motion.h1>

        <motion.p
          className="text-sm max-w-2xl leading-6"
          style={{ color: tk.textSec }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.1 }}
        >
          {stepHelp(step)}
        </motion.p>

        {/* Trust note — only on step 1 so it doesn't repeat. Tells
            the founder up-front that they're starting at "community"
            trust until a verified exec claims it; matches what the
            graduated-trust system actually does. */}
        {step === 1 && !seedLoading && (
          <motion.p
            className="text-xs leading-5 max-w-2xl"
            style={{ color: tk.textTer }}
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
        )}

        {/* Stepper — fills as the user advances. The active segment
            glows so the current spot is unmistakable. */}
        <div className="flex gap-1.5 pt-2">
          {Array.from({ length: totalSteps }, (_, i) => {
            const n = i + 1;
            const done = n < step;
            const active = n === step;
            return (
              <div
                key={n}
                className="flex-1 h-1.5 rounded-full transition-all duration-300"
                style={{
                  background: done || active ? tk.primary : (theme === 'light' ? 'rgba(15,7,3,0.08)' : 'rgba(255,255,255,0.08)'),
                  boxShadow: active ? `0 0 12px ${tk.primary}50` : 'none',
                  opacity: done ? 0.7 : 1,
                }}
              />
            );
          })}
        </div>
      </header>

      {/* ── Form ── */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pb-24 space-y-6"
      >
        {/* ── Step 1: Your school ── */}
        {step === 1 && (
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
        )}

        {/* ── Step 2: Your faculty + class / first group ──
            Faculty subgroup only makes sense for academic orgs.
            A church / club / NGO doesn't have a Faculty — hiding it
            keeps the form honest. The leaf group is always required
            (church → first ministry; club → first chapter; uni → first class). */}
        {step === 2 && (() => {
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
                  <Field tk={tk} label="Faculty name" hint="optional — leave blank and we'll nest your class directly under the org">
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

              <div className={`grid grid-cols-1 ${isAcademic ? '' : 'sm:grid-cols-2'} gap-4`}>
                {/* Group kind picker hidden for academic orgs in
                    Chunk G5c — every founder there is in a class,
                    and the picker just made people second-guess
                    themselves ("am I a class or a department?").
                    Non-academic orgs (church, club, etc.) still see
                    the picker because their hierarchy varies. */}
                {!isAcademic && (
                  <Field tk={tk} label="Group kind" required>
                    <SelectInput tk={tk} value={form.groupKind} onChange={(v) => setField('groupKind', v)} options={GROUP_KINDS} />
                  </Field>
                )}
                <Field
                  tk={tk}
                  label={levelLabel}
                  required={isAcademic}
                  hint={isAcademic
                    ? 'e.g. 200L. Members who join this class inherit it; the class rep can bump it once a year.'
                    : 'e.g. Member, Worker'}
                >
                  <TextInput tk={tk} value={form.userLevel} onChange={(v) => setField('userLevel', v)} placeholder={levelPlaceholder} required={isAcademic} />
                </Field>
              </div>
            </Panel>
          );
        })()}

        {/* ── Step 3: Your account ── */}
        {step === 3 && (
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
        )}

        {/* ── Step 4: Review and confirm ──
            One pure "look it over" screen before submit. Catches a
            slug typo, a wrong faculty, a misspelled member ID — all
            of which become permanent once the org is provisioned.
            The right column would clutter mobile, so all rows are
            inline and grouped by section. */}
        {step === 4 && (
          <Panel
            tk={tk}
            title="Look it over"
            subtitle="Once you submit, the org is provisioned and the slug becomes permanent. Confirm everything reads right."
            icon={<Check className="w-4 h-4" />}
          >
            <ReviewSection tk={tk} heading="Your school">
              <ReviewRow tk={tk} label="Name"        value={form.orgName} />
              <ReviewRow tk={tk} label="Short name"  value={form.orgShortName} />
              <ReviewRow tk={tk} label="Type"        value={form.orgType} />
              {(form.state || form.city) && (
                <ReviewRow tk={tk} label="Location"   value={[form.city, form.state].filter(Boolean).join(', ')} />
              )}
              {form.website && <ReviewRow tk={tk} label="Website" value={form.website} mono />}
            </ReviewSection>

            <ReviewSection tk={tk} heading={isAcademicType ? 'Faculty + class' : 'Your first group'}>
              {isAcademicType && form.facultyName && (
                <ReviewRow tk={tk} label="Faculty" value={`${form.facultyName}${form.facultyShort ? ` (${form.facultyShort})` : ''}`} />
              )}
              <ReviewRow tk={tk} label="Group"     value={`${form.groupName}${form.groupShort ? ` (${form.groupShort})` : ''}`} />
              <ReviewRow tk={tk} label="Kind"      value={form.groupKind} />
              {form.userLevel && <ReviewRow tk={tk} label="Your level" value={form.userLevel} />}
            </ReviewSection>

            <ReviewSection tk={tk} heading="Your account">
              <ReviewRow tk={tk} label="Full name" value={form.fullName} />
              <ReviewRow tk={tk} label="Member ID" value={form.memberNumber} mono />
              <ReviewRow tk={tk} label="Email"     value={form.email} mono />
              {form.phone && <ReviewRow tk={tk} label="Phone" value={form.phone} mono />}
            </ReviewSection>

            <div
              className="p-3 rounded-xl text-xs"
              style={{
                background: `${tk.amber}12`,
                border: `1px solid ${tk.amber}38`,
                color: tk.amber,
              }}
            >
              <p className="font-bold mb-1">What happens next</p>
              <p style={{ color: tk.textSec }}>
                You'll land in your new organisation as the founding member at <strong style={{ color: tk.text }}>community</strong> trust.
                A verified executive (HOD, treasurer, class rep) can later claim the role to lift the trust level — money, payouts, and member management unlock then.
              </p>
            </div>
          </Panel>
        )}

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

        {/* ── Wizard footer: Back + Continue/Create ──
            Continue advances after per-step validation. The Create
            button only renders on the review step (step === 4), so
            the form's onSubmit is only ever triggered once — no risk
            of accidental submit on step 1/2/3 hitting Enter on a
            text input (those keystrokes get intercepted and call
            nextStep instead). */}
        <div className="pt-2 flex items-center justify-between gap-3 flex-wrap">
          {step > 1 ? (
            <button
              type="button"
              onClick={prevStep}
              disabled={submitting}
              className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
              style={{
                background: tk.panel,
                color: tk.text,
                border: `1px solid ${tk.border}`,
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>
          ) : <span />}

          {step < reviewStep ? (
            <button
              type="button"
              onClick={nextStep}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98]"
              style={{
                background: tk.primary,
                color: '#FFFFFF',
                border: `1px solid ${tk.primary}`,
              }}
            >
              Continue
              <ArrowRight className="w-4 h-4" />
            </button>
          ) : (
            <motion.button
              type="submit"
              disabled={!canSubmit || submitting}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-bold disabled:opacity-50"
              style={{
                background: tk.primary,
                color: '#FFFFFF',
                border: `1px solid ${tk.primary}`,
              }}
              whileHover={canSubmit && !submitting ? { y: -2 } : undefined}
              whileTap={canSubmit && !submitting ? { scale: 0.98 } : undefined}
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
                </>
              )}
            </motion.button>
          )}
        </div>

        {/* Terms note — only on review so it doesn't clutter every step. */}
        {step === reviewStep && (
          <p className="text-[11px] leading-5" style={{ color: tk.textTer }}>
            By creating, you agree to {APP_NAME}'s terms. Your data is isolated to this organisation and never shared with others.
          </p>
        )}
      </form>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Review helpers
// ────────────────────────────────────────────────────────────────────────────

function ReviewSection({
  tk, heading, children,
}: { tk: BringTokens; heading: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: tk.primary }}>
        {heading}
      </p>
      <div className="space-y-0">
        {children}
      </div>
    </div>
  );
}

function ReviewRow({
  tk, label, value, mono,
}: { tk: BringTokens; label: string; value: string; mono?: boolean }) {
  return (
    <div
      className="flex items-start justify-between gap-3 py-2"
      style={{ borderBottom: `1px dashed ${tk.border}` }}
    >
      <span className="text-[11px] uppercase tracking-wider font-bold shrink-0" style={{ color: tk.textTer }}>
        {label}
      </span>
      <span
        className={`text-sm font-semibold text-right truncate ${mono ? 'font-mono' : ''}`}
        style={{ color: value ? tk.text : tk.textTer }}
      >
        {value || '—'}
      </span>
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
