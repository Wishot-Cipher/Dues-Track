/**
 * ClaimSubmitPage — submit a claim to become an exec.
 *
 * Route: /:orgSlug/claim
 *        ?scope=org|unit|group    (defaults to caller's current group)
 *        ?group=<uuid>            (faculty id when scope=unit; class id when scope=group)
 *
 * The caller picks a position title + role + verification method and
 * submits. Members of the target scope then receive a vote-request
 * notification. When the confirmation threshold is met, the claimant
 * is auto-promoted to a verified admin (mig 039).
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
import { APP_NAME } from '@/config/constants';

const tk = {
  bg:        '#0F0703',
  panel:     'rgba(255,255,255,0.03)',
  border:    'rgba(255,255,255,0.08)',
  borderHov: 'rgba(255,104,3,0.32)',
  text:      '#FFFFFF',
  textSec:   'rgba(255,255,255,0.65)',
  textTer:   'rgba(255,255,255,0.40)',
  primary:   '#FF6803',
  mint:      '#30FFAC',
  danger:    '#ef4444',
};

const ROLE_OPTIONS = [
  { value: 'class_rep',           label: 'Class Rep' },
  { value: 'treasurer',           label: 'Treasurer' },
  { value: 'financial_secretary', label: 'Financial Secretary' },
  { value: 'secretary',           label: 'Secretary' },
  { value: 'president',           label: 'President' },
  { value: 'vice_president',      label: 'Vice President' },
  { value: 'hod',                 label: 'HOD' },
  { value: 'director',            label: 'Director' },
  { value: 'pro',                 label: 'PRO' },
  { value: 'custom',              label: 'Other / custom' },
];

export default function ClaimSubmitPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user, organization, group } = useMultiTenantAuth();

  // Defaults from URL + current context
  const initialScope = (params.get('scope') as 'org' | 'unit' | 'group' | null) ?? 'group';
  const initialGroupId = params.get('group') ?? group?.id ?? null;

  const [claimedScope, setClaimedScope] = useState<'org' | 'unit' | 'group'>(initialScope);
  // Group id is fixed for now (defaults to caller's own group from session/URL).
  // A future enhancement: let unit/org-scope claimers pick a different target.
  const [claimedGroupId] = useState<string | null>(initialGroupId);
  const [role, setRole] = useState('class_rep');
  const [positionTitle, setPositionTitle] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [personalEmail, setPersonalEmail] = useState(user?.email ?? '');
  const [institutionalEmail, setInstitutionalEmail] = useState('');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState<{
    claim_id: string;
    votes_required: number;
    vote_deadline: string;
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
    });
    setSubmitting(false);
  };

  if (!user || !organization) {
    return (
      <Centered>
        <div className="text-center max-w-md">
          <h1 className="text-2xl font-bold text-white mb-3 tracking-tight">Sign in first</h1>
          <p className="text-sm leading-6 mb-6" style={{ color: tk.textSec }}>
            You must be a member of the organization to claim an exec role.
          </p>
          <motion.button
            onClick={() => navigate(orgSlug ? `/${orgSlug}/login` : '/')}
            className="px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #FF6803, #FFAC5F)' }}
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
      <Centered>
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

          <h1 className="text-2xl font-extrabold text-white text-center mb-2 tracking-tight">
            Claim submitted
          </h1>
          <p className="text-sm leading-6 text-center" style={{ color: tk.textSec }}>
            Your claim is now visible to members of {organization.name}. They'll vote to confirm
            or reject. You need <span className="text-white font-bold">{submitted.votes_required} confirmations</span>{' '}
            to be promoted.
          </p>

          <div className="mt-5 rounded-xl px-4 py-3" style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${tk.border}` }}>
            <p className="text-[10px] uppercase tracking-widest mb-1" style={{ color: tk.textTer }}>What now?</p>
            <p className="text-xs leading-5" style={{ color: tk.textSec }}>
              You'll get a notification the moment you cross the threshold. Until then, you can
              still browse your dashboard and view records — but you can't publish dues yet.
            </p>
          </div>

          <motion.button
            onClick={() => navigate(`/${orgSlug}/dashboard`)}
            className="w-full mt-5 px-6 py-3 rounded-xl text-white font-semibold text-sm inline-flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #FF6803, #FFAC5F)' }}
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
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh', background: tk.bg }}>
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full blur-[160px]"
          style={{
            width: 560, height: 560,
            background: `radial-gradient(circle, ${tk.primary} 0%, transparent 70%)`,
            top: '-12%', right: '-10%', opacity: 0.12,
          }}
        />
      </div>

      <nav className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
        <button
          onClick={() => navigate(`/${orgSlug}/dashboard`)}
          className="flex items-center gap-2 text-sm font-medium" style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
        <span className="text-base font-bold text-white">{APP_NAME}</span>
      </nav>

      <header className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 pt-2 pb-6">
        <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-4"
          style={{ background: `${tk.primary}14`, color: tk.primary, border: `1px solid ${tk.primary}28` }}>
          <Vote className="w-3.5 h-3.5" />
          Member-verified claim
        </div>
        <h1 className="text-3xl sm:text-4xl font-extrabold text-white tracking-tight">
          Claim an exec role on {organization.name}
        </h1>
        <p className="text-sm sm:text-base mt-2 max-w-lg leading-7" style={{ color: tk.textSec }}>
          Your fellow members will vote. Once enough confirm you, you're promoted to a verified
          admin and can start publishing dues.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 pb-24 space-y-5">
        <Panel title="Your role" icon={<ShieldCheck className="w-4 h-4" />}>
          <Field label="Role" required>
            <select
              value={role}
              onChange={(e) => { setRole(e.target.value); setPositionTitle(''); }}
              className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none"
              style={{ background: 'rgba(26,14,9,0.85)', border: `1px solid ${tk.border}`, color: tk.text }}
            >
              {ROLE_OPTIONS.map((r) => (
                <option key={r.value} value={r.value} style={{ background: tk.bg, color: tk.text }}>{r.label}</option>
              ))}
            </select>
          </Field>
          <Field label="Position title (what members will see)" required>
            <Input value={positionTitle} onChange={setPositionTitle} placeholder="e.g. ECE 300L Class Rep" required />
          </Field>
          <Field label="Scope" required>
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
              Group scope = your specific class/department. Unit = whole faculty. Org = the entire {organization.name}.
            </p>
          </Field>
        </Panel>

        <Panel title="Contact (so we can reach you)" icon={<Mail className="w-4 h-4" />}>
          <Row>
            <Field label="Personal email" hint="optional">
              <Input value={personalEmail} onChange={setPersonalEmail} placeholder="you@example.com" type="email" />
            </Field>
            <Field label="School email" hint="optional — boosts trust">
              <Input value={institutionalEmail} onChange={setInstitutionalEmail} placeholder="you@unn.edu.ng" type="email" />
            </Field>
          </Row>
          <Field label="Phone" hint="optional" icon={<Phone className="w-3 h-3" />}>
            <Input value={phone} onChange={setPhone} placeholder="+234 800 000 0000" type="tel" />
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
              background: 'linear-gradient(135deg, #FF6803, #FFAC5F)',
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

function Panel({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <motion.section
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-3xl p-5 sm:p-6"
      style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
    >
      <h2 className="flex items-center gap-2 text-base font-bold text-white mb-4">
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

function Field({ label, hint, required, icon, children }: {
  label: string; hint?: string; required?: boolean; icon?: React.ReactNode; children: React.ReactNode;
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

function Input({ value, onChange, placeholder, type = 'text', required }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string; required?: boolean;
}) {
  return (
    <input
      type={type}
      value={value}
      required={required}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors"
      style={{ background: 'rgba(26,14,9,0.85)', border: `1px solid ${tk.border}`, color: tk.text }}
      onFocus={(e) => { e.currentTarget.style.borderColor = tk.borderHov; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = tk.border; }}
    />
  );
}

function Centered({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center px-5" style={{ background: tk.bg, minHeight: '100dvh' }}>
      <div className="w-full max-w-md flex flex-col items-center">{children}</div>
    </div>
  );
}
