import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Users, Palette, Check, ArrowLeft, Plus, Sparkles, CreditCard, Calendar, CheckCircle } from "lucide-react";
import { colors } from "@/config/colors";
import { useNavigate } from "react-router-dom";
import GlassCard from "@/components/ui/GlassCard";
import Input from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { supabase } from "@/config/supabase";
import { formatCurrency, formatDate } from "@/utils/formatters";
import Footer from "@/components/Footer";

const CATEGORIES = [
  { value: "semester_dues", label: "Semester Dues", icon: "🎓" },
  { value: "books", label: "Books", icon: "📚" },
  { value: "events", label: "Events", icon: "🎉" },
  { value: "projects", label: "Projects", icon: "📘" },
  { value: "welfare", label: "Welfare", icon: "❤️" },
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

const LEVELS = ["100L", "200L", "300L", "400L", "500L"];

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
  const navigate = useNavigate();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    description: "",
    category: "semester_dues",
    amount: "",
    allow_partial: false,
    is_mandatory: false,
    deadline: "",
    bank_name: "First Bank of Nigeria",
    account_name: "",
    account_number: "",
    target_levels: ["200L"],
    icon: "🎓",
    color: "#3B82F6",
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

      // Get admin record for the current user (for created_by field)
      // Use limit(1) to handle multiple admin roles for same student
      const { data: adminDataArray, error: adminError } = await supabase
        .from("admins")
        .select("id")
        .eq("student_id", user.id)
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

      const { error } = await supabase
        .from("payment_types")
        .insert({
          title: formData.title,
          description: formData.description,
          category: formData.category,
          amount: parseFloat(formData.amount),
          allow_partial: formData.allow_partial,
          is_mandatory: formData.is_mandatory,
          deadline: formData.deadline,
          bank_name: formData.bank_name,
          account_name: formData.account_name,
          account_number: formData.account_number,
          created_by: adminData.id,
          approver_id: adminData.id, // Creator is the approver
          target_levels: formData.target_levels,
          icon: formData.icon,
          color: formData.color,
          is_active: true,
          is_public: false,
        })
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

  const handleLevelToggle = (level: string) => {
    setFormData((prev) => ({
      ...prev,
      target_levels: prev.target_levels.includes(level)
        ? prev.target_levels.filter((l) => l !== level)
        : [...prev.target_levels, level],
    }));
  };

  return (
    <div
      className="min-h-screen relative overflow-hidden"
      style={{
        background: "radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)",
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

        {/* ECE Logo Background - Creative Element */}
        <div className="hidden lg:block absolute right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none">
          <img
            src="/Ece picture.jpg"
            alt="ECE Background"
            className="w-full h-full object-contain"
            style={{
              filter: "grayscale(0.5) brightness(0.8)",
              mixBlendMode: "soft-light",
            }}
          />
        </div>
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
                onClick={() => navigate(-1)}
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
                    Set up a new payment type for students to pay
                  </p>
                </div>
              </div>

              {/* Progress Steps */}
              <div className="flex items-center justify-center gap-2 mt-6">
                {['Basic Info', 'Bank Details', 'Target', 'Design'].map((step, index) => (
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
                    {index < 3 && (
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
                  placeholder="e.g., CS 200L Project Materials"
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
                    placeholder="What is this payment for?"
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Category *
                  </label>
                  <div className="relative">
                    <select
                      value={formData.category}
                      onChange={(e) =>
                        setFormData({ ...formData, category: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border text-white appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        borderColor: "rgba(255, 104, 3, 0.2)",
                      }}
                      required
                    >
                      {CATEGORIES.map((cat) => (
                        <option
                          key={cat.value}
                          value={cat.value}
                          style={{ background: "#1A0E09" }}
                        >
                          {cat.icon} {cat.label}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                      >
                        <path
                          d="M5 7.5L10 12.5L15 7.5"
                          stroke="#FF6803"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                <Input
                  label="Amount *"
                  type="number"
                  value={formData.amount}
                  onChange={(e) =>
                    setFormData({ ...formData, amount: e.target.value })
                  }
                  placeholder="Enter amount in Naira"
                  required
                  min="0"
                  step="0.01"
                />

                <div className="space-y-3">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.allow_partial}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          allow_partial: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded border-white/20 bg-white/5 text-orange-500 focus:ring-2 focus:ring-orange-500"
                    />
                    <span className="text-white text-sm">
                      Allow partial payments
                    </span>
                  </label>

                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formData.is_mandatory}
                      onChange={(e) =>
                        setFormData({
                          ...formData,
                          is_mandatory: e.target.checked,
                        })
                      }
                      className="w-5 h-5 rounded border-white/20 bg-white/5 text-orange-500 focus:ring-2 focus:ring-orange-500"
                    />
                    <span className="text-white text-sm">
                      Make payment mandatory
                    </span>
                  </label>
                </div>

                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Payment Deadline *
                  </label>
                  <div className="relative">
                    <div className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <Calendar className="w-5 h-5" style={{ color: colors.primary }} />
                    </div>
                    <input
                      type="date"
                      value={formData.deadline}
                      onChange={(e) =>
                        setFormData({ ...formData, deadline: e.target.value })
                      }
                      className="w-full pl-12 pr-4 py-3 rounded-xl border text-white transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 cursor-pointer"
                      style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        borderColor: "rgba(255, 104, 3, 0.2)",
                        colorScheme: "dark",
                      }}
                      required
                    />
                  </div>
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
                  <h2 className="text-xl font-bold text-white">Bank Account Details</h2>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Where should payments be sent?</p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-white mb-2">
                    Bank Name *
                  </label>
                  <div className="relative">
                    <select
                      value={formData.bank_name}
                      onChange={(e) =>
                        setFormData({ ...formData, bank_name: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border text-white appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500"
                      style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        borderColor: "rgba(255, 104, 3, 0.2)",
                      }}
                      required
                    >
                      {NIGERIAN_BANKS.map((bank) => (
                        <option
                          key={bank}
                          value={bank}
                          style={{ background: "#1A0E09" }}
                        >
                          {bank}
                        </option>
                      ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                      >
                        <path
                          d="M5 7.5L10 12.5L15 7.5"
                          stroke="#FF6803"
                          strokeWidth="2"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </div>
                  </div>
                </div>

                <Input
                  label="Account Name *"
                  value={formData.account_name}
                  onChange={(e) =>
                    setFormData({ ...formData, account_name: e.target.value })
                  }
                  placeholder="e.g., CS 200L Class Rep"
                  required
                />

                <Input
                  label="Account Number *"
                  value={formData.account_number}
                  onChange={(e) =>
                    setFormData({ ...formData, account_number: e.target.value })
                  }
                  placeholder="10-digit account number"
                  required
                  pattern="[0-9]{10}"
                  maxLength={10}
                />

                <div className="p-4 rounded-xl bg-blue-500/10 border border-blue-500/20">
                  <p className="text-sm text-blue-300">
                    <strong>Note:</strong> You'll be the approver for all
                    payments to this account since you're creating it.
                  </p>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Target Students */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
          >
            <GlassCard className="mb-6 relative overflow-hidden">
              <div 
                className="absolute top-0 left-0 w-full h-1"
                style={{ background: `linear-gradient(90deg, #3B82F6, transparent)` }}
              />
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-xl flex items-center justify-center"
                     style={{ background: 'rgba(59, 130, 246, 0.15)', border: '1px solid rgba(59, 130, 246, 0.3)' }}>
                  <Users className="w-5 h-5" style={{ color: '#3B82F6' }} />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-white">Target Students</h2>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Select which students should pay</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-3">
                  Select Levels *
                </label>
                <div className="flex flex-wrap gap-3">
                  {LEVELS.map((level) => (
                    <label
                      key={level}
                      className="flex items-center gap-2 px-4 py-2 rounded-lg cursor-pointer transition-all"
                      style={{
                        background: formData.target_levels.includes(level)
                          ? `${colors.primary}20`
                          : "rgba(255, 255, 255, 0.05)",
                        border: `2px solid ${
                          formData.target_levels.includes(level)
                            ? colors.primary
                            : "rgba(255, 255, 255, 0.1)"
                        }`,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={formData.target_levels.includes(level)}
                        onChange={() => handleLevelToggle(level)}
                        className="w-5 h-5 rounded border-white/20 bg-white/5 text-orange-500"
                      />
                      <span className="text-white font-medium">{level}</span>
                    </label>
                  ))}
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Appearance */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
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
            transition={{ delay: 0.5 }}
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
                  onClick={() => navigate(-1)}
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
