 
import { useState, useEffect } from "react";
import { Lock, CheckCircle, AlertCircle, Shield } from "lucide-react";
import { colors, gradients } from "@/config/colors";
import CustomButton from "@/components/ui/CustomButton";
import Input from "@/components/ui/Input";
import { useNavigate} from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageWrapper from "@/components/ui/PageWrapper";

export default function ResetPasswordPage() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [validatingToken, setValidatingToken] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    // Read token from URL
    const params = new URLSearchParams(window.location.search);
    const t = params.get('token');
    if (!t) {
      setError('Invalid reset link. No token provided.');
      setValidatingToken(false);
      return;
    }
    setToken(t);
    setValidatingToken(false);
  }, []);

  const validatePassword = () => {
    if (!newPassword) {
      setError("Please enter a new password");
      return false;
    }
    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters long");
      return false;
    }
    if (!confirmPassword) {
      setError("Please confirm your new password");
      return false;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return false;
    }
    return true;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!validatePassword()) return;

    setLoading(true);
    try {
      if (!token) {
        setError('Missing reset token.');
        return;
      }

      const resp = await fetch('/api/password/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, newPassword }),
      });

      const body = await resp.json().catch(() => ({}));
      if (!resp.ok) {
        throw new Error(body.error || 'Failed to reset password');
      }

      setSuccess(true);
      setTimeout(() => navigate('/login'), 2500);
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to reset password. Please try again.";
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
  const strengthLabels = ["Weak", "Fair", "Good", "Strong"];

  if (validatingToken) {
    return (
      <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
        <motion.div
          className="flex flex-col items-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <div
            className="w-16 h-16 rounded-full border-4 border-t-transparent animate-spin"
            style={{ borderColor: colors.primary }}
          />
          <p style={{ color: colors.textSecondary }}>Validating reset link...</p>
        </motion.div>
      </PageWrapper>
    );
  }

  if (success) {
    return (
      <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
        <motion.div
          className="w-full max-w-md"
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5 }}
        >
          <div
            className="backdrop-blur-xl rounded-3xl p-8 border text-center"
            style={{
              background: "rgba(15, 7, 3, 0.6)",
              borderColor: "rgba(255, 104, 3, 0.2)",
              boxShadow: `
                0 0 0 1px rgba(255, 104, 3, 0.1),
                0 20px 50px -12px rgba(0, 0, 0, 0.8),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.05)
              `,
            }}
          >
            <motion.div
              className="w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6"
              style={{
                background: `${colors.accentMint}20`,
                border: `2px solid ${colors.accentMint}`,
              }}
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
            >
              <CheckCircle size={40} style={{ color: colors.accentMint }} />
            </motion.div>

            <h2 className="text-2xl font-bold mb-3">Password Reset Successful!</h2>
            <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
              Your password has been changed successfully. You can now sign in with your new password.
            </p>

            <CustomButton
              variant="primary"
              fullWidth
              onClick={() => navigate("/login")}
            >
              Continue to Login
            </CustomButton>

            <p className="text-xs mt-4" style={{ color: colors.textSecondary }}>
              Redirecting automatically in 3 seconds...
            </p>
          </div>
        </motion.div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper centered noPadding className="p-4 sm:p-6 lg:p-8">
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
              transition={{ type: "spring", stiffness: 300 }}
            >
              <Shield size={32} className="text-white" />
            </motion.div>

            <motion.h2
              className="text-3xl sm:text-4xl font-bold leading-tight"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              Create Your New
              <br />
              <span style={{ color: colors.primary }}>Password</span>
            </motion.h2>

            <motion.p
              className="text-lg"
              style={{ color: colors.textSecondary }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Choose a strong, unique password to secure your account.
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
              "Use at least 8 characters",
              "Mix uppercase and lowercase letters",
              "Include numbers and symbols",
              "Avoid personal information",
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

        {/* Right Side - Reset Form */}
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
            >
              <Lock size={32} className="text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold">Reset Password</h1>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
              Create a new secure password
            </p>
          </motion.div>

          {/* Form Card */}
          <div
            className="relative backdrop-blur-xl rounded-3xl p-6 sm:p-8 border"
            style={{
              background: "rgba(15, 7, 3, 0.6)",
              borderColor: "rgba(255, 104, 3, 0.2)",
              boxShadow: `
                0 0 0 1px rgba(255, 104, 3, 0.1),
                0 20px 50px -12px rgba(0, 0, 0, 0.8),
                inset 0 1px 0 0 rgba(255, 255, 255, 0.05)
              `,
            }}
          >
            <h2 className="text-2xl font-bold mb-6">Set New Password</h2>

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
                  <AlertCircle
                    size={20}
                    style={{ color: colors.statusUnpaid, marginTop: 2 }}
                  />
                  <p
                    className="text-sm leading-relaxed"
                    style={{ color: colors.statusUnpaid }}
                  >
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
                                : "rgba(255, 255, 255, 0.1)",
                          }}
                        />
                      ))}
                    </div>
                    <p
                      className="text-xs font-medium"
                      style={{
                        color:
                          strength > 0
                            ? strengthColors[strength - 1]
                            : colors.textSecondary,
                      }}
                    >
                      {strength > 0
                        ? `${strengthLabels[strength - 1]} password`
                        : "Enter password"}
                    </p>
                  </div>
                )}
              </motion.div>

              <motion.div
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.8 }}
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
                        <CheckCircle
                          size={16}
                          style={{ color: colors.statusPaid }}
                        />
                        <p
                          className="text-xs font-medium"
                          style={{ color: colors.statusPaid }}
                        >
                          Passwords match
                        </p>
                      </>
                    ) : (
                      <>
                        <AlertCircle
                          size={16}
                          style={{ color: colors.statusUnpaid }}
                        />
                        <p
                          className="text-xs font-medium"
                          style={{ color: colors.statusUnpaid }}
                        >
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
                  {loading ? "Resetting Password..." : "Reset Password"}
                </CustomButton>
              </motion.div>
            </motion.form>

            {/* Requirements */}
            <motion.div
              className="mt-6 p-4 rounded-xl"
              style={{ background: "rgba(255, 255, 255, 0.03)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              <p
                className="text-xs font-semibold mb-2"
                style={{ color: colors.textSecondary }}
              >
                PASSWORD REQUIREMENTS:
              </p>
              <ul
                className="text-xs space-y-1"
                style={{ color: colors.textSecondary }}
              >
                <li className="flex items-center gap-2">
                  <div
                    className={`w-1 h-1 rounded-full ${
                      newPassword.length >= 8 ? "bg-green-400" : "bg-gray-600"
                    }`}
                  />
                  At least 8 characters
                </li>
                <li className="flex items-center gap-2">
                  <div
                    className={`w-1 h-1 rounded-full ${
                      /[A-Z]/.test(newPassword) ? "bg-green-400" : "bg-gray-600"
                    }`}
                  />
                  Uppercase letter (recommended)
                </li>
                <li className="flex items-center gap-2">
                  <div
                    className={`w-1 h-1 rounded-full ${
                      /[0-9]/.test(newPassword) ? "bg-green-400" : "bg-gray-600"
                    }`}
                  />
                  Number (recommended)
                </li>
                <li className="flex items-center gap-2">
                  <div
                    className={`w-1 h-1 rounded-full ${
                      /[^A-Za-z0-9]/.test(newPassword)
                        ? "bg-green-400"
                        : "bg-gray-600"
                    }`}
                  />
                  Special character (recommended)
                </li>
              </ul>
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </PageWrapper>
  );
}