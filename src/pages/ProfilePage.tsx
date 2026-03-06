/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect, useRef } from 'react';
import { motion} from 'framer-motion';
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
  Hash,
  KeyRound,
  History,
  ChevronRight,
  Camera,
  Building2,
  Upload,
  Loader2
} from 'lucide-react';
import Footer from '@/components/Footer';
import { colors, gradients } from '@/config/colors';
import { useAuth } from '@/hooks/useAppAuth';
import {  } from 'react-router-dom';
import { useAppNav } from '@/hooks/useAppNav';
import GlassCard from '@/components/ui/GlassCard';
import Input from '@/components/ui/Input';
import CustomButton from '@/components/ui/CustomButton';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { PrivacyMask } from '@/components/ui/PrivacyMask';
import paymentService from '@/services/paymentService';
import type { PaymentType, Payment } from '@/types';
import PageWrapper from '@/components/ui/PageWrapper';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { organizationService } from '@/services/organizationService';
import { supabase } from '@/config/supabase';

export default function ProfilePage() {
  const { user, updateProfile, loading: authLoading } = useAuth();
  const { organization, group, isAnyAdmin, refreshSession } = useMultiTenantAuth();
  const { go: navigate } = useAppNav();
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [pageLoading, setPageLoading] = useState(true);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [paymentSummary, setPaymentSummary] = useState({
    totalPaid: 0,
    totalOutstanding: 0,
    totalPending: 0,
    completedPayments: 0,
    pendingPayments: 0,
  });
  // Dismissed optional dues (localStorage key matches Dashboard) - read-only here
  const dismissedDues: string[] = (() => {
    try {
      const stored = localStorage.getItem(`dismissedDues_${user?.id}`);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  })();

  // If the user's `level` is not populated in the mapped auth user, try fetching it
  // directly from the members table so the Profile page can show it.
  const [fetchedLevel, setFetchedLevel] = useState<string | null>(null);
  const academicInfo = ((organization as any)?.custom_settings as Record<string, unknown>)?.academic as { academic_level?: string } | undefined;
  const groupPrimary = group?.levels && group.levels.length > 0 ? organizationService.canonicalizeLevel(group.levels[0]) : null;
  useEffect(() => {
    const fetchLevel = async () => {
      if (!user?.id) return;
      if (user.level) return; // already present
      try {
        const { data } = await supabase.from('organization_members').select('level').eq('id', user.id).single();
        if (data && (data as any).level) setFetchedLevel((data as any).level as string);
      } catch {
        // best-effort
      }
    };
    fetchLevel();
  }, [user?.id, user?.level]);
  const [formData, setFormData] = useState({
    full_name: user?.full_name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    section: user?.section || '',
  });

  // Org logo state
  const logoInputRef = useRef<HTMLInputElement>(null);
  const [orgLogoUrl, setOrgLogoUrl] = useState(organization?.logo_url || '');
  const [logoUploading, setLogoUploading] = useState(false);
  const [logoMessage, setLogoMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    setOrgLogoUrl(organization?.logo_url || '');
  }, [organization?.logo_url]);

  const handleLogoUpload = async (file: File) => {
    if (!organization?.id) return;
    if (!file.type.startsWith('image/')) {
      setLogoMessage({ type: 'error', text: 'Please select an image file (PNG, JPG, etc.)' });
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoMessage({ type: 'error', text: 'Image must be smaller than 2MB' });
      return;
    }

    try {
      setLogoUploading(true);
      setLogoMessage(null);

      const fileExt = file.name.split('.').pop() || 'png';
      const fileName = `org_${organization.id}_${Date.now()}.${fileExt}`;
      const filePath = `org-logos/${fileName}`;

      // Upload to Supabase Storage
      const { error: uploadError } = await supabase.storage
        .from('profile-images')
        .upload(filePath, file, { upsert: true });

      if (uploadError) {
        throw new Error(uploadError.message);
      }

      // Get public URL
      const { data: urlData } = supabase.storage
        .from('profile-images')
        .getPublicUrl(filePath);

      const publicUrl = urlData.publicUrl;

      // Update organization record
      const { error: updateError } = await supabase
        .from('organizations')
        .update({ logo_url: publicUrl, updated_at: new Date().toISOString() })
        .eq('id', organization.id);

      if (updateError) {
        throw new Error(updateError.message);
      }

      setOrgLogoUrl(publicUrl);
      setLogoMessage({ type: 'success', text: 'Organization logo updated successfully!' });

      // Refresh session to update the org data in context
      try { await refreshSession(); } catch { /* best effort */ }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to upload logo';
      setLogoMessage({ type: 'error', text: msg });
    } finally {
      setLogoUploading(false);
    }
  };

  const handleRemoveLogo = async () => {
    if (!organization?.id) return;
    try {
      setLogoUploading(true);
      setLogoMessage(null);

      const { error } = await supabase
        .from('organizations')
        .update({ logo_url: null, updated_at: new Date().toISOString() })
        .eq('id', organization.id);

      if (error) throw new Error(error.message);

      setOrgLogoUrl('');
      setLogoMessage({ type: 'success', text: 'Organization logo removed' });
      try { await refreshSession(); } catch { /* best effort */ }
    } catch (error: unknown) {
      const msg = error instanceof Error ? error.message : 'Failed to remove logo';
      setLogoMessage({ type: 'error', text: msg });
    } finally {
      setLogoUploading(false);
    }
  };

  // Fetch payment summary
  useEffect(() => {
    const fetchPaymentSummary = async () => {
      if (!user?.id) return;

      try {
        setPageLoading(true);
        const summary = await paymentService.getPaymentSummary(user.id);

        // Also fetch active payment types + payments to determine dismissed optional unpaid dues
        const [activeTypes, payments] = await Promise.all([
          paymentService.getActivePaymentTypesForStudent(user.id),
          paymentService.getStudentPayments(user.id),
        ]);

        // Compute unpaid optional dues that are dismissed
        const unpaid = (activeTypes || []).map((pt: PaymentType) => {
          const paymentsForType = (payments || []).filter((p: Payment) => p.payment_type_id === pt.id);
          const paid = paymentsForType.filter((p) => p.status === 'approved' && !p.transaction_ref?.startsWith('WAIVED-')).reduce((s, p) => s + Number(p.amount || 0), 0) || 0;
          const isWaived = paymentsForType.some((p) => p.status === 'approved' && p.transaction_ref?.startsWith('WAIVED-'));
          const outstanding = isWaived ? 0 : Math.max(0, Number(pt.amount || 0) - paid);
          return { id: pt.id, totalDue: outstanding, is_mandatory: pt.is_mandatory };
        });

        const dismissedUnpaidSum = unpaid
          .filter(u => !u.is_mandatory && dismissedDues.includes(u.id))
          .reduce((s, u) => s + (Number(u.totalDue || 0)), 0);

        setPaymentSummary({
          ...summary,
          totalOutstanding: Math.max(0, Number(summary.totalOutstanding || 0) - dismissedUnpaidSum),
        });
      } catch (error) {
        // Error handling without console log
      } finally {
        setPageLoading(false);
      }
    };

    fetchPaymentSummary();
  }, [user?.id, dismissedDues]);

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

  // Show skeleton while loading
  if (authLoading || (!user && pageLoading)) {
    return (
      <PageWrapper noPadding>
        <div className="relative max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-6 lg:py-8">
          {/* Header Skeleton */}
          <div className="mb-6 sm:mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
              <div className="flex items-center gap-3 sm:gap-4">
                <div className="w-10 h-10 rounded-lg animate-pulse" style={{ background: 'rgba(255, 255, 255, 0.1)' }} />
                <div>
                  <div className="h-8 w-32 rounded-lg animate-pulse mb-2" style={{ background: 'rgba(255, 255, 255, 0.1)' }} />
                  <div className="h-4 w-64 rounded-lg animate-pulse" style={{ background: 'rgba(255, 255, 255, 0.05)' }} />
                </div>
              </div>
              <div className="h-10 w-32 rounded-lg animate-pulse" style={{ background: 'rgba(255, 255, 255, 0.1)' }} />
            </div>
          </div>
          <ProfileSkeleton />
        </div>
      </PageWrapper>
    );
  }

  return (
    <PageWrapper noPadding>
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
                className="flex items-center justify-center px-3 py-2 rounded-lg transition-all duration-300 outline-1"
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
                  <span className="text-sm font-medium text-white">{user?.level || groupPrimary || fetchedLevel || academicInfo?.academic_level || 'N/A'}</span>
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

            {/* Quick Actions */}
            <motion.div
              className="mt-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.35 }}
            >
              <GlassCard className="p-0! overflow-hidden">
                <div className="px-4 pt-4 pb-2">
                  <h3 className="text-sm font-semibold text-white">Quick Actions</h3>
                </div>
                {[
                  { icon: KeyRound, label: 'Change Password', path: '/change-password', color: colors.primary },
                  { icon: History, label: 'Payment History', path: '/dashboard', color: colors.accentMint },
                ].map((action, i) => (
                  <motion.button
                    key={action.path}
                    onClick={() => navigate(action.path)}
                    className="w-full flex items-center gap-3 px-4 py-3 transition-all text-left"
                    style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}
                    whileHover={{ background: 'rgba(255, 255, 255, 0.04)' }}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.4 + i * 0.1 }}
                  >
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${action.color}15` }}
                    >
                      <action.icon size={16} style={{ color: action.color }} />
                    </div>
                    <span className="text-sm font-medium text-white flex-1">{action.label}</span>
                    <ChevronRight size={16} style={{ color: colors.textSecondary }} />
                  </motion.button>
                ))}
              </GlassCard>
            </motion.div>

            {/* Organization Logo - Admin Only */}
            {isAnyAdmin() && organization && (
              <motion.div
                className="mt-4"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.45 }}
              >
                <GlassCard>
                  <div className="flex items-center gap-3 mb-4">
                    <div
                      className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                      style={{ background: `${colors.primary}15` }}
                    >
                      <Building2 size={16} style={{ color: colors.primary }} />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-white">Organization Logo</h3>
                      <p className="text-[11px]" style={{ color: colors.textSecondary }}>
                        {organization.short_name || organization.name}
                      </p>
                    </div>
                  </div>

                  {/* Current Logo Preview */}
                  <div className="flex flex-col items-center gap-3">
                    <div className="relative group">
                      {orgLogoUrl ? (
                        <img
                          src={orgLogoUrl}
                          alt={organization.short_name}
                          className="w-20 h-20 rounded-xl object-cover ring-2 ring-white/10"
                        />
                      ) : (
                        <div
                          className="w-20 h-20 rounded-xl flex items-center justify-center text-2xl font-bold ring-2 ring-white/10"
                          style={{ background: `linear-gradient(135deg, ${organization.primary_color || colors.primary}, ${organization.primary_color || colors.primary}88)` }}
                        >
                          {organization.short_name?.charAt(0) || 'O'}
                        </div>
                      )}

                      {/* Camera overlay */}
                      <motion.button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={logoUploading}
                        className="absolute inset-0 rounded-xl flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        style={{ background: 'rgba(0,0,0,0.5)' }}
                        whileTap={{ scale: 0.95 }}
                      >
                        {logoUploading ? (
                          <Loader2 size={20} className="text-white animate-spin" />
                        ) : (
                          <Camera size={20} className="text-white" />
                        )}
                      </motion.button>
                    </div>

                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/png,image/jpeg,image/webp,image/gif"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleLogoUpload(file);
                        e.target.value = '';
                      }}
                    />

                    <div className="flex items-center gap-2">
                      <motion.button
                        onClick={() => logoInputRef.current?.click()}
                        disabled={logoUploading}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                        style={{ background: `${colors.primary}20`, color: colors.primary }}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                      >
                        <Upload size={12} />
                        {orgLogoUrl ? 'Change' : 'Upload'}
                      </motion.button>
                      {orgLogoUrl && (
                        <motion.button
                          onClick={handleRemoveLogo}
                          disabled={logoUploading}
                          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: 'rgba(239, 68, 68, 0.15)', color: '#ef4444' }}
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                        >
                          <X size={12} />
                          Remove
                        </motion.button>
                      )}
                    </div>

                    <p className="text-[10px] text-center" style={{ color: colors.textSecondary }}>
                      PNG, JPG or WebP • Max 2MB
                    </p>
                  </div>

                  {/* Logo upload message */}
                  {logoMessage && (
                    <motion.div
                      className="mt-3 p-2.5 rounded-lg flex items-center gap-2"
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      style={{
                        background: logoMessage.type === 'success' ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                        border: `1px solid ${logoMessage.type === 'success' ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)'}`,
                      }}
                    >
                      {logoMessage.type === 'success' ? (
                        <CheckCircle2 size={14} className="text-green-400 shrink-0" />
                      ) : (
                        <AlertCircle size={14} className="text-red-400 shrink-0" />
                      )}
                      <p className={`text-[11px] font-medium ${logoMessage.type === 'success' ? 'text-green-400' : 'text-red-400'}`}>
                        {logoMessage.text}
                      </p>
                    </motion.div>
                  )}
                </GlassCard>
              </motion.div>
            )}

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
                      <PrivacyMask>{formatCurrency(paymentSummary.totalPaid)}</PrivacyMask>
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
                      <PrivacyMask>{formatCurrency(paymentSummary.totalOutstanding)}</PrivacyMask>
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
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
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
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
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
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
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
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
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
                        className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
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
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
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
                      <p className="text-sm font-semibold text-white">{user?.level || groupPrimary || fetchedLevel || academicInfo?.academic_level || 'N/A'}</p>
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
                      className="w-10 h-10 rounded-lg flex items-center justify-center shrink-0"
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
                  <AlertCircle size={16} className="text-blue-400 shrink-0 mt-0.5" />
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
                    <p className="text-xl sm:text-2xl font-bold text-white mb-1">
                      <PrivacyMask>{formatCurrency(paymentSummary.totalPaid)}</PrivacyMask>
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
                    <p className="text-xl sm:text-2xl font-bold" style={{ color: colors.warning }}>
                      <PrivacyMask>{formatCurrency(paymentSummary.totalOutstanding)}</PrivacyMask>
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
    </PageWrapper>
  );
}
