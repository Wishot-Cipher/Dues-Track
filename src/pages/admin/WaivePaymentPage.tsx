/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {  } from "react-router-dom";
import { useAppNav } from '@/hooks/useAppNav';
import { supabase } from "@/config/supabase";
import { getOrgScope } from '@/utils/orgScope';
import { getScopedGroupIds } from '@/utils/scopedGroups';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { organizationService } from '@/services/organizationService';
import { colors, gradients } from "@/config/colors";
import GlassCard from "@/components/ui/GlassCard";
import ProfessionalDropdown from "@/components/ui/ProfessionalDropdown";
import { formatCurrency } from "@/utils/formatters";
import { PrivacyMask } from '@/components/ui/PrivacyMask';
import { useAuth } from '@/hooks/useAppAuth';
import { useToast } from "@/hooks/useToast";
import {
  
  X,
  Search,
  FileText,
  AlertCircle,
  CheckCircle,
  User as UserIcon,
  ArrowLeft,
  Bell,
  BellOff,
  Sparkles,
  BadgePercent,
  Heart,
  RefreshCw,
  HelpCircle,
} from "lucide-react";
import LoadingSpinner from '@/components/ui/LoadingSpinner';
import Footer from "@/components/Footer";
import notificationService from "@/services/notificationService";
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';

interface Student {
  id: string;
  full_name: string;
  reg_number: string;
  level: string;
  department: string;
  email?: string;
  group_id?: string;
}

interface PaymentType {
  id: string;
  title: string;
  amount: number;
  description: string;
  deadline: string;
  late_fee_per_day?: number;
  group_id?: string;
}

export default function WaivePaymentPage() {
  const { go: navigate } = useAppNav();
  const { user, hasPermission } = useAuth();
  const { user: mtUser, organization } = useMultiTenantAuth();
  // Resolve the active role's group subtree so a dept/faculty exec
  // can waive payments toward dues they published — not just dues
  // tied to their own primary class. Mirrors the same pattern used
  // by ManageDuesPage and AdminReviewPage.
  const { activeRole } = useActiveRole({
    orgId: organization?.id,
    memberId: mtUser?.id,
  });
  const { success, error: showError } = useToast();
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Student[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([]);
  const [selectedPaymentType, setSelectedPaymentType] = useState<string>("");
  const [waiverReason, setWaiverReason] = useState("");
  const [customNotes, setCustomNotes] = useState("");
  const [notifyStudent, setNotifyStudent] = useState(true);
  const [searching, setSearching] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [refreshingPayments, setRefreshingPayments] = useState(false);

  // Load payment types and student's existing payments when student is selected
  useEffect(() => {
    if (selectedStudent) {
      loadPaymentTypesAndStudentPayments();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedStudent]);

  const loadPaymentTypesAndStudentPayments = async (showRefreshIndicator = false) => {
    if (!selectedStudent) return;

    if (showRefreshIndicator) {
      setRefreshingPayments(true);
    }

    try {
      // Fetch active payment types within the active role's subtree.
      // We swapped `eq('group_id', scope.groupId)` for `in(...)` against
      // the descendant set so a dept/faculty exec can waive payments
      // toward dues they published — not just class-pinned dues. The
      // previous filter quietly hid every dept/faculty due from the
      // waive list, leaving execs unable to waive their own dues.
      const scope = getOrgScope();
      const scopedIds = scope ? await getScopedGroupIds({
        orgId: scope.orgId,
        activeGroupId: activeRole?.groupId ?? null,
        activeScopeLevel: activeRole?.scopeLevel ?? null,
      }) : null;
      let ptQ = supabase
        .from("payment_types")
        .select("id, title, amount, description, deadline, target_levels, group_id")
        .eq("is_active", true);
      if (scope) {
        ptQ = ptQ.eq('organization_id', scope.orgId);
        if (scopedIds) {
          ptQ = ptQ.in('group_id', Array.from(scopedIds));
        }
      }
      const { data: allPaymentTypes, error: ptError } = await ptQ;

      if (ptError) throw ptError;
      const memberLevelCanon = organizationService.canonicalizeLevel(selectedStudent.level || '');
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const filteredPaymentTypes = (allPaymentTypes || []).filter((pt: any) => {
        // Cascade: a due applies to this student when it's org-wide
        // (group_id NULL) or its target group is the student's class
        // / any of its ancestors that the exec also covers.
        const targets: string[] = pt.target_levels || [];
        if (!targets || targets.length === 0) return true;
        const t = targets.map((l: string) => organizationService.canonicalizeLevel(l));
        return t.includes(memberLevelCanon);
      });

      // Fetch student's existing payments. Member-scoped is enough —
      // pinning to a single primary group hid payments the student
      // made toward dues higher in the hierarchy.
      let payQ = supabase
        .from("payments")
        .select("payment_type_id, status, amount")
        .eq("member_id", selectedStudent.id);
      if (scope) {
        payQ = payQ.eq('organization_id', scope.orgId);
      }
      const { data: existingPayments, error: paymentsError } = await payQ;

      if (paymentsError) throw paymentsError;

      // Filter out payment types that are already fully paid or pending
      const paidOrPendingTypeIds = new Set(
        (existingPayments || [])
          .filter((p) => p.status === "approved" || p.status === "pending")
          .map((p) => p.payment_type_id)
      );

      const unpaidTypes = (filteredPaymentTypes || []).filter(
        (pt) => !paidOrPendingTypeIds.has(pt.id)
      );

      setPaymentTypes(unpaidTypes);
    } catch (error) {
      console.error("Error loading payment types:", error);
    } finally {
      if (showRefreshIndicator) {
        setRefreshingPayments(false);
      }
    }
  };

  // Search students (accept optional query param for programmatic/debounced calls)
  const handleSearch = useCallback(async (q?: string) => {
    const query = (q || "").trim();
    if (!query) {
      setSearchResults([]);
      return;
    }

    try {
      setSearching(true);
      const scope = getOrgScope();
      // Search members across the active role's subtree so a faculty
      // exec can waive for any class member under their faculty, not
      // just members of their own primary class. scopedIds is null
      // for org-scope callers (search the whole org) and a Set for
      // unit/group-scope.
      const scopedIds = scope ? await getScopedGroupIds({
        orgId: scope.orgId,
        activeGroupId: activeRole?.groupId ?? null,
        activeScopeLevel: activeRole?.scopeLevel ?? null,
      }) : null;
      let searchQ = supabase
        .from("organization_members")
        .select("id, full_name, member_id, level, email, group_id")
        .or(`full_name.ilike.%${query}%,member_id.ilike.%${query}%`)
        .eq("is_active", true)
        .limit(10);
      if (scope) {
        searchQ = searchQ.eq('organization_id', scope.orgId);
        if (scopedIds) {
          searchQ = searchQ.in('group_id', Array.from(scopedIds));
        }
      }
      const { data, error } = await searchQ;

      if (error) throw error;
      // Map fields explicitly to avoid use of `any` and to normalize member_id -> reg_number
      const normalized = (data || []).map((r: unknown) => {
        const rec = r as Record<string, unknown>;
        return {
          id: String(rec['id'] ?? ''),
          full_name: String(rec['full_name'] ?? ''),
          reg_number: String(rec['member_id'] ?? rec['reg_number'] ?? ''),
          level: String(rec['level'] ?? ''),
          department: String(rec['department'] ?? ''),
          email: (rec['email'] as string) || undefined,
          group_id: (rec['group_id'] as string) || undefined,
        } as Student;
      });
      setSearchResults(normalized);
    } catch (error) {
      console.error("Error searching students:", error);
    } finally {
      setSearching(false);
    }
  }, [activeRole?.groupId, activeRole?.scopeLevel]);

  // Live search as the user types (debounced)
  useEffect(() => {
    if (selectedStudent) return; // don't run live search when a student is already selected
    if (!searchQuery.trim()) {
      setSearchResults([]);
      return;
    }
    const timer = setTimeout(() => {
      void handleSearch(searchQuery);
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery, selectedStudent, handleSearch]);

  const handleWaivePayment = async () => {
    if (!hasPermission('can_approve_payments')) {
      showError('You do not have permission to waive payments');
      return;
    }
    if (!selectedStudent || !selectedPaymentType || !waiverReason) {
      showError("Please fill in all required fields");
      return;
    }

    try {
      setLoading(true);

      // Find the selected payment type details
      const paymentType = paymentTypes.find(
        (pt) => pt.id === selectedPaymentType
      );
      if (!paymentType) throw new Error("Payment type not found");

      // Get reason label for notification
      const reasonLabels: Record<string, string> = {
        financial_hardship: "Financial Hardship",
        medical_emergency: "Medical Emergency",
        class_executive: "Class Executive Role",
        scholarship: "Scholarship/Sponsorship",
        departmental_support: "Departmental Support",
        other: "Other",
      };

      const reasonLabel = reasonLabels[waiverReason] || waiverReason;

      // Create a waived payment record
      const scope = getOrgScope();
      const waiveInsert: Record<string, unknown> = {
          member_id: selectedStudent.id,
          payment_type_id: selectedPaymentType,
          amount: paymentType.amount,
          payment_method: "cash",
          status: "approved",
          approved_by: user?.id,
          approved_at: new Date().toISOString(),
          notes: `\u2705 WAIVED BY ADMIN\n\nReason: ${reasonLabel}\n${
            customNotes ? `Additional Notes: ${customNotes}` : ""
          }\n\nThis payment has been waived and you are not required to pay.`,
          transaction_ref: `WAIVED-${Date.now()}`,
          receipt_url: "",
      };
      // Determine group_id: prefer student's group, fall back to payment type's group
      const groupId = selectedStudent.group_id || (paymentType as any).group_id;
      if (!groupId) {
        showError('Cannot waive payment: student has no group assigned. Please assign a group before waiving.');
        setLoading(false);
        return;
      }
      waiveInsert.group_id = groupId;
      if (scope) {
        waiveInsert.organization_id = scope.orgId;
      }
      // Ensure the current user is an admin and get the admin record id
      const { data: adminRec, error: adminErr } = await supabase
        .from('member_admins')
        .select('id')
        .eq('member_id', user?.id || '')
        .eq('organization_id', scope?.orgId || '')
        .single();

      if (adminErr || !adminRec) {
        showError('You are not registered as an admin for this organization');
        setLoading(false);
        return;
      }

      waiveInsert.approved_by = adminRec.id;

      const { error: paymentError } = await supabase
        .from("payments")
        .insert(waiveInsert)
        .select()
        .single();

      if (paymentError) throw paymentError;

      // Send notification to student if requested
      if (notifyStudent) {
        const reasonLabel = reasonLabels[waiverReason] || waiverReason;
        const fullReason = customNotes
          ? `${reasonLabel}. ${customNotes}`
          : reasonLabel;

        await notificationService.sendPaymentWaivedNotification(
          selectedStudent.id,
          selectedStudent.full_name,
          paymentType.title,
          paymentType.amount,
          fullReason
        );
      }

      // Show success message
      success(`Payment waived successfully for ${selectedStudent.full_name}`);
      setShowSuccess(true);
      setTimeout(() => {
        navigate("/admin/dashboard");
      }, 2000);
    } catch (error) {
      console.error("Error waiving payment:", error);
      showError("Failed to waive payment. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setSelectedStudent(null);
    setSearchQuery("");
    setSearchResults([]);
    setSelectedPaymentType("");
    setWaiverReason("");
    setCustomNotes("");
    setNotifyStudent(true);
  };

  // Tier-aware copy. The waive flow used to greet every exec with
  // "Waive payment fees for students with special circumstances" —
  // which is true for a class rep but read flat for a dept/faculty
  // exec who's waiving across a much bigger scope. Phrasing now
  // adapts to the active role so the page tells the user what
  // scope they're acting at.
  const scopeCopy = (() => {
    if (!activeRole || activeRole.kind !== 'exec') {
      return {
        chip: 'Waive a due',
        title: 'Waive a payment',
        subtitle: 'Excuse a member from a specific due. The audit log records who, what, and why.',
      };
    }
    if (activeRole.scopeLevel === 'org') {
      return {
        chip: 'Org-wide waiver',
        title: 'Waive a payment',
        subtitle: 'You can waive any due across every group in this organisation. Every action is audited.',
      };
    }
    if (activeRole.scopeLevel === 'unit') {
      return {
        chip: 'Faculty / dept waiver',
        title: 'Waive a payment in your subtree',
        subtitle: 'Excuse a member from any due published in your faculty or department, or in a class below.',
      };
    }
    return {
      chip: 'Class waiver',
      title: 'Waive a class member\'s due',
      subtitle: 'Excuse one of your class members from a due you or your dept exec published.',
    };
  })();

  return (
    <div
      className="min-h-screen py-6 px-4 pb-20 relative overflow-hidden"
      style={{ background: tk.bgWash, color: tk.text }}
    >
      {/* Soft brand blobs — matches the exec-dashboard chrome. The
          legacy hero layered a 50px brand-tinted grid + two pulsing
          radial orbs + a single-tenant ECE photo. All of that is
          gone — same wash, no animation churn, light + dark
          friendly. */}
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

      <div className="relative z-10 max-w-3xl mx-auto space-y-5">
        {/* ── Header (chip → H1 → subtitle, matches exec dashboards) ── */}
        <motion.header
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-3"
        >
          {/* Back link as a quiet text chip — not an orange button */}
          <button
            type="button"
            onClick={() => navigate('/admin/dashboard')}
            className="inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-wider transition-opacity hover:opacity-80"
            style={{ color: tk.textTer }}
          >
            <ArrowLeft className="w-3 h-3" />
            Back to dashboard
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            <span
              className="inline-flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.18em] px-2 py-1 rounded-full"
              style={{
                background: `${tk.mint}18`,
                color: tk.mint,
                border: `1px solid ${tk.mint}40`,
              }}
            >
              <BadgePercent className="w-3 h-3" />
              {scopeCopy.chip}
            </span>
          </div>

          <h1 className="text-2xl sm:text-[28px] font-extrabold tracking-tight" style={{ color: tk.text }}>
            {scopeCopy.title}
          </h1>
          <p className="text-sm" style={{ color: tk.textSec }}>
            {scopeCopy.subtitle}
          </p>

          {/* Three-step progress strip — same flow as before, but
              theme-aware and tighter. Each step's chip turns mint
              once that piece is locked in. Connecting lines fill
              in as the user advances. */}
          <div className="flex items-center gap-2 pt-1 flex-wrap">
            <WaiveStep n={1} label="Pick member"  done={Boolean(selectedStudent)}     tk={tk} theme={theme} />
            <span className="flex-1 h-0.5 min-w-[12px] rounded-full" style={{ background: selectedStudent ? tk.mint : tk.cardBorder }} />
            <WaiveStep n={2} label="Pick due"     done={Boolean(selectedPaymentType)} tk={tk} theme={theme} />
            <span className="flex-1 h-0.5 min-w-[12px] rounded-full" style={{ background: selectedPaymentType ? tk.mint : tk.cardBorder }} />
            <WaiveStep n={3} label="Add reason"   done={Boolean(waiverReason)}        tk={tk} theme={theme} />
          </div>
        </motion.header>
      </div>

      {/* Success Modal */}
      {showSuccess && (
        <motion.div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
        >
          <motion.div initial={{ scale: 0.9 }} animate={{ scale: 1 }}>
            <GlassCard className="max-w-md w-full p-8 text-center">
              <motion.div
                className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center"
                style={{ background: colors.statusPaid }}
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.2 }}
              >
                <CheckCircle size={32} className="text-white" />
              </motion.div>
              <h3 className="text-xl font-bold text-white mb-2">
                Payment Waived!
              </h3>
              <p style={{ color: colors.textSecondary }}>
                The payment fee has been successfully waived for{" "}
                {selectedStudent?.full_name}
              </p>
            </GlassCard>
          </motion.div>
        </motion.div>
      )}

      {/* Main Content */}
      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <GlassCard className="p-6 sm:p-8 relative overflow-hidden">
            {/* Decorative gradient */}
            <div 
              className="absolute top-0 left-0 w-full h-1"
              style={{ background: `linear-gradient(90deg, ${colors.accentMint}, ${colors.primary}, transparent)` }}
            />
            
            {/* Step 1: Search and Select Student */}
            <div className="mb-8">
              <div className="flex items-center gap-3 mb-4">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${colors.primary}15`, border: `1px solid ${colors.primary}30` }}
                >
                  <UserIcon size={20} style={{ color: colors.primary }} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Step 1: Select Student</h2>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Search for the student to waive payment</p>
                </div>
              </div>

            {!selectedStudent ? (
              <>
                <div className="mb-3">
                  <div className="flex gap-2">
                    <input
                      value={searchQuery}
                      onChange={(e) => {
                        const v = e.target.value;
                        setSearchQuery(v);
                        if (!v.trim()) {
                          setSearchResults([]);
                        }
                      }}
                      placeholder="Search by name or reg. number"
                      className="flex-1 px-4 py-2 rounded-lg bg-white/5 text-white placeholder-gray-400 outline-none focus:ring-2"
                    />
                    <button
                      onClick={() => void handleSearch(searchQuery)}
                      disabled={searching}
                      className="px-3 py-2 rounded-lg bg-primary-600/10 flex items-center justify-center"
                      title="Search"
                    >
                      {searching ? (
                        <LoadingSpinner size="sm" color={colors.primary} />
                      ) : (
                        <Search size={16} />
                      )}
                    </button>
                  </div>
                {searchResults.length > 0 && (
                  <div className="space-y-2">
                    {searchResults.map((student) => (
                      <motion.button
                        key={student.id}
                        onClick={() => {
                          setSelectedStudent(student);
                          setSearchResults([]);
                          setSearchQuery("");
                        }}
                        className="w-full p-4 rounded-lg border text-left transition-colors"
                        style={{
                          background: "rgba(255, 255, 255, 0.03)",
                          borderColor: "rgba(255, 104, 3, 0.2)",
                        }}
                        whileHover={{
                          background: "rgba(255, 104, 3, 0.1)",
                        }}
                      >
                        <div className="flex items-center justify-between">
                          <div>
                            <p className="font-medium text-white">
                              {student.full_name}
                            </p>
                            <p
                              className="text-sm"
                              style={{ color: colors.textSecondary }}
                            >
                              {student.reg_number} • {student.level} •{" "}
                              {student.department}
                            </p>
                          </div>
                          <UserIcon
                            size={20}
                            style={{ color: colors.primary }}
                          />
                        </div>
                      </motion.button>
                    ))}
                  </div>
                )}
                </div>
              </>
            ) : (
              <div
                className="p-4 rounded-lg border flex items-center justify-between"
                style={{
                  background: "rgba(255, 104, 3, 0.1)",
                  borderColor: "rgba(255, 104, 3, 0.3)",
                }}
              >
                <div>
                  <p className="font-medium text-white">
                    {selectedStudent?.full_name}
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: colors.textSecondary }}
                  >
                    {selectedStudent?.reg_number} • {selectedStudent?.level} •{" "}
                    {selectedStudent?.department}
                  </p>
                </div>
                <button
                  onClick={resetForm}
                  className="p-2 rounded-lg transition-colors"
                  style={{ background: "rgba(255, 255, 255, 0.1)" }}
                >
                  <X size={20} style={{ color: colors.textSecondary }} />
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Select Payment Type */}
          {selectedStudent && (
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div 
                    className="w-10 h-10 rounded-xl flex items-center justify-center"
                    style={{ background: `${colors.accentMint}15`, border: `1px solid ${colors.accentMint}30` }}
                  >
                    <FileText size={20} style={{ color: colors.accentMint }} />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white">Step 2: Select Payment to Waive</h2>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>Choose which payment to waive for this student</p>
                  </div>
                </div>
                <motion.button
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => loadPaymentTypesAndStudentPayments(true)}
                  disabled={refreshingPayments}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-all disabled:opacity-50"
                  style={{
                    background: `${colors.accentMint}15`,
                    border: `1px solid ${colors.accentMint}30`,
                    color: colors.accentMint,
                  }}
                  title="Refresh payments"
                >
                  <RefreshCw 
                    size={16} 
                    className={refreshingPayments ? 'animate-spin' : ''}
                  />
                  <span className="hidden sm:inline">{refreshingPayments ? 'Refreshing...' : 'Refresh'}</span>
                </motion.button>
              </div>

              {paymentTypes.length === 0 ? (
                <div
                  className="p-6 rounded-xl border text-center"
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    borderColor: "rgba(255, 104, 3, 0.2)",
                  }}
                >
                  <CheckCircle
                    size={48}
                    className="mx-auto mb-3"
                    style={{ color: colors.statusPaid }}
                  />
                  <p className="text-white font-medium mb-1">
                    No Outstanding Payments
                  </p>
                  <p
                    className="text-sm"
                    style={{ color: colors.textSecondary }}
                  >
                    This student has no unpaid dues that can be waived
                  </p>
                </div>
              ) : (
                <>
                  <div
                    className="mb-3 p-3 rounded-lg"
                    style={{
                      background: "rgba(6, 182, 212, 0.1)",
                      border: "1px solid rgba(6, 182, 212, 0.3)",
                    }}
                  >
                    <p className="text-sm" style={{ color: colors.accentMint }}>
                      💡 Showing {paymentTypes.length} unpaid dues for{" "}
                      {selectedStudent.full_name}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {paymentTypes.map((paymentType) => (
                      <motion.button
                        key={paymentType.id}
                        onClick={() => setSelectedPaymentType(paymentType.id)}
                        className="w-full p-4 rounded-lg border text-left transition-all"
                        style={{
                          background:
                            selectedPaymentType === paymentType.id
                              ? "rgba(255, 104, 3, 0.2)"
                              : "rgba(255, 255, 255, 0.03)",
                          borderColor:
                            selectedPaymentType === paymentType.id
                              ? colors.primary
                              : "rgba(255, 104, 3, 0.2)",
                          borderWidth:
                            selectedPaymentType === paymentType.id
                              ? "2px"
                              : "1px",
                        }}
                        whileHover={{
                          background: "rgba(255, 104, 3, 0.1)",
                        }}
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <p className="font-medium text-white mb-1">
                              {paymentType.title}
                            </p>
                            <p
                              className="text-sm mb-2"
                              style={{ color: colors.textSecondary }}
                            >
                              {paymentType.description}
                            </p>
                            {paymentType.deadline && (
                              <p
                                className="text-xs"
                                style={{ color: colors.warning }}
                              >
                                ⏰ Due:{" "}
                                {new Date(
                                  paymentType.deadline
                                ).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <div className="ml-4 text-right">
                            <p
                              className="font-bold text-lg"
                              style={{ color: colors.primary }}
                            >
                              <PrivacyMask>{formatCurrency(paymentType.amount)}</PrivacyMask>
                            </p>
                            <p
                              className="text-xs mt-1"
                              style={{ color: colors.textSecondary }}
                            >
                              Amount to waive
                            </p>
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                </>
              )}
            </motion.div>
          )}

          {/* Step 3: Waiver Details */}
          {selectedStudent && selectedPaymentType && (
            <motion.div
              className="mb-8"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <div className="flex items-center gap-3 mb-4">
                <div 
                  className="w-10 h-10 rounded-xl flex items-center justify-center"
                  style={{ background: `${colors.warning}15`, border: `1px solid ${colors.warning}30` }}
                >
                  <AlertCircle size={20} style={{ color: colors.warning }} />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-white">Step 3: Waiver Details</h2>
                  <p className="text-xs" style={{ color: colors.textSecondary }}>Provide reason and notes for this waiver</p>
                </div>
              </div>

              {/* Waiver Reason */}
              <div className="mb-4">
                <ProfessionalDropdown
                  label="Waiver Reason *"
                  placeholder="Select reason..."
                  icon={<HelpCircle className="w-5 h-5" />}
                  value={waiverReason}
                  onChange={(val) => setWaiverReason(val as string)}
                  options={[
                    { value: "financial_hardship", label: "Financial Hardship", icon: <span>💰</span> },
                    { value: "medical_emergency", label: "Medical Emergency", icon: <span>🏥</span> },
                    { value: "class_executive", label: "Class Executive Role", icon: <span>👔</span> },
                    { value: "scholarship", label: "Scholarship/Sponsorship", icon: <span>🎓</span> },
                    { value: "departmental_support", label: "Departmental Support", icon: <span>🏫</span> },
                    { value: "other", label: "Other", icon: <span>📝</span> },
                  ]}
                />
              </div>

              {/* Custom Notes */}
              <div className="mb-4">
                <label className="block text-sm font-medium text-white mb-2">
                  Additional Notes (Optional)
                </label>
                <textarea
                  value={customNotes}
                  onChange={(e) => setCustomNotes(e.target.value)}
                  placeholder="Add any additional context or details that will be shared with the student..."
                  rows={3}
                  className="w-full px-4 py-3 rounded-xl border text-white placeholder-gray-400 resize-none transition-all focus:outline-none focus:ring-2 focus:ring-orange-500"
                  style={{
                    background: "rgba(255, 255, 255, 0.05)",
                    borderColor: "rgba(255, 104, 3, 0.2)",
                  }}
                />
              </div>

              {/* Notification Toggle */}
              <div className="mb-4">
                <div
                  className="p-4 rounded-xl border"
                  style={{
                    background: notifyStudent
                      ? "rgba(6, 182, 212, 0.1)"
                      : "rgba(255, 255, 255, 0.03)",
                    borderColor: notifyStudent
                      ? "rgba(6, 182, 212, 0.3)"
                      : "rgba(255, 104, 3, 0.2)",
                  }}
                >
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={notifyStudent}
                      onChange={(e) => setNotifyStudent(e.target.checked)}
                      className="w-5 h-5 mt-0.5 rounded accent-orange-500"
                    />
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        {notifyStudent ? (
                          <Bell
                            size={18}
                            style={{ color: colors.accentMint }}
                          />
                        ) : (
                          <BellOff
                            size={18}
                            style={{ color: colors.textSecondary }}
                          />
                        )}
                        <span className="font-medium text-white">
                          {notifyStudent
                            ? "Notification Enabled"
                            : "Notification Disabled"}
                        </span>
                      </div>
                      <p
                        className="text-sm"
                        style={{ color: colors.textSecondary }}
                      >
                        {notifyStudent
                          ? `${selectedStudent.full_name} will receive a notification about this waiver with the reason and notes you provided.`
                          : "The student will not be notified about this waiver."}
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Waiver Preview */}
              {waiverReason && (
                <div
                  className="p-4 rounded-xl"
                  style={{
                    background: "rgba(16, 185, 129, 0.1)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                  }}
                >
                  <p
                    className="text-sm font-medium mb-2"
                    style={{ color: colors.statusPaid }}
                  >
                    ✅ Waiver Preview
                  </p>
                  <p className="text-sm text-white">
                    The student will see this payment marked as "WAIVED" with
                    the reason displayed in their payment history.
                  </p>
                </div>
              )}
            </motion.div>
          )}

          {/* Action Buttons */}
          {selectedStudent && selectedPaymentType && waiverReason && (
            <motion.div
              className="flex gap-4"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
            >
              <button
                onClick={resetForm}
                disabled={loading}
                className="flex-1 px-6 py-3 rounded-xl font-medium transition-opacity disabled:opacity-50"
                style={{
                  background: "rgba(255, 255, 255, 0.1)",
                  color: colors.textPrimary,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleWaivePayment}
                disabled={loading || !hasPermission('can_approve_payments')}
                className="flex-1 px-6 py-3 rounded-xl font-medium text-white transition-opacity disabled:opacity-50"
                style={{ background: gradients.primary }}
              >
                {loading ? "Processing..." : "Waive Payment"}
              </button>
            </motion.div>
          )}
        </GlassCard>
        </motion.div>
      </div>
      <Footer />
    </div>
  );
}

/**
 * WaiveStep — single step chip in the waive flow's progress strip.
 * Renders as a mint-tinted "done" chip once the step is complete;
 * a brand-coloured "current" chip otherwise. Compact enough that
 * three of them + connecting lines fit on a 320px phone.
 */
function WaiveStep({
  n, label, done, tk, theme,
}: {
  n: number;
  label: string;
  done: boolean;
  tk: ReturnType<typeof getDashboardTokens>;
  theme: 'light' | 'dark';
}) {
  const isLight = theme === 'light';
  return (
    <div
      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full text-[10.5px] font-bold uppercase tracking-wider"
      style={{
        background: done
          ? `${tk.mint}18`
          : (isLight ? 'rgba(15,7,3,0.04)' : 'rgba(255,255,255,0.04)'),
        color: done ? tk.mint : tk.textSec,
        border: `1px solid ${done ? tk.mint + '40' : tk.cardBorder}`,
      }}
    >
      <span
        className="w-4 h-4 rounded-full flex items-center justify-center text-[9px] font-extrabold"
        style={{
          background: done ? tk.mint : tk.cardBorder,
          color: done ? '#FFFFFF' : tk.textTer,
        }}
      >
        {n}
      </span>
      {label}
    </div>
  );
}
