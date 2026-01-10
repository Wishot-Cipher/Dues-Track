import { useState } from "react";
import { Mail, ArrowLeft, CheckCircle, AlertCircle, Send, Info } from "lucide-react";
import { colors, gradients } from "@/config/colors";
import CustomButton from "@/components/ui/CustomButton";
import Input from "@/components/ui/Input";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import PageWrapper from "@/components/ui/PageWrapper";
import { supabase } from "@/config/supabase";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [loading, setLoading] = useState(false);
  const [debugInfo, setDebugInfo] = useState("");
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setDebugInfo("");
    setLoading(true);

    try {
      // Validate email format
      if (!email || !email.includes("@")) {
        throw new Error("Please enter a valid email address");
      }

      const emailLower = email.trim().toLowerCase();
      
      // Log attempt
      console.log("🔍 Attempting password reset for:", emailLower);
      setDebugInfo(`Checking email: ${emailLower}...`);

      // Check if email exists in students table
      const { data: studentData, error: studentError } = await supabase
        .from("students")
        .select("id, reg_number, full_name, email")
        .ilike("email", emailLower)
        .maybeSingle();

      console.log("📧 Student lookup result:", { studentData, studentError });

      if (studentError) {
        console.error("❌ Student lookup error:", studentError);
        setDebugInfo(`Error looking up student: ${studentError.message}`);
      }

      if (!studentData) {
        console.log("⚠️ No student found with email:", emailLower);
        throw new Error("No account found with this email address. Please check your email or contact your class representative.");
      }

      console.log("✅ Found student:", studentData.full_name);
      setDebugInfo(`Found student: ${studentData.full_name}. Sending reset email...`);

      // Send password reset email
      const { data: resetData, error: resetError } = await supabase.auth.resetPasswordForEmail(
        emailLower,
        {
          redirectTo: `${window.location.origin}/reset-password`,
        }
      );

      console.log("📤 Reset email result:", { resetData, resetError });

      if (resetError) {
        console.error("❌ Reset email error:", resetError);
        throw new Error(`Failed to send reset email: ${resetError.message}`);
      }

      console.log("✅ Reset email sent successfully!");
      setSuccess(true);
    } catch (err: unknown) {
      console.error("❌ Error in password reset:", err);
      const errorMessage =
        err instanceof Error
          ? err.message
          : "Failed to send reset email. Please try again.";
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

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

            <h2 className="text-2xl font-bold mb-3">Check Your Email</h2>
            <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
              We've sent a password reset link to <strong>{email}</strong>
            </p>

            <div
              className="p-4 rounded-xl mb-6 text-left"
              style={{
                background: "rgba(255, 255, 255, 0.03)",
                border: "1px solid rgba(255, 255, 255, 0.1)",
              }}
            >
              <p className="text-xs leading-relaxed" style={{ color: colors.textSecondary }}>
                <strong>Next steps:</strong>
                <br />
                1. Check your email inbox (and spam folder)
                <br />
                2. Click the reset link in the email
                <br />
                3. Create a new password
                <br />
                4. Sign in with your new password
              </p>
            </div>

            <div
              className="p-4 rounded-xl mb-6 text-left"
              style={{
                background: `${colors.warning}10`,
                border: `1px solid ${colors.warning}30`,
              }}
            >
              <p className="text-xs leading-relaxed" style={{ color: colors.warning }}>
                <strong>⚠️ Email not arriving?</strong>
                <br />
                • Wait 3-5 minutes (Supabase can be slow)
                <br />
                • Check your spam/junk folder
                <br />
                • Check browser console (F12) for errors
                <br />
                • Email from: noreply@mail.app.supabase.io
              </p>
            </div>

            <CustomButton
              variant="primary"
              fullWidth
              onClick={() => navigate("/login")}
              className="mb-4"
            >
              Back to Login
            </CustomButton>

            <p className="text-xs" style={{ color: colors.textSecondary }}>
              Didn't receive an email?{" "}
              <button
                onClick={() => setSuccess(false)}
                className="underline hover:no-underline"
                style={{ color: colors.primary }}
              >
                Try again
              </button>
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
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.2 }}
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
              <Mail size={32} className="text-white" />
            </motion.div>

            <motion.h2
              className="text-3xl sm:text-4xl font-bold leading-tight"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.4 }}
            >
              Reset Your
              <br />
              <span style={{ color: colors.primary }}>Password</span>
            </motion.h2>

            <motion.p
              className="text-lg"
              style={{ color: colors.textSecondary }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              Enter your registered email address and we'll send you a link to
              reset your password.
            </motion.p>
          </div>

          {/* Info Points */}
          <div className="space-y-4">
            {[
              "Quick and secure process",
              "Reset link valid for 1 hour",
              "Email sent instantly",
              "Check spam folder if needed",
            ].map((point, i) => (
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
                <p style={{ color: colors.textSecondary }}>{point}</p>
              </motion.div>
            ))}
          </div>
        </motion.div>

        {/* Right Side - Form */}
        <motion.div
          className="w-full"
          initial={{ opacity: 0, x: 30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.7, delay: 0.3 }}
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
              <Mail size={32} className="text-white" />
            </motion.div>
            <h1 className="text-3xl font-bold">Forgot Password</h1>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
              Reset your account password
            </p>
          </motion.div>

          {/* Form Card */}
          <motion.div
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
            {/* Back Button */}
            <Link
              to="/login"
              className="inline-flex items-center gap-2 text-sm mb-6 hover:gap-3 transition-all"
              style={{ color: colors.textSecondary }}
            >
              <ArrowLeft size={16} />
              Back to Login
            </Link>

            <h2 className="text-2xl font-bold mb-6">Reset Password</h2>

            {/* Info Banner */}
            <motion.div
              className="flex items-start gap-3 p-4 rounded-xl mb-6"
              style={{
                background: `${colors.accentCyan}10`,
                border: `1px solid ${colors.accentCyan}30`,
              }}
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.5 }}
            >
              <Info size={18} style={{ color: colors.accentCyan, marginTop: 2 }} />
              <p className="text-xs leading-relaxed" style={{ color: colors.accentCyan }}>
                Enter the email address you used when registering. Check browser console (F12) for detailed debug info.
              </p>
            </motion.div>

            {/* Debug Info */}
            {debugInfo && (
              <motion.div
                className="flex items-start gap-3 p-4 rounded-xl mb-6"
                style={{
                  background: `${colors.accentMint}10`,
                  border: `1px solid ${colors.accentMint}30`,
                }}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
              >
                <Info size={20} style={{ color: colors.accentMint, marginTop: 2 }} />
                <p className="text-sm leading-relaxed" style={{ color: colors.accentMint }}>
                  {debugInfo}
                </p>
              </motion.div>
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
                  label="Email Address"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="your.email@example.com"
                  required
                  icon={<Mail size={20} />}
                  fullWidth
                  autoComplete="email"
                />
                <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                  We'll send a password reset link to this email
                </p>
              </motion.div>

              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.8 }}
              >
                <CustomButton
                  type="submit"
                  variant="primary"
                  fullWidth
                  loading={loading}
                  disabled={loading}
                  className="py-4 text-base font-semibold mt-6"
                  icon={Send}
                >
                  {loading ? "Sending..." : "Send Reset Link"}
                </CustomButton>
              </motion.div>
            </motion.form>

            {/* Help Text */}
            <motion.div
              className="mt-6 text-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.9 }}
            >
              <p className="text-xs" style={{ color: colors.textSecondary }}>
                Remember your password?{" "}
                <Link
                  to="/login"
                  className="underline hover:no-underline"
                  style={{ color: colors.primary }}
                >
                  Sign in
                </Link>
              </p>
            </motion.div>

            {/* Contact Support */}
            <motion.div
              className="mt-6 p-4 rounded-xl"
              style={{ background: "rgba(255, 255, 255, 0.03)" }}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 1.0 }}
            >
              <p
                className="text-xs text-center"
                style={{ color: colors.textSecondary }}
              >
                Need help?{" "}
                <button
                  type="button"
                  className="underline hover:no-underline"
                  style={{ color: colors.primary }}
                  onClick={() =>
                    setError(
                      "Please contact your class representative for assistance with account recovery."
                    )
                  }
                >
                  Contact Support
                </button>
              </p>
            </motion.div>
          </motion.div>
        </motion.div>
      </motion.div>
    </PageWrapper>
  );
}