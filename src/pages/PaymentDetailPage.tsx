/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from "react";
import { useParams } from "react-router-dom";
import { useAppNav } from '@/hooks/useAppNav';
import { motion } from "framer-motion";
import {
  ArrowLeft,
  AlertCircle,
  CheckCircle,
  Info,
  Sparkles,
  TrendingUp,
  Banknote,
  RefreshCw,
} from "lucide-react";
import { supabase, STORAGE_BUCKETS } from "@/config/supabase";
import { useAuth } from '@/hooks/useAppAuth';
import { useToast } from "@/hooks/useToast";
import { colors, gradients } from "@/config/colors";
import GlassCard from "@/components/ui/GlassCard";
import LoadingSpinner from "@/components/ui/LoadingSpinner";
import { formatCurrency } from "@/utils/formatters";
import { PrivacyMask } from '@/components/ui/PrivacyMask';
import PaymentMethodSelector from "@/components/student/PaymentMethodSelector";
import paystackService from "@/services/paystackService";
import QRCodeGenerator from "@/components/student/QRCodeGenerator";
import PayForOthersModal from "@/components/student/PayForOthersModal";
import PaymentSubmissionFlow from "@/components/student/PaymentSubmissionFlow";
import Footer from "@/components/Footer";
import notificationService from "@/services/notificationService";
import { SuccessCelebration } from "@/components/ui/Confetti";
import PageWrapper from "@/components/ui/PageWrapper";
import { getOrgScope } from "@/utils/orgScope";

// ── NEW IMPORTS ───────────────────────────────────────────────────────────────
import DeadlineCountdown from "@/components/student/DeadlineCountdown";
import PaymentTimeline from "@/components/student/PaymentTimeline";
import { LateFeeWaiverRequest } from "@/components/student/PaymentSocialFeatures";
import { OfflineBanner, useOfflineQueue } from "@/components/student/OfflinePaymentQueue";

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

// ── The core submit logic, extracted so it can be wrapped by useOfflineQueue ─
type SubmitPayload = {
  method: PaymentMethod;
  transactionRefValue: string;
  receiptFileValue: File | null;
  notesValue: string;
  paymentOptionValue: "full" | "partial";
  amountValue: number;
};

export default function PaymentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { go: navigate } = useAppNav();
  const { user } = useAuth();
  const toast = useToast();

  const [paymentType, setPaymentType] = useState<PaymentType | null>(null);
  const [existingPayments, setExistingPayments] = useState<ExistingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [step, setStep] = useState<"method" | "qr" | "upload">("method");
  const [selectedMethod, setSelectedMethod] = useState<PaymentMethod | null>(null);
  const [showPayForOthers, setShowPayForOthers] = useState(false);
  const [selectedStudents, setSelectedStudents] = useState<Student[]>([]);
  const [includeSelf, setIncludeSelf] = useState(false);

  // ── Paystack hosted-checkout flow (P1)
  // Calls /api/paystack/init then redirects the browser to the
  // authorization_url. Paystack redirects back to
  // /:slug/payments/verify?reference=... where PaymentVerifyPage
  // confirms the outcome.
  const [payingViaPaystack, setPayingViaPaystack] = useState(false);
  const [paystackError, setPaystackError] = useState<string | null>(null);

  const [paymentOption] = useState<"full" | "partial">("full");
  const [amount, setAmount] = useState<number>(0);

  const [showCelebration, setShowCelebration] = useState(false);
  const [celebrationMessage, setCelebrationMessage] = useState("");

  // ── Derived payment status ──────────────────────────────────────────────
  const totalPaid = existingPayments
    .filter((p) => p.status === "approved")
    .reduce((sum, p) => sum + (Number(p.amount) || 0), 0);

  const paymentTypeAmount   = Number(paymentType?.amount) || 0;
  const remainingAmount     = paymentTypeAmount - totalPaid;
  const isFullyPaid         = remainingAmount <= 0;
  const hasPendingPayment   = existingPayments.some((p) => p.status === "pending");
  const isWaived            = existingPayments.some(
    (p) => p.status === "approved" && p.transaction_ref?.startsWith("WAIVED-")
  );
  const progressPercentage  = paymentTypeAmount > 0 ? (totalPaid / paymentTypeAmount) * 100 : 0;

  // ── Late fee calculation ────────────────────────────────────────────────
  const paymentDeadline = paymentType?.deadline ? new Date(paymentType.deadline) : null;
  const perDayLate      = Number((paymentType as any)?.late_fee_per_day || 0);
  let currentUserAccumulatedLate = 0;
  try {
    if (paymentDeadline && new Date() > paymentDeadline && perDayLate > 0) {
      const totalPaidBeforeDeadline = existingPayments
        .filter(p => p.status === 'approved')
        .reduce((sum, p) => {
          try {
            const submittedStr = p.submitted_at || (p as any).created_at || p.reviewed_at;
            const submitted    = submittedStr ? new Date(submittedStr) : null;
            if (submitted && submitted.getTime() <= paymentDeadline.getTime()) {
              return sum + (Number(p.amount) || 0);
            }
          } catch (_) { /* ignore */ }
          return sum;
        }, 0);

      const remainingAtDeadline = Math.max(0, paymentTypeAmount - totalPaidBeforeDeadline);
      if (remainingAtDeadline <= 0) {
        currentUserAccumulatedLate = 0;
      } else {
        const daysOverdue = Math.floor((Date.now() - paymentDeadline.getTime()) / (1000 * 60 * 60 * 24));
        if (daysOverdue > 0) currentUserAccumulatedLate = daysOverdue * perDayLate;
      }
    }
  } catch (_) {
    currentUserAccumulatedLate = 0;
  }

  const currentUserOutstanding = Math.max(0, remainingAmount) + currentUserAccumulatedLate;

  // ── Data fetching ───────────────────────────────────────────────────────
  useEffect(() => {
    fetchPaymentDetails();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  useEffect(() => {
    if (paymentType) setAmount(paymentOption === "full" ? currentUserOutstanding : 0);
  }, [paymentOption, paymentType, currentUserOutstanding]);

  const fetchPaymentDetails = async () => {
    if (!navigator.onLine) return;
    try {
      setLoading(true);
      const scope = getOrgScope();

      let typeQ = supabase.from("payment_types").select("*").eq("id", id);
      if (scope) typeQ = typeQ.eq("organization_id", scope.orgId);
      const { data: typeData, error: typeError } = await typeQ.single();
      if (typeError) throw typeError;
      setPaymentType(typeData);

      let pmtQ = supabase
        .from("payments")
        .select("*")
        .eq("payment_type_id", id)
        .eq("member_id", user?.id)
        .order("created_at", { ascending: false });
      if (scope) pmtQ = pmtQ.eq("organization_id", scope.orgId);
      const { data: paymentsData } = await pmtQ;
      setExistingPayments(paymentsData || []);
    } catch (error) {
      console.error("Error fetching payment details:", error);
      toast.error("Failed to load payment details");
    } finally {
      setLoading(false);
    }
  };

  // ── Core submit function (passed into useOfflineQueue) ──────────────────
  const submitPaymentWithData = async (options: SubmitPayload) => {
    const {
      method, transactionRefValue, receiptFileValue,
      notesValue, paymentOptionValue, amountValue,
    } = options;

    if (method !== "cash" && !receiptFileValue) { toast.error("Please upload a receipt"); return false; }
    if (method !== "cash" && !transactionRefValue.trim()) { toast.error("Please enter transaction reference"); return false; }
    if (paymentOptionValue === "partial" && amountValue <= 0) { toast.error("Please enter a valid amount"); return false; }
    if (paymentOptionValue === "partial" && amountValue > currentUserOutstanding) {
      toast.error(`Amount cannot exceed remaining balance of ${formatCurrency(currentUserOutstanding)}`);
      return false;
    }

    try {
      setSubmitting(true);
      if (!user) { toast.error("User not found"); return false; }

      const students: Student[] = [];
      if (selectedStudents.length > 0) students.push(...selectedStudents);
      if (includeSelf || (selectedStudents.length === 0 && !isFullyPaid)) {
        students.push({
          id: user.id, full_name: user.full_name,
          reg_number: user.reg_number, level: user.level,
          ...({ outstanding: currentUserOutstanding } as any),
        } as any);
      }
      if (students.length === 0) { toast.error("No students to pay for"); return false; }

      for (const student of students) {
        let receiptUrl = "";
        if (method !== "cash" && receiptFileValue) {
          const fileExt  = receiptFileValue.name.split(".").pop();
          const fileName = `${student.id}_${Date.now()}_${Math.random().toString(36).substring(7)}.${fileExt}`;
          const filePath = `receipts/${fileName}`;

          const { error: uploadError } = await supabase.storage
            .from(STORAGE_BUCKETS.RECEIPTS)
            .upload(filePath, receiptFileValue);
          if (uploadError) { toast.error(`Failed to upload receipt: ${uploadError.message}`); throw uploadError; }

          const { data: urlData } = supabase.storage.from(STORAGE_BUCKETS.RECEIPTS).getPublicUrl(filePath);
          receiptUrl = urlData.publicUrl;
        }

        const finalTransactionRef = method === "cash"
          ? `CASH-QR-${student.reg_number}-${Date.now()}`
          : `${transactionRefValue}-${student.reg_number}`;

        const amountToInsert = paymentOptionValue === 'full'
          ? (student as any).outstanding ?? currentUserOutstanding
          : amountValue;

        const scope = getOrgScope();
        let orgId: string | null = scope?.orgId || null;
        let groupId: string | null = null;
        if (!orgId) {
          const { data: memberRow } = await supabase
            .from('organization_members').select('organization_id, group_id').eq('id', student.id).single();
          if (memberRow) { orgId = memberRow.organization_id; groupId = memberRow.group_id; }
        }
        if (orgId && !groupId) {
          const { data: memberRow } = await supabase
            .from('organization_members').select('group_id').eq('id', student.id).single();
          groupId = memberRow?.group_id || null;
        }

        const paymentInsert: Record<string, unknown> = {
          member_id: student.id, payment_type_id: id,
          amount: amountToInsert, transaction_ref: finalTransactionRef,
          receipt_url: receiptUrl || null, notes: notesValue.trim() || null,
          status: "pending", payment_method: method,
          paid_by: student.id !== user.id ? user.id : null,
        };
        if (orgId)   paymentInsert.organization_id = orgId;
        if (groupId) paymentInsert.group_id = groupId;

        const { data: insertedPayment, error: insertError } = await supabase
          .from("payments").insert(paymentInsert).select().single();
        if (insertError) throw insertError;

        if (insertedPayment) {
          const notifyAmount = paymentOptionValue === 'full'
            ? ((student as any).outstanding ?? currentUserOutstanding ?? amountValue)
            : amountValue;
          notificationService.sendPaymentPendingNotification(
            student.id, student.full_name, paymentType?.title || "Payment", notifyAmount, insertedPayment.id
          ).catch(err => console.warn("Student notification failed:", err));
          notificationService.notifyApproversOfNewPayment(
            insertedPayment.id, student.id, notifyAmount, id || ""
          ).catch(err => console.warn("Approver notification failed:", err));
        }
      }

      const message = selectedStudents.length > 0
        ? `Payment submitted for ${selectedStudents.length + (includeSelf ? 1 : 0)} student(s)!`
        : "Payment submitted successfully!";

      setCelebrationMessage(message);
      setShowCelebration(true);
      return true;
    } catch (error: unknown) {
      console.error("Error submitting payment:", error);
      if (error && typeof error === "object" && "code" in error) {
        const dbError = error as { code: string; message: string };
        if (dbError.code === "23505") toast.error("This transaction reference has already been used.");
        else toast.error(dbError.message || "Failed to submit payment");
      } else {
        toast.error("Failed to submit payment");
      }
      return false;
    } finally {
      setSubmitting(false);
    }
  };

  // ── Wrap with offline queue ─────────────────────────────────────────────
  const { wrappedSubmit, isOnline, queuedCount, flushing } = useOfflineQueue(async (data: SubmitPayload) => {
    await submitPaymentWithData(data);
  });

  const handleMethodSelect = (method: PaymentMethod) => {
    setSelectedMethod(method);
    if (method === "cash") setStep("qr");
    else setStep("upload");
  };

  // ── Paystack: init + redirect ──────────────────────────────────────────
  const handlePayWithPaystack = async () => {
    if (!user?.id || !id) {
      setPaystackError('Sign in required.');
      return;
    }
    setPayingViaPaystack(true);
    setPaystackError(null);

    const res = await paystackService.initialize({
      memberId:      user.id,
      paymentTypeId: id,
      // omit callbackPath → server uses /<orgSlug>/payments/verify by default
    });

    if (!res.ok || !res.authorization_url) {
      setPaystackError(res.error || 'Could not start checkout. Please try again.');
      setPayingViaPaystack(false);
      return;
    }
    // Hand off to Paystack hosted checkout. Browser will return via
    // /:slug/payments/verify?reference=<ref>.
    window.location.assign(res.authorization_url);
  };

  const handleResubmitRejected = (_rejectedPayment: ExistingPayment) => {
    setStep("method");
  };
  void handleResubmitRejected;

  // ── Loading / not found states ──────────────────────────────────────────
  if (loading) return <LoadingSpinner fullScreen size="xl" text="Loading payment details..." />;

  if (!paymentType) {
    return (
      <div
        className="min-h-screen flex items-center justify-center p-6"
        style={{ background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)' }}
      >
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="text-center max-w-md">
          <motion.div
            initial={{ scale: 0.8 }} animate={{ scale: 1 }}
            transition={{ type: 'spring', damping: 15 }}
            className="w-20 h-20 mx-auto mb-6 rounded-2xl flex items-center justify-center"
            style={{ background: `${colors.statusUnpaid}15`, border: `1px solid ${colors.statusUnpaid}30` }}
          >
            <AlertCircle className="w-10 h-10" style={{ color: colors.statusUnpaid }} />
          </motion.div>
          <h2 className="text-2xl font-bold text-white mb-3">Payment Not Found</h2>
          <p className="text-sm mb-6" style={{ color: colors.textSecondary }}>
            This payment type may have been removed or the link is invalid.
          </p>
          <motion.button
            onClick={() => navigate("/dashboard")}
            className="px-6 py-3 rounded-xl font-semibold flex items-center justify-center gap-2 mx-auto"
            style={{ background: gradients.primary, color: 'white', boxShadow: `0 4px 20px ${colors.primary}40` }}
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
          >
            <ArrowLeft size={20} /> Back to Dashboard
          </motion.button>
        </motion.div>
      </div>
    );
  }

  return (
    <PageWrapper noPadding className="py-2 sm:py-6" style={{ background: '#0A0705' }}>
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

      <div className="w-full max-w-4xl mx-auto px-2 sm:px-6 lg:px-8 overflow-x-hidden">
        <div className="w-full space-y-6 relative z-10">

          {/* ── Offline banner ── */}
          <OfflineBanner isOnline={isOnline} queuedCount={queuedCount} flushing={flushing} />

          {/* ── Header ── */}
          <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }}>
            <button
              onClick={() => navigate("/dashboard")}
              className="flex items-center justify-center sm:justify-start gap-2 mb-4 px-3 py-2 rounded-lg transition-colors w-auto outline outline-orange-500 mt-2"
              style={{ color: colors.textSecondary }}
              onMouseEnter={(e) => (e.currentTarget.style.color = colors.primary)}
              onMouseLeave={(e) => (e.currentTarget.style.color = colors.textSecondary)}
            >
              <ArrowLeft size={20} />
              <span className="font-medium">Back to Dashboard</span>
            </button>
          </motion.div>

          {/* ── Deadline Countdown ── */}
          {paymentType.deadline && !isFullyPaid && (
            <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}>
              <DeadlineCountdown deadline={paymentType.deadline} />
            </motion.div>
          )}

          {/* ── Payment Type Info ── */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
            <div
              className="rounded-2xl overflow-hidden"
              style={{
                background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, rgba(255, 107, 53, 0.02) 100%)',
                border: `1px solid ${colors.primary}20`,
              }}
            >
              <div
                className="p-5 sm:p-6"
                style={{
                  background: `linear-gradient(135deg, ${colors.primary}15 0%, transparent 100%)`,
                  borderBottom: `1px solid ${colors.primary}15`,
                }}
              >
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-4 w-full">
                  <motion.div
                    className="w-18 h-18 sm:w-20 sm:h-20 rounded-2xl flex items-center justify-center text-4xl shrink-0 relative"
                    style={{
                      background: `linear-gradient(135deg, ${paymentType.color}30 0%, ${paymentType.color}10 100%)`,
                      border: `1px solid ${paymentType.color}40`,
                      boxShadow: `0 8px 32px ${paymentType.color}20`,
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
                    <div className="flex items-center justify-center sm:justify-start gap-2 mb-2 flex-wrap">
                      <h1 className="text-xl sm:text-3xl font-bold text-white">{paymentType.title}</h1>
                      {paymentType.allow_partial && (
                        <span
                          className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                          style={{ background: `${colors.accentMint}20`, color: colors.accentMint }}
                        >
                          PARTIAL OK
                        </span>
                      )}
                    </div>
                    <p className="text-sm sm:text-base mb-4" style={{ color: colors.textSecondary }}>
                      {paymentType.description}
                    </p>

                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-3">
                      <div
                        className="flex items-center gap-2 px-3 py-2 rounded-xl"
                        style={{ background: `${colors.primary}15`, border: `1px solid ${colors.primary}30` }}
                      >
                        <Banknote className="w-4 h-4" style={{ color: colors.primary }} />
                        <span className="text-lg sm:text-xl font-bold" style={{ color: colors.primary }}>
                          <PrivacyMask>{formatCurrency(paymentOption === 'full' ? currentUserOutstanding : amount)}</PrivacyMask>
                        </span>
                      </div>

                      {/* ── Compact deadline chip ── */}
                      {paymentType.deadline && (
                        <DeadlineCountdown deadline={paymentType.deadline} compact />
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>

          {/* ── Payment Progress ── */}
          {(totalPaid > 0 || existingPayments.length > 0) && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
              <div
                className="rounded-2xl overflow-hidden"
                style={{ background: 'rgba(255, 255, 255, 0.02)', border: '1px solid rgba(255, 255, 255, 0.08)' }}
              >
                <div
                  className="px-5 py-4 flex items-center gap-3"
                  style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.05)' }}
                >
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.accentMint}15` }}>
                    <TrendingUp className="w-5 h-5" style={{ color: colors.accentMint }} />
                  </div>
                  <div>
                    <h3 className="text-base font-bold text-white">Payment Progress</h3>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Track your payment status</p>
                  </div>
                </div>

                <div className="p-4 sm:p-5">
                  <div className="grid grid-cols-3 gap-2 sm:gap-3 mb-5">
                    {[
                      {
                        label: currentUserAccumulatedLate > 0 ? 'BASE DUE' : 'TOTAL DUE',
                        value: paymentTypeAmount,
                        color: colors.primary,
                        gradient: gradients.primary,
                      },
                      { label: 'PAID', value: totalPaid, color: colors.statusPaid, gradient: colors.statusPaid },
                      {
                        label: 'REMAINING',
                        value: Math.max(0, currentUserOutstanding),
                        color: currentUserOutstanding <= 0 ? colors.statusPaid : colors.warning,
                        gradient: currentUserOutstanding <= 0 ? colors.statusPaid : colors.warning,
                      },
                    ].map((card) => (
                      <motion.div
                        key={card.label}
                        className="text-center p-2.5 sm:p-4 rounded-xl relative overflow-hidden"
                        style={{
                          background: `linear-gradient(135deg, ${card.color}10 0%, ${card.color}05 100%)`,
                          border: `1px solid ${card.color}20`,
                        }}
                        whileHover={{ scale: 1.02 }}
                      >
                        <div className="absolute top-0 left-0 right-0 h-1" style={{ background: card.gradient }} />
                        <p className="text-[10px] sm:text-xs mb-1 font-medium" style={{ color: colors.textSecondary }}>{card.label}</p>
                        <p className="text-sm sm:text-xl font-bold truncate" style={{ color: card.color }}>
                          <PrivacyMask>{formatCurrency(card.value)}</PrivacyMask>
                        </p>
                      </motion.div>
                    ))}
                  </div>

                  {/* ── Late fee breakdown ── */}
                  {currentUserAccumulatedLate > 0 && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      className="mb-5 p-4 rounded-xl"
                      style={{
                        background: `linear-gradient(135deg, ${colors.statusUnpaid}08 0%, transparent 100%)`,
                        border: `1px solid ${colors.statusUnpaid}20`,
                      }}
                    >
                      <div className="flex items-center gap-2 mb-2">
                        <AlertCircle className="w-4 h-4" style={{ color: colors.statusUnpaid }} />
                        <span className="text-sm font-semibold" style={{ color: colors.statusUnpaid }}>
                          Late Payment Fees Applied
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        <div>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>Base Amount</p>
                          <p className="font-semibold text-white"><PrivacyMask>{formatCurrency(paymentTypeAmount)}</PrivacyMask></p>
                        </div>
                        <div>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>Late Fees</p>
                          <p className="font-semibold" style={{ color: colors.statusUnpaid }}>
                            +<PrivacyMask>{formatCurrency(currentUserAccumulatedLate)}</PrivacyMask>
                          </p>
                        </div>
                        <div className="col-span-2 pt-2 mt-2" style={{ borderTop: '1px solid rgba(255,255,255,0.1)' }}>
                          <div className="flex justify-between items-center">
                            <p className="text-xs" style={{ color: colors.textSecondary }}>Total Due (incl. late fees)</p>
                            <p className="font-bold text-white">
                              <PrivacyMask>{formatCurrency(paymentTypeAmount + currentUserAccumulatedLate)}</PrivacyMask>
                            </p>
                          </div>
                        </div>
                      </div>
                      <p className="text-xs mt-3" style={{ color: colors.textSecondary }}>
                        Late fee: <PrivacyMask>{formatCurrency(perDayLate)}</PrivacyMask>/day ×{' '}
                        {Math.floor((Date.now() - (paymentDeadline?.getTime() || 0)) / (1000 * 60 * 60 * 24))} days overdue
                      </p>

                      {/* ── Late fee waiver request ── */}
                      {user && (
                        <LateFeeWaiverRequest
                          paymentTypeId={id!}
                          paymentTypeName={paymentType.title}
                          lateFeeAmount={currentUserAccumulatedLate}
                          memberId={user.id}
                          memberName={user.full_name}
                          className="mt-3"
                        />
                      )}
                    </motion.div>
                  )}

                  {/* ── Progress bar ── */}
                  <div className="relative">
                    <div className="w-full h-4 rounded-full overflow-hidden" style={{ background: "rgba(255, 255, 255, 0.1)" }}>
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, progressPercentage)}%` }}
                        transition={{ duration: 1, delay: 0.5, ease: "easeOut" }}
                        className="h-full rounded-full relative"
                        style={{ background: gradients.primary }}
                      >
                        <div
                          className="absolute inset-0 opacity-50"
                          style={{
                            background: 'linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.3) 50%, transparent 100%)',
                            animation: 'shimmer 2s infinite',
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
                          <CheckCircle className="w-4 h-4" /> Fully Paid
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Payment Timeline (replaces flat list) ── */}
          {existingPayments.length > 0 && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}>
              <GlassCard className="w-full min-w-0 overflow-hidden">
                <PaymentTimeline
                  payments={existingPayments}
                  paymentTypeName={paymentType.title}
                />
                {/* Resubmit button for rejected payments */}
                {existingPayments.some(p => p.status === 'rejected') && (
                  <div className="mt-5 pt-4" style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                    <motion.button
                      onClick={() => handleResubmitRejected(existingPayments.find(p => p.status === 'rejected')!)}
                      className="flex items-center gap-2 px-4 py-2.5 rounded-xl font-medium text-white transition-all"
                      style={{ background: gradients.primary, boxShadow: `0 4px 16px ${colors.primary}30` }}
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                    >
                      <RefreshCw className="w-4 h-4" />
                      Resubmit Rejected Payment
                    </motion.button>
                  </div>
                )}
              </GlassCard>
            </motion.div>
          )}

          {/* ── Fully paid / waived ── */}
          {isFullyPaid && (
            <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.4 }}>
              <GlassCard className="w-full">
                <div className="text-center p-8">
                  <CheckCircle className="w-16 h-16 mx-auto mb-4" style={{ color: isWaived ? '#6366F1' : colors.statusPaid }} />
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

          {/* ── Pending review warning ── */}
          {!isFullyPaid && hasPendingPayment && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
              <GlassCard className="w-full">
                <div className="flex items-start gap-4 p-4" style={{ background: `${colors.warning}10` }}>
                  <Info className="w-6 h-6 shrink-0 mt-1" style={{ color: colors.warning }} />
                  <div>
                    <p className="font-bold text-white mb-1">Payment Pending Review</p>
                    <p className="text-sm" style={{ color: colors.textSecondary }}>
                      You have a payment awaiting approval. Please wait for the admin to review before making another payment.
                    </p>
                  </div>
                </div>
              </GlassCard>
            </motion.div>
          )}

          {/* ── Payment form ── */}
          {!isFullyPaid && !hasPendingPayment && (
            <>
              {step === "method" && (
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
                  {/* ── PRIMARY: Paystack hosted checkout ─────────────────
                      This is the only path we surface prominently. It's
                      how the platform earns. Bank transfer + USSD are
                      first in the channels array (api/paystack/init.ts)
                      so rural / non-card users land on rails they use. */}
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="relative overflow-hidden rounded-3xl p-6 sm:p-7"
                    style={{
                      background: 'linear-gradient(135deg, rgba(48,255,172,0.14) 0%, rgba(255,104,3,0.10) 100%)',
                      border: '1px solid rgba(48,255,172,0.32)',
                      boxShadow: '0 12px 40px rgba(48,255,172,0.08), inset 0 1px 0 rgba(255,255,255,0.04)',
                    }}
                  >
                    {/* Ambient glow */}
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{ background: 'radial-gradient(ellipse 70% 80% at 90% -5%, rgba(48,255,172,0.22), transparent 60%)' }}
                    />
                    <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full pointer-events-none"
                      style={{ background: 'radial-gradient(circle, rgba(48,255,172,0.18), transparent 70%)', filter: 'blur(20px)' }}
                    />

                    {/* Badges row */}
                    <div className="relative flex items-center gap-2 mb-3 flex-wrap">
                      <span
                        className="text-[10px] uppercase tracking-[0.22em] font-bold inline-flex items-center gap-1"
                        style={{ color: '#30FFAC' }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#30FFAC', boxShadow: '0 0 8px #30FFAC' }} />
                        Fastest way
                      </span>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{ background: 'rgba(48,255,172,0.15)', color: '#30FFAC', border: '1px solid rgba(48,255,172,0.3)' }}
                      >
                        Instant receipt
                      </span>
                      <span
                        className="text-[10px] px-2 py-0.5 rounded-full font-bold"
                        style={{ background: 'rgba(255,104,3,0.15)', color: '#FFAC5F', border: '1px solid rgba(255,104,3,0.3)' }}
                      >
                        Bank transfer • USSD • Card
                      </span>
                    </div>

                    <h3 className="relative text-xl sm:text-2xl font-extrabold text-white tracking-tight">
                      Pay online — no waiting for approval
                    </h3>
                    <p className="relative text-xs sm:text-sm mt-2 leading-6" style={{ color: 'rgba(255,255,255,0.72)' }}>
                      Choose bank transfer, USSD, or card. Your receipt is generated
                      the second the bank confirms — no admin review, no upload.
                    </p>

                    {/* The button */}
                    <button
                      type="button"
                      onClick={handlePayWithPaystack}
                      disabled={payingViaPaystack}
                      className="relative w-full mt-5 px-5 py-4 rounded-2xl text-base font-extrabold flex items-center justify-center gap-2 transition disabled:opacity-60"
                      style={{
                        background: payingViaPaystack
                          ? 'rgba(48,255,172,0.20)'
                          : 'linear-gradient(135deg, #30FFAC 0%, #00D88B 100%)',
                        boxShadow: payingViaPaystack ? 'none' : '0 12px 36px rgba(48,255,172,0.35)',
                        color: '#0F0703',
                      }}
                    >
                      {payingViaPaystack ? (
                        <>
                          <span className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(15,7,3,0.35)', borderTopColor: '#0F0703' }} />
                          Opening secure checkout…
                        </>
                      ) : (
                        <>
                          Pay now
                          <span className="inline-flex items-center gap-1 text-xs font-bold opacity-70">→</span>
                        </>
                      )}
                    </button>

                    {paystackError && (
                      <p className="relative mt-3 text-xs flex items-start gap-1.5" style={{ color: '#ff8a8a' }}>
                        <span>⚠</span>
                        <span>{paystackError}</span>
                      </p>
                    )}

                    <p className="relative mt-4 text-[10px]" style={{ color: 'rgba(255,255,255,0.45)' }}>
                      🔒 Secured by Paystack. A small service fee is shown on the next screen.
                    </p>
                  </motion.div>

                  {/* ── SECONDARY: collapsed "other ways" — discouraged but not hidden ──
                      The platform's revenue depends on Paystack. Manual upload
                      is here for users who genuinely cannot use bank transfer
                      or USSD (extremely rare) — defaulted CLOSED so it doesn't
                      compete with the primary CTA above. */}
                  <details className="mt-3 group">
                    <summary
                      className="cursor-pointer list-none rounded-xl px-4 py-3 text-xs sm:text-sm font-medium flex items-center justify-between transition"
                      style={{
                        background: 'rgba(255,255,255,0.025)',
                        border: '1px solid rgba(255,255,255,0.06)',
                        color: 'rgba(255,255,255,0.55)',
                      }}
                    >
                      <span className="flex items-center gap-2">
                        <span style={{ opacity: 0.7 }}>I can't pay online right now</span>
                        <span
                          className="text-[10px] px-1.5 py-0.5 rounded font-bold"
                          style={{ background: 'rgba(255,172,95,0.12)', color: '#FFAC5F' }}
                        >
                          slower
                        </span>
                      </span>
                      <span className="text-xs transition group-open:rotate-180">▾</span>
                    </summary>
                    <div className="mt-3">
                      <div
                        className="mb-3 rounded-xl px-4 py-3 text-[11px] leading-5"
                        style={{
                          background: 'rgba(255,172,95,0.06)',
                          border: '1px solid rgba(255,172,95,0.18)',
                          color: 'rgba(255,255,255,0.62)',
                        }}
                      >
                        <strong style={{ color: '#FFAC5F' }}>Heads up.</strong> Manual payments
                        need an admin to review your receipt before they show as paid — usually
                        within 24h. Paying online (above) is instant.
                      </div>
                      <PaymentMethodSelector
                        selectedMethod={selectedMethod}
                        onMethodSelect={handleMethodSelect}
                        onPayForOthers={() => setShowPayForOthers(true)}
                        showPayForOthers={true}
                      />
                    </div>
                  </details>
                </motion.div>
              )}

              {step === "qr" && selectedMethod === "cash" && user && (() => {
                const selectedWithOutstanding = selectedStudents.map(s => ({ ...s, outstanding: currentUserOutstanding }));
                const isSoloPayment = selectedStudents.length === 0 && !includeSelf;
                const studentsForTotal = [...selectedWithOutstanding];
                if ((includeSelf || isSoloPayment) && !studentsForTotal.some(s => s.id === user.id)) {
                  studentsForTotal.push({ id: user.id, full_name: user.full_name, reg_number: user.reg_number, level: user.level, outstanding: currentUserOutstanding } as any);
                }
                const effectiveStudentCount = studentsForTotal.length > 0 ? studentsForTotal.length : 1;
                const totalAmount = paymentOption === 'full'
                  ? studentsForTotal.reduce((sum, s) => sum + (Number((s as any).outstanding ?? currentUserOutstanding ?? amount) || 0), 0)
                  : (effectiveStudentCount * amount);
                return (
                  <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
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

              {step === "upload" && (selectedMethod === "bank_transfer" || selectedMethod === "pos") && (
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
                    // Block receipt uploads when offline
                    if (!isOnline && data.receiptFile) {
                      toast.error("Receipt upload requires an internet connection. Please reconnect and try again.");
                      return;
                    }
                    await wrappedSubmit({
                      method: selectedMethod as PaymentMethod,
                      transactionRefValue: data.transactionRef,
                      receiptFileValue:    data.receiptFile,
                      notesValue:          data.notes,
                      paymentOptionValue:  data.paymentOption,
                      amountValue:         data.amount,
                    });
                  }}
                  submitting={submitting}
                />
              )}
            </>
          )}
        </div>
      </div>

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