/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect, useCallback } from "react";
import { motion } from "framer-motion";
import {  } from "react-router-dom";
import { useAppNav } from '@/hooks/useAppNav';
import { supabase, getStoredAccessToken } from "@/config/supabase";
import { getOrgScope } from '@/utils/orgScope';
import { getScopedGroupIds, getOwnedTierScope, applyOwnedTierScope } from '@/utils/scopedGroups';
import { useActiveRole } from '@/hooks/useActiveRole';
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth';
import { organizationService } from '@/services/organizationService';
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
  ChevronRight,
  Clock,
  Info,
  User as UserIcon,
  ArrowLeft,
  Bell,
  BellOff,
  BadgePercent,
  RefreshCw,
  HelpCircle,
  Check,
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
  // Mig 057 added category='event' for ticketed events. The waiver
  // path branches on this — events grant a free ticket of a specific
  // tier instead of just zeroing the fee.
  category?: string;
}

interface EventTier {
  id: string;
  name: string;
  price: number;
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
  // Event-waiver state. When the picked due is category='event' we
  // load its tier list and force the admin to pick a tier — the
  // recipient gets a free ticket of THAT tier, not just a zeroed fee.
  const [eventTiers, setEventTiers] = useState<EventTier[]>([]);
  const [selectedTierId, setSelectedTierId] = useState<string>('');
  const [tiersLoading, setTiersLoading] = useState(false);
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

  // When the admin picks an event, load its ticket tiers so they can
  // pick which one to grant. Non-event selections clear the tier
  // state. We skip the network call entirely for non-events to keep
  // the picker step snappy.
  useEffect(() => {
    setSelectedTierId('');
    setEventTiers([]);
    if (!selectedPaymentType) return;
    const pt = paymentTypes.find((p) => p.id === selectedPaymentType);
    if (!pt || pt.category !== 'event') return;
    let cancelled = false;
    setTiersLoading(true);
    (async () => {
      const { data, error } = await supabase
        .from('event_ticket_tiers')
        .select('id, name, price')
        .eq('payment_type_id', pt.id)
        .eq('is_active', true)
        .order('sort_order');
      if (cancelled) return;
      if (error) {
        showError(`Could not load ticket tiers: ${error.message}`);
        setTiersLoading(false);
        return;
      }
      const tiers = (data || []) as EventTier[];
      setEventTiers(tiers);
      // Auto-pick the cheapest tier as default — the most common
      // "free ticket" use case is the entry-level pass.
      if (tiers.length > 0) {
        const cheapest = tiers.reduce((min, t) => (t.price < min.price ? t : min), tiers[0]);
        setSelectedTierId(cheapest.id);
      }
      setTiersLoading(false);
    })();
    return () => { cancelled = true; };
  }, [selectedPaymentType, paymentTypes, showError]);

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
      // Tier autonomy: the waivable dues are ONLY the ones this exec's
      // own tier created — a dept exec waives dept dues, a class rep
      // waives class dues. The class's own dues never appear in the
      // dept exec's list (that's the class rep's job). The MEMBER
      // search below still spans the subtree, so a dept exec can pick
      // any student under them to waive a DEPT due for.
      const scope = getOrgScope();
      const ownedScope = getOwnedTierScope({
        activeKind: activeRole?.kind ?? null,
        activeGroupId: activeRole?.groupId ?? null,
        activeScopeLevel: activeRole?.scopeLevel ?? null,
      });
      let ptQ = supabase
        .from("payment_types")
        .select("id, title, amount, description, deadline, target_levels, group_id, category")
        .eq("is_active", true);
      if (scope) {
        ptQ = ptQ.eq('organization_id', scope.orgId);
        ptQ = applyOwnedTierScope(ptQ, ownedScope);
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

      // ── EVENT BRANCH: grant a free ticket via the server endpoint.
      //    The endpoint inserts the payment row + mints the
      //    event_tickets row in one shot (RLS gates event_tickets to
      //    service_role). The recipient gets a real QR — same shape
      //    as a paying buyer.
      if (paymentType.category === 'event') {
        if (!selectedTierId) {
          showError('Pick which ticket tier this person should receive.');
          setLoading(false);
          return;
        }
        const reasonForRecord = customNotes
          ? `${reasonLabel}. ${customNotes}`
          : reasonLabel;
        const issueRes = await fetch('/api/billing/verify-payment', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${getStoredAccessToken()}`,
          },
          body: JSON.stringify({
            action: 'issue-free-ticket',
            callerId: user?.id,
            paymentTypeId: paymentType.id,
            tierId: selectedTierId,
            recipientMemberId: selectedStudent.id,
            reason: reasonForRecord,
          }),
        });
        const issueData = await issueRes.json();
        if (!issueRes.ok || !issueData?.ok) {
          throw new Error(issueData?.error || 'Could not grant the free ticket.');
        }
        // The endpoint already notifies the recipient server-side
        // (reliable, links to their ticket) — no client notification
        // here, or they'd get two.
        success(`Free ticket granted to ${selectedStudent.full_name}`);
        setShowSuccess(true);
        setTimeout(() => navigate('/admin/dashboard'), 2000);
        return;
      }

      // Create a waived payment record
      const scope = getOrgScope();
      // Note: payments.approved_by was dropped in mig 020 (legacy FK
      // to the old `admins` table). The audit trail now lives in the
      // notes field \u2014 "WAIVED BY ADMIN" + reason \u2014 and the JWT
      // identifies who triggered the write. Don't reintroduce
      // approved_by here; it will fail PostgREST schema lookup.
      const waiveInsert: Record<string, unknown> = {
          member_id: selectedStudent.id,
          payment_type_id: selectedPaymentType,
          amount: paymentType.amount,
          payment_method: "cash",
          status: "approved",
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
      // Resolve the admin record. A dept-pres-AND-class-rep has TWO
      // active member_admins rows in the same org (one per scope), so
      // .single() throws PGRST116 ("Cannot coerce the result to a
      // single JSON object"). We pick the highest-layer row instead —
      // any active row is enough to attribute approved_by, and the
      // higher-layer one is the most authoritative identity for the
      // audit log.
      const { data: adminRec, error: adminErr } = await supabase
        .from('member_admins')
        .select('id, verification_layer')
        .eq('member_id', user?.id || '')
        .eq('organization_id', scope?.orgId || '')
        .eq('is_active', true)
        .order('verification_layer', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (adminErr || !adminRec) {
        showError(adminErr?.message
          ? `Admin lookup failed: ${adminErr.message}`
          : 'You are not registered as an admin for this organization');
        setLoading(false);
        return;
      }

      // adminRec.id resolution kept around for future use (event
      // path uses it). Not assigned to waiveInsert.approved_by —
      // the column was dropped in mig 020.
      void adminRec;

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
      // Surface the actual error message so the user (and we) can
      // see WHY a waive failed — generic "try again" hid RLS
      // rejections, missing columns, and the multi-admin .single()
      // crash. Truncated to keep the toast short.
      const msg = error instanceof Error
        ? error.message.slice(0, 220)
        : 'Failed to waive payment. Please try again.';
      showError(`Waive failed: ${msg}`);
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

      {/* Success modal — theme-aware celebration. Drops the GlassCard
          + hardcoded text-white. Spring-in checkmark, soft mint glow,
          short copy. Same trigger + visibility logic as before. */}
      {showSuccess && (
        <motion.div
          className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          style={{
            background: theme === 'light' ? 'rgba(15,7,3,0.30)' : 'rgba(3,7,18,0.68)',
            backdropFilter: 'blur(10px)',
            WebkitBackdropFilter: 'blur(10px)',
          }}
        >
          <motion.div
            initial={{ scale: 0.92, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 320 }}
            className="w-full max-w-md rounded-2xl p-6 sm:p-8 text-center"
            style={{
              background: theme === 'light' ? '#FFFFFF' : '#100A07',
              border: `1px solid ${tk.mint}40`,
              boxShadow: `0 24px 60px rgba(0,0,0,0.45), 0 0 0 4px ${tk.mint}10`,
            }}
          >
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.1, type: 'spring', stiffness: 380, damping: 20 }}
              className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center"
              style={{
                background: tk.mint,
                color: '#FFFFFF',
                boxShadow: `0 12px 28px -8px ${tk.mint}, inset 0 1px 0 rgba(255,255,255,0.3)`,
              }}
            >
              <CheckCircle size={32} />
            </motion.div>
            <h3 className="text-lg font-extrabold tracking-tight mb-1.5" style={{ color: tk.text }}>
              Waived
            </h3>
            <p className="text-sm" style={{ color: tk.textSec }}>
              The due was excused for{' '}
              <span className="font-bold" style={{ color: tk.text }}>
                {selectedStudent?.full_name}
              </span>
              . The audit log has it.
            </p>
          </motion.div>
        </motion.div>
      )}

      {/* ── Body ───────────────────────────────────────────────
          Three step-cards stacked, theme-aware throughout. Replaces
          the previous "one fat GlassCard with three sections inside"
          shape that was dark-only and read as the old era of the
          app. Each step is its own card, only renders when the
          previous step is satisfied. */}
      <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 space-y-4">

        {/* ── Step 1: Pick the member ────────────────────────── */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="rounded-2xl p-5 sm:p-6 space-y-4"
          style={{
            background: tk.card,
            border: `1px solid ${tk.cardBorder}`,
          }}
        >
          <header className="flex items-center gap-3">
            <span
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{ background: tk.primarySoft, color: tk.primary, border: `1px solid ${tk.primaryRing}` }}
            >
              <UserIcon size={16} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: tk.primary }}>
                Step 1
              </p>
              <h2 className="text-base font-extrabold tracking-tight" style={{ color: tk.text }}>
                Pick the member
              </h2>
            </div>
          </header>

          {!selectedStudent ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div
                  className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl transition-colors"
                  style={{
                    background: theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${tk.cardBorder}`,
                  }}
                >
                  <Search className="w-4 h-4 shrink-0" style={{ color: tk.textTer }} />
                  <input
                    value={searchQuery}
                    onChange={(e) => {
                      const v = e.target.value;
                      setSearchQuery(v);
                      if (!v.trim()) setSearchResults([]);
                    }}
                    onKeyDown={(e) => { if (e.key === 'Enter') void handleSearch(searchQuery); }}
                    placeholder="Search by name or member ID"
                    className="flex-1 bg-transparent text-sm font-medium outline-none"
                    style={{ color: tk.text }}
                  />
                </div>
                <button
                  type="button"
                  onClick={() => void handleSearch(searchQuery)}
                  disabled={searching || !searchQuery.trim()}
                  className="px-3.5 py-2 rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-40"
                  style={{
                    background: tk.primary,
                    color: '#FFFFFF',
                    border: `1px solid ${tk.primary}`,
                  }}
                >
                  {searching ? <LoadingSpinner size="sm" color="#FFFFFF" /> : 'Search'}
                </button>
              </div>

              {searchResults.length > 0 && (
                <div className="space-y-2">
                  {searchResults.map((student) => (
                    <motion.button
                      key={student.id}
                      type="button"
                      onClick={() => {
                        setSelectedStudent(student);
                        setSearchResults([]);
                        setSearchQuery("");
                      }}
                      className="w-full p-3 rounded-xl text-left transition-all hover:-translate-y-0.5 active:scale-[0.99]"
                      style={{
                        background: theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.03)',
                        border: `1px solid ${tk.cardBorder}`,
                      }}
                      whileHover={{ borderColor: tk.primaryRing }}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-bold truncate" style={{ color: tk.text }}>
                            {student.full_name}
                          </p>
                          <p className="text-[11px] mt-0.5 truncate" style={{ color: tk.textTer }}>
                            {student.reg_number}
                            {student.level ? ` · L${student.level}` : ''}
                            {student.department ? ` · ${student.department}` : ''}
                          </p>
                        </div>
                        <ChevronRight className="w-4 h-4 shrink-0" style={{ color: tk.primary }} />
                      </div>
                    </motion.button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            // Selected-student chip — clear callout, prominent reset.
            <div
              className="p-3 rounded-xl flex items-center gap-3"
              style={{
                background: tk.primarySoft,
                border: `1px solid ${tk.primaryRing}`,
              }}
            >
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 text-sm font-extrabold"
                style={{
                  background: `linear-gradient(135deg, ${tk.primary}, ${tk.primary}cc)`,
                  color: '#FFFFFF',
                }}
              >
                {selectedStudent.full_name?.charAt(0)?.toUpperCase() || '?'}
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-extrabold truncate" style={{ color: tk.text }}>
                  {selectedStudent.full_name}
                </p>
                <p className="text-[11px] truncate" style={{ color: tk.textTer }}>
                  {selectedStudent.reg_number}
                  {selectedStudent.level ? ` · L${selectedStudent.level}` : ''}
                  {selectedStudent.department ? ` · ${selectedStudent.department}` : ''}
                </p>
              </div>
              <button
                type="button"
                onClick={resetForm}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors"
                style={{
                  background: theme === 'light' ? 'rgba(15,7,3,0.06)' : 'rgba(255,255,255,0.06)',
                  color: tk.textSec,
                }}
                aria-label="Change member"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}
        </motion.section>

        {/* ── Step 2: Pick the due ───────────────────────────── */}
        {selectedStudent && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5 sm:p-6 space-y-4"
            style={{
              background: tk.card,
              border: `1px solid ${tk.cardBorder}`,
            }}
          >
            <header className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${tk.mint}18`, color: tk.mint, border: `1px solid ${tk.mint}40` }}
                >
                  <FileText size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: tk.mint }}>
                    Step 2
                  </p>
                  <h2 className="text-base font-extrabold tracking-tight" style={{ color: tk.text }}>
                    Pick the due to waive
                  </h2>
                </div>
              </div>
              <button
                type="button"
                onClick={() => loadPaymentTypesAndStudentPayments(true)}
                disabled={refreshingPayments}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
                style={{
                  background: tk.card,
                  color: tk.textSec,
                  border: `1px solid ${tk.cardBorder}`,
                }}
              >
                <RefreshCw size={12} className={refreshingPayments ? 'animate-spin' : ''} />
                <span className="hidden sm:inline">{refreshingPayments ? 'Refreshing' : 'Refresh'}</span>
              </button>
            </header>

            {paymentTypes.length === 0 ? (
              <div
                className="p-6 rounded-xl text-center"
                style={{
                  background: theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${tk.cardBorder}`,
                }}
              >
                <span
                  className="w-12 h-12 mx-auto mb-3 rounded-2xl flex items-center justify-center"
                  style={{ background: `${tk.mint}18`, color: tk.mint, border: `1px solid ${tk.mint}40` }}
                >
                  <CheckCircle className="w-6 h-6" />
                </span>
                <p className="text-sm font-extrabold mb-1" style={{ color: tk.text }}>
                  Nothing to waive
                </p>
                <p className="text-xs" style={{ color: tk.textSec }}>
                  This member has no unpaid dues in your scope.
                </p>
              </div>
            ) : (
              <>
                <div
                  className="p-3 rounded-xl flex items-start gap-2.5"
                  style={{
                    background: `${tk.mint}10`,
                    border: `1px solid ${tk.mint}30`,
                  }}
                >
                  <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tk.mint }} />
                  <p className="text-[11px] leading-relaxed" style={{ color: tk.text }}>
                    Showing <span className="font-bold">{paymentTypes.length}</span>{' '}
                    {paymentTypes.length === 1 ? 'unpaid due' : 'unpaid dues'} for{' '}
                    <span className="font-bold">{selectedStudent.full_name}</span>.
                  </p>
                </div>

                <div className="space-y-2">
                  {paymentTypes.map((paymentType) => {
                    const isSelected = selectedPaymentType === paymentType.id;
                    return (
                      <motion.button
                        key={paymentType.id}
                        type="button"
                        onClick={() => setSelectedPaymentType(paymentType.id)}
                        className="w-full p-3 sm:p-4 rounded-xl text-left transition-all hover:-translate-y-0.5 active:scale-[0.99]"
                        style={{
                          background: isSelected ? tk.primarySoft : (theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.03)'),
                          border: `${isSelected ? '2px' : '1px'} solid ${isSelected ? tk.primary : tk.cardBorder}`,
                          boxShadow: isSelected ? `0 8px 22px -12px ${tk.primary}` : 'none',
                        }}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-extrabold truncate" style={{ color: tk.text }}>
                              {paymentType.title}
                            </p>
                            {paymentType.description && (
                              <p className="text-[11px] mt-1 line-clamp-2" style={{ color: tk.textSec }}>
                                {paymentType.description}
                              </p>
                            )}
                            {paymentType.deadline && (
                              <p className="text-[10px] font-bold uppercase tracking-wider mt-1.5 inline-flex items-center gap-1" style={{ color: tk.amber }}>
                                <Clock className="w-2.5 h-2.5" />
                                Due {new Date(paymentType.deadline).toLocaleDateString()}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-base sm:text-lg font-extrabold tabular-nums" style={{ color: tk.primary }}>
                              <PrivacyMask>{formatCurrency(paymentType.amount)}</PrivacyMask>
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wider mt-0.5" style={{ color: tk.textTer }}>
                              To waive
                            </p>
                          </div>
                        </div>
                      </motion.button>
                    );
                  })}
                </div>
              </>
            )}
          </motion.section>
        )}

        {/* ── Step 2b: Event tier picker ────────────────────────
            Only renders for events. The selected tier becomes the
            free ticket the recipient gets minted. Cheapest tier
            auto-selected so the simple case is one less click. */}
        {selectedStudent && selectedPaymentType && (() => {
          const pt = paymentTypes.find((p) => p.id === selectedPaymentType);
          if (!pt || pt.category !== 'event') return null;
          return (
            <motion.section
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-2xl p-5 sm:p-6 space-y-4"
              style={{ background: tk.card, border: `1px solid ${tk.cardBorder}` }}
            >
              <header className="flex items-center gap-3">
                <span
                  className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                  style={{ background: `${tk.mint}18`, color: tk.mint, border: `1px solid ${tk.mint}40` }}
                >
                  <Check size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: tk.mint }}>
                    Step 2b
                  </p>
                  <h2 className="text-base font-extrabold tracking-tight" style={{ color: tk.text }}>
                    Pick the ticket tier to grant
                  </h2>
                  <p className="text-[12px] mt-0.5" style={{ color: tk.textSec }}>
                    {selectedStudent.full_name} will get a real ticket of this tier — same QR + check-in flow as a paying buyer.
                  </p>
                </div>
              </header>

              {tiersLoading ? (
                <p className="text-[12px]" style={{ color: tk.textSec }}>Loading tiers…</p>
              ) : eventTiers.length === 0 ? (
                <p className="text-[12px]" style={{ color: tk.danger }}>
                  This event has no active tiers. Add one in the event editor before granting free tickets.
                </p>
              ) : (
                <ProfessionalDropdown
                  label="Ticket tier *"
                  placeholder="Pick a tier…"
                  value={selectedTierId}
                  onChange={(v) => setSelectedTierId(Array.isArray(v) ? v[0] : v)}
                  options={eventTiers.map((tier) => ({
                    value: tier.id,
                    label: tier.name,
                    description: formatCurrency(tier.price),
                  }))}
                />
              )}
            </motion.section>
          );
        })()}

        {/* ── Step 3: Reason + notes + notify ─────────────────── */}
        {selectedStudent && selectedPaymentType && (
          <motion.section
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl p-5 sm:p-6 space-y-4"
            style={{
              background: tk.card,
              border: `1px solid ${tk.cardBorder}`,
            }}
          >
            <header className="flex items-center gap-3">
              <span
                className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: `${tk.amber}18`, color: tk.amber, border: `1px solid ${tk.amber}40` }}
              >
                <AlertCircle size={16} />
              </span>
              <div className="flex-1 min-w-0">
                <p className="text-[10px] font-bold uppercase tracking-[0.18em]" style={{ color: tk.amber }}>
                  Step 3
                </p>
                <h2 className="text-base font-extrabold tracking-tight" style={{ color: tk.text }}>
                  Tell us why
                </h2>
              </div>
            </header>

            <ProfessionalDropdown
              label="Waiver reason *"
              placeholder="Select reason…"
              icon={<HelpCircle className="w-5 h-5" />}
              value={waiverReason}
              onChange={(val) => setWaiverReason(val as string)}
              options={[
                { value: "financial_hardship",   label: "Financial hardship",       icon: <span>💰</span> },
                { value: "medical_emergency",    label: "Medical emergency",        icon: <span>🏥</span> },
                { value: "class_executive",      label: "Class executive role",     icon: <span>👔</span> },
                { value: "scholarship",          label: "Scholarship / sponsorship",icon: <span>🎓</span> },
                { value: "departmental_support", label: "Departmental support",     icon: <span>🏫</span> },
                { value: "other",                label: "Other",                    icon: <span>📝</span> },
              ]}
            />

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold uppercase tracking-wider" style={{ color: tk.textTer }}>
                Notes <span className="opacity-60">(optional)</span>
              </label>
              <textarea
                value={customNotes}
                onChange={(e) => setCustomNotes(e.target.value)}
                placeholder="Anything you'd like the member to see along with the waiver…"
                rows={3}
                className="w-full px-3 py-2.5 rounded-xl text-sm resize-none outline-none focus:ring-2 transition-all"
                style={{
                  background: theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.04)',
                  border: `1px solid ${tk.cardBorder}`,
                  color: tk.text,
                  ['--tw-ring-color' as string]: tk.primaryRing,
                } as React.CSSProperties}
              />
            </div>

            {/* Notify toggle — tinted when active, neutral when off. */}
            <label
              className="flex items-start gap-3 p-3 rounded-xl cursor-pointer transition-colors"
              style={{
                background: notifyStudent ? `${tk.mint}10` : (theme === 'light' ? 'rgba(15,7,3,0.03)' : 'rgba(255,255,255,0.03)'),
                border: `1px solid ${notifyStudent ? tk.mint + '40' : tk.cardBorder}`,
              }}
            >
              <input
                type="checkbox"
                checked={notifyStudent}
                onChange={(e) => setNotifyStudent(e.target.checked)}
                className="w-4 h-4 mt-0.5 shrink-0"
                style={{ accentColor: tk.mint }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  {notifyStudent
                    ? <Bell className="w-3.5 h-3.5" style={{ color: tk.mint }} />
                    : <BellOff className="w-3.5 h-3.5" style={{ color: tk.textTer }} />}
                  <span className="text-xs font-extrabold" style={{ color: tk.text }}>
                    {notifyStudent ? 'Notification on' : 'Notification off'}
                  </span>
                </div>
                <p className="text-[11px] mt-1 leading-relaxed" style={{ color: tk.textSec }}>
                  {notifyStudent
                    ? `${selectedStudent.full_name} will get an in-app notification with the reason and notes.`
                    : `${selectedStudent.full_name} won't be notified about this waiver.`}
                </p>
              </div>
            </label>

            {/* Preview chip — shows what the member's payment record will read once waived. */}
            {waiverReason && (
              <div
                className="p-3 rounded-xl"
                style={{
                  background: `${tk.mint}10`,
                  border: `1px solid ${tk.mint}30`,
                }}
              >
                <p className="text-[10px] font-bold uppercase tracking-[0.14em] mb-1 inline-flex items-center gap-1" style={{ color: tk.mint }}>
                  <CheckCircle className="w-3 h-3" />
                  Preview
                </p>
                <p className="text-xs leading-relaxed" style={{ color: tk.text }}>
                  {(() => {
                    const pt = paymentTypes.find((p) => p.id === selectedPaymentType);
                    if (pt?.category === 'event') {
                      const tier = eventTiers.find((tier) => tier.id === selectedTierId);
                      return (
                        <>
                          A <span className="font-mono font-bold" style={{ color: tk.mint }}>FREE TICKET</span>
                          {tier ? <> for <strong>{tier.name}</strong></> : null} will be issued to {selectedStudent.full_name} —
                          they'll see it in their tickets list and can be checked in at the door.
                        </>
                      );
                    }
                    return (
                      <>
                        This payment row will be marked <span className="font-mono font-bold" style={{ color: tk.mint }}>WAIVED</span> in
                        the member's history, with the reason shown next to it.
                      </>
                    );
                  })()}
                </p>
              </div>
            )}
          </motion.section>
        )}

        {/* ── Actions ───────────────────────────────────────────
            For event waivers we also require a tier pick — without
            it the issue-free-ticket endpoint can't mint the ticket. */}
        {(() => {
          if (!(selectedStudent && selectedPaymentType && waiverReason)) return false;
          const pt = paymentTypes.find((p) => p.id === selectedPaymentType);
          if (pt?.category === 'event' && !selectedTierId) return false;
          return true;
        })() && (
          <motion.div
            className="flex gap-2 flex-wrap justify-end"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
          >
            <button
              type="button"
              onClick={resetForm}
              disabled={loading}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all disabled:opacity-50"
              style={{
                background: theme === 'light' ? 'rgba(15,7,3,0.05)' : 'rgba(255,255,255,0.05)',
                color: tk.textSec,
                border: `1px solid ${tk.cardBorder}`,
              }}
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleWaivePayment}
              disabled={loading || !hasPermission('can_approve_payments')}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all hover:-translate-y-0.5 active:scale-[0.98] disabled:opacity-50"
              style={{
                background: tk.mint,
                color: '#FFFFFF',
                border: `1px solid ${tk.mint}`,
                boxShadow: `0 8px 22px -10px ${tk.mint}`,
              }}
            >
              <CheckCircle className="w-3.5 h-3.5" />
              {loading ? 'Processing…' : 'Waive payment'}
            </button>
          </motion.div>
        )}
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
