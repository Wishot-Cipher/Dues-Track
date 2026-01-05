/**
 * PDF Export Utility
 * Provides professional PDF generation for various data exports in the Class Dues Tracker
 * 
 * @author Dev_Wishot
 * @copyright Dev_Wishot - @wishotstudio
 * @license PROPRIETARY
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

// Extend jsPDF type to include autoTable
declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: {
      finalY: number;
    };
  }
}

// Color scheme matching the app's design
const COLORS = {
  primary: '#FF6B35',
  primaryDark: '#E55A2B',
  secondary: '#1A0E09',
  accent: '#50C878',
  warning: '#F59E0B',
  danger: '#EF4444',
  text: '#333333',
  textLight: '#666666',
  border: '#E5E7EB',
  background: '#F9FAFB',
  white: '#FFFFFF',
};

// Common styles
const STYLES = {
  headerFont: 'helvetica',
  bodyFont: 'helvetica',
  titleSize: 24,
  subtitleSize: 14,
  bodySize: 10,
  smallSize: 8,
};

interface Student {
  id: string;
  full_name: string;
  reg_number: string;
  email?: string;
  phone?: string;
  level?: string;
  department?: string;
  section?: string;
  is_active: boolean;
  is_admin?: boolean;
  is_finsec?: boolean;
  is_class_rep?: boolean;
  created_at?: string;
}

interface Payment {
  id: string;
  student_id: string;
  amount: number;
  status: string;
  payment_method?: string;
  transaction_ref?: string;
  created_at: string;
  approved_at?: string;
  notes?: string;
  payment_type?: {
    title: string;
    amount: number;
  };
}

interface Expense {
  id: string;
  title: string;
  description?: string;
  amount: number;
  category: string;
  status: string;
  created_at: string;
  approved_at?: string;
}

/**
 * Add header to PDF with logo and title
 */
function addHeader(doc: jsPDF, title: string, subtitle?: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header background
  doc.setFillColor(COLORS.secondary);
  doc.rect(0, 0, pageWidth, 45, 'F');
  
  // Accent stripe
  doc.setFillColor(COLORS.primary);
  doc.rect(0, 45, pageWidth, 3, 'F');
  
  // Title
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(STYLES.titleSize);
  doc.setTextColor(COLORS.white);
  doc.text(title, 20, 25);
  
  // Subtitle
  if (subtitle) {
    doc.setFont(STYLES.bodyFont, 'normal');
    doc.setFontSize(STYLES.subtitleSize);
    doc.setTextColor(COLORS.primary);
    doc.text(subtitle, 20, 38);
  }
  
  // App branding on right
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(COLORS.white);
  doc.text('Class Dues Tracker', pageWidth - 20, 20, { align: 'right' });
  
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor('#999999');
  doc.text('ECE Department', pageWidth - 20, 28, { align: 'right' });
  
  // Date
  doc.setFontSize(8);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}`, pageWidth - 20, 38, { align: 'right' });
  
  return 55; // Return Y position after header
}

/**
 * Add footer to PDF
 */
function addFooter(doc: jsPDF, pageNumber: number, totalPages: number): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Footer line
  doc.setDrawColor(COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(20, pageHeight - 20, pageWidth - 20, pageHeight - 20);
  
  // Footer text
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLORS.textLight);
  
  doc.text('Class Dues Tracker - Official Document', 20, pageHeight - 12);
  doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth / 2, pageHeight - 12, { align: 'center' });
  doc.text('Confidential', pageWidth - 20, pageHeight - 12, { align: 'right' });
}

/**
 * Add section title
 */
function addSectionTitle(doc: jsPDF, title: string, yPos: number, icon?: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Section background
  doc.setFillColor(COLORS.background);
  doc.roundedRect(15, yPos - 5, pageWidth - 30, 12, 2, 2, 'F');
  
  // Section title
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(COLORS.primary);
  doc.text(`${icon || '📋'} ${title}`, 20, yPos + 3);
  
  return yPos + 15;
}

/**
 * Add info box
 */
function addInfoBox(doc: jsPDF, label: string, value: string, x: number, y: number, width: number): void {
  // Box background
  doc.setFillColor(COLORS.white);
  doc.setDrawColor(COLORS.border);
  doc.roundedRect(x, y, width, 25, 3, 3, 'FD');
  
  // Label
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLORS.textLight);
  doc.text(label, x + 5, y + 8);
  
  // Value
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(COLORS.text);
  doc.text(value, x + 5, y + 19);
}

/**
 * Export students list to PDF
 */
export function exportStudentsToPDF(
  students: Student[],
  filters?: { status?: string; role?: string }
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  let yPos = addHeader(doc, 'Student Directory', 'Complete Student List');
  
  // Summary stats
  const activeCount = students.filter(s => s.is_active).length;
  const inactiveCount = students.filter(s => !s.is_active).length;
  const adminCount = students.filter(s => s.is_admin).length;
  const finsecCount = students.filter(s => s.is_finsec).length;
  const classRepCount = students.filter(s => s.is_class_rep).length;
  
  // Stats boxes
  const boxWidth = (pageWidth - 50) / 4;
  addInfoBox(doc, 'Total Students', students.length.toString(), 15, yPos, boxWidth);
  addInfoBox(doc, 'Active', activeCount.toString(), 15 + boxWidth + 5, yPos, boxWidth);
  addInfoBox(doc, 'Inactive', inactiveCount.toString(), 15 + (boxWidth + 5) * 2, yPos, boxWidth);
  addInfoBox(doc, 'With Roles', (adminCount + finsecCount + classRepCount).toString(), 15 + (boxWidth + 5) * 3, yPos, boxWidth);
  
  yPos += 35;
  
  // Filter info if applied
  if (filters?.status || filters?.role) {
    doc.setFont(STYLES.bodyFont, 'italic');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.textLight);
    const filterText = `Filters: ${filters.status ? `Status: ${filters.status}` : ''} ${filters.role ? `Role: ${filters.role}` : ''}`.trim();
    doc.text(filterText, 20, yPos);
    yPos += 10;
  }
  
  // Section title
  yPos = addSectionTitle(doc, 'Student List', yPos, '👥');
  
  // Students table
  const tableData = students.map((student, index) => [
    (index + 1).toString(),
    student.full_name,
    student.reg_number,
    student.level || 'N/A',
    student.department || 'N/A',
    student.is_active ? '✓ Active' : '✗ Inactive',
    [
      student.is_admin ? 'Admin' : '',
      student.is_finsec ? 'FinSec' : '',
      student.is_class_rep ? 'Class Rep' : ''
    ].filter(Boolean).join(', ') || 'Student'
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Full Name', 'Reg Number', 'Level', 'Department', 'Status', 'Role']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [255, 107, 53],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 51, 51],
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 40 },
      2: { cellWidth: 30 },
      3: { cellWidth: 15 },
      4: { cellWidth: 35 },
      5: { cellWidth: 22 },
      6: { cellWidth: 25 },
    },
    margin: { left: 15, right: 15 },
    didDrawPage: (data: { pageNumber: number }) => {
      // Add footer on each page
      const pageCount = doc.getNumberOfPages();
      addFooter(doc, data.pageNumber, pageCount);
    },
  });
  
  // Update page count on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }
  
  // Save the PDF
  doc.save(`students_directory_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Export payment history to PDF
 */
export function exportPaymentsToPDF(
  payments: Payment[],
  student?: { full_name: string; reg_number: string; email?: string; level?: string; department?: string }
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  const title = student ? 'Payment History' : 'All Payments Report';
  const subtitle = student ? `${student.full_name} (${student.reg_number})` : 'Complete Payment Records';
  let yPos = addHeader(doc, title, subtitle);
  
  // Calculate statistics
  const approvedPayments = payments.filter(p => p.status === 'approved');
  const pendingPayments = payments.filter(p => p.status === 'pending');
  
  const totalApproved = approvedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  
  // Stats boxes
  const boxWidth = (pageWidth - 50) / 4;
  addInfoBox(doc, 'Total Paid', `₦${totalApproved.toLocaleString()}`, 15, yPos, boxWidth);
  addInfoBox(doc, 'Pending', `₦${totalPending.toLocaleString()}`, 15 + boxWidth + 5, yPos, boxWidth);
  addInfoBox(doc, 'Approved', approvedPayments.length.toString(), 15 + (boxWidth + 5) * 2, yPos, boxWidth);
  addInfoBox(doc, 'Total Records', payments.length.toString(), 15 + (boxWidth + 5) * 3, yPos, boxWidth);
  
  yPos += 35;
  
  // Student info section if applicable
  if (student) {
    yPos = addSectionTitle(doc, 'Student Information', yPos, '👤');
    
    doc.setFont(STYLES.bodyFont, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.text);
    
    const infoLines = [
      `Name: ${student.full_name}`,
      `Reg Number: ${student.reg_number}`,
      `Email: ${student.email || 'N/A'}`,
      `Level: ${student.level || 'N/A'}`,
      `Department: ${student.department || 'N/A'}`,
    ];
    
    infoLines.forEach((line, i) => {
      doc.text(line, 20 + (i % 2) * 90, yPos + Math.floor(i / 2) * 8);
    });
    
    yPos += 25;
  }
  
  // Payments table
  yPos = addSectionTitle(doc, 'Payment Records', yPos, '💳');
  
  const tableData = payments.map((payment, index) => {
    const statusEmoji = payment.status === 'approved' ? '✓' : payment.status === 'pending' ? '⏳' : '✗';
    return [
      (index + 1).toString(),
      payment.payment_type?.title || 'N/A',
      `₦${Number(payment.amount || 0).toLocaleString()}`,
      payment.payment_method || 'N/A',
      `${statusEmoji} ${payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}`,
      new Date(payment.created_at).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      }),
      payment.transaction_ref?.slice(0, 15) || 'N/A',
    ];
  });
  
  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Payment Type', 'Amount', 'Method', 'Status', 'Date', 'Reference']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [255, 107, 53],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 51, 51],
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 35 },
      2: { cellWidth: 25 },
      3: { cellWidth: 22 },
      4: { cellWidth: 22 },
      5: { cellWidth: 28 },
      6: { cellWidth: 35 },
    },
    margin: { left: 15, right: 15 },
    didDrawPage: (data: { pageNumber: number }) => {
      const pageCount = doc.getNumberOfPages();
      addFooter(doc, data.pageNumber, pageCount);
    },
  });
  
  // Update footers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }
  
  const filename = student 
    ? `payment_history_${student.reg_number.replace('/', '-')}_${new Date().toISOString().split('T')[0]}.pdf`
    : `all_payments_${new Date().toISOString().split('T')[0]}.pdf`;
  
  doc.save(filename);
}

/**
 * Export expenses to PDF
 */
export function exportExpensesToPDF(
  expenses: Expense[],
  dateRange?: { from: string; to: string }
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  let yPos = addHeader(doc, 'Expense Report', 'Financial Expenditure Summary');
  
  // Calculate statistics
  const approvedExpenses = expenses.filter(e => e.status === 'approved');
  const pendingExpenses = expenses.filter(e => e.status === 'pending');
  
  const totalApproved = approvedExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  const totalPending = pendingExpenses.reduce((sum, e) => sum + Number(e.amount || 0), 0);
  
  // Stats boxes
  const boxWidth = (pageWidth - 50) / 4;
  addInfoBox(doc, 'Total Spent', `₦${totalApproved.toLocaleString()}`, 15, yPos, boxWidth);
  addInfoBox(doc, 'Pending', `₦${totalPending.toLocaleString()}`, 15 + boxWidth + 5, yPos, boxWidth);
  addInfoBox(doc, 'Approved', approvedExpenses.length.toString(), 15 + (boxWidth + 5) * 2, yPos, boxWidth);
  addInfoBox(doc, 'Total Records', expenses.length.toString(), 15 + (boxWidth + 5) * 3, yPos, boxWidth);
  
  yPos += 35;
  
  // Date range info
  if (dateRange) {
    doc.setFont(STYLES.bodyFont, 'italic');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.textLight);
    doc.text(`Date Range: ${dateRange.from} to ${dateRange.to}`, 20, yPos);
    yPos += 10;
  }
  
  // Category breakdown
  const byCategory = expenses.reduce((acc, e) => {
    if (e.status === 'approved') {
      acc[e.category] = (acc[e.category] || 0) + Number(e.amount || 0);
    }
    return acc;
  }, {} as Record<string, number>);
  
  if (Object.keys(byCategory).length > 0) {
    yPos = addSectionTitle(doc, 'Spending by Category', yPos, '📊');
    
    const categoryData = Object.entries(byCategory)
      .sort(([, a], [, b]) => b - a)
      .map(([category, amount]) => [
        category,
        `₦${amount.toLocaleString()}`,
        `${((amount / totalApproved) * 100).toFixed(1)}%`
      ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Category', 'Amount', 'Percentage']],
      body: categoryData,
      theme: 'grid',
      headStyles: {
        fillColor: [80, 200, 120],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [51, 51, 51],
      },
      columnStyles: {
        0: { cellWidth: 60 },
        1: { cellWidth: 50 },
        2: { cellWidth: 40 },
      },
      margin: { left: 15, right: 15 },
      tableWidth: 150,
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
  }
  
  // Expenses table
  yPos = addSectionTitle(doc, 'Expense Records', yPos, '📝');
  
  const tableData = expenses.map((expense, index) => {
    const statusEmoji = expense.status === 'approved' ? '✓' : expense.status === 'pending' ? '⏳' : '✗';
    return [
      (index + 1).toString(),
      expense.title,
      expense.category,
      `₦${Number(expense.amount || 0).toLocaleString()}`,
      `${statusEmoji} ${expense.status.charAt(0).toUpperCase() + expense.status.slice(1)}`,
      new Date(expense.created_at).toLocaleDateString('en-US', { 
        year: 'numeric', 
        month: 'short', 
        day: 'numeric' 
      }),
    ];
  });
  
  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Title', 'Category', 'Amount', 'Status', 'Date']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [255, 107, 53],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 51, 51],
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    margin: { left: 15, right: 15 },
    didDrawPage: (data: { pageNumber: number }) => {
      const pageCount = doc.getNumberOfPages();
      addFooter(doc, data.pageNumber, pageCount);
    },
  });
  
  // Update footers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }
  
  doc.save(`expense_report_${new Date().toISOString().split('T')[0]}.pdf`);
}

interface StudentPaymentData {
  id: string;
  student_name: string;
  reg_number: string;
  is_active: boolean;
  total_paid: number;
  payment_count: number;
  categories_paid: string[];
  payments: {
    id: string;
    amount: number;
    category: string;
    payment_type: string;
    transaction_ref: string;
    status: string;
    created_at: string;
  }[];
}

interface CollectedPaymentsExportData {
  students: StudentPaymentData[];
  totalCollected: number;
  totalExpenses: number;
  netBalance: number;
  totalStudentsPaid: number;
  totalStudentsUnpaid: number;
  categoriesBreakdown: {
    category: string;
    total_collected: number;
    total_expenses: number;
    net_balance: number;
    payment_count: number;
  }[];
  filters?: {
    category?: string;
    status?: string;
    payment?: string;
    search?: string;
  };
}

/**
 * Export collected payments with detailed student breakdown to PDF
 * Matches the CSV export detail level
 */
export function exportCollectedPaymentsToPDF(data: CollectedPaymentsExportData): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  let yPos = addHeader(doc, 'Payment Collection Report', 'Detailed Student Payment Breakdown');
  
  // Main stats boxes - 3 columns
  const boxWidth = (pageWidth - 45) / 3;
  addInfoBox(doc, 'Total Collected', `₦${data.totalCollected.toLocaleString()}`, 15, yPos, boxWidth);
  addInfoBox(doc, 'Total Expenses', `₦${data.totalExpenses.toLocaleString()}`, 15 + boxWidth + 5, yPos, boxWidth);
  addInfoBox(doc, 'Net Balance', `₦${data.netBalance.toLocaleString()}`, 15 + (boxWidth + 5) * 2, yPos, boxWidth);
  
  yPos += 35;
  
  // Secondary stats - Students breakdown
  addInfoBox(doc, 'Students Paid', data.totalStudentsPaid.toString(), 15, yPos, boxWidth);
  addInfoBox(doc, 'Students Unpaid', data.totalStudentsUnpaid.toString(), 15 + boxWidth + 5, yPos, boxWidth);
  addInfoBox(doc, 'Total Students', (data.totalStudentsPaid + data.totalStudentsUnpaid).toString(), 15 + (boxWidth + 5) * 2, yPos, boxWidth);
  
  yPos += 40;
  
  // Filter info if any applied
  if (data.filters) {
    const filterTexts: string[] = [];
    if (data.filters.category && data.filters.category !== 'all') {
      filterTexts.push(`Category: ${data.filters.category}`);
    }
    if (data.filters.status && data.filters.status !== 'all') {
      filterTexts.push(`Status: ${data.filters.status}`);
    }
    if (data.filters.payment && data.filters.payment !== 'all') {
      filterTexts.push(`Payment: ${data.filters.payment}`);
    }
    if (data.filters.search) {
      filterTexts.push(`Search: "${data.filters.search}"`);
    }
    
    if (filterTexts.length > 0) {
      doc.setFont(STYLES.bodyFont, 'italic');
      doc.setFontSize(9);
      doc.setTextColor(COLORS.textLight);
      doc.text(`Filters Applied: ${filterTexts.join(' | ')}`, 20, yPos);
      yPos += 12;
    }
  }
  
  // Category Breakdown Section
  if (data.categoriesBreakdown.length > 0) {
    yPos = addSectionTitle(doc, 'Category Breakdown', yPos, '📊');
    
    const categoryData = data.categoriesBreakdown.map(cat => [
      cat.category.replace(/_/g, ' '),
      `₦${cat.total_collected.toLocaleString()}`,
      `₦${cat.total_expenses.toLocaleString()}`,
      `₦${cat.net_balance.toLocaleString()}`,
      cat.payment_count.toString()
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Category', 'Collected', 'Expenses', 'Net Balance', 'Payments']],
      body: categoryData,
      theme: 'grid',
      headStyles: {
        fillColor: [80, 200, 120],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 51, 51],
      },
      columnStyles: {
        0: { cellWidth: 35 },
        1: { cellWidth: 30 },
        2: { cellWidth: 30 },
        3: { cellWidth: 30 },
        4: { cellWidth: 20 },
      },
      margin: { left: 15, right: 15 },
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
  }
  
  // Student Payment Details Section - This is the detailed breakdown like CSV
  yPos = addSectionTitle(doc, 'Student Payment Details', yPos, '👥');
  
  // Prepare student data for table (matching CSV columns)
  const studentTableData = data.students.map((student, index) => [
    (index + 1).toString(),
    student.student_name,
    student.reg_number,
    student.is_active ? '✓ Active' : '✗ Inactive',
    `₦${student.total_paid.toLocaleString()}`,
    student.payment_count.toString(),
    student.categories_paid.join('; ') || 'None'
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Student Name', 'Reg Number', 'Status', 'Total Paid', 'Payments', 'Categories']],
    body: studentTableData,
    theme: 'striped',
    headStyles: {
      fillColor: [255, 107, 53],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
    },
    bodyStyles: {
      fontSize: 7,
      textColor: [51, 51, 51],
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 40 },
      2: { cellWidth: 25 },
      3: { cellWidth: 18 },
      4: { cellWidth: 25 },
      5: { cellWidth: 18 },
      6: { cellWidth: 43 },
    },
    margin: { left: 15, right: 15 },
    didDrawPage: (tableData: { pageNumber: number }) => {
      const pageCount = doc.getNumberOfPages();
      addFooter(doc, tableData.pageNumber, pageCount);
    },
  });
  
  // Add detailed payment history for each student with payments (on new page if needed)
  const studentsWithPayments = data.students.filter(s => s.payments && s.payments.length > 0);
  
  if (studentsWithPayments.length > 0 && studentsWithPayments.length <= 20) {
    // Only add detailed breakdown if there aren't too many students
    doc.addPage();
    yPos = addHeader(doc, 'Detailed Payment History', 'Individual Student Transactions');
    
    for (const student of studentsWithPayments.slice(0, 10)) { // Limit to first 10 students for space
      // Check if we need a new page
      if (yPos > 250) {
        doc.addPage();
        yPos = addHeader(doc, 'Detailed Payment History (Continued)', 'Individual Student Transactions');
      }
      
      // Student header
      doc.setFont(STYLES.headerFont, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(COLORS.primary);
      doc.text(`${student.student_name} (${student.reg_number})`, 20, yPos);
      
      doc.setFont(STYLES.bodyFont, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(COLORS.textLight);
      doc.text(`Total: ₦${student.total_paid.toLocaleString()} | ${student.payment_count} payment(s)`, 20, yPos + 6);
      
      yPos += 12;
      
      // Payment details table for this student
      const paymentData = student.payments.slice(0, 5).map(p => [ // Limit to 5 most recent
        p.payment_type,
        p.category,
        `₦${p.amount.toLocaleString()}`,
        p.status.charAt(0).toUpperCase() + p.status.slice(1),
        new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
        p.transaction_ref?.slice(0, 12) || 'N/A'
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['Type', 'Category', 'Amount', 'Status', 'Date', 'Ref']],
        body: paymentData,
        theme: 'plain',
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: [100, 100, 100],
          fontStyle: 'bold',
          fontSize: 7,
        },
        bodyStyles: {
          fontSize: 7,
          textColor: [80, 80, 80],
        },
        columnStyles: {
          0: { cellWidth: 30 },
          1: { cellWidth: 25 },
          2: { cellWidth: 22 },
          3: { cellWidth: 18 },
          4: { cellWidth: 22 },
          5: { cellWidth: 25 },
        },
        margin: { left: 25, right: 15 },
        tableWidth: pageWidth - 45,
      });
      
      yPos = doc.lastAutoTable.finalY + 10;
    }
    
    if (studentsWithPayments.length > 10) {
      doc.setFont(STYLES.bodyFont, 'italic');
      doc.setFontSize(8);
      doc.setTextColor(COLORS.textLight);
      doc.text(`... and ${studentsWithPayments.length - 10} more students with payment history`, 20, yPos);
    }
  }
  
  // Update footers on all pages
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }
  
  doc.save(`student_payments_detailed_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Export financial summary to PDF
 */
export function exportFinancialSummaryToPDF(data: {
  totalCollected: number;
  totalExpenses: number;
  balance: number;
  studentsCount: number;
  paymentsCount: number;
  expensesCount: number;
  collectionsByType: Array<{ title: string; amount: number; count: number }>;
  expensesByCategory: Array<{ category: string; amount: number }>;
}): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  let yPos = addHeader(doc, 'Financial Summary', 'Class Fund Overview');
  
  // Main stats boxes
  const boxWidth = (pageWidth - 45) / 3;
  addInfoBox(doc, 'Total Collected', `₦${data.totalCollected.toLocaleString()}`, 15, yPos, boxWidth);
  addInfoBox(doc, 'Total Expenses', `₦${data.totalExpenses.toLocaleString()}`, 15 + boxWidth + 5, yPos, boxWidth);
  addInfoBox(doc, 'Balance', `₦${data.balance.toLocaleString()}`, 15 + (boxWidth + 5) * 2, yPos, boxWidth);
  
  yPos += 35;
  
  // Secondary stats
  addInfoBox(doc, 'Students', data.studentsCount.toString(), 15, yPos, boxWidth);
  addInfoBox(doc, 'Payments', data.paymentsCount.toString(), 15 + boxWidth + 5, yPos, boxWidth);
  addInfoBox(doc, 'Expenses', data.expensesCount.toString(), 15 + (boxWidth + 5) * 2, yPos, boxWidth);
  
  yPos += 40;
  
  // Collections by type
  if (data.collectionsByType.length > 0) {
    yPos = addSectionTitle(doc, 'Collections by Payment Type', yPos, '💰');
    
    const collectionsData = data.collectionsByType.map(item => [
      item.title,
      item.count.toString(),
      `₦${item.amount.toLocaleString()}`
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Payment Type', 'Count', 'Total Amount']],
      body: collectionsData,
      theme: 'grid',
      headStyles: {
        fillColor: [80, 200, 120],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      margin: { left: 15, right: 15 },
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
  }
  
  // Expenses by category
  if (data.expensesByCategory.length > 0) {
    yPos = addSectionTitle(doc, 'Expenses by Category', yPos, '📊');
    
    const expensesData = data.expensesByCategory.map(item => [
      item.category,
      `₦${item.amount.toLocaleString()}`,
      `${((item.amount / data.totalExpenses) * 100).toFixed(1)}%`
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Category', 'Amount', 'Percentage']],
      body: expensesData,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 107, 53],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
      },
      margin: { left: 15, right: 15 },
    });
  }
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }
  
  doc.save(`financial_summary_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Generate student payment receipt PDF
 */
export function generatePaymentReceiptPDF(payment: {
  id: string;
  amount: number;
  status: string;
  payment_method: string;
  transaction_ref: string;
  created_at: string;
  approved_at?: string;
  payment_type: { title: string; amount: number };
  student: { full_name: string; reg_number: string; email?: string; level?: string };
}): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Header with branding
  doc.setFillColor(COLORS.secondary);
  doc.rect(0, 0, pageWidth, 50, 'F');
  
  doc.setFillColor(COLORS.primary);
  doc.rect(0, 50, pageWidth, 5, 'F');
  
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(28);
  doc.setTextColor(COLORS.white);
  doc.text('PAYMENT RECEIPT', pageWidth / 2, 30, { align: 'center' });
  
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(COLORS.primary);
  doc.text('Class Dues Tracker - ECE Department', pageWidth / 2, 42, { align: 'center' });
  
  let yPos = 70;
  
  // Status badge
  const statusColor = payment.status === 'approved' ? COLORS.accent : 
                     payment.status === 'pending' ? COLORS.warning : COLORS.danger;
  
  doc.setFillColor(statusColor);
  doc.roundedRect(pageWidth / 2 - 30, yPos - 5, 60, 18, 5, 5, 'F');
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(12);
  doc.setTextColor(COLORS.white);
  doc.text(payment.status.toUpperCase(), pageWidth / 2, yPos + 6, { align: 'center' });
  
  yPos += 25;
  
  // Receipt details box
  doc.setFillColor(COLORS.background);
  doc.setDrawColor(COLORS.border);
  doc.roundedRect(20, yPos, pageWidth - 40, 120, 5, 5, 'FD');
  
  const leftCol = 30;
  const rightCol = pageWidth / 2 + 10;
  yPos += 15;
  
  const addDetail = (label: string, value: string, x: number, y: number) => {
    doc.setFont(STYLES.bodyFont, 'normal');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.textLight);
    doc.text(label, x, y);
    
    doc.setFont(STYLES.headerFont, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(COLORS.text);
    doc.text(value, x, y + 10);
  };
  
  addDetail('Receipt No.', `#${payment.id.slice(0, 8).toUpperCase()}`, leftCol, yPos);
  addDetail('Date', new Date(payment.created_at).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  }), rightCol, yPos);
  
  yPos += 30;
  
  addDetail('Student Name', payment.student.full_name, leftCol, yPos);
  addDetail('Reg. Number', payment.student.reg_number, rightCol, yPos);
  
  yPos += 30;
  
  addDetail('Payment Type', payment.payment_type.title, leftCol, yPos);
  addDetail('Payment Method', payment.payment_method, rightCol, yPos);
  
  yPos += 30;
  
  addDetail('Transaction Ref', payment.transaction_ref || 'N/A', leftCol, yPos);
  
  yPos += 45;
  
  // Amount box
  doc.setFillColor(COLORS.primary);
  doc.roundedRect(20, yPos, pageWidth - 40, 40, 5, 5, 'F');
  
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(10);
  doc.setTextColor(COLORS.white);
  doc.text('AMOUNT PAID', pageWidth / 2, yPos + 12, { align: 'center' });
  
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(24);
  doc.text(`₦${Number(payment.amount).toLocaleString()}`, pageWidth / 2, yPos + 30, { align: 'center' });
  
  yPos += 55;
  
  // Approval info if approved
  if (payment.status === 'approved' && payment.approved_at) {
    doc.setFont(STYLES.bodyFont, 'italic');
    doc.setFontSize(9);
    doc.setTextColor(COLORS.textLight);
    doc.text(`Approved on: ${new Date(payment.approved_at).toLocaleString()}`, pageWidth / 2, yPos, { align: 'center' });
    yPos += 15;
  }
  
  // Footer
  doc.setDrawColor(COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(20, pageHeight - 40, pageWidth - 20, pageHeight - 40);
  
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLORS.textLight);
  doc.text('This is an electronically generated receipt.', pageWidth / 2, pageHeight - 30, { align: 'center' });
  doc.text('For verification, please contact the class administration.', pageWidth / 2, pageHeight - 22, { align: 'center' });
  
  doc.save(`receipt_${payment.transaction_ref || payment.id.slice(0, 8)}.pdf`);
}

export default {
  exportStudentsToPDF,
  exportPaymentsToPDF,
  exportExpensesToPDF,
  exportFinancialSummaryToPDF,
  exportCollectedPaymentsToPDF,
  generatePaymentReceiptPDF,
};
