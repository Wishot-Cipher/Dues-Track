/**
 * GroupWelcomePage — smart choice screen when a non-authenticated visitor
 * clicks a class/department/group on the org overview.
 *
 * Route: /:orgSlug/g/:groupShortName
 *
 * Shows the group's directory info (name, kind, member count, trust badge
 * inherited from the org) and presents THREE paths:
 *
 *   1. "I'm new — join this class"   → inline signup form (uses
 *                                      organizationService.signupMemberForGroup)
 *   2. "I have an account"           → /:slug/login?group=<id>
 *   3. "I have an invite code"       → /:slug/join (with group context)
 *
 * Respects org settings: if allow_self_registration is FALSE, the
 * signup CTA is hidden and a banner asks the user for an invite code.
 *
 * After successful signup the founder session is saved (matching the
 * pvx_* localStorage pattern) and the user lands on /:slug/dashboard.
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
  LogIn,
  Mail,
  Phone,
  ShieldCheck,
  Sparkles,
  Ticket,
  UserPlus,
  Users,
} from 'lucide-react';
import { organizationService } from '@/services/organizationService';
import TrustBadge from '@/components/trust/TrustBadge';
import { APP_NAME, levelFieldLabel } from '@/config/constants';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import type {
  Organization,
  OrganizationGroup,
  TrustLevel,
} from '@/types/multiTenant';
import { supabase } from '@/config/supabase';

type GroupWelcomeTokens = {
  bg: string;
  panel: string;
  panelHov: string;
  border: string;
  borderHov: string;
  text: string;
  textSec: string;
  textTer: string;
  primary: string;
  mint: string;
  blue: string;
  purple: string;
  danger: string;
  gradPrimary: string;
};

function buildGroupWelcomeTokens(theme: 'light' | 'dark'): GroupWelcomeTokens {
  const dtk = getDashboardTokens(theme);
  return {
    bg: dtk.bg,
    panel: dtk.card,
    panelHov: dtk.cardHover,
    border: dtk.cardBorder,
    borderHov: dtk.primaryRing,
    text: dtk.text,
    textSec: dtk.textSec,
    textTer: dtk.textTer,
    primary: dtk.primary,
    mint: dtk.mint,
    blue: dtk.blue,
    purple: dtk.purple,
    danger: dtk.danger,
    gradPrimary: dtk.gradOrange,
  };
}

const SESSION_KEYS = {
  AUTH:      'pvx_auth',
  ORG_ID:    'pvx_org_id',
  ORG_SLUG:  'pvx_org_slug',
  MEMBER_ID: 'pvx_member_id',
  GROUP_ID:  'pvx_group_id',
} as const;

function kindMeta(kind: string | undefined, tk: GroupWelcomeTokens) {
  const map: Record<string, { color: string; icon: React.ElementType; label: string }> = {
    faculty:    { color: tk.blue,    icon: GraduationCap, label: 'Faculty' },
    class:      { color: tk.purple,  icon: Layers,        label: 'Class' },
    department: { color: tk.primary, icon: BookOpen,      label: 'Department' },
    level:      { color: '#ec4899',  icon: Layers,        label: 'Level' },
    general:    { color: tk.mint,    icon: Users,         label: 'Group' },
    fellowship: { color: tk.blue,    icon: Users,         label: 'Fellowship' },
  };
  return map[kind?.toLowerCase() || ''] ?? map.general;
}

type Mode = 'choose' | 'signup';

export default function GroupWelcomePage() {
  const { orgSlug, groupShortName } = useParams<{ orgSlug: string; groupShortName: string }>();
  const navigate = useNavigate();
  const { theme } = useTheme();
  const tk = buildGroupWelcomeTokens(theme);

  // Explicit state machine — same pattern as FacultyDetailPage. The bug
  // before: setLoading(false) ran between the org-load and group-load awaits,
  // so for a frame the render saw loading=false + group=null and flashed
  // "Class not found" before the data arrived.
  type LoadState = 'loading' | 'ok' | 'org_not_found' | 'group_not_found';
  const [loadState, setLoadState] = useState<LoadState>('loading');
  const [org, setOrg] = useState<Organization | null>(null);
  const [group, setGroup] = useState<OrganizationGroup | null>(null);
  const [parentGroup, setParentGroup] = useState<OrganizationGroup | null>(null);
  const [allowSignup, setAllowSignup] = useState(true);

  const [mode, setMode] = useState<Mode>('choose');

  // Signup form
  const [form, setForm] = useState({
    fullName: '',
    email: '',
    phone: '',
    memberNumber: '',
    password: '',
    passwordConfirm: '',
    level: '',
  });
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{
    member_login_id: string;
    requires_approval: boolean;
  } | null>(null);

  // ── Load org + group + settings ──
  useEffect(() => {
    let cancelled = false;
    if (!orgSlug || !groupShortName) return;

    setLoadState('loading');
    setOrg(null);
    setGroup(null);
    setParentGroup(null);

    (async () => {
      const orgData = await organizationService.getBySlug(orgSlug);
      if (cancelled) return;
      if (!orgData) {
        setLoadState('org_not_found');
        return;
      }
      setOrg(orgData);

      const groups = await organizationService.getGroups(orgData.id);
      if (cancelled) return;
      const g = groups.find(
        (gr) => gr.short_name?.toLowerCase() === decodeURIComponent(groupShortName).toLowerCase()
      ) ?? null;

      if (!g) {
        setLoadState('group_not_found');
        return;
      }
      setGroup(g);

      if (g.parent_group_id) {
        setParentGroup(groups.find((gr) => gr.id === g.parent_group_id) ?? null);
      }

      // Org settings: is self-registration allowed?
      const { data: settings } = await supabase
        .from('organization_settings')
        .select('allow_self_registration, require_admin_approval')
        .eq('organization_id', orgData.id)
        .maybeSingle();
      if (cancelled) return;
      setAllowSignup(settings?.allow_self_registration ?? true);

      setLoadState('ok');
    })();
    return () => { cancelled = true; };
  }, [orgSlug, groupShortName]);

  const canSubmit = useMemo(() => {
    return (
      form.fullName.trim().length > 1 &&
      form.email.includes('@') &&
      form.memberNumber.trim().length > 1 &&
      form.password.length >= 6 &&
      form.password === form.passwordConfirm
    );
  }, [form]);

  const pwMismatch =
    form.password.length >= 6 &&
    form.passwordConfirm.length >= 6 &&
    form.password !== form.passwordConfirm;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit || submitting || !org || !group) return;
    setSubmitting(true);
    setError(null);

    const res = await organizationService.signupMemberForGroup({
      orgSlug:        org.slug,
      groupShortName: group.short_name,
      fullName:       form.fullName,
      email:          form.email,
      phone:          form.phone || undefined,
      memberNumber:   form.memberNumber,
      password:       form.password,
      level:          form.level || undefined,
    });

    if (!res.ok || !res.slug || !res.member_id || !res.group_id || !res.org_id) {
      setError(res.error || 'Could not complete signup. Please try again.');
      setSubmitting(false);
      return;
    }

    if (res.requires_approval) {
      // Don't store a session — they need to wait for admin approval.
      setSuccess({
        member_login_id: res.member_login_id || form.memberNumber.toLowerCase(),
        requires_approval: true,
      });
      setSubmitting(false);
      return;
    }

    // Auto-sign in: persist session, land on dashboard.
    try {
      localStorage.setItem(SESSION_KEYS.AUTH,      'active');
      localStorage.setItem(SESSION_KEYS.ORG_ID,    res.org_id);
      localStorage.setItem(SESSION_KEYS.ORG_SLUG,  res.slug);
      localStorage.setItem(SESSION_KEYS.MEMBER_ID, res.member_id);
      localStorage.setItem(SESSION_KEYS.GROUP_ID,  res.group_id);
    } catch {
      // best-effort; user can log in manually if storage fails
    }
    navigate(`/${res.slug}/dashboard`);
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Loading / not found
  // ─────────────────────────────────────────────────────────────────────────
  if (loadState === 'loading') {
    return <Loader tk={tk} />;
  }

  if (loadState === 'org_not_found' || loadState === 'group_not_found' || !org || !group) {
    return (
      <FullCenter tk={tk}>
        <div className="text-center max-w-md">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center"
            style={{ background: `${tk.primary}15` }}>
            <Layers className="w-7 h-7" style={{ color: tk.primary }} />
          </div>
          <h1 className="text-2xl font-bold mb-3 tracking-tight" style={{ color: tk.text }}>Class not found</h1>
          <p className="text-sm leading-6" style={{ color: tk.textSec }}>
            We couldn't find a class at <span className="font-semibold" style={{ color: tk.text }}>/{orgSlug}/g/{groupShortName}</span>.
          </p>
          <motion.button
            onClick={() => navigate(orgSlug ? `/${orgSlug}/overview` : '/')}
            className="mt-6 px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: tk.gradPrimary }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            {orgSlug ? `Back to ${org?.short_name ?? 'organization'}` : 'Back to search'}
          </motion.button>
        </div>
      </FullCenter>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Success state (admin-approval flow)
  // ─────────────────────────────────────────────────────────────────────────
  if (success) {
    return (
      <FullCenter tk={tk}>
        <motion.div
          initial={{ opacity: 0, y: 12, scale: 0.98 }}
          animate={{ opacity: 1, y: 0,  scale: 1 }}
          className="max-w-md w-full rounded-3xl p-7"
          style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
        >
          <div
            className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(48,255,172,0.10)', border: '1px solid rgba(48,255,172,0.20)' }}
          >
            <Check className="w-7 h-7" style={{ color: tk.mint }} />
          </div>
          <h1 className="text-2xl font-bold text-center mb-3 tracking-tight" style={{ color: tk.text }}>
            Request submitted
          </h1>
          <p className="text-sm leading-6 text-center" style={{ color: tk.textSec }}>
            Your signup is pending admin approval. You'll receive an email at{' '}
            <span className="font-semibold" style={{ color: tk.text }}>{form.email}</span> once you're approved.
          </p>
          <div className="mt-5 rounded-xl px-4 py-3"
            style={{ background: tk.panelHov, border: `1px solid ${tk.border}` }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: tk.textTer }}>Your member ID</p>
            <p className="text-sm font-mono font-bold mt-1" style={{ color: tk.text }}>{success.member_login_id}</p>
            <p className="text-[11px] mt-1.5" style={{ color: tk.textTer }}>
              Use this with your password once approved.
            </p>
          </div>
          <motion.button
            onClick={() => navigate(`/${org.slug}/overview`)}
            className="w-full mt-6 px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: tk.gradPrimary }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.97 }}
          >
            Back to {org.short_name}
          </motion.button>
        </motion.div>
      </FullCenter>
    );
  }

  // ─────────────────────────────────────────────────────────────────────────
  // Main UI
  // ─────────────────────────────────────────────────────────────────────────
  const km = kindMeta(group.kind, tk);

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh', background: tk.bg }}>
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full blur-[160px]"
          style={{
            width: 560, height: 560,
            background: `radial-gradient(circle, ${km.color} 0%, transparent 70%)`,
            top: '-12%', right: '-10%', opacity: 0.14,
          }}
        />
        <div
          className="absolute rounded-full blur-[140px]"
          style={{
            width: 380, height: 380,
            background: `radial-gradient(circle, ${tk.primary} 0%, transparent 70%)`,
            bottom: '8%', left: '-8%', opacity: 0.10,
          }}
        />
      </div>

      {/* Top bar */}
      <nav className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 py-4 sm:py-5 flex items-center justify-between gap-3">
        <button
          onClick={() => navigate(`/${org.slug}/overview`)}
          className="flex items-center gap-2 text-xs sm:text-sm font-medium transition-colors min-w-0"
          style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="truncate">Back to {org.short_name}</span>
        </button>
        <div className="flex items-center gap-2">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center font-extrabold text-white text-sm"
            style={{ background: tk.gradPrimary }}
          >
            P
          </div>
          <span className="hidden sm:inline text-base font-bold" style={{ color: tk.text }}>{APP_NAME}</span>
        </div>
      </nav>

      {/* Group hero */}
      <header className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 pt-3 sm:pt-4 pb-5 sm:pb-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-4 sm:p-6 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${km.color}12, ${tk.panel})`,
            border: `1px solid ${tk.border}`,
          }}
        >
          <div className="flex items-start gap-3 sm:gap-4">
            <div
              className="shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-2xl flex items-center justify-center"
              style={{ background: `${km.color}18`, border: `1px solid ${km.color}30` }}
            >
              <km.icon className="w-5 h-5 sm:w-6 sm:h-6" style={{ color: km.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[8px] sm:text-[9px] uppercase tracking-[0.18em] font-semibold mb-1 break-words"
                style={{ color: tk.textTer }}>
                {org.name}
                {parentGroup && <> · {parentGroup.name}</>}
              </p>
              <h1 className="text-[1.35rem] sm:text-3xl font-extrabold leading-[1.12] tracking-tight break-words" style={{ color: tk.text, wordBreak: 'break-word' }}>
                {group.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <TrustBadge level={(org.trust_level as TrustLevel) ?? 'community'} size="sm" />
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: `${km.color}14`, color: km.color }}>
                  {km.label}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: tk.panelHov, color: tk.textSec }}>
                  <Users className="w-3 h-3" />
                  {(group.member_count ?? 0).toLocaleString()} members
                </span>
                {group.levels?.length ? (
                  <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                    style={{ background: `${tk.primary}14`, color: tk.primary }}>
                    Level {group.levels.join(' · ')}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </motion.div>
      </header>

      {/* Main */}
      <main className="relative z-10 max-w-3xl mx-auto px-4 sm:px-6 pb-20 sm:pb-24">
        <AnimatePresence mode="wait">
          {mode === 'choose' ? (
            <motion.div
              key="choose"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
              className="space-y-4"
            >
              <h2 className="text-base font-semibold px-1" style={{ color: tk.text }}>How would you like to continue?</h2>

              {!allowSignup && (
                <div
                  className="rounded-2xl px-4 py-3 flex items-start gap-3"
                  style={{ background: 'rgba(255,210,74,0.08)', border: '1px solid rgba(255,210,74,0.25)' }}
                >
                  <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: '#FFD24A', marginTop: 1 }} />
                  <p className="text-xs leading-5" style={{ color: tk.textSec }}>
                    This {km.label.toLowerCase()} requires an invite code to join. Your admin can generate one for you, or use an existing account below.
                  </p>
                </div>
              )}

              {/* I'm new */}
              {allowSignup && (
                <ChoiceCard
                  tk={tk}
                  icon={<UserPlus className="w-5 h-5" />}
                  iconColor={tk.primary}
                  title="I'm new to this class"
                  description="Sign up using your matric number or member ID. Land in your dashboard immediately."
                  ctaLabel="Sign up"
                  emphasis
                  onClick={() => setMode('signup')}
                />
              )}

              {/* Have account */}
              <ChoiceCard
                tk={tk}
                icon={<LogIn className="w-5 h-5" />}
                iconColor={tk.mint}
                title="I have an account"
                description={`Sign in with your member ID and password for ${group.name}.`}
                ctaLabel="Sign in"
                onClick={() =>
                  navigate(`/${org.slug}/login?group=${encodeURIComponent(group.id)}`)
                }
              />

              {/* Invite code */}
              <ChoiceCard
                tk={tk}
                icon={<Ticket className="w-5 h-5" />}
                iconColor={tk.blue}
                title="I have an invite code"
                description="Your admin shared a code with you. Redeem it to join this class."
                ctaLabel="Redeem code"
                onClick={() => navigate(`/${org.slug}/join`)}
              />
            </motion.div>
          ) : (
            <motion.div
              key="signup"
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.28 }}
            >
              <button
                onClick={() => { setMode('choose'); setError(null); }}
                className="inline-flex items-center gap-1.5 text-xs font-medium mb-4"
                style={{ color: tk.textSec }}
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Other options
              </button>

              <motion.div
                className="rounded-3xl p-5 sm:p-6"
                style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4" style={{ color: tk.primary }} />
                  <h2 className="text-base font-bold" style={{ color: tk.text }}>Join {group.name}</h2>
                </div>
                <p className="text-xs leading-5 mb-5" style={{ color: tk.textSec }}>
                  Fill the form to create your account. Your data lives only in this class.
                </p>

                <form className="space-y-4" onSubmit={handleSubmit}>
                  <Row>
                    <Field tk={tk} label="Full name" required>
                      <Input tk={tk} value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} placeholder="John Doe" autoComplete="name" required />
                    </Field>
                    <Field tk={tk} label="Member ID" required hint="matric / staff / member number">
                      <Input tk={tk} value={form.memberNumber} onChange={(v) => setForm({ ...form, memberNumber: v })} placeholder="2018/1/12345" required />
                    </Field>
                  </Row>

                  <Row>
                    <Field tk={tk} label="Email" required icon={<Mail className="w-3 h-3" />}>
                      <Input tk={tk} value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="you@example.com" type="email" autoComplete="email" required />
                    </Field>
                    <Field tk={tk} label="Phone" icon={<Phone className="w-3 h-3" />}>
                      <Input tk={tk} value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+234 800 000 0000" type="tel" autoComplete="tel" />
                    </Field>
                  </Row>

                  <Row>
                    <Field tk={tk} label="Password" required hint="at least 6 chars">
                      <Input tk={tk} value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="••••••••" type="password" autoComplete="new-password" required />
                    </Field>
                    <Field tk={tk} label="Confirm password" required>
                      <Input tk={tk} value={form.passwordConfirm} onChange={(v) => setForm({ ...form, passwordConfirm: v })} placeholder="••••••••" type="password" autoComplete="new-password" required />
                    </Field>
                  </Row>

                  {(() => {
                    const lf = levelFieldLabel(org?.organization_type);
                    return (
                      <Field tk={tk} label={lf.label} hint={lf.hint}>
                        <Input tk={tk} value={form.level} onChange={(v) => setForm({ ...form, level: v })} placeholder={lf.placeholder} />
                      </Field>
                    );
                  })()}

                  {pwMismatch && (
                    <p className="text-xs flex items-center gap-1.5" style={{ color: tk.danger }}>
                      <AlertCircle className="w-3.5 h-3.5" />
                      Passwords do not match.
                    </p>
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
                        <p className="text-sm leading-6" style={{ color: tk.text }}>{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="flex items-center justify-between gap-3 pt-1 flex-wrap">
                    <p className="text-[11px] leading-5" style={{ color: tk.textTer, maxWidth: 280 }}>
                      By joining, your activity stays inside this class. Other classes can't see your data.
                    </p>
                    <motion.button
                      type="submit"
                      disabled={!canSubmit || submitting}
                      className="px-6 py-3 rounded-2xl text-white font-bold text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                      style={{
                        background: tk.gradPrimary,
                        boxShadow: canSubmit && !submitting ? '0 8px 28px rgba(255,104,3,0.35)' : 'none',
                      }}
                      whileHover={canSubmit && !submitting ? { scale: 1.03 } : undefined}
                      whileTap={canSubmit && !submitting ? { scale: 0.97 } : undefined}
                    >
                      {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                      Create my account
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </form>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Small parts
// ────────────────────────────────────────────────────────────────────────────

function ChoiceCard({
  tk,
  icon,
  iconColor,
  title,
  description,
  ctaLabel,
  onClick,
  emphasis,
}: {
  tk: GroupWelcomeTokens;
  icon: React.ReactNode;
  iconColor: string;
  title: string;
  description: string;
  ctaLabel: string;
  onClick: () => void;
  emphasis?: boolean;
}) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2 }}
      whileTap={{ scale: 0.99 }}
      className="w-full text-left rounded-2xl p-4 sm:p-5 transition-all relative overflow-hidden"
      style={{
        background: emphasis
          ? 'linear-gradient(135deg, rgba(255,104,3,0.12), rgba(255,104,3,0.04))'
          : tk.panel,
        border: `1px solid ${emphasis ? 'rgba(255,104,3,0.32)' : tk.border}`,
      }}
    >
      <div className="flex items-start gap-3 sm:gap-4">
        <div
          className="w-10 h-10 sm:w-11 sm:h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `${iconColor}18`,
            color: iconColor,
            border: `1px solid ${iconColor}28`,
          }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold break-words" style={{ color: tk.text }}>{title}</h3>
          <p className="text-xs mt-1 leading-5" style={{ color: tk.textSec }}>{description}</p>
          <div
            className="sm:hidden inline-flex items-center gap-1 text-xs font-semibold mt-2"
            style={{ color: emphasis ? tk.primary : tk.textSec }}
          >
            {ctaLabel}
            <ArrowRight className="w-3.5 h-3.5" />
          </div>
        </div>
        <div
          className="hidden sm:flex items-center gap-1 text-xs font-semibold shrink-0 ml-2"
          style={{ color: emphasis ? tk.primary : tk.textSec }}
        >
          {ctaLabel}
          <ArrowRight className="w-3.5 h-3.5" />
        </div>
      </div>
    </motion.button>
  );
}

function Row({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">{children}</div>;
}

function Field({
  tk,
  label,
  hint,
  required,
  icon,
  children,
}: {
  tk: GroupWelcomeTokens;
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
  tk, value, onChange, placeholder, type = 'text', autoComplete, required,
}: {
  tk: GroupWelcomeTokens;
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
        background: tk.panelHov,
        border: `1px solid ${tk.border}`,
        color: tk.text,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = tk.borderHov; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = tk.border; }}
    />
  );
}

function Loader({ tk }: { tk: GroupWelcomeTokens }) {
  return (
    <FullCenter tk={tk}>
      <motion.div
        className="w-10 h-10 border-2 rounded-full"
        style={{ borderColor: `${tk.primary}30`, borderTopColor: tk.primary }}
        animate={{ rotate: 360 }}
        transition={{ duration: 0.9, repeat: Infinity, ease: 'linear' }}
      />
      <p className="text-xs tracking-wider mt-3" style={{ color: tk.textTer }}>
        Loading class…
      </p>
    </FullCenter>
  );
}

function FullCenter({ children, tk }: { children: React.ReactNode; tk: GroupWelcomeTokens }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: tk.bg, minHeight: '100dvh' }}
    >
      <div className="w-full max-w-md flex flex-col items-center">{children}</div>
    </div>
  );
}
