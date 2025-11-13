import { useState, useEffect } from 'react';
import { Zap, Lock, User, AlertCircle, Info } from 'lucide-react';
import { colors, gradients } from '@/config/colors';
import CustomButton from '@/components/ui/CustomButton';
import Input from '@/components/ui/Input';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';

export default function LoginPage() {
  const [regNumber, setRegNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated, user, needsPasswordChange } = useAuth();
  const navigate = useNavigate();

  // Redirect if already logged in
  useEffect(() => {
    if (isAuthenticated && user) {
      // Redirect based on user status
      if (needsPasswordChange) {
        navigate('/change-password', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    }
  }, [isAuthenticated, user, needsPasswordChange, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(regNumber, password);
      navigate('/dashboard');
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid credentials. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 lg:p-8" style={{
        background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)',
      }}>
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
        
        {/* ECE Logo Background - Creative Element */}
        <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none">
          <img 
            src="/Ece picture.jpg" 
            alt="ECE Background"
            className="w-full h-full object-contain"
            style={{
              filter: 'grayscale(0.5) brightness(0.8)',
              mixBlendMode: 'soft-light',
            }}
          />
        </div>
      </div>
      {/* Main Content Container */}
      <motion.div 
        className="relative w-full max-w-6xl grid lg:grid-cols-2 gap-8 items-center"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        {/* Left Side - Branding & Info */}
        <motion.div 
          className="hidden lg:block space-y-8"
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
        >
          <div className="space-y-4">
            <div className="flex items-center gap-3 mb-6">
              <motion.div
                className="w-16 h-16 rounded-2xl flex items-center justify-center"
                style={{
                  background: gradients.primary,
                  boxShadow: `0 0 40px ${colors.primary}60`,
                }}
                whileHover={{ scale: 1.05, rotate: 5 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                <Zap size={32} className="text-white" />
              </motion.div>
              <div>
                <h1 className="text-4xl font-bold bg-linear-to-r from-white to-gray-400 bg-clip-text text-transparent">
                  DuesTrack
                </h1>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Class Dues Management System
                </p>
              </div>
            </div>

            <motion.h2 
              className="text-3xl sm:text-4xl font-bold leading-tight"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Welcome Back to<br />
              <span style={{ color: colors.primary }}>ECE 200L</span>
            </motion.h2>
            
            <motion.p 
              className="text-lg" 
              style={{ color: colors.textSecondary }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Track your class dues, view payment history, and stay updated with class finances.
            </motion.p>
          </div>

          {/* Features List */}
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
                  style={{ background: colors.primary }}
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
          {/* Mobile Logo */}
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
            >
              <Zap size={32} className="text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold">DuesTrack</h1>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
              ECE 200L Dues Management
            </p>
          </motion.div>

          {/* Login Card */}
          <motion.div
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
            <h2 className="text-2xl font-bold mb-6">Sign In</h2>

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
                First time? Use your registration number as both username and password. You'll be prompted to change it.
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
                  label="Registration Number"
                  type="text"
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value)}
                  placeholder="e.g., 2024/274804"
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
                  {loading ? "Signing in..." : "Sign In"}
                </CustomButton>
              </motion.div>
            </motion.form>

            {/* Footer Text */}
            <motion.div 
              className="mt-6 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              <p className="text-xs" style={{ color: colors.textSecondary }}>
                Having trouble logging in?{' '}
                <button
                  type="button"
                  className="underline hover:no-underline transition-all"
                  style={{ color: colors.primary }}
                  onClick={() => setError('Please contact your class representative for assistance.')}
                >
                  Get help
                </button>
              </p>
            </motion.div>
          </motion.div>
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
};
