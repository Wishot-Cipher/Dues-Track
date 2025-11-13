import { useState } from 'react';
import { User, Mail, Phone, AlertCircle, UserCheck, Info } from 'lucide-react';
import { colors, gradients } from '@/config/colors';
import { SECTIONS } from '@/config/constants';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/CustomButton';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { validateEmail, validatePhone } from '@/utils/validators';
import { motion, AnimatePresence } from 'framer-motion';
import notificationService from '@/services/notificationService';

export default function CompleteProfilePage() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: '',
    phone: '',
    section: '',
    reg_number: user?.reg_number || '',
  });

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const needsMatricUpdate = !user?.reg_number || !user.reg_number.includes('/');

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
    } else if (!validateEmail(formData.email)) {
      newErrors.email = 'Please enter a valid email address (e.g., name@example.com)';
    }

    if (!formData.phone.trim()) {
      newErrors.phone = 'Phone number is required';
    } else if (!validatePhone(formData.phone)) {
      newErrors.phone = 'Please enter a valid phone number (e.g., 08012345678)';
    }

    if (!formData.section) {
      newErrors.section = 'Please select your section';
    }

    if (needsMatricUpdate) {
      if (!formData.reg_number.trim()) {
        newErrors.reg_number = 'Matric number is required';
      } else if (!formData.reg_number.includes('/')) {
        newErrors.reg_number = 'Invalid format. Use format: 2024/274804';
      }
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
        section: formData.section,
        ...(needsMatricUpdate && { reg_number: formData.reg_number.trim() }),
      });
      
      // Send welcome notification
      if (user?.id && user?.full_name) {
        await notificationService.sendWelcomeNotification(user.id, user.full_name);
      }
      
      navigate('/dashboard');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error 
        ? err.message 
        : 'Failed to update profile. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8" style={{ background: '#0A0604' }}>
      {/* Grid Pattern Overlay */}
      <div 
        className="fixed inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(${colors.primary}40 1px, transparent 1px),
            linear-gradient(90deg, ${colors.primary}40 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Animated Gradient Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
            top: '-10%',
            right: '-5%',
            animationDuration: '4s',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${colors.accentMint} 0%, transparent 70%)`,
            bottom: '-5%',
            left: '-5%',
            animation: 'pulse 6s ease-in-out infinite',
          }}
        />
      </div>

      {/* Main Content Container */}
      <motion.div 
        className="relative w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Left Side - Info */}
        <motion.div 
          className="hidden lg:block space-y-8"
          initial={{ opacity: 0, x: -50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.2, duration: 0.6 }}
        >
          <div className="space-y-4">
            <motion.div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-6"
              style={{
                background: gradients.primary,
                boxShadow: `0 0 40px ${colors.primary}60`,
              }}
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <UserCheck size={32} className="text-white" />
            </motion.div>

            <motion.h2 
              className="text-3xl sm:text-4xl font-bold leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Complete Your<br />
              <span style={{ color: colors.primary }}>Profile</span>
            </motion.h2>
            
            <motion.p 
              className="text-lg" 
              style={{ color: colors.textSecondary }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              We need a few more details to set up your account and keep you updated with class activities.
            </motion.p>
          </div>

          {/* Why we need this */}
          <div className="space-y-4">
            <motion.h3 
              className="font-semibold text-sm" 
              style={{ color: colors.textSecondary }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              WHY WE NEED THIS INFO
            </motion.h3>
            {[
              { label: 'Email', desc: 'Payment receipts & notifications' },
              { label: 'Phone', desc: 'Emergency updates & reminders' },
              { label: 'Section', desc: 'Section-specific announcements' },
            ].map((item, i) => (
              <motion.div 
                key={i} 
                className="flex items-start gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
              >
                <div
                  className="w-2 h-2 rounded-full mt-1.5"
                  style={{ background: colors.accentMint }}
                />
                <div>
                  <p className="font-medium text-sm">{item.label}</p>
                  <p className="text-sm" style={{ color: colors.textSecondary }}>{item.desc}</p>
                </div>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right Side - Profile Form */}
        <motion.div 
          className="w-full"
          initial={{ opacity: 0, x: 50 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ delay: 0.3, duration: 0.6 }}
        >
          {/* Mobile Header */}
          <motion.div 
            className="flex lg:hidden flex-col items-center mb-8"
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <motion.div
              className="w-16 h-16 rounded-2xl flex items-center justify-center mb-4"
              style={{
                background: gradients.primary,
                boxShadow: `0 0 40px ${colors.primary}60`,
              }}
              whileHover={{ scale: 1.05, rotate: 5 }}
              transition={{ type: 'spring', stiffness: 300 }}
            >
              <User size={32} className="text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold">Complete Profile</h1>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
              Just a few more details
            </p>
          </motion.div>

          {/* Form Card */}
          <div
            className="relative backdrop-blur-xl rounded-3xl p-6 sm:p-8 border"
            style={{
              background: 'rgba(15, 7, 3, 0.6)',
              borderColor: 'rgba(255, 104, 3, 0.2)',
              boxShadow: `
                0 0 0 1px rgba(255, 104, 3, 0.1),
                0 20px 50px -12px rgba(0, 0, 0, 0.8),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.05)
              `,
            }}
          >
            <h2 className="text-2xl font-bold mb-6">Your Information</h2>

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
                This information will only be used for class-related communications and payment verification.
              </p>
            </motion.div>

            {/* General Error Message */}
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

            {/* Form */}
            <motion.form 
              onSubmit={handleSubmit} 
              className="space-y-5"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.6 }}
            >
              {/* Email & Phone - Side by Side on Desktop */}
              <motion.div 
                className="grid md:grid-cols-2 gap-5"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 }}
              >
                <Input
                  label="Email Address"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  placeholder="your.email@example.com"
                  required
                  icon={<Mail size={20} />}
                  fullWidth
                  error={errors.email}
                />

                <Input
                  label="Phone Number"
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => handleChange('phone', e.target.value)}
                  placeholder="08012345678"
                  required
                  icon={<Phone size={20} />}
                  fullWidth
                  error={errors.phone}
                />
              </motion.div>

              {/* Section */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                <Select
                  label="Section"
                value={formData.section}
                onChange={(e) => handleChange('section', e.target.value)}
                required
                fullWidth
                error={errors.section}
                options={SECTIONS.map((section: string) => ({
                  value: section,
                  label: section
                }))}
                  placeholder="Select your section"
                />
              </motion.div>

              {/* Matric Number (if needed) */}
              {needsMatricUpdate && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 }}
                >
                  <Input
                    label="Matric Number"
                    type="text"
                    value={formData.reg_number}
                    onChange={(e) => handleChange('reg_number', e.target.value)}
                    placeholder="e.g., 2024/274804"
                    required
                    icon={<User size={20} />}
                    fullWidth
                    error={errors.reg_number}
                  />
                  <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                    You were imported with a temporary ID. Please enter your official matric number.
                  </p>
                </motion.div>
              )}

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0 }}
              >
                <Button
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={loading}
                  disabled={loading}
                  className="py-4 text-base font-semibold mt-6"
                >
                  {loading ? 'Saving...' : 'Continue to Dashboard'}
                </Button>
              </motion.div>
            </motion.form>

            {/* Privacy Notice */}
            <motion.div 
              className="mt-6 p-4 rounded-xl" 
              style={{ background: 'rgba(255, 255, 255, 0.03)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
            >
              <p className="text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
                <strong>Privacy:</strong> Your information is stored securely and will not be shared with third parties. 
                It's only used for class management and communication purposes.
              </p>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>

      {/* Keyframes for animations */}
      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
