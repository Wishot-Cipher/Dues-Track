/**
 * OrgCompleteProfilePage - Multi-tenant profile completion
 * Uses useMultiTenantAuth instead of legacy useAuth
 */

import { useState } from 'react';
import { User, Mail, Phone, AlertCircle, UserCheck, Info, CheckCircle } from 'lucide-react';
import { colors, gradients } from '@/config/colors';
import Input from '@/components/ui/Input';
import Button from '@/components/ui/CustomButton';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '@/components/ui/PageWrapper';

export default function OrgCompleteProfilePage() {
  const { orgSlug } = useParams<{ orgSlug: string }>();
  const { user, organization, updateProfile } = useMultiTenantAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: user?.email || '',
    phone: user?.phone || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const memberLabel = organization?.member_label || 'Member';

  const handleChange = (field: string, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
    if (errors[field]) {
      setErrors(prev => ({ ...prev, [field]: '' }));
    }
  };

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!formData.email.trim()) {
      newErrors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (formData.phone.replace(/\D/g, '').length < 10) {
      newErrors.phone = 'Please enter a valid phone number';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validate()) return;

    setLoading(true);
    try {
      await updateProfile({
        email: formData.email.trim(),
        phone: formData.phone.trim(),
      });
      navigate(`/${orgSlug}/dashboard`, { replace: true });
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to update profile. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
      <motion.div
        className="relative w-full max-w-5xl grid lg:grid-cols-2 gap-10 items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Left Side - Illustration */}
        <motion.div
          className="hidden lg:flex flex-col space-y-8"
          initial={{ opacity: 0, x: -40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <div className="space-y-4">
            <motion.div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ background: gradients.primary, boxShadow: `0 0 40px ${colors.primary}60` }}
              whileHover={{ scale: 1.05, rotate: 5 }}
            >
              <UserCheck size={32} className="text-white" />
            </motion.div>

            <h2 className="text-3xl sm:text-4xl font-bold leading-tight">
              Complete Your<br />
              <span style={{ color: colors.primary }}>Profile</span>
            </h2>

            <p className="text-lg" style={{ color: colors.textSecondary }}>
              Just a few more details so {organization?.short_name || 'your organization'} can keep you updated.
            </p>
          </div>

          <div className="space-y-4">
            <h3 className="font-semibold text-xs uppercase tracking-wider" style={{ color: colors.textTertiary }}>
              Why we need this
            </h3>
            {[
              { icon: <Mail size={16} />, label: 'Email', desc: 'Payment receipts & important notices' },
              { icon: <Phone size={16} />, label: 'Phone', desc: 'Emergency updates & reminders' },
            ].map((item, i) => (
              <motion.div
                key={item.label}
                className="flex items-center gap-4 p-3 rounded-xl"
                style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.borderLight}` }}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.5 + i * 0.1 }}
              >
                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${colors.primary}15`, color: colors.primary }}>
                  {item.icon}
                </div>
                <div>
                  <p className="font-medium text-sm text-white">{item.label}</p>
                  <p className="text-xs" style={{ color: colors.textTertiary }}>{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>

          {/* Org badge */}
          <div className="flex items-center gap-3 p-3 rounded-xl" style={{ background: `${colors.primary}08`, border: `1px solid ${colors.borderPrimary}` }}>
            <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: organization?.primary_color || colors.primary }}>
              {organization?.short_name?.charAt(0) || 'P'}
            </div>
            <div>
              <p className="text-sm font-medium text-white">{organization?.name}</p>
              <p className="text-xs" style={{ color: colors.textTertiary }}>{memberLabel} Profile Setup</p>
            </div>
          </div>
        </motion.div>

        {/* Right Side - Form */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0, x: 40 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          {/* Mobile Header */}
          <div className="lg:hidden text-center mb-8">
            <motion.div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mx-auto mb-4"
              style={{ background: gradients.primary, boxShadow: `0 0 40px ${colors.primary}60` }}
            >
              <User size={32} className="text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold text-white">Complete Profile</h1>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>Just a few more details</p>
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
            {/* Greeting */}
            <div className="mb-6">
              <h2 className="text-xl font-bold text-white">
                Welcome, {user?.full_name?.split(' ')[0]} 👋
              </h2>
              <p className="text-sm mt-1" style={{ color: colors.textTertiary }}>
                Complete your profile to access all features
              </p>
            </div>

            {/* Info Banner */}
            <motion.div
              className="flex items-start gap-3 p-4 rounded-xl mb-6"
              style={{ background: `${colors.accentMint}08`, border: `1px solid ${colors.accentMint}20` }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <Info size={16} style={{ color: colors.accentMint, marginTop: 2, flexShrink: 0 }} />
              <p className="text-xs leading-relaxed" style={{ color: colors.accentMint }}>
                This information is used only for {organization?.short_name || 'organization'} communications and payment verification.
              </p>
            </motion.div>

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

            {/* Form */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.5 }}>
                <Input
                  label="Email Address"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="your.email@example.com"
                  required
                  icon={<Mail size={18} />}
                  fullWidth
                  error={errors.email}
                />
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
                <Input
                  label="Phone Number"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="08012345678"
                  required
                  icon={<Phone size={18} />}
                  fullWidth
                  error={errors.phone}
                />
              </motion.div>

              {/* Already filled info */}
              <motion.div
                className="p-4 rounded-xl space-y-2"
                style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.borderLight}` }}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.7 }}
              >
                <p className="text-xs font-medium uppercase tracking-wider" style={{ color: colors.textTertiary }}>Your Info</p>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <span style={{ color: colors.textTertiary }}>Name:</span>
                    <span className="ml-2 text-white">{user?.full_name}</span>
                  </div>
                  <div>
                    <span style={{ color: colors.textTertiary }}>ID:</span>
                    <span className="ml-2 text-white">{user?.member_id}</span>
                  </div>
                </div>
              </motion.div>

              <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.8 }}>
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={loading}
                  disabled={loading}
                  className="py-4 text-base font-semibold mt-4"
                >
                  {loading ? 'Saving...' : (
                    <span className="flex items-center justify-center gap-2">
                      <CheckCircle size={18} />
                      Continue to Dashboard
                    </span>
                  )}
                </Button>
              </motion.div>
            </form>

            {/* Privacy */}
            <div className="mt-6 p-3 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
              <p className="text-xs leading-relaxed" style={{ color: colors.textDisabled }}>
                <strong>Privacy:</strong> Your data is encrypted and only visible to {organization?.short_name || 'your organization'} administrators.
              </p>
            </div>
          </div>
        </motion.div>
      </motion.div>
    </PageWrapper>
  );
}
