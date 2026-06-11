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

import { createContext, useContext, useEffect, useMemo, useState } from 'react';
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
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import type {
  Organization,
  OrganizationGroup,
  TrustLevel,
} from '@/types/multiTenant';

// Theme-aware wrapper that maps the page's expected `tk` shape onto
// the platform-wide DashboardTokens. Built so the existing JSX
// (Field, Panel, RecapRow, every inline style across this 800-line
// file) doesn't have to change names — only the values flip per
// theme. The original `const tk = { ... '#FFFFFF' ... }` at module
// scope made this page dark-only regardless of theme.
type AddPageTokens = {
  primary: string; mint: string; blue: string;
  bg: string; panel: string; border: string; borderHov: string;
  text: string; textSec: string; textTer: string; danger: string;
};
function buildAddPageTokens(theme: 'light' | 'dark'): AddPageTokens {
  const dt = getDashboardTokens(theme);
  return {
    primary:   dt.primary,
    mint:      dt.mint,
    blue:      dt.blue,
    bg:        dt.bg,
    panel:     dt.card,
    border:    dt.cardBorder,
    borderHov: dt.primaryRing,
    text:      dt.text,
    textSec:   dt.textSec,
    textTer:   dt.textTer,
    danger:    dt.danger,
  };
}

// Token context — every helper component in this file pulls `tk`
// from here instead of closing over a module-level constant. The
// page wraps its return JSX in <TokensContext.Provider value={tk}>
// and the helpers read via useTokens(). This is what makes the
// whole flow theme-aware without prop-drilling tk through 38 call
// sites.
const TokensContext = createContext<AddPageTokens | null>(null);
function useTokens(): AddPageTokens {
  const tk = useContext(TokensContext);
  if (!tk) throw new Error('useTokens called outside TokensContext.Provider');
  return tk;
}

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
  // Every founder on this form is a real student/member of a real
  // class. The legacy "intent" picker (student vs helping vs staff)
  // was retired in Chunk G5c — the form now follows a single
  // structure-then-class shape:
  //   1. Department info       (structural — no personal details)
  //   2. YOUR class            (where you actually live)
  //   3. YOUR account          (personal details)
  //   4. Claim a role          (opt-in via wantsClaim)
  //   5. Review
  // Founders who only want to populate the directory simply toggle
  // wantsClaim off — they end up as a regular class member.

  // Department / class being created (semantic depends on the route)
  departmentName: string;
  departmentShortName: string;

  // Founder's own class — always required when adding a dept under
  // a faculty. Every founder lives in their class; the department is
  // structural only (mig 100).
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
  // Model-B "set" identity (used when adding a class) — captured at
  // creation so the level-timeline works from day one.
  entryYear: string;
  courseDuration: string;
}

const EMPTY: Form = {
  departmentName: '',
  departmentShortName: '',
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
  entryYear: String(new Date().getFullYear()),
  courseDuration: '4',
};

type WizardStep = 'details' | 'class' | 'account' | 'claim' | 'recap';

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
  const [step, setStep] = useState<WizardStep>('details');

  // Theme-aware tokens. Build once per render from the resolved
  // theme so the page paints correctly in both light + dark mode
  // (this used to be a module-level dark-only constant).
  const { theme } = useTheme();
  const tk = useMemo(() => buildAddPageTokens(theme), [theme]);

  const isAddingClass = Boolean(departmentShort);

  // Wizard path. The intent picker that used to lead this form was
  // dropped in Chunk G5c — every founder on the dept-flow goes
  // through the same structure-then-class shape so there's no
  // confusion about "am I creating a dept or a class for me?".
  //   • dept flow (/f/<fac>/new):   details · class · account · claim · recap
  //   • class flow (/d/<dept>/new): details · account · claim · recap
  // Founders who only want to populate the directory simply toggle
  // wantsClaim off on the claim step.
  const steps: WizardStep[] = useMemo(() => {
    const out: WizardStep[] = ['details'];
    if (!isAddingClass) out.push('class');
    out.push('account', 'claim', 'recap');
    return out;
  }, [isAddingClass]);
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

      // Seed a sensible default position title so the founder isn't
      // staring at an empty claim field if they decide to claim a role.
      setForm((f) => ({
        ...f,
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
      case 'details':
        // Adding a class also captures the current level on this step.
        return form.departmentName.trim().length > 1
          && form.departmentShortName.trim().length >= 2
          && (!isAddingClass || form.userLevel.trim().length > 0);
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
  const allValid = canAdvance('details') &&
    (!steps.includes('class') || canAdvance('class')) &&
    canAdvance('account') && canAdvance('claim');

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

    // wantsClaim is the only switch now — there's no more 'helping'
    // intent. If the founder doesn't tick the claim toggle, the
    // backend gets a null position title and no claim is filed.
    const positionToSend =
      form.wantsClaim && form.positionTitle.trim().length > 1
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

    // Persist the class's set identity (entry year + course length) via
    // the SECURITY DEFINER RPC — the level already went in through the
    // bootstrap. Best-effort: a hiccup here must not block the signup.
    if (isAddingClass && res.class_id) {
      const ey = parseInt(form.entryYear, 10);
      const cd = parseInt(form.courseDuration, 10);
      try {
        await supabase.rpc('set_group_set_fields', {
          p_group_id: res.class_id,
          p_caller_member_id: res.member_id,
          p_entry_year: Number.isFinite(ey) ? ey : null,
          p_current_level: form.userLevel || null,
          p_course_duration: Number.isFinite(cd) ? cd : null,
        });
      } catch { /* best-effort */ }
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
      <TokensContext.Provider value={tk}>
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
      </TokensContext.Provider>
    );
  }

  if (!org || !faculty) {
    return (
      <TokensContext.Provider value={tk}>
        <Centered>
          <div className="text-center max-w-md">
            <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center"
              style={{ background: `${tk.primary}15` }}>
              <Layers className="w-7 h-7" style={{ color: tk.primary }} />
            </div>
            <h1 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: tk.text }}>Faculty not found</h1>
            <p className="text-sm leading-6" style={{ color: tk.textSec }}>
              We couldn't find <span className="font-semibold" style={{ color: tk.text }}>/{orgSlug}/f/{facultyShortName}</span>.
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
      </TokensContext.Provider>
    );
  }

  return (
    <TokensContext.Provider value={tk}>
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
            Step {stepIdx + 1} of {steps.length} · {
              step === 'details' ? (isAddingClass ? 'The class' : 'The department (structure)')
              : step === 'class'   ? 'YOUR class'
              : step === 'account' ? 'YOUR account'
              : step === 'claim'   ? 'Claim a role'
              : 'Review'
            }
          </p>
        </div>

        {/* ── Slide: Details (department or class — depends on route) ── */}
        {step === 'details' && (
        <motion.div
          key="details"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22 }}
        >
        {/* Section 1 — STRUCTURE only.
            The department is a container, not a roster. Founders type
            its name + short code here; no personal details go on this
            step. That arrives later, in "YOUR class" and "YOUR account". */}
        <Panel
          title={isAddingClass ? 'The class — structure only' : 'The department — structure only'}
          subtitle={isAddingClass
            ? 'Just the name and short code. You\'ll add yourself + your role in the next steps.'
            : 'Just the name and short code. The department is a container — your personal details go on the next two steps (your class, then your account).'}
          icon={<BookOpen className="w-4 h-4" />}
        >
          <Field label={isAddingClass ? 'Class name' : 'Department name'} required>
            <Input
              value={form.departmentName}
              onChange={(v) => setF('departmentName', v)}
              placeholder={isAddingClass ? 'e.g. Computer Science (2023 set)' : 'e.g. Electrical & Computer Engineering'}
              required
            />
          </Field>
          <Row>
            <Field label="Short code" hint={isAddingClass ? 'e.g. CSC23' : 'e.g. ECE'}>
              <Input value={form.departmentShortName} onChange={(v) => setF('departmentShortName', v.toUpperCase())} placeholder={isAddingClass ? 'CSC23' : 'ECE'} />
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

          {/* Set identity — only when adding a class. Captures the level
              + year-group so the level-timeline works from day one. */}
          {isAddingClass && (
            <>
              <Field
                label="Current level"
                required
                hint="The level this set is at NOW (e.g. 200L). It advances later from the class dashboard — never automatically."
              >
                <Input value={form.userLevel} onChange={(v) => setF('userLevel', v)} placeholder="e.g. 200L" required />
              </Field>
              <Row>
                <Field label="Year of entry" hint="The set's identity, e.g. 2023">
                  <Input value={form.entryYear} onChange={(v) => setF('entryYear', v.replace(/\D/g, '').slice(0, 4))} placeholder="2023" />
                </Field>
                <Field label="Course length (years)" hint="Estimates graduation">
                  <Input value={form.courseDuration} onChange={(v) => setF('courseDuration', v.replace(/\D/g, '').slice(0, 1))} placeholder="4" />
                </Field>
              </Row>
            </>
          )}
        </Panel>

        </motion.div>
        )}

        {/* ── Slide: Your class (always shown on dept flow). Intent
            picker is gone — every founder is a real student in
            their class. ── */}
        {step === 'class' && !isAddingClass && (
        <motion.div
          key="class"
          initial={{ opacity: 0, x: 20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.22 }}
        >
        {/* Section 2 — YOUR CLASS. This is where the founder
            actually lives. Department is a structural container with
            no member rows. Class is the roster. The founder's account
            (next step) gets attached to THIS class, not to the dept. */}
        <Panel
          title="YOUR class — where you actually live"
          subtitle="The department is just a container. THIS class is your roster: members will join here, and YOU are the first one. You can rename it later from the class admin page."
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

        {/* ── Slide: Claim (OPT-IN role request).
            The legacy 'helping' intent was retired in Chunk G5c — the
            wantsClaim toggle below replaces it: skip means stay a
            regular member; opt in means file a claim that goes
            through verification. ── */}
        {step === 'claim' && (
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
            <RecapRow
              label={isAddingClass ? 'New class' : 'New department (structure only)'}
              value={`${form.departmentName} (${form.departmentShortName || '—'})`}
            />
            <RecapRow label="Inside" value={faculty?.name ?? '—'} />
            {!isAddingClass && (
              <RecapRow
                label="YOUR class (where you live)"
                value={`${form.className} (${form.classShortName || form.userLevel || 'auto'})`}
              />
            )}
            <RecapRow label="Account" value={`${form.fullName} · ${form.email}`} />
            <RecapRow label="Login ID" value={form.memberNumber} />
            <RecapRow
              label="Claim a role"
              value={form.wantsClaim && form.positionTitle.trim()
                ? `Yes — "${form.positionTitle.trim()}" (awaits verification)`
                : 'No — you stay a regular member'}
              highlight={form.wantsClaim}
            />
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
    </TokensContext.Provider>
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
  const tk = useTokens();
  return (
    <motion.section
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32 }}
      className="rounded-3xl p-5 sm:p-6"
      style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
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

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function RecapRow({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  // Stacked layout — label on top (small uppercase), value below
  // (full-width, breakable). The previous flex-row layout squashed
  // long values like "ECE 300L (300CVE - 300L)" or
  // "John Doe · john@example.com" against the label and pushed
  // text-right against text-left in a small modal width. Vertical
  // stack reads like a fintech receipt and never clips.
  const tk = useTokens();
  return (
    <div
      className="rounded-xl px-3.5 py-3"
      style={{
        background: highlight ? `${tk.primary}10` : tk.panel,
        border: `1px solid ${highlight ? `${tk.primary}30` : tk.border}`,
      }}
    >
      <p
        className="text-[10px] uppercase tracking-[0.15em] font-semibold mb-1"
        style={{ color: tk.textTer }}
      >
        {label}
      </p>
      <p
        className="text-sm font-medium break-words leading-snug"
        style={{ color: highlight ? tk.primary : tk.text }}
      >
        {value}
      </p>
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
  const tk = useTokens();
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
  const tk = useTokens();
  // Input background derives from the page's panel token so the
  // field sits cleanly on top of the Panel in both themes. The
  // previous hardcoded ember rgba was dark-only.
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
        background: tk.panel,
        border: `1px solid ${tk.border}`,
        color: tk.text,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = tk.borderHov; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = tk.border; }}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  const tk = useTokens();
  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: tk.bg, minHeight: '100dvh' }}
    >
      <div className="w-full max-w-md flex flex-col items-center">{children}</div>
    </div>
  );
}
