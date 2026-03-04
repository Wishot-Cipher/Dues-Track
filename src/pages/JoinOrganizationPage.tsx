/**
 * JoinOrganizationPage — Public page for joining an org via invite link/code
 * Route: /:orgSlug/join?code=XXXX  or  /:orgSlug/join (manual code entry)
 */

import { useState, useEffect } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft, Loader2, Check, ShieldCheck,
  UserPlus, Eye, EyeOff, AlertTriangle,
  Globe,
} from 'lucide-react';
import { colors } from '@/config/colors';
import { APP_NAME } from '@/config/constants';
import { supabase } from '@/config/supabase';
import { organizationService } from '@/services/organizationService';
import notificationService from '@/services/notificationService';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import PageWrapper from '@/components/ui/PageWrapper';

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
  };
}

export default function JoinOrganizationPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useMultiTenantAuth();

  const [step, setStep] = useState<'code' | 'form' | 'success'>('code');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [inviteCode, setInviteCode] = useState(searchParams.get('code') || '');
  const [invite, setInvite] = useState<InviteInfo | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const [form, setForm] = useState({
    full_name: '',
    member_id: '',
    email: '',
    phone: '',
    password: '',
    password_confirm: '',
    use_id_as_password: true,
  });

  // Auto-validate code from URL param on mount
  useEffect(() => {
    const code = searchParams.get('code');
    if (code) {
      validateCode(code);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const validateCode = async (code: string) => {
    if (!code || code.length < 4) {
      setError('Please enter a valid invite code');
      return;
    }
    setLoading(true);
    setError('');

    try {
      const raw = await organizationService.validateInvite(code.trim().toUpperCase());
      if (!raw) {
        setError('This invite code is invalid, expired, or has reached its maximum number of uses.');
        setLoading(false);
        return;
      }

      const result = raw as unknown as InviteInfo;

      // If org slug in URL doesn't match invite's org, show error
      if (orgSlug && result.organization?.slug && result.organization.slug !== orgSlug) {
        setError('This invite code belongs to a different organization.');
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

  const handleSubmit = async () => {
    // Validate form
    if (!form.full_name.trim()) { setError('Full name is required'); return; }
    if (!form.member_id.trim()) { setError('Your Login ID / Registration Number is required'); return; }
    const password = form.use_id_as_password ? form.member_id.trim() : form.password;
    if (!form.use_id_as_password) {
      if (!form.password || form.password.length < 6) { setError('Password must be at least 6 characters'); return; }
      if (form.password !== form.password_confirm) { setError('Passwords do not match'); return; }
    }

    if (!invite) { setError('Invalid invite'); return; }

    setLoading(true);
    setError('');

    try {
      const orgId = invite.organization.id;
      const groupId = invite.group_id;

      // Hash the password server-side
      const { data: hashedPw, error: hashErr } = await supabase.rpc('hash_password', { p_password: password });
      if (hashErr) throw new Error('Failed to secure password');

      // Check if member_id already exists in this org
      const { data: existing } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('member_id', form.member_id.trim())
        .maybeSingle();

      if (existing) {
        setError('This Login ID is already registered in this organization. Please log in instead.');
        setLoading(false);
        return;
      }

      // Determine group_id: use invite's group, or the org's first group
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

      // Create the member
      const { error: insertErr } = await supabase
        .from('organization_members')
        .insert({
          organization_id: orgId,
          group_id: finalGroupId,
          member_id: form.member_id.trim(),
          full_name: form.full_name.trim(),
          email: form.email.trim() || null,
          phone: form.phone.trim() || null,
          password_hash: hashedPw,
          force_password_change: form.use_id_as_password, // Force change if using ID as password
          is_active: true,
        });

      if (insertErr) {
        if (insertErr.message?.includes('duplicate') || insertErr.message?.includes('unique')) {
          setError('This Login ID is already taken. Please use a different one.');
        } else {
          throw insertErr;
        }
        setLoading(false);
        return;
      }

      // Increment invite usage
      await organizationService.useInvite(invite.id);

      // Get the newly created member's ID for welcome notification
      const { data: newMember } = await supabase
        .from('organization_members')
        .select('id')
        .eq('organization_id', orgId)
        .eq('member_id', form.member_id.trim())
        .single();

      // Send welcome notification (non-blocking)
      if (newMember) {
        notificationService.sendWelcomeNotification(
          newMember.id,
          form.full_name.trim()
        ).catch(() => {});
      }

      // Auto-login
      try {
        const slug = invite.organization.slug;
        const loginResult = await login(form.member_id.trim(), password, slug);
        if (loginResult.mustChangePassword) {
          navigate(`/${slug}/change-password`, { replace: true });
        } else {
          navigate(`/${slug}/dashboard`, { replace: true });
        }
      } catch {
        // If auto-login fails, send to login page
        setStep('success');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6">
      <motion.div
        className="w-full max-w-md"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <button
            onClick={() => {
              if (step === 'form') { setStep('code'); setInvite(null); setError(''); }
              else navigate(orgSlug ? `/${orgSlug}/login` : '/');
            }}
            className="p-2 rounded-xl hover:bg-white/5 transition-colors"
          >
            <ArrowLeft size={20} className="text-white" />
          </button>
          <div className="flex-1">
            <h1 className="text-xl font-bold text-white">Join Organization</h1>
            <p className="text-sm" style={{ color: colors.textTertiary }}>
              {step === 'code' ? 'Enter your invite code' : step === 'form' ? 'Create your account' : 'Welcome!'}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm font-bold" style={{ color: colors.primary }}>
            <div className="w-8 h-8 rounded-full flex items-center justify-center text-white text-xs"
              style={{ background: colors.primary }}>
              P
            </div>
            {APP_NAME}
          </div>
        </div>

        {/* Error */}
        <AnimatePresence>
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="mb-4 p-3 rounded-xl text-sm text-red-400 flex items-start gap-2"
              style={{ background: 'rgba(255,77,77,0.1)', border: '1px solid rgba(255,77,77,0.2)' }}
            >
              <AlertTriangle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </motion.div>
          )}
        </AnimatePresence>

        <AnimatePresence mode="wait">
          {/* STEP: Enter Code */}
          {step === 'code' && (
            <motion.div key="code" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              <div className="p-6 rounded-2xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="flex justify-center mb-4">
                  <div className="w-16 h-16 rounded-2xl flex items-center justify-center" style={{ background: `${colors.primary}15` }}>
                    <ShieldCheck size={32} style={{ color: colors.primary }} />
                  </div>
                </div>
                <h2 className="text-lg font-semibold text-white text-center mb-1">Got an invite code?</h2>
                <p className="text-sm text-center mb-6" style={{ color: colors.textTertiary }}>
                  Enter the code shared by your admin or group leader to join.
                </p>
                <div className="space-y-4">
                  <input
                    type="text"
                    placeholder="e.g. ABC12XYZ"
                    value={inviteCode}
                    onChange={e => { setInviteCode(e.target.value.toUpperCase()); setError(''); }}
                    onKeyDown={e => e.key === 'Enter' && validateCode(inviteCode)}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3.5 text-white text-center text-lg tracking-widest font-mono placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors uppercase"
                    maxLength={12}
                    autoFocus
                  />
                  <button
                    onClick={() => validateCode(inviteCode)}
                    disabled={loading || inviteCode.length < 4}
                    className="w-full px-6 py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60"
                    style={{ background: colors.primary }}
                  >
                    {loading ? (
                      <><Loader2 size={18} className="animate-spin" /> Validating...</>
                    ) : (
                      <><Check size={18} /> Verify Code</>
                    )}
                  </button>
                </div>
                <div className="mt-4 text-center">
                  <p className="text-xs" style={{ color: colors.textTertiary }}>
                    Already have an account?{' '}
                    <button
                      className="font-medium hover:underline"
                      style={{ color: colors.primary }}
                      onClick={() => navigate(orgSlug ? `/${orgSlug}/login` : '/')}
                    >
                      Log in
                    </button>
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* STEP: Registration Form */}
          {step === 'form' && invite && (
            <motion.div key="form" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }}>
              {/* Org Info Card */}
              <div className="flex items-center gap-3 p-4 rounded-2xl mb-5" style={{ background: `${colors.primary}08`, border: `1px solid ${colors.primary}20` }}>
                {invite.organization.logo_url ? (
                  <img src={invite.organization.logo_url} alt="" className="w-11 h-11 rounded-xl object-cover" />
                ) : (
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center text-white text-sm font-bold" style={{ background: colors.primary }}>
                    {invite.organization.short_name?.slice(0, 2)}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white truncate">{invite.organization.name}</p>
                  <p className="text-xs flex items-center gap-1" style={{ color: colors.textTertiary }}>
                    <Globe size={10} />
                    {invite.organization.slug} &middot; <span className="capitalize">{invite.organization.organization_type}</span>
                  </p>
                </div>
                <div className="px-2.5 py-1 rounded-full text-[10px] font-semibold" style={{ background: `${colors.success}15`, color: colors.success }}>
                  <Check size={10} className="inline mr-1" />Verified
                </div>
              </div>

              {/* Form */}
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">Full Name *</label>
                  <input
                    type="text"
                    placeholder="e.g. Jane Doe"
                    value={form.full_name}
                    onChange={e => setForm(f => ({ ...f, full_name: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-1.5">
                    Login ID / Registration Number *
                  </label>
                  <input
                    type="text"
                    placeholder={
                      invite.organization.organization_type === 'university' ? 'e.g. CSC/2022/001' :
                      invite.organization.organization_type === 'school' ? 'e.g. STD/2024/042' :
                      'e.g. MEM001'
                    }
                    value={form.member_id}
                    onChange={e => setForm(f => ({ ...f, member_id: e.target.value }))}
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">Email</label>
                    <input
                      type="email"
                      placeholder="Optional"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white mb-1.5">Phone</label>
                    <input
                      type="tel"
                      placeholder="Optional"
                      value={form.phone}
                      onChange={e => setForm(f => ({ ...f, phone: e.target.value }))}
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                    />
                  </div>
                </div>

                {/* Password Toggle */}
                <div className="p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)' }}>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.use_id_as_password}
                      onChange={e => setForm(f => ({ ...f, use_id_as_password: e.target.checked }))}
                      className="w-4 h-4 rounded accent-[#FF6803]"
                    />
                    <div>
                      <p className="text-sm text-white font-medium">Use my Login ID as password</p>
                      <p className="text-xs" style={{ color: colors.textTertiary }}>
                        You&apos;ll be asked to change it on first login
                      </p>
                    </div>
                  </label>
                </div>

                {/* Custom Password */}
                {!form.use_id_as_password && (
                  <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-3">
                    <div className="relative">
                      <label className="block text-sm font-medium text-white mb-1.5">Password *</label>
                      <input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="At least 6 characters"
                        value={form.password}
                        onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 pr-10 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-9 text-gray-400 hover:text-white"
                      >
                        {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                      </button>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-white mb-1.5">Confirm Password *</label>
                      <input
                        type="password"
                        placeholder="Repeat your password"
                        value={form.password_confirm}
                        onChange={e => setForm(f => ({ ...f, password_confirm: e.target.value }))}
                        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                      />
                    </div>
                  </motion.div>
                )}

                <button
                  onClick={handleSubmit}
                  disabled={loading}
                  className="w-full px-6 py-3.5 rounded-xl text-white font-semibold flex items-center justify-center gap-2 transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-60 mt-2"
                  style={{ background: colors.primary }}
                >
                  {loading ? (
                    <><Loader2 size={18} className="animate-spin" /> Joining...</>
                  ) : (
                    <><UserPlus size={18} /> Join Organization</>
                  )}
                </button>
              </div>
            </motion.div>
          )}

          {/* STEP: Success (fallback when auto-login fails) */}
          {step === 'success' && (
            <motion.div key="success" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}>
              <div className="p-8 rounded-2xl text-center" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div className="w-16 h-16 rounded-full flex items-center justify-center mx-auto mb-4" style={{ background: `${colors.success}15` }}>
                  <Check size={32} style={{ color: colors.success }} />
                </div>
                <h2 className="text-lg font-semibold text-white mb-2">Welcome aboard!</h2>
                <p className="text-sm mb-6" style={{ color: colors.textTertiary }}>
                  Your account has been created successfully.
                </p>
                <button
                  onClick={() => navigate(`/${invite?.organization.slug || orgSlug}/login`)}
                  className="px-8 py-3 rounded-xl text-white font-semibold transition-all hover:scale-[1.02]"
                  style={{ background: colors.primary }}
                >
                  Go to Login
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </PageWrapper>
  );
}
