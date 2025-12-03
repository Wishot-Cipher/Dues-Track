import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  User, 
  Mail, 
  Phone, 
  Calendar,
  BookOpen,
  Edit2,
  Save,
  X,
  ArrowLeft,
  Shield,
  Wallet,
  Lock,
  CheckCircle2,
  AlertCircle,
  GraduationCap,
  Hash
} from 'lucide-react';
import Footer from '@/components/Footer';
import { colors, gradients } from '@/config/colors';
import { useAuth } from '@/hooks/useAuth';
import { useNavigate } from 'react-router-dom';
import GlassCard from '@/components/ui/GlassCard';
import Input from '@/components/ui/Input';
import CustomButton from '@/components/ui/CustomButton';
import { formatCurrency, formatDate } from '@/utils/formatters';
import paymentService from '@/services/paymentService';

export default function ProfilePage() {
  const { user, updateProfile } = useAuth();
  const navigate = useNavigate();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [paymentSummary, setPaymentSummary] = useState({
    totalPaid: 0,
    totalOutstanding: 0,
    totalPending: 0,
    completedPayments: 0,
    pendingPayments: 0,
  });
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    section: user?.section || '',
  });

  // Fetch payment summary
  useEffect(() => {
    const fetchPaymentSummary = async () => {
      if (!user?.id) return;

      try {
        const summary = await paymentService.getPaymentSummary(user.id);
        setPaymentSummary(summary);
      } catch (error) {
        // Error handling without console log
      }
    };

    fetchPaymentSummary();
  }, [user?.id]);

  const handleSave = async () => {
    try {
      setLoading(true);
      setMessage(null);
      await updateProfile(formData);
      setMessage({ type: 'success', text: 'Profile updated successfully!' });
      setIsEditing(false);
    } catch (error) {
      setMessage({ type: 'error', text: 'Failed to update profile. Please try again.' });
    } finally {
      setLoading(false);
    }
  };

  const handleCancel = () => {
    setFormData({
      full_name: user?.full_name || '',
      email: user?.email || '',
      phone: user?.phone || '',
      section: user?.section || '',
    });
    setMessage(null);
    setIsEditing(false);
  };

  return (
    <div 
      className="min-h-screen relative overflow-hidden"
      style={{
        background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)',
      }}
    >
      {/* Background Grid Pattern */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
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

      {/* Main Content */}
      <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Header */}
        <motion.div
          className="mb-6 sm:mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <div className="flex items-center gap-3 sm:gap-4">
              <motion.button
                onClick={() => navigate('/dashboard')}
                className="flex items-center justify-center px-3 py-2 rounded-lg transition-all duration-300 outline outline-1"
                style={{ 
                  color: colors.textSecondary,
                  outlineColor: colors.primary,
                  background: 'rgba(255, 107, 53, 0.1)'
                }}
                whileHover={{ scale: 1.05, background: 'rgba(255, 107, 53, 0.2)' }}
                whileTap={{ scale: 0.95 }}
              >
                <ArrowLeft size={20} style={{ color: colors.primary }} />
              </motion.button>
              <div>
                <h1 className="text-2xl sm:text-3xl font-bold text-white">My Profile</h1>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Manage your personal information and view payment summary
                </p>
              </div>
            </div>

            {!isEditing ? (
              <CustomButton
                variant="primary"
                size="sm"
                onClick={() => setIsEditing(true)}
                icon={Edit2}
                className="w-full sm:w-auto"
              >
                Edit Profile
              </CustomButton>
            ) : (
              <div className="flex items-center gap-2 w-full sm:w-auto">
                <CustomButton
                  variant="ghost"
                  size="sm"
                  onClick={handleCancel}
                  icon={X}
                  className="flex-1 sm:flex-none"
                >
                  Cancel
                </CustomButton>
                <CustomButton
                  variant="primary"
                  size="sm"
                  onClick={handleSave}
                  loading={loading}
                  icon={Save}
                  className="flex-1 sm:flex-none"
                >
                  Save Changes
                </CustomButton>
              </div>
            )}
          </div>

          {/* Success/Error Message */}
          {message && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-4 rounded-xl flex items-center gap-3"
              style={{
                background: message.type === 'success' 
                  ? 'rgba(34, 197, 94, 0.1)' 
                  : 'rgba(239, 68, 68, 0.1)',
                border: `1px solid ${message.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`
              }}
            >
              {message.type === 'success' ? (
                <CheckCircle2 size={20} className="text-green-400" />
              ) : (
                <AlertCircle size={20} className="text-red-400" />
              )}
              <p className={`text-sm font-medium ${message.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                {message.text}
              </p>
            </motion.div>
          )}
        </motion.div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
          {/* Left Column - Profile Card */}
          <motion.div
            className="lg:col-span-1"
            initial={{ opacity: 0, x: -20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.2 }}
          >
            <GlassCard className="text-center">
              {/* Avatar */}
              <motion.div
                className="w-24 h-24 sm:w-32 sm:h-32 mx-auto mb-4 sm:mb-6 rounded-full flex items-center justify-center text-3xl sm:text-4xl font-bold shadow-lg"
                style={{ background: gradients.primary }}
                whileHover={{ scale: 1.05 }}
                transition={{ type: "spring", stiffness: 300 }}
              >
                {user?.full_name?.charAt(0).toUpperCase() || 'U'}
              </motion.div>

              <h2 className="text-xl sm:text-2xl font-bold text-white mb-1">{user?.full_name}</h2>
              <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                {user?.reg_number}
              </p>

              {/* Role Badge */}
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
                style={{ background: `${colors.accentMint}20`, border: `1px solid ${colors.accentMint}40` }}
              >
                <Shield size={16} style={{ color: colors.accentMint }} />
                <span className="text-sm font-medium" style={{ color: colors.accentMint }}>
                  Student
                </span>
              </div>

              {/* Quick Stats */}
              <div className="space-y-3 pt-6 border-t" style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: colors.textSecondary }}>Status</span>
                  <span className="text-sm font-medium px-3 py-1 rounded-full" style={{ 
                    background: 'rgba(34, 197, 94, 0.2)',
                    color: '#22c55e'
                  }}>Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: colors.textSecondary }}>Level</span>
                  <span className="text-sm font-medium text-white">{user?.level || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: colors.textSecondary }}>Department</span>
                  <span className="text-sm font-medium text-white">{user?.department || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: colors.textSecondary }}>Section</span>
                  <span className="text-sm font-medium text-white">{user?.section || 'Not set'}</span>
                </div>
              </div>
            </GlassCard>

            {/* Payment Summary Card - Mobile */}
            <motion.div
              className="mt-4 lg:hidden"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${colors.primary}20` }}
                  >
                    <Wallet size={20} style={{ color: colors.primary }} />
                  </div>
                  <h3 className="text-base font-bold text-white">Payment Summary</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-3 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Total Paid
                    </p>
                    <p className="text-lg font-bold text-white">
                      {formatCurrency(paymentSummary.totalPaid)}
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>
                      {paymentSummary.completedPayments} payment{paymentSummary.completedPayments !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)' }}>
                    <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Outstanding
                    </p>
                    <p className="text-lg font-bold" style={{ color: colors.warning }}>
                      {formatCurrency(paymentSummary.totalOutstanding)}
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>
                      {paymentSummary.pendingPayments} pending
                    </p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>

          {/* Right Column - Details */}
          <motion.div
            className="lg:col-span-2 space-y-4 sm:space-y-6"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            {/* Personal Information Section */}
            <GlassCard>
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg sm:text-xl font-bold text-white">Personal Information</h3>
                {!isEditing && (
                  <div className="flex items-center gap-2 text-xs px-3 py-1 rounded-full" 
                    style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textSecondary }}>
                    <Lock size={12} />
                    <span>Some fields are read-only</span>
                  </div>
                )}
              </div>

              <div className="space-y-4">
                {/* READ-ONLY: Registration Number */}
                <motion.div
                  className="p-4 rounded-xl border"
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderColor: 'rgba(255, 255, 255, 0.1)'
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${colors.primary}15` }}
                    >
                      <Hash size={18} style={{ color: colors.primary }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                          Registration Number
                        </p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" 
                          style={{ background: 'rgba(255, 255, 255, 0.1)', color: colors.textSecondary }}>
                          Read-only
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white truncate">{user?.reg_number}</p>
                    </div>
                  </div>
                </motion.div>

                {/* EDITABLE: Full Name */}
                {isEditing ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <Input
                      label="Full Name"
                      type="text"
                      value={formData.full_name}
                      onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                      icon={<User size={20} />}
                      placeholder="Enter your full name"
                      fullWidth
                      required
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    className="p-4 rounded-xl border"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderColor: 'rgba(255, 255, 255, 0.1)'
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${colors.accentMint}15` }}
                      >
                        <User size={18} style={{ color: colors.accentMint }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                          Full Name
                        </p>
                        <p className="text-sm font-semibold text-white truncate">{user?.full_name}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* EDITABLE: Email */}
                {isEditing ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    <Input
                      label="Email Address"
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      icon={<Mail size={20} />}
                      placeholder="your.email@example.com"
                      fullWidth
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    className="p-4 rounded-xl border"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderColor: 'rgba(255, 255, 255, 0.1)'
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${colors.statusPaid}15` }}
                      >
                        <Mail size={18} style={{ color: colors.statusPaid }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                          Email Address
                        </p>
                        <p className="text-sm font-semibold text-white truncate">{user?.email || 'Not set'}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* EDITABLE: Phone */}
                {isEditing ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    <Input
                      label="Phone Number"
                      type="tel"
                      value={formData.phone}
                      onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                      icon={<Phone size={20} />}
                      placeholder="+234 XXX XXX XXXX"
                      fullWidth
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    className="p-4 rounded-xl border"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderColor: 'rgba(255, 255, 255, 0.1)'
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${colors.warning}15` }}
                      >
                        <Phone size={18} style={{ color: colors.warning }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                          Phone Number
                        </p>
                        <p className="text-sm font-semibold text-white truncate">{user?.phone || 'Not set'}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* EDITABLE: Section */}
                {isEditing ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                  >
                    <Input
                      label="Section"
                      type="text"
                      value={formData.section}
                      onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                      icon={<BookOpen size={20} />}
                      placeholder="e.g., A, B, C"
                      fullWidth
                    />
                  </motion.div>
                ) : (
                  <motion.div
                    className="p-4 rounded-xl border"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.02)',
                      borderColor: 'rgba(255, 255, 255, 0.1)'
                    }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                        style={{ background: `${colors.primary}15` }}
                      >
                        <BookOpen size={18} style={{ color: colors.primary }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                          Section
                        </p>
                        <p className="text-sm font-semibold text-white truncate">{user?.section || 'Not set'}</p>
                      </div>
                    </div>
                  </motion.div>
                )}

                {/* READ-ONLY: Level */}
                <motion.div
                  className="p-4 rounded-xl border"
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderColor: 'rgba(255, 255, 255, 0.1)'
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.9 }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${colors.accentMint}15` }}
                    >
                      <GraduationCap size={18} style={{ color: colors.accentMint }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                          Current Level
                        </p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" 
                          style={{ background: 'rgba(255, 255, 255, 0.1)', color: colors.textSecondary }}>
                          Read-only
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white">{user?.level || 'N/A'}</p>
                    </div>
                  </div>
                </motion.div>

                {/* READ-ONLY: Member Since */}
                <motion.div
                  className="p-4 rounded-xl border"
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderColor: 'rgba(255, 255, 255, 0.1)'
                  }}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 1.0 }}
                >
                  <div className="flex items-start gap-3">
                    <div
                      className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                      style={{ background: `${colors.statusPaid}15` }}
                    >
                      <Calendar size={18} style={{ color: colors.statusPaid }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1">
                        <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                          Member Since
                        </p>
                        <span className="text-[10px] px-2 py-0.5 rounded-full" 
                          style={{ background: 'rgba(255, 255, 255, 0.1)', color: colors.textSecondary }}>
                          Read-only
                        </span>
                      </div>
                      <p className="text-sm font-semibold text-white">
                        {user?.created_at ? formatDate(user.created_at, 'long') : 'N/A'}
                      </p>
                    </div>
                  </div>
                </motion.div>
              </div>

              {/* Help Text */}
              {isEditing && (
                <motion.div
                  className="mt-4 p-3 rounded-lg flex items-start gap-2"
                  style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                >
                  <AlertCircle size={16} className="text-blue-400 flex-shrink-0 mt-0.5" />
                  <p className="text-xs text-blue-400">
                    You can update your full name, email, phone number, and section. 
                    Your registration number, level, and join date cannot be changed.
                  </p>
                </motion.div>
              )}
            </GlassCard>

            {/* Payment Summary Card - Desktop */}
            <motion.div
              className="hidden lg:block"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.1 }}
            >
              <GlassCard>
                <div className="flex items-center gap-3 mb-4">
                  <div
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${colors.primary}20` }}
                  >
                    <Wallet size={20} style={{ color: colors.primary }} />
                  </div>
                  <h3 className="text-base sm:text-lg font-bold text-white">Payment Summary</h3>
                </div>
                
                <div className="grid grid-cols-2 gap-4">
                  <div className="p-4 rounded-xl border" style={{ 
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderColor: 'rgba(34, 197, 94, 0.3)' 
                  }}>
                    <div className="flex items-center gap-2 mb-2">
                      <CheckCircle2 size={16} className="text-green-400" />
                      <p className="text-xs font-medium text-green-400">
                        Total Paid
                      </p>
                    </div>
                    <p className="text-2xl font-bold text-white mb-1">
                      {formatCurrency(paymentSummary.totalPaid)}
                    </p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                      {paymentSummary.completedPayments} completed payment{paymentSummary.completedPayments !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="p-4 rounded-xl border" style={{ 
                    background: 'rgba(255, 255, 255, 0.02)',
                    borderColor: 'rgba(251, 146, 60, 0.3)'
                  }}>
                    <div className="flex items-center gap-2 mb-2">
                      <AlertCircle size={16} style={{ color: colors.warning }} />
                      <p className="text-xs font-medium" style={{ color: colors.warning }}>
                        Outstanding
                      </p>
                    </div>
                    <p className="text-2xl font-bold" style={{ color: colors.warning }}>
                      {formatCurrency(paymentSummary.totalOutstanding)}
                    </p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                      {paymentSummary.pendingPayments} pending payment{paymentSummary.pendingPayments !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          </motion.div>
        </div>
      </div>
      <Footer />
    </div>
  );
}
