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
} from 'lucide-react';
import { organizationService } from '@/services/organizationService';
import { supabase } from '@/config/supabase';
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

// Kind is now derived from the URL context (faculty page = adds dept; dept
// page = adds class), so the legacy KIND_OPTIONS picker is gone. Migration 079
// makes the DB enforce the same rule.

const SESSION_KEYS = {
  AUTH:      'pvx_auth',
  ORG_ID:    'pvx_org_id',
  ORG_SLUG:  'pvx_org_slug',
  MEMBER_ID: 'pvx_member_id',
  GROUP_ID:  'pvx_group_id',
} as const;

interface Form {
  // Who is doing this? Drives which slides show + whether claim is offered.
  // Two intents only — student vs helping. The "staff (no class)"
  // intent was removed when Office was retired (Chunk H).
  // 'student'  — they belong to a class inside this structure
  // 'helping'  — just populating the directory; class skipped, NO claim offered
  intent: 'student' | 'helping' | '';

  // Department / class being created (semantic depends on the route)
  departmentName: string;
  departmentShortName: string;
  departmentKind: 'department' | 'class' | 'general';

  // Founder's own class — always required when adding a dept under
  // a faculty. The legacy "staff (no class)" path was removed in
  // Chunk H (Office concept retired). Every founder now picks a real
  // class — exec capabilities layer on top via member_admins.
  className: string;
  classShortName: string;

  // OPT-IN claim. wantsClaim=false → empty positionTitle goes to the RPC
  // and no claim is filed. The founder is just a class member.
  wantsClaim: boolean;
  positionTitle: string;

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
  intent: '',
  departmentName: '',
  departmentShortName: '',
  departmentKind: 'department',
  className: '',
  classShortName: '',
  wantsClaim: false,    // safe default — wrong person who's just adding the structure isn't prompted
  positionTitle: '',
  fullName: '',
  email: '',
  phone: '',
  memberNumber: '',
  password: '',
  passwordConfirm: '',
  userLevel: '',
};

type WizardStep = 'intent' | 'details' | 'class' | 'account' | 'claim' | 'recap';

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
  const [step, setStep] = useState<WizardStep>('intent');

  const isAddingClass = Boolean(departmentShort);

  // The slide path is computed from the route + the picked intent:
  //   • dept flow + student → intent · details · class · account · claim? · recap
  //   • dept flow + student → intent · details · class · account · claim? · recap
  //   • dept flow + helping → intent · details · class · account · recap (NO claim)
  //   • class flow + student/helping → intent · details · account · claim?/no · recap
  //
  // The class step is now required for both intents on the dept flow
  // because mig 100 (Office removal) makes class info mandatory on
  // bootstrap. A "helper" still creates a class — they can name it
  // anything sensible since they're seeding the structure for the
  // real students who'll join later.
  const steps: WizardStep[] = useMemo(() => {
    const out: WizardStep[] = ['intent', 'details'];
    if (!isAddingClass && form.intent !== '') out.push('class');
    out.push('account');
    if (form.intent !== 'helping' && form.intent !== '') out.push('claim');
    out.push('recap');
    return out;
  }, [isAddingClass, form.intent]);
  const stepIdx = steps.indexOf(step);
  const isFirst = stepIdx === 0;
  const isLast  = stepIdx === steps.length - 1;
  const goBack = () => { if (!isFirst) setStep(steps[stepIdx - 1]); };
  const goNext = () => { if (!isLast)  setStep(steps[stepIdx + 1]); };

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

      // Seed sensible defaults: kind locked by URL, plus a starter title for
      // the role claim so the founder isn't staring at an empty field.
      setForm((f) => ({
        ...f,
        departmentKind: isAddingClass ? 'class' : 'department',
        positionTitle: f.positionTitle || (isAddingClass ? 'Class Rep' : 'Departmental President'),
      }));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [orgSlug, parentShortName, isAddingClass]);

  const pwMismatch =
    form.password.length >= 6 &&
    form.passwordConfirm.length >= 6 &&
    form.password !== form.passwordConfirm;

  // Per-slide gate. Drives the Next / Submit button on each step. Final-submit
  // re-checks the whole form for safety.
  const canAdvance = (s: WizardStep): boolean => {
    switch (s) {
      case 'intent':
        return form.intent !== '';
      case 'details':
        return form.departmentName.trim().length > 1 && form.departmentShortName.trim().length >= 2;
      case 'class':
        // Level is now required at class creation. The class shares
        // one level; new members inherit it instead of typing one,
        // which collapses the "wrong level on someone's profile"
        // class of bug. Class rep can bump it later when the
        // cohort moves up a year.
        return form.className.trim().length > 1 && form.userLevel.trim().length > 0;
      case 'account':
        return form.fullName.trim().length > 1 &&
               form.memberNumber.trim().length > 1 &&
               form.email.includes('@') &&
               form.password.length >= 6 &&
               form.password === form.passwordConfirm;
      case 'claim':
        // Opt-in: if they didn't tick "yes claim", any value passes; if they
        // did, a position title is required.
        return !form.wantsClaim || form.positionTitle.trim().length > 1;
      case 'recap':
        return true;
    }
  };

  // True when ALL data is valid (used at the recap step's submit button).
  const allValid = canAdvance('intent') && canAdvance('details') &&
    (!steps.includes('class') || canAdvance('class')) &&
    canAdvance('account') && (!steps.includes('claim') || canAdvance('claim'));

  const setF = <K extends keyof Form>(k: K, v: Form[K]) => setForm((f) => ({ ...f, [k]: v }));

  // Calls the right bootstrap RPC for the route (dept-with-class on /f/:short/new,
  // class-with-rep on /d/:short/new). Both create the structure + member +
  // pending CLAIM — no instant admin powers. The founder lands on the dashboard
  // with a "Your role is awaiting confirmation" banner from the verification UI.
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!allValid || submitting || !org || !faculty) return;
    setSubmitting(true);
    setError(null);

    const positionToSend =
      form.wantsClaim && form.intent !== 'helping' && form.positionTitle.trim().length > 1
        ? form.positionTitle.trim()
        : null;

    type BootstrapResult = {
      ok: boolean;
      error?: string;
      org_slug?: string;
      org_id?: string;
      member_id?: string;
      member_login_id?: string;
      dept_id?: string;
      class_id?: string;
      claim_id?: string;
    };

    let res: BootstrapResult;
    try {
      if (isAddingClass) {
        // Adding a class under a department.
        const { data } = await supabase.rpc('bootstrap_class_with_rep', {
          p_org_slug:          org.slug,
          p_parent_dept_short: faculty.short_name,   // here `faculty` actually holds the parent dept
          p_class_name:        form.departmentName,
          p_class_short:       form.departmentShortName || null,
          p_class_level:       form.userLevel || null,
          p_founder_full_name: form.fullName,
          p_founder_email:     form.email,
          p_founder_member_id: form.memberNumber,
          p_founder_password:  form.password,
          p_position_title:    positionToSend,
        });
        res = (data ?? { ok: false }) as BootstrapResult;
      } else {
        // Adding a department under a faculty.
        const { data } = await supabase.rpc('bootstrap_department_with_class', {
          p_org_slug:             org.slug,
          p_parent_faculty_short: faculty.short_name,
          p_dept_name:            form.departmentName,
          p_dept_short:           form.departmentShortName,
          p_class_name:           form.className,
          p_class_short:          form.classShortName || null,
          p_class_level:          form.userLevel || null,
          p_founder_full_name:    form.fullName,
          p_founder_email:        form.email,
          p_founder_member_id:    form.memberNumber,
          p_founder_password:     form.password,
          p_position_title:       positionToSend,
        });
        res = (data ?? { ok: false }) as BootstrapResult;
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Network error — please try again.');
      setSubmitting(false);
      return;
    }

    if (!res.ok || !res.org_slug || !res.member_id || !res.org_id) {
      setError(res.error || (isAddingClass ? 'Could not create the class.' : 'Could not create the department.') + ' Please try again.');
      setSubmitting(false);
      return;
    }

    // Stash the session locally so the landing page treats them as signed in.
    // (Server-side JWT minting happens through the existing login endpoint;
    // here we set the legacy localStorage keys so the dashboard renders.)
    try {
      localStorage.setItem(SESSION_KEYS.AUTH,      'active');
      localStorage.setItem(SESSION_KEYS.ORG_ID,    res.org_id);
      localStorage.setItem(SESSION_KEYS.ORG_SLUG,  res.org_slug);
      localStorage.setItem(SESSION_KEYS.MEMBER_ID, res.member_id);
      localStorage.setItem(SESSION_KEYS.GROUP_ID,  res.class_id || res.dept_id || '');
    } catch { /* best-effort */ }

    navigate(`/${res.org_slug}/dashboard`);
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
        {/* ── Progress bar (one segment per slide) ── */}
        <div className="space-y-1.5">
          <div className="flex items-center gap-1.5">
            {steps.map((s, i) => (
              <div
                key={s}
                className="flex-1 h-1 rounded-full transition-colors"
                style={{ background: i <= stepIdx ? tk.primary : tk.border }}
              />
            ))}
          </div>
          <p className="text-[10px] uppercase tracking-[0.2em] font-semibold text-center" style={{ color: tk.textTer }}>
            Step {stepIdx + 1} of {steps.length} · {step}
          </p>
        </div>

        {/* ── Slide: Intent (who you are here) ── */}
        {step === 'intent' && (
          <motion.div
            key="intent"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.22 }}
          >
            <Panel
              title="First — who are you here?"
              subtitle="This tells us whether to put you in a class and whether to offer a role claim. Be honest — no points for picking the wrong one."
              icon={<Sparkles className="w-4 h-4" />}
            >
              <div className="grid gap-3">
                {([
                  // Two intents only — student vs helping. The "staff"
                  // intent that parked founders into an Office bucket
                  // was removed in Chunk H. Every founder is a real
                  // member of a real class; exec powers (dept pres,
                  // HOD, course rep) layer on top via member_admins.
                  ['student', isAddingClass ? 'I belong to this class' : 'I’m a student in this department', 'You\'ll be added to your own class. Even if you\'re a dept president, HOD, or rep, pick this — exec powers are added on top of your class membership.'],
                  ['helping', 'I\'m just helping (this is missing from the directory)',                       'No claim, no role — you just add the structure so others can join.'],
                ] as const).map(([value, label, desc]) => {
                  const active = form.intent === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      onClick={() => {
                        setF('intent', value);
                        // Helping intent never claims; force the opt-in off so they
                        // can't accidentally toggle it later.
                        if (value === 'helping') setF('wantsClaim', false);
                      }}
                      className="text-left rounded-2xl px-4 py-3.5 transition-all"
                      style={{
                        background: active ? `${tk.primary}14` : 'rgba(255,255,255,0.04)',
                        border: `1.5px solid ${active ? tk.primary : tk.border}`,
                      }}
                    >
                      <p className="text-sm font-bold" style={{ color: active ? tk.primary : tk.text }}>{label}</p>
                      <p className="text-[11px] mt-0.5" style={{ color: tk.textSec }}>{desc}</p>
                    </button>
                  );
                })}
              </div>
            </Panel>
          </motion.div>
        )}

        {/* ── Slide: Details (department or class — depends on route) ── */}
        {step === 'details' && (
        <motion.div
          key="details"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22 }}
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
            {/*
              Kind is fixed by the URL you came from:
                /f/:short/new → adding a department under a faculty
                /d/:short/new → adding a class    under a department
              We show it as a read-only chip so the admin sees the rule, but
              they can't pick the wrong one (the DB trigger in mig 079 enforces
              it anyway — this just keeps the UI from offering invalid choices).
            */}
            <Field label="What is this?" required>
              <div
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold"
                style={{
                  background: `${tk.primary}18`,
                  color: tk.primary,
                  border: `1px solid ${tk.primary}40`,
                }}
              >
                {isAddingClass ? 'Class' : 'Department'}
                <span className="text-[10px]" style={{ color: tk.textTer }}>
                  · inside {faculty?.name ?? 'parent'}
                </span>
              </div>
            </Field>
          </Row>
        </Panel>

        </motion.div>
        )}

        {/* ── Slide: Your class (always shown on dept flow now that
            Office is gone — class info is required for every founder
            regardless of intent). ── */}
        {step === 'class' && !isAddingClass && form.intent !== '' && (
        <motion.div
          key="class"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22 }}
        >
        {/* Section 2 (dept flow only): the founder's own class.
            Nobody is "in" a department — students belong to a class inside one.
            This makes the dept founder also declare WHICH class they're in (the
            class is created at the same time and becomes their primary group). */}
        <Panel
          title="Your class in this department"
          subtitle="We'll create this class inside the dept and put you in it. You can change details later."
          icon={<Layers className="w-4 h-4" />}
        >
          <Row>
            <Field label="Class name" required>
              <Input
                value={form.className}
                onChange={(v) => setF('className', v)}
                placeholder="300L Civil Engineering"
                required
              />
            </Field>
            <Field label="Short name" hint="e.g. 300CVE">
              <Input
                value={form.classShortName}
                onChange={(v) => setF('classShortName', v.toUpperCase())}
                placeholder="300CVE"
              />
            </Field>
          </Row>
          <Field
            label="Class level / year"
            required
            hint="The class shares ONE level (e.g. 300L). Every member who joins this class inherits it automatically. The class rep can bump it when the year ends."
          >
            <Input
              value={form.userLevel}
              onChange={(v) => setF('userLevel', v)}
              placeholder="300L"
              required
            />
          </Field>
        </Panel>
        </motion.div>
        )}

        {/* ── Slide: Account (founder credentials) ── */}
        {step === 'account' && (
        <motion.div
          key="account"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22 }}
        >
        <Panel
          title="Your account"
          subtitle="These are the credentials you'll use to sign in. Your member ID is org-specific."
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
          {pwMismatch && (
            <p className="text-xs flex items-center gap-1.5" style={{ color: tk.danger }}>
              <AlertCircle className="w-3.5 h-3.5" />
              Passwords do not match.
            </p>
          )}
        </Panel>
        </motion.div>
        )}

        {/* ── Slide: Claim (OPT-IN role request). Skipped entirely when intent='helping'. ── */}
        {step === 'claim' && form.intent !== 'helping' && (
        <motion.div
          key="claim"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22 }}
        >
        <Panel
          title="Do you want to claim a role here?"
          subtitle="Totally optional. Skipping means you stay a regular member; the dashboard will let you opt in later. Either way, claiming a role does NOT grant instant exec power — it goes through verification (peer votes or a higher exec confirming you)."
          icon={<Sparkles className="w-4 h-4" />}
        >
          <div className="grid gap-3">
            {([
              [false, 'Skip — I just want to be a member', 'Recommended if you’re unsure. You can claim later from your dashboard.'],
              [true,  'Yes, claim a role here',           'Picks the role title, then your peers or a higher exec verify it.'],
            ] as const).map(([value, label, desc]) => {
              const active = form.wantsClaim === value;
              return (
                <button
                  key={String(value)}
                  type="button"
                  onClick={() => setF('wantsClaim', value)}
                  className="text-left rounded-2xl px-4 py-3.5 transition-all"
                  style={{
                    background: active ? `${tk.primary}14` : 'rgba(255,255,255,0.04)',
                    border: `1.5px solid ${active ? tk.primary : tk.border}`,
                  }}
                >
                  <p className="text-sm font-bold" style={{ color: active ? tk.primary : tk.text }}>{label}</p>
                  <p className="text-[11px] mt-0.5" style={{ color: tk.textSec }}>{desc}</p>
                </button>
              );
            })}
          </div>

          {form.wantsClaim && (
            <Field label="Role you're claiming" required hint="what shows on the verification request">
              <Input
                value={form.positionTitle}
                onChange={(v) => setF('positionTitle', v)}
                placeholder={isAddingClass ? 'Class Rep' : 'Departmental President'}
                required
              />
            </Field>
          )}
        </Panel>
        </motion.div>
        )}

        {/* ── Slide: Recap (the only place we actually submit) ── */}
        {step === 'recap' && (
        <motion.div
          key="recap"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22 }}
        >
        <Panel
          title="Almost done — review what we'll create"
          subtitle="Nothing is created until you tap the button below."
          icon={<Check className="w-4 h-4" />}
        >
          <div className="space-y-2.5">
            <RecapRow tk={tk} label={isAddingClass ? 'New class' : 'New department'} value={`${form.departmentName} (${form.departmentShortName || '—'})`} />
            <RecapRow tk={tk} label="Inside" value={faculty?.name ?? '—'} />
            {!isAddingClass && form.intent !== '' && (
              <RecapRow tk={tk} label={form.intent === 'student' ? 'Your class' : 'Class you\'re creating'} value={`${form.className} (${form.classShortName || form.userLevel || 'auto'})`} />
            )}
            <RecapRow tk={tk} label="Your role here" value={
              form.intent === 'student'
                ? 'Student in this class'
                : 'Just helping populate the directory'
            } />
            <RecapRow tk={tk} label="Account" value={`${form.fullName} · ${form.email}`} />
            <RecapRow tk={tk} label="Login ID" value={form.memberNumber} />
            <RecapRow tk={tk} label="Claim a role" value={
              form.wantsClaim && form.intent !== 'helping' && form.positionTitle.trim()
                ? `Yes — "${form.positionTitle.trim()}" (awaits verification)`
                : 'No — you stay a regular member'
            } highlight={form.wantsClaim && form.intent !== 'helping'} />
          </div>
        </Panel>
        </motion.div>
        )}

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

        {/* ── Wizard nav (Back · Next/Submit) ── */}
        <div className="pt-2 flex items-center justify-between gap-3">
          <motion.button
            type="button"
            onClick={goBack}
            disabled={isFirst || submitting}
            className="px-5 py-3 rounded-2xl text-sm font-semibold flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: 'rgba(255,255,255,0.05)', color: tk.textSec, border: `1px solid ${tk.border}` }}
            whileHover={!isFirst && !submitting ? { scale: 1.02 } : undefined}
            whileTap={!isFirst && !submitting ? { scale: 0.97 } : undefined}
          >
            <ArrowLeft className="w-4 h-4" /> Back
          </motion.button>

          {!isLast ? (
            <motion.button
              type="button"
              onClick={goNext}
              disabled={!canAdvance(step)}
              className="px-7 py-3.5 rounded-2xl text-white font-bold text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
                boxShadow: canAdvance(step) ? '0 8px 30px rgba(255,104,3,0.4)' : 'none',
              }}
              whileHover={canAdvance(step) ? { scale: 1.03 } : undefined}
              whileTap={canAdvance(step) ? { scale: 0.97 } : undefined}
            >
              Next <ArrowRight className="w-4 h-4" />
            </motion.button>
          ) : (
          <motion.button
            type="submit"
            disabled={!allValid || submitting}
            className="px-7 py-3.5 rounded-2xl text-white font-bold text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
              boxShadow: allValid ? '0 8px 30px rgba(255,104,3,0.4)' : 'none',
            }}
            whileHover={allValid && !submitting ? { scale: 1.03 } : undefined}
            whileTap={allValid && !submitting ? { scale: 0.97 } : undefined}
          >
            {submitting ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Creating…
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4" />
                {isAddingClass ? 'Create class' : 'Create department'}
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </motion.button>
          )}
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

function RecapRow({ tk, label, value, highlight }: { tk: { textTer: string; text: string; primary: string; border: string }; label: string; value: string; highlight?: boolean }) {
  return (
    <div
      className="flex items-start justify-between gap-3 px-3.5 py-2.5 rounded-xl"
      style={{
        background: highlight ? `${tk.primary}10` : 'rgba(255,255,255,0.03)',
        border: `1px solid ${highlight ? `${tk.primary}30` : tk.border}`,
      }}
    >
      <span className="text-[11px] uppercase tracking-wider font-semibold shrink-0" style={{ color: tk.textTer }}>
        {label}
      </span>
      <span className="text-sm text-right" style={{ color: highlight ? tk.primary : tk.text }}>
        {value}
      </span>
    </div>
  );
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
