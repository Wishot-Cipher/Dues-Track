import { useState } from 'react';
import { Lock, CheckCircle, AlertCircle, Shield, Info } from 'lucide-react';
import { colors, gradients } from '@/config/colors';
import CustomButton from '@/components/ui/CustomButton';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function ChangePasswordPage() {
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();

  const validatePassword = () => {
    if (!currentPassword) {
      setError('Please enter your current password');
      return false;
    }
    if (!newPassword) {
      setError('Please enter a new password');
      return false;
    }
    if (newPassword.length < 8) {
      setError('New password must be at least 8 characters long');
      return false;
    }
    if (!confirmPassword) {
      setError('Please confirm your new password');
      return false;
    }
    if (newPassword !== confirmPassword) {
      setError('New password and confirmation do not match. Please try again.');
      return false;
    }
    if (newPassword === currentPassword) {
      setError('Your new password must be different from your current password');
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!validatePassword()) return;

    setLoading(true);
    try {
      if (!user?.id) {
        throw new Error('Session expired. Please log in again.');
      }
      
      await changePassword(user.id, currentPassword, newPassword);
      
      // Check if profile is complete, redirect accordingly
      if (user.email && user.phone && user.section) {
        navigate('/dashboard');
      } else {
        navigate('/complete-profile');
      }
    } catch (err: unknown) {
      let errorMessage = 'Failed to change password. Please try again.';
      
      if (err instanceof Error) {
        if (err.message.includes('Current password is incorrect')) {
          errorMessage = 'Your current password is incorrect. Please check and try again.';
        } else if (err.message.includes('Session')) {
          errorMessage = err.message;
        } else {
          errorMessage = err.message;
        }
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const passwordStrength = (password: string) => {
    let strength = 0;
    if (password.length >= 8) strength++;
    if (/[A-Z]/.test(password)) strength++;
    if (/[0-9]/.test(password)) strength++;
    if (/[^A-Za-z0-9]/.test(password)) strength++;
    return strength;
  };

  const strength = passwordStrength(newPassword);
  const strengthColors = [
    colors.statusUnpaid,
    colors.statusPartial,
    colors.accentMint,
    colors.statusPaid,
  ];
  const strengthLabels = ['Weak', 'Fair', 'Good', 'Strong'];

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
              <Shield size={32} className="text-white" />
            </motion.div>

            <motion.h2 
              className="text-3xl sm:text-4xl font-bold leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Secure Your<br />
              <span style={{ color: colors.primary }}>Account</span>
            </motion.h2>
            
            <motion.p 
              className="text-lg" 
              style={{ color: colors.textSecondary }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Create a strong, unique password to protect your class dues account.
            </motion.p>
          </div>

          {/* Password Tips */}
          <div className="space-y-4">
            <motion.h3 
              className="font-semibold text-sm" 
              style={{ color: colors.textSecondary }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              PASSWORD BEST PRACTICES
            </motion.h3>
            {[
              'Use at least 8 characters',
              'Mix uppercase and lowercase letters',
              'Include numbers and symbols',
              'Avoid personal information',
            ].map((tip, i) => (
              <motion.div 
                key={i} 
                className="flex items-center gap-3"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.6 + i * 0.1 }}
              >
                <div
                  className="w-2 h-2 rounded-full"
                  style={{ background: colors.accentMint }}
                />
                <p style={{ color: colors.textSecondary }}>{tip}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right Side - Change Password Form */}
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
              <Lock size={32} className="text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold">Change Password</h1>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
              Create a new secure password
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
            <h2 className="text-2xl font-bold mb-6">Set New Password</h2>

            {/* Info Tip for First-Time Users */}
            {user?.force_password_change && (
              <div
                className="flex items-start gap-3 p-4 rounded-xl mb-6"
                style={{
                  background: `${colors.accentMint}10`,
                  border: `1px solid ${colors.accentMint}30`,
                }}
              >
                <Info size={18} style={{ color: colors.accentMint, marginTop: 2 }} />
                <p className="text-xs leading-relaxed" style={{ color: colors.accentMint }}>
                  <strong>Tip:</strong> Your current password is the one you just used to log in
                  {user?.reg_number?.includes('/') ? ` (your registration number)` : ` (TEMP2024)`}.
                </p>
              </div>
            )}

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

            {/* Form */}
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
                  label="Current Password"
                  type="password"
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  placeholder="Enter current password"
                  required
                  icon={<Lock size={20} />}
                  fullWidth
                />
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
              >
                <Input
                  label="New Password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  required
                  icon={<Lock size={20} />}
                  fullWidth
                />

                {/* Password Strength Indicator */}
                {newPassword && (
                  <div className="mt-3">
                    <div className="flex gap-1 mb-2">
                      {[1, 2, 3, 4].map((level) => (
                        <div
                          key={level}
                          className="h-1.5 flex-1 rounded-full transition-all duration-300"
                          style={{
                            background:
                              strength >= level
                                ? strengthColors[strength - 1]
                                : 'rgba(255, 255, 255, 0.1)',
                          }}
                        />
                      ))}
                    </div>
                    <p
                      className="text-xs font-medium"
                      style={{ color: strength > 0 ? strengthColors[strength - 1] : colors.textSecondary }}
                    >
                      {strength > 0 ? `${strengthLabels[strength - 1]} password` : 'Enter password'}
                    </p>
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.9 }}
              >
                <Input
                  label="Confirm New Password"
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Re-enter new password"
                  required
                  icon={<Lock size={20} />}
                  fullWidth
                />
                {confirmPassword && (
                  <div className="flex items-center gap-2 mt-2">
                    {newPassword === confirmPassword ? (
                      <>
                        <CheckCircle size={16} style={{ color: colors.statusPaid }} />
                        <p className="text-xs font-medium" style={{ color: colors.statusPaid }}>
                          Passwords match
                        </p>
                      </>
                    ) : (
                      <>
                        <AlertCircle size={16} style={{ color: colors.statusUnpaid }} />
                        <p className="text-xs font-medium" style={{ color: colors.statusUnpaid }}>
                          Passwords do not match
                        </p>
                      </>
                    )}
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.0 }}
              >
                <CustomButton
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={loading}
                  disabled={loading}
                  className="py-4 text-base font-semibold mt-6"
                >
                  {loading ? 'Changing Password...' : 'Change Password'}
                </CustomButton>
              </motion.div>
            </motion.form>

            {/* Requirements */}
            <motion.div 
              className="mt-6 p-4 rounded-xl" 
              style={{ background: 'rgba(255, 255, 255, 0.03)' }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.1 }}
            >
              <p className="text-xs font-semibold mb-2" style={{ color: colors.textSecondary }}>
                PASSWORD REQUIREMENTS:
              </p>
              <ul className="text-xs space-y-1" style={{ color: colors.textSecondary }}>
                <li className="flex items-center gap-2">
                  <div className={`w-1 h-1 rounded-full ${newPassword.length >= 8 ? 'bg-green-400' : 'bg-gray-600'}`} />
                  At least 8 characters
                </li>
                <li className="flex items-center gap-2">
                  <div className={`w-1 h-1 rounded-full ${/[A-Z]/.test(newPassword) ? 'bg-green-400' : 'bg-gray-600'}`} />
                  Uppercase letter (recommended)
                </li>
                <li className="flex items-center gap-2">
                  <div className={`w-1 h-1 rounded-full ${/[0-9]/.test(newPassword) ? 'bg-green-400' : 'bg-gray-600'}`} />
                  Number (recommended)
                </li>
                <li className="flex items-center gap-2">
                  <div className={`w-1 h-1 rounded-full ${/[^A-Za-z0-9]/.test(newPassword) ? 'bg-green-400' : 'bg-gray-600'}`} />
                  Special character (recommended)
                </li>
              </ul>
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
