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
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown';
import { APP_NAME, getRolesForTier, type ClaimTier } from '@/config/constants';
import { supabase } from '@/config/supabase';
import type { OrganizationGroup } from '@/types/multiTenant';

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

  // Defaults from URL + current context. The four UI tiers map onto
  // three DB scope levels:
  //   'class'   → scope_level='group' (claimant's primary class)
  //   'dept'    → scope_level='unit'  (filter targets: kind='department')
  //   'faculty' → scope_level='unit'  (filter targets: kind in faculty/college)
  //   'org'     → scope_level='org'   (no target)
  // The picker UX wants 4 buttons; the RPC wants 3 levels. We keep
  // tierChoice as the source of truth and derive claimedScope from it.
  const initialScopeRaw = (params.get('scope') as 'org' | 'unit' | 'group' | null) ?? 'group';
  const initialTier: ClaimTier =
    initialScopeRaw === 'org' ? 'org'
    : initialScopeRaw === 'group' ? 'class'
    : 'dept'; // legacy 'unit' default to dept; user can flip to faculty
  const initialGroupId = params.get('group') ?? group?.id ?? null;

  const [tierChoice, setTierChoice] = useState<ClaimTier>(initialTier);
  const claimedScope: 'org' | 'unit' | 'group' =
    tierChoice === 'org' ? 'org'
    : tierChoice === 'class' ? 'group'
    : 'unit';

  // Reset target group on tier flip so we don't carry stale ids.
  useEffect(() => {
    if (tierChoice === 'org') setClaimedGroupId(null);
    else if (tierChoice === 'class') setClaimedGroupId(initialGroupId);
    // dept/faculty: handled by the unitTargets loader below.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierChoice]);
  // Group id is mutable: claimers picking a unit-scope role (dept / faculty)
  // need to select WHICH faculty or department they're claiming for. The
  // class id from the URL/session only makes sense for group-scope ("class
  // rep of MY class") — if we kept it fixed, a faculty-treasurer claim
  // would attach to the claimant's class group_id and the resulting admin
  // row would look like a class-level admin in disguise (the BioMed 0'28
  // dashboard bug).
  const [claimedGroupId, setClaimedGroupId] = useState<string | null>(initialGroupId);

  // ── Fetch unit-tier groups once so the picker has options. We do
  //    NOT fetch on every keystroke — just on mount + when scope flips
  //    to unit so we lazy-load the dropdown's data only when needed.
  const [unitTargets, setUnitTargets] = useState<OrganizationGroup[]>([]);
  const [unitTargetsLoading, setUnitTargetsLoading] = useState(false);
  useEffect(() => {
    if ((tierChoice !== 'dept' && tierChoice !== 'faculty') || !organization?.id) return;
    let cancelled = false;
    setUnitTargetsLoading(true);
    (async () => {
      try {
        const all = await organizationService.getGroups(organization.id);
        if (cancelled) return;
        // Filter by the SPECIFIC tier the claimant picked. Previously
        // we showed faculties + depts in one mixed dropdown labelled
        // "My faculty" — confusing because a dept president picking
        // "My faculty" then had to scroll past every faculty to find
        // their dept. Splitting the picker means each dropdown shows
        // only the tier in question.
        const filtered = (all || []).filter((g) => {
          const k = (g.kind || '').toLowerCase();
          if (tierChoice === 'faculty') return k === 'faculty' || k === 'college';
          if (tierChoice === 'dept')    return k === 'department' || k === 'unit';
          return false;
        }).sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        setUnitTargets(filtered);

        // First time the user picks "unit" scope, default the target
        // to the claimant's CLOSEST ancestor in the tree (so a class
        // member submitting a dept claim defaults to their actual
        // dept, not the first dept in the alphabet). We walk up from
        // the user's primary group_id until we hit a unit-tier group.
        if (!claimedGroupId || filtered.every(g => g.id !== claimedGroupId)) {
          const targetIds = new Set(filtered.map(g => g.id));
          let cur = group?.parent_group_id ?? null;
          let safety = 10;
          while (cur && safety-- > 0) {
            if (targetIds.has(cur)) { setClaimedGroupId(cur); break; }
            const next = (all || []).find(g => g.id === cur);
            cur = next?.parent_group_id ?? null;
          }
        }
      } finally {
        if (!cancelled) setUnitTargetsLoading(false);
      }
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tierChoice, organization?.id]);

  // Tier-aware role list. Drops roles that don't fit the picked tier
  // (e.g. "Class Rep" disappears on dept/faculty/org; "HOD" only
  // shows on dept). For non-academic orgs the per-type list already
  // excludes academic roles outright.
  const ROLE_OPTIONS = useMemo(
    () => getRolesForTier(organization?.organization_type, tierChoice),
    [tierChoice, organization?.organization_type]
  );

  // Org-type-aware UI bits for the picker. The button labels track
  // the org's group_label setting where useful (e.g. a church might
  // have "Ministry" as its dept label).
  const tierButtons = useMemo<{ value: ClaimTier; label: string }[]>(() => {
    const isAcademic = (organization?.organization_type === 'university' ||
                        organization?.organization_type === 'school');
    const classLabel = isAcademic ? 'My class' : (organization?.group_label || 'My group');
    const deptLabel  = isAcademic ? 'Department' : 'Sub-unit';
    const facultyLabel = isAcademic ? 'Faculty' : 'Branch';
    return [
      { value: 'class',   label: classLabel },
      { value: 'dept',    label: deptLabel },
      { value: 'faculty', label: facultyLabel },
      { value: 'org',     label: 'Whole org' },
    ];
  }, [organization?.organization_type, organization?.group_label]);

  const tierHint = useMemo(() => {
    switch (tierChoice) {
      case 'class':   return `Class-tier roles. Members of your ${(organization?.group_label || 'group').toLowerCase()} vote.`;
      case 'dept':    return 'Department-tier roles. Members of the department vote.';
      case 'faculty': return 'Faculty-tier roles. Members of the faculty vote.';
      case 'org':     return `Org-wide roles. Whole ${organization?.name || 'org'} votes — top exec only.`;
    }
  }, [tierChoice, organization?.group_label, organization?.name]);

  const positionPlaceholder = useMemo(() => {
    if (tierChoice === 'class') return 'e.g. Class Rep, Treasurer';
    if (tierChoice === 'dept')  return 'e.g. Department President, HOD';
    if (tierChoice === 'faculty') return 'e.g. Dean, Faculty Treasurer';
    return 'e.g. SUG President';
  }, [tierChoice]);
  // Default role is the first option for this org type (so churches don't
  // default to "class_rep" before the user has even picked one).
  const [role, setRole] = useState<string>(() => ROLE_OPTIONS[0]?.value ?? 'custom');

  // Contested-role detection. Queries pending claims for the same
  // group + role. If another claimant is already in the queue, we
  // surface a banner before submit so the claimant knows they're
  // walking into a vote war. The user (UNN founder) flagged this:
  // the dispute existed silently — both sides voted blind.
  const [contestedCount, setContestedCount] = useState(0);
  const contested = contestedCount > 0;
  useEffect(() => {
    if (!organization?.id) { setContestedCount(0); return; }
    // Org-scope contests check organization_id alone (no group).
    // Group/unit scope checks the specific group + role.
    let cancelled = false;
    (async () => {
      let query = supabase
        .from('claim_requests')
        .select('id, claimant_user_id', { count: 'exact', head: false })
        .eq('organization_id', organization.id)
        .in('status', ['submitted', 'awaiting_votes', 'email_sent', 'under_review'])
        .eq('claimed_role', role)
        .neq('claimant_user_id', user?.id || '');
      if (tierChoice === 'org') {
        query = query.eq('claimed_scope', 'org');
      } else if (claimedGroupId) {
        query = query.eq('claimed_group_id', claimedGroupId);
      } else {
        setContestedCount(0);
        return;
      }
      const { data, error } = await query;
      if (cancelled) return;
      if (error) { setContestedCount(0); return; }
      setContestedCount((data || []).length);
    })();
    return () => { cancelled = true; };
  }, [organization?.id, role, tierChoice, claimedGroupId, user?.id]);
  const [positionTitle, setPositionTitle] = useState('');
  const [phone, setPhone] = useState(user?.phone ?? '');
  const [personalEmail, setPersonalEmail] = useState(user?.email ?? '');
  // Default the institutional/affiliation email to the member's
  // account email so a verified founder doesn't have to retype their
  // school email on every claim. The bootstrap path (mig 042) still
  // gates: if a parent exec already exists, the backend treats this
  // as optional. If they DO need a different email, they can clear
  // the field. Late-init via effect so it picks up user.email when
  // the session loads after this component mounts.
  const [institutionalEmail, setInstitutionalEmail] = useState(user?.email ?? '');
  useEffect(() => {
    if (!institutionalEmail && user?.email) {
      setInstitutionalEmail(user.email);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.email]);

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
            <ProfessionalDropdown
              value={role}
              onChange={(v) => {
                setRole(Array.isArray(v) ? v[0] : v);
                setPositionTitle('');
              }}
              placeholder="Pick a role"
              options={ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.label }))}
            />
          </Field>
          <Field label="Position title (what members will see)" required tk={tk}>
            <Input value={positionTitle} onChange={setPositionTitle} placeholder={positionPlaceholder} required tk={tk} />
          </Field>

          {/* Four-tier picker. Splits the legacy "Unit" button into
              Department + Faculty so the claimant can't accidentally
              file a faculty-tier claim under their dept (or vice
              versa). Each tier maps onto a DB scope_level under the
              hood (see claimedScope derivation above). The non-
              academic orgs still see all four — a church's "class"
              is its cell/small group, "department" is the ministry,
              "faculty" is the district, "org" is the church-wide
              top exec. */}
          <Field label="Scope" required tk={tk}>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              {tierButtons.map(({ value, label }) => {
                const active = tierChoice === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setTierChoice(value)}
                    className="rounded-xl px-3 py-2 text-xs font-semibold transition-all"
                    style={{
                      background: active ? `${tk.primary}18` : 'rgba(255,255,255,0.04)',
                      color: active ? tk.primary : tk.textSec,
                      border: `1px solid ${active ? `${tk.primary}40` : tk.border}`,
                    }}
                  >
                    {label}
                  </button>
                );
              })}
            </div>
            <p className="text-[10px] mt-2" style={{ color: tk.textTer }}>
              {tierHint}
            </p>
          </Field>

          {/* Tier-specific target picker — only when scope=dept or faculty. */}
          {(tierChoice === 'dept' || tierChoice === 'faculty') && (
            <Field
              label={tierChoice === 'dept' ? 'Which department?' : 'Which faculty?'}
              required
              tk={tk}
              hint={
                unitTargetsLoading
                  ? 'Loading…'
                  : tierChoice === 'dept'
                    ? 'Pick the department you\'re claiming for. Members of that department vote.'
                    : 'Pick the faculty you\'re claiming for. Members of that faculty vote.'
              }
            >
              <ProfessionalDropdown
                value={claimedGroupId ?? ''}
                onChange={(v) => setClaimedGroupId((Array.isArray(v) ? v[0] : v) || null)}
                placeholder={unitTargetsLoading
                  ? `Loading ${tierChoice === 'dept' ? 'departments' : 'faculties'}…`
                  : `Select a ${tierChoice === 'dept' ? 'department' : 'faculty'}`}
                searchable
                disabled={unitTargetsLoading || unitTargets.length === 0}
                options={unitTargets.map((g) => ({
                  value: g.id,
                  label: g.name,
                  description: g.short_name || '',
                }))}
              />
              {unitTargets.length === 0 && !unitTargetsLoading && (
                <p className="text-[11px] mt-2" style={{ color: tk.danger }}>
                  No {tierChoice === 'dept' ? 'departments' : 'faculties'} exist in this organization yet.
                </p>
              )}
            </Field>
          )}

          {/* Contested-role banner. Surfaces ONLY when there's already
              a pending claim for this exact group+role from another
              claimant. Mig 042's anti-double-submit blocks the SAME
              person from re-claiming; it doesn't block a SECOND
              person from contesting. The banner gives the claimant a
              heads-up before they file an unwinnable peer-vote war. */}
          {contested && (
            <div
              className="rounded-xl px-3 py-2.5 flex items-start gap-2"
              style={{ background: `${tk.danger}10`, border: `1px solid ${tk.danger}30` }}
            >
              <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" style={{ color: tk.danger }} />
              <div>
                <p className="text-[12px] font-semibold" style={{ color: tk.text }}>
                  Someone else already claimed this role
                </p>
                <p className="text-[11px] mt-0.5" style={{ color: tk.textSec }}>
                  {contestedCount} pending claim{contestedCount === 1 ? '' : 's'} for the same position. Both go to peer vote — submit yours if you're the real holder; the side with more confirmations wins.
                </p>
              </div>
            </div>
          )}
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

              const isAutofilled = Boolean(
                user?.email && institutionalEmail.toLowerCase() === user.email.toLowerCase()
              );
              const hint = isAcademic
                ? isAutofilled
                  ? 'using your account email — change if you have a different school email'
                  : 'required for first claim (bootstrap); optional otherwise'
                : isAutofilled
                  ? 'using your account email — change if you prefer'
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
