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

/**
 * Format currency with Naira symbol (for display)
 */
function formatNaira(amount: number): string {
  return `₦${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Format currency for PDF (uses NGN since jsPDF standard fonts don't support ₦)
 */
function formatNairaPDF(amount: number): string {
  return `NGN ${Number(amount).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;
}

/**
 * Capitalize category names (convert snake_case to Title Case)
 */
function formatCategory(category: string): string {
  return category.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

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
 * Creates a professional dark header with branding
 */
function addHeader(doc: jsPDF, title: string, subtitle?: string): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header background - dark theme
  doc.setFillColor(26, 14, 9); // Dark background matching app theme
  doc.rect(0, 0, pageWidth, 50, 'F');
  
  // Accent stripe - orange brand color
  doc.setFillColor(255, 107, 53);
  doc.rect(0, 50, pageWidth, 4, 'F');
  
  // Document Type Badge
  doc.setFillColor(255, 107, 53);
  doc.roundedRect(15, 8, 70, 12, 2, 2, 'F');
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(255, 255, 255);
  doc.text('OFFICIAL DOCUMENT', 50, 16, { align: 'center' });
  
  // Main Title
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(22);
  doc.setTextColor(255, 255, 255);
  doc.text(title, 15, 35);
  
  // Subtitle
  if (subtitle) {
    doc.setFont(STYLES.bodyFont, 'normal');
    doc.setFontSize(10);
    doc.setTextColor(255, 107, 53);
    doc.text(subtitle, 15, 45);
  }
  
  // App branding on right
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(11);
  doc.setTextColor(255, 255, 255);
  doc.text('Class Dues Tracker', pageWidth - 15, 18, { align: 'right' });
  
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('ECE Department', pageWidth - 15, 27, { align: 'right' });
  
  // Date/Time
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  })}`, pageWidth - 15, 36, { align: 'right' });
  
  // Document ID
  const docId = `DOC-${Date.now().toString(36).toUpperCase().slice(-8)}`;
  doc.setFontSize(7);
  doc.text(`ID: ${docId}`, pageWidth - 15, 44, { align: 'right' });
  
  return 62; // Return Y position after header
}

/**
 * Add footer to PDF with developer credit
 */
function addFooter(doc: jsPDF, pageNumber: number, totalPages: number): void {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  
  // Footer line
  doc.setDrawColor(COLORS.border);
  doc.setLineWidth(0.5);
  doc.line(20, pageHeight - 25, pageWidth - 20, pageHeight - 25);
  
  // Footer text
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(COLORS.textLight);
  
  doc.text('Class Dues Tracker - Official Document', 20, pageHeight - 17);
  doc.text(`Page ${pageNumber} of ${totalPages}`, pageWidth / 2, pageHeight - 17, { align: 'center' });
  doc.text('Confidential', pageWidth - 20, pageHeight - 17, { align: 'right' });
  
  // Developer credit
  doc.setFontSize(7);
  doc.text('Developed by Dev_Wishot | @wishotstudio', pageWidth / 2, pageHeight - 8, { align: 'center' });
}

/**
 * Add important notes section
 */
function addImportantNotes(doc: jsPDF, yPos: number, notes: string[]): number {
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Note box with warning background
  const boxHeight = 12 + (notes.length * 8);
  doc.setFillColor(254, 243, 199); // Light yellow/amber background
  doc.setDrawColor(252, 211, 77); // Amber border
  doc.roundedRect(15, yPos, pageWidth - 30, boxHeight, 4, 4, 'FD');
  
  // Warning icon and title
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(146, 64, 14); // Amber-800
  doc.text('⚠️ IMPORTANT INFORMATION', 22, yPos + 10);
  
  // Note lines
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(120, 53, 15); // Amber-900
  
  notes.forEach((note, index) => {
    doc.text(`• ${note}`, 22, yPos + 20 + (index * 8));
  });
  
  return yPos + boxHeight + 10;
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
 * Export payment history to PDF - Professional detailed layout
 */
export function exportPaymentsToPDF(
  payments: Payment[],
  student?: { full_name: string; reg_number: string; email?: string; level?: string; department?: string }
): void {
  const doc = new jsPDF();
  const pageWidth = doc.internal.pageSize.getWidth();
  
  // Header
  const title = student ? 'Official Payment Statement' : 'All Payments Report';
  const subtitle = student ? `${student.full_name} (${student.reg_number})` : 'Complete Payment Records';
  let yPos = addHeader(doc, title, subtitle);
  
  // Calculate statistics
  const approvedPayments = payments.filter(p => p.status === 'approved');
  const pendingPayments = payments.filter(p => p.status === 'pending');
  const rejectedPayments = payments.filter(p => p.status === 'rejected');
  
  const totalApproved = approvedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalPending = pendingPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  const totalRejected = rejectedPayments.reduce((sum, p) => sum + Number(p.amount || 0), 0);
  
  // Stats boxes - Row 1: Amounts
  const boxWidth = (pageWidth - 50) / 3;
  addInfoBox(doc, 'Net Amount Paid', formatNairaPDF(totalApproved), 15, yPos, boxWidth);
  addInfoBox(doc, 'Pending Amount', formatNairaPDF(totalPending), 15 + boxWidth + 5, yPos, boxWidth);
  addInfoBox(doc, 'Total Submitted', formatNairaPDF(totalApproved + totalPending + totalRejected), 15 + (boxWidth + 5) * 2, yPos, boxWidth);
  
  yPos += 32;
  
  // Stats boxes - Row 2: Counts
  addInfoBox(doc, 'Approved', `${approvedPayments.length} payments`, 15, yPos, boxWidth);
  addInfoBox(doc, 'Pending', `${pendingPayments.length} payments`, 15 + boxWidth + 5, yPos, boxWidth);
  addInfoBox(doc, 'Rejected', `${rejectedPayments.length} payments`, 15 + (boxWidth + 5) * 2, yPos, boxWidth);
  
  yPos += 35;
  
  // Student info section if applicable
  if (student) {
    yPos = addSectionTitle(doc, 'Student Information', yPos, '👤');
    
    // Student info box with grid layout
    doc.setFillColor(255, 255, 255);
    doc.setDrawColor(229, 231, 235);
    doc.roundedRect(15, yPos, pageWidth - 30, 35, 4, 4, 'FD');
    
    const addStudentField = (label: string, value: string, x: number, y: number) => {
      doc.setFont(STYLES.bodyFont, 'normal');
      doc.setFontSize(8);
      doc.setTextColor(COLORS.textLight);
      doc.text(label.toUpperCase(), x, y);
      
      doc.setFont(STYLES.headerFont, 'bold');
      doc.setFontSize(10);
      doc.setTextColor(COLORS.text);
      doc.text(value, x, y + 8);
    };
    
    const colWidth = (pageWidth - 50) / 3;
    addStudentField('Full Name', student.full_name, 22, yPos + 10);
    addStudentField('Reg Number', student.reg_number, 22 + colWidth, yPos + 10);
    addStudentField('Email', student.email || 'N/A', 22 + colWidth * 2, yPos + 10);
    addStudentField('Level', student.level || 'N/A', 22, yPos + 28);
    addStudentField('Department', student.department || 'N/A', 22 + colWidth, yPos + 28);
    addStudentField('Session', `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`, 22 + colWidth * 2, yPos + 28);
    
    yPos += 42;
  }
  
  // Payment Type Breakdown (like QuickPaymentSummary)
  const paymentsByType = payments.reduce((acc, p) => {
    if (p.status === 'approved' && p.payment_type) {
      const typeName = p.payment_type.title;
      if (!acc[typeName]) {
        acc[typeName] = { paid: 0, count: 0, expected: p.payment_type.amount || 0 };
      }
      acc[typeName].paid += Number(p.amount || 0);
      acc[typeName].count += 1;
    }
    return acc;
  }, {} as Record<string, { paid: number; count: number; expected: number }>);
  
  if (Object.keys(paymentsByType).length > 0) {
    yPos = addSectionTitle(doc, 'Payment Type Breakdown (Approved Only)', yPos, '📊');
    
    const typeData = Object.entries(paymentsByType).map(([type, data]) => {
      const difference = data.paid - data.expected;
      const status = data.paid >= data.expected ? '✓ COMPLETE' : '⚠ PARTIAL';
      return [
        type,
        data.count.toString(),
        formatNairaPDF(data.paid),
        formatNairaPDF(data.expected),
        formatNairaPDF(difference),
        status
      ];
    });
    
    autoTable(doc, {
      startY: yPos,
      head: [['Payment Type', 'Times Paid', 'Amount Paid', 'Expected', 'Difference', 'Status']],
      body: typeData,
      theme: 'grid',
      headStyles: {
        fillColor: [80, 200, 120],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 9,
        cellPadding: 3,
      },
      bodyStyles: {
        fontSize: 8,
        textColor: [51, 51, 51],
        cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 40, fontStyle: 'bold' },
        1: { cellWidth: 20, halign: 'center' },
        2: { cellWidth: 28, halign: 'right' },
        3: { cellWidth: 28, halign: 'right' },
        4: { cellWidth: 28, halign: 'right' },
        5: { cellWidth: 26, halign: 'center' },
      },
      margin: { left: 15, right: 15 },
    });
    
    yPos = doc.lastAutoTable.finalY + 10;
  }
  
  // Payments table - Transaction History
  yPos = addSectionTitle(doc, 'Complete Transaction History', yPos, '💳');
  
  const tableData = payments.map((payment, index) => {
    const statusEmoji = payment.status === 'approved' ? '✓' : payment.status === 'pending' ? '⏳' : '✗';
    return [
      (index + 1).toString(),
      new Date(payment.created_at).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric',
        year: '2-digit'
      }),
      payment.payment_type?.title || 'N/A',
      formatNairaPDF(Number(payment.amount || 0)),
      payment.payment_method || 'N/A',
      payment.transaction_ref?.slice(0, 12) || 'N/A',
      `${statusEmoji} ${payment.status.charAt(0).toUpperCase() + payment.status.slice(1)}`,
    ];
  });
  
  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Date', 'Payment Type', 'Amount (₦)', 'Method', 'Reference', 'Status']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [255, 107, 53],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 9,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 51, 51],
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 22 },
      2: { cellWidth: 38, fontStyle: 'bold' },
      3: { cellWidth: 26, halign: 'right' },
      4: { cellWidth: 22 },
      5: { cellWidth: 28 },
      6: { cellWidth: 24, halign: 'center' },
    },
    margin: { left: 15, right: 15 },
    didDrawPage: (data: { pageNumber: number }) => {
      const pageCount = doc.getNumberOfPages();
      addFooter(doc, data.pageNumber, pageCount);
    },
  });
  
  yPos = doc.lastAutoTable.finalY + 10;
  
  // Important Notes Section
  yPos = addImportantNotes(doc, yPos, [
    'Only APPROVED payments count toward your total class dues paid.',
    'PENDING payments are under admin review and do NOT yet count.',
    'REJECTED payments do NOT count and may need to be resubmitted.',
    'Keep this document for personal records and parent verification.'
  ]);
  
  // Update footers
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }
  
  const filename = student 
    ? `payment_statement_${student.reg_number.replace('/', '-')}_${new Date().toISOString().split('T')[0]}.pdf`
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
  addInfoBox(doc, 'Total Spent', formatNairaPDF(totalApproved), 15, yPos, boxWidth);
  addInfoBox(doc, 'Pending', formatNairaPDF(totalPending), 15 + boxWidth + 5, yPos, boxWidth);
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
        formatCategory(category),
        formatNairaPDF(amount),
        `${((amount / totalApproved) * 100).toFixed(1)}%`
      ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Category', 'Amount (₦)', 'Percentage']],
      body: categoryData,
      theme: 'grid',
      headStyles: {
        fillColor: [80, 200, 120],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [51, 51, 51],
        cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 60, fontStyle: 'bold' },
        1: { cellWidth: 50, halign: 'right' },
        2: { cellWidth: 40, halign: 'center' },
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
      formatCategory(expense.category),
      formatNairaPDF(Number(expense.amount || 0)),
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
    head: [['#', 'Title', 'Category', 'Amount (₦)', 'Status', 'Date']],
    body: tableData,
    theme: 'striped',
    headStyles: {
      fillColor: [255, 107, 53],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 9,
      textColor: [51, 51, 51],
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 10, halign: 'center' },
      1: { cellWidth: 45, fontStyle: 'bold' },
      2: { cellWidth: 35 },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 25, halign: 'center' },
      5: { cellWidth: 30 },
    },
    margin: { left: 15, right: 15 },
    didDrawPage: (data: { pageNumber: number }) => {
      const pageCount = doc.getNumberOfPages();
      addFooter(doc, data.pageNumber, pageCount);
    },
  });
  
  yPos = doc.lastAutoTable.finalY + 10;
  
  // Important Notes Section
  yPos = addImportantNotes(doc, yPos, [
    'Only APPROVED expenses are deducted from class funds.',
    'PENDING expenses are awaiting admin approval.',
    'All expenses must have receipts for proper documentation.',
    'Contact FinSec for any expense disputes or clarifications.'
  ]);
  
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
  addInfoBox(doc, 'Total Collected', formatNairaPDF(data.totalCollected), 15, yPos, boxWidth);
  addInfoBox(doc, 'Total Expenses', formatNairaPDF(data.totalExpenses), 15 + boxWidth + 5, yPos, boxWidth);
  addInfoBox(doc, 'Net Balance', formatNairaPDF(data.netBalance), 15 + (boxWidth + 5) * 2, yPos, boxWidth);
  
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
      formatCategory(cat.category),
      formatNairaPDF(cat.total_collected),
      formatNairaPDF(cat.total_expenses),
      formatNairaPDF(cat.net_balance),
      cat.payment_count.toString()
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Category', 'Collected (₦)', 'Expenses (₦)', 'Net Balance (₦)', 'Payments']],
      body: categoryData,
      theme: 'grid',
      headStyles: {
        fillColor: [80, 200, 120],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [51, 51, 51],
        cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 38, fontStyle: 'bold' },
        1: { cellWidth: 32, halign: 'right' },
        2: { cellWidth: 32, halign: 'right' },
        3: { cellWidth: 32, halign: 'right' },
        4: { cellWidth: 22, halign: 'center' },
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
    formatNairaPDF(student.total_paid),
    student.payment_count.toString(),
    student.categories_paid.join('; ') || 'None'
  ]);
  
  autoTable(doc, {
    startY: yPos,
    head: [['#', 'Student Name', 'Reg Number', 'Status', 'Total Paid (₦)', 'Payments', 'Categories']],
    body: studentTableData,
    theme: 'striped',
    headStyles: {
      fillColor: [255, 107, 53],
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      fontSize: 10,
      cellPadding: 4,
    },
    bodyStyles: {
      fontSize: 8,
      textColor: [51, 51, 51],
      cellPadding: 3,
    },
    alternateRowStyles: {
      fillColor: [249, 250, 251],
    },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      1: { cellWidth: 40, fontStyle: 'bold' },
      2: { cellWidth: 25 },
      3: { cellWidth: 18, halign: 'center' },
      4: { cellWidth: 28, halign: 'right' },
      5: { cellWidth: 18, halign: 'center' },
      6: { cellWidth: 40 },
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
      doc.setFontSize(11);
      doc.setTextColor(COLORS.primary);
      doc.text(`${student.student_name} (${student.reg_number})`, 20, yPos);
      
      doc.setFont(STYLES.bodyFont, 'normal');
      doc.setFontSize(9);
      doc.setTextColor(COLORS.textLight);
      doc.text(`Total: ${formatNaira(student.total_paid)} | ${student.payment_count} payment(s)`, 20, yPos + 6);
      
      yPos += 12;
      
      // Payment details table for this student
      const paymentData = student.payments.slice(0, 5).map(p => [ // Limit to 5 most recent
        p.payment_type,
        formatCategory(p.category),
        formatNaira(p.amount),
        p.status.charAt(0).toUpperCase() + p.status.slice(1),
        new Date(p.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: '2-digit' }),
        p.transaction_ref?.slice(0, 12) || 'N/A'
      ]);
      
      autoTable(doc, {
        startY: yPos,
        head: [['Type', 'Category', 'Amount (₦)', 'Status', 'Date', 'Ref']],
        body: paymentData,
        theme: 'plain',
        headStyles: {
          fillColor: [240, 240, 240],
          textColor: [100, 100, 100],
          fontStyle: 'bold',
          fontSize: 8,
          cellPadding: 3,
        },
        bodyStyles: {
          fontSize: 8,
          textColor: [80, 80, 80],
          cellPadding: 2,
        },
        columnStyles: {
          0: { cellWidth: 32, fontStyle: 'bold' },
          1: { cellWidth: 28 },
          2: { cellWidth: 24, halign: 'right' },
          3: { cellWidth: 18, halign: 'center' },
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
      yPos += 10;
    }
  }
  
  // Important Notes Section - Add on first page
  doc.setPage(1);
  const firstPageY = doc.lastAutoTable?.finalY ? doc.lastAutoTable.finalY + 10 : 250;
  if (firstPageY < 260) {
    addImportantNotes(doc, firstPageY, [
      'Net Balance = Total Collected - Total Expenses',
      'Only APPROVED payments are counted in collected totals.',
      'This report can be used for financial auditing purposes.',
      'Contact FinSec for any discrepancies or questions.'
    ]);
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
  addInfoBox(doc, 'Total Collected', formatNaira(data.totalCollected), 15, yPos, boxWidth);
  addInfoBox(doc, 'Total Expenses', formatNaira(data.totalExpenses), 15 + boxWidth + 5, yPos, boxWidth);
  addInfoBox(doc, 'Balance', formatNaira(data.balance), 15 + (boxWidth + 5) * 2, yPos, boxWidth);
  
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
      formatNaira(item.amount)
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Payment Type', 'Count', 'Total Amount (₦)']],
      body: collectionsData,
      theme: 'grid',
      headStyles: {
        fillColor: [80, 200, 120],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [51, 51, 51],
        cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: 'bold' },
        1: { cellWidth: 30, halign: 'center' },
        2: { cellWidth: 50, halign: 'right' },
      },
      margin: { left: 15, right: 15 },
    });
    
    yPos = doc.lastAutoTable.finalY + 15;
  }
  
  // Expenses by category
  if (data.expensesByCategory.length > 0) {
    yPos = addSectionTitle(doc, 'Expenses by Category', yPos, '📊');
    
    const expensesData = data.expensesByCategory.map(item => [
      formatCategory(item.category),
      formatNaira(item.amount),
      `${((item.amount / data.totalExpenses) * 100).toFixed(1)}%`
    ]);
    
    autoTable(doc, {
      startY: yPos,
      head: [['Category', 'Amount (₦)', 'Percentage']],
      body: expensesData,
      theme: 'grid',
      headStyles: {
        fillColor: [255, 107, 53],
        textColor: [255, 255, 255],
        fontStyle: 'bold',
        fontSize: 10,
        cellPadding: 4,
      },
      bodyStyles: {
        fontSize: 9,
        textColor: [51, 51, 51],
        cellPadding: 3,
      },
      columnStyles: {
        0: { cellWidth: 70, fontStyle: 'bold' },
        1: { cellWidth: 50, halign: 'right' },
        2: { cellWidth: 40, halign: 'center' },
      },
      margin: { left: 15, right: 15 },
    });
    
    yPos = doc.lastAutoTable.finalY + 10;
  }
  
  // Important Notes Section
  yPos = addImportantNotes(doc, yPos, [
    'Balance = Total Collected - Total Expenses',
    'All amounts shown are from APPROVED transactions only.',
    'This summary is for financial planning and auditing purposes.',
    'Contact class administration for detailed transaction records.'
  ]);
  
  // Footer
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    addFooter(doc, i, pageCount);
  }
  
  doc.save(`financial_summary_${new Date().toISOString().split('T')[0]}.pdf`);
}

/**
 * Generate professional payment receipt PDF
 * Matches the well-formatted style of other exports with dark header and proper sections
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
  const margin = 15;
  const contentWidth = pageWidth - (margin * 2);
  
  const isWaived = payment.transaction_ref?.startsWith('WAIVED-');
  const isApproved = payment.status === 'approved';
  const isPending = payment.status === 'pending';
  
  // Status configuration
  const statusConfig = isWaived 
    ? { color: [99, 102, 241], label: 'WAIVED', icon: '✓' }
    : isApproved 
      ? { color: [34, 197, 94], label: 'APPROVED', icon: '✓' }
      : isPending 
        ? { color: [245, 158, 11], label: 'PENDING', icon: '⏳' }
        : { color: [239, 68, 68], label: 'REJECTED', icon: '✗' };

  // ═══════════════════════════════════════════════════════════════
  // HEADER - Professional dark header with branding
  // ═══════════════════════════════════════════════════════════════
  
  // Header background
  doc.setFillColor(26, 14, 9);
  doc.rect(0, 0, pageWidth, 55, 'F');
  
  // Orange accent stripe
  doc.setFillColor(255, 107, 53);
  doc.rect(0, 55, pageWidth, 4, 'F');
  
  // Official Receipt badge
  doc.setFillColor(255, 107, 53);
  doc.roundedRect(margin, 10, 80, 14, 3, 3, 'F');
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('OFFICIAL RECEIPT', margin + 40, 19, { align: 'center' });
  
  // Main title
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(20);
  doc.setTextColor(255, 255, 255);
  doc.text('PAYMENT RECEIPT', margin, 42);
  
  // ECE subtitle
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(255, 107, 53);
  doc.text('Class Dues Tracker • ECE Department', margin, 50);
  
  // Right side - Receipt ID
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Receipt No.', pageWidth - margin, 15, { align: 'right' });
  
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text(`#${payment.id.slice(0, 8).toUpperCase()}`, pageWidth - margin, 28, { align: 'right' });
  
  // Date generated
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text(new Date(payment.created_at).toLocaleDateString('en-NG', {
    year: 'numeric', month: 'long', day: 'numeric'
  }), pageWidth - margin, 40, { align: 'right' });

  let yPos = 70;

  // ═══════════════════════════════════════════════════════════════
  // STATUS & AMOUNT BOXES - Side by side
  // ═══════════════════════════════════════════════════════════════
  
  const boxWidth = (contentWidth - 10) / 2;
  
  // Status Box
  doc.setFillColor(statusConfig.color[0], statusConfig.color[1], statusConfig.color[2]);
  doc.roundedRect(margin, yPos, boxWidth, 50, 5, 5, 'F');
  
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text('PAYMENT STATUS', margin + boxWidth / 2, yPos + 15, { align: 'center' });
  
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(18);
  doc.text(`${statusConfig.icon} ${statusConfig.label}`, margin + boxWidth / 2, yPos + 35, { align: 'center' });
  
  // Amount Box
  doc.setFillColor(255, 107, 53);
  doc.roundedRect(margin + boxWidth + 10, yPos, boxWidth, 50, 5, 5, 'F');
  
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(9);
  doc.setTextColor(255, 255, 255);
  doc.text(isWaived ? 'AMOUNT WAIVED' : 'AMOUNT PAID', margin + boxWidth + 10 + boxWidth / 2, yPos + 15, { align: 'center' });
  
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(18);
  doc.text(formatNairaPDF(payment.amount), margin + boxWidth + 10 + boxWidth / 2, yPos + 35, { align: 'center' });

  yPos += 60;

  // ═══════════════════════════════════════════════════════════════
  // STUDENT INFORMATION SECTION
  // ═══════════════════════════════════════════════════════════════
  
  const colWidth = contentWidth / 2;
  
  // Helper to add field
  const addField = (label: string, value: string, x: number, y: number) => {
    doc.setFont(STYLES.bodyFont, 'normal');
    doc.setFontSize(8);
    doc.setTextColor(COLORS.textLight);
    doc.text(label, x, y);
    
    doc.setFont(STYLES.headerFont, 'bold');
    doc.setFontSize(10);
    doc.setTextColor(COLORS.text);
    const lines = doc.splitTextToSize(value || 'N/A', colWidth - 15);
    doc.text(lines[0], x, y + 8);
  };
  
  // Section header with orange accent bar and curved left accent
  // Draw orange accent (curved) at the left
  doc.setFillColor(255, 107, 53);
  doc.roundedRect(margin, yPos, 18, 38, 10, 10, 'F');
  // Section header bar
  doc.setFillColor(255, 107, 53);
  doc.roundedRect(margin, yPos, contentWidth, 16, 3, 3, 'F');
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('STUDENT INFORMATION', margin + 28, yPos + 11);

  yPos += 20;

  // Student details box (overlapping the accent)
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(229, 231, 235);
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, yPos, contentWidth, 38, 4, 4, 'FD');

  // Watermark inside student details box (light grey, drawn before fields so fields overlay it)
  const wmX = margin + contentWidth / 2;
  const wmY = yPos + 22;
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(30);
  doc.setTextColor(240, 240, 240);
  doc.text('Class Dues Tracker By Wishot', wmX, wmY, { align: 'center', angle: -9 });

  addField('Full Name', payment.student.full_name, margin + 28, yPos + 10);
  addField('Reg. Number', payment.student.reg_number, margin + colWidth + 5, yPos + 10);
  addField('Email', payment.student.email || 'Not provided', margin + 28, yPos + 26);
  addField('Level', payment.student.level || 'Not specified', margin + colWidth + 5, yPos + 26);

  yPos += 46;

  // ═══════════════════════════════════════════════════════════════
  // PAYMENT DETAILS SECTION
  // ═══════════════════════════════════════════════════════════════
  
  // Section header with orange accent bar
  doc.setFillColor(255, 107, 53);
  doc.roundedRect(margin, yPos, contentWidth, 16, 3, 3, 'F');
  doc.setFont(STYLES.headerFont, 'bold');
  doc.setFontSize(10);
  doc.setTextColor(255, 255, 255);
  doc.text('PAYMENT DETAILS', margin + 10, yPos + 11);
  
  yPos += 20;
  
  // Payment details box
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(229, 231, 235);
  doc.roundedRect(margin, yPos, contentWidth, 54, 4, 4, 'FD');
  
  addField('Payment Type', payment.payment_type.title, margin + 8, yPos + 10);
  addField('Target Amount', formatNairaPDF(payment.payment_type.amount), margin + colWidth + 5, yPos + 10);
  addField('Payment Method', payment.payment_method || 'Bank Transfer', margin + 8, yPos + 26);
  addField('Transaction Ref', (payment.transaction_ref || 'N/A').slice(0, 20), margin + colWidth + 5, yPos + 26);
  addField('Submitted On', new Date(payment.created_at).toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  }), margin + 8, yPos + 42);
  
  if (payment.approved_at) {
    addField(isWaived ? 'Waived On' : 'Approved On', new Date(payment.approved_at).toLocaleString('en-NG', {
      year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
    }), margin + colWidth + 5, yPos + 42);
  }

  yPos += 62;

  // ═══════════════════════════════════════════════════════════════
  // VERIFICATION SECTION
  // ═══════════════════════════════════════════════════════════════
  
  doc.setFillColor(26, 14, 9);
  doc.roundedRect(margin, yPos, contentWidth, 35, 4, 4, 'F');
  
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('VERIFICATION CODE', margin + 10, yPos + 12);
  
  doc.setFont('courier', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 107, 53);
  doc.text(`CDT-${payment.id.slice(0, 12).toUpperCase()}`, margin + 10, yPos + 24);
  
  // Valid/Waived stamp
  if (isApproved || isWaived) {
    const stampColor = isWaived ? statusConfig.color : [34, 197, 94];
    doc.setFillColor(stampColor[0], stampColor[1], stampColor[2]);
    doc.roundedRect(pageWidth - margin - 50, yPos + 6, 45, 22, 4, 4, 'F');
    
    doc.setFont(STYLES.headerFont, 'bold');
    doc.setFontSize(9);
    doc.setTextColor(255, 255, 255);
    doc.text(isWaived ? 'WAIVED' : 'VALID', pageWidth - margin - 27.5, yPos + 20, { align: 'center' });
  }

  yPos += 45;

  // ═══════════════════════════════════════════════════════════════
  // FOOTER NOTES
  // ═══════════════════════════════════════════════════════════════
  
  // Footer notes
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(COLORS.textLight);
  doc.text('This is an electronically generated receipt. No signature required.', pageWidth / 2, yPos, { align: 'center' });
  doc.text('For verification, contact your class administration with the code above.', pageWidth / 2, yPos + 8, { align: 'center' });
  
  // ═══════════════════════════════════════════════════════════════
  // BOTTOM BRANDING BAR
  // ═══════════════════════════════════════════════════════════════
  
  doc.setFillColor(26, 14, 9);
  doc.rect(0, pageHeight - 18, pageWidth, 18, 'F');
  
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(7);
  doc.setTextColor(150, 150, 150);
  doc.text('Class Dues Tracker', margin, pageHeight - 7);
  
  doc.setTextColor(255, 107, 53);
  doc.text('Developed by Dev_Wishot | @wishotstudio', pageWidth / 2, pageHeight - 7, { align: 'center' });
  
  doc.setTextColor(150, 150, 150);
  doc.text('Official Document', pageWidth - margin, pageHeight - 7, { align: 'right' });
  
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
