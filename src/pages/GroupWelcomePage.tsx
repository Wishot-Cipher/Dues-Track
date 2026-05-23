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
  Key,
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
import { APP_NAME } from '@/config/constants';
import type {
  Organization,
  OrganizationGroup,
  TrustLevel,
} from '@/types/multiTenant';
import { supabase } from '@/config/supabase';

const tk = {
  bg:         '#0F0703',
  panel:      'rgba(255,255,255,0.03)',
  panelHov:   'rgba(255,255,255,0.055)',
  border:     'rgba(255,255,255,0.08)',
  borderHov:  'rgba(255,104,3,0.32)',
  text:       '#FFFFFF',
  textSec:    'rgba(255,255,255,0.65)',
  textTer:    'rgba(255,255,255,0.30)',
  primary:    '#FF6803',
  mint:       '#30FFAC',
  blue:       '#3b82f6',
  purple:     '#8b5cf6',
  danger:     '#ef4444',
};

const SESSION_KEYS = {
  AUTH:      'pvx_auth',
  ORG_ID:    'pvx_org_id',
  ORG_SLUG:  'pvx_org_slug',
  MEMBER_ID: 'pvx_member_id',
  GROUP_ID:  'pvx_group_id',
} as const;

const KIND_META: Record<string, { color: string; icon: React.ElementType; label: string }> = {
  faculty:    { color: tk.blue,    icon: GraduationCap, label: 'Faculty' },
  class:      { color: tk.purple,  icon: Layers,        label: 'Class' },
  department: { color: tk.primary, icon: BookOpen,      label: 'Department' },
  level:      { color: '#ec4899',  icon: Layers,        label: 'Level' },
  general:    { color: tk.mint,    icon: Users,         label: 'Group' },
  fellowship: { color: tk.blue,    icon: Users,         label: 'Fellowship' },
};
function kindMeta(kind?: string) {
  return KIND_META[kind?.toLowerCase() || ''] ?? KIND_META.general;
}

type Mode = 'choose' | 'signup';

export default function GroupWelcomePage() {
  const { orgSlug, groupShortName } = useParams<{ orgSlug: string; groupShortName: string }>();
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
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
    (async () => {
      if (!orgSlug || !groupShortName) return;
      setLoading(true);

      const orgData = await organizationService.getBySlug(orgSlug);
      if (cancelled || !orgData) {
        setLoading(false);
        return;
      }
      setOrg(orgData);

      const groups = await organizationService.getGroups(orgData.id);
      if (cancelled) return;
      const g = groups.find(
        (gr) => gr.short_name?.toLowerCase() === decodeURIComponent(groupShortName).toLowerCase()
      ) ?? null;
      setGroup(g);

      if (g?.parent_group_id) {
        setParentGroup(groups.find((gr) => gr.id === g.parent_group_id) ?? null);
      }

      // Org settings: is self-registration allowed?
      const { data: settings } = await supabase
        .from('organization_settings')
        .select('allow_self_registration, require_admin_approval')
        .eq('organization_id', orgData.id)
        .maybeSingle();
      setAllowSignup(settings?.allow_self_registration ?? true);

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
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
  if (loading) {
    return <Loader />;
  }

  if (!org || !group) {
    return (
      <FullCenter>
        <div className="text-center max-w-md">
          <div className="w-14 h-14 mx-auto mb-5 rounded-2xl flex items-center justify-center"
            style={{ background: `${tk.primary}15` }}>
            <Layers className="w-7 h-7" style={{ color: tk.primary }} />
          </div>
          <h1 className="text-2xl font-bold text-white mb-3 tracking-tight">Class not found</h1>
          <p className="text-sm leading-6" style={{ color: tk.textSec }}>
            We couldn't find a class at <span className="text-white font-semibold">/{orgSlug}/g/{groupShortName}</span>.
          </p>
          <motion.button
            onClick={() => navigate(orgSlug ? `/${orgSlug}/overview` : '/')}
            className="mt-6 px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #FF6803, #FFAC5F)' }}
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
      <FullCenter>
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
          <h1 className="text-2xl font-bold text-white text-center mb-3 tracking-tight">
            Request submitted
          </h1>
          <p className="text-sm leading-6 text-center" style={{ color: tk.textSec }}>
            Your signup is pending admin approval. You'll receive an email at{' '}
            <span className="text-white font-semibold">{form.email}</span> once you're approved.
          </p>
          <div className="mt-5 rounded-xl px-4 py-3"
            style={{ background: 'rgba(255,255,255,0.04)', border: `1px solid ${tk.border}` }}>
            <p className="text-[10px] uppercase tracking-widest" style={{ color: tk.textTer }}>Your member ID</p>
            <p className="text-sm font-mono font-bold text-white mt-1">{success.member_login_id}</p>
            <p className="text-[11px] mt-1.5" style={{ color: tk.textTer }}>
              Use this with your password once approved.
            </p>
          </div>
          <motion.button
            onClick={() => navigate(`/${org.slug}/overview`)}
            className="w-full mt-6 px-6 py-3 rounded-xl font-semibold text-sm text-white"
            style={{ background: 'linear-gradient(135deg, #FF6803, #FFAC5F)' }}
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
  const km = kindMeta(group.kind);

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

      {/* Group hero */}
      <header className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pt-4 pb-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-3xl p-5 sm:p-6 relative overflow-hidden"
          style={{
            background: `linear-gradient(135deg, ${km.color}12, rgba(255,255,255,0.02))`,
            border: `1px solid ${tk.border}`,
          }}
        >
          <div className="flex items-start gap-4">
            <div
              className="shrink-0 w-14 h-14 rounded-2xl flex items-center justify-center"
              style={{ background: `${km.color}18`, border: `1px solid ${km.color}30` }}
            >
              <km.icon className="w-6 h-6" style={{ color: km.color }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-1"
                style={{ color: tk.textTer }}>
                {org.name}
                {parentGroup && <> · {parentGroup.name}</>}
              </p>
              <h1 className="text-2xl sm:text-3xl font-extrabold text-white leading-tight tracking-tight">
                {group.name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <TrustBadge level={(org.trust_level as TrustLevel) ?? 'community'} size="sm" />
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: `${km.color}14`, color: km.color }}>
                  {km.label}
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                  style={{ background: 'rgba(255,255,255,0.06)', color: tk.textSec }}>
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
      <main className="relative z-10 max-w-3xl mx-auto px-5 sm:px-6 pb-24">
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
              <h2 className="text-base font-semibold text-white px-1">How would you like to continue?</h2>

              {!allowSignup && (
                <div
                  className="rounded-2xl px-4 py-3 flex items-start gap-3"
                  style={{ background: 'rgba(255,210,74,0.08)', border: '1px solid rgba(255,210,74,0.25)' }}
                >
                  <ShieldCheck className="w-5 h-5 shrink-0" style={{ color: '#FFD24A', marginTop: 1 }} />
                  <p className="text-xs leading-5" style={{ color: 'rgba(255,224,170,0.95)' }}>
                    This {km.label.toLowerCase()} requires an invite code to join. Your admin can generate one for you, or use an existing account below.
                  </p>
                </div>
              )}

              {/* I'm new */}
              {allowSignup && (
                <ChoiceCard
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
                  <h2 className="text-base font-bold text-white">Join {group.name}</h2>
                </div>
                <p className="text-xs leading-5 mb-5" style={{ color: tk.textSec }}>
                  Fill the form to create your account. Your data lives only in this class.
                </p>

                <form className="space-y-4" onSubmit={handleSubmit}>
                  <Row>
                    <Field label="Full name" required>
                      <Input value={form.fullName} onChange={(v) => setForm({ ...form, fullName: v })} placeholder="John Doe" autoComplete="name" required />
                    </Field>
                    <Field label="Member ID" required hint="matric / staff / member number">
                      <Input value={form.memberNumber} onChange={(v) => setForm({ ...form, memberNumber: v })} placeholder="2018/1/12345" required />
                    </Field>
                  </Row>

                  <Row>
                    <Field label="Email" required icon={<Mail className="w-3 h-3" />}>
                      <Input value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="you@example.com" type="email" autoComplete="email" required />
                    </Field>
                    <Field label="Phone" icon={<Phone className="w-3 h-3" />}>
                      <Input value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+234 800 000 0000" type="tel" autoComplete="tel" />
                    </Field>
                  </Row>

                  <Row>
                    <Field label="Password" required hint="at least 6 chars">
                      <Input value={form.password} onChange={(v) => setForm({ ...form, password: v })} placeholder="••••••••" type="password" autoComplete="new-password" required />
                    </Field>
                    <Field label="Confirm password" required>
                      <Input value={form.passwordConfirm} onChange={(v) => setForm({ ...form, passwordConfirm: v })} placeholder="••••••••" type="password" autoComplete="new-password" required />
                    </Field>
                  </Row>

                  <Field label="Level / position" hint="optional, e.g. 200L, SS2, Member">
                    <Input value={form.level} onChange={(v) => setForm({ ...form, level: v })} placeholder="200L" />
                  </Field>

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
                        <p className="text-sm leading-6" style={{ color: 'rgba(254,202,202,0.95)' }}>{error}</p>
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
                        background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
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
  icon,
  iconColor,
  title,
  description,
  ctaLabel,
  onClick,
  emphasis,
}: {
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
      className="w-full text-left rounded-2xl p-5 transition-all relative overflow-hidden"
      style={{
        background: emphasis
          ? 'linear-gradient(135deg, rgba(255,104,3,0.12), rgba(255,104,3,0.04))'
          : tk.panel,
        border: `1px solid ${emphasis ? 'rgba(255,104,3,0.32)' : tk.border}`,
      }}
    >
      <div className="flex items-center gap-4">
        <div
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
          style={{
            background: `${iconColor}18`,
            color: iconColor,
            border: `1px solid ${iconColor}28`,
          }}
        >
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="text-xs mt-1 leading-5" style={{ color: tk.textSec }}>{description}</p>
        </div>
        <div
          className="flex items-center gap-1 text-xs font-semibold shrink-0 ml-2"
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
  label,
  hint,
  required,
  icon,
  children,
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

function Loader() {
  return (
    <FullCenter>
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

function FullCenter({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="min-h-screen flex items-center justify-center px-5"
      style={{ background: tk.bg, minHeight: '100dvh' }}
    >
      <div className="w-full max-w-md flex flex-col items-center">{children}</div>
    </div>
  );
}
