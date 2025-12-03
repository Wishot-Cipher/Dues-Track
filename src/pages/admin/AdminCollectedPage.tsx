import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import GlassCard from '@/components/ui/GlassCard';
import { supabase } from '@/config/supabase';
import { colors } from '@/config/colors';
import Footer from '@/components/Footer';
import { formatCurrency, formatDate } from '@/utils/formatters';
import { ArrowLeft, Users, Wallet, TrendingUp, Filter, Search, Download, ChevronLeft, ChevronRight } from 'lucide-react';

interface StudentPayment {
  id: string;
  student_id: string;
  student_name: string;
  reg_number: string;
  is_active: boolean;
  payments: {
    id: string;
    amount: number;
    category: string;
    payment_type: string;
    transaction_ref: string;
    status: string;
    created_at: string;
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
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [studentPayments, setStudentPayments] = useState<StudentPayment[]>([]);
  const [allStudents, setAllStudents] = useState<StudentPayment[]>([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [paymentFilter, setPaymentFilter] = useState<'all' | 'paid' | 'unpaid'>('all');
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Summary stats
  const [totalCollected, setTotalCollected] = useState(0);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [netBalance, setNetBalance] = useState(0);
  const [totalStudentsPaid, setTotalStudentsPaid] = useState(0);
  const [totalStudentsUnpaid, setTotalStudentsUnpaid] = useState(0);
  const [categoriesBreakdown, setCategoriesBreakdown] = useState<CategoryExpenses[]>([]);

  const fetchStudentPayments = useCallback(async () => {
    try {
      setLoading(true);

      // Fetch ALL students first
      const { data: studentsData, error: studentsError } = await supabase
        .from('students')
        .select('id, full_name, reg_number, is_active')
        .order('full_name', { ascending: true });

      if (studentsError) throw studentsError;

      // Fetch all approved payments with student and payment type details
      const { data: paymentsData, error } = await supabase
        .from('payments')
        .select(`
          id,
          student_id,
          amount,
          transaction_ref,
          status,
          created_at,
          students!payments_student_id_fkey (
            id,
            full_name,
            reg_number,
            is_active
          ),
          payment_types (
            id,
            title,
            category
          )
        `)
        .in('status', ['approved', 'pending', 'partial'])
        .not('transaction_ref', 'like', 'WAIVED-%')
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Fetch all expenses with better error handling
      // Must specify which relationship to use since expenses has 2 FKs to payment_types
      const { data: expensesData, error: expensesError } = await supabase
        .from('expenses')
        .select(`
          id,
          amount,
          payment_type_id,
          status,
          title,
          description,
          payment_types!expenses_payment_type_id_fkey (
            id,
            category,
            title
          )
        `)
        .eq('status', 'approved'); // Only count approved expenses in net balance

      if (expensesError) {
        console.warn('Error fetching expenses:', expensesError);
      }

      const expenses = expensesData || [];
      
      if (import.meta.env.DEV) {
        // Debug logs removed for production security
      }

      // Initialize all students (including those who haven't paid)
      const studentMap = new Map<string, StudentPayment>();
      
      studentsData?.forEach((student) => {
        studentMap.set(student.id, {
          id: student.id,
          student_id: student.id,
          student_name: student.full_name || 'Unknown',
          reg_number: student.reg_number || '',
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
        student_id: string;
        amount: number;
        transaction_ref: string;
        status: string;
        created_at: string;
        students: {
          id: string;
          full_name: string;
          reg_number: string;
          is_active: boolean;
        }[] | {
          id: string;
          full_name: string;
          reg_number: string;
          is_active: boolean;
        } | null;
        payment_types: {
          id: string;
          title: string;
          category: string;
        }[] | {
          id: string;
          title: string;
          category: string;
        } | null;
      }

      paymentsData?.forEach((payment: PaymentData) => {
        const student = Array.isArray(payment.students) ? payment.students[0] : payment.students;
        const paymentType = Array.isArray(payment.payment_types) ? payment.payment_types[0] : payment.payment_types;
        
        if (!student) return;

        const studentId = student.id;
        const category = paymentType?.category || 'Other';
        const paymentTypeName = paymentType?.title || 'Unknown';

        if (studentMap.has(studentId)) {
          const studentData = studentMap.get(studentId)!;
          studentData.has_paid = true;
          studentData.payments.push({
            id: payment.id,
            amount: Number(payment.amount || 0),
            category,
            payment_type: paymentTypeName,
            transaction_ref: payment.transaction_ref || '',
            status: payment.status || 'pending',
            created_at: payment.created_at,
          });
          studentData.total_paid += Number(payment.amount || 0);
          studentData.payment_count += 1;
          
          if (!studentData.categories_paid.includes(category)) {
            studentData.categories_paid.push(category);
          }
        }
      });

      const studentsArray = Array.from(studentMap.values());
      const paidStudents = studentsArray.filter(s => s.has_paid).sort((a, b) => b.total_paid - a.total_paid);
      const unpaidStudents = studentsArray.filter(s => !s.has_paid).sort((a, b) => a.student_name.localeCompare(b.student_name));
      
      setAllStudents(studentsArray);
      setStudentPayments(paidStudents);

      // Calculate summary stats
      const totalCollectedAmount = paidStudents.reduce((sum, s) => sum + s.total_paid, 0);
      setTotalCollected(totalCollectedAmount);
      setTotalStudentsPaid(paidStudents.length);
      setTotalStudentsUnpaid(unpaidStudents.length);

      // Calculate total expenses
      const totalExpensesAmount = expenses.reduce((sum, expense: { amount?: number | string }) => {
        const amount = Number(expense.amount || 0);
        return sum + amount;
      }, 0);
      setTotalExpenses(totalExpensesAmount);
      setNetBalance(totalCollectedAmount - totalExpensesAmount);

      if (import.meta.env.DEV) {
        // Debug logs removed for production security
      }

      // Category breakdown with expenses
      const categoryMap = new Map<string, CategoryExpenses>();
      
      // Add collected amounts
      paidStudents.forEach(student => {
        student.payments.forEach(payment => {
          if (!categoryMap.has(payment.category)) {
            categoryMap.set(payment.category, {
              category: payment.category,
              total_collected: 0,
              total_expenses: 0,
              net_balance: 0,
              payment_count: 0,
            });
          }
          const cat = categoryMap.get(payment.category)!;
          cat.total_collected += payment.amount;
          cat.payment_count += 1;
        });
      });

      // Add expenses to category breakdown
      interface ExpenseRecord {
        id?: string;
        amount?: number | string;
        payment_type_id?: string;
        payment_types?: { id?: string; category?: string; title?: string }[] | { id?: string; category?: string; title?: string } | null;
      }

      // Fetch payment types for expenses that don't have the relation
      const expensePaymentTypeIds = expenses
        .filter((e: ExpenseRecord) => e.payment_type_id && !e.payment_types)
        .map((e: ExpenseRecord) => e.payment_type_id)
        .filter(Boolean) as string[];

      const paymentTypesMap = new Map<string, { category: string; title: string }>();
      if (expensePaymentTypeIds.length > 0) {
        const { data: paymentTypesData } = await supabase
          .from('payment_types')
          .select('id, category, title')
          .in('id', expensePaymentTypeIds);
        
        if (paymentTypesData) {
          paymentTypesData.forEach(pt => {
            paymentTypesMap.set(pt.id, { category: pt.category, title: pt.title });
          });
        }
      }

      expenses.forEach((expense: ExpenseRecord) => {
        const pt = Array.isArray(expense.payment_types) ? expense.payment_types[0] : expense.payment_types;
        let category = pt?.category || 'Other';
        
        // Fallback to payment_type_id lookup if relation is missing
        if (!category || category === 'Other') {
          if (expense.payment_type_id && paymentTypesMap.has(expense.payment_type_id)) {
            category = paymentTypesMap.get(expense.payment_type_id)!.category;
          }
        }
        
        const amount = Number(expense.amount || 0);

        if (!categoryMap.has(category)) {
          categoryMap.set(category, {
            category,
            total_collected: 0,
            total_expenses: 0,
            net_balance: 0,
            payment_count: 0,
          });
        }
        const cat = categoryMap.get(category)!;
        cat.total_expenses += amount;
      });

      if (import.meta.env.DEV) {
        // Debug logs removed for production security
      }

      // Calculate net balance for each category
      categoryMap.forEach(cat => {
        cat.net_balance = cat.total_collected - cat.total_expenses;
      });

      const categoriesArray = Array.from(categoryMap.values())
        .sort((a, b) => b.total_collected - a.total_collected);
      setCategoriesBreakdown(categoriesArray);

    } catch (error) {
      console.error('Error fetching student payments:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStudentPayments();
  }, [fetchStudentPayments]);

  // Filter students
  const studentsToFilter = paymentFilter === 'unpaid' 
    ? allStudents.filter(s => !s.has_paid)
    : paymentFilter === 'paid'
    ? allStudents.filter(s => s.has_paid)
    : allStudents;

  const filteredStudents = studentsToFilter.filter(student => {
    // Search filter
    if (searchTerm) {
      const search = searchTerm.toLowerCase();
      if (
        !student.student_name.toLowerCase().includes(search) &&
        !student.reg_number.toLowerCase().includes(search)
      ) {
        return false;
      }
    }

    // Category filter
    if (categoryFilter !== 'all' && !student.categories_paid.includes(categoryFilter)) {
      return false;
    }

    // Status filter
    if (statusFilter === 'active' && !student.is_active) return false;
    if (statusFilter === 'inactive' && student.is_active) return false;

    return true;
  });

  // Pagination
  const totalPages = Math.ceil(filteredStudents.length / itemsPerPage);
  const paginatedStudents = filteredStudents.slice(
    (currentPage - 1) * itemsPerPage,
    currentPage * itemsPerPage
  );

  // Export to CSV
  const exportToCSV = () => {
    const headers = ['Student Name', 'Reg Number', 'Status', 'Total Paid', 'Payments', 'Categories'];
    const rows = filteredStudents.map(s => [
      s.student_name,
      s.reg_number,
      s.is_active ? 'Active' : 'Inactive',
      s.total_paid,
      s.payment_count,
      s.categories_paid.join('; '),
    ]);

    const csv = [headers, ...rows].map(row => row.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `student-payments-${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
  };

  return (
    <div className="min-h-screen py-6 px-4" style={{
      background: 'radial-gradient(ellipse at top, #1A0E09 0%, #0F0703 100%)',
    }}>
      {/* Background Grid Pattern */}
      <div
        className="absolute inset-0 opacity-20 pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(${colors.primary}40 1px, transparent 1px),
            linear-gradient(90deg, ${colors.primary}40 1px, transparent 1px)
          `,
          backgroundSize: '50px 50px',
        }}
      />

      {/* Animated Gradient Orbs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div
          className="absolute w-[500px] h-[500px] rounded-full blur-[120px] opacity-30"
          style={{
            background: `radial-gradient(circle, ${colors.primary} 0%, transparent 70%)`,
            top: '-10%',
            right: '-5%',
            animation: 'pulse 4s ease-in-out infinite',
          }}
        />
        <div
          className="absolute w-[400px] h-[400px] rounded-full blur-[100px] opacity-20"
          style={{
            background: `radial-gradient(circle, ${colors.accentMint} 0%, transparent 70%)`,
            bottom: '-5%',
            left: '-5%',
            animation: 'pulse 6s ease-in-out infinite',
          }}
        />
      </div>

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-4 mb-4 sm:mb-6">
            <button
              onClick={() => navigate("/admin/dashboard")}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-all hover:scale-105"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: `1px solid ${colors.primary}40`,
                color: colors.textSecondary
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>
            <div className="flex-1">
              <h1 className="text-xl sm:text-2xl lg:text-3xl font-bold text-white">Payment Collection Overview</h1>
              <p className="text-xs sm:text-sm mt-1" style={{ color: colors.textSecondary }}>
                Detailed breakdown of student payments across all categories
              </p>
            </div>
            <button
              onClick={exportToCSV}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-lg transition-all hover:scale-105 text-sm"
              style={{
                background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
                border: `1px solid ${colors.primary}60`,
                color: 'white'
              }}
            >
              <Download className="w-4 h-4" />
              <span className="hidden sm:inline">Export CSV</span>
            </button>
          </div>

          {/* Summary Stats Cards */}
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4 mb-6">
            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.1 }}
            >
              <GlassCard className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 opacity-10">
                  <Wallet className="w-full h-full" style={{ color: colors.statusPaid }} />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] sm:text-xs mb-1" style={{ color: colors.textSecondary }}>Collected</p>
                  <p className="text-lg sm:text-2xl font-bold text-white">{formatCurrency(totalCollected)}</p>
                  <p className="text-[10px] sm:text-xs mt-1" style={{ color: colors.accentMint }}>
                    {studentPayments.reduce((sum, s) => sum + s.payment_count, 0)} pays
                  </p>
                </div>
              </GlassCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.15 }}
            >
              <GlassCard className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 opacity-10">
                  <TrendingUp className="w-full h-full" style={{ color: colors.statusFailed }} />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] sm:text-xs mb-1" style={{ color: colors.textSecondary }}>Expenses</p>
                  <p className="text-lg sm:text-2xl font-bold" style={{ color: totalExpenses > 0 ? colors.statusFailed : colors.textSecondary }}>
                    {formatCurrency(totalExpenses)}
                  </p>
                  <p className="text-[10px] sm:text-xs mt-1" style={{ color: colors.textSecondary }}>
                    {totalExpenses > 0 ? 'Approved' : 'None yet'}
                  </p>
                </div>
              </GlassCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.2 }}
            >
              <GlassCard className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 opacity-10">
                  <Wallet className="w-full h-full" style={{ color: netBalance >= 0 ? colors.statusPaid : colors.statusFailed }} />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] sm:text-xs mb-1" style={{ color: colors.textSecondary }}>Net</p>
                  <p className="text-lg sm:text-2xl font-bold" style={{ color: netBalance >= 0 ? colors.statusPaid : colors.statusFailed }}>
                    {formatCurrency(netBalance)}
                  </p>
                  <p className="text-[10px] sm:text-xs mt-1" style={{ color: colors.textSecondary }}>
                    Balance
                  </p>
                </div>
              </GlassCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.25 }}
            >
              <GlassCard className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 opacity-10">
                  <Users className="w-full h-full" style={{ color: colors.statusPaid }} />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] sm:text-xs mb-1" style={{ color: colors.textSecondary }}>Paid</p>
                  <p className="text-lg sm:text-2xl font-bold text-white">{totalStudentsPaid}</p>
                  <p className="text-[10px] sm:text-xs mt-1" style={{ color: colors.statusPaid }}>
                    Students
                  </p>
                </div>
              </GlassCard>
            </motion.div>

            <motion.div
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.3 }}
            >
              <GlassCard className="relative overflow-hidden">
                <div className="absolute top-0 right-0 w-16 h-16 sm:w-20 sm:h-20 opacity-10">
                  <Users className="w-full h-full" style={{ color: colors.statusFailed }} />
                </div>
                <div className="relative z-10">
                  <p className="text-[10px] sm:text-xs mb-1" style={{ color: colors.textSecondary }}>Unpaid</p>
                  <p className="text-lg sm:text-2xl font-bold" style={{ color: colors.statusFailed }}>{totalStudentsUnpaid}</p>
                  <p className="text-[10px] sm:text-xs mt-1" style={{ color: colors.textSecondary }}>
                    Students
                  </p>
                </div>
              </GlassCard>
            </motion.div>
          </div>
        </motion.div>

        {/* Category Breakdown */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
        >
          <GlassCard>
            <div className="flex items-center gap-2 mb-4">
              <TrendingUp className="w-5 h-5" style={{ color: colors.primary }} />
              <h2 className="text-xl font-bold text-white">Category Breakdown</h2>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
              {categoriesBreakdown.map((cat, index) => (
                <motion.button
                  key={cat.category}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.5 + index * 0.05 }}
                  onClick={() => setCategoryFilter(cat.category)}
                  className={`p-3 sm:p-4 rounded-lg text-left transition-all hover:scale-[1.02] hover:shadow-lg ${
                    categoryFilter === cat.category ? 'ring-2 shadow-xl' : ''
                  }`}
                  style={{
                    background: categoryFilter === cat.category
                      ? `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`
                      : 'rgba(255,255,255,0.03)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: categoryFilter === cat.category ? colors.primary : 'rgba(255,255,255,0.1)',
                  }}
                >
                  <p className="text-xs sm:text-sm font-medium capitalize" style={{ color: colors.textSecondary }}>
                    {cat.category.replace(/_/g, ' ')}
                  </p>
                  <p className="text-lg sm:text-xl font-bold text-white mt-1">{formatCurrency(cat.total_collected)}</p>
                  {cat.total_expenses > 0 || cat.total_collected > 0 ? (
                    <div className="text-[10px] sm:text-xs mt-1 space-y-0.5">
                      {cat.total_expenses > 0 && (
                        <p style={{ color: colors.statusFailed }}>-{formatCurrency(cat.total_expenses)} spent</p>
                      )}
                      <p className="font-semibold" style={{ color: cat.net_balance >= 0 ? colors.statusPaid : colors.statusFailed }}>
                        = {formatCurrency(cat.net_balance)} net
                      </p>
                    </div>
                  ) : (
                    <p className="text-[10px] sm:text-xs mt-1" style={{ color: colors.textSecondary }}>
                      No activity
                    </p>
                  )}
                </motion.button>
              ))}
            </div>
          </GlassCard>
        </motion.div>

        {/* Filters & Search */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6 }}
        >
          <GlassCard>
            <div className="flex flex-col gap-4">
              {/* Search */}
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: colors.textSecondary }} />
                <input
                  type="text"
                  placeholder="Search by student name or reg number..."
                  value={searchTerm}
                  onChange={(e) => {
                    setSearchTerm(e.target.value);
                    setCurrentPage(1);
                  }}
                  className="w-full pl-10 pr-4 py-2.5 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:ring-2 transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.05)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'rgba(255,255,255,0.1)',
                  }}
                />
              </div>

              {/* Payment Filter */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="flex items-center gap-1 text-xs sm:text-sm" style={{ color: colors.textSecondary }}>
                  <Filter className="w-3 h-3 sm:w-4 sm:h-4" />
                  <span className="hidden sm:inline">Payment:</span>
                </div>
                {(['all', 'paid', 'unpaid'] as const).map((filter) => (
                  <button
                    key={filter}
                    onClick={() => {
                      setPaymentFilter(filter);
                      setCurrentPage(1);
                    }}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all hover:shadow-md ${
                      paymentFilter === filter ? 'scale-105 shadow-lg' : 'hover:scale-[1.02]'
                    }`}
                    style={{
                      background: paymentFilter === filter
                        ? `linear-gradient(135deg, ${colors.primary}40, ${colors.primary}20)`
                        : 'rgba(255,255,255,0.05)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: paymentFilter === filter ? colors.primary : 'rgba(255,255,255,0.1)',
                      color: paymentFilter === filter ? 'white' : colors.textSecondary,
                    }}
                  >
                    {filter === 'all' ? 'All' : filter === 'paid' ? 'Paid' : 'Not Paid'}
                    {filter === 'paid' && ` (${totalStudentsPaid})`}
                    {filter === 'unpaid' && ` (${totalStudentsUnpaid})`}
                  </button>
                ))}
              </div>
            </div>

            {/* Activity Status Filter */}
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs sm:text-sm" style={{ color: colors.textSecondary }}>Activity:</span>
              <div className="flex flex-wrap gap-2">
                {(['all', 'active', 'inactive'] as const).map((status) => (
                  <button
                    key={status}
                    onClick={() => {
                      setStatusFilter(status);
                      setCurrentPage(1);
                    }}
                    className={`px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium transition-all hover:shadow-md ${
                      statusFilter === status ? 'scale-105 shadow-lg' : 'hover:scale-[1.02]'
                    }`}
                    style={{
                      background: statusFilter === status
                        ? `linear-gradient(135deg, ${colors.primary}40, ${colors.primary}20)`
                        : 'rgba(255,255,255,0.05)',
                      borderWidth: '1px',
                      borderStyle: 'solid',
                      borderColor: statusFilter === status ? colors.primary : 'rgba(255,255,255,0.1)',
                      color: statusFilter === status ? 'white' : colors.textSecondary,
                    }}
                  >
                    {status === 'all' ? 'All' : status.charAt(0).toUpperCase() + status.slice(1)}
                  </button>
                ))}
              </div>
            </div>

            {/* Category filter pills */}
            {categoryFilter !== 'all' && (
              <div className="mt-4 flex items-center gap-2">
                <span className="text-sm" style={{ color: colors.textSecondary }}>Filtered by:</span>
                <button
                  onClick={() => setCategoryFilter('all')}
                  className="px-3 py-1 rounded-full text-sm font-medium flex items-center gap-2 transition-all hover:scale-105"
                  style={{
                    background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
                    border: `1px solid ${colors.primary}60`,
                    color: 'white',
                  }}
                >
                  <span className="capitalize">{categoryFilter.replace(/_/g, ' ')}</span>
                  <span className="text-xs">✕</span>
                </button>
              </div>
            )}

            <div className="mt-4 text-sm" style={{ color: colors.textSecondary }}>
              Showing {filteredStudents.length} of {allStudents.length} students
            </div>
          </GlassCard>
        </motion.div>

        {/* Student Payment List */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <div
              className="animate-spin rounded-full h-16 w-16 border-4 border-t-transparent"
              style={{ borderColor: colors.primary, borderTopColor: 'transparent' }}
            />
          </div>
        ) : paginatedStudents.length === 0 ? (
          <GlassCard>
            <div className="text-center py-12">
              <Users className="w-16 h-16 mx-auto mb-4 opacity-30" style={{ color: colors.textSecondary }} />
              <p className="text-lg font-medium" style={{ color: colors.textSecondary }}>
                No students found
              </p>
              <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>
                Try adjusting your filters or search query
              </p>
            </div>
          </GlassCard>
        ) : (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.7 }}
            className="space-y-3"
          >
            {paginatedStudents.map((student, index) => (
              <motion.div
                key={student.id}
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: 0.7 + index * 0.02 }}
              >
                <GlassCard className="hover:scale-[1.01] transition-all">
                  <div className="flex flex-col gap-3 sm:gap-4">
                    {/* Student Info */}
                    <div className="flex-1">
                      <div className="flex items-start gap-2">
                        <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-full flex items-center justify-center text-white text-sm sm:text-base font-bold shrink-0"
                          style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})` }}>
                          {student.student_name.charAt(0).toUpperCase()}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="font-semibold text-sm sm:text-base text-white wrap-break-word">{student.student_name}</p>
                          <p className="text-xs sm:text-sm truncate" style={{ color: colors.textSecondary }} title={student.reg_number}>{student.reg_number}</p>
                        </div>
                        <span
                          className="px-2 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap shrink-0"
                          style={{
                            background: student.is_active ? colors.statusPaid : colors.statusFailed,
                            color: 'white',
                          }}
                        >
                          {student.is_active ? 'Active' : 'Inactive'}
                        </span>
                      </div>
                    </div>

                    {/* Payment Summary */}
                    <div className="grid grid-cols-3 gap-3 sm:gap-6 mt-2 sm:mt-0">
                      <div className="text-center">
                        <p className="text-[10px] sm:text-sm" style={{ color: colors.textSecondary }}>Total Paid</p>
                        <p className="text-sm sm:text-xl font-bold text-white">{formatCurrency(student.total_paid)}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] sm:text-sm" style={{ color: colors.textSecondary }}>Payments</p>
                        <p className="text-sm sm:text-xl font-bold" style={{ color: colors.accentMint }}>{student.payment_count}</p>
                      </div>
                      <div className="text-center">
                        <p className="text-[10px] sm:text-sm" style={{ color: colors.textSecondary }}>Categories</p>
                        <p className="text-sm sm:text-xl font-bold" style={{ color: colors.primary }}>{student.categories_paid.length}</p>
                      </div>
                    </div>
                  </div>

                  {/* Categories Paid */}
                  {student.categories_paid.length > 0 ? (
                    <div className="mt-4 flex flex-wrap gap-2">
                      {student.categories_paid.map((cat) => (
                        <span
                          key={cat}
                          className="px-3 py-1 rounded-full text-xs font-medium capitalize"
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: colors.textSecondary,
                          }}
                        >
                          {cat.replace(/_/g, ' ')}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <div className="mt-4 p-3 rounded-lg text-center" style={{ background: 'rgba(255,100,100,0.1)', border: '1px solid rgba(255,100,100,0.2)' }}>
                      <p className="text-sm font-medium" style={{ color: colors.statusFailed }}>
                        No payments recorded yet
                      </p>
                    </div>
                  )}

                  {/* Payment Details */}
                  {student.has_paid && (
                    <div className="mt-4 space-y-2">
                      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
                        Payment History
                      </p>
                      <div className="space-y-1.5">
                        {student.payments.slice(0, 3).map((payment) => (
                          <div
                            key={payment.id}
                            className="flex items-center justify-between p-2 rounded-lg"
                            style={{ background: 'rgba(255,255,255,0.02)' }}
                          >
                            <div className="flex-1">
                              <p className="text-sm font-medium text-white">{payment.payment_type}</p>
                              <p className="text-xs" style={{ color: colors.textSecondary }}>
                                {formatDate(payment.created_at, 'short')} • {payment.transaction_ref}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-sm font-semibold text-white">{formatCurrency(payment.amount)}</p>
                              <span
                                className="text-xs px-2 py-0.5 rounded-full"
                                style={{
                                  background: payment.status === 'approved'
                                    ? colors.statusPaid
                                    : payment.status === 'pending'
                                    ? 'rgba(255,165,0,0.2)'
                                    : 'rgba(59,130,246,0.2)',
                                  color: payment.status === 'approved' ? 'white' : colors.primary,
                                }}
                              >
                                {payment.status.toUpperCase()}
                              </span>
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
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.8 }}
          >
            <GlassCard>
              <div className="flex items-center justify-between">
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Page {currentPage} of {totalPages}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                    className="px-4 py-2 rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                    style={{
                      background: currentPage === 1 ? 'rgba(255,255,255,0.03)' : `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
                      border: `1px solid ${currentPage === 1 ? 'transparent' : colors.primary}`,
                      color: currentPage === 1 ? colors.textSecondary : 'white',
                    }}
                  >
                    <ChevronLeft className="w-4 h-4" />
                    <span>Previous</span>
                  </button>
                  <button
                    onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                    className="px-4 py-2 rounded-lg flex items-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed hover:scale-105"
                    style={{
                      background: currentPage === totalPages ? 'rgba(255,255,255,0.03)' : `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
                      border: `1px solid ${currentPage === totalPages ? 'transparent' : colors.primary}`,
                      color: currentPage === totalPages ? colors.textSecondary : 'white',
                    }}
                  >
                    <span>Next</span>
                    <ChevronRight className="w-4 h-4" />
                  </button>
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
