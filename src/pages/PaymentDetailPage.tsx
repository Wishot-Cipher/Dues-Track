/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Calendar,
  RefreshCw,
  Info,
  Sparkles,
  TrendingUp,
  Banknote,
} from "lucide-react";
import { supabase } from "@/config/supabase";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/useToast";
import { colors, gradients } from "@/config/colors";
import GlassCard from "@/components/ui/GlassCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatCurrency, formatDate } from "@/utils/formatters";
import PaymentMethodSelector from "@/components/student/PaymentMethodSelector";
import QRCodeGenerator from "@/components/student/QRCodeGenerator";
import PayForOthersModal from "@/components/student/PayForOthersModal";
import PaymentSubmissionFlow from "@/components/student/PaymentSubmissionFlow";
import Footer from "@/components/Footer";
import notificationService from "@/services/notificationService";
import { SuccessCelebration } from "@/components/ui/Confetti";
import PageWrapper from "@/components/ui/PageWrapper";

type PaymentMethod = "bank_transfer" | "cash" | "pos";

interface PaymentType {
  id: string;
  title: string;
  description: string;
  amount: number;
  deadline: string;
  category: string;
  icon: string;
  color: string;
  bank_name: string;
  account_name: string;
  account_number: string;
  allow_partial: boolean;
  approver_name: string;
}

interface ExistingPayment {
  id: string;
  amount: number;
  status: string;
  transaction_ref: string;
  receipt_url: string;
  notes: string | null;
  payment_method: string;
  rejection_reason: string | null;
  submitted_at: string;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

interface Student {
  id: string;
  full_name: string;
  reg_number: string;
  level: string;
}

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const toast = useToast();

  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [existingPayments, setExistingPayments] = useState<ExistingPayment[]>(
    []
  );
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Payment flow state
  const [step, setStep] = useState<"method" | "qr" | "upload">("method");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(
    null
  );
  const [showPayForOthers, setShowPayForOthers] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [includeSelf, setIncludeSelf] = useState(false);

  // Form state
  const [paymentOption, setPaymentOption] = useState<"full" | "partial">(
    "full"
  );
  const [amount, setAmount] = useState<number>(0);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");

  // Success celebration state
  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState("");

  // Calculate payment status
  const totalPaid = existingPayments
    .filter((p) => p.status === "approved")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const paymentTypeAmount = Number(paymentType?.amount) || 0;
  const remainingAmount = paymentTypeAmount - totalPaid;
  const isFullyPaid = remainingAmount <= 0;
  const hasPendingPayment = existingPayments.some(
    (p) => p.status === "pending"
  );
  // Check if payment was waived (has WAIVED- prefix in transaction_ref)
  const isWaived = existingPayments.some(
    (p) => p.status === "approved" && p.transaction_ref?.startsWith("WAIVED-")
  );
  const progressPercentage =
    paymentTypeAmount > 0 ? (totalPaid / paymentTypeAmount) * 100 : 0;

  // Compute current user's accumulated late fees for this payment type
  const paymentDeadline = paymentType?.deadline ? new Date(paymentType.deadline) : null;
  const perDayLate = Number((paymentType as any)?.late_fee_per_day || 0);
  let currentUserAccumulatedLate = 0;
  try {
    if (paymentDeadline && new Date() > paymentDeadline && perDayLate > 0) {
      // Sum approved payments submitted on-or-before the deadline
      const totalPaidBeforeDeadline = existingPayments
        .filter(p => p.status === 'approved')
        .reduce((sum, p) => {
          try {
            // Use submitted_at if available, otherwise fall back to created_at or reviewed_at
            const submittedStr = p.submitted_at || (p as any).created_at || p.reviewed_at;
            const submitted = submittedStr ? new Date(submittedStr) : null;
            if (submitted && submitted.getTime() <= paymentDeadline.getTime()) {
              return sum + (Number(p.amount) || 0);
            }
          } catch (e) {
            // ignore parse errors
          }
          return sum;
        }, 0);

      const remainingAtDeadline = Math.max(0, (Number(paymentType?.amount) || 0) - totalPaidBeforeDeadline);

      // If the student had fully paid by the deadline, no late fee should apply
      if (remainingAtDeadline <= 0) {
        currentUserAccumulatedLate = 0;
      } else {
        const daysOverdue = Math.floor((Date.now() - paymentDeadline.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 0) currentUserAccumulatedLate = daysOverdue * perDayLate;
      }
    }
  } catch (e) {
    currentUserAccumulatedLate = 0;
  }

  const currentUserOutstanding = Math.max(0, remainingAmount) + currentUserAccumulatedLate;

  useEffect(() => {
    fetchPaymentDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (paymentType) {
      setAmount(paymentOption === "full" ? currentUserOutstanding : 0);
    }
  }, [paymentOption, paymentType, currentUserOutstanding]);

  const fetchPaymentDetails = async () => {
    try {
      setLoading(true);

      // Fetch payment type details
      const { data: typeData, error: typeError } = await supabase
        .from("payment_types")
        .select("*")
        .eq("id", id)
        .single();

      if (typeError) throw typeError;

      setPaymentType(typeData);

      // Get ALL payments for this student and payment type
      const { data: paymentsData } = await supabase
        .from("payments")
        .select("*")
        .eq("payment_type_id", id)
        .eq("student_id", user?.id)
        .order("created_at", { ascending: false });

      setExistingPayments(paymentsData || []);
    } catch (error) {
      console.error("Error fetching payment details:", error);
      toast.error("Failed to load payment details");
    } finally {
      setLoading(false);
    }
  };

  const handleMethodSelect = (method: PaymentMethod) => {
    setSelectedMethod(method);
    if (method === "cash") {
      setStep("qr");
    } else {
      setStep("upload");
    }
  };

  const handleSubmitPayment = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validate based on payment method
    if (selectedMethod !== "cash" && !receiptFile) {
      toast.error("Please upload a receipt");
      return;
    }

    if (selectedMethod !== "cash" && !transactionRef.trim()) {
      toast.error("Please enter transaction reference");
      return;
    }

    if (paymentOption === "partial" && amount <= 0) {
      toast.error("Please enter a valid amount");
      return;
    }

    if (paymentOption === "partial" && amount > currentUserOutstanding) {
      toast.error(
        `Amount cannot exceed remaining balance of ${formatCurrency(
          currentUserOutstanding
        )}`
      );
      return;
    }

    try {
      setSubmitting(true);

      // Determine students to pay for
      if (!user) {
        toast.error("User not found");
        return;
      }

      // Build list of students based on selectedStudents and whether they're paying for themselves
      const students: Student[] = [];
      
      // Add selected other students
      if (selectedStudents.length > 0) {
        students.push(...selectedStudents);
      }
      
      // Add current user only if includeSelf is true (from Pay for Others modal)
      // OR if they're paying for themselves only (no selectedStudents)
      if (includeSelf || (selectedStudents.length === 0 && !isFullyPaid)) {
        students.push({
          id: user.id,
          full_name: user.full_name,
          reg_number: user.reg_number,
          level: user.level,
          // Attach computed outstanding (including late fees) so insertion uses correct amount
          ...( { outstanding: currentUserOutstanding } as any ),
        } as any);
      }

      if (students.length === 0) {
        toast.error("No students to pay for");
        return;
      }

      for (const student of students) {
        let receiptUrl = "";

        // Upload receipt for bank_transfer and pos (not cash)
        if (selectedMethod !== "cash" && receiptFile) {
          const fileExt = receiptFile.name.split(".").pop();
          const fileName = `${student.id}_${Date.now()}_${Math.random()
            .toString(36)
            .substring(7)}.${fileExt}`;
          const filePath = `receipts/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from("payment-receipts")
            .upload(filePath, receiptFile);

          if (uploadError) throw uploadError;

          const { data: urlData } = supabase.storage
            .from("payment-receipts")
            .getPublicUrl(filePath);

          receiptUrl = urlData.publicUrl;
        }

        // Generate transaction ref for cash if not provided
        const finalTransactionRef =
          selectedMethod === "cash"
            ? `CASH-QR-${student.reg_number}-${Date.now()}`
            : `${transactionRef}-${student.reg_number}`;
        // Insert payment (use per-student outstanding when paying full)
        const amountToInsert = paymentOption === 'full' ? (student as any).outstanding ?? currentUserOutstanding : amount;
        const { data: insertedPayment, error: insertError } = await supabase
          .from("payments")
          .insert({
            student_id: student.id,
            payment_type_id: id,
            amount: amountToInsert,
            transaction_ref: finalTransactionRef,
            receipt_url: receiptUrl || null,
            notes: notes.trim() || null,
            status: "pending",
            payment_method: selectedMethod,
            paid_by: student.id !== user.id ? user.id : null, // Track who paid on behalf of others
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Send notification to student about payment submission (use actual inserted amount)
        if (insertedPayment) {
          const notifyAmount = paymentOption === 'full' ? ((student as any).outstanding ?? currentUserOutstanding ?? amount) : amount;
          await notificationService.sendPaymentPendingNotification(
            student.id,
            student.full_name,
            paymentType?.title || "Payment",
            notifyAmount,
            insertedPayment.id
          );
        }
      }

      const message =
        selectedStudents.length > 0
          ? `Payment submitted for ${selectedStudents.length + (includeSelf ? 1 : 0)} student(s)!`
          : "Payment submitted successfully!";

      // Show celebration with confetti
      setCelebrationMessage(message);
      setShowCelebration(true);
    } catch (error: unknown) {
      console.error("Error submitting payment:", error);

      if (error && typeof error === "object" && "code" in error) {
        const dbError = error as { code: string; message: string };
        if (dbError.code === "23505") {
          toast.error("This transaction reference has already been used.");
        } else {
          toast.error(dbError.message || "Failed to submit payment");
        }
      } else {
        toast.error("Failed to submit payment");
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleResubmitRejected = (rejectedPayment: ExistingPayment) => {
    // Pre-fill form with rejected payment details
    setTransactionRef(rejectedPayment.transaction_ref);
    setNotes(
      `Resubmission of rejected payment. Previous reason: ${rejectedPayment.rejection_reason}`
    );
    setStep("method");
  };

  if (loading) {
    return (
      <LoadingSpinner fullScreen size="xl" text="Loading payment details..." />
    );
  }

  if (!paymentType) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)' }}
      >
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center max-w-md"
        >
          <motion.div
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: `${colors.statusUnpaid}15`, border: `1px solid ${colors.statusUnpaid}30` }}
          >
            <AlertCircle className="w-10 h-10" style={{ color: colors.statusUnpaid }} />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-3">
            Payment Not Found
          </h2>
          <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
            This payment type may have been removed or the link is invalid. Please check your dashboard for available payments.
          </p>
          <motion.button
            onClick={() => navigate("/dashboard")}
            className="px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 mx-auto transition-all"
            style={{
              background: gradients.primary,
              color: 'white',
              boxShadow: `0 4px 20px ${colors.primary}40`,
            }}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
          >
            <ArrowLeft size={20} />
            Back to Dashboard
          </motion.button>
        </motion.div>
      </div>
    );
  }
  return (
    <PageWrapper noPadding className="py-2 sm:py-6" style={{ background: '#0A0705' }}>
      {/* Success Celebration Modal */}
      <SuccessCelebration
        isVisible={showCelebration}
        title="Payment Submitted! 🎉"
        subtitle={celebrationMessage + " Awaiting approval."}
        onClose={() => {
          setShowCelebration(false);
          navigate("/dashboard", { state: { refresh: true }, replace: true });
        }}
        autoCloseDuration={4000}
      />

      {/* Main Container */}
      <div className="w-full max-w-4xl mx-auto px-2 sm:px-6 lg:px-8 overflow-x-hidden">

        <div className="w-full space-y-6 relative z-10">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center justify-center sm:justify-start gap-2 mb-4 px-3 py-2 rounded-lg transition-colors w-auto outline outline-orange-500 mt-2"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) =>
                (e.currentTarget.style.color = colors.primary)
              }
              onMouseLeave={(e) =>
                (e.currentTarget.style.color = colors.textSecondary)
              }
            >
              <ArrowLeft size={20} />
              <span className="font-medium">Back to Dashboard</span>
            </button>
          </motion.div>

          {/* Payment Type Info - Enhanced */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <div 
              className="rounded-2xl overflow-hidden"
              style={{ 
                background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, rgba(255, 107, 53, 0.02) 100%)',
                border: `1px solid ${colors.primary}20`,
              }}
            >
              {/* Header with gradient accent */}
              <div 
                className="p-5 sm:p-6"
                style={{ 
                  background: `linear-gradient(135deg, ${colors.primary}15 0%, transparent 100%)`,
                  borderBottom: `1px solid ${colors.primary}15`
                }}
              >
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 w-full">
                  <motion.div
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-4xl shrink-0 relative"
                    style={{ 
                      background: `linear-gradient(135deg, ${paymentType.color}30 0%, ${paymentType.color}10 100%)`,
                      border: `1px solid ${paymentType.color}40`,
                      boxShadow: `0 8px 32px ${paymentType.color}20`
                    }}
                    whileHover={{ scale: 1.05, rotate: 5 }}
                  >
                    {paymentType.icon}
                    <div 
                      className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full flex items-center justify-center"
                      style={{ background: gradients.primary }}
                    >
                      <Sparkles className="w-3.5 h-3.5 text-white" />
                    </div>
                  </motion.div>
                  <div className="flex-1 text-center sm:text-left">
                    <div className="flex items-center justify-center sm:justify-start gap-2 mb-2">
                      <h1 className="text-xl sm:text-3xl font-bold text-white">
                        {paymentType.title}
                      </h1>
                      {paymentType.allow_partial && (
                        <span 
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}
                        >
                          PARTIAL OK
                        </span>
                      )}
                    </div>
                    <p
                      className="text-sm sm:text-base mb-4"
                      style={{ color: colors.textSecondary }}
                    >
                      {paymentType.description}
                    </p>
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                      <div 
                        className="flex items-center gap-2 px-3 py-2 rounded-xl"
                        style={{ background: `${colors.primary}15`, border: `1px solid ${colors.primary}30` }}
                      >
                        <Banknote className="w-4 h-4" style={{ color: colors.primary }} />
                        <span className="text-lg sm:text-xl font-bold" style={{ color: colors.primary }}>
                          {formatCurrency(paymentOption === 'full' ? currentUserOutstanding : amount)}
                        </span>
                      </div>
                      <div 
                        className="flex items-center gap-2 px-3 py-2 rounded-xl"
                        style={{ background: `${colors.warning}15`, border: `1px solid ${colors.warning}30` }}
                      >
                        <Calendar className="w-4 h-4" style={{ color: colors.warning }} />
                        <span className="text-sm font-medium" style={{ color: colors.warning }}>
                          Due: {formatDate(paymentType.deadline, "long")}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Payment Status Summary - Enhanced */}
          {(totalPaid > 0 || existingPayments.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <div 
                className="rounded-2xl overflow-hidden"
                style={{ 
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}
              >
                <div 
                  className="px-5 py-4 flex items-center gap-3"
                  style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
                >
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${colors.accentMint}15` }}
                  >
                    <TrendingUp className="w-5 h-5" style={{ color: colors.accentMint }} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Payment Progress</h3>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Track your payment status</p>
                  </div>
                </div>

                <div className="p-5">
                  <div className="grid grid-cols-3 gap-3 mb-5">
                    <motion.div
                      className="text-center p-4 rounded-xl relative overflow-hidden"
                      style={{ 
                        background: `linear-gradient(135deg, ${colors.primary}10 0%, ${colors.primary}05 100%)`,
                        border: `1px solid ${colors.primary}20`
                      }}
                      whileHover={{ scale: 1.02 }}
                    >
                      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: gradients.primary }} />
                      <p className="text-[10px] sm:text-xs mb-1 font-medium" style={{ color: colors.textSecondary }}>
                        {currentUserAccumulatedLate > 0 ? 'BASE DUE' : 'TOTAL DUE'}
                      </p>
                      <p className="text-base sm:text-xl font-bold text-white">
                        {formatCurrency(paymentTypeAmount)}
                      </p>
                    </motion.div>
                    <motion.div
                      className="text-center p-4 rounded-xl relative overflow-hidden"
                      style={{ 
                        background: `linear-gradient(135deg, ${colors.statusPaid}10 0%, ${colors.statusPaid}05 100%)`,
                        border: `1px solid ${colors.statusPaid}20`
                      }}
                      whileHover={{ scale: 1.02 }}
                    >
                      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: colors.statusPaid }} />
                      <p className="text-[10px] sm:text-xs mb-1 font-medium" style={{ color: colors.textSecondary }}>
                        PAID
                      </p>
                      <p className="text-base sm:text-xl font-bold" style={{ color: colors.statusPaid }}>
                        {formatCurrency(totalPaid)}
                      </p>
                    </motion.div>
                    <motion.div
                      className="text-center p-4 rounded-xl relative overflow-hidden"
                      style={{ 
                        background: `linear-gradient(135deg, ${currentUserOutstanding <= 0 ? colors.statusPaid : colors.warning}10 0%, ${currentUserOutstanding <= 0 ? colors.statusPaid : colors.warning}05 100%)`,
                        border: `1px solid ${currentUserOutstanding <= 0 ? colors.statusPaid : colors.warning}20`
                      }}
                      whileHover={{ scale: 1.02 }}
                    >
                      <div className="absolute top-0 left-0 right-0 h-1" style={{ background: currentUserOutstanding <= 0 ? colors.statusPaid : colors.warning }} />
                      <p className="text-[10px] sm:text-xs mb-1 font-medium" style={{ color: colors.textSecondary }}>
                        REMAINING
                      </p>
                      <p className="text-base sm:text-xl font-bold" style={{ color: currentUserOutstanding <= 0 ? colors.statusPaid : colors.warning }}>
                        {formatCurrency(Math.max(0, currentUserOutstanding))}
                      </p>
                    </motion.div>
                  </div>

                  {/* Late Fee Breakdown - Only show if there are late fees */}
                  {currentUserAccumulatedLate > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-5 p-4 rounded-xl"
                      style={{ 
                        background: `linear-gradient(135deg, ${colors.statusUnpaid}08 0%, transparent 100%)`,
                        border: `1px solid ${colors.statusUnpaid}20`
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4" style={{ color: colors.statusUnpaid }} />
                        <span className="text-sm font-semibold" style={{ color: colors.statusUnpaid }}>Late Payment Fees Applied</span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>Base Amount</p>
                          <p className="font-semibold text-white">{formatCurrency(paymentTypeAmount)}</p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>Late Fees</p>
                          <p className="font-semibold" style={{ color: colors.statusUnpaid }}>+{formatCurrency(currentUserAccumulatedLate)}</p>
                        </div>
                        <div className="col-span-2 pt-2 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                          <div className="flex justify-between items-center">
                            <p className="text-xs" style={{ color: colors.textSecondary }}>Total Due (incl. late fees)</p>
                            <p className="font-bold text-white">{formatCurrency(paymentTypeAmount + currentUserAccumulatedLate)}</p>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs mt-3" style={{ color: colors.textSecondary }}>
                        Late fee: {formatCurrency(perDayLate)}/day × {Math.floor((Date.now() - (paymentDeadline?.getTime() || 0)) / (1000 * 60 * 60 * 24))} days overdue
                      </p>
                    </motion.div>
                  )}

                  {/* Enhanced Progress Bar */}
                  <div className="relative">
                    <div 
                      className="w-full h-4 rounded-full overflow-hidden"
                      style={{ background: "rgba(255, 255, 255, 0.1)" }}
                    >
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, progressPercentage)}%` }}
                        transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                        className="h-full rounded-full relative"
                        style={{ background: gradients.primary }}
                      >
                        {/* Shimmer effect */}
                        <div 
                          className="absolute inset-0 opacity-50"
                          style={{ 
                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                            animation: 'shimmer 2s infinite'
                          }} 
                        />
                      </motion.div>
                    </div>
                    <div className="flex justify-between items-center mt-2">
                      <p className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                        {progressPercentage.toFixed(0)}% Complete
                      </p>
                      {isFullyPaid && (
                        <div className="flex items-center gap-1.5 text-xs font-semibold" style={{ color: colors.statusPaid }}>
                          <CheckCircle className="w-4 h-4" />
                          Fully Paid
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* Existing Payments List */}
          {existingPayments.length > 0 && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.3 }}
            >
              <GlassCard className="w-full">
                <h3 className="text-lg font-bold text-white mb-4 text-center sm:text-left">
                  Payment History
                </h3>
                <div className="space-y-3">
                  {existingPayments.map((payment) => {
                    const paymentIsWaived = payment.transaction_ref?.startsWith("WAIVED-");
                    const statusColor = paymentIsWaived 
                      ? '#6366F1' // Indigo for waived
                      : payment.status === "approved"
                        ? colors.statusPaid
                        : payment.status === "rejected"
                          ? colors.statusUnpaid
                          : colors.warning;
                    const statusLabel = paymentIsWaived 
                      ? 'WAIVED' 
                      : payment.status.toUpperCase();
                    
                    return (
                    <div
                      key={payment.id}
                      className="p-4 rounded-lg border"
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        borderColor: `${statusColor}40`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {payment.status === "approved" && (
                              <CheckCircle
                                className="w-5 h-5"
                                style={{ color: statusColor }}
                              />
                            )}
                            {payment.status === "rejected" && (
                              <XCircle
                                className="w-5 h-5"
                                style={{ color: colors.statusUnpaid }}
                              />
                            )}
                            {payment.status === "pending" && (
                              <Clock
                                className="w-5 h-5"
                                style={{ color: colors.warning }}
                              />
                            )}
                            <span 
                              className="font-bold"
                              style={{ 
                                color: paymentIsWaived ? '#6366F1' : 'white',
                                textDecoration: paymentIsWaived ? 'line-through' : 'none'
                              }}
                            >
                              {formatCurrency(payment.amount)}
                            </span>
                            <span
                              className="px-2 py-1 rounded-full text-xs font-medium"
                              style={{
                                background: `${statusColor}20`,
                                color: statusColor,
                              }}
                            >
                              {statusLabel}
                            </span>
                          </div>
                          <p
                            className="text-sm mb-1"
                            style={{ color: colors.textSecondary }}
                          >
                            Ref: {payment.transaction_ref}
                          </p>
                          <p
                            className="text-sm"
                            style={{ color: colors.textSecondary }}
                          >
                            {paymentIsWaived ? 'Waived' : 'Submitted'}:{" "}
                            {formatDate(payment.submitted_at, "long")}
                          </p>
                          {payment.rejection_reason && (
                            <div
                              className="mt-2 p-2 rounded"
                              style={{ background: `${colors.statusUnpaid}10` }}
                            >
                              <p
                                className="text-sm font-medium"
                                style={{ color: colors.statusUnpaid }}
                              >
                                Rejection Reason: {payment.rejection_reason}
                              </p>
                            </div>
                          )}
                        </div>
                        {payment.status === "rejected" && (
                          <button
                            onClick={() => handleResubmitRejected(payment)}
                            className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium text-white transition-all"
                            style={{ background: gradients.primary }}
                          >
                            <RefreshCw className="w-4 h-4" />
                            Resubmit
                          </button>
                        )}
                      </div>
                    </div>
                    );
                  })}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Fully Paid or Waived Message */}
          {isFullyPaid && (
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.4 }}
            >
              <GlassCard className="w-full">
                <div className="text-center p-8">
                  <CheckCircle
                    className="w-16 h-16 mx-auto mb-4"
                    style={{ color: isWaived ? '#6366F1' : colors.statusPaid }}
                  />
                  <h2 className="text-2xl font-bold text-white mb-2">
                    {isWaived ? 'Payment Waived! 🔓' : 'Payment Complete! 🎉'}
                  </h2>
                  <p style={{ color: colors.textSecondary }}>
                    {isWaived 
                      ? 'This payment has been waived by the class administration.'
                      : 'You have fully paid for this requirement.'}
                  </p>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Cannot Pay Message (if has pending) */}
          {!isFullyPaid && hasPendingPayment && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
            >
              <GlassCard className="w-full">
                <div
                  className="flex items-start gap-4 p-4"
                  style={{ background: `${colors.warning}10` }}
                >
                  <Info
                    className="w-6 h-6 shrink-0 mt-1"
                    style={{ color: colors.warning }}
                  />
                  <div>
                    <p className="font-bold text-white mb-1">
                      Payment Pending Review
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: colors.textSecondary }}
                    >
                      You have a payment awaiting approval. Please wait for the
                      admin to review your submission before making another
                      payment.
                    </p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Payment Form - Only show if not fully paid and no pending payment */}
          {!isFullyPaid && !hasPendingPayment && (
            <>
              {step === "method" && (
                <motion.div
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: 0.4 }}
                >
                  <PaymentMethodSelector
                    selectedMethod={selectedMethod}
                    onMethodSelect={handleMethodSelect}
                    onPayForOthers={() => setShowPayForOthers(true)}
                    showPayForOthers={true}
                  />
                </motion.div>
              )}

              {step === "qr" && selectedMethod === "cash" && user && (() => {
                // Build list of students for total calculation (include self if requested)
                // Attach outstanding to all students in selectedStudents
                const selectedWithOutstanding = selectedStudents.map(s => {
                  // TODO: Replace with real outstanding calculation for each student if available
                  // For now, use currentUserOutstanding for all (should be replaced with per-student logic)
                  return { ...s, outstanding: currentUserOutstanding };
                });
                const studentsForTotal = [...selectedWithOutstanding];
                const isSoloPayment = selectedStudents.length === 0 && !includeSelf;
                // Include the current user when requested or when this is a solo payment
                if ((includeSelf || isSoloPayment) && !studentsForTotal.some(s => s.id === user.id)) {
                  studentsForTotal.push({ id: user.id, full_name: user.full_name, reg_number: user.reg_number, level: user.level, outstanding: currentUserOutstanding } as any);
                }
                const effectiveStudentCount = studentsForTotal.length > 0 ? studentsForTotal.length : 1;
                // If paying full, sum per-student outstanding when available, otherwise use entered amount
                const totalAmount = paymentOption === 'full'
                  ? studentsForTotal.reduce((sum, s) => sum + (Number((s as any).outstanding ?? currentUserOutstanding ?? amount) || 0), 0)
                  : (effectiveStudentCount * amount);
                return (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                  >
                    <QRCodeGenerator
                      studentId={user.id}
                      studentName={user.full_name}
                      studentRegNumber={user.reg_number}
                      paymentTypeId={id!}
                      paymentTypeName={paymentType.title}
                      amount={totalAmount}
                      totalStudents={effectiveStudentCount}
                      selectedStudents={selectedWithOutstanding}
                      includeSelf={isSoloPayment ? true : includeSelf}
                      onBack={() => setStep("method")}
                    />
                  </motion.div>
                );
              })()}

              {step === "upload" &&
                (selectedMethod === "bank_transfer" ||
                  selectedMethod === "pos") && (
                  <PaymentSubmissionFlow
                    paymentMethod={selectedMethod as "bank_transfer" | "pos"}
                    paymentType={paymentType}
                    currentUserOutstanding={currentUserOutstanding}
                    accumulatedLateFees={currentUserAccumulatedLate}
                    allowPartial={paymentType.allow_partial}
                    selectedStudents={selectedStudents}
                    includeSelf={includeSelf}
                    currentUser={{
                      id: user?.id || "",
                      full_name: user?.full_name || "",
                      reg_number: user?.reg_number || "",
                      level: user?.level,
                    }}
                    onBack={() => setStep("method")}
                    onSubmit={async (data) => {
                      // Create a synthetic form event to reuse existing logic
                      setTransactionRef(data.transactionRef);
                      setReceiptFile(data.receiptFile);
                      setNotes(data.notes);
                      setPaymentOption(data.paymentOption);
                      setAmount(data.amount);
                      
                      // Trigger submit with validated data
                      const fakeEvent = { preventDefault: () => {} } as React.FormEvent;
                      await handleSubmitPayment(fakeEvent);
                    }}
                    submitting={submitting}
                  />
                )}
            </>
          )}
        </div>
      </div>

      {/* Pay For Others Modal */}
      <PayForOthersModal
        isOpen={showPayForOthers}
        onClose={() => setShowPayForOthers(false)}
        paymentTypeId={id!}
        paymentTypeName={paymentType.title}
        amount={paymentType.amount}
        currentStudentId={user?.id || ""}
        currentUserHasPaid={isFullyPaid}
        onProceed={(students, _totalAmount, includeSelfFlag) => {
          setSelectedStudents(students);
          setIncludeSelf(includeSelfFlag);
          setShowPayForOthers(false);
          setStep("method");
        }}
      />
      <Footer />
    </PageWrapper>
  );
}
