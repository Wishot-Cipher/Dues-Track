/**
 * HTML-Based Print Exports
 * Beautiful, professional print layouts using the QuickPaymentSummary style
 * Supports multi-page printing for large datasets
 * 
 * @author Dev_Wishot
 * @copyright Dev_Wishot - @wishotstudio
 */

import {
  formatNaira,
  formatDate,
  getAcademicSession,
  generatePrintHTML,
  generateInfoCard,
  generateStatsGrid,
  generateSection,
  generateNoteBox,
  generateTable,
  generateStatusBadge,
  generatePaginatedReport,
  openPrintWindow,
} from './printStyles';

// Rows per page for multi-page reports
const ROWS_PER_PAGE = 25;

// ============ TYPES ============

// For student exports (ManageStudentsPage)
interface StudentExport {
  id: string;
  full_name: string;
  reg_number: string;
  email?: string;
  phone?: string;
  level?: string;
  department?: string;
  section?: string;
  is_active: boolean;
  force_password_change?: boolean;
  total_paid?: number;
  balance?: number;
}

// For payment history exports (PaymentHistoryPage)
interface PaymentExport {
  id: string;
  student_id?: string;
  amount: number;
  status: string;
  payment_method?: string;
  transaction_ref?: string;
  created_at: string;
  approved_at?: string;
  notes?: string;
  payment_type?: {
    title: string;
    amount?: number;
  };
}

interface StudentInfo {
  full_name: string;
  reg_number: string;
  email?: string;
  level?: string;
  department?: string;
}

// For expense exports (ExpenseList)
interface ExpenseExport {
  id?: string;
  title: string;
  description?: string;
  amount: number;
  category?: string;
  status: string;
  created_at: string;
  approved_at?: string;
}

// For collected payments (AdminCollectedPage)
interface CollectedPaymentsData {
  students: Array<{
    id: string;
    student_name: string;
    reg_number: string;
    is_active: boolean;
    total_paid: number;
    payment_count: number;
    categories_paid: string[];
    payments: Array<{
      id: string;
      amount: number;
      category: string;
      payment_type: string;
      transaction_ref: string;
      status: string;
      created_at: string;
    }>;
  }>;
  totalCollected: number;
  totalExpenses: number;
  netBalance: number;
  totalStudentsPaid: number;
  totalStudentsUnpaid: number;
  categoriesBreakdown: Array<{
    category: string;
    total_collected: number;
    total_expenses: number;
    net_balance: number;
    payment_count: number;
  }>;
  filters?: {
    category?: string;
    status?: string;
    payment?: string;
    search?: string;
  };
}

// Helper to format category names
function formatCategory(category: string): string {
  if (!category) return 'Uncategorized';
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

// ============ EXPORT FUNCTIONS ============

/**
 * Export Students to Print (for ManageStudentsPage)
 * Supports multi-page printing for large student lists
 */
export function exportStudentsToPrint(
  students: StudentExport[],
  filters?: { status?: string; role?: string }
): void {
  const activeStudents = students.filter(s => s.is_active);
  const inactiveStudents = students.filter(s => !s.is_active);
  const totalPaid = students.reduce((sum, s) => sum + (s.total_paid || 0), 0);
  
  // Build summary content for first page
  let summaryContent = '';
  
  // Report Info
  const infoItems = [
    { label: 'Report Generated', value: new Date().toLocaleDateString('en-US', { dateStyle: 'full' }) },
    { label: 'Total Students', value: students.length.toString() },
    { label: 'Status Filter', value: filters?.status || 'All Statuses' },
    { label: 'Role Filter', value: filters?.role || 'All Roles' },
  ];
  summaryContent += generateSection('📊', 'Report Information', generateInfoCard(infoItems));
  
  // Summary Stats
  const stats = [
    { value: activeStudents.length.toString(), label: 'Active Students', type: 'approved' },
    { value: inactiveStudents.length.toString(), label: 'Inactive Students', type: 'rejected' },
    { value: students.length.toString(), label: 'Total Students', type: 'total' },
    { value: formatNaira(totalPaid), label: 'Total Collected', type: 'approved' },
  ];
  summaryContent += generateSection('👥', 'Student Summary', generateStatsGrid(stats, 4));
  
  // Prepare table rows
  const tableHeaders = ['Name', 'Reg Number', 'Level', 'Department', 'Status', 'Phone', 'Paid'];
  const tableRows = students.map(s => {
    const statusClass = s.is_active ? 'active' : 'inactive';
    return [
      s.full_name,
      s.reg_number,
      s.level || '-',
      s.department || '-',
      `<span class="status ${statusClass}">${s.is_active ? '✓ Active' : '✗ Inactive'}</span>`,
      s.phone || '-',
      `<span class="amount positive">${formatNaira(s.total_paid || 0)}</span>`,
    ];
  });
  
  // Important Notes
  const notesContent = generateNoteBox([
    'This report contains confidential student information.',
    `Report includes ${activeStudents.length} active and ${inactiveStudents.length} inactive students.`,
    'Contact the administrator for any updates.',
  ]);
  
  // Generate paginated report
  const content = generatePaginatedReport(
    'Students Report',
    `Class Dues Tracker • ${getAcademicSession()} Academic Session`,
    summaryContent,
    tableHeaders,
    tableRows,
    ROWS_PER_PAGE,
    { tableTitle: 'Student Records', notesContent }
  );
  
  const html = generatePrintHTML('Students Report - Class Dues Tracker', content);
  openPrintWindow(html);
}

/**
 * Export Payments to Print (for PaymentHistoryPage - student view)
 * Supports multi-page printing for payment history
 */
export function exportPaymentsToPrint(
  payments: PaymentExport[],
  student?: StudentInfo
): void {
  const approvedPayments = payments.filter(p => p.status === 'approved');
  const pendingPayments = payments.filter(p => p.status === 'pending');
  const rejectedPayments = payments.filter(p => p.status === 'rejected');
  const waivedPayments = payments.filter(p => p.status === 'approved' && p.transaction_ref?.startsWith('WAIVED-'));
  
  const totalApproved = approvedPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
  const totalWaived = waivedPayments.reduce((sum, p) => sum + p.amount, 0);
  
  // Build summary content
  let summaryContent = '';
  
  // Student Info (if provided)
  if (student) {
    const infoItems = [
      { label: 'Student Name', value: student.full_name },
      { label: 'Reg Number', value: student.reg_number },
      { label: 'Level', value: student.level || 'N/A' },
      { label: 'Department', value: student.department || 'N/A' },
      { label: 'Email', value: student.email || 'N/A' },
      { label: 'Session', value: getAcademicSession() },
    ];
    summaryContent += generateSection('👤', 'Student Information', generateInfoCard(infoItems, 3));
  }
  
  // Payment Summary Stats
  const stats = [
    { value: formatNaira(totalApproved), label: 'Total Approved', type: 'approved' },
    { value: formatNaira(totalPending), label: 'Total Pending', type: 'pending' },
    { value: formatNaira(totalWaived), label: 'Total Waived', type: 'info' },
    { value: approvedPayments.length.toString(), label: 'Approved', type: 'approved' },
    { value: pendingPayments.length.toString(), label: 'Pending', type: 'pending' },
    { value: rejectedPayments.length.toString(), label: 'Rejected', type: 'rejected' },
  ];
  summaryContent += generateSection('💰', 'Payment Summary', generateStatsGrid(stats, 3));
  
  // Payment Type Breakdown
  const typeBreakdown = new Map<string, { count: number; amount: number }>();
  payments.forEach(p => {
    const typeName = p.payment_type?.title || 'Other';
    const existing = typeBreakdown.get(typeName) || { count: 0, amount: 0 };
    existing.count++;
    existing.amount += p.amount;
    typeBreakdown.set(typeName, existing);
  });
  
  if (typeBreakdown.size > 0) {
    const breakdownRows = Array.from(typeBreakdown.entries()).map(([type, data]) => [
      formatCategory(type),
      data.count.toString(),
      formatNaira(data.amount),
    ]);
    
    summaryContent += generateSection('📋', 'Payment Type Breakdown', 
      generateTable(['Payment Type', 'Count', 'Amount'], breakdownRows)
    );
  }
  
  // Prepare table rows for transaction history
  const tableHeaders = ['Date', 'Payment Type', 'Amount', 'Reference', 'Status', 'Notes'];
  const tableRows = payments.map(p => {
    const isWaived = p.transaction_ref?.startsWith('WAIVED-');
    return [
      formatDate(p.created_at),
      p.payment_type?.title || 'Unknown',
      `<span class="amount">${formatNaira(p.amount)}</span>`,
      p.transaction_ref || '-',
      isWaived ? '<span class="status waived">✓ Waived</span>' : generateStatusBadge(p.status),
      p.notes || '-',
    ];
  });
  
  // Important Notes
  const notesContent = generateNoteBox([
    'Only approved payments are counted toward your balance.',
    'Pending payments require administrator approval.',
    'Keep this statement for your records.',
  ]);
  
  // Generate paginated report
  const content = generatePaginatedReport(
    'Payment Statement',
    student?.full_name || 'Student Payment History',
    summaryContent,
    tableHeaders,
    tableRows,
    ROWS_PER_PAGE,
    { tableTitle: 'Transaction History', notesContent }
  );
  
  const html = generatePrintHTML('Payment Statement - Class Dues Tracker', content);
  openPrintWindow(html);
}

/**
 * Export Expenses to Print (for ExpenseList)
 * Supports multi-page printing for expense records
 */
export function exportExpensesToPrint(
  expenses: ExpenseExport[]
): void {
  const approvedExpenses = expenses.filter(e => e.status === 'approved');
  const pendingExpenses = expenses.filter(e => e.status === 'pending');
  const rejectedExpenses = expenses.filter(e => e.status === 'rejected');
  
  const totalApproved = approvedExpenses.reduce((sum, e) => sum + e.amount, 0);
  const totalPending = pendingExpenses.reduce((sum, e) => sum + e.amount, 0);
  
  // Category breakdown
  const categoryBreakdown = new Map<string, { count: number; approved: number; pending: number }>();
  expenses.forEach(e => {
    const category = e.category || 'Uncategorized';
    const existing = categoryBreakdown.get(category) || { count: 0, approved: 0, pending: 0 };
    existing.count++;
    if (e.status === 'approved') existing.approved += e.amount;
    if (e.status === 'pending') existing.pending += e.amount;
    categoryBreakdown.set(category, existing);
  });
  
  // Build summary content
  let summaryContent = '';
  
  // Report Info
  const infoItems = [
    { label: 'Report Generated', value: new Date().toLocaleDateString('en-US', { dateStyle: 'full' }) },
    { label: 'Total Expenses', value: expenses.length.toString() },
    { label: 'Academic Session', value: getAcademicSession() },
  ];
  summaryContent += generateSection('📊', 'Report Information', generateInfoCard(infoItems, 3));
  
  // Summary Stats
  const stats = [
    { value: formatNaira(totalApproved), label: 'Total Approved', type: 'expense' },
    { value: formatNaira(totalPending), label: 'Total Pending', type: 'pending' },
    { value: approvedExpenses.length.toString(), label: 'Approved Count', type: 'expense' },
    { value: pendingExpenses.length.toString(), label: 'Pending Count', type: 'pending' },
    { value: rejectedExpenses.length.toString(), label: 'Rejected Count', type: 'rejected' },
    { value: expenses.length.toString(), label: 'Total Count', type: 'total' },
  ];
  summaryContent += generateSection('💰', 'Expense Summary', generateStatsGrid(stats, 3));
  
  // Category Breakdown
  if (categoryBreakdown.size > 0) {
    const categoryRows = Array.from(categoryBreakdown.entries()).map(([category, data]) => [
      formatCategory(category),
      data.count.toString(),
      formatNaira(data.approved),
      formatNaira(data.pending),
      formatNaira(data.approved + data.pending),
    ]);
    
    summaryContent += generateSection('📁', 'Category Breakdown', 
      generateTable(['Category', 'Count', 'Approved', 'Pending', 'Total'], categoryRows)
    );
  }
  
  // Prepare table rows
  const tableHeaders = ['Date', 'Title', 'Category', 'Amount', 'Status', 'Description'];
  const tableRows = expenses.map(e => [
    formatDate(e.created_at),
    e.title,
    formatCategory(e.category || ''),
    `<span class="amount negative">${formatNaira(e.amount)}</span>`,
    generateStatusBadge(e.status),
    e.description || '-',
  ]);
  
  // Important Notes
  const notesContent = generateNoteBox([
    'All expense records are subject to administrative approval.',
    'Approved expenses are deducted from the class fund balance.',
    'Receipts should be retained for audit purposes.',
  ]);
  
  // Generate paginated report
  const content = generatePaginatedReport(
    'Expenses Report',
    `Class Dues Tracker • ${getAcademicSession()} Academic Session`,
    summaryContent,
    tableHeaders,
    tableRows,
    ROWS_PER_PAGE,
    { tableTitle: 'Expense Records', notesContent }
  );
  
  const html = generatePrintHTML('Expenses Report - Class Dues Tracker', content);
  openPrintWindow(html);
}

/**
 * Export Collected Payments to Print (for AdminCollectedPage)
 * Supports multi-page printing for student payment records
 */
export function exportCollectedPaymentsToPrint(data: CollectedPaymentsData): void {
  const { 
    students, 
    totalCollected, 
    totalExpenses, 
    netBalance, 
    totalStudentsPaid, 
    totalStudentsUnpaid,
    categoriesBreakdown,
    filters 
  } = data;
  
  // Build summary content
  let summaryContent = '';
  
  // Report Info
  const infoItems = [
    { label: 'Report Generated', value: new Date().toLocaleDateString('en-US', { dateStyle: 'full' }) },
    { label: 'Category Filter', value: filters?.category || 'All Categories' },
    { label: 'Status Filter', value: filters?.status || 'All Statuses' },
    { label: 'Payment Filter', value: filters?.payment || 'All Payments' },
  ];
  summaryContent += generateSection('📊', 'Report Information', generateInfoCard(infoItems));
  
  // Financial Overview
  const finStats = [
    { value: formatNaira(totalCollected), label: 'Total Collected', type: 'approved' },
    { value: formatNaira(totalExpenses), label: 'Total Expenses', type: 'expense' },
    { value: formatNaira(netBalance), label: 'Net Balance', type: netBalance >= 0 ? 'balance' : 'expense' },
    { value: totalStudentsPaid.toString(), label: 'Students Paid', type: 'approved' },
    { value: totalStudentsUnpaid.toString(), label: 'Students Unpaid', type: 'pending' },
    { value: (totalStudentsPaid + totalStudentsUnpaid).toString(), label: 'Total Students', type: 'total' },
  ];
  summaryContent += generateSection('💰', 'Financial Overview', generateStatsGrid(finStats, 3));
  
  // Category Breakdown
  if (categoriesBreakdown.length > 0) {
    const categoryRows = categoriesBreakdown.map(cat => [
      formatCategory(cat.category),
      cat.payment_count.toString(),
      `<span class="amount positive">${formatNaira(cat.total_collected)}</span>`,
      `<span class="amount negative">${formatNaira(cat.total_expenses)}</span>`,
      `<span class="amount ${cat.net_balance >= 0 ? 'positive' : 'negative'}">${formatNaira(cat.net_balance)}</span>`,
    ]);
    
    summaryContent += generateSection('📁', 'Category Breakdown', 
      generateTable(
        ['Category', 'Payments', 'Collected', 'Expenses', 'Net Balance'],
        categoryRows
      )
    );
  }
  
  // Prepare student table rows
  const tableHeaders = ['Student Name', 'Reg Number', 'Status', 'Payments', 'Total Paid', 'Categories'];
  const tableRows = students.map(s => {
    const statusClass = s.is_active ? 'active' : 'inactive';
    return [
      s.student_name,
      s.reg_number,
      `<span class="status ${statusClass}">${s.is_active ? '✓ Active' : '✗ Inactive'}</span>`,
      s.payment_count.toString(),
      `<span class="amount positive">${formatNaira(s.total_paid)}</span>`,
      s.categories_paid.map(c => formatCategory(c)).join(', ') || '-',
    ];
  });
  
  // Important Notes
  const notesContent = generateNoteBox([
    'This report shows payment collection summary for all students.',
    `Net balance is calculated as: Collected (${formatNaira(totalCollected)}) - Expenses (${formatNaira(totalExpenses)}) = ${formatNaira(netBalance)}.`,
    'For detailed individual records, please export individual student reports.',
  ]);
  
  // Generate paginated report
  const content = generatePaginatedReport(
    'Collected Payments Report',
    `Class Dues Tracker • ${getAcademicSession()} Academic Session`,
    summaryContent,
    tableHeaders,
    tableRows,
    ROWS_PER_PAGE,
    { tableTitle: 'Student Payment Details', notesContent }
  );
  
  const html = generatePrintHTML('Collected Payments Report - Class Dues Tracker', content);
  openPrintWindow(html);
}

// ============ LEGACY ALIASES ============
// These match the old jsPDF export function names for easy replacement

export const exportStudentsToPDF = exportStudentsToPrint;
export const exportPaymentsToPDF = exportPaymentsToPrint;
export const exportExpensesToPDF = exportExpensesToPrint;
export const exportCollectedPaymentsToPDF = exportCollectedPaymentsToPrint;

export default {
  exportStudentsToPrint,
  exportPaymentsToPrint,
  exportExpensesToPrint,
  exportCollectedPaymentsToPrint,
  // Legacy aliases
  exportStudentsToPDF,
  exportPaymentsToPDF,
  exportExpensesToPDF,
  exportCollectedPaymentsToPDF,
};