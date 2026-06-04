import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from '@/hooks/useAppAuth';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { useActiveRole } from '@/hooks/useActiveRole';
import {  } from "react-router-dom";
import { useAppNav } from '@/hooks/useAppNav';
import { supabase } from "@/config/supabase";
import { getOrgScope } from '@/utils/orgScope';
import { useToast } from "@/hooks/useToast";
import { colors, gradients } from "@/config/colors";
import GlassCard from "@/components/ui/GlassCard";
import { formatCurrency, formatDate } from "@/utils/formatters";
import { PrivacyMask } from '@/components/ui/PrivacyMask';
import Modal from '@/components/ui/Modal';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
// AdminNotificationCenter removed - using push notifications instead
import {
  CheckCircle,
  XCircle,
  FileText,
  User,
  Eye,
  X,
  Check,
  Clock,
  ArrowLeft,
  Shield,
  Sparkles,
  Filter,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import Footer from "@/components/Footer";
import notificationService from "@/services/notificationService";

interface PendingPayment {
  id: string;
  member_id: string;
  payment_type_id: string;
  amount: number;
  transaction_ref: string;
  receipt_url: string;
  notes: string | null;
  created_at: string;
  status: "pending" | "approved" | "rejected";
  approved_at?: string;
  rejection_reason?: string;
  member: {
    full_name: string;
    member_id: string;
    level: string;
  };
  payment_types: {
    title: string;
    category: string;
  };
}

function ReviewDecisionModal({
  kind,
  payment,
  open,
  loading,
  rejectionReason,
  setRejectionReason,
  onClose,
  onConfirm,
}: {
  kind: 'approve' | 'reject';
  payment: PendingPayment | null;
  open: boolean;
  loading: boolean;
  rejectionReason: string;
  setRejectionReason: (value: string) => void;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open || !payment) return null;

  const isReject = kind === 'reject';

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isReject ? 'Reject Payment' : 'Approve Payment'}
      size="md"
      closeOnOverlayClick={!loading}
    >
      <div className="space-y-4">
        <div className="p-4 rounded-lg" style={{ background: 'rgba(255, 255, 255, 0.05)' }}>
          <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Student</p>
          <p className="text-white font-medium mb-3">{payment.member.full_name}</p>

          <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Amount</p>
          <p className="text-white font-semibold text-lg mb-3">
            <PrivacyMask>{formatCurrency(payment.amount)}</PrivacyMask>
          </p>

          <p className="text-sm mb-1" style={{ color: colors.textSecondary }}>Payment Type</p>
          <p className="text-white">{payment.payment_types.title}</p>
        </div>

        {isReject && (
          <div>
            <label className="block text-sm font-medium text-white mb-2">
              Rejection Reason *
            </label>
            <textarea
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="e.g., Receipt is blurry, wrong amount, invalid transaction reference..."
              rows={4}
              className="w-full rounded-lg px-4 py-3 text-white placeholder-gray-400 focus:outline-none focus:ring-2"
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
              }}
            />
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <button
          onClick={onClose}
          className="flex-1 py-3 rounded-lg font-medium text-white transition-all"
          style={{ background: 'rgba(255, 255, 255, 0.1)' }}
        >
          Cancel
        </button>
        <button
          onClick={onConfirm}
          disabled={loading || (isReject && !rejectionReason.trim())}
          className="flex-1 flex items-center justify-center gap-2 py-3 rounded-lg font-medium text-white transition-all disabled:opacity-50"
          style={{ background: isReject ? colors.statusUnpaid : gradients.primary }}
        >
          {loading ? (
            <>
              <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent" />
              {isReject ? 'Rejecting...' : 'Approving...'}
            </>
          ) : (
            <>
              {isReject ? <XCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5" />}
              {isReject ? 'Reject' : 'Approve'}
            </>
          )}
        </button>
      </div>
    </Modal>
  );
}

export default function AdminReviewPage() {
  const { user, hasPermission } = useAuth();
  const { user: mtUser, organization } = useMultiTenantAuth();
  const { activeRole } = useActiveRole({
    orgId: organization?.id,
    memberId: mtUser?.id,
  });
  const { go: navigate } = useAppNav();
  const { success: showSuccess, error: showError } = useToast();
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);
  const [payments, setPayments] = useState<PendingPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedPayment, setSelectedPayment] = useState<PendingPayment | null>(
    null
  );
  const [showRejectModal, setShowRejectModal] = useState(false);
  const [showApproveModal, setShowApproveModal] = useState(false);
  const [rejectionReason, setRejectionReason] = useState("");
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [filter, setFilter] = useState<
    "all" | "pending" | "approved" | "rejected"
  >("all");
  const itemsPerPage = 10;

  // Scroll to top helper
  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // Filter and paginate payments
  const filteredPayments = payments.filter(
    (p) => filter === "all" || p.status === filter
  );
  const totalPages = Math.ceil(filteredPayments.length / itemsPerPage);
  const paginatedPayments = filteredPayments.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  const fetchPendingPayments = async () => {
    // Don't attempt network fetch when offline
    if (!navigator.onLine) return;
    try {
      setLoading(true);
      const scope = getOrgScope();

      // STRICT tier filter (per user intent: "don't mix things up").
      // Each exec sees ONLY payments toward dues at their OWN tier —
      //   class rep   → their class's dues only
      //   dept exec   → their dept's dues only (not class dues below)
      //   faculty exec→ their faculty's dues only (not dept/class)
      //   org owner   → everything (no filter)
      // The cascade we use elsewhere (member dashboards seeing dues
      // from parent tiers) does NOT apply here. The Review page is a
      // tier's own approval queue — class reps approve class
      // payments; dept execs handle dept-tier payments; faculty
      // execs handle faculty-tier payments.
      let scopedPaymentTypeIds: string[] | null = null;
      const isOrgTier = !activeRole || activeRole.kind !== 'exec' || activeRole.scopeLevel === 'org';
      if (scope && !isOrgTier && activeRole?.groupId) {
        const { data: ptRows } = await supabase
          .from('payment_types')
          .select('id')
          .eq('organization_id', scope.orgId)
          .eq('group_id', activeRole.groupId);
        scopedPaymentTypeIds = (ptRows ?? []).map((r: { id: string }) => r.id);
      }

      let query = supabase
        .from("payments")
        .select(
          `
          *,
          member:organization_members!payments_member_id_fkey (
            full_name,
            member_id,
            level
          ),
          payment_types (
            title,
            category
          )
        `
        )
        .eq('organization_id', scope?.orgId || '')
        .order("created_at", { ascending: true });
      if (scopedPaymentTypeIds) {
        // Empty list = no scoped types = no payments. Short-circuit.
        if (scopedPaymentTypeIds.length === 0) {
          setPayments([]);
          return;
        }
        query = query.in('payment_type_id', scopedPaymentTypeIds);
      }
      const { data, error } = await query;

      if (error) throw error;

      // Drop abandoned / failed Paystack attempts. The Paystack flow
      // INSERTs a `pending` row when the user clicks pay; if they
      // close the modal or the gateway rejects, no webhook ever flips
      // it to approved or rejected and the row sits in the review
      // queue forever, masquerading as a real "manual receipt
      // awaiting approval." Distinguishing trait: manual payments
      // carry a receipt_url (the screenshot they uploaded); abandoned
      // Paystack pendings have neither receipt_url NOR transaction_ref.
      // FAILED ones carry transaction_ref but no receipt — also drop.
      //
      // The cleanest rule for the review queue: only surface payments
      // that have something for the exec to actually approve — i.e.
      // a receipt image. Approved/rejected rows still show for audit
      // even without a receipt (they were processed at some point).
      const filtered = (data || []).filter((p) => {
        if (p.status !== 'pending') return true; // approved/rejected stay
        const hasReceipt = Boolean((p as { receipt_url?: string | null }).receipt_url);
        return hasReceipt;
      });

      // Sort: pending first, then approved/rejected
      const sorted = filtered.sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (a.status !== "pending" && b.status === "pending") return 1;
        return (
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
        );
      });

      setPayments(sorted);
    } catch (error) {
      console.error("Error fetching pending payments:", error);
      showError("Failed to load pending payments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPendingPayments();

    const channel = supabase
      .channel("pending-payments")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "payments",
        },
        () => {
          // Don't refetch when offline — prevents toast spam
          if (navigator.onLine) {
            fetchPendingPayments();
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleApprove = async () => {
    if (!selectedPayment) return;

    try {
      setProcessingId(selectedPayment.id);
      const scope = getOrgScope();
      const { data: adminRec } = await supabase
        .from('member_admins')
        .select('id')
        .eq('member_id', user?.id || '')
        .eq('organization_id', scope?.orgId || '')
        .single();

      if (!adminRec) {
        showError('You are not registered as an admin for this organization');
        setProcessingId(null);
        return;
      }

      const { error } = await supabase
        .from("payments")
        .update({
          status: "approved",
          approved_by: adminRec.id,
          approved_at: new Date().toISOString(),
        })
        .eq("id", selectedPayment.id);

      if (error) throw error;

      // Send notification to student using notification service
      await notificationService.sendPaymentApprovedNotification(
        selectedPayment.member_id,
        selectedPayment.member.full_name,
        selectedPayment.payment_types?.title || "Payment",
        selectedPayment.amount,
        selectedPayment.id
      );

      // Send email notification (non-blocking)
      fetch('/api/notify-payment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: selectedPayment.id,
          status: 'approved',
          callerId: user?.id,
        }),
      }).catch(() => {}); // Non-critical

      showSuccess("Payment approved successfully!");
      setShowApproveModal(false);
      setSelectedPayment(null);
      fetchPendingPayments();
    } catch (error) {
      console.error("Error approving payment:", error);
      showError("Failed to approve payment");
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string, transactionRef?: string) => {
    // Check if waived
    if (status === "approved" && transactionRef?.startsWith("WAIVED-")) {
      return {
        bg: `${colors.accentMint}20`,
        color: colors.accentMint,
        label: "WAIVED",
      };
    }

    switch (status) {
      case "approved":
        return {
          bg: `${colors.statusPaid}20`,
          color: colors.statusPaid,
          label: "APPROVED",
        };
      case "rejected":
        return {
          bg: `${colors.statusUnpaid}20`,
          color: colors.statusUnpaid,
          label: "REJECTED",
        };
      default:
        return {
          bg: `${colors.warning}20`,
          color: colors.warning,
          label: "PENDING",
        };
    }
  };

  const handleReject = async () => {
    if (!selectedPayment || !rejectionReason.trim()) {
      showError("Please provide a rejection reason");
      return;
    }

    try {
      setProcessingId(selectedPayment.id);
      const scope = getOrgScope();
      const { data: adminRec } = await supabase
        .from('member_admins')
        .select('id')
        .eq('member_id', user?.id || '')
        .eq('organization_id', scope?.orgId || '')
        .single();

      if (!adminRec) {
        showError('You are not registered as an admin for this organization');
        setProcessingId(null);
        return;
      }

      const { error } = await supabase
        .from("payments")
        .update({
          status: "rejected",
          approved_by: adminRec.id,
          approved_at: new Date().toISOString(),
          rejection_reason: rejectionReason.trim(),
        })
        .eq("id", selectedPayment.id);

      if (error) throw error;

      // Send notification to student using notification service
      await notificationService.sendPaymentRejectedNotification(
        selectedPayment.member_id,
        selectedPayment.member.full_name,
        selectedPayment.payment_types?.title || "Payment",
        selectedPayment.amount,
        rejectionReason.trim(),
        selectedPayment.id
      );

      // Send email notification (non-blocking)
      fetch('/api/notify-payment-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          paymentId: selectedPayment.id,
          status: 'rejected',
          rejectionReason: rejectionReason.trim(),
          callerId: user?.id,
        }),
      }).catch(() => {}); // Non-critical

      showSuccess("Payment rejected");
      setShowRejectModal(false);
      setRejectionReason("");
      setSelectedPayment(null);
      fetchPendingPayments();
    } catch (error) {
      console.error("Error rejecting payment:", error);
      showError("Failed to reject payment");
    } finally {
      setProcessingId(null);
    }
  };

  // Pre-compute counts once for the chips + stats strip. Was repeated
  // five times inline; pulling it out keeps the JSX readable.
  const pendingCount = payments.filter(p => p.status === 'pending').length;
  const approvedCount = payments.filter(p => p.status === 'approved').length;
  const rejectedCount = payments.filter(p => p.status === 'rejected').length;
  const totalSum = payments
    .filter(p => p.status === 'approved')
    .reduce((s, p) => s + Number(p.amount || 0), 0);

  return (
    <div
      className="min-h-screen py-6 px-4 relative overflow-hidden"
      style={{ background: tk.bgWash, color: tk.text }}
    >
      {/* Soft brand blobs — replaces the 50px grid + dual pulsing orbs
          + ECE photo the legacy hero rendered. Matches the exec
          dashboards. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 -right-24 w-[520px] h-[520px] rounded-full"
        style={{ background: tk.blob1, filter: 'blur(120px)' }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -bottom-40 -left-32 w-[420px] h-[420px] rounded-full"
        style={{ background: tk.blob2, filter: 'blur(110px)' }}
      />

      <div className="max-w-5xl mx-auto space-y-6 relative z-10">
        {/* ── Header ─────────────────────────────────────────────── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
            style={{ color: tk.textTer }}
          >
            <ArrowLeft className="w-3 h-3" />
            Back to dashboard
          </button>

          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
                style={{
                  background: tk.primarySoft,
                  color: tk.primary,
                  border: `1px solid ${tk.primaryRing}`,
                }}
              >
                <Shield className="w-3 h-3" />
                Payment review
              </span>
              {pendingCount > 0 && (
                <span
                  className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full"
                  style={{
                    background: `${tk.amber}18`,
                    color: tk.amber,
                    border: `1px solid ${tk.amber}40`,
                  }}
                >
                  <Clock className="w-3 h-3" />
                  {pendingCount} pending
                </span>
              )}
            </div>
          </div>

          <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight" style={{ color: tk.text }}>
            Review submissions
          </h1>
          <p className="text-sm max-w-2xl" style={{ color: tk.textSec }}>
            Approve, reject, or waive payment submissions toward dues
            you publish. Each tier sees only their own queue — class
            reps handle class dues; dept and faculty execs handle
            their own tier's dues; org owners see everything.
          </p>

          {/* Stats strip — 4 numbers visible at a glance. The amber
              pending tile clicks through to the pending filter (same
              affordance the legacy hero's stats card had). */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
            <ReviewStat
              label="Pending"
              value={pendingCount}
              icon={<Clock className="w-3.5 h-3.5" />}
              color={tk.amber}
              tk={tk}
              onClick={() => { setFilter('pending'); setCurrentPage(1); }}
              active={filter === 'pending'}
            />
            <ReviewStat
              label="Approved"
              value={approvedCount}
              icon={<CheckCircle className="w-3.5 h-3.5" />}
              color={tk.mint}
              tk={tk}
              onClick={() => { setFilter('approved'); setCurrentPage(1); }}
              active={filter === 'approved'}
            />
            <ReviewStat
              label="Rejected"
              value={rejectedCount}
              icon={<XCircle className="w-3.5 h-3.5" />}
              color={tk.danger}
              tk={tk}
              onClick={() => { setFilter('rejected'); setCurrentPage(1); }}
              active={filter === 'rejected'}
            />
            <ReviewStat
              label="Total approved"
              value={`₦${totalSum.toLocaleString()}`}
              icon={<Sparkles className="w-3.5 h-3.5" />}
              color={tk.primary}
              tk={tk}
            />
          </div>
        </motion.header>

        {/* ── Filter chip row ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="rounded-2xl p-3 sm:p-4"
          style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
        >
          <div className="flex items-center gap-2 mb-2.5">
            <Filter className="w-3.5 h-3.5" style={{ color: tk.textTer }} />
            <span className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: tk.textTer }}>
              Filter
            </span>
          </div>
          <div className="flex flex-wrap gap-2">
            {[
              { value: 'all',      label: 'All',      count: payments.length, color: tk.primary, icon: null },
              { value: 'pending',  label: 'Pending',  count: pendingCount,    color: tk.amber,   icon: <Clock className="w-3 h-3" /> },
              { value: 'approved', label: 'Approved', count: approvedCount,   color: tk.mint,    icon: <CheckCircle className="w-3 h-3" /> },
              { value: 'rejected', label: 'Rejected', count: rejectedCount,   color: tk.danger,  icon: <XCircle className="w-3 h-3" /> },
            ].map(({ value, label, count, color, icon }) => {
              const isActive = filter === value;
              return (
                <button
                  key={value}
                  type="button"
                  onClick={() => { setFilter(value as typeof filter); setCurrentPage(1); }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold transition-all"
                  style={{
                    background: isActive ? `${color}18` : (theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.04)'),
                    color: isActive ? color : tk.textSec,
                    border: `1px solid ${isActive ? `${color}40` : tk.cardBorder}`,
                  }}
                >
                  {icon}
                  {label}
                  <span
                    className="ml-0.5 inline-flex items-center justify-center text-[10px] font-bold rounded-full px-1.5 min-w-[18px] h-[18px] tabular-nums"
                    style={{
                      background: isActive ? `${color}28` : (theme === 'light' ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.08)'),
                      color: isActive ? color : tk.textSec,
                    }}
                  >
                    {count}
                  </span>
                </button>
              );
            })}
          </div>
        </motion.div>

        {/* Table */}
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="flex flex-col items-center gap-3">
              <div
                className="animate-spin rounded-full h-10 w-10 border-3 border-t-transparent"
                style={{
                  borderColor: colors.primary,
                  borderTopColor: "transparent",
                }}
              />
              <p className="text-sm" style={{ color: tk.textSec }}>Loading payments...</p>
            </div>
          </div>
        ) : paginatedPayments.length === 0 ? (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <GlassCard>
              <div className="text-center py-12">
                <CheckCircle
                  className="w-16 h-16 mx-auto mb-4"
                  style={{ color: colors.statusPaid }}
                />
                <p className="text-xl mb-2" style={{ color: tk.text }}>
                  {filter === "all"
                    ? "All Caught Up!"
                    : `No ${filter} payments`}
                </p>
                <p style={{ color: tk.textSec }}>
                  No pending payments to review
                </p>
              </div>
            </GlassCard>
          </motion.div>
        ) : (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <GlassCard>
              {/* Desktop Table View */}
              <div className="hidden lg:block overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr
                      className="border-b"
                      style={{ borderColor: tk.cardBorder }}
                    >
                      <th
                        className="text-left py-4 px-4 text-sm font-semibold"
                        style={{ color: tk.textSec }}
                      >
                        STUDENT
                      </th>
                      <th
                        className="text-left py-4 px-4 text-sm font-semibold"
                        style={{ color: tk.textSec }}
                      >
                        PAYMENT TYPE
                      </th>
                      <th
                        className="text-left py-4 px-4 text-sm font-semibold"
                        style={{ color: tk.textSec }}
                      >
                        AMOUNT
                      </th>
                      <th
                        className="text-left py-4 px-4 text-sm font-semibold"
                        style={{ color: tk.textSec }}
                      >
                        SUBMITTED
                      </th>
                      <th
                        className="text-left py-4 px-4 text-sm font-semibold"
                        style={{ color: tk.textSec }}
                      >
                        TRANSACTION REF
                      </th>
                      <th
                        className="text-right py-4 px-4 text-sm font-semibold"
                        style={{ color: tk.textSec }}
                      >
                        ACTIONS
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedPayments.map((payment, index) => (
                      <motion.tr
                        key={payment.id}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: index * 0.05 }}
                        className="border-b transition-colors"
                        style={{ borderColor: tk.cardBorder }}
                      >
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-3">
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center"
                              style={{ background: `${colors.primary}20` }}
                            >
                              <User
                                className="w-5 h-5"
                                style={{ color: colors.primary }}
                              />
                            </div>
                            <div>
                              <p className="font-medium" style={{ color: tk.text }}>
                                {payment.member.full_name}
                              </p>
                              <p
                                className="text-sm"
                                style={{ color: tk.textSec }}
                              >
                                {payment.member.member_id} •{" "}
                                {payment.member.level}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-medium" style={{ color: tk.text }}>
                            {payment.payment_types.title}
                          </p>
                          <p
                            className="text-sm capitalize"
                            style={{ color: tk.textSec }}
                          >
                            {payment.payment_types.category.replace("_", " ")}
                          </p>
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-semibold text-lg" style={{ color: tk.text }}>
                            <PrivacyMask>{formatCurrency(payment.amount)}</PrivacyMask>
                          </p>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center gap-2">
                            <Clock
                              className="w-4 h-4"
                              style={{ color: tk.textSec }}
                            />
                            <p className="text-sm" style={{ color: tk.text }}>
                              {formatDate(payment.created_at, "short")}
                            </p>
                          </div>
                        </td>
                        <td className="py-4 px-4">
                          <p className="font-mono text-sm" style={{ color: tk.text }}>
                            {payment.transaction_ref}
                          </p>
                        </td>
                        <td className="py-4 px-4">
                          <div className="flex items-center justify-end gap-2">
                            <button
                              onClick={() => setSelectedPayment(payment)}
                              className="p-2 rounded-lg transition-all"
                              style={{
                                background: `${colors.primary}20`,
                                color: colors.primary,
                              }}
                              title="View Receipt"
                            >
                              <Eye className="w-5 h-5" />
                            </button>
                            {payment.status === "pending" && hasPermission('can_approve_payments') && (
                              <>
                                <button
                                  onClick={() => {
                                    setSelectedPayment(payment);
                                    setShowApproveModal(true);
                                  }}
                                  disabled={processingId === payment.id}
                                  className="p-2 rounded-lg transition-all disabled:opacity-50"
                                  style={{
                                    background: `${colors.statusPaid}20`,
                                    color: colors.statusPaid,
                                  }}
                                  title="Approve"
                                >
                                  {processingId === payment.id ? (
                                    <div
                                      className="animate-spin rounded-full h-5 w-5 border-2 border-t-transparent"
                                      style={{
                                        borderColor: colors.statusPaid,
                                        borderTopColor: "transparent",
                                      }}
                                    />
                                  ) : (
                                    <Check className="w-5 h-5" />
                                  )}
                                </button>
                                <button
                                  onClick={() => {
                                    setSelectedPayment(payment);
                                    setShowRejectModal(true);
                                  }}
                                  disabled={processingId === payment.id}
                                  className="p-2 rounded-lg transition-all disabled:opacity-50"
                                  style={{
                                    background: `${colors.statusUnpaid}20`,
                                    color: colors.statusUnpaid,
                                  }}
                                  title="Reject"
                                >
                                  <X className="w-5 h-5" />
                                </button>
                              </>
                            )}
                          </div>
                        </td>
                      </motion.tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile compact list — matches the My Dues row style.
                  Was a big centred card per payment (avatar, name,
                  status pill, 3 mini-cards for Type / Amount /
                  Submitted, full tx-ref, then a stack of action
                  buttons). 4-5 payments and the screen was full,
                  triage was slow. New layout: one compact row per
                  payment with avatar + name/title + amount + status
                  chip + a single Open button that pops the detail
                  modal where Approve/Reject already live. */}
              <div className="lg:hidden space-y-2">
                {paginatedPayments.map((payment, index) => {
                  const badge = getStatusBadge(payment.status, payment.transaction_ref);
                  return (
                    <motion.button
                      type="button"
                      key={payment.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ delay: Math.min(index * 0.015, 0.2) }}
                      onClick={() => setSelectedPayment(payment)}
                      className="w-full rounded-2xl p-3 flex items-center gap-3 text-left transition-all active:scale-[0.99]"
                      style={{
                        background: tk.card,
                        border: `1px solid ${tk.cardBorder}`,
                      }}
                    >
                      {/* Avatar — single brand-soft tile, no extra
                          decoration. Cheap to render at scale. */}
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 text-sm font-extrabold"
                        style={{
                          background: tk.primarySoft,
                          color: tk.primary,
                          border: `1px solid ${tk.primaryRing}`,
                        }}
                        aria-hidden
                      >
                        {(payment.member.full_name || '?').charAt(0).toUpperCase()}
                      </div>

                      {/* Identity column — name on top, due title below.
                          Both truncate so a long string can't push the
                          chip off the right edge. */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-bold truncate" style={{ color: tk.text }}>
                          {payment.member.full_name}
                        </p>
                        <p className="text-[11px] truncate" style={{ color: tk.textTer }}>
                          {payment.payment_types.title} · {formatDate(payment.created_at, 'short')}
                        </p>
                      </div>

                      {/* Right column — amount stacked on top of a
                          tiny status chip. tabular-nums keeps the
                          column aligned across rows. */}
                      <div className="shrink-0 text-right">
                        <p className="text-sm font-extrabold tabular-nums" style={{ color: tk.text }}>
                          <PrivacyMask>{formatCurrency(payment.amount)}</PrivacyMask>
                        </p>
                        <span
                          className="inline-flex items-center mt-1 px-1.5 py-0.5 rounded-full text-[9.5px] font-bold uppercase tracking-wider"
                          style={{ background: badge.bg, color: badge.color }}
                        >
                          {badge.label}
                        </span>
                      </div>
                    </motion.button>
                  );
                })}
              </div>
            </GlassCard>
          </motion.div>
        )}

        {/* Pagination */}
        {!loading && filteredPayments.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <GlassCard>
              {totalPages > 1 ? (
                <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
                  <p
                    className="text-xs sm:text-sm text-center sm:text-left"
                    style={{ color: colors.textSecondary }}
                  >
                    Showing {(currentPage - 1) * itemsPerPage + 1} -{" "}
                    {Math.min(
                      currentPage * itemsPerPage,
                      filteredPayments.length
                    )}{" "}
                    of {filteredPayments.length}
                  </p>
                  <div className="flex flex-wrap items-center justify-center gap-2">
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setCurrentPage((p) => Math.max(1, p - 1));
                        scrollToTop();
                      }}
                      disabled={currentPage === 1}
                      className="flex items-center gap-1 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background:
                          currentPage === 1
                            ? "rgba(255, 255, 255, 0.05)"
                            : `linear-gradient(135deg, ${colors.primary}20, ${colors.primary}10)`,
                        border: `1px solid ${currentPage === 1 ? 'transparent' : colors.primary + '40'}`,
                        color:
                          currentPage === 1
                            ? colors.textSecondary
                            : colors.primary,
                      }}
                    >
                      <ChevronLeft className="w-4 h-4" />
                      Previous
                    </motion.button>
                    <div className="flex flex-wrap gap-1 justify-center">
                      {Array.from({ length: totalPages }, (_, i) => i + 1).map(
                        (page) => (
                          <motion.button
                            key={page}
                            whileHover={{ scale: 1.1 }}
                            whileTap={{ scale: 0.95 }}
                            onClick={() => {
                              setCurrentPage(page);
                              scrollToTop();
                            }}
                            className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl text-xs sm:text-sm font-medium transition-all"
                            style={{
                              background:
                                currentPage === page
                                  ? gradients.primary
                                  : "rgba(255, 255, 255, 0.05)",
                              color:
                                currentPage === page
                                  ? "white"
                                  : colors.textSecondary,
                              boxShadow: currentPage === page ? `0 2px 10px ${colors.primary}40` : 'none'
                            }}
                          >
                            {page}
                          </motion.button>
                        )
                      )}
                    </div>
                    <motion.button
                      whileHover={{ scale: 1.02 }}
                      whileTap={{ scale: 0.98 }}
                      onClick={() => {
                        setCurrentPage((p) => Math.min(totalPages, p + 1));
                        scrollToTop();
                      }}
                      disabled={currentPage === totalPages}
                      className="flex items-center gap-1 px-3 sm:px-4 py-2 rounded-xl text-xs sm:text-sm font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                      style={{
                        background:
                          currentPage === totalPages
                            ? "rgba(255, 255, 255, 0.05)"
                            : `linear-gradient(135deg, ${colors.primary}20, ${colors.primary}10)`,
                        border: `1px solid ${currentPage === totalPages ? 'transparent' : colors.primary + '40'}`,
                        color:
                          currentPage === totalPages
                            ? colors.textSecondary
                            : colors.primary,
                      }}
                    >
                      Next
                      <ChevronRight className="w-4 h-4" />
                    </motion.button>
                  </div>
                </div>
              ) : (
                <div className="text-center">
                  <p
                    className="text-xs sm:text-sm"
                    style={{ color: colors.textSecondary }}
                  >
                    Showing all {filteredPayments.length} payment
                    {filteredPayments.length !== 1 ? "s" : ""}
                  </p>
                </div>
              )}
            </GlassCard>
          </motion.div>
        )}
      </div>

      {/* ── Payment review sheet ───────────────────────────────
          Console-pattern modal: bottom-sheet on phones (items-end),
          centred card on desktop. Replaces the legacy GlassCard
          modal that was dark-only, used hardcoded white text, and
          spilled a noisy "Payment Receipt" + status chip cluster
          across the header. Reads with the same hierarchy + spacing
          as the rest of the admin chrome. */}
      <AnimatePresence>
        {selectedPayment && !showRejectModal && !showApproveModal && (() => {
          const sp = selectedPayment;
          const badge = getStatusBadge(sp.status, sp.transaction_ref);
          const isPending = sp.status === 'pending';
          const isLight = theme === 'light';
          return (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
              style={{
                background: isLight ? 'rgba(15,7,3,0.30)' : 'rgba(3,7,18,0.68)',
                backdropFilter: 'blur(10px)',
                WebkitBackdropFilter: 'blur(10px)',
              }}
              onClick={() => setSelectedPayment(null)}
            >
              <motion.div
                initial={{ opacity: 0, y: 12, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 12, scale: 0.98 }}
                transition={{ duration: 0.18 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-2xl max-h-[90vh] rounded-2xl overflow-hidden flex flex-col"
                style={{
                  background: isLight ? '#FFFFFF' : '#100A07',
                  border: `1px solid ${tk.cardBorder}`,
                  boxShadow: '0 24px 60px rgba(0,0,0,0.45)',
                }}
              >
                {/* ── Sheet header ─────────────────────────────
                    Status pill + name + member_id + close. The
                    big "Payment Receipt" branding from before was
                    redundant — the user already clicked into a
                    payment review row to get here. */}
                <div
                  className="p-4 sm:p-5 shrink-0 flex items-start gap-3"
                  style={{ borderBottom: `1px solid ${tk.cardBorder}` }}
                >
                  <div
                    className="w-11 h-11 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0"
                    style={{
                      background: tk.primarySoft,
                      color: tk.primary,
                      border: `1px solid ${tk.primaryRing}`,
                    }}
                  >
                    <FileText className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span
                        className="inline-flex items-center gap-1 text-[9.5px] font-bold uppercase tracking-[0.14em] px-2 py-0.5 rounded-full"
                        style={{ background: badge.bg, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    </div>
                    <p className="text-sm sm:text-base font-extrabold truncate" style={{ color: tk.text }}>
                      {sp.member.full_name}
                    </p>
                    <p className="text-[11px] sm:text-xs truncate" style={{ color: tk.textTer }}>
                      {sp.member.member_id}
                      {sp.member.level ? ` · L${sp.member.level}` : ''}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedPayment(null)}
                    className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.05)',
                      color: tk.textSec,
                      border: `1px solid ${tk.cardBorder}`,
                    }}
                    aria-label="Close"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* ── Scrollable body ────────────────────────── */}
                <div className="overflow-y-auto p-4 sm:p-5 flex-1 min-h-0 space-y-4">
                  {/* Hero stat: Amount big. Type + Submitted secondary. */}
                  <div
                    className="rounded-2xl p-4 sm:p-5"
                    style={{
                      background: `linear-gradient(135deg, ${tk.primary}14, transparent 60%)`,
                      border: `1px solid ${tk.cardBorder}`,
                    }}
                  >
                    <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1" style={{ color: tk.textTer }}>
                      Amount
                    </p>
                    <p
                      className="text-3xl sm:text-4xl font-extrabold tabular-nums leading-none"
                      style={{ color: tk.primary }}
                    >
                      <PrivacyMask>{formatCurrency(sp.amount)}</PrivacyMask>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
                      <span className="text-[11px]" style={{ color: tk.textSec }}>
                        <span style={{ color: tk.textTer }}>Type: </span>
                        <span className="font-bold" style={{ color: tk.text }}>{sp.payment_types.title}</span>
                      </span>
                      <span className="text-[11px]" style={{ color: tk.textSec }}>
                        <span style={{ color: tk.textTer }}>Category: </span>
                        <span className="font-bold capitalize" style={{ color: tk.text }}>
                          {sp.payment_types.category.replace(/_/g, ' ')}
                        </span>
                      </span>
                      <span className="text-[11px]" style={{ color: tk.textSec }}>
                        <span style={{ color: tk.textTer }}>Submitted: </span>
                        <span className="font-bold" style={{ color: tk.text }}>
                          {formatDate(sp.created_at, 'short')}
                        </span>
                      </span>
                    </div>
                  </div>

                  {/* Transaction reference — mono, copy-friendly */}
                  {sp.transaction_ref && (
                    <div
                      className="rounded-xl p-3"
                      style={{
                        background: isLight ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${tk.cardBorder}`,
                      }}
                    >
                      <p
                        className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5"
                        style={{ color: tk.textTer }}
                      >
                        Transaction reference
                      </p>
                      <p
                        className="font-mono text-[12px] sm:text-[13px] break-all"
                        style={{ color: tk.text }}
                      >
                        {sp.transaction_ref}
                      </p>
                    </div>
                  )}

                  {/* Notes */}
                  {sp.notes && (
                    <div
                      className="rounded-xl p-3"
                      style={{
                        background: `${tk.mint}10`,
                        border: `1px solid ${tk.mint}30`,
                      }}
                    >
                      <p
                        className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5"
                        style={{ color: tk.mint }}
                      >
                        Payer's notes
                      </p>
                      <p className="text-[13px] whitespace-pre-wrap" style={{ color: tk.text }}>
                        {sp.notes}
                      </p>
                    </div>
                  )}

                  {/* Rejection reason */}
                  {sp.status === 'rejected' && sp.rejection_reason && (
                    <div
                      className="rounded-xl p-3"
                      style={{
                        background: `${tk.danger}12`,
                        border: `1px solid ${tk.danger}30`,
                      }}
                    >
                      <p
                        className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1.5"
                        style={{ color: tk.danger }}
                      >
                        Rejection reason
                      </p>
                      <p className="text-[13px]" style={{ color: tk.text }}>
                        {sp.rejection_reason}
                      </p>
                    </div>
                  )}

                  {/* Receipt image. Only shown when one was attached
                      (manual / offline payments). Paystack payments
                      live entirely on the transaction reference. */}
                  {sp.receipt_url && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <p
                          className="text-[10px] font-bold uppercase tracking-[0.14em]"
                          style={{ color: tk.textTer }}
                        >
                          Receipt image
                        </p>
                        <button
                          type="button"
                          onClick={() => window.open(sp.receipt_url, '_blank')}
                          className="inline-flex items-center gap-1 text-[11px] font-bold"
                          style={{ color: tk.primary }}
                        >
                          <ExternalLink className="w-3 h-3" />
                          Open
                        </button>
                      </div>
                      <div
                        className="rounded-xl overflow-hidden"
                        style={{
                          background: isLight ? 'rgba(15,7,3,0.03)' : 'rgba(0,0,0,0.30)',
                          border: `1px solid ${tk.cardBorder}`,
                        }}
                      >
                        <img
                          src={sp.receipt_url}
                          alt="Payment receipt"
                          className="w-full h-auto"
                          style={{ maxHeight: 480, objectFit: 'contain' }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* ── Footer actions ───────────────────────────
                    Pending payments get Approve + Reject. Non-pending
                    only show Close (Open Full Size moved inside the
                    receipt section above where it actually relates). */}
                <div
                  className="p-4 sm:p-5 shrink-0 flex gap-2 flex-wrap justify-end"
                  style={{ borderTop: `1px solid ${tk.cardBorder}` }}
                >
                  {isPending && hasPermission('can_approve_payments') ? (
                    <>
                      <button
                        type="button"
                        onClick={() => setShowRejectModal(true)}
                        disabled={processingId === sp.id}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                        style={{
                          background: `${tk.danger}12`,
                          color: tk.danger,
                          border: `1px solid ${tk.danger}35`,
                        }}
                      >
                        <XCircle className="w-3.5 h-3.5" />
                        Reject
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowApproveModal(true)}
                        disabled={processingId === sp.id}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                        style={{
                          background: tk.mint,
                          color: '#FFFFFF',
                          border: `1px solid ${tk.mint}`,
                        }}
                      >
                        <CheckCircle className="w-3.5 h-3.5" />
                        {processingId === sp.id ? 'Approving…' : 'Approve payment'}
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setSelectedPayment(null)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold"
                      style={{
                        background: isLight ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.05)',
                        color: tk.textSec,
                        border: `1px solid ${tk.cardBorder}`,
                      }}
                    >
                      Close
                    </button>
                  )}
                </div>
              </motion.div>
            </motion.div>
          );
        })()}
      </AnimatePresence>

      <ReviewDecisionModal
        kind="approve"
        payment={selectedPayment}
        open={showApproveModal}
        loading={processingId === selectedPayment?.id}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
        onClose={() => setShowApproveModal(false)}
        onConfirm={handleApprove}
      />

      <ReviewDecisionModal
        kind="reject"
        payment={selectedPayment}
        open={showRejectModal}
        loading={processingId === selectedPayment?.id}
        rejectionReason={rejectionReason}
        setRejectionReason={setRejectionReason}
        onClose={() => {
          setShowRejectModal(false);
          setRejectionReason('');
        }}
        onConfirm={handleReject}
      />
      <Footer />
    </div>
  );
}

function ReviewStat({
  label, value, icon, color, tk, onClick, active,
}: {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color: string;
  tk: ReturnType<typeof getDashboardTokens>;
  onClick?: () => void;
  active?: boolean;
}) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`rounded-2xl p-3 sm:p-4 text-left transition-all ${onClick ? 'cursor-pointer hover:-translate-y-0.5 active:scale-[0.99]' : ''}`}
      style={{
        background: tk.card,
        border: `1px solid ${active ? `${color}50` : tk.cardBorder}`,
        boxShadow: active ? `0 8px 22px -12px ${color}` : 'none',
      }}
    >
      <div className="flex items-center gap-2">
        <span
          className="w-7 h-7 rounded-lg flex items-center justify-center"
          style={{ background: `${color}18`, color }}
        >
          {icon}
        </span>
        <p className="text-[10px] uppercase tracking-[0.14em] font-bold" style={{ color: tk.textTer }}>
          {label}
        </p>
      </div>
      <p className="text-xl font-extrabold tabular-nums mt-2 truncate" style={{ color: tk.text }}>
        {value}
      </p>
    </Tag>
  );
}
