import { useState, useEffect } from 'react';
import { Lock, User, AlertCircle, Info } from 'lucide-react';
import CustomButton from '@/components/ui/CustomButton';
import Input from '@/components/ui/Input';
import Logo from '@/components/ui/Logo';
import { useAuth } from '@/hooks/useAuth';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import { useNavigate, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import PageWrapper from '@/components/ui/PageWrapper';

export default function LoginPage() {
  const [regNumber, setRegNumber] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { login, isAuthenticated, user, needsPasswordChange } = useAuth();
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);
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
      const result = await login(regNumber, password);
      
      // If user needs to change password (admin reset), redirect there
      if (result.mustChangePassword) {
        navigate('/change-password', { replace: true });
      } else {
        navigate('/dashboard', { replace: true });
      }
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Invalid credentials. Please try again.';
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
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
              <Logo size="xl" showText={true} variant="light" />
            </div>

            <motion.h2 
              className="text-3xl sm:text-4xl font-bold leading-tight"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Welcome Back<br />
              <span style={{ color: tk.primary }}>Member Portal</span>
            </motion.h2>
            
            <motion.p 
              className="text-lg" 
              style={{ color: tk.textSec }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Track payments, view history, and stay updated with your organization's finances.
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
                  style={{ background: tk.primary }}
                />
                <p style={{ color: tk.textSec }}>{feature}</p>
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
            <Logo size="xl" showText={true} variant="light" className="flex-col items-center text-center" />
            <p className="text-sm mt-2" style={{ color: tk.textSec }}>
              Payment Management
            </p>
          </motion.div>

          {/* Login Card */}
          <motion.div
            className="relative backdrop-blur-xl rounded-3xl p-6 sm:p-8 border"
            style={{
              background: theme === 'light' ? 'rgba(255,255,255,0.88)' : 'rgba(15, 7, 3, 0.6)',
              borderColor: tk.primaryRing,
              boxShadow: `
                0 0 0 1px ${theme === 'light' ? 'rgba(15, 7, 3, 0.06)' : 'rgba(255, 104, 3, 0.1)'},
                0 20px 50px -12px ${theme === 'light' ? 'rgba(15, 7, 3, 0.15)' : 'rgba(0, 0, 0, 0.8)'},
                inset 0 1px 0 0 ${theme === 'light' ? 'rgba(255, 255, 255, 0.45)' : 'rgba(255, 255, 255, 0.05)'}
              `,
            }}
          >
            <h2 className="text-2xl font-bold mb-6" style={{ color: tk.text }}>Sign In</h2>

            {/* Info Banner */}
            <motion.div
              className="flex items-start gap-3 p-4 rounded-xl mb-6"
              style={{
                background: `${tk.mint}12`,
                border: `1px solid ${tk.mint}40`,
              }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Info size={18} style={{ color: tk.mint, marginTop: 2 }} />
              <p className="text-xs leading-relaxed" style={{ color: tk.mint }}>
                First time? Use your login ID as both username and password. You'll be prompted to change it.
              </p>
            </motion.div>

            {/* Error Message */}
            <AnimatePresence>
              {error && (
                <motion.div
                  className="flex items-start gap-3 p-4 rounded-xl mb-6"
                  style={{
                    background: `${tk.danger}14`,
                    border: `1px solid ${tk.danger}40`,
                  }}
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  transition={{ duration: 0.3 }}
                >
                  <AlertCircle size={20} style={{ color: tk.danger, marginTop: 2 }} />
                  <p className="text-sm leading-relaxed" style={{ color: tk.danger }}>
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
                  label="Login ID / Registration Number"
                  type="text"
                  value={regNumber}
                  onChange={(e) => setRegNumber(e.target.value)}
                  placeholder="e.g., 2024/274804 or member ID"
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
                <div className="text-right mt-2">
                  <Link to="/forgot-password" className="text-sm underline hover:no-underline" style={{ color: tk.primary }}>
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
                  {loading ? "Signing in..." : "Sign In"}
                </CustomButton>
              </motion.div>
            </motion.form>

            {/* Footer Text */}
            <motion.div 
              className="mt-6 text-center space-y-3"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              <p className="text-xs" style={{ color: tk.textSec }}>
                Having trouble logging in?{' '}
                <button
                  type="button"
                  className="underline hover:no-underline transition-all"
                  style={{ color: tk.mint }}
                  onClick={() => {
                    setError('');
                    const helpEl = document.getElementById('login-help-info');
                    if (helpEl) { helpEl.style.display = helpEl.style.display === 'none' ? 'flex' : 'none'; }
                  }}
                >
                  Get help
                </button>
              </p>
              <AnimatePresence>
                <motion.div
                  id="login-help-info"
                  className="flex items-start gap-3 p-3 rounded-xl mt-3"
                  style={{
                    display: 'none',
                    background: `${tk.mint}12`,
                    border: `1px solid ${tk.mint}33`,
                  }}
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                >
                  <Info size={16} style={{ color: tk.mint, marginTop: 2, flexShrink: 0 }} />
                  <p className="text-xs leading-relaxed" style={{ color: tk.mint }}>
                    Please contact your organization representative for login assistance. Your default password is usually your login ID.
                  </p>
                </motion.div>
              </AnimatePresence>
              <p className="text-[10px]" style={{ color: tk.textSec }}>
                Developed by{' '}
                <a 
                  href="https://x.com/wishotstudio?s=21" 
                  target="_blank" 
                  rel="noopener noreferrer"
                  className="font-bold hover:underline"
                  style={{ color: tk.primary }}
                >
                  Dev_Wishot
                </a>
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
    </PageWrapper>
  );
};
