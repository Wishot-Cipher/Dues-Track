import { useState } from "react";
import { motion } from "framer-motion";
import { Building2, Users, Palette, Check, ArrowLeft } from "lucide-react";
import { colors } from "@/config/colors";
import { useNavigate } from "react-router-dom";
import GlassCard from "@/components/ui/GlassCard";
import Input from "@/components/ui/Input";
import CustomButton from "@/components/ui/CustomButton";
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
  const { user } = useAuth();
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

    // Check if user has admin roles
    const isAdmin =
      user.roles &&
      (user.roles.includes("admin") ||
        user.roles.includes("finsec") ||
        user.roles.includes("class_rep"));

    if (!isAdmin) {
      toast.error("You must be an admin to create payment types");
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
        {/* Header */}
        <motion.div
          className="mb-8"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
        >
          <button
            onClick={() => navigate(-1)}
            className="flex items-center justify-center sm:justify-start gap-2 mb-4 px-3 py-2 rounded-lg transition-colors w-auto outline outline-orange-500 "
            style={{ color: colors.textSecondary }}
            onMouseEnter={(e) => (e.currentTarget.style.color = colors.primary)}
            onMouseLeave={(e) =>
              (e.currentTarget.style.color = colors.textSecondary)
            }
          >
            <ArrowLeft size={16} />
            Back
          </button>
          <h1 className="text-3xl font-bold text-white mb-2">
            ➕ Create New Payment
          </h1>
          <p style={{ color: colors.textSecondary }}>
            Set up a new payment type for students to pay
          </p>
        </motion.div>

        <form onSubmit={handleSubmit}>
          {/* Basic Information */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <GlassCard className="mb-6">
              <h2 className="text-xl font-bold text-white mb-4">
                Basic Information
              </h2>

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
                    <input
                      type="date"
                      value={formData.deadline}
                      onChange={(e) =>
                        setFormData({ ...formData, deadline: e.target.value })
                      }
                      className="w-full px-4 py-3 rounded-xl border text-white transition-all focus:outline-none focus:ring-2 focus:ring-orange-500 focus:border-orange-500 cursor-pointer"
                      style={{
                        background: "rgba(255, 255, 255, 0.05)",
                        borderColor: "rgba(255, 104, 3, 0.2)",
                        colorScheme: "dark",
                      }}
                      required
                    />
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                      <svg
                        width="20"
                        height="20"
                        viewBox="0 0 20 20"
                        fill="none"
                      >
                        <rect
                          x="3"
                          y="4"
                          width="14"
                          height="14"
                          rx="2"
                          stroke="#FF6803"
                          strokeWidth="1.5"
                          fill="none"
                        />
                        <path d="M3 8H17" stroke="#FF6803" strokeWidth="1.5" />
                        <path
                          d="M7 2V4M13 2V4"
                          stroke="#FF6803"
                          strokeWidth="1.5"
                          strokeLinecap="round"
                        />
                      </svg>
                    </div>
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
            <GlassCard className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Building2 size={24} style={{ color: colors.primary }} />
                <h2 className="text-xl font-bold text-white">
                  Bank Account Details
                </h2>
              </div>
              <p
                className="text-sm mb-4"
                style={{ color: colors.textSecondary }}
              >
                Which account should receive payments?
              </p>

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
            <GlassCard className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Users size={24} style={{ color: colors.accentMint }} />
                <h2 className="text-xl font-bold text-white">
                  Target Students
                </h2>
              </div>
              <p
                className="text-sm mb-4"
                style={{ color: colors.textSecondary }}
              >
                Who should pay this?
              </p>

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
            <GlassCard className="mb-6">
              <div className="flex items-center gap-3 mb-4">
                <Palette size={24} style={{ color: colors.warning }} />
                <h2 className="text-xl font-bold text-white">Appearance</h2>
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
                  Preview
                </label>
                <div
                  className="p-4 rounded-xl border-2"
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    borderColor: "rgba(255, 255, 255, 0.1)",
                  }}
                >
                  <div className="flex items-center gap-3">
                    <div
                      className="w-12 h-12 rounded-lg flex items-center justify-center text-2xl"
                      style={{ background: `${formData.color}20` }}
                    >
                      {formData.icon}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-white">
                        {formData.title || "Payment Title"}
                      </p>
                      <p
                        className="text-sm"
                        style={{ color: colors.textSecondary }}
                      >
                        {formData.amount
                          ? formatCurrency(parseFloat(formData.amount))
                          : "₦0"}{" "}
                        | Due:{" "}
                        {formData.deadline
                          ? formatDate(formData.deadline, "short")
                          : "Not set"}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Submit Buttons */}
          <motion.div
            className="flex gap-4"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
          >
            <CustomButton
              type="submit"
              loading={loading}
              disabled={loading}
              className="flex-1"
            >
              <Check size={20} />
              Create Payment
            </CustomButton>

            <CustomButton
              type="button"
              onClick={() => navigate(-1)}
              variant="secondary"
              disabled={loading}
            >
              Cancel
            </CustomButton>
          </motion.div>
        </form>
      </div>
      <Footer />
    </div>
  );
}
