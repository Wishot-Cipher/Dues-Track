import { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
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
  Wallet
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
        console.error('Error fetching payment summary:', error);
      }
    };

    fetchPaymentSummary();
  }, [user?.id]);

  const handleSave = async () => {
    try {
      setLoading(true);
      await updateProfile(formData);
      setIsEditing(false);
    } catch (error) {
      console.error('Update error:', error);
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
        
        {/* ECE Logo Background - Creative Element */}
        <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none">
          <img 
            src="/Ece picture.jpg" 
            alt="ECE Background"
            className="w-full h-full object-contain"
            style={{
              filter: 'grayscale(0.7) brightness(0.9)',
              mixBlendMode: 'soft-light',
            }}
          />
        </div>
      </div>

      {/* Main Content */}
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
        {/* Header */}
        <motion.div
          className="mb-6 sm:mb-8 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <div className="flex items-center gap-3 sm:gap-4">
            <motion.button
              onClick={() => navigate('/dashboard')}
              className="p-2 rounded-xl transition-colors"
              style={{ background: 'rgba(255, 255, 255, 0.05)' }}
              whileHover={{ background: 'rgba(255, 255, 255, 0.1)' }}
            >
              <ArrowLeft size={20} style={{ color: colors.textPrimary }} />
            </motion.button>
            <div>
              <h1 className="text-2xl sm:text-3xl font-bold text-white">Profile</h1>
              <p className="text-sm" style={{ color: colors.textSecondary }}>Manage your personal information</p>
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
                Save
              </CustomButton>
            </div>
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
                className="w-32 h-32 mx-auto mb-6 rounded-full flex items-center justify-center text-4xl font-bold"
                style={{ background: gradients.primary }}
                whileHover={{ scale: 1.05 }}
              >
                {user?.full_name?.charAt(0) || 'U'}
              </motion.div>

              <h2 className="text-2xl font-bold text-white mb-1">{user?.full_name}</h2>
              <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                {user?.reg_number}
              </p>

              {/* Role Badge */}
              <div
                className="inline-flex items-center gap-2 px-4 py-2 rounded-full mb-6"
                style={{ background: `${colors.accentMint}20` }}
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
                  <span className="text-sm font-medium text-white">Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: colors.textSecondary }}>Level</span>
                  <span className="text-sm font-medium text-white">{user?.level || 'N/A'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm" style={{ color: colors.textSecondary }}>Section</span>
                  <span className="text-sm font-medium text-white">{user?.section || 'N/A'}</span>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Right Column - Details */}
          <motion.div
            className="lg:col-span-2"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: 0.3 }}
          >
            <GlassCard>
              <h3 className="text-xl font-bold text-white mb-6">Personal Information</h3>

              {isEditing ? (
                <div className="space-y-5">
                  <Input
                    label="Full Name"
                    type="text"
                    value={formData.full_name}
                    onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
                    icon={<User size={20} />}
                    fullWidth
                  />

                  <Input
                    label="Email Address"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    icon={<Mail size={20} />}
                    fullWidth
                  />

                  <Input
                    label="Phone Number"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    icon={<Phone size={20} />}
                    fullWidth
                  />

                  <Input
                    label="Section"
                    type="text"
                    value={formData.section}
                    onChange={(e) => setFormData({ ...formData, section: e.target.value })}
                    icon={<BookOpen size={20} />}
                    fullWidth
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* Registration Number */}
                  <motion.div
                    className="flex items-center gap-4 p-4 rounded-xl"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.4 }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `${colors.primary}20` }}
                    >
                      <User size={20} style={{ color: colors.primary }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                        Registration Number
                      </p>
                      <p className="text-sm font-semibold text-white">{user?.reg_number}</p>
                    </div>
                  </motion.div>

                  {/* Full Name */}
                  <motion.div
                    className="flex items-center gap-4 p-4 rounded-xl"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.5 }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `${colors.accentMint}20` }}
                    >
                      <User size={20} style={{ color: colors.accentMint }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                        Full Name
                      </p>
                      <p className="text-sm font-semibold text-white">{user?.full_name}</p>
                    </div>
                  </motion.div>

                  {/* Email */}
                  <motion.div
                    className="flex items-center gap-4 p-4 rounded-xl"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.6 }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `${colors.statusPaid}20` }}
                    >
                      <Mail size={20} style={{ color: colors.statusPaid }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                        Email Address
                      </p>
                      <p className="text-sm font-semibold text-white">{user?.email || 'Not set'}</p>
                    </div>
                  </motion.div>

                  {/* Phone */}
                  <motion.div
                    className="flex items-center gap-4 p-4 rounded-xl"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.7 }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `${colors.warning}20` }}
                    >
                      <Phone size={20} style={{ color: colors.warning }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                        Phone Number
                      </p>
                      <p className="text-sm font-semibold text-white">{user?.phone || 'Not set'}</p>
                    </div>
                  </motion.div>

                  {/* Section */}
                  <motion.div
                    className="flex items-center gap-4 p-4 rounded-xl"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.8 }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `${colors.primary}20` }}
                    >
                      <BookOpen size={20} style={{ color: colors.primary }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                        Section
                      </p>
                      <p className="text-sm font-semibold text-white">{user?.section || 'Not set'}</p>
                    </div>
                  </motion.div>

                  {/* Joined Date */}
                  <motion.div
                    className="flex items-center gap-4 p-4 rounded-xl"
                    style={{ background: 'rgba(255, 255, 255, 0.03)' }}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.9 }}
                  >
                    <div
                      className="w-12 h-12 rounded-xl flex items-center justify-center"
                      style={{ background: `${colors.accentMint}20` }}
                    >
                      <Calendar size={20} style={{ color: colors.accentMint }} />
                    </div>
                    <div className="flex-1">
                      <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                        Member Since
                      </p>
                      <p className="text-sm font-semibold text-white">
                        {user?.created_at ? formatDate(user.created_at, 'long') : 'N/A'}
                      </p>
                    </div>
                  </motion.div>
                </div>
              )}
            </GlassCard>

            {/* Payment Summary Card */}
            <motion.div
              className="mt-4 sm:mt-6"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 1.0 }}
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
                
                <div className="grid grid-cols-2 gap-3 sm:gap-4">
                  <div className="p-3 sm:p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                    <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Total Paid
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-white">
                      {formatCurrency(paymentSummary.totalPaid)}
                    </p>
                    <p className="text-[10px] mt-1" style={{ color: colors.textSecondary }}>
                      {paymentSummary.completedPayments} payment{paymentSummary.completedPayments !== 1 ? 's' : ''}
                    </p>
                  </div>
                  <div className="p-3 sm:p-4 rounded-xl" style={{ background: 'rgba(255, 255, 255, 0.03)' }}>
                    <p className="text-xs font-medium mb-1" style={{ color: colors.textSecondary }}>
                      Outstanding
                    </p>
                    <p className="text-lg sm:text-xl font-bold" style={{ color: colors.warning }}>
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
        </div>
      </div>
      <Footer />
    </div>
  );
}
