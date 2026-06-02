/**
 * ClaimSubmitPage — submit a claim to become an exec.
 *
 * Route: /:orgSlug/claim
 *        ?scope=org|unit|group    (defaults to caller's current group)
 *        ?group=<uuid>            (faculty id when scope=unit; class id when scope=group)
 *
 * The caller picks a position title + role + verification method and
 * submits. Members of the target scope receive a vote-request
 * notification. Peer votes strengthen the claim, and a verified
 * parent exec confirms to unlock money (bootstrap claims auto-unlock
 * at the peer-vote threshold per Blueprint 13).
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  AlertCircle, ArrowLeft, ArrowRight,
  CheckCircle2, Loader2, Mail, Phone, ShieldCheck, Vote,
} from 'lucide-react';
import { organizationService } from '@/services/organizationService';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useTheme, getDashboardTokens } from '@/hooks/useTheme';
import PayvexoBackground from '@/components/student/dashboard/PayvexoBackground';
import { APP_NAME, getClaimRoleOptions, getOrgScopeRoleOptions } from '@/config/constants';

type ClaimTheme = {
  bg: string;
  panel: string;
  border: string;
  borderHov: string;
  text: string;
  textSec: string;
  textTer: string;
  primary: string;
  mint: string;
  danger: string;
  gradOrange: string;
  primarySoft: string;
  inputBg: string;
  inputBorder: string;
  inputBorderHov: string;
};

export default function ClaimSubmitPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, organization, group } = useMultiTenantAuth();
  const { theme } = useTheme();
  const t = getDashboardTokens(theme);
  const isLight = theme === 'light';
  const tk: ClaimTheme = {
    bg: t.bg,
    panel: t.card,
    border: t.cardBorder,
    borderHov: t.primaryRing,
    text: t.text,
    textSec: t.textSec,
    textTer: t.textTer,
    primary: t.primary,
    mint: t.mint,
    danger: t.danger,
    gradOrange: t.gradOrange,
    primarySoft: t.primarySoft,
    inputBg: isLight ? '#FFFFFF' : 'rgba(26,14,9,0.85)',
    inputBorder: isLight ? 'rgba(15, 7, 3, 0.12)' : t.cardBorder,
    inputBorderHov: t.primaryRing,
  };

  // Defaults from URL + current context
  const initialScope = (params.get('scope') as 'org' | 'unit' | 'group' | null) ?? 'group';
  const initialGroupId = params.get('group') ?? group?.id ?? null;

  const [claimedScope, setClaimedScope] = useState<'org' | 'unit' | 'group'>(initialScope);
  // Group id is fixed for now (defaults to caller's own group from session/URL).
  // A future enhancement: let unit/org-scope claimers pick a different target.
  const [claimedGroupId] = useState<string | null>(initialGroupId);

  // Org-type-aware list of exec roles (academic vs church vs club vs ...)
  const ROLE_OPTIONS = useMemo(
    () => (claimedScope === 'org'
      ? getOrgScopeRoleOptions(organization?.organization_type)
      : getClaimRoleOptions(organization?.organization_type)),
    [claimedScope, organization?.organization_type]
  );
  // Default role is the first option for this org type (so churches don't
  // default to "class_rep" before the user has even picked one).
  const [role, setRole] = useState<string>(() => ROLE_OPTIONS[0]?.value ?? 'custom');
  const [positionTitle, setPositionTitle] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [personalEmail, setPersonalEmail] = useState(user?.email ?? '');
  const [institutionalEmail, setInstitutionalEmail] = useState('');

  useEffect(() => {
    if (!ROLE_OPTIONS.find((r) => r.value === role)) {
      setRole(ROLE_OPTIONS[0]?.value ?? 'custom');
      setPositionTitle('');
    }
  }, [ROLE_OPTIONS, role]);

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    claim_id: string;
    votes_required: number;
    vote_deadline: string;
    bootstrap_path: boolean;
    required_layer?: number;
  } | null>(null);

  // Auto-fill the title when role changes (admin can still edit)
  useEffect(() => {
    if (!positionTitle.trim()) {
      const meta = ROLE_OPTIONS.find((r) => r.value === role);
      if (meta && role !== 'custom') setPositionTitle(meta.label);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [role]);

  const canSubmit = useMemo(() => {
    return (
      Boolean(user?.id) &&
      positionTitle.trim().length > 1 &&
      (claimedScope === 'org' || Boolean(claimedGroupId))
    );
  }, [user?.id, positionTitle, claimedScope, claimedGroupId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting || !user?.id) return;
    setSubmitting(true);
    setError(null);

    const res = await organizationService.submitClaimV2({
      callerMemberId:     user.id,
      claimedRole:        role === 'custom' ? 'custom' : role,
      claimedScope,
      claimedGroupId:     claimedScope === 'org' ? null : claimedGroupId,
      positionTitle:      positionTitle.trim(),
      phone:              phone || undefined,
      personalEmail:      personalEmail || undefined,
      institutionalEmail: institutionalEmail || undefined,
      method:             'member_vote',
    });

    if (!res.ok || !res.claim_id) {
      setError(res.error || 'Could not submit your claim. Please try again.');
      setSubmitting(false);
      return;
    }

    setSubmitted({
      claim_id: res.claim_id,
      votes_required: res.votes_required ?? 0,
      vote_deadline: res.vote_deadline ?? '',
      bootstrap_path: Boolean(res.bootstrap_path),
      required_layer: res.required_layer,
    });
    setSubmitting(false);
  };

  if (!user || !organization) {
    return (
      <Centered theme={theme}>
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: tk.text }}>Sign in first</h1>
          <p className="text-sm leading-6 mb-6" style={{ color: tk.textSec }}>
            You must be a member of the organization to claim an exec role.
          </p>
          <motion.button
            onClick={() => navigate(orgSlug ? `/${orgSlug}/login` : '/')}
            className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: tk.gradOrange }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Sign in
          </motion.button>
        </div>
      </Centered>
    );
  }

  // Success state
  if (submitted) {
    return (
      <Centered theme={theme}>
        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-md w-full rounded-3xl p-7"
          style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
        >
          <motion.div
            initial={{ scale: 0, rotate: -180 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ type: 'spring', stiffness: 250, damping: 18, delay: 0.1 }}
            className="w-16 h-16 mx-auto mb-5 rounded-2xl flex items-center justify-center"
            style={{ background: `${tk.mint}10`, border: `1px solid ${tk.mint}30` }}
          >
            <CheckCircle2 className="w-8 h-8" style={{ color: tk.mint }} strokeWidth={2.4} />
          </motion.div>

          <h1 className="text-2xl font-extrabold text-center mb-2 tracking-tight" style={{ color: tk.text }}>
            Claim submitted
          </h1>
          <p className="text-sm leading-6 text-center" style={{ color: tk.textSec }}>
            Your claim is now visible to members of {organization.name}.{' '}
            {submitted.bootstrap_path ? (
              <>You need <span className="font-bold" style={{ color: tk.text }}>{submitted.votes_required} confirmations</span> to unlock admin access.</>
            ) : (
              <>Peer votes strengthen your claim. You need <span className="font-bold" style={{ color: tk.text }}>{submitted.votes_required} confirmations</span>, then a verified parent exec confirms to unlock money.</>
            )}
          </p>

          <div className="mt-5 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${tk.border}` }}>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: tk.textTer }}>What now?</p>
            <p className="text-xs leading-5" style={{ color: tk.textSec }}>
              You'll get a notification as your claim progresses. Until verification is complete,
              you can still browse your dashboard and view records — but you can't publish dues yet.
            </p>
          </div>

          <motion.button
            onClick={() => navigate(`/${orgSlug}/dashboard`)}
            className="w-full mt-5 px-6 py-3 rounded-xl text-white font-semibold text-sm inline-flex items-center justify-center gap-2"
            style={{ background: tk.gradOrange }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Back to dashboard
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </motion.div>
      </Centered>
    );
  }

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh' }}>
      <PayvexoBackground theme={theme} />

      <nav className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
        <button
          onClick={() => navigate(`/${orgSlug}/dashboard`)}
          className="flex items-center gap-2 text-sm font-medium" style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-base font-bold" style={{ color: tk.text }}>{APP_NAME}</span>
      </nav>

      <header className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 pt-2 pb-6">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
            style={{ background: tk.primarySoft, color: tk.primary, border: `1px solid ${tk.primary}28` }}>
          <Vote className="w-3.5 h-3.5" />
          Layered trust claim
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight" style={{ color: tk.text }}>
          Claim an exec role on {organization.name}
        </h1>
        <p className="text-sm sm:text-base mt-2 max-w-lg leading-7" style={{ color: tk.textSec }}>
          Your fellow members will vote. If a verified parent exec exists, they will confirm once
          they review. Money unlocks at Layer 4 (or Layer 3 during bootstrap).
        </p>
      </header>

      <form onSubmit={handleSubmit} className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 pb-24 space-y-5">
        <Panel title="Your role" icon={<ShieldCheck className="w-4 h-4" />} tk={tk}>
          <Field label="Role" required tk={tk}>
            <select
              value={role}
              onChange={(e) => { setRole(e.target.value); setPositionTitle(''); }}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
              style={{ background: tk.inputBg, border: `1px solid ${tk.inputBorder}`, color: tk.text }}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value} style={{ background: tk.bg, color: tk.text }}>{r.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Position title (what members will see)" required tk={tk}>
            <Input value={positionTitle} onChange={setPositionTitle} placeholder="e.g. ECE 300L Class Rep" required tk={tk} />
          </Field>
          <Field label="Scope" required tk={tk}>
            <div className="grid grid-cols-3 gap-2">
              {(['group', 'unit', 'org'] as const).map((s) => {
                const active = claimedScope === s;
                const labels = { group: 'My class', unit: 'My faculty', org: 'Whole org' };
                return (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setClaimedScope(s)}
                    className="rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                    style={{
                      background: active ? `${tk.primary}18` : 'rgba(255,255,255,0.04)',
                      color: active ? tk.primary : tk.textSec,
                      border: `1px solid ${active ? `${tk.primary}40` : tk.border}`,
                    }}
                  >
                    {labels[s]}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] mt-2" style={{ color: tk.textTer }}>
              Group scope = your class/department. Unit = your faculty. Org = the entire {organization.name} (top exec only).
            </p>
          </Field>
        </Panel>

        <Panel title="Contact (so we can reach you)" icon={<Mail className="w-4 h-4" />} tk={tk}>
          <Row>
            <Field label="Personal email" hint="optional" tk={tk}>
              <Input value={personalEmail} onChange={setPersonalEmail} placeholder="you@example.com" type="email" tk={tk} />
            </Field>
            {/* Affiliation email — label + placeholder track the org type
                so a church claimant isn't asked for a "school email." */}
            {(() => {
              const t = (organization?.organization_type || '').toLowerCase();
              const isAcademic = /\b(university|school|college|class|faculty|department|academic)\b/.test(t);
              const isChurch   = /\b(church|chapel|fellowship|ministry|parish|mosque)\b/.test(t);
              const isCorporate = /\b(company|corporate|firm|professional)\b/.test(t);

              const label = isAcademic ? 'School email'
                : isChurch ? 'Affiliation email'
                : isCorporate ? 'Work email'
                : 'Affiliation email';

              const placeholder = isAcademic ? 'you@unn.edu.ng'
                : isChurch ? 'you@your-workplace.com (optional)'
                : isCorporate ? 'you@company.com'
                : 'you@example.com';

              const hint = isAcademic
                ? 'optional — required for first claim (bootstrap)'
                : 'optional — helps us verify your role faster';

              return (
                <Field label={label} hint={hint} tk={tk}>
                  <Input
                    value={institutionalEmail}
                    onChange={setInstitutionalEmail}
                    placeholder={placeholder}
                    type="email"
                    tk={tk}
                  />
                </Field>
              );
            })()}
          </Row>
          <Field label="Phone" hint="optional" icon={<Phone className="w-3 h-3" />} tk={tk}>
            <Input value={phone} onChange={setPhone} placeholder="+234 800 000 0000" type="tel" tk={tk} />
          </Field>
        </Panel>

        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
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
            className="px-6 py-3 rounded-2xl text-white font-bold text-sm flex items-center gap-2 disabled:opacity-40"
            style={{
              background: tk.gradOrange,
              boxShadow: canSubmit ? '0 8px 28px rgba(255,104,3,0.35)' : 'none',
            }}
            whileHover={canSubmit && !submitting ? { scale: 1.03 } : undefined}
            whileTap={canSubmit && !submitting ? { scale: 0.97 } : undefined}
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Vote className="w-4 h-4" />}
            Submit my claim
            <ArrowRight className="w-4 h-4" />
          </motion.button>
        </div>
      </form>
    </div>
  );
}

function Panel({ title, icon, children, tk }: { title: string; icon?: React.ReactNode; children: React.ReactNode; tk: ClaimTheme }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl p-5 sm:p-6"
      style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
    >
      <h2 className="flex items-center gap-2 text-base font-bold mb-4" style={{ color: tk.text }}>
        {icon && (
          <span className="w-7 h-7 rounded-lg flex items-center justify-center"
            style={{ background: `${tk.primary}15`, color: tk.primary }}>{icon}</span>
        )}
        {title}
      </h2>
      <div className="space-y-4">{children}</div>
    </motion.section>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({ label, hint, required, icon, children, tk }: {
  label: string; hint?: string; required?: boolean; icon?: React.ReactNode; children: React.ReactNode; tk: ClaimTheme;
}) {
  return (
    <label className="block">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: tk.textSec }}>
          {icon}
          <span className="ml-1.5 inline-block align-middle">
            {label}{required && <span style={{ color: tk.primary }}> *</span>}
          </span>
        </span>
        {hint && <span className="text-[10px]" style={{ color: tk.textTer }}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Input({ value, onChange, placeholder, type = 'text', required, tk }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean; tk: ClaimTheme;
}) {
  return (
    <input
      type={type}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors"
      style={{ background: tk.inputBg, border: `1px solid ${tk.inputBorder}`, color: tk.text }}
      onFocus={(e) => { e.currentTarget.style.borderColor = tk.inputBorderHov; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = tk.inputBorder; }}
    />
  );
}

function Centered({ children, theme }: { children: React.ReactNode; theme: 'light' | 'dark' }) {
  return (
    <div className="min-h-screen relative flex items-center justify-center px-5" style={{ minHeight: '100dvh' }}>
      <PayvexoBackground theme={theme} />
      <div className="relative z-10 w-full max-w-md flex flex-col items-center">{children}</div>
    </div>
  );
}
