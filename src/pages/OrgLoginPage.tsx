/**
 * OrgLoginPage - Organization-scoped login page
 * Accessed via /:orgSlug/login
 * Uses the same visual style as the existing LoginPage
 */

import { useState, useEffect } from 'react';
import { Lock, User, AlertCircle, Info, ArrowLeft, Building2 } from 'lucide-react';
import { colors } from '@/config/colors';
import CustomButton from '@/components/ui/CustomButton';
import Input from '@/components/ui/Input';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '@/components/ui/PageWrapper';
import { organizationService } from '@/services/organizationService';
import type { Organization } from '@/types/multiTenant';
import { APP_NAME } from '@/config/constants';

export default function OrgLoginPage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const [memberId, setMemberId] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [org, setOrg] = useState<Organization | null>(null);
  const [orgLoading, setOrgLoading] = useState(true);
  const [orgNotFound, setOrgNotFound] = useState(false);

  const { login, isAuthenticated, user, needsPasswordChange } = useMultiTenantAuth();
  const navigate = useNavigate();

  // Fetch org info
  useEffect(() => {
    if (!orgSlug) return;
    setOrgLoading(true);
    organizationService
      .getBySlug(orgSlug)
      .then((data) => {
        if (data) {
          setOrg(data);
        } else {
          setOrgNotFound(true);
        }
      })
      .catch(() => setOrgNotFound(true))
      .finally(() => setOrgLoading(false));
  }, [orgSlug]);

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user && orgSlug) {
      if (needsPasswordChange) {
        navigate(`/${orgSlug}/change-password`, { replace: true });
      } else {
        navigate(`/${orgSlug}/dashboard`, { replace: true });
      }
    }
  }, [isAuthenticated, user, needsPasswordChange, navigate, orgSlug]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!orgSlug) return;
    setError('');
    setLoading(true);

    try {
      const result = await login(memberId, password, orgSlug);
      if (result.mustChangePassword) {
        navigate(`/${orgSlug}/change-password`, { replace: true });
      } else {
        navigate(`/${orgSlug}/dashboard`, { replace: true });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid credentials. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  // Org not found state
  if (!orgLoading && orgNotFound) {
    return (
      <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
        <motion.div
          className="text-center space-y-6 max-w-md"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div
            className="w-20 h-20 rounded-2xl flex items-center justify-center mx-auto"
            style={{ background: `${colors.statusUnpaid}15` }}
          >
            <Building2 size={36} style={{ color: colors.statusUnpaid }} />
          </div>
          <h2 className="text-2xl font-bold text-white">Organization Not Found</h2>
          <p style={{ color: colors.textSecondary }}>
            We couldn&apos;t find an organization with the URL <strong className="text-white">/{orgSlug}</strong>.
            It may have been deactivated or the link may be incorrect.
          </p>
          <Link
            to="/"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl font-medium text-white transition-all hover:scale-105"
            style={{ background: colors.primary }}
          >
            <ArrowLeft size={18} />
            Find your organization
          </Link>
        </motion.div>
      </PageWrapper>
    );
  }

  // Loading org state
  if (orgLoading) {
    return (
      <PageWrapper centered noPadding>
        <div className="flex flex-col items-center gap-4">
          <div className="w-12 h-12 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: `${colors.primary}40`, borderTopColor: 'transparent' }} />
          <p style={{ color: colors.textSecondary }}>Loading organization...</p>
        </div>
      </PageWrapper>
    );
  }

  const memberLabel = org?.member_label || 'Member';
  const memberIdLabel = org?.organization_type === 'university' ? 'Registration Number' : `${memberLabel} ID`;
  const memberIdPlaceholder = org?.organization_type === 'university' ? 'e.g., 2024/274804' : `Enter your ${memberLabel} ID`;

  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
      <motion.div
        className="relative w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Left Side - Org Branding */}
        <motion.div
          className="hidden lg:block space-y-8"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <div className="space-y-4">
            {/* Org Identity */}
            <div className="flex items-center gap-4 mb-6">
              {org?.logo_url ? (
                <img
                  src={org.logo_url}
                  alt={org.name}
                  className="w-16 h-16 rounded-2xl object-cover"
                />
              ) : (
                <div
                  className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white"
                  style={{ background: org?.primary_color || colors.primary }}
                >
                  {org?.short_name?.charAt(0) || 'O'}
                </div>
              )}
              <div>
                <h1 className="text-2xl font-bold text-white">{org?.name}</h1>
                <p className="text-sm" style={{ color: colors.textTertiary }}>
                  {org?.short_name} &bull; Powered by {APP_NAME}
                </p>
              </div>
            </div>

            <motion.h2
              className="text-3xl sm:text-4xl font-bold leading-tight"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Welcome to<br />
              <span style={{ color: org?.primary_color || colors.primary }}>{org?.short_name || org?.name}</span>
            </motion.h2>

            <motion.p
              className="text-lg"
              style={{ color: colors.textSecondary }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Sign in to manage your {org?.payment_label?.toLowerCase() || 'payments'}, view history, and stay updated with your {org?.group_label?.toLowerCase() || 'group'} finances.
            </motion.p>
          </div>

          {/* Features */}
          <div className="space-y-4">
            {[
              'Real-time payment tracking',
              'Secure authentication',
              'Instant notifications',
              'Complete payment history',
            ].map((feature, i) => (
              <motion.div
                key={i}
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: org?.primary_color || colors.primary }}
                />
                <p style={{ color: colors.textSecondary }}>{feature}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right Side - Login Form */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
        >
          {/* Mobile Org Header */}
          <motion.div
            className="flex lg:hidden flex-col items-center mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            {org?.logo_url ? (
              <img src={org.logo_url} alt={org.name} className="w-16 h-16 rounded-2xl object-cover mb-3" />
            ) : (
              <div
                className="w-16 h-16 rounded-2xl flex items-center justify-center text-2xl font-bold text-white mb-3"
                style={{ background: org?.primary_color || colors.primary }}
              >
                {org?.short_name?.charAt(0) || 'O'}
              </div>
            )}
            <h1 className="text-xl font-bold text-white">{org?.name}</h1>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
              Powered by {APP_NAME}
            </p>
          </motion.div>

          {/* Login Card */}
          <motion.div
            className="relative backdrop-blur-xl rounded-3xl p-6 sm:p-8 border"
            style={{
              background: 'rgba(15, 7, 3, 0.6)',
              borderColor: `${org?.primary_color || colors.primary}33`,
              boxShadow: `
                0 0 0 1px ${org?.primary_color || colors.primary}1A,
                0 20px 50px -12px rgba(0, 0, 0, 0.8),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.05)
              `,
            }}
          >
            <h2 className="text-2xl font-bold mb-6 text-white">Sign In</h2>

            {/* Info Banner */}
            <motion.div
              className="flex items-start gap-3 p-4 rounded-xl mb-6"
              style={{
                background: `${colors.accentMint}10`,
                border: `1px solid ${colors.accentMint}30`,
              }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Info size={18} style={{ color: colors.accentMint, marginTop: 2 }} />
              <p className="text-xs leading-relaxed" style={{ color: colors.accentMint }}>
                First time? Use your {memberIdLabel.toLowerCase()} as both username and password. You&apos;ll be prompted to change it.
              </p>
            </motion.div>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="flex items-start gap-3 p-4 rounded-xl mb-6"
                  style={{
                    background: `${colors.statusUnpaid}15`,
                    border: `1px solid ${colors.statusUnpaid}40`,
                  }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  <AlertCircle size={20} style={{ color: colors.statusUnpaid, marginTop: 2 }} />
                  <p className="text-sm leading-relaxed" style={{ color: colors.statusUnpaid }}>
                    {error}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Login Form */}
            <motion.form
              onSubmit={handleSubmit}
              className="space-y-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 }}
              >
                <Input
                  label={memberIdLabel}
                  type="text"
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  placeholder={memberIdPlaceholder}
                  required
                  icon={<User size={20} />}
                  fullWidth
                  autoComplete="username"
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
              >
                <Input
                  label="Password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Enter your password"
                  required
                  icon={<Lock size={20} />}
                  fullWidth
                  autoComplete="current-password"
                />
                <div className="text-right -mt-1">
                  <Link
                    to={`/${orgSlug}/forgot-password`}
                    className="text-xs underline hover:no-underline transition-colors"
                    style={{ color: colors.primary }}
                  >
                    Forgot password?
                  </Link>
                </div>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.9 }}
              >
                <CustomButton
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={loading}
                  disabled={loading}
                  className="py-4 text-base font-semibold mt-6"
                >
                  {loading ? 'Signing in...' : 'Sign In'}
                </CustomButton>
              </motion.div>
            </motion.form>

            {/* Footer */}
            <motion.div
              className="mt-6 text-center space-y-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              <p className="text-xs" style={{ color: colors.textSecondary }}>
                Having trouble logging in? Contact your {org?.admin_label?.toLowerCase() || 'admin'} for assistance.
              </p>
              <Link
                to="/"
                className="inline-flex items-center gap-1 text-xs transition-all hover:underline"
                style={{ color: colors.textTertiary }}
              >
                <ArrowLeft size={14} />
                Back to {APP_NAME}
              </Link>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </PageWrapper>
  );
}
