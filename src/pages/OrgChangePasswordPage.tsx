/**
 * OrgChangePasswordPage - Multi-tenant password change
 * Uses useMultiTenantAuth instead of legacy useAuth
 */

import { useState } from 'react';
import { Lock, CheckCircle, AlertCircle, Shield, Eye, EyeOff, Info } from 'lucide-react';
import { colors, gradients } from '@/config/colors';
import Button from '@/components/ui/CustomButton';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '@/components/ui/PageWrapper';

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'Contains a number', test: (p: string) => /\d/.test(p) },
  { label: 'Contains uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
];

export default function OrgChangePasswordPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, organization, changePassword, needsPasswordChange, isProfileComplete } = useMultiTenantAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);

  const isFirstTime = needsPasswordChange;
  const basePath = `/${orgSlug}`;

  const validate = (): boolean => {
    if (!currentPassword) { setError('Enter your current password'); return false; }
    if (!newPassword) { setError('Enter a new password'); return false; }
    if (newPassword.length < 8) { setError('Password must be at least 8 characters'); return false; }
    if (!confirmPassword) { setError('Confirm your new password'); return false; }
    if (newPassword !== confirmPassword) { setError('Passwords do not match'); return false; }
    if (newPassword === currentPassword) { setError('New password must differ from current'); return false; }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!validate()) return;

    setLoading(true);
    try {
      await changePassword(currentPassword, newPassword);

      if (!isProfileComplete) {
        navigate(`${basePath}/complete-profile`, { replace: true });
      } else {
        navigate(`${basePath}/dashboard`, { replace: true });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to change password';
      if (msg.includes('incorrect')) {
        setError('Current password is incorrect. Please try again.');
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const passedRules = PASSWORD_RULES.filter(r => r.test(newPassword));
  const strength = newPassword.length === 0 ? 0 : Math.min(100, (passedRules.length / PASSWORD_RULES.length) * 100);

  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
      <motion.div
        className="relative w-full max-w-5xl grid lg:grid-cols-2 gap-10 items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        {/* Left Side */}
        <motion.div
          className="hidden lg:flex flex-col space-y-8"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2 }}
        >
          <div className="space-y-4">
            <motion.div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: gradients.primary, boxShadow: `0 0 40px ${colors.primary}60` }}
              whileHover={{ scale: 1.05, rotate: 5 }}
            >
              <Shield size={32} className="text-white" />
            </motion.div>

            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              {isFirstTime ? 'Set Your' : 'Change Your'}<br />
              <span style={{ color: colors.primary }}>Password</span>
            </h2>

            <p className="text-lg" style={{ color: colors.textSecondary }}>
              {isFirstTime
                ? 'For security, please set a personal password to replace the default one.'
                : 'Keep your account secure with a strong password.'}
            </p>
          </div>

          {/* Tips */}
          <div className="space-y-3">
            <h3 className="font-semibold text-xs uppercase tracking-wider" style={{ color: colors.textTertiary }}>
              Security Tips
            </h3>
            {[
              'Use a mix of letters, numbers & symbols',
              'Don\'t reuse passwords from other sites',
              'Never share your password with anyone',
            ].map((tip, i) => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-1.5 h-1.5 rounded-full" style={{ background: colors.accentMint }} />
                <p className="text-sm" style={{ color: colors.textSecondary }}>{tip}</p>
              </div>
            ))}
          </div>

          {/* Org Badge */}
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: `${colors.primary}08`, border: `1px solid ${colors.borderPrimary}` }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: organization?.primary_color || colors.primary }}>
              {organization?.short_name?.charAt(0) || 'P'}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{organization?.name}</p>
              <p className="text-xs" style={{ color: colors.textTertiary }}>{user?.full_name}</p>
            </div>
          </div>
        </motion.div>

        {/* Right Side - Form */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3 }}
        >
          {/* Mobile Header */}
          <div className="lg:hidden text-center mb-8">
            <motion.div
              className="w-14 h-14 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: gradients.primary }}
            >
              <Lock size={28} className="text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold text-white">
              {isFirstTime ? 'Set Your Password' : 'Change Password'}
            </h1>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
              {isFirstTime ? 'Replace the default password' : 'Update your security'}
            </p>
          </div>

          {/* Card */}
          <div
            className="backdrop-blur-xl rounded-3xl p-6 sm:p-8 border"
            style={{
              background: 'rgba(15, 7, 3, 0.6)',
              borderColor: `${colors.primary}30`,
              boxShadow: `0 20px 50px -12px rgba(0,0,0,0.8), inset 0 1px 0 0 rgba(255,255,255,0.05)`,
            }}
          >
            {isFirstTime && (
              <motion.div
                className="flex items-start gap-3 p-4 rounded-xl mb-6"
                style={{ background: `${colors.warning}10`, border: `1px solid ${colors.warning}25` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                <Info size={16} style={{ color: colors.warning, marginTop: 2, flexShrink: 0 }} />
                <p className="text-xs leading-relaxed" style={{ color: colors.warning }}>
                  You&apos;re using a default password. Please create a personal one before continuing.
                </p>
              </motion.div>
            )}

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="flex items-start gap-3 p-4 rounded-xl mb-6"
                  style={{ background: `${colors.error}10`, border: `1px solid ${colors.error}30` }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                >
                  <AlertCircle size={18} style={{ color: colors.error, marginTop: 1, flexShrink: 0 }} />
                  <p className="text-sm" style={{ color: colors.error }}>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <form onSubmit={handleSubmit} className="space-y-5">
              {/* Current Password */}
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">
                  {isFirstTime ? 'Default Password' : 'Current Password'}
                </label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textTertiary }}>
                    <Lock size={18} />
                  </div>
                  <input
                    type={showCurrent ? 'text' : 'password'}
                    value={currentPassword}
                    onChange={e => { setCurrentPassword(e.target.value); setError(''); }}
                    placeholder={isFirstTime ? 'Enter the password you were given' : 'Enter current password'}
                    className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowCurrent(!showCurrent)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: colors.textTertiary }}
                  >
                    {showCurrent ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>
              </div>

              {/* New Password */}
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">New Password</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textTertiary }}>
                    <Lock size={18} />
                  </div>
                  <input
                    type={showNew ? 'text' : 'password'}
                    value={newPassword}
                    onChange={e => { setNewPassword(e.target.value); setError(''); }}
                    placeholder="Create a strong password"
                    className="w-full pl-10 pr-10 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNew(!showNew)}
                    className="absolute right-3 top-1/2 -translate-y-1/2"
                    style={{ color: colors.textTertiary }}
                  >
                    {showNew ? <EyeOff size={18} /> : <Eye size={18} />}
                  </button>
                </div>

                {/* Strength bar */}
                {newPassword.length > 0 && (
                  <motion.div className="mt-3 space-y-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                    <div className="h-1.5 rounded-full bg-white/10 overflow-hidden">
                      <motion.div
                        className="h-full rounded-full"
                        style={{
                          background: strength < 50 ? colors.error : strength < 80 ? colors.warning : colors.success,
                        }}
                        initial={{ width: 0 }}
                        animate={{ width: `${strength}%` }}
                        transition={{ duration: 0.3 }}
                      />
                    </div>
                    <div className="space-y-1">
                      {PASSWORD_RULES.map((rule, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <CheckCircle
                            size={12}
                            style={{ color: rule.test(newPassword) ? colors.success : colors.textDisabled }}
                          />
                          <span className="text-xs" style={{ color: rule.test(newPassword) ? colors.success : colors.textDisabled }}>
                            {rule.label}
                          </span>
                        </div>
                      ))}
                    </div>
                  </motion.div>
                )}
              </div>

              {/* Confirm */}
              <div>
                <label className="block text-sm font-medium text-white mb-1.5">Confirm Password</label>
                <div className="relative">
                  <div className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: colors.textTertiary }}>
                    <Lock size={18} />
                  </div>
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={e => { setConfirmPassword(e.target.value); setError(''); }}
                    placeholder="Repeat your new password"
                    className="w-full pl-10 pr-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder-gray-500 outline-none focus:border-[#FF6803] transition-colors"
                  />
                  {confirmPassword && (
                    <div className="absolute right-3 top-1/2 -translate-y-1/2">
                      {newPassword === confirmPassword ? (
                        <CheckCircle size={18} style={{ color: colors.success }} />
                      ) : (
                        <AlertCircle size={18} style={{ color: colors.error }} />
                      )}
                    </div>
                  )}
                </div>
              </div>

              <Button
                type="submit"
                variant="primary"
                fullWidth
                loading={loading}
                disabled={loading}
                className="py-4 text-base font-semibold mt-4"
              >
                {loading ? 'Updating...' : (
                  <span className="flex items-center justify-center gap-2">
                    <Shield size={18} />
                    {isFirstTime ? 'Set Password & Continue' : 'Update Password'}
                  </span>
                )}
              </Button>
            </form>
          </div>
        </motion.div>
      </motion.div>
    </PageWrapper>
  );
}
