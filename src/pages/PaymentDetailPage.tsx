import { useState, useEffect } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft,
  Copy,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Loader2,
  Calendar,
  Building2,
  RefreshCw,
  Info,
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
import Footer from "@/components/Footer";
import notificationService from "@/services/notificationService";
import FileUploader from "@/components/ui/FileUploader";

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

  // Form state
  const [paymentOption, setPaymentOption] = useState<"full" | "partial">(
    "full"
  );
  const [amount, setAmount] = useState<number>(0);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [transactionRef, setTransactionRef] = useState("");
  const [notes, setNotes] = useState("");

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
  const progressPercentage =
    paymentTypeAmount > 0 ? (totalPaid / paymentTypeAmount) * 100 : 0;

  useEffect(() => {
    fetchPaymentDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (paymentType) {
      setAmount(paymentOption === "full" ? remainingAmount : 0);
    }
  }, [paymentOption, paymentType, remainingAmount]);

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

  const copyAccountNumber = () => {
    if (paymentType?.account_number) {
      navigator.clipboard.writeText(paymentType.account_number);
      toast.success("Account number copied!");
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

    if (paymentOption === "partial" && amount > remainingAmount) {
      toast.error(
        `Amount cannot exceed remaining balance of ${formatCurrency(
          remainingAmount
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

      // Always include yourself, plus any selected students
      const students =
        selectedStudents.length > 0
          ? [
              {
                id: user.id,
                full_name: user.full_name,
                reg_number: user.reg_number,
                level: user.level,
              },
              ...selectedStudents,
            ]
          : [
              {
                id: user.id,
                full_name: user.full_name,
                reg_number: user.reg_number,
                level: user.level,
              },
            ];

      for (const student of students) {
        let receiptUrl = "";

        // Upload receipt only for bank_transfer and pos
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

        // Insert payment
        const { data: insertedPayment, error: insertError } = await supabase
          .from("payments")
          .insert({
            student_id: student.id,
            payment_type_id: id,
            amount: paymentOption === "full" ? remainingAmount : amount,
            transaction_ref: finalTransactionRef,
            receipt_url: receiptUrl || null,
            notes: notes.trim() || null,
            status: "pending",
            payment_method: selectedMethod,
          })
          .select()
          .single();

        if (insertError) throw insertError;

        // Send notification to student about payment submission
        if (insertedPayment) {
          await notificationService.sendPaymentPendingNotification(
            student.id,
            student.full_name,
            paymentType?.title || "Payment",
            paymentOption === "full" ? remainingAmount : amount,
            insertedPayment.id
          );
        }
      }

      const message =
        selectedStudents.length > 0
          ? `Payment submitted for ${selectedStudents.length + 1} student(s)!`
          : "Payment submitted successfully!";

      toast.success(message + " Awaiting approval.");
      navigate("/dashboard", { state: { refresh: true }, replace: true });
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
        className="min-h-screen flex items-center justify-center"
        style={{ background: gradients.darkBackground }}
      >
        <GlassCard>
          <div className="text-center p-8">
            <AlertCircle
              className="w-16 h-16 mx-auto mb-4"
              style={{ color: colors.statusUnpaid }}
            />
            <h2 className="text-2xl font-bold text-white mb-2">
              Payment Type Not Found
            </h2>
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center justify-center gap-2 mb-4 px-4 py-2 rounded-lg transition-colors w-full sm:w-auto"
              style={{
                color: colors.textPrimary,
                background: "rgba(255, 255, 255, 0.05)",
              }}
            >
              <ArrowLeft size={20} />
              <span className="font-medium">Back to Dashboard</span>
            </button>
          </div>
        </GlassCard>
      </div>
    );
  }
  return (
    <div
      className="min-h-screen py-2 sm:py-6 overflow-x-hidden"
      style={{ background: gradients.darkBackground }}
    >
      {/* ECE Logo Background - Only show on large screens */}
      <div className="hidden lg:block fixed right-0 top-1/2 -translate-y-1/2 w-[600px] h-[600px] opacity-[0.08] pointer-events-none z-0 ">
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

      {/* Main Container - FIXED */}
      <div className="container px-3 sm:px-6 lg:px-8 max-w-4xl mx-auto">
        <div className="w-full space-y-6 relative z-10">
          {/* Header */}
          <motion.div
            initial={{ opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center justify-center sm:justify-start gap-2 mb-4 px-4 py-4 rounded-lg transition-colors w-full sm:w-auto"
              style={{
                color: colors.textPrimary,
                background: "rgba(255, 255, 255, 0.05)",
              }}
            >
              <ArrowLeft size={20} />
              <span className="font-medium">Back to Dashboard</span>
            </button>
          </motion.div>

          {/* Payment Type Info */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <GlassCard>
              <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 w-full">
                <div
                  className="w-16 h-16 sm:w-16 sm:h-16 rounded-2xl flex items-center justify-center text-3xl shrink-0"
                  style={{ background: `${paymentType.color}20` }}
                >
                  {paymentType.icon}
                </div>
                <div className="flex-1 text-center sm:text-left">
                  <h1 className=" text-lg sm:text-3xl font-bold text-white mb-2">
                    {paymentType.title}
                  </h1>
                  <p
                    className="text-sm sm:text-base mb-3"
                    style={{ color: colors.textSecondary }}
                  >
                    {paymentType.description}
                  </p>
                  <div className="flex flex-wrap items-center justify-center sm:justify-start gap-4">
                    <div className="flex items-center gap-2">
                      <span
                        className="text-xl font-bold"
                        style={{ color: colors.primary }}
                      >
                        ₦
                      </span>
                      <span className="text-lg sm:text-xl font-bold text-white">
                        {formatCurrency(paymentType.amount)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Calendar
                        className="w-5 h-5"
                        style={{ color: colors.warning }}
                      />
                      <span
                        className="text-sm sm:text-base"
                        style={{ color: colors.textSecondary }}
                      >
                        Due: {formatDate(paymentType.deadline, "long")}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </GlassCard>
          </motion.div>

          {/* Payment Status Summary */}
          {(totalPaid > 0 || existingPayments.length > 0) && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.2 }}
            >
              <GlassCard className="w-full">
                <h3 className="text-lg font-bold text-white mb-4 text-center sm:text-left">
                  Payment Status
                </h3>

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4 mb-4">
                  <div
                    className="text-center sm:text-left p-3 rounded-lg"
                    style={{ background: "rgba(255, 255, 255, 0.03)" }}
                  >
                    <p
                      className="text-xs sm:text-sm mb-1"
                      style={{ color: colors.textSecondary }}
                    >
                      Total Amount
                    </p>
                    <p className="text-lg sm:text-xl font-bold text-white">
                      {formatCurrency(paymentTypeAmount)}
                    </p>
                  </div>
                  <div
                    className="text-center sm:text-left p-3 rounded-lg"
                    style={{ background: "rgba(255, 255, 255, 0.03)" }}
                  >
                    <p
                      className="text-xs sm:text-sm mb-1"
                      style={{ color: colors.textSecondary }}
                    >
                      Paid So Far
                    </p>
                    <p
                      className="text-lg sm:text-xl font-bold"
                      style={{ color: colors.statusPaid }}
                    >
                      {formatCurrency(totalPaid)}
                    </p>
                  </div>
                  <div
                    className="text-center sm:text-left p-3 rounded-lg col-span-2 sm:col-span-1"
                    style={{ background: "rgba(255, 255, 255, 0.03)" }}
                  >
                    <p
                      className="text-xs sm:text-sm mb-1"
                      style={{ color: colors.textSecondary }}
                    >
                      Remaining
                    </p>
                    <p
                      className="text-lg sm:text-xl font-bold"
                      style={{
                        color: isFullyPaid
                          ? colors.statusPaid
                          : colors.statusUnpaid,
                      }}
                    >
                      {formatCurrency(Math.max(0, remainingAmount))}
                    </p>
                  </div>
                </div>

                {/* Progress Bar */}
                <div
                  className="w-full h-3 rounded-full overflow-hidden"
                  style={{ background: "rgba(255, 255, 255, 0.1)" }}
                >
                  <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, progressPercentage)}%` }}
                    transition={{ duration: 1, delay: 0.5 }}
                    className="h-full rounded-full"
                    style={{ background: gradients.primary }}
                  />
                </div>
                <p
                  className="text-sm mt-2 text-center"
                  style={{ color: colors.textSecondary }}
                >
                  {progressPercentage.toFixed(1)}% Complete
                </p>
              </GlassCard>
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
                  {existingPayments.map((payment) => (
                    <div
                      key={payment.id}
                      className="p-4 rounded-lg border"
                      style={{
                        background: "rgba(255, 255, 255, 0.03)",
                        borderColor:
                          payment.status === "approved"
                            ? `${colors.statusPaid}40`
                            : payment.status === "rejected"
                            ? `${colors.statusUnpaid}40`
                            : `${colors.warning}40`,
                      }}
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            {payment.status === "approved" && (
                              <CheckCircle
                                className="w-5 h-5"
                                style={{ color: colors.statusPaid }}
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
                            <span className="font-bold text-white">
                              {formatCurrency(payment.amount)}
                            </span>
                            <span
                              className="px-2 py-1 rounded-full text-xs font-medium"
                              style={{
                                background:
                                  payment.status === "approved"
                                    ? `${colors.statusPaid}20`
                                    : payment.status === "rejected"
                                    ? `${colors.statusUnpaid}20`
                                    : `${colors.warning}20`,
                                color:
                                  payment.status === "approved"
                                    ? colors.statusPaid
                                    : payment.status === "rejected"
                                    ? colors.statusUnpaid
                                    : colors.warning,
                              }}
                            >
                              {payment.status.toUpperCase()}
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
                            Submitted:{" "}
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
                  ))}
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* Fully Paid Message */}
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
                    style={{ color: colors.statusPaid }}
                  />
                  <h2 className="text-2xl font-bold text-white mb-2">
                    Payment Complete! 🎉
                  </h2>
                  <p style={{ color: colors.textSecondary }}>
                    You have fully paid for this requirement.
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

              {step === "qr" && selectedMethod === "cash" && user && (
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
                    amount={paymentOption === "full" ? remainingAmount : amount}
                    onBack={() => setStep("method")}
                  />
                </motion.div>
              )}

              {step === "upload" &&
                (selectedMethod === "bank_transfer" ||
                  selectedMethod === "pos") && (
                  <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="space-y-6"
                  >
                    {/* Back Button */}
                    <button
                      onClick={() => setStep("method")}
                      className="flex items-center justify-center sm:justify-start gap-2 px-4 py-2 rounded-lg transition-colors w-full sm:w-auto"
                      style={{
                        color: colors.textPrimary,
                        background: "rgba(255, 255, 255, 0.05)",
                      }}
                    >
                      <ArrowLeft size={20} />
                      <span>Change Payment Method</span>
                    </button>

                    {/* Bank Account Details */}
                    {selectedMethod === "bank_transfer" && (
                      <GlassCard className="w-full overflow-hidden">
                        <div className="flex flex-col sm:flex-row items-start gap-4 mb-4">
                          <Building2
                            className="w-6 h-6 shrink-0"
                            style={{ color: colors.primary }}
                          />
                          <div className="flex-1 w-full">
                            <h3 className="text-lg font-bold text-white mb-1">
                              Bank Account Details
                            </h3>
                            <p
                              className="text-sm"
                              style={{ color: colors.textSecondary }}
                            >
                              Transfer to this account and upload proof of
                              payment
                            </p>
                          </div>
                        </div>

                        <div className="space-y-3 w-full">
                          <div className="w-full">
                            <p
                              className="text-sm mb-1"
                              style={{ color: colors.textSecondary }}
                            >
                              Bank Name
                            </p>
                            <p className="font-medium text-white wrap-break-words">
                              {paymentType.bank_name}
                            </p>
                          </div>
                          <div className="w-full">
                            <p
                              className="text-sm mb-1"
                              style={{ color: colors.textSecondary }}
                            >
                              Account Name
                            </p>
                            <p className="font-medium text-white wrap-break-word">
                              {paymentType.account_name}
                            </p>
                          </div>
                          <div className="w-full">
                            <p
                              className="text-sm mb-1"
                              style={{ color: colors.textSecondary }}
                            >
                              Account Number
                            </p>
                            <div className="flex items-center gap-2 w-full">
                              <p className="font-bold text-lg sm:text-xl text-white flex-1 min-w-0 break-all">
                                {paymentType.account_number}
                              </p>
                              <button
                                onClick={copyAccountNumber}
                                className="p-2 rounded-lg transition-colors shrink-0"
                                style={{
                                  background: "rgba(255, 255, 255, 0.1)",
                                }}
                                title="Copy account number"
                              >
                                <Copy
                                  className="w-4 h-4"
                                  style={{ color: colors.primary }}
                                />
                              </button>
                            </div>
                          </div>
                        </div>
                      </GlassCard>
                    )}

                    {/* Payment Options - Full or Partial */}
                    {paymentType.allow_partial && remainingAmount > 0 && (
                      <GlassCard>
                        <h3 className="text-lg font-bold text-white mb-4">
                          Payment Amount
                        </h3>

                        {/* Info Box */}
                        <div
                          className="mb-4 p-3 rounded-lg"
                          style={{ background: `${colors.accentMint}15` }}
                        >
                          <p
                            className="text-sm"
                            style={{ color: colors.accentMint }}
                          >
                            💡 This payment type allows partial payments. You
                            can pay the full amount or any amount you're
                            comfortable with.
                          </p>
                        </div>

                        <div className="space-y-3">
                          <button
                            onClick={() => setPaymentOption("full")}
                            className="w-full p-4 rounded-lg border-2 transition-all text-left"
                            style={{
                              borderColor:
                                paymentOption === "full"
                                  ? colors.primary
                                  : "rgba(255, 255, 255, 0.1)",
                              background:
                                paymentOption === "full"
                                  ? `${colors.primary}10`
                                  : "rgba(255, 255, 255, 0.03)",
                            }}
                          >
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                              <div>
                                <p className="font-bold text-white">
                                  Pay Remaining Balance
                                </p>
                                <p
                                  className="text-sm mt-1"
                                  style={{ color: colors.textSecondary }}
                                >
                                  Complete payment in one transaction
                                </p>
                              </div>
                              <p
                                className="text-lg sm:text-xl font-bold"
                                style={{ color: colors.primary }}
                              >
                                {formatCurrency(Math.max(0, remainingAmount))}
                              </p>
                            </div>
                          </button>

                          <button
                            onClick={() => setPaymentOption("partial")}
                            className="w-full p-4 rounded-lg border-2 transition-all text-left"
                            style={{
                              borderColor:
                                paymentOption === "partial"
                                  ? colors.primary
                                  : "rgba(255, 255, 255, 0.1)",
                              background:
                                paymentOption === "partial"
                                  ? `${colors.primary}10`
                                  : "rgba(255, 255, 255, 0.03)",
                            }}
                          >
                            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                              <div>
                                <p className="font-bold text-white">
                                  Pay Partial Amount
                                </p>
                                <p
                                  className="text-sm mt-1"
                                  style={{ color: colors.textSecondary }}
                                >
                                  Pay what you can afford now, remaining later
                                </p>
                              </div>
                            </div>
                          </button>

                          {paymentOption === "partial" && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: "auto" }}
                              className="mt-4"
                            >
                              <label className="block text-sm font-medium mb-2 text-white">
                                Enter Amount (Max:{" "}
                                {formatCurrency(Math.max(0, remainingAmount))})
                              </label>
                              <input
                                type="number"
                                value={amount || ""}
                                onChange={(e) =>
                                  setAmount(
                                    Math.min(
                                      parseFloat(e.target.value) || 0,
                                      remainingAmount
                                    )
                                  )
                                }
                                max={remainingAmount}
                                min={0}
                                step="0.01"
                                className="w-full px-4 py-3 rounded-lg text-white focus:outline-none focus:ring-2"
                                style={{
                                  background: "rgba(255, 255, 255, 0.05)",
                                  border: "1px solid rgba(255, 255, 255, 0.1)",
                                }}
                                placeholder="0.00"
                              />
                              <p
                                className="text-xs mt-1"
                                style={{ color: colors.textSecondary }}
                              >
                                You'll be able to pay the remaining{" "}
                                {formatCurrency(
                                  Math.max(0, remainingAmount - amount)
                                )}{" "}
                                later
                              </p>
                            </motion.div>
                          )}
                        </div>
                      </GlassCard>
                    )}

                    {/* Upload Form */}
                    <form onSubmit={handleSubmitPayment}>
                      <GlassCard>
                        <h3 className="text-lg font-bold text-white mb-4">
                          Upload Payment Proof
                        </h3>

                        <div className="space-y-4">
                          {/* Transaction Reference */}
                          <div className="w-full overflow-hidden">
                            <label className="block text-sm font-medium mb-2 text-white">
                              Transaction Reference *
                            </label>
                            <input
                              type="text"
                              value={transactionRef}
                              onChange={(e) =>
                                setTransactionRef(e.target.value)
                              }
                              className="w-full px-4 py-3 rounded-lg text-white focus:outline-none focus:ring-2 break-all"
                              style={{
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                                maxWidth: "100%",
                              }}
                              placeholder="e.g., TRF/2024/11/12345"
                              required
                            />
                          </div>

                          {/* Receipt Upload */}
                          <div>
                            <FileUploader
                              onFileSelect={(file) => {
                                if (file && !Array.isArray(file)) {
                                  setReceiptFile(file);
                                }
                              }}
                              accept="image/jpeg,image/jpg,image/png,application/pdf"
                              maxSize={5 * 1024 * 1024}
                              label="Upload Receipt *"
                              description="Accepted: JPG, PNG, PDF (Max 5MB)"
                              showPreview={true}
                              multiple={false}
                            />
                          </div>

                          {/* Notes */}
                          <div>
                            <label className="block text-sm font-medium mb-2 text-white">
                              Additional Notes (Optional)
                            </label>
                            <textarea
                              value={notes}
                              onChange={(e) => setNotes(e.target.value)}
                              rows={3}
                              className="w-full px-4 py-3 rounded-lg text-white focus:outline-none focus:ring-2"
                              style={{
                                background: "rgba(255, 255, 255, 0.05)",
                                border: "1px solid rgba(255, 255, 255, 0.1)",
                              }}
                              placeholder="Any additional information..."
                            />
                          </div>

                          {/* Selected Students Summary */}
                          {selectedStudents.length > 0 && (
                            <div
                              className="p-4 rounded-lg"
                              style={{
                                background: `${colors.primary}10`,
                                border: `1px solid ${colors.primary}40`,
                              }}
                            >
                              <p className="font-bold text-white mb-2">
                                Paying for {selectedStudents.length + 1}{" "}
                                student(s):
                              </p>
                              <ul
                                className="text-sm space-y-1"
                                style={{ color: colors.textSecondary }}
                              >
                                <li>• You</li>
                                {selectedStudents.map((s) => (
                                  <li key={s.id}>
                                    • {s.full_name} ({s.reg_number})
                                  </li>
                                ))}
                              </ul>
                              <p
                                className="text-lg font-bold mt-3"
                                style={{ color: colors.primary }}
                              >
                                Total:{" "}
                                {formatCurrency(
                                  (selectedStudents.length + 1) *
                                    (paymentOption === "full"
                                      ? remainingAmount
                                      : amount)
                                )}
                              </p>
                            </div>
                          )}

                          {/* Submit Button */}
                          <button
                            type="submit"
                            disabled={submitting}
                            className="w-full py-3 px-6 rounded-lg font-medium text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                            style={{ background: gradients.primary }}
                          >
                            {submitting ? (
                              <span className="flex items-center justify-center gap-2">
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Submitting...
                              </span>
                            ) : (
                              `Submit Payment${
                                selectedStudents.length > 0
                                  ? ` for ${
                                      selectedStudents.length + 1
                                    } Student(s)`
                                  : ""
                              }`
                            )}
                          </button>
                        </div>
                      </GlassCard>
                    </form>
                  </motion.div>
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
        onProceed={(students) => {
          setSelectedStudents(students);
          setShowPayForOthers(false);
          setStep("method");
        }}
      />
      <Footer />
    </div>
  );
}
