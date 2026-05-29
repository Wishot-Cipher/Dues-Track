/**
 * JoinOrganizationPage — invite-code redemption.
 *
 * Route: /:orgSlug/join          (manual code entry)
 *        /:orgSlug/join?code=XXX (auto-prefilled, deep link from email/SMS)
 *
 * Three steps, each is a fluid framer-motion transition:
 *   1. CODE   — 8 segmented character cells, auto-uppercased,
 *               auto-submits on the final keystroke. Beautiful, like a 2FA
 *               or treasure-map input.
 *   2. FORM   — preview the org with its trust badge, fill the new-member
 *               form. The form mirrors GroupWelcomePage so the experience
 *               feels consistent.
 *   3. DONE   — celebratory state shown only if auto-login fails; otherwise
 *               the user lands straight on /:slug/dashboard.
 *
 * Backend logic preserved exactly: validateInvite → hash_password →
 * member existence check → billing limit check → organization_members
 * insert → invite usage increment → welcome notification + email →
 * auto-login.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Loader2,
  Check,
  ShieldCheck,
  UserPlus,
  Eye,
  EyeOff,
  AlertCircle,
  Ticket,
  Globe,
  Mail,
  Phone,
  KeyRound,
  Sparkles,
  ArrowRight,
} from 'lucide-react';
import { APP_NAME } from '@/config/constants';
import { supabase } from '@/config/supabase';
import { organizationService } from '@/services/organizationService';
import { billingService } from '@/services/billingService';
import notificationService from '@/services/notificationService';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import TrustBadge from '@/components/trust/TrustBadge';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import type { TrustLevel } from '@/types/multiTenant';

type JoinTokens = {
  bg: string;
  panel: string;
  panelHov: string;
  border: string;
  borderHov: string;
  text: string;
  textSec: string;
  textTer: string;
  textTertiary: string;
  primary: string;
  mint: string;
  danger: string;
  inputBg: string;
  inputBgHov: string;
  pageBase: string;
  leftPanel: string;
  rightPanel: string;
  borderFaint: string;
  borderMid: string;
};

function buildJoinTokens(theme: 'light' | 'dark'): JoinTokens {
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
    textTertiary: dtk.textTer,
    primary: dtk.primary,
    mint: dtk.mint,
    danger: dtk.danger,
    inputBg: dtk.card,
    inputBgHov: dtk.cardHover,
    pageBase: dtk.bgWash,
    leftPanel: dtk.bgWash,
    rightPanel: dtk.card,
    borderFaint: dtk.cardBorder,
    borderMid: dtk.primaryRing,
  };
}

interface InviteInfo {
  id: string;
  invite_code: string;
  invite_type: string;
  max_uses: number;
  times_used: number;
  expires_at: string | null;
  group_id: string | null;
  organization: {
    id: string;
    name: string;
    short_name: string;
    slug: string;
    organization_type: string;
    logo_url: string | null;
    primary_color: string;
    trust_level?: TrustLevel;
  };
}

const CODE_LEN = 8;

export default function JoinOrganizationPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useMultiTenantAuth();
  const { theme } = useTheme();
  const tk = buildJoinTokens(theme);

  const [step, setStep] = useState<'code' | 'form' | 'success'>('code');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Code state: an array of N characters
  const [codeChars, setCodeChars] = useState<string[]>(() => {
    const initial = (searchParams.get('code') || '').toUpperCase().slice(0, CODE_LEN).split('');
    return Array.from({ length: CODE_LEN }, (_, i) => initial[i] ?? '');
  });
  const codeRefs = useRef<(HTMLInputElement | null)[]>([]);

  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    member_id: '',
    email: '',
    phone: '',
    level: '',
    password: '',
    password_confirm: '',
    use_id_as_password: true,
  });

  const codeJoined = useMemo(() => codeChars.join(''), [codeChars]);

  // ── Auto-validate when URL prefilled or all cells filled ──
  useEffect(() => {
    const code = searchParams.get('code');
    if (code && code.length >= 4) {
      validateCode(code.toUpperCase());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (step === 'code' && codeJoined.length === CODE_LEN && !loading) {
      validateCode(codeJoined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [codeJoined]);

  // ── Cell input handlers ──
  const handleCellChange = (i: number, value: string) => {
    setError('');
    const v = value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 1);
    setCodeChars((prev) => {
      const next = [...prev];
      next[i] = v;
      return next;
    });
    if (v && i < CODE_LEN - 1) {
      codeRefs.current[i + 1]?.focus();
    }
  };

  const handleCellKeyDown = (i: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !codeChars[i] && i > 0) {
      codeRefs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowLeft' && i > 0) {
      e.preventDefault();
      codeRefs.current[i - 1]?.focus();
    } else if (e.key === 'ArrowRight' && i < CODE_LEN - 1) {
      e.preventDefault();
      codeRefs.current[i + 1]?.focus();
    } else if (e.key === 'Enter' && codeJoined.length >= 4) {
      validateCode(codeJoined);
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, CODE_LEN);
    if (!pasted) return;
    setCodeChars(() => Array.from({ length: CODE_LEN }, (_, i) => pasted[i] ?? ''));
    const focusIdx = Math.min(pasted.length, CODE_LEN - 1);
    setTimeout(() => codeRefs.current[focusIdx]?.focus(), 0);
  };

  const clearCode = () => {
    setCodeChars(Array.from({ length: CODE_LEN }, () => ''));
    setError('');
    codeRefs.current[0]?.focus();
  };

  // ── Validate code ──
  const validateCode = async (code: string) => {
    const trimmed = code.trim().toUpperCase();
    if (trimmed.length < 4) {
      setError('Please enter at least 4 characters of your code.');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const raw = await organizationService.validateInvite(trimmed);
      if (!raw) {
        setError('This invite code is invalid, expired, or has reached its maximum number of uses.');
        setLoading(false);
        return;
      }

      const result = raw as unknown as InviteInfo;

      if (orgSlug && result.organization?.slug && result.organization.slug !== orgSlug) {
        setError(`This code belongs to a different organization (${result.organization.short_name || result.organization.slug}).`);
        setLoading(false);
        return;
      }

      setInvite(result);
      setStep('form');
    } catch {
      setError('Failed to validate invite code. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ── Submit form ──
  const handleSubmit = async () => {
    if (!form.full_name.trim()) { setError('Your full name is required.'); return; }
    if (!form.member_id.trim()) { setError('Your member ID is required.'); return; }
    const password = form.use_id_as_password ? form.member_id.trim() : form.password;
    if (!form.use_id_as_password) {
      if (!form.password || form.password.length < 6) { setError('Password must be at least 6 characters.'); return; }
      if (form.password !== form.password_confirm) { setError('Passwords do not match.'); return; }
    }
    if (!invite) { setError('Invalid invite.'); return; }

    setLoading(true);
    setError('');

    try {
      const orgId = invite.organization.id;
      const groupId = invite.group_id;

      const { data: hashedPw, error: hashErr } = await supabase.rpc('hash_password', { p_password: password });
      if (hashErr) throw new Error('Failed to secure password.');

      const { data: existing } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('member_id', form.member_id.trim())
        .maybeSingle();

      if (existing) {
        setError('This member ID is already registered in this organization. Try logging in instead.');
        setLoading(false);
        return;
      }

      try {
        const limitResult = await billingService.checkLimit(orgId, 'members');
        if (limitResult && !limitResult.allowed) {
          setError(
            `This organization has reached its member limit (${limitResult.current}/${limitResult.limit} on the ${limitResult.planName} plan). Please contact the administrator.`
          );
          setLoading(false);
          return;
        }
      } catch {
        // fail-open if billing check fails
      }

      let finalGroupId = groupId;
      if (!finalGroupId) {
        const { data: groups } = await supabase
          .from('organization_groups')
          .select('id')
          .eq('organization_id', orgId)
          .order('created_at', { ascending: true })
          .limit(1);
        finalGroupId = groups?.[0]?.id || null;
      }

      const { error: insertErr } = await supabase
        .from('organization_members')
        .insert({
          organization_id: orgId,
          group_id: finalGroupId,
          member_id: form.member_id.trim(),
          full_name: form.full_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          level: form.level.trim() || null,
          password_hash: hashedPw,
          force_password_change: form.use_id_as_password,
          is_active: true,
        });

      if (insertErr) {
        if (insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique')) {
          setError('This member ID is already taken. Please use a different one.');
        } else {
          throw insertErr;
        }
        setLoading(false);
        return;
      }

      await organizationService.useInvite(invite.id);

      const { data: newMember } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('member_id', form.member_id.trim())
        .maybeSingle();

      if (newMember) {
        notificationService.sendWelcomeNotification(newMember.id, form.full_name.trim()).catch(() => {});
      }

      if (form.email.trim()) {
        fetch('/api/send-welcome-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            callerId: newMember?.id,
            memberEmail: form.email.trim(),
            memberName: form.full_name.trim(),
          }),
        }).catch(() => {});
      }

      // Auto-login
      try {
        const slug = invite.organization.slug;
        const loginResult = await login(form.member_id.trim(), password, slug);
        if (loginResult.mustChangePassword) {
          navigate(`/${slug}/change-password`, { replace: true, state: { justJoined: true, orgName: invite.organization.name } });
        } else {
          navigate(`/${slug}/dashboard`, { replace: true, state: { justJoined: true, orgName: invite.organization.name } });
        }
      } catch {
        setStep('success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  const orgAccent = invite?.organization.primary_color || tk.primary;

  return (
    <div className="min-h-screen relative overflow-x-hidden" style={{ minHeight: '100dvh', background: tk.bg }}>
      {/* Background glow */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div
          className="absolute rounded-full blur-[160px]"
          style={{
            width: 560, height: 560,
            background: `radial-gradient(circle, ${tk.primary} 0%, transparent 70%)`,
            top: '-12%', right: '-10%', opacity: 0.14,
          }}
        />
        <div
          className="absolute rounded-full blur-[140px]"
          style={{
            width: 420, height: 420,
            background: `radial-gradient(circle, ${tk.mint} 0%, transparent 70%)`,
            bottom: '5%', left: '-8%', opacity: 0.08,
          }}
        />
      </div>

      {/* Top bar */}
      <nav className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 py-5 flex items-center justify-between">
        <button
          onClick={() => {
            if (step === 'form') { setStep('code'); setInvite(null); setError(''); }
            else navigate(orgSlug ? `/${orgSlug}/overview` : '/');
          }}
          className="flex items-center gap-2 text-sm font-medium transition-colors"
          style={{ color: tk.textSec }}
        >
          <ArrowLeft className="w-4 h-4" />
          {step === 'form' ? 'Change code' : 'Back'}
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

      <main className="relative z-10 max-w-2xl mx-auto px-5 sm:px-6 pb-24">
        <AnimatePresence mode="wait">
          {/* ── STEP: CODE ─────────────────────────────────────────────── */}
          {step === 'code' && (
            <motion.section
              key="code"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              <header className="text-center mb-8 mt-2">
                <motion.div
                  initial={{ scale: 0.85, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.05 }}
                  className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-semibold mb-5"
                  style={{ background: `${tk.primary}14`, color: tk.primary, border: `1px solid ${tk.primary}28` }}
                >
                  <Ticket className="w-3.5 h-3.5" />
                  Invite code
                </motion.div>
                <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight mb-3 leading-tight" style={{ color: tk.text }}>
                  Got an invite?
                </h1>
                <p className="text-sm sm:text-base leading-7 max-w-md mx-auto" style={{ color: tk.textSec }}>
                  Drop the 8-character code your admin shared with you. We'll do the rest.
                </p>
              </header>

              {/* Big segmented code input */}
              <div className="rounded-3xl p-6 sm:p-8" style={{ background: tk.panel, border: `1px solid ${tk.border}` }}>
                <div className="flex items-center justify-center gap-1.5 sm:gap-2.5">
                  {codeChars.map((c, i) => (
                    <CodeCell
                      key={i}
                      value={c}
                      filled={Boolean(c)}
                      focused={false}
                      separator={i === 3}
                      inputRef={(el) => { codeRefs.current[i] = el; }}
                      onChange={(v) => handleCellChange(i, v)}
                      onKeyDown={(e) => handleCellKeyDown(i, e)}
                      onPaste={i === 0 ? handlePaste : undefined}
                    />
                  ))}
                </div>

                <AnimatePresence>
                  {error && (
                    <motion.div
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      className="mt-5 rounded-xl px-4 py-3 flex items-start gap-3"
                      style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.25)' }}
                    >
                      <AlertCircle className="w-5 h-5 shrink-0" style={{ color: tk.danger, marginTop: 1 }} />
                      <p className="text-sm leading-6" style={{ color: tk.text }}>{error}</p>
                    </motion.div>
                  )}
                </AnimatePresence>

                <div className="mt-6 flex items-center justify-between gap-3 flex-wrap">
                  <button
                    type="button"
                    onClick={clearCode}
                    className="text-xs font-medium transition-colors"
                    style={{ color: tk.textTer }}
                  >
                    Clear
                  </button>

                  <motion.button
                    onClick={() => validateCode(codeJoined)}
                    disabled={loading || codeJoined.length < 4}
                    className="px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{
                      background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
                      color: tk.text,
                      boxShadow: loading || codeJoined.length < 4 ? 'none' : '0 8px 28px rgba(255,104,3,0.4)',
                    }}
                    whileHover={!loading && codeJoined.length >= 4 ? { scale: 1.03 } : undefined}
                    whileTap={!loading && codeJoined.length >= 4 ? { scale: 0.97 } : undefined}
                  >
                    {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                    Verify code
                    <ArrowRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>

              {/* Alternative paths */}
              <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  onClick={() => navigate(orgSlug ? `/${orgSlug}/overview` : '/')}
                  className="rounded-2xl px-4 py-3.5 text-left transition-colors"
                  style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
                >
                  <p className="text-xs font-semibold mb-0.5" style={{ color: tk.text }}>I already have an account</p>
                  <p className="text-[11px]" style={{ color: tk.textTer }}>Sign in to your organization →</p>
                </button>
                <button
                  onClick={() => navigate('/bring-school')}
                  className="rounded-2xl px-4 py-3.5 text-left transition-colors"
                  style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
                >
                  <p className="text-xs font-semibold mb-0.5" style={{ color: tk.text }}>No invite code yet</p>
                  <p className="text-[11px]" style={{ color: tk.textTer }}>Bring your school online instead →</p>
                </button>
              </div>
            </motion.section>
          )}

          {/* ── STEP: FORM ─────────────────────────────────────────────── */}
          {step === 'form' && invite && (
            <motion.section
              key="form"
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
            >
              {/* Org preview card */}
              <motion.div
                initial={{ opacity: 0, scale: 0.97 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.08 }}
                className="rounded-3xl p-5 sm:p-6 relative overflow-hidden mb-5"
                style={{
                  background: `linear-gradient(135deg, ${orgAccent}14, rgba(255,255,255,0.02))`,
                  border: `1px solid ${tk.border}`,
                }}
              >
                <div
                  className="absolute inset-0 pointer-events-none"
                  style={{ background: `radial-gradient(ellipse 50% 60% at 90% 0%, ${orgAccent}25, transparent)` }}
                />
                <div className="relative flex items-center gap-4">
                  {invite.organization.logo_url ? (
                    <img src={invite.organization.logo_url} alt="" className="w-14 h-14 rounded-2xl object-cover shrink-0" />
                  ) : (
                    <div
                      className="w-14 h-14 rounded-2xl flex items-center justify-center text-lg font-bold shrink-0"
                      style={{ background: `linear-gradient(135deg, ${orgAccent} 0%, ${orgAccent}99 100%)` }}
                    >
                      {invite.organization.short_name?.slice(0, 1) || 'O'}
                    </div>
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] uppercase tracking-[0.22em] font-semibold mb-1" style={{ color: tk.textTer }}>
                      You're joining
                    </p>
                    <h2 className="text-lg sm:text-xl font-extrabold leading-tight truncate" style={{ color: tk.text }}>
                      {invite.organization.name}
                    </h2>
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                      <TrustBadge level={invite.organization.trust_level ?? 'community'} size="sm" />
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium capitalize"
                        style={{ background: 'rgba(255,255,255,0.06)', color: tk.textSec }}>
                        <Globe className="w-3 h-3" /> {invite.organization.organization_type}
                      </span>
                      <span className="inline-flex items-center gap-1 text-[10px] px-2 py-0.5 rounded-full font-medium"
                        style={{ background: 'rgba(48,255,172,0.10)', color: tk.mint, border: '1px solid rgba(48,255,172,0.18)' }}>
                        <Check className="w-3 h-3" /> Code verified
                      </span>
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Member details */}
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.16 }}
                className="rounded-3xl p-5 sm:p-6"
                style={{ background: tk.panel, border: `1px solid ${tk.border}` }}
              >
                <div className="flex items-center gap-2 mb-1">
                  <Sparkles className="w-4 h-4" style={{ color: tk.primary }} />
                  <h2 className="text-base font-bold" style={{ color: tk.text }}>Set up your account</h2>
                </div>
                <p className="text-xs leading-5 mb-5" style={{ color: tk.textSec }}>
                  This is what you'll use to sign in. Your data lives only in this organization.
                </p>

                <div className="space-y-4">
                  <Row>
                    <Field label="Full name" required>
                      <Input
                        value={form.full_name}
                        onChange={(v) => setForm({ ...form, full_name: v })}
                        placeholder="Jane Doe"
                        autoComplete="name"
                      />
                    </Field>
                    <Field label="Login ID / Member number" required hint="matric / staff / member">
                      <Input
                        value={form.member_id}
                        onChange={(v) => setForm({ ...form, member_id: v })}
                        placeholder={
                          invite.organization.organization_type === 'university' ? '2018/1/12345' :
                          invite.organization.organization_type === 'school' ? 'STD/2024/042' :
                          'MEM001'
                        }
                      />
                    </Field>
                  </Row>

                  <Row>
                    <Field label="Email" icon={<Mail className="w-3 h-3" />} hint="optional">
                      <Input value={form.email} onChange={(v) => setForm({ ...form, email: v })} placeholder="you@example.com" type="email" autoComplete="email" />
                    </Field>
                    <Field label="Phone" icon={<Phone className="w-3 h-3" />} hint="optional">
                      <Input value={form.phone} onChange={(v) => setForm({ ...form, phone: v })} placeholder="+234 800 000 0000" type="tel" autoComplete="tel" />
                    </Field>
                  </Row>

                  <Field label="Level / Year / Position" hint="optional, e.g. 200L, SS2, Member">
                    <Input value={form.level} onChange={(v) => setForm({ ...form, level: v })} placeholder="200L" />
                  </Field>

                  {/* Password mode toggle */}
                  <div
                    className="rounded-2xl p-4"
                    style={{
                      background: form.use_id_as_password ? `${tk.primary}10` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${form.use_id_as_password ? `${tk.primary}30` : tk.border}`,
                    }}
                  >
                    <label className="flex items-start gap-3 cursor-pointer">
                      <div
                        className="w-5 h-5 rounded-md flex items-center justify-center shrink-0 mt-0.5"
                        style={{
                          background: form.use_id_as_password ? tk.primary : 'transparent',
                          border: `1.5px solid ${form.use_id_as_password ? tk.primary : 'rgba(255,255,255,0.25)'}`,
                          transition: 'all 0.18s',
                        }}
                      >
                        {form.use_id_as_password && <Check className="w-3 h-3" style={{ color: tk.text }} strokeWidth={3} />}
                      </div>
                      <input
                        type="checkbox"
                        checked={form.use_id_as_password}
                        onChange={(e) => setForm({ ...form, use_id_as_password: e.target.checked })}
                        className="sr-only"
                      />
                      <div className="flex-1">
                        <p className="text-sm font-semibold" style={{ color: tk.text }}>Use my member ID as my first password</p>
                        <p className="text-[11px] mt-0.5" style={{ color: tk.textSec }}>
                          We'll force you to change it on first login. Recommended for now.
                        </p>
                      </div>
                      <KeyRound className="w-4 h-4 shrink-0 mt-0.5" style={{ color: form.use_id_as_password ? tk.primary : tk.textTer }} />
                    </label>
                  </div>

                  <AnimatePresence>
                    {!form.use_id_as_password && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        className="overflow-hidden"
                      >
                        <Row>
                          <Field label="Password" required hint="min 6 chars">
                            <div className="relative">
                              <Input
                                value={form.password}
                                onChange={(v) => setForm({ ...form, password: v })}
                                placeholder="••••••••"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete="new-password"
                              />
                              <button
                                type="button"
                                onClick={() => setShowPassword(!showPassword)}
                                className="absolute right-3 top-1/2 -translate-y-1/2"
                                style={{ color: tk.textTer }}
                              >
                                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                              </button>
                            </div>
                          </Field>
                          <Field label="Confirm" required>
                            <Input
                              value={form.password_confirm}
                              onChange={(v) => setForm({ ...form, password_confirm: v })}
                              placeholder="••••••••"
                              type="password"
                              autoComplete="new-password"
                            />
                          </Field>
                        </Row>
                      </motion.div>
                    )}
                  </AnimatePresence>

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
                        <p className="text-sm leading-6" style={{ color: tk.text }}>{error}</p>
                      </motion.div>
                    )}
                  </AnimatePresence>

                  <div className="pt-2 flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-[11px] leading-5" style={{ color: tk.textTer, maxWidth: 260 }}>
                      Your activity is scoped to this organization. Other organizations cannot see it.
                    </p>
                    <motion.button
                      onClick={handleSubmit}
                      disabled={loading}
                      className="px-6 py-3 rounded-2xl font-bold text-sm flex items-center gap-2 disabled:opacity-40"
                      style={{
                        background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)',
                        color: tk.text,
                        boxShadow: loading ? 'none' : '0 8px 28px rgba(255,104,3,0.4)',
                      }}
                      whileHover={!loading ? { scale: 1.03 } : undefined}
                      whileTap={!loading ? { scale: 0.97 } : undefined}
                    >
                      {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
                      Join {invite.organization.short_name}
                      <ArrowRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              </motion.div>
            </motion.section>
          )}

          {/* ── STEP: SUCCESS (auto-login fallback) ─────────────────────── */}
          {step === 'success' && (
            <motion.section
              key="success"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-w-md mx-auto mt-12"
            >
              <div className="rounded-3xl p-8 text-center" style={{ background: tk.panel, border: `1px solid ${tk.border}` }}>
                {/* Animated checkmark */}
                <motion.div
                  initial={{ scale: 0, rotate: -180 }}
                  animate={{ scale: 1, rotate: 0 }}
                  transition={{ type: 'spring', stiffness: 250, damping: 18, delay: 0.1 }}
                  className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-5"
                  style={{ background: 'rgba(48,255,172,0.10)', border: '1px solid rgba(48,255,172,0.25)' }}
                >
                  <Check className="w-8 h-8" style={{ color: tk.mint }} strokeWidth={3} />
                </motion.div>
                <h2 className="text-2xl font-extrabold mb-2 tracking-tight" style={{ color: tk.text }}>Welcome aboard.</h2>
                <p className="text-sm leading-6 mb-6" style={{ color: tk.textSec }}>
                  Your account is ready. Sign in to {invite?.organization.name} to get started.
                </p>
                <motion.button
                  onClick={() => navigate(`/${invite?.organization.slug || orgSlug}/login`)}
                  className="w-full px-6 py-3.5 rounded-2xl font-bold text-sm flex items-center justify-center gap-2"
                  style={{ background: 'linear-gradient(135deg, #FF6803 0%, #FFAC5F 100%)', color: tk.text, boxShadow: '0 8px 28px rgba(255,104,3,0.4)' }}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.97 }}
                >
                  Go to sign in
                  <ArrowRight className="w-4 h-4" />
                </motion.button>
              </div>
            </motion.section>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Code cell — 1 character, focused/filled styling, separator divider
// ────────────────────────────────────────────────────────────────────────────
function CodeCell({
  value,
  filled,
  separator,
  inputRef,
  onChange,
  onKeyDown,
  onPaste,
}: {
  value: string;
  filled: boolean;
  focused: boolean;
  separator: boolean;
  inputRef: (el: HTMLInputElement | null) => void;
  onChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
  onPaste?: (e: React.ClipboardEvent<HTMLInputElement>) => void;
}) {
  return (
    <>
      <motion.div
        whileHover={{ y: -1 }}
        className="relative"
      >
        <input
          ref={inputRef}
          type="text"
          inputMode="text"
          maxLength={1}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          onPaste={onPaste}
          autoComplete="off"
          spellCheck={false}
          className="
            w-10 h-12 sm:w-12 sm:h-14
            text-center font-mono font-bold uppercase
            text-lg sm:text-2xl
            rounded-xl outline-none transition-all
          "
          style={{
            background: filled ? 'rgba(255,104,3,0.10)' : 'rgba(26,14,9,0.85)',
            border: `1.5px solid ${filled ? 'rgba(255,104,3,0.35)' : 'rgba(255,255,255,0.10)'}`,
            color: tk.text,
            caretColor: '#FF6803',
            boxShadow: filled ? '0 4px 12px rgba(255,104,3,0.15)' : 'none',
          }}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = 'rgba(255,104,3,0.60)';
            e.currentTarget.style.boxShadow = '0 0 0 3px rgba(255,104,3,0.15)';
            e.currentTarget.select();
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = filled ? 'rgba(255,104,3,0.35)' : 'rgba(255,255,255,0.10)';
            e.currentTarget.style.boxShadow = filled ? '0 4px 12px rgba(255,104,3,0.15)' : 'none';
          }}
        />
        {filled && (
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            className="absolute -bottom-1 left-1/2 -translate-x-1/2 w-1 h-1 rounded-full"
            style={{ background: '#FF6803' }}
          />
        )}
      </motion.div>
      {separator && <span className="px-1" style={{ color: tk.textTer }}>•</span>}
    </>
  );
}

// ────────────────────────────────────────────────────────────────────────────
// Form bits
// ────────────────────────────────────────────────────────────────────────────
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
            {required && <span style={{ color: '#FF6803' }}> *</span>}
          </span>
        </span>
        {hint && <span className="text-[10px]" style={{ color: tk.textTer }}>{hint}</span>}
      </div>
      {children}
    </label>
  );
}

function Input({
  value,
  onChange,
  placeholder,
  type = 'text',
  autoComplete,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  type?: string;
  autoComplete?: string;
}) {
  return (
    <input
      type={type}
      value={value}
      autoComplete={autoComplete}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full rounded-xl px-3.5 py-2.5 text-sm outline-none transition-colors"
      style={{
        background: 'rgba(26,14,9,0.85)',
        border: `1px solid ${tk.border}`,
        color: tk.text,
      }}
      onFocus={(e) => { e.currentTarget.style.borderColor = 'rgba(255,104,3,0.40)'; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = tk.border; }}
    />
  );
}
