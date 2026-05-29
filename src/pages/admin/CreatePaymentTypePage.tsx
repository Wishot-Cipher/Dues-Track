import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Palette, Check, ArrowLeft, Plus, Sparkles, CreditCard, CheckCircle, Tag } from "lucide-react";
import { colors } from "@/config/colors";
import { useAppNav } from '@/hooks/useAppNav';
import GlassCard from "@/components/ui/GlassCard";
import Input from "@/components/ui/Input";
import ProfessionalDropdown from "@/components/ui/ProfessionalDropdown";
import ProfessionalDateTimePicker from '@/components/ui/ProfessionalDateTimePicker'
import { useAuth } from '@/hooks/useAppAuth';
import { useToast } from "@/hooks/useToast";
import { supabase } from "@/config/supabase";
import { getOrgScope } from '@/utils/orgScope';
import { organizationService } from '@/services/organizationService';
import { formatCurrency, formatDate } from "@/utils/formatters";
import Footer from "@/components/Footer";
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';

const CATEGORIES = [
  { value: "dues", label: "Dues", icon: "🎓" },
  { value: "fees", label: "Fees", icon: "📚" },
  { value: "levy", label: "Levy", icon: "📋" },
  { value: "contribution", label: "Contribution", icon: "🤝" },
  { value: "welfare", label: "Welfare", icon: "❤️" },
  { value: "project", label: "Project", icon: "📘" },
  { value: "event", label: "Event", icon: "🎉" },
  { value: "donation", label: "Donation", icon: "💝" },
  { value: "subscription", label: "Subscription", icon: "🔄" },
  { value: "savings", label: "Savings", icon: "💰" },
  { value: "custom", label: "Custom", icon: "📦" },
];

const ICONS = [
  { value: "🎓", label: "Graduation Cap" },
  { value: "📚", label: "Books" },
  { value: "🎉", label: "Party" },
  { value: "📘", label: "Notebook" },
  { value: "❤️", label: "Heart" },
  { value: "📦", label: "Package" },
  { value: "💰", label: "Money Bag" },
  { value: "🏆", label: "Trophy" },
  { value: "⚽", label: "Sports" },
  { value: "🎨", label: "Art" },
];

const COLORS = [
  "#3B82F6", // Blue
  "#10B981", // Green
  "#F59E0B", // Amber
  "#EF4444", // Red
  "#8B5CF6", // Purple
  "#EC4899", // Pink
  "#06B6D4", // Cyan
  "#F97316", // Orange
];

const NIGERIAN_BANKS = [
  "Access Bank",
  "Zenith Bank",
  "GTBank (Guaranty Trust Bank)",
  "First Bank of Nigeria",
  "UBA (United Bank for Africa)",
  "Fidelity Bank",
  "Union Bank",
  "Sterling Bank",
  "Stanbic IBTC Bank",
  "Ecobank Nigeria",
  "FCMB (First City Monument Bank)",
  "Wema Bank",
  "Polaris Bank",
  "Keystone Bank",
  "Heritage Bank",
  "Opay",
  "Palmpay",
  "MoniePoint",
];

export default function CreatePaymentTypePage() {
  const { user, hasPermission } = useAuth();
  const { go: navigate } = useAppNav();
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  type PaymentFormData = {
    title: string;
    description: string;
    category: string;
    amount: string;
    allow_partial: boolean;
    is_mandatory: boolean;
    is_public: boolean;
    deadline: string;
    bank_name: string;
    account_name: string;
    account_number: string;
    icon: string;
    color: string;
    late_fee_per_day: string | number;
  };

  const [formData, setFormData] = useState<PaymentFormData>({
    title: "",
    description: "",
    category: "dues",
    amount: "",
    allow_partial: false,
    is_mandatory: false,
    is_public: false,
    deadline: "",
    bank_name: "First Bank of Nigeria",
    account_name: "",
    account_number: "",
    icon: "🎓",
    color: "#3B82F6",
    late_fee_per_day: '',
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!user?.id) {
      toast.error("You must be logged in to create a payment type");
      return;
    }

    // Check permission to create payments
    if (!hasPermission('can_create_payments')) {
      toast.error('You must have permission to create payment types');
      return;
    }

    try {
      setLoading(true);

      // Resolve org scope — required for multi-tenant
      const scope = getOrgScope();
      let orgId = scope?.orgId || null;
      let groupId: string | null = scope?.groupId || null;

      // Fallback: derive org info (and member level) from the member record
      let memberLevel: string | null = null;
      if (!orgId && user.id) {
        const { data: memberRow } = await supabase
          .from('organization_members')
          .select('organization_id, group_id, level')
          .eq('id', user.id)
          .single();
        if (memberRow) {
          orgId = memberRow.organization_id;
          groupId = memberRow.group_id;
          memberLevel = memberRow.level || null;
        }
      }

      if (!orgId) {
        toast.error('Organization context not found. Please log out and log back in.');
        return;
      }

      // If we don't have groupId yet, fetch from member record
      if (!groupId) {
        const { data: memberData } = await supabase
          .from('organization_members')
          .select('group_id, level')
          .eq('id', user.id)
          .eq('organization_id', orgId)
          .single();
        groupId = memberData?.group_id || null;
        if (!memberLevel) memberLevel = memberData?.level || null;
      }

      if (!groupId) {
        toast.error('Group context not found. Please contact support.');
        return;
      }

      // Get admin record for the current user (scoped to org + group)
      const { data: adminDataArray, error: adminError } = await supabase
        .from("member_admins")
        .select("id")
        .eq("member_id", user.id)
        .eq('organization_id', orgId)
        .eq('group_id', groupId)
        .limit(1);

      if (adminError) {
        console.error("Error fetching admin record:", adminError);
        toast.error("Error verifying admin status. Please try again.");
        return;
      }

      if (!adminDataArray || adminDataArray.length === 0) {
        toast.error("Admin record not found. Please contact support.");
        return;
      }

      const adminData = adminDataArray[0];

      const insertData: Record<string, unknown> = {
          organization_id: orgId,
          group_id: groupId,
          title: formData.title,
          description: formData.description,
          category: formData.category,
          amount: parseFloat(formData.amount),
          allow_partial: formData.allow_partial,
          is_mandatory: formData.is_mandatory,
          deadline: formData.deadline,
          late_fee_per_day: Number(formData.late_fee_per_day || 0),
          bank_name: formData.bank_name,
          account_name: formData.account_name,
          account_number: formData.account_number,
          created_by: adminData.id,
          approver_id: adminData.id,
          icon: formData.icon,
          color: formData.color,
          is_active: true,
          // Auto-apply to the creator's level when available. Leave undefined to target all members.
          ...(memberLevel ? { target_levels: [organizationService.canonicalizeLevel(memberLevel)] } : {}),
          is_public: formData.is_public,
      };

      const { error } = await supabase
        .from("payment_types")
        .insert(insertData)
        .select()
        .single();

      if (error) throw error;

      // Show success and redirect
      toast.success("Payment type created successfully!");
      navigate("/admin/dashboard");
    } catch (error) {
      console.error("Error creating payment type:", error);
      toast.error("Failed to create payment type. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        background: tk.bgWash,
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
          backgroundSize: "50px 50px",
        }}
      />

      {/* Animated Gradient Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30 animate-pulse"
          style={{
            background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
            top: "-10%",
            right: "-5%",
            animationDuration: "4s",
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${colors.accentMint} 0%, transparent 70%)`,
            bottom: "-5%",
            left: "-5%",
            animation: "pulse 6s ease-in-out infinite",
          }}
        />

      </div>

      {/* Content */}
      <div className="relative z-10 max-w-4xl mx-auto px-4 py-8">
        {/* Enhanced Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <GlassCard className="relative overflow-hidden">
            {/* Decorative Elements */}
            <div className="absolute top-0 right-0 w-64 h-64 opacity-5 pointer-events-none">
              <CreditCard className="w-full h-full" style={{ color: colors.primary }} />
            </div>
            <div 
              className="absolute top-0 left-0 w-full h-1"
              style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accentMint}, transparent)` }}
            />
            
            <div className="relative z-10">
              <motion.button
                whileHover={{ x: -4 }}
                onClick={() => window.history.back()}
                className="flex items-center gap-2 mb-4 px-4 py-2 rounded-xl transition-all"
                style={{ 
                  background: `${colors.primary}15`,
                  border: `1px solid ${colors.primary}30`,
                  color: colors.primary 
                }}
              >
                <ArrowLeft size={16} />
                <span className="font-medium">Back</span>
              </motion.button>

              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4">
                <motion.div
                  initial={{ scale: 0.9 }}
                  animate={{ scale: 1 }}
                  className="w-16 h-16 rounded-2xl flex items-center justify-center shrink-0 shadow-lg relative"
                  style={{ 
                    background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
                    border: `1px solid ${colors.primary}40`,
                    boxShadow: `0 4px 20px ${colors.primary}30`
                  }}
                >
                  <Plus className="w-8 h-8" style={{ color: colors.primary }} />
                  <Sparkles className="w-4 h-4 absolute -top-1 -right-1" style={{ color: colors.accentMint }} />
                </motion.div>
                <div className="text-center sm:text-left">
                  <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.1 }}
                    className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-2"
                    style={{ 
                      background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
                      border: `1px solid ${colors.primary}40`,
                      color: colors.primary,
                    }}
                  >
                    <Sparkles className="w-3 h-3" />
                    CREATE PAYMENT
                  </motion.div>
                  <h1 className="text-2xl sm:text-3xl font-bold text-white">
                    New Payment Type
                  </h1>
                  <p style={{ color: colors.textSecondary }}>
                    Set up a new payment type for your organization
                  </p>
                </div>
              {/* NOTE: Late fee input moved into the Basic Info form for consistent visibility */}
              </div>

              {/* Progress Steps */}
              <div className="flex items-center justify-center gap-2 mt-6">
                {['Details', 'Bank', 'Customize'].map((step, index) => (
                  <div key={step} className="flex items-center gap-2">
                    <div className="flex items-center gap-2">
                      <div 
                        className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold"
                        style={{ 
                          background: `${colors.primary}20`,
                          border: `2px solid ${colors.primary}`,
                          color: colors.primary
                        }}
                      >
                        {index + 1}
                      </div>
                      <span className="text-xs font-medium hidden sm:block" style={{ color: colors.textSecondary }}>
                        {step}
                      </span>
                    </div>
                    {index < 2 && (
                      <div className="w-8 h-0.5 hidden sm:block" style={{ background: `${colors.primary}30` }} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          </GlassCard>
        </motion.div>

        <form onSubmit={handleSubmit}>
          {/* Basic Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <GlassCard className="mb-6 relative overflow-hidden">
              <div 
                className="absolute top-0 left-0 w-full h-1"
                style={{ background: `linear-gradient(90deg, ${colors.primary}, transparent)` }}
              />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                     style={{ background: `${colors.primary}15`, border: `1px solid ${colors.primary}30` }}>
                  <CreditCard className="w-5 h-5" style={{ color: colors.primary }} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Basic Information</h2>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Payment details and settings</p>
                </div>
              </div>

              <div className="space-y-4">
                <Input
                  label="Payment Title *"
                  value={formData.title}
                  onChange={(e) =>
                    setFormData({ ...formData, title: e.target.value })
                  }
                  placeholder="e.g., Monthly Dues, Event Fee, Project Fund"
                  required
                />

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Description
                  </label>
                  <textarea
                    value={formData.description}
                    onChange={(e) =>
                      setFormData({ ...formData, description: e.target.value })
                    }
                    placeholder="Brief description of what this payment covers (optional)"
                    rows={2}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <ProfessionalDropdown
                    label="Category *"
                    placeholder="Select Category"
                    icon={<Tag className="w-5 h-5" />}
                    value={formData.category}
                    onChange={(val) =>
                      setFormData({ ...formData, category: val as string })
                    }
                    options={CATEGORIES.map((cat) => ({
                      value: cat.value,
                      label: cat.label,
                      icon: <span>{cat.icon}</span>
                    }))}
                  />
                </div>

                <Input
                  label="Amount *"
                  type="number"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  placeholder="Enter amount"
                  required
                  min="0"
                  step="0.01"
                />

                <Input
                  label="Late Fee per Day (₦)"
                  type="number"
                  value={formData.late_fee_per_day ?? ''}
                  onChange={(e) => {
                    const v = e.target.value
                    setFormData({ ...formData, late_fee_per_day: v === '' ? '' : Number(v) })
                  }}
                  placeholder="Amount charged per day after deadline"
                  helperText="Amount charged per day after the payment deadline. Leave empty for no late fee."
                />

                <div className="space-y-1 rounded-xl border border-white/5 overflow-hidden">
                  {[
                    { key: 'allow_partial' as const, label: 'Allow partial payments', desc: 'Members can pay in installments' },
                    { key: 'is_mandatory' as const, label: 'Mandatory payment', desc: 'Required for all members' },
                    { key: 'is_public' as const, label: 'Public contributions', desc: 'Visible on the public contribute page' },
                  ].map(toggle => (
                    <button
                      key={toggle.key}
                      type="button"
                      onClick={() => setFormData(prev => ({ ...prev, [toggle.key]: !prev[toggle.key] }))}
                      className="flex items-center justify-between w-full px-4 py-3 hover:bg-white/5 transition-colors group"
                    >
                      <div className="text-left">
                        <span className="text-sm text-white/90 group-hover:text-white transition-colors">{toggle.label}</span>
                        <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>{toggle.desc}</p>
                      </div>
                      <div className={`w-11 h-6 rounded-full relative transition-colors shrink-0 ml-3 ${formData[toggle.key] ? 'bg-orange-500' : 'bg-white/10'}`}>
                        <div className={`absolute top-1 w-4 h-4 rounded-full transition-all shadow-sm ${formData[toggle.key] ? 'left-[22px] bg-white' : 'left-1 bg-white/50'}`} />
                      </div>
                    </button>
                  ))}
                </div>

                <div>
                  <ProfessionalDateTimePicker
                    label="Payment Deadline"
                    value={formData.deadline}
                    onChange={(v) => setFormData({ ...formData, deadline: v })}
                    // includeTime={false}
                    // required
                  />
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Bank Account Details */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <GlassCard className="mb-6 relative overflow-hidden">
              <div 
                className="absolute top-0 left-0 w-full h-1"
                style={{ background: `linear-gradient(90deg, ${colors.accentMint}, transparent)` }}
              />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                     style={{ background: `${colors.accentMint}15`, border: `1px solid ${colors.accentMint}30` }}>
                  <Building2 className="w-5 h-5" style={{ color: colors.accentMint }} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Bank Account</h2>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Optional — for bank transfer payments</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <ProfessionalDropdown
                    label="Bank Name"
                    placeholder="Select Bank"
                    icon={<Building2 className="w-5 h-5" />}
                    value={formData.bank_name}
                    onChange={(val) =>
                      setFormData({ ...formData, bank_name: val as string })
                    }
                    options={NIGERIAN_BANKS.map((bank) => ({
                      value: bank,
                      label: bank
                    }))}
                    searchable
                  />
                </div>

                <Input
                  label="Account Name"
                  value={formData.account_name}
                  onChange={(e) =>
                    setFormData({ ...formData, account_name: e.target.value })
                  }
                  placeholder="e.g., Organization Treasury"
                />

                <Input
                  label="Account Number"
                  value={formData.account_number}
                  onChange={(e) =>
                    setFormData({ ...formData, account_number: e.target.value })
                  }
                  placeholder="10-digit account number"
                  pattern="[0-9]{10}"
                  maxLength={10}
                />

                <div className="p-3 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <p className="text-xs text-blue-300">
                    💡 You'll be set as the default payment approver. Bank details are optional — useful for bank transfer payments.
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Appearance */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <GlassCard className="mb-6 relative overflow-hidden">
              <div 
                className="absolute top-0 left-0 w-full h-1"
                style={{ background: `linear-gradient(90deg, #8B5CF6, transparent)` }}
              />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                     style={{ background: 'rgba(139, 92, 246, 0.15)', border: '1px solid rgba(139, 92, 246, 0.3)' }}>
                  <Palette className="w-5 h-5" style={{ color: '#8B5CF6' }} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Appearance</h2>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Customize how the payment looks</p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
                <div>
                  <label className="block text-sm font-medium text-white mb-3">
                    Icon
                  </label>
                  <div className="grid grid-cols-5 gap-2">
                    {ICONS.map((icon) => (
                      <button
                        key={icon.value}
                        type="button"
                        onClick={() =>
                          setFormData({ ...formData, icon: icon.value })
                        }
                        className="p-3 rounded-lg text-2xl transition-all hover:scale-110"
                        style={{
                          background:
                            formData.icon === icon.value
                              ? `${colors.primary}20`
                              : "rgba(255, 255, 255, 0.05)",
                          border: `2px solid ${
                            formData.icon === icon.value
                              ? colors.primary
                              : "rgba(255, 255, 255, 0.1)"
                          }`,
                        }}
                        title={icon.label}
                      >
                        {icon.value}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-3">
                    Color
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        onClick={() => setFormData({ ...formData, color })}
                        className="w-12 h-12 rounded-lg transition-all hover:scale-110 relative"
                        style={{
                          background: color,
                          border:
                            formData.color === color
                              ? "3px solid white"
                              : "none",
                        }}
                      >
                        {formData.color === color && (
                          <Check
                            size={20}
                            className="absolute inset-0 m-auto text-white"
                          />
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Preview */}
              <div>
                <label className="block text-sm font-medium text-white mb-3">
                  Live Preview
                </label>
                <motion.div
                  className="p-5 rounded-2xl border-2 relative overflow-hidden"
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    borderColor: `${formData.color}40`,
                    boxShadow: `0 4px 20px ${formData.color}20`
                  }}
                  whileHover={{ scale: 1.02 }}
                >
                  <div 
                    className="absolute top-0 left-0 w-full h-1"
                    style={{ background: `linear-gradient(90deg, ${formData.color}, transparent)` }}
                  />
                  <div className="flex items-center gap-4">
                    <motion.div
                      className="w-14 h-14 rounded-xl flex items-center justify-center text-3xl"
                      style={{ background: `${formData.color}20`, border: `1px solid ${formData.color}40` }}
                      whileHover={{ scale: 1.1, rotate: 5 }}
                    >
                      {formData.icon}
                    </motion.div>
                    <div className="flex-1">
                      <p className="font-bold text-lg text-white">
                        {formData.title || "Payment Title"}
                      </p>
                      <p
                        className="text-sm"
                        style={{ color: colors.textSecondary }}
                      >
                        {formData.amount
                          ? formatCurrency(parseFloat(formData.amount))
                          : "₦0"}{" "}
                        • Due:{" "}
                        {formData.deadline
                          ? formatDate(formData.deadline, "short")
                          : "Not set"}
                      </p>
                      <div className="flex items-center gap-2 mt-2">
                        {formData.is_mandatory && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ background: `${colors.statusFailed}20`, color: colors.statusFailed }}>
                            MANDATORY
                          </span>
                        )}
                        {formData.allow_partial && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                                style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}>
                            PARTIAL OK
                          </span>
                        )}
                      </div>
                    </div>
                    <CheckCircle className="w-6 h-6" style={{ color: colors.statusPaid }} />
                  </div>
                </motion.div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Submit Buttons */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
          >
            <GlassCard className="relative overflow-hidden">
              <div 
                className="absolute bottom-0 left-0 w-full h-1"
                style={{ background: `linear-gradient(90deg, ${colors.statusPaid}, ${colors.accentMint}, transparent)` }}
              />
              <div className="flex flex-col sm:flex-row gap-4">
                <motion.button
                  type="submit"
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="flex-1 flex items-center justify-center gap-3 px-6 py-4 rounded-xl font-bold text-white transition-all disabled:opacity-50"
                  style={{ 
                    background: `linear-gradient(135deg, ${colors.statusPaid}, ${colors.accentMint})`,
                    boxShadow: `0 4px 20px ${colors.statusPaid}40`
                  }}
                >
                  {loading ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  ) : (
                    <Check size={20} />
                  )}
                  {loading ? 'Creating...' : 'Create Payment Type'}
                </motion.button>

                <motion.button
                  type="button"
                  onClick={() => window.history.back()}
                  disabled={loading}
                  whileHover={{ scale: 1.02 }}
                  whileTap={{ scale: 0.98 }}
                  className="px-6 py-4 rounded-xl font-medium transition-all"
                  style={{ 
                    background: 'rgba(255, 255, 255, 0.05)',
                    border: '1px solid rgba(255, 255, 255, 0.1)',
                    color: colors.textSecondary
                  }}
                >
                  Cancel
                </motion.button>
              </div>
            </GlassCard>
          </motion.div>
        </form>
      </div>
      <Footer />
    </div>
  );
}
