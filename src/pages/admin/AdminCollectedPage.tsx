/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAppNav } from '@/hooks/useAppNav';
import GlassCard from '@/components/ui/GlassCard';
import AnimatedCounter from '@/components/ui/AnimatedCounter';
import FinancialChart from '@/components/admin/FinancialChart';
import { supabase } from '@/config/supabase';
import { getOrgScope } from '@/utils/orgScope';
import { colors } from '@/config/colors';
import Footer from '@/components/Footer';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { PrivacyMask } from '@/components/ui/PrivacyMask';
import { getDashboardTokens, useTheme } from '@/hooks/useTheme';
import {
  ArrowLeft, Users, Wallet, TrendingUp, Filter, Search, Download,
  ChevronLeft, ChevronRight, Sparkles, PieChart, CheckCircle, XCircle,
  BarChart3, FileText, FileSpreadsheet, ChevronDown, LineChart,
} from 'lucide-react';
import { exportCollectedPaymentsToPDF } from '@/utils/htmlPrintExports';
import { useToast } from '@/hooks/useToast';
import { useOrganization } from '@/hooks/useOrganization';
import ProfessionalDateTimePicker from '@/components/ui/ProfessionalDateTimePicker';

interface StudentPayment {
  id: string;
  member_id: string;
  student_name: string;
  reg_number: string;
  level: string;
  department: string;
  is_active: boolean;
  payments: {
    id: string;
    amount: number;
    category: string;
    payment_type: string;
    transaction_ref: string;
    status: string;
    created_at: string;
    waived?: boolean;
  }[];
  total_paid: number;
  payment_count: number;
  categories_paid: string[];
  has_paid: boolean;
}

interface CategoryExpenses {
  category: string;
  total_collected: number;
  total_expenses: number;
  net_balance: number;
  payment_count: number;
}

export default function AdminCollectedPage() {
  const { go: navigate } = useAppNav();
  const { success: showSuccess, error: showError } = useToast();
  const { group, settings } = useOrganization();
  const { theme } = useTheme();
  const tk = getDashboardTokens(theme);

  // ── Date range state (ISO date strings "YYYY-MM-DD" or empty) ──
  const [rangeStart, setRangeStart] = useState<string>('');
  const [rangeEnd,   setRangeEnd]   = useState<string>('');

  // Derived Date objects used in filtering logic
  const dateRange = useMemo(() => ({
    start: rangeStart ? new Date(rangeStart) : null,
    end:   rangeEnd   ? new Date(rangeEnd + 'T23:59:59') : null, // inclusive end-of-day
  }), [rangeStart, rangeEnd]);

  // Org/group-level fallback values for exports
  const academicInfo = (settings?.custom_settings as Record<string, unknown>)?.academic as { academic_level?: string } | undefined;
  const orgLevel      = academicInfo?.academic_level || '';
  const orgDepartment = group?.name || '';

  const [loading, setLoading] = useState(true);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [_studentPayments, setStudentPayments] = useState<StudentPayment[]>([]);
  const [allStudents,    setAllStudents]    = useState<StudentPayment[]>([]);
  const [searchTerm,     setSearchTerm]     = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter,   setStatusFilter]   = useState<'all' | 'active' | 'inactive'>('all');
  const [paymentFilter,  setPaymentFilter]  = useState<'all' | 'paid' | 'unpaid'>('all');
  const [currentPage,    setCurrentPage]    = useState(1);
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [exporting,      setExporting]      = useState(false);
  const [showCharts,     setShowCharts]     = useState(true);
  const itemsPerPage = 10;

  // Summary stats
  const [totalCollected,      setTotalCollected]      = useState(0);
  const [totalExpenses,       setTotalExpenses]        = useState(0);
  const [netBalance,          setNetBalance]            = useState(0);
  const [totalStudentsPaid,   setTotalStudentsPaid]    = useState(0);
  const [totalStudentsUnpaid, setTotalStudentsUnpaid]  = useState(0);
  const [categoriesBreakdown, setCategoriesBreakdown] = useState<CategoryExpenses[]>([]);

  const fetchStudentPayments = useCallback(async () => {
    try {
      setLoading(true);

      const scope = getOrgScope();
      let membersQ = supabase
        .from('organization_members')
        .select('id, full_name, member_id, is_active, level, section')
        .order('full_name', { ascending: true });
      if (scope) {
        membersQ = membersQ.eq('organization_id', scope.orgId);
        membersQ = membersQ.eq('group_id', scope.groupId);
      }
      const { data: studentsData, error: studentsError } = await membersQ;
      if (studentsError) throw studentsError;

      let paymentsQ = supabase
        .from('payments')
        .select(`
          id, member_id, amount, transaction_ref, status, created_at,
          member:organization_members!payments_member_id_fkey (
            id, full_name, member_id, is_active
          ),
          payment_types ( id, title, category )
        `)
        .in('status', ['approved', 'pending', 'partial'])
        .limit(1000)
        .order('created_at', { ascending: false });
      if (scope) {
        paymentsQ = paymentsQ.eq('organization_id', scope.orgId);
        paymentsQ = paymentsQ.eq('group_id', scope.groupId);
      }
      const { data: paymentsData, error } = await paymentsQ;
      if (error) throw error;

      let expQ = supabase
        .from('expenses')
        .select(`
          id, amount, payment_type_id, funded_by, status, title, description,
          payment_types!expenses_payment_type_id_fkey ( id, category, title ),
          category:expense_categories(id, name)
        `)
        .eq('status', 'approved');
      if (scope) {
        expQ = expQ.eq('organization_id', scope.orgId);
        expQ = expQ.eq('group_id', scope.groupId);
      }
      const { data: expensesData, error: expensesError } = await expQ;
      if (expensesError) console.warn('Error fetching expenses:', expensesError);
      const expenses = expensesData || [];

      // Build student map
      const studentMap = new Map<string, StudentPayment>();
      studentsData?.forEach((student) => {
        studentMap.set(student.id, {
          id: student.id,
          member_id: student.id,
          student_name: student.full_name || 'Unknown',
          reg_number: student.member_id || '',
          level: student.level || orgLevel || '',
          department: student.section || orgDepartment || '',
          is_active: student.is_active || false,
          payments: [],
          total_paid: 0,
          payment_count: 0,
          categories_paid: [],
          has_paid: false,
        });
      });

      interface PaymentData {
        id: string;
        member_id: string;
        amount: number;
        transaction_ref: string;
        status: string;
        created_at: string;
        member: { id: string; full_name: string; member_id: string; is_active: boolean }[] |
                { id: string; full_name: string; member_id: string; is_active: boolean } | null;
        payment_types: { id: string; title: string; category: string }[] |
                       { id: string; title: string; category: string } | null;
      }

      // Fallback for payments missing the payment_types join
      const missingPaymentTypeIds = (paymentsData || [])
        .filter((p: any) => !p.payment_types && p.payment_type_id)
        .map((p: any) => p.payment_type_id)
        .filter(Boolean);
      const paymentTypesFallback = new Map<string, { id: string; title: string; category: string }>();
      if (missingPaymentTypeIds.length > 0) {
        let ptFallQ = supabase.from('payment_types').select('id, title, category').in('id', missingPaymentTypeIds);
        if (scope) {
          ptFallQ = ptFallQ.eq('organization_id', scope.orgId);
          ptFallQ = ptFallQ.eq('group_id', scope.groupId);
        }
        const { data: ptData } = await ptFallQ;
        ptData?.forEach((pt: any) => paymentTypesFallback.set(pt.id, pt));
      }

      paymentsData?.forEach((payment: PaymentData) => {
        const student     = Array.isArray(payment.member)        ? payment.member[0]        : payment.member;
        const paymentType = Array.isArray(payment.payment_types) ? payment.payment_types[0] : payment.payment_types
                            || paymentTypesFallback.get((payment as any).payment_type_id || '') || null;
        if (!student) return;

        const studentId      = student.id;
        const paymentStatus  = payment.status || 'pending';
        const isWaived       = String(payment.transaction_ref || '').startsWith('WAIVED-');
        const category       = (paymentType?.category) ? String(paymentType.category).trim() : 'Other';
        const paymentTypeName = paymentType?.title || 'Unknown';

        if (studentMap.has(studentId)) {
          const studentData = studentMap.get(studentId)!;
          if (paymentStatus === 'approved' && !isWaived) {
            studentData.has_paid    = true;
            studentData.total_paid += Number(payment.amount || 0);
            studentData.payment_count += 1;
          }
          studentData.payments.push({
            id: payment.id,
            amount: Number(payment.amount || 0),
            category,
            payment_type: paymentTypeName,
            transaction_ref: payment.transaction_ref || '',
            status: paymentStatus,
            created_at: payment.created_at,
            waived: isWaived,
          } as any);
          if (!studentData.categories_paid.includes(category)) {
            studentData.categories_paid.push(category);
          }
        }
      });

      const studentsArray  = Array.from(studentMap.values());
      const paidStudents   = studentsArray.filter(s => s.has_paid).sort((a, b) => b.total_paid - a.total_paid);
      const unpaidStudents = studentsArray.filter(s => !s.has_paid).sort((a, b) => a.student_name.localeCompare(b.student_name));

      setAllStudents(studentsArray);
      setStudentPayments(paidStudents);

      const totalCollectedAmount = paidStudents.reduce((sum, s) => sum + s.total_paid, 0);
      setTotalCollected(totalCollectedAmount);
      setTotalStudentsPaid(paidStudents.length);
      setTotalStudentsUnpaid(unpaidStudents.length);

      const totalExpensesAmount = expenses.reduce((sum, e: { amount?: number | string }) => sum + Number(e.amount || 0), 0);
      setTotalExpenses(totalExpensesAmount);
      setNetBalance(totalCollectedAmount - totalExpensesAmount);

      // Category breakdown
      const categoryMap = new Map<string, CategoryExpenses>();
      paidStudents.forEach(student => {
        student.payments.forEach(payment => {
          if (!categoryMap.has(payment.category)) {
            categoryMap.set(payment.category, { category: payment.category, total_collected: 0, total_expenses: 0, net_balance: 0, payment_count: 0 });
          }
          const cat = categoryMap.get(payment.category)!;
          cat.total_collected += payment.amount;
          cat.payment_count   += 1;
        });
      });

      const paymentTypesMap = new Map<string, { category: string; title: string }>();
      try {
        let ptMapQ = supabase.from('payment_types').select('id, category, title');
        if (scope) {
          ptMapQ = ptMapQ.eq('organization_id', scope.orgId);
          ptMapQ = ptMapQ.eq('group_id', scope.groupId);
        }
        const { data: ptData } = await ptMapQ;
        ptData?.forEach(pt => paymentTypesMap.set(pt.id, { category: pt.category, title: pt.title }));
      } catch (e) { console.warn('Failed to fetch payment types:', e); }

      interface ExpenseRecord {
        id?: string; amount?: number | string; payment_type_id?: string;
        payment_types?: { id?: string; category?: string; title?: string }[] | { id?: string; category?: string; title?: string } | null;
      }

      expenses.forEach((expense: ExpenseRecord) => {
        const fundId   = (expense as any).funded_by || (expense as any).payment_type_id;
        let category   = 'Other';
        if (fundId && paymentTypesMap.has(fundId)) {
          category = paymentTypesMap.get(fundId)!.category || 'Other';
        } else {
          const catRel = (expense as any).category?.name;
          const pt     = Array.isArray(expense.payment_types) ? expense.payment_types[0] : expense.payment_types;
          category     = catRel || pt?.category || 'Other';
        }
        const amount = Number(expense.amount || 0);
        if (!categoryMap.has(category)) {
          categoryMap.set(category, { category, total_collected: 0, total_expenses: 0, net_balance: 0, payment_count: 0 });
        }
        categoryMap.get(category)!.total_expenses += amount;
      });

      categoryMap.forEach(cat => { cat.net_balance = cat.total_collected - cat.total_expenses; });
      setCategoriesBreakdown(Array.from(categoryMap.values()).sort((a, b) => b.total_collected - a.total_collected));

    } catch (error) {
      console.error('Error fetching student payments:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchStudentPayments(); }, [fetchStudentPayments]);

  // ── Date-range aware student list ─────────────────────────────────────────
  const studentsToFilter = useMemo(() => {
    if (dateRange.start || dateRange.end) {
      const withFiltered = allStudents.map(student => {
        const filteredPayments = student.payments.filter(p => {
          const pd = new Date(p.created_at);
          if (dateRange.start && pd < dateRange.start) return false;
          if (dateRange.end   && pd > dateRange.end)   return false;
          return true;
        });
        const approved   = filteredPayments.filter(p => p.status === 'approved' && !p.waived);
        const totalPaid  = approved.reduce((sum, p) => sum + p.amount, 0);
        return {
          ...student,
          payments:        filteredPayments,
          total_paid:      totalPaid,
          payment_count:   approved.length,
          has_paid:        totalPaid > 0,
          categories_paid: [...new Set(filteredPayments.map(p => p.category))],
        };
      });
      return withFiltered.filter(s => s.has_paid);
    }

    if (paymentFilter === 'unpaid') return allStudents.filter(s => !s.has_paid);
    if (paymentFilter === 'paid')   return allStudents.filter(s => s.has_paid);
    return allStudents;
  }, [allStudents, paymentFilter, dateRange]);

  const filteredTotals = useMemo(() => {
    const isDateFiltered = !!(dateRange.start || dateRange.end);
    return {
      totalCollected:      studentsToFilter.reduce((sum, s) => sum + s.total_paid, 0),
      totalStudentsPaid:   studentsToFilter.length,
      totalStudentsUnpaid: isDateFiltered ? 0 : allStudents.filter(s => !s.has_paid).length,
      isDateFiltered,
    };
  }, [studentsToFilter, dateRange, allStudents]);

  const filteredStudents = studentsToFilter.filter(student => {
    if (searchTerm) {
      const q = searchTerm.toLowerCase();
      if (!student.student_name.toLowerCase().includes(q) && !student.reg_number.toLowerCase().includes(q)) return false;
    }
    if (categoryFilter !== 'all' && !student.categories_paid.includes(categoryFilter)) return false;
    if (statusFilter === 'active'   && !student.is_active) return false;
    if (statusFilter === 'inactive' &&  student.is_active) return false;
    return true;
  });

  const sortedStudents = [...filteredStudents].sort((a, b) => (a.student_name || '').localeCompare(b.student_name || ''));
  const totalPages       = Math.ceil(sortedStudents.length / itemsPerPage);
  const paginatedStudents = sortedStudents.slice((currentPage - 1) * itemsPerPage, currentPage * itemsPerPage);

  // ── Exports ───────────────────────────────────────────────────────────────
  const exportToCSV = () => {
    setExporting(true);
    try {
      const headers = ['Student Name','Reg Number','Level','Department','Status','Total Paid','Payments','Categories'];
      const rows = sortedStudents.map(s => [
        s.student_name, s.reg_number,
        s.level || orgLevel || 'N/A', s.department || orgDepartment || 'N/A',
        s.is_active ? 'Active' : 'Inactive',
        s.total_paid.toString(), s.payment_count.toString(), s.categories_paid.join('; '),
      ]);
      const csv  = [headers, ...rows].map(row => row.map(c => `"${c}"`).join(',')).join('\n');
      const blob = new Blob([csv], { type: 'text/csv' });
      const url  = URL.createObjectURL(blob);
      const a    = document.createElement('a');
      a.href = url; a.download = `student-payments-${new Date().toISOString().split('T')[0]}.csv`; a.click();
      URL.revokeObjectURL(url);
      showSuccess('Exported to CSV successfully!');
    } catch (e) { console.error(e); showError('Failed to export data'); }
    finally { setExporting(false); }
  };

  const exportToPDF = () => {
    setExporting(true);
    try {
      exportCollectedPaymentsToPDF({
        students: sortedStudents.map(s => ({
          id: s.id, student_name: s.student_name, reg_number: s.reg_number,
          level: s.level, department: s.department, is_active: s.is_active,
          total_paid: s.total_paid, payment_count: s.payment_count,
          categories_paid: s.categories_paid, payments: s.payments,
        })),
        totalCollected, totalExpenses, netBalance,
        totalStudentsPaid, totalStudentsUnpaid, categoriesBreakdown,
        filters: {
          category: categoryFilter !== 'all' ? categoryFilter : undefined,
          status:   statusFilter   !== 'all' ? statusFilter   : undefined,
          payment:  paymentFilter  !== 'all' ? paymentFilter  : undefined,
          search:   searchTerm || undefined,
        },
      });
      showSuccess('Exported to PDF successfully!');
    } catch (e) { console.error(e); showError('Failed to export data'); }
    finally { setExporting(false); }
  };

  return (
    <div className="min-h-screen py-6 px-4" style={{
      background: tk.bgWash,
    }}>
      {/* Background Grid */}
      <div className="absolute inset-0 opacity-20 pointer-events-none" style={{
        backgroundImage: `linear-gradient(${colors.primary}40 1px, transparent 1px), linear-gradient(90deg, ${colors.primary}40 1px, transparent 1px)`,
        backgroundSize: '50px 50px',
      }} />

      {/* Ambient orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30"
          style={{ background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`, top: '-10%', right: '-5%', animation: 'pulse 4s ease-in-out infinite' }} />
        <div className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{ background: `radial-gradient(circle, ${colors.accentMint} 0%, transparent 70%)`, bottom: '-5%', left: '-5%', animation: 'pulse 6s ease-in-out infinite' }} />
      </div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">

        {/* ── Header ── */}
        <motion.div initial={{ opacity: 0, y: -20 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <GlassCard className="relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 opacity-5 pointer-events-none">
              <BarChart3 className="w-full h-full" style={{ color: tk.mint }} />
            </div>
            <div className="absolute top-0 left-0 w-full h-1"
              style={{ background: `linear-gradient(90deg, ${tk.mint}, ${tk.primary}, transparent)` }} />

            <div className="relative z-10">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 mb-6">
                <div className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4">
                  <motion.button
                    whileHover={{ x: -4 }}
                    onClick={() => navigate('/admin/dashboard')}
                    className="flex items-center justify-center sm:justify-start gap-2 w-fit px-4 py-2 rounded-xl transition-all"
                    style={{ background: tk.primarySoft, border: `1px solid ${tk.primaryRing}`, color: tk.primary }}
                  >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="font-medium">Back</span>
                  </motion.button>

                  <div className="flex items-center gap-4">
                    <motion.div
                      initial={{ scale: 0.9 }} animate={{ scale: 1 }}
                      className="w-14 h-14 rounded-xl flex items-center justify-center shrink-0 shadow-lg"
                      style={{ background: `linear-gradient(135deg, ${tk.mint}30, ${tk.mint}10)`, border: `1px solid ${tk.mint}40`, boxShadow: `0 4px 15px ${tk.mint}20` }}
                    >
                      <PieChart className="w-7 h-7" style={{ color: tk.mint }} />
                    </motion.div>
                    <div>
                      <motion.div
                        initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.1 }}
                        className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold mb-2"
                        style={{ background: `linear-gradient(135deg, ${tk.mint}30, ${tk.mint}10)`, border: `1px solid ${tk.mint}40`, color: tk.mint }}
                      >
                        <Sparkles className="w-3 h-3" /> COLLECTION OVERVIEW
                      </motion.div>
                      <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold" style={{ color: tk.text }}>Payment Collection</h1>
                      <p className="text-xs sm:text-sm" style={{ color: tk.textSec }}>Detailed breakdown of student payments</p>
                    </div>
                  </div>
                </div>

                {/* Controls row */}
                <div className="flex flex-wrap items-center gap-3">

                  {/* ── Date range picker — correctly wired ── */}
                  <ProfessionalDateTimePicker
                    mode="range"
                    label="Date Range"
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    onRangeChange={(s, e) => {
                      setRangeStart(s);
                      setRangeEnd(e);
                      setCurrentPage(1); // reset pagination on filter change
                    }}
                    placeholder="All time"
                  />

                  {/* Charts toggle */}
                  <motion.button
                    whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                    onClick={() => setShowCharts(!showCharts)}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all"
                    style={{
                      background: showCharts ? tk.primarySoft : (theme === 'light' ? 'rgba(15, 7, 3, 0.04)' : 'rgba(255,255,255,0.05)'),
                      border: `1px solid ${showCharts ? tk.primaryRing : tk.cardBorder}`,
                      color: showCharts ? tk.primary : tk.textSec,
                    }}
                  >
                    <LineChart className="w-4 h-4" />
                    <span className="text-sm font-medium hidden sm:inline">Charts</span>
                  </motion.button>

                  {/* Export dropdown */}
                  <div className="relative">
                    <motion.button
                      whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                      onClick={() => setShowExportMenu(!showExportMenu)}
                      disabled={exporting}
                      className="flex items-center justify-center gap-2 px-5 py-3 rounded-xl transition-all text-sm font-semibold disabled:opacity-50"
                      style={{ background: tk.gradOrange, boxShadow: `0 4px 15px ${tk.primary}40`, color: tk.text }}
                    >
                      {exporting
                        ? <div className="w-4 h-4 border-2 border-t-transparent rounded-full animate-spin" style={{ borderColor: tk.text, borderTopColor: 'transparent' }} />
                        : <Download className="w-4 h-4" />}
                      <span>Export</span>
                      <ChevronDown className={`w-4 h-4 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
                    </motion.button>

                    <AnimatePresence>
                      {showExportMenu && (
                        <>
                          <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                          <motion.div
                            initial={{ opacity: 0, y: -10, scale: 0.95 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            exit={{ opacity: 0, y: -10, scale: 0.95 }}
                            className="fixed sm:absolute left-4 right-4 sm:left-auto sm:right-0 bottom-4 sm:bottom-auto sm:top-full sm:mt-2 w-auto sm:w-56 rounded-xl overflow-hidden shadow-2xl z-50"
                            style={{ background: theme === 'light' ? 'rgba(255,255,255,0.98)' : 'linear-gradient(135deg, rgba(30,20,15,0.98), rgba(20,12,8,0.98))', border: `1px solid ${tk.cardBorder}`, backdropFilter: 'blur(20px)' }}
                          >
                            <div className="p-2">
                              <p className="px-3 py-1.5 text-xs font-medium" style={{ color: tk.textSec }}>Export Format</p>
                              <motion.button
                                whileHover={{ x: 4, background: theme === 'light' ? 'rgba(15, 7, 3, 0.04)' : 'rgba(255,255,255,0.05)' }}
                                onClick={() => { setShowExportMenu(false); exportToPDF(); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg"
                              >
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${tk.danger}20` }}>
                                  <FileText className="w-4 h-4" style={{ color: tk.danger }} />
                                </div>
                                <div className="text-left">
                                  <span className="text-sm font-medium" style={{ color: tk.text }}>PDF Report</span>
                                  <p className="text-xs" style={{ color: tk.textSec }}>Full financial summary</p>
                                </div>
                              </motion.button>
                              <motion.button
                                whileHover={{ x: 4, background: theme === 'light' ? 'rgba(15, 7, 3, 0.04)' : 'rgba(255,255,255,0.05)' }}
                                onClick={() => { setShowExportMenu(false); exportToCSV(); }}
                                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg"
                              >
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ background: `${tk.mint}20` }}>
                                  <FileSpreadsheet className="w-4 h-4" style={{ color: tk.mint }} />
                                </div>
                                <div className="text-left">
                                  <span className="text-sm font-medium" style={{ color: tk.text }}>CSV Spreadsheet</span>
                                  <p className="text-xs" style={{ color: tk.textSec }}>For data analysis</p>
                                </div>
                              </motion.button>
                            </div>
                          </motion.div>
                        </>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
              </div>

              {/* Summary Stats */}
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                {[
                  {
                    delay: 0.1, label: filteredTotals.isDateFiltered ? 'Collected (Filtered)' : 'Total Collected',
                    value: <PrivacyMask><p className="text-lg sm:text-2xl font-bold text-white"><AnimatedCounter value={filteredTotals.isDateFiltered ? filteredTotals.totalCollected : totalCollected} prefix="₦" /></p></PrivacyMask>,
                    sub: <p className="text-[10px] sm:text-xs mt-1" style={{ color: tk.mint }}><AnimatedCounter value={studentsToFilter.reduce((sum, s) => sum + s.payment_count, 0)} /> payments</p>,
                    icon: <Wallet className="w-full h-full" style={{ color: tk.mint }} />, bg: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.03)', border: tk.cardBorder,
                  },
                  {
                    delay: 0.15, label: 'Total Expenses',
                    value: <PrivacyMask><p className="text-lg sm:text-2xl font-bold" style={{ color: totalExpenses > 0 ? tk.danger : tk.textSec }}><AnimatedCounter value={totalExpenses} prefix="₦" /></p></PrivacyMask>,
                    sub: <p className="text-[10px] sm:text-xs mt-1" style={{ color: tk.textSec }}>{totalExpenses > 0 ? 'Approved' : 'None yet'}</p>,
                    icon: <TrendingUp className="w-full h-full" style={{ color: tk.danger }} />, bg: `${tk.danger}08`, border: `${tk.danger}15`,
                  },
                  {
                    delay: 0.2, label: 'Net Balance',
                    value: <PrivacyMask><p className="text-lg sm:text-2xl font-bold" style={{ color: netBalance >= 0 ? tk.mint : tk.danger }}><AnimatedCounter value={netBalance} prefix="₦" /></p></PrivacyMask>,
                    sub: <p className="text-[10px] sm:text-xs mt-1" style={{ color: tk.textSec }}>Available</p>,
                    icon: <Wallet className="w-full h-full" style={{ color: netBalance >= 0 ? tk.mint : tk.danger }} />,
                    bg: netBalance >= 0 ? `${tk.mint}08` : `${tk.danger}08`,
                    border: `${netBalance >= 0 ? tk.mint : tk.danger}15`,
                  },
                  {
                    delay: 0.25, label: filteredTotals.isDateFiltered ? 'Students in Range' : 'Paid Students',
                    value: <p className="text-lg sm:text-2xl font-bold" style={{ color: tk.text }}><AnimatedCounter value={filteredTotals.totalStudentsPaid} /></p>,
                    sub: <p className="text-[10px] sm:text-xs mt-1" style={{ color: tk.mint }}>{filteredTotals.isDateFiltered ? 'With Payments' : 'Completed'}</p>,
                    icon: <CheckCircle className="w-full h-full" style={{ color: tk.mint }} />, bg: `${tk.mint}08`, border: `${tk.mint}15`,
                  },
                ].map((card, i) => (
                  <motion.div key={i} initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: card.delay }}
                    className="p-4 rounded-xl relative overflow-hidden"
                    style={{ background: card.bg, border: `1px solid ${card.border}` }}>
                    <div className="absolute top-0 right-0 w-12 h-12 opacity-10">{card.icon}</div>
                    <p className="text-[10px] sm:text-xs font-medium mb-1" style={{ color: tk.textSec }}>{card.label}</p>
                    {card.value}
                    {card.sub}
                  </motion.div>
                ))}

                {/* Unpaid card — hidden when date range is active */}
                {!filteredTotals.isDateFiltered && (
                  <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ delay: 0.3 }}
                    className="p-4 rounded-xl relative overflow-hidden"
                    style={{ background: `${tk.danger}08`, border: `1px solid ${tk.danger}15` }}>
                    <div className="absolute top-0 right-0 w-12 h-12 opacity-10"><XCircle className="w-full h-full" style={{ color: tk.danger }} /></div>
                    <p className="text-[10px] sm:text-xs font-medium mb-1" style={{ color: tk.textSec }}>Unpaid Students</p>
                    <p className="text-lg sm:text-2xl font-bold" style={{ color: tk.danger }}><AnimatedCounter value={totalStudentsUnpaid} /></p>
                    <p className="text-[10px] sm:text-xs mt-1" style={{ color: tk.textSec }}>Pending</p>
                  </motion.div>
                )}
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Charts */}
        <AnimatePresence>
          {showCharts && (
            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.3 }}>
              <FinancialChart
                categoriesBreakdown={categoriesBreakdown}
                totalCollected={filteredTotals.isDateFiltered ? filteredTotals.totalCollected : totalCollected}
                totalExpenses={totalExpenses}
                netBalance={(filteredTotals.isDateFiltered ? filteredTotals.totalCollected : totalCollected) - totalExpenses}
              />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Category Breakdown */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}>
          <GlassCard className="relative overflow-hidden">
            <div className="absolute top-0 left-0 w-full h-1" style={{ background: `linear-gradient(90deg, ${tk.primary}, ${tk.mint}, transparent)` }} />
            <div className="flex items-center gap-3 mb-4">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: tk.primarySoft, border: `1px solid ${tk.primaryRing}` }}>
                <BarChart3 className="w-5 h-5" style={{ color: tk.primary }} />
              </div>
              <div>
                <h2 className="text-xl font-bold" style={{ color: tk.text }}>Category Breakdown</h2>
                <p className="text-xs" style={{ color: tk.textSec }}>Click to filter by category</p>
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {categoriesBreakdown.map((cat, index) => (
                <motion.button
                  key={cat.category}
                  initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.5 + index * 0.05 }}
                  whileHover={{ scale: 1.02, y: -2 }} whileTap={{ scale: 0.98 }}
                  onClick={() => setCategoryFilter(cat.category)}
                  className={`p-4 rounded-xl text-left transition-all relative overflow-hidden ${categoryFilter === cat.category ? 'ring-2 shadow-xl' : ''}`}
                  style={{
                    background: categoryFilter === cat.category ? `linear-gradient(135deg, ${tk.primary}30, ${tk.primary}10)` : (theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.03)'),
                    borderWidth: '1px', borderStyle: 'solid',
                    borderColor: categoryFilter === cat.category ? tk.primary : tk.cardBorder,
                    boxShadow: categoryFilter === cat.category ? `0 4px 20px ${tk.primary}30` : 'none',
                  }}
                >
                  <div className="absolute top-0 right-0 w-16 h-16 opacity-5 pointer-events-none"><TrendingUp className="w-full h-full" style={{ color: tk.primary }} /></div>
                  <p className="text-xs sm:text-sm font-semibold capitalize mb-1" style={{ color: categoryFilter === cat.category ? tk.primary : tk.textSec }}>
                    {cat.category.replace(/_/g, ' ')}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <PrivacyMask><p className="text-lg sm:text-xl font-bold" style={{ color: tk.text }}>{formatCurrency(cat.total_collected)}</p></PrivacyMask>
                    {totalCollected > 0 && (
                      <span className="text-[10px] sm:text-xs px-1.5 py-0.5 rounded-full" style={{ background: tk.cardBorder, color: tk.textSec }}>
                        {Math.round((cat.total_collected / totalCollected) * 100)}%
                      </span>
                    )}
                  </div>
                  {cat.total_collected > 0 && (
                    <div className="w-full h-1.5 rounded-full overflow-hidden mt-2" style={{ background: tk.cardBorder }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{
                        width: `${Math.min(100, Math.round((cat.total_expenses / cat.total_collected) * 100))}%`,
                        background: cat.total_expenses > cat.total_collected ? tk.danger : cat.total_expenses > cat.total_collected * 0.8 ? tk.amber : tk.mint,
                      }} />
                    </div>
                  )}
                  {cat.total_expenses > 0 && (
                    <p className="flex items-center gap-1 text-[10px] sm:text-xs mt-1.5" style={{ color: tk.danger }}>
                      <span className="w-1.5 h-1.5 rounded-full" style={{ background: tk.danger }} />
                      -<PrivacyMask>{formatCurrency(cat.total_expenses)}</PrivacyMask> spent
                    </p>
                  )}
                  <p className="font-semibold flex items-center gap-1 text-[10px] sm:text-xs mt-1" style={{ color: cat.net_balance >= 0 ? tk.mint : tk.danger }}>
                    <span className="w-1.5 h-1.5 rounded-full" style={{ background: cat.net_balance >= 0 ? tk.mint : tk.danger }} />
                    <PrivacyMask>{formatCurrency(cat.net_balance)}</PrivacyMask> available
                  </p>
                  <div className="mt-3 text-xs font-medium px-2 py-1 rounded-lg inline-block" style={{ background: tk.primarySoft, color: tk.primary }}>
                    {cat.payment_count} payment{cat.payment_count !== 1 ? 's' : ''}
                  </div>
                </motion.button>
              ))}
            </div>
          </GlassCard>
        </motion.div>

        {/* Filters */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.6 }}>
          <GlassCard>
            <div className="flex flex-col gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textSecondary }} />
                <input
                  type="text" placeholder="Search by student name or reg number..."
                  value={searchTerm}
                  onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg focus:outline-none focus:ring-2 transition-all"
                  style={{ background: theme === 'light' ? '#FFFFFF' : 'rgba(255,255,255,0.05)', borderWidth: '1px', borderStyle: 'solid', borderColor: tk.cardBorder, color: tk.text }}
                />
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs sm:text-sm" style={{ color: colors.textSecondary }}>
                  <Filter className="w-3 h-3 sm:w-4 sm:h-4" /><span className="hidden sm:inline">Payment:</span>
                </div>
                {(['all', 'paid', ...(filteredTotals.isDateFiltered ? [] : ['unpaid' as const])] as const).map((f) => (
                  <button key={f}
                    onClick={() => { setPaymentFilter(f as 'all' | 'paid' | 'unpaid'); setCurrentPage(1); }}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all hover:shadow-md ${paymentFilter === f ? 'scale-105 shadow-lg' : 'hover:scale-[1.02]'}`}
                    style={{
                      background: paymentFilter === f ? `linear-gradient(135deg, ${colors.primary}40, ${colors.primary}20)` : 'rgba(255,255,255,0.05)',
                      borderWidth: '1px', borderStyle: 'solid',
                      borderColor: paymentFilter === f ? colors.primary : 'rgba(255,255,255,0.1)',
                      color: paymentFilter === f ? 'white' : colors.textSecondary,
                    }}
                  >
                    {f === 'all' ? 'All' : f === 'paid' ? `Paid (${filteredTotals.totalStudentsPaid})` : `Not Paid (${totalStudentsUnpaid})`}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs sm:text-sm" style={{ color: colors.textSecondary }}>Activity:</span>
                {(['all', 'active', 'inactive'] as const).map((s) => (
                  <button key={s}
                    onClick={() => { setStatusFilter(s); setCurrentPage(1); }}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all hover:shadow-md ${statusFilter === s ? 'scale-105 shadow-lg' : 'hover:scale-[1.02]'}`}
                    style={{
                      background: statusFilter === s ? `linear-gradient(135deg, ${colors.primary}40, ${colors.primary}20)` : 'rgba(255,255,255,0.05)',
                      borderWidth: '1px', borderStyle: 'solid',
                      borderColor: statusFilter === s ? colors.primary : 'rgba(255,255,255,0.1)',
                      color: statusFilter === s ? 'white' : colors.textSecondary,
                    }}
                  >
                    {s === 'all' ? 'All' : s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>

              {categoryFilter !== 'all' && (
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: colors.textSecondary }}>Filtered by:</span>
                  <button onClick={() => setCategoryFilter('all')}
                    className="px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 transition-all hover:scale-105"
                    style={{ background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`, border: `1px solid ${colors.primary}60`, color: 'white' }}>
                    <span className="capitalize">{categoryFilter.replace(/_/g, ' ')}</span>
                    <span className="text-xs">✕</span>
                  </button>
                </div>
              )}

              <div className="text-sm" style={{ color: colors.textSecondary }}>
                Showing {filteredStudents.length} of {allStudents.length} students
                {filteredTotals.isDateFiltered && (
                  <span className="ml-2 px-2 py-0.5 rounded-full text-xs" style={{ background: `${colors.primary}15`, color: colors.primary, border: `1px solid ${colors.primary}30` }}>
                    Date filtered: {rangeStart} → {rangeEnd}
                  </span>
                )}
              </div>
            </div>
          </GlassCard>
        </motion.div>

        {/* Student list */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div className="flex flex-col items-center gap-3">
              <div className="animate-spin rounded-full h-12 w-12 border-3 border-t-transparent" style={{ borderColor: colors.primary, borderTopColor: 'transparent' }} />
              <p className="text-sm" style={{ color: colors.textSecondary }}>Loading students...</p>
            </div>
          </div>
        ) : paginatedStudents.length === 0 ? (
          <GlassCard>
            <div className="text-center py-12">
              <Users className="w-16 h-16 mx-auto mb-4 opacity-30" style={{ color: colors.textSecondary }} />
              <p className="text-lg font-medium" style={{ color: colors.textSecondary }}>No students found</p>
              <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>Try adjusting your filters or search query</p>
            </div>
          </GlassCard>
        ) : (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.7 }} className="space-y-3">
            {paginatedStudents.map((student, index) => (
              <motion.div key={student.id} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.7 + index * 0.02 }}>
                <GlassCard className="hover:scale-[1.01] transition-all">
                  <div className="flex flex-col gap-3 sm:gap-4">
                    <div className="flex-1">
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white text-sm sm:text-base font-bold shrink-0"
                          style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})` }}>
                          {student.student_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm sm:text-base text-white">{student.student_name}</p>
                          <p className="text-xs sm:text-sm truncate" style={{ color: colors.textSecondary }}>{student.reg_number}</p>
                        </div>
                        <span className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0"
                          style={{ background: student.is_active ? colors.statusPaid : colors.statusFailed, color: 'white' }}>
                          {student.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    <div className="grid grid-cols-3 gap-3 sm:gap-6 mt-2 sm:mt-0">
                      <div className="text-center">
                        <p className="text-[10px] sm:text-sm" style={{ color: colors.textSecondary }}>Total Paid</p>
                        <PrivacyMask><p className="text-sm sm:text-xl font-bold text-white">{formatCurrency(student.total_paid)}</p></PrivacyMask>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] sm:text-sm" style={{ color: colors.textSecondary }}>Payments</p>
                        <p className="text-sm sm:text-xl font-bold" style={{ color: colors.accentMint }}>{student.payment_count}</p>
                        {student.payments.filter(p => p.waived).length > 0 && (
                          <p className="text-xs mt-1 inline-flex items-center gap-2" style={{ color: (colors as any).statusWaived }}>
                            <span className="w-2 h-2 rounded-full" style={{ background: (colors as any).statusWaived }} />
                            {student.payments.filter(p => p.waived).length} waived
                          </p>
                        )}
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] sm:text-sm" style={{ color: colors.textSecondary }}>Categories</p>
                        <p className="text-sm sm:text-xl font-bold" style={{ color: colors.primary }}>{student.categories_paid.length}</p>
                      </div>
                    </div>
                  </div>

                  {student.categories_paid.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {student.categories_paid.map(cat => (
                        <span key={cat} className="px-3 py-1 rounded-full text-xs font-medium capitalize"
                          style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: colors.textSecondary }}>
                          {cat.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 p-3 rounded-lg text-center" style={{ background: 'rgba(255,100,100,0.1)', border: '1px solid rgba(255,100,100,0.2)' }}>
                      <p className="text-sm font-medium" style={{ color: colors.statusFailed }}>No payments recorded yet</p>
                    </div>
                  )}

                  {student.has_paid && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>Payment History</p>
                      <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>Waived payments are marked and excluded from totals.</p>
                      <div className="space-y-1.5">
                        {student.payments.slice(0, 3).map(payment => (
                          <div key={payment.id} className="flex items-center justify-between p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.02)' }}>
                            <div className="flex-1">
                              <p className="text-sm font-medium text-white">{payment.payment_type}</p>
                              <p className="text-xs" style={{ color: colors.textSecondary }}>{formatDate(payment.created_at, 'short')} • {payment.transaction_ref}</p>
                            </div>
                            <div className="text-right">
                              <PrivacyMask><p className="text-sm font-semibold text-white">{formatCurrency(payment.amount)}</p></PrivacyMask>
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-xs px-2 py-0.5 rounded-full"
                                  style={{ background: payment.status === 'approved' ? colors.statusPaid : payment.status === 'pending' ? 'rgba(255,165,0,0.2)' : 'rgba(59,130,246,0.2)', color: payment.status === 'approved' ? 'white' : colors.primary }}>
                                  {payment.status.toUpperCase()}
                                </span>
                                {payment.waived && (
                                  <span className="inline-flex items-center gap-2 text-xs px-2 py-0.5 rounded-full"
                                    style={{ background: `linear-gradient(135deg, ${(colors as any).statusWaived}10, rgba(255,255,255,0.02))`, color: (colors as any).statusWaived, border: `1px solid ${(colors as any).statusWaived}30`, boxShadow: '0 2px 8px rgba(0,0,0,0.18)' }}>
                                    <span className="w-2 h-2 rounded-full" style={{ background: (colors as any).statusWaived }} />Waived
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                        {student.payments.length > 3 && (
                          <p className="text-xs text-center py-1" style={{ color: colors.textSecondary }}>
                            + {student.payments.length - 3} more payment{student.payments.length - 3 !== 1 ? 's' : ''}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </GlassCard>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.8 }}>
            <GlassCard className="relative overflow-hidden">
              <div className="absolute bottom-0 left-0 w-full h-1" style={{ background: `linear-gradient(90deg, ${colors.statusPaid}, ${colors.primary}, transparent)` }} />
              <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}15`, border: `1px solid ${colors.primary}30` }}>
                    <Users className="w-5 h-5" style={{ color: colors.primary }} />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-white">Page {currentPage} of {totalPages}</p>
                    <p className="text-xs" style={{ color: colors.textSecondary }}>
                      Showing {(currentPage - 1) * itemsPerPage + 1}–{Math.min(currentPage * itemsPerPage, filteredStudents.length)} of {filteredStudents.length}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: currentPage === 1 ? 'rgba(255,255,255,0.03)' : `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`, border: `1px solid ${currentPage === 1 ? 'transparent' : colors.primary}40`, color: currentPage === 1 ? colors.textSecondary : colors.primary }}>
                    <ChevronLeft className="w-4 h-4" /><span className="hidden sm:inline font-medium">Previous</span>
                  </motion.button>
                  <div className="flex gap-1">
                    {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => {
                      let page: number;
                      if (totalPages <= 5) page = i + 1;
                      else if (currentPage <= 3) page = i + 1;
                      else if (currentPage >= totalPages - 2) page = totalPages - 4 + i;
                      else page = currentPage - 2 + i;
                      return (
                        <motion.button key={page} whileHover={{ scale: 1.1 }} whileTap={{ scale: 0.9 }}
                          onClick={() => setCurrentPage(page)}
                          className="w-10 h-10 rounded-xl text-sm font-semibold transition-all"
                          style={{ background: currentPage === page ? `linear-gradient(135deg, ${colors.statusPaid}, ${colors.primary})` : 'rgba(255,255,255,0.05)', color: currentPage === page ? 'white' : colors.textSecondary, boxShadow: currentPage === page ? `0 4px 15px ${colors.primary}40` : 'none' }}>
                          {page}
                        </motion.button>
                      );
                    })}
                  </div>
                  <motion.button whileHover={{ scale: 1.05 }} whileTap={{ scale: 0.95 }}
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}
                    className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    style={{ background: currentPage === totalPages ? 'rgba(255,255,255,0.03)' : `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`, border: `1px solid ${currentPage === totalPages ? 'transparent' : colors.primary}40`, color: currentPage === totalPages ? colors.textSecondary : colors.primary }}>
                    <span className="hidden sm:inline font-medium">Next</span><ChevronRight className="w-4 h-4" />
                  </motion.button>
                </div>
              </div>
            </GlassCard>
          </motion.div>
        )}
      </div>

      <Footer />
    </div>
  );
}