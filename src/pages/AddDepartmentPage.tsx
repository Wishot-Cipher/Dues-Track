/**
 * AddDepartmentPage — add a new department inside an existing faculty.
 *
 * Route: /:orgSlug/f/:facultyShortName/new
 *
 * Flow:
 *   1. Loads the org + faculty for context (shows them in the header)
 *   2. Founder fills two sections: department details, then their account
 *   3. Single submit → organizationService.addDepartmentToFaculty()
 *      Atomically creates: department group → founder member → founder admin
 *   4. On success → session is stored → land on /:slug/dashboard
 *
 * This is the missing piece of the school → faculty → department flow.
 * The founder of the department becomes its admin (scope=group), so
 * they own its dues, expenses, and roster from day one — matching the
 * strict autonomy model from mig 022.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  GraduationCap,
  Layers,
  Loader2,
  Lock,
  Mail,
  Phone,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { organizationService } from '@/services/organizationService';
import TrustBadge from '@/components/trust/TrustBadge';
import { APP_NAME } from '@/config/constants';
import type {
  Organization,
  OrganizationGroup,
  TrustLevel,
} from '@/types/multiTenant';

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

const KIND_OPTIONS: { value: 'department' | 'class' | 'general'; label: string; description: string }[] = [
  { value: 'department', label: 'Department',  description: 'A discipline within the faculty (e.g. Computer Science).' },
  { value: 'class',      label: 'Class / Year', description: 'A specific level inside a department (e.g. EEE 300L).' },
  { value: 'general',    label: 'Other group', description: 'Any other unit — committee, society, society chapter.' },
];

const SESSION_KEYS = {
  AUTH:      'pvx_auth',
  ORG_ID:    'pvx_org_id',
  ORG_SLUG:  'pvx_org_slug',
  MEMBER_ID: 'pvx_member_id',
  GROUP_ID:  'pvx_group_id',
} as const;

interface Form {
  // Department
  departmentName: string;
  departmentShortName: string;
  departmentKind: 'department' | 'class' | 'general';
  // Founder
  fullName: string;
  email: string;
  phone: string;
  memberNumber: string;
  password: string;
  passwordConfirm: string;
  userLevel: string;
}

const EMPTY: Form = {
  departmentName: '',
  departmentShortName: '',
  departmentKind: 'department',
  fullName: '',
  email: '',
  phone: '',
  memberNumber: '',
  password: '',
  passwordConfirm: '',
  userLevel: '',
};

export default function AddDepartmentPage() {
  // Page handles BOTH routes:
  //   /:orgSlug/f/:facultyShortName/new   → adds a department under a faculty
  //   /:orgSlug/d/:departmentShort/new    → adds a class under a department
  // The parent shortname comes from whichever URL param is set.
  const { orgSlug, facultyShortName, departmentShort } =
    useParams<{ orgSlug: string; facultyShortName?: string; departmentShort?: string }>();
  const navigate = useNavigate();

  const parentShortNameRaw = facultyShortName ?? departmentShort ?? '';
  const parentShortName = decodeURIComponent(parentShortNameRaw);

  const [loading, setLoading] = useState(true);
  const [org, setOrg] = useState<Organization | null>(null);
  // `parent` is the faculty OR the department, depending on entry URL.
  // We keep the variable name `faculty` below for minimum churn through
  // the rest of the file; semantically it now means "parent group".
  const [faculty, setFaculty] = useState<OrganizationGroup | null>(null);
  const [form, setForm] = useState<Form>(EMPTY);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isAddingClass = Boolean(departmentShort);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!orgSlug || !parentShortName) return;
      setLoading(true);

      const orgData = await organizationService.getBySlug(orgSlug);
      if (cancelled || !orgData) { setLoading(false); return; }
      setOrg(orgData);

      const groups = await organizationService.getGroups(orgData.id);
      if (cancelled) return;
      const parent = groups.find((g) => {
        if (g.short_name?.toLowerCase() !== parentShortName.toLowerCase()) return false;
        const k = g.kind?.toLowerCase();
        return isAddingClass
          ? (k === 'department' || k === 'general')
          : (k === 'faculty' || k === 'college');
      }) ?? null;
      setFaculty(parent);

      // Seed the kind picker default sensibly
      setForm((f) => ({
        ...f,
        departmentKind: isAddingClass ? 'class' : 'department',
      }));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgSlug, parentShortName, isAddingClass]);

  const pwMismatch =
    form.password.length >= 6 &&
    form.passwordConfirm.length >= 6 &&
    form.password !== form.passwordConfirm;

  const canSubmit = useMemo(() => (
    form.departmentName.trim().length > 1 &&
    form.fullName.trim().length > 1 &&
    form.email.includes('@') &&
    form.memberNumber.trim().length > 1 &&
    form.password.length >= 6 &&
    form.password === form.passwordConfirm
  ), [form]);

  const setF = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting || !org || !faculty) return;
    setSubmitting(true);
    setError(null);

    const res = await organizationService.addSubgroupToParent({
      orgSlug:           org.slug,
      parentShortName:   faculty.short_name,
      subgroupName:      form.departmentName,
      subgroupShortName: form.departmentShortName || undefined,
      subgroupKind:      form.departmentKind,
      fullName:          form.fullName,
      email:             form.email,
      phone:             form.phone || undefined,
      memberNumber:      form.memberNumber,
      password:          form.password,
      userLevel:            form.userLevel || undefined,
    });

    if (!res.ok || !res.slug || !res.member_id || !res.group_id || !res.org_id) {
      setError(res.error || 'Could not create the department. Please try again.');
      setSubmitting(false);
      return;
    }

    try {
      localStorage.setItem(SESSION_KEYS.AUTH,      'active');
      localStorage.setItem(SESSION_KEYS.ORG_ID,    res.org_id);
      localStorage.setItem(SESSION_KEYS.ORG_SLUG,  res.slug);
      localStorage.setItem(SESSION_KEYS.MEMBER_ID, res.member_id);
      localStorage.setItem(SESSION_KEYS.GROUP_ID,  res.group_id);
    } catch { /* best-effort */ }

    navigate(`/${res.slug}/dashboard`);
  };

  // ── Render guards ──
  if (loading) {
    return (
      <Centered>
        <motion.div
          className="w-10 h-10 border-2 rounded-full"
          style={{ borderColor: `${tk.primary}30`, borderTopColor: tk.primary }}
          animate={{ rotate: 360 }}
          transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
        />
        <p className="text-xs tracking-wider mt-3" style={{ color: tk.textTer }}>
          Loading…
        </p>
      </Centered>
    );
  }

  if (!org || !faculty) {
    return (
      <Centered>
        <div className="text-center max-w-md">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center"
            style={{ background: `${tk.primary}15` }}>
            <Layers className="w-7 h-7" style={{ color: tk.primary }} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3 tracking-tight">Faculty not found</h1>
          <p className="text-sm leading-6" style={{ color: tk.textSec }}>
            We couldn't find <span className="text-white font-semibold">/{orgSlug}/f/{facultyShortName}</span>.
          </p>
          <motion.button
            onClick={() => navigate(orgSlug ? `/${orgSlug}/overview` : '/')}
            className="mt-6 px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #FF6803, #FFAC5F)' }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Back
          </motion.button>
        </div>
      </Centered>
    );
  }

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
        <div
          className="absolute rounded-full blur-[140px]"
          style={{
            width: 400, height: 400,
            background: `radial-gradient(circle, ${tk.primary} 0%, transparent 70%)`,
            bottom: '5%', left: '-8%', opacity: 0.10,
          }}
        />
      </div>

      {/* Top bar */}
      <nav className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
        <button
          onClick={() =>
            navigate(
              isAddingClass
                ? `/${org.slug}/d/${encodeURIComponent(faculty.short_name)}`
                : `/${org.slug}/f/${encodeURIComponent(faculty.short_name)}`
            )
          }
          className="flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" />
          Back to {faculty.short_name}
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

      {/* Context header */}
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
            <div
              className="shrink-0 w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: `${tk.blue}18`, border: `1px solid ${tk.blue}30` }}
            >
              <GraduationCap className="w-6 h-6" style={{ color: tk.blue }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-1"
                style={{ color: tk.textTer }}>
                {org.name} · {isAddingClass ? 'Department' : (org as { unit_label?: string }).unit_label ?? 'Faculty'}
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight">
                {isAddingClass ? 'Add a class to' : 'Add a department to'} {faculty.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <TrustBadge level={(org.trust_level as TrustLevel) ?? 'community'} size="sm" />
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: `${tk.blue}14`, color: tk.blue }}>
                  <Layers className="w-3 h-3" /> {faculty.short_name}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </header>

      {/* Form */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pb-24 space-y-6"
      >
        {/* Section 1: Department */}
        <Panel
          title="The department"
          subtitle="You'll be the founding admin. Members will join here."
          icon={<BookOpen className="w-4 h-4" />}
        >
          <Field label="Department name" required>
            <Input value={form.departmentName} onChange={(v) => setF('departmentName', v)} placeholder="Electrical & Computer Engineering" required />
          </Field>
          <Row>
            <Field label="Short name" hint="e.g. ECE">
              <Input value={form.departmentShortName} onChange={(v) => setF('departmentShortName', v.toUpperCase())} placeholder="ECE" />
            </Field>
            <Field label="What is this?" required>
              <div className="grid grid-cols-3 gap-2">
                {KIND_OPTIONS.map((k) => {
                  const active = form.departmentKind === k.value;
                  return (
                    <button
                      key={k.value}
                      type="button"
                      onClick={() => setF('departmentKind', k.value)}
                      className="rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                      style={{
                        background: active ? `${tk.primary}18` : 'rgba(255,255,255,0.04)',
                        color: active ? tk.primary : tk.textSec,
                        border: `1px solid ${active ? `${tk.primary}40` : tk.border}`,
                      }}
                    >
                      {k.label}
                    </button>
                  );
                })}
              </div>
            </Field>
          </Row>
        </Panel>

        {/* Section 2: Founder account */}
        <Panel
          title="Your founding account"
          subtitle="You become the first admin of this department. Use these credentials to sign in afterwards."
          icon={<User className="w-4 h-4" />}
        >
          <Row>
            <Field label="Full name" required>
              <Input value={form.fullName} onChange={(v) => setF('fullName', v)} placeholder="John Doe" autoComplete="name" required />
            </Field>
            <Field label="Member ID" required hint="matric / staff / member number">
              <Input value={form.memberNumber} onChange={(v) => setF('memberNumber', v)} placeholder="2018/1/12345" required />
            </Field>
          </Row>
          <Row>
            <Field label="Email" required icon={<Mail className="w-3 h-3" />}>
              <Input value={form.email} onChange={(v) => setF('email', v)} placeholder="you@example.com" type="email" autoComplete="email" required />
            </Field>
            <Field label="Phone" icon={<Phone className="w-3 h-3" />}>
              <Input value={form.phone} onChange={(v) => setF('phone', v)} placeholder="+234 800 000 0000" type="tel" autoComplete="tel" />
            </Field>
          </Row>
          <Row>
            <Field label="Password" required icon={<Lock className="w-3 h-3" />} hint="at least 6 chars">
              <Input value={form.password} onChange={(v) => setF('password', v)} placeholder="••••••••" type="password" autoComplete="new-password" required />
            </Field>
            <Field label="Confirm password" required>
              <Input value={form.passwordConfirm} onChange={(v) => setF('passwordConfirm', v)} placeholder="••••••••" type="password" autoComplete="new-password" required />
            </Field>
          </Row>
          <Field label="Your level / position" hint="optional, e.g. 200L, SS2, Member">
            <Input value={form.userLevel} onChange={(v) => setF('userLevel', v)} placeholder="200L" />
          </Field>
          {pwMismatch && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: tk.danger }}>
              <AlertCircle className="w-3.5 h-3.5" />
              Passwords do not match.
            </p>
          )}
        </Panel>

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

        <div className="pt-2 flex items-center justify-between gap-4 flex-wrap">
          <p className="text-xs leading-5" style={{ color: tk.textTer, maxWidth: 380 }}>
            Other classes and faculties in this organization will not see your department's payments, members, or expenses.
          </p>
          <motion.button
            type="submit"
            disabled={!canSubmit || submitting}
            className="px-7 py-3.5 rounded-2xl text-white font-bold text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
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
                <Sparkles className="w-4 h-4" />
                Create department
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
// Small parts
// ────────────────────────────────────────────────────────────────────────────

function Panel({
  title,
  subtitle,
  icon,
  children,
}: {
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
      className="rounded-3xl p-5 sm:p-6"
      style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
    >
      <header className="mb-5">
        <h2 className="flex items-center gap-2 text-base font-bold text-white">
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

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({
  label, hint, required, icon, children,
}: {
  label: string;
  hint?: string;
  required?: boolean;
  icon?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
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

function Input({
  value, onChange, placeholder, type = 'text', autoComplete, required,
}: {
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
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: tk.bg, minHeight: '100dvh' }}
    >
      <div className="w-full max-w-md flex flex-col items-center">{children}</div>
    </div>
  );
}
