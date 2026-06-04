/**
 * PDF Export Utility
 * Provides professional PDF generation for various data exports in Payvexo
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
  member_id: string;
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
  doc.text('Payvexo', pageWidth - 15, 18, { align: 'right' });
  
  doc.setFont(STYLES.bodyFont, 'normal');
  doc.setFontSize(8);
  doc.setTextColor(150, 150, 150);
  doc.text('Payvexo', pageWidth - 15, 27, { align: 'right' });
  
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
  
  doc.text('Payvexo - Official Document', 20, pageHeight - 17);
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
    'Only APPROVED payments count toward your total dues paid.',
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
 * Generate professional payment receipt — World-class HTML receipt
 * Matches the premium QuickPaymentSummary design language:
 * Inter font, accent-bar gradient, watermark, document-style layout,
 * 3-column info grid, QR verification, signature line.
 *
 * Opens in a print window for perfect rendering (supports ₦, custom fonts, etc.)
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
  const isWaived = payment.transaction_ref?.startsWith('WAIVED-');
  const isApproved = payment.status === 'approved';
  const isPending = payment.status === 'pending';

  // Deterministic receipt reference
  const docRef = (() => {
    const raw = payment.id + '-' + payment.amount + '-' + payment.status;
    let hash = 0;
    for (let i = 0; i < raw.length; i++) {
      hash = ((hash << 5) - hash) + raw.charCodeAt(i);
      hash |= 0;
    }
    return 'PVX-' + Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  })();

  const statusCfg = isWaived
    ? { bg: '#6366f1', light: '#eef2ff', text: '#4338ca', label: 'WAIVED', dot: '#6366f1' }
    : isApproved
      ? { bg: '#059669', light: '#ecfdf5', text: '#065f46', label: 'APPROVED', dot: '#059669' }
      : isPending
        ? { bg: '#d97706', light: '#fffbeb', text: '#92400e', label: 'PENDING', dot: '#d97706' }
        : { bg: '#dc2626', light: '#fef2f2', text: '#991b1b', label: 'REJECTED', dot: '#dc2626' };

  const fmtDate = (d: string, opts?: Intl.DateTimeFormatOptions) =>
    new Date(d).toLocaleDateString('en-US', opts || { year: 'numeric', month: 'long', day: 'numeric' });
  const fmtDateTime = (d: string) =>
    new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  const fmtCurrency = (n: number) => `₦${Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 })}`;

  // Pseudo-QR pattern (deterministic from payment.id)
  const qrSeed = payment.id.replace(/-/g, '');
  const qrCells = Array.from({ length: 49 }, (_, i) => {
    const row = Math.floor(i / 7), col = i % 7;
    if (row < 2 || col < 2 || row > 4 || col > 4) {
      return qrSeed.charCodeAt(i % qrSeed.length) % 3 !== 0 ? 'f' : 'e';
    }
    return (row + col) % 2 === 0 ? 'f' : 'e';
  });

  const logoSVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40" width="40" height="40">
    <defs>
      <linearGradient id="lgP" x1="0" y1="0" x2="1" y2="1"><stop offset="0%" stop-color="#FF6803"/><stop offset="100%" stop-color="#FFAC5F"/></linearGradient>
    </defs>
    <rect width="40" height="40" rx="10" fill="#0F0703"/>
    <rect x="8" y="22" width="6" height="11" rx="2.5" fill="url(#lgP)"/>
    <rect x="17" y="14" width="6" height="19" rx="2.5" fill="url(#lgP)"/>
    <rect x="26" y="8" width="6" height="25" rx="2.5" fill="url(#lgP)"/>
    <path d="M6 35 Q20 28 34 35" stroke="#30FFAC" stroke-width="2" fill="none" stroke-linecap="round" opacity="0.9"/>
  </svg>`;

  // SVG inline icons for PDF sections (no emoji dependency)
  const userIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#FF6803" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>`;
  const cardIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="20" height="14" x="2" y="5" rx="2"/><line x1="2" x2="22" y1="10" y2="10"/></svg>`;
  const printIconSVG = `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect width="12" height="8" x="6" y="14"/></svg>`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Receipt - ${payment.student.full_name}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    :root {
      --amber: #FF6803; --amber-light: #FFAC5F; --amber-dark: #CC5202;
      --mint: #30FFAC; --charcoal: #0F0703;
      --slate-900: #0f172a; --slate-700: #334155; --slate-500: #64748b;
      --slate-300: #cbd5e1; --slate-100: #f1f5f9; --slate-50: #f8fafc;
    }
    body {
      font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: var(--slate-900); background: var(--slate-100);
      line-height: 1.6; -webkit-font-smoothing: antialiased;
    }
    .page {
      max-width: 720px; margin: 24px auto; background: white;
      border-radius: 2px; position: relative; overflow: hidden;
      box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 20px 60px rgba(0,0,0,0.06);
    }
    .watermark {
      position: absolute; top: 50%; left: 50%;
      transform: translate(-50%, -50%) rotate(-35deg);
      font-size: 72px; font-weight: 800; letter-spacing: 14px;
      color: rgba(255, 104, 3, 0.02); white-space: nowrap;
      pointer-events: none; z-index: 0;
    }
    .accent-bar { height: 4px; background: linear-gradient(90deg, var(--amber) 0%, var(--amber-light) 50%, var(--mint) 100%); }
    .header {
      padding: 28px 36px 22px; display: flex;
      justify-content: space-between; align-items: flex-start;
      position: relative; z-index: 1;
    }
    .header-left { display: flex; align-items: center; gap: 14px; }
    .brand-name { font-size: 18px; font-weight: 800; color: var(--charcoal); letter-spacing: -0.5px; }
    .brand-name span { color: var(--amber); }
    .brand-tagline { font-size: 9px; color: var(--slate-500); text-transform: uppercase; letter-spacing: 2.5px; margin-top: 1px; }
    .header-right { text-align: right; }
    .doc-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: var(--amber); margin-bottom: 6px; }
    .doc-meta { font-size: 10px; color: var(--slate-500); line-height: 1.9; }
    .doc-meta strong { color: var(--slate-700); font-weight: 600; }
    .divider { height: 1px; background: linear-gradient(90deg, transparent 0%, var(--slate-300) 15%, var(--slate-300) 85%, transparent 100%); margin: 0 36px; }
    .body { padding: 24px 36px 28px; position: relative; z-index: 1; }
    .section { margin-bottom: 22px; }
    .section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
    .section-icon { width: 26px; height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; font-size: 13px; }
    .section-icon.amber { background: rgba(255, 104, 3, 0.08); }
    .section-icon.blue { background: rgba(59, 130, 246, 0.08); }
    .section-icon.green { background: rgba(5, 150, 105, 0.08); }
    .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--slate-700); }
    .section-line { flex: 1; height: 1px; background: var(--slate-300); }

    /* Status + Amount Hero */
    .hero-row { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 22px; }
    .hero-card {
      border-radius: 10px; padding: 20px; text-align: center;
      position: relative; overflow: hidden;
    }
    .hero-card::after {
      content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px;
    }
    .hero-card.status { background: ${statusCfg.light}; }
    .hero-card.status::after { background: ${statusCfg.bg}; }
    .hero-card.amount { background: linear-gradient(135deg, var(--amber), var(--amber-light)); }
    .hero-card.amount::after { background: var(--amber-dark); }
    .hero-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; }
    .hero-card.status .hero-label { color: ${statusCfg.text}; }
    .hero-card.amount .hero-label { color: rgba(255,255,255,0.8); }
    .hero-value { font-size: 26px; font-weight: 800; line-height: 1.2; }
    .hero-card.status .hero-value { color: ${statusCfg.bg}; }
    .hero-card.amount .hero-value { color: white; }
    .status-dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; background: ${statusCfg.dot}; margin-right: 6px; vertical-align: middle; }

    /* Info Grid */
    .info-grid {
      display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
      border: 1px solid var(--slate-300); border-radius: 8px; overflow: hidden;
    }
    .info-cell { padding: 11px 14px; border-bottom: 1px solid var(--slate-300); border-right: 1px solid var(--slate-300); }
    .info-cell:nth-child(3n) { border-right: none; }
    .info-cell:nth-last-child(-n+3) { border-bottom: none; }
    .info-label { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--slate-500); margin-bottom: 3px; }
    .info-value { font-size: 12px; font-weight: 600; color: var(--slate-900); word-break: break-word; }
    .info-value.mono { font-family: 'Courier New', monospace; font-size: 11px; }
    .info-value.amber { color: var(--amber); }

    /* Payment Summary Table */
    .pay-table { width: 100%; border: 1px solid var(--slate-300); border-radius: 8px; overflow: hidden; border-collapse: collapse; }
    .pay-table thead th {
      background: var(--slate-900); color: white; padding: 9px 12px;
      text-align: left; font-weight: 600; font-size: 9px;
      text-transform: uppercase; letter-spacing: 0.8px;
    }
    .pay-table tbody td { padding: 10px 12px; border-bottom: 1px solid var(--slate-100); color: var(--slate-700); font-size: 12px; }
    .pay-table tbody tr:last-child td { border-bottom: none; }
    .pay-table .td-amount { font-weight: 700; color: var(--slate-900); font-variant-numeric: tabular-nums; }
    .pay-table .td-mono { font-family: 'Courier New', monospace; font-size: 10px; color: var(--slate-500); }
    .pay-table .badge {
      display: inline-flex; align-items: center; gap: 4px;
      padding: 2px 8px; border-radius: 20px; font-size: 9px; font-weight: 600;
    }
    .pay-table .badge::before { content: ''; width: 5px; height: 5px; border-radius: 50%; }
    .badge.approved { background: #ecfdf5; color: #065f46; }
    .badge.approved::before { background: #059669; }
    .badge.pending { background: #fffbeb; color: #92400e; }
    .badge.pending::before { background: #d97706; }
    .badge.rejected { background: #fef2f2; color: #991b1b; }
    .badge.rejected::before { background: #dc2626; }
    .badge.waived { background: #eef2ff; color: #4338ca; }
    .badge.waived::before { background: #6366f1; }

    /* Amount strip */
    .amount-strip {
      display: flex; justify-content: space-between; align-items: center;
      background: linear-gradient(135deg, var(--amber) 0%, var(--amber-light) 100%);
      border-radius: 8px; padding: 14px 18px; margin-top: 12px;
    }
    .amount-strip-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.85); text-transform: uppercase; letter-spacing: 1px; }
    .amount-strip-value { font-size: 24px; font-weight: 800; color: white; }

    /* Verification */
    .verification {
      margin-top: 24px; padding-top: 18px;
      border-top: 2px dashed var(--slate-300);
      display: flex; justify-content: space-between; align-items: flex-end;
    }
    .verification-left { display: flex; gap: 12px; align-items: center; }
    .qr-box {
      width: 52px; height: 52px; border: 2px solid var(--slate-300); border-radius: 5px;
      display: grid; grid-template-columns: repeat(7, 1fr); grid-template-rows: repeat(7, 1fr);
      gap: 0; padding: 3px; overflow: hidden;
    }
    .qr-cell { border-radius: 0; }
    .qr-cell.f { background: var(--slate-900); }
    .qr-cell.e { background: transparent; }
    .verify-text { font-size: 9px; color: var(--slate-500); line-height: 1.9; }
    .verify-text strong { color: var(--slate-700); font-weight: 600; }
    .verify-code {
      font-family: 'Courier New', monospace; font-size: 10px;
      background: var(--slate-100); padding: 1px 5px; border-radius: 3px;
      color: var(--amber); font-weight: 700; letter-spacing: 1px;
    }
    .sig-block { text-align: center; width: 170px; }
    .sig-line { border-top: 1px solid var(--slate-400); margin-bottom: 5px; margin-top: 36px; }
    .sig-name { font-size: 9px; color: var(--slate-500); text-transform: uppercase; letter-spacing: 1px; }

    /* Footer */
    .footer {
      background: var(--slate-50); border-top: 1px solid var(--slate-300);
      padding: 14px 36px; display: flex;
      justify-content: space-between; align-items: center;
      position: relative; z-index: 1;
    }
    .footer-brand { display: flex; align-items: center; gap: 8px; }
    .footer-info { font-size: 9px; color: var(--slate-500); line-height: 1.6; }
    .footer-info strong { color: var(--amber); font-weight: 700; }
    .footer-right { text-align: right; font-size: 8px; color: var(--slate-500); line-height: 1.8; }

    /* Print Button */
    .print-actions { max-width: 720px; margin: 16px auto 32px; display: flex; justify-content: center; }
    .btn-print {
      padding: 12px 32px; border: none; border-radius: 8px; cursor: pointer;
      font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif;
      display: flex; align-items: center; gap: 8px; transition: all 0.2s;
      background: linear-gradient(135deg, var(--amber) 0%, var(--amber-light) 100%);
      color: white; box-shadow: 0 4px 14px rgba(255, 104, 3, 0.3);
    }
    .btn-print:hover { transform: translateY(-1px); box-shadow: 0 6px 20px rgba(255, 104, 3, 0.4); }
    @media print {
      body { background: white; }
      .page { margin: 0; box-shadow: none; border-radius: 0; }
      .no-print { display: none !important; }
      .watermark { color: rgba(255, 104, 3, 0.015); }
    }
    @media (max-width: 640px) {
      .header { padding: 20px; flex-direction: column; gap: 14px; }
      .header-right { text-align: left; }
      .body { padding: 16px; }
      .footer { padding: 12px 16px; flex-direction: column; gap: 8px; text-align: center; }
      .footer-right { text-align: center; }
      .info-grid { grid-template-columns: repeat(2, 1fr); }
      .info-cell:nth-child(2n) { border-right: none; }
      .info-cell:nth-child(3n) { border-right: 1px solid var(--slate-300); }
      .hero-row { grid-template-columns: 1fr; }
      .divider { margin: 0 16px; }
      .verification { flex-direction: column; align-items: flex-start; gap: 16px; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="watermark">PAYVEXO</div>
    <div class="accent-bar"></div>

    <!-- HEADER -->
    <div class="header">
      <div class="header-left">
        ${logoSVG}
        <div>
          <div class="brand-name">Pay<span>vexo</span></div>
          <div class="brand-tagline">Secure Payment Platform</div>
        </div>
      </div>
      <div class="header-right">
        <div class="doc-title">Official Receipt</div>
        <div class="doc-meta">
          <strong>Date:</strong> ${fmtDate(payment.created_at)}<br>
          <strong>Ref:</strong> ${docRef}<br>
          <strong>ID:</strong> #${payment.id.slice(0, 8).toUpperCase()}
        </div>
      </div>
    </div>
    <div class="divider"></div>

    <div class="body">
      <!-- STATUS + AMOUNT HERO -->
      <div class="hero-row">
        <div class="hero-card status">
          <div class="hero-label">Payment Status</div>
          <div class="hero-value"><span class="status-dot"></span>${statusCfg.label}</div>
        </div>
        <div class="hero-card amount">
          <div class="hero-label">${isWaived ? 'Amount Waived' : 'Amount Paid'}</div>
          <div class="hero-value">${fmtCurrency(payment.amount)}</div>
        </div>
      </div>

      <!-- STUDENT INFORMATION -->
      <div class="section">
        <div class="section-header">
          <div class="section-icon amber">${userIconSVG}</div>
          <div class="section-title">Member Information</div>
          <div class="section-line"></div>
        </div>
        <div class="info-grid">
          <div class="info-cell">
            <div class="info-label">Full Name</div>
            <div class="info-value">${payment.student.full_name}</div>
          </div>
          <div class="info-cell">
            <div class="info-label">Reg. Number</div>
            <div class="info-value mono amber">${payment.student.reg_number}</div>
          </div>
          <div class="info-cell">
            <div class="info-label">Level</div>
            <div class="info-value">${payment.student.level || 'Not specified'}</div>
          </div>
          <div class="info-cell">
            <div class="info-label">Email</div>
            <div class="info-value">${payment.student.email || 'Not provided'}</div>
          </div>
          <div class="info-cell">
            <div class="info-label">Department</div>
            <div class="info-value">ECE</div>
          </div>
          <div class="info-cell">
            <div class="info-label">Academic Session</div>
            <div class="info-value">${new Date().getFullYear()}/${new Date().getFullYear() + 1}</div>
          </div>
        </div>
      </div>

      <!-- PAYMENT DETAILS -->
      <div class="section">
        <div class="section-header">
          <div class="section-icon blue">${cardIconSVG}</div>
          <div class="section-title">Transaction Details</div>
          <div class="section-line"></div>
        </div>
        <table class="pay-table">
          <thead>
            <tr>
              <th>Description</th>
              <th>Details</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>Payment Type</td>
              <td style="font-weight:600;">${payment.payment_type.title}</td>
            </tr>
            <tr>
              <td>Target Amount</td>
              <td class="td-amount">${fmtCurrency(payment.payment_type.amount)}</td>
            </tr>
            <tr>
              <td>Amount ${isWaived ? 'Waived' : 'Paid'}</td>
              <td class="td-amount" style="color:var(--amber);">${fmtCurrency(payment.amount)}</td>
            </tr>
            <tr>
              <td>Payment Method</td>
              <td>${payment.payment_method ? payment.payment_method.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : 'Bank Transfer'}</td>
            </tr>
            <tr>
              <td>Transaction Reference</td>
              <td class="td-mono">${payment.transaction_ref || 'N/A'}</td>
            </tr>
            <tr>
              <td>Submitted On</td>
              <td>${fmtDateTime(payment.created_at)}</td>
            </tr>
            ${payment.approved_at ? `<tr>
              <td>${isWaived ? 'Waived On' : 'Approved On'}</td>
              <td>${fmtDateTime(payment.approved_at)}</td>
            </tr>` : ''}
            <tr>
              <td>Status</td>
              <td><span class="badge ${isWaived ? 'waived' : payment.status}">${statusCfg.label}</span></td>
            </tr>
          </tbody>
        </table>

        <div class="amount-strip">
          <span class="amount-strip-label">${isWaived ? 'Total Waived' : 'Total Paid'}</span>
          <span class="amount-strip-value">${fmtCurrency(payment.amount)}</span>
        </div>
      </div>

      <!-- VERIFICATION -->
      <div class="verification">
        <div class="verification-left">
          <div class="qr-box">
            ${qrCells.map(c => `<div class="qr-cell ${c}"></div>`).join('')}
          </div>
          <div class="verify-text">
            <strong>Verification</strong><br>
            Document Ref: <span class="verify-code">${docRef}</span><br>
            This is electronically generated.<br>
            No signature required.
          </div>
        </div>
        <div class="sig-block">
          <div class="sig-line"></div>
          <div class="sig-name">Authorized Signatory</div>
        </div>
      </div>
    </div>

    <!-- FOOTER -->
    <div class="footer">
      <div class="footer-brand">
        ${logoSVG.replace('width="40"', 'width="28"').replace('height="40"', 'height="28"')}
        <div class="footer-info">
          <strong>Payvexo</strong><br>
          Smart Payment & Dues Platform
        </div>
      </div>
      <div class="footer-right">
        Official Payment Receipt<br>
        Generated ${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
      </div>
    </div>
  </div>

  <div class="print-actions no-print">
    <button class="btn-print" onclick="window.print()">${printIconSVG} Print / Save as PDF</button>
  </div>
</body>
</html>`;

  // Open in print window
  const isIOSDevice = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOSDevice) {
    let printFrame = document.getElementById('receipt-print-frame') as HTMLIFrameElement;
    if (!printFrame) {
      printFrame = document.createElement('iframe');
      printFrame.id = 'receipt-print-frame';
      printFrame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
      document.body.appendChild(printFrame);
    }
    const fd = printFrame.contentDocument || printFrame.contentWindow?.document;
    if (fd) { fd.open(); fd.write(html); fd.close(); }
    setTimeout(() => { printFrame.contentWindow?.focus(); printFrame.contentWindow?.print(); }, 500);
  } else {
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  }
}

/* ────────────────────────────────────────────────────────────────
 * GENERIC TABLE EXPORTER (new in 498b149 follow-up)
 *
 * The page-specific exporters above (exportPaymentsToPDF,
 * exportExpensesToPDF, …) each hardcode their column layout for
 * one screen. AuditPage and the upcoming Expenses redesign both
 * need a "give me a clean, branded table PDF from arbitrary data"
 * primitive — column descriptors, optional summary, repeatable
 * header on page break.
 *
 * exportTableToPDF is that primitive. The page-specific exporters
 * stay because they carry richer per-screen layout (stats grids,
 * student info blocks). Use the generic one for ad-hoc lists.
 * ──────────────────────────────────────────────────────────────── */

/** A single column descriptor for the generic exporter. `key` indexes the row. */
export interface PdfTableColumn<Row = Record<string, unknown>> {
  key: keyof Row & string;
  label: string;
  align?: 'left' | 'center' | 'right';
  /** Optional fixed cell width in pt (default: auto). */
  width?: number;
  /** Per-cell renderer. Returns the display string for the value. */
  format?: (value: unknown, row: Row) => string;
}

export interface PdfTableExportInput<Row = Record<string, unknown>> {
  title: string;
  subtitle?: string;
  /** Organisation name printed in the top-right header band. */
  orgName: string;
  /** Brand accent hex. Defaults to Payvexo orange. */
  accentColor?: string;
  /** App name printed in the footer. Defaults to "Payvexo". */
  appName?: string;
  columns: PdfTableColumn<Row>[];
  rows: Row[];
  /** Label / value pairs rendered as a totals block below the table. */
  summary?: Array<{ label: string; value: string }>;
  /** Filename slug (no extension, no date). Defaults to slugified title. */
  filenameSlug?: string;
}

/**
 * Build + download a branded tabular PDF. Returns the filename used.
 *
 * Layout: org-name header band with a brand stripe, title + subtitle,
 * autotable with zebra stripes + brand-coloured header, optional
 * summary block, branded footer with page count. The header band
 * repeats on every page so multi-page exports stay branded.
 */
export function exportTableToPDF<Row extends Record<string, unknown>>(
  input: PdfTableExportInput<Row>,
): string {
  const {
    title,
    subtitle,
    orgName,
    accentColor = '#FF6803',
    appName = 'Payvexo',
    columns,
    rows,
    summary,
    filenameSlug,
  } = input;

  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 40;

  // ── Colour palette derived from accent ──────────────────────────
  // Statement aesthetic: ink-dark body text, muted secondary, a
  // soft accent tint for surfaces, accent itself for the brand band.
  const hexToRgb = (hex: string): [number, number, number] => {
    const m = hex.replace('#', '');
    if (m.length !== 6) return [255, 104, 3];
    return [
      parseInt(m.slice(0, 2), 16),
      parseInt(m.slice(2, 4), 16),
      parseInt(m.slice(4, 6), 16),
    ];
  };
  const accent = hexToRgb(accentColor);
  const ink: [number, number, number] = [22, 17, 14];      // primary body text
  const muted: [number, number, number] = [115, 110, 105]; // secondary text
  const subtle: [number, number, number] = [232, 228, 222]; // hairline + table divider
  const tintBg: [number, number, number] = [
    Math.min(255, Math.round(255 - (255 - accent[0]) * 0.07)),
    Math.min(255, Math.round(255 - (255 - accent[1]) * 0.07)),
    Math.min(255, Math.round(255 - (255 - accent[2]) * 0.07)),
  ];

  // Build a short document reference — non-cryptographic, just a
  // human-readable label like "PVX-A4F0". Lets a treasurer cite the
  // PDF in meeting minutes without sharing the entire title.
  const ref = (() => {
    const seed = (orgName + title + Date.now().toString()).toLowerCase();
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
    return 'PVX-' + (h % 0x10000).toString(16).toUpperCase().padStart(4, '0');
  })();

  const generatedAt = new Date().toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  // ── Brand band: full-width accent strip at the top of every page.
  // Drawn before any content so autotable's page-break can re-run
  // this and the band keeps appearing on every page. ──────────────
  const drawBrandBand = () => {
    const bandHeight = 56;
    // Solid accent fill
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(0, 0, pageWidth, bandHeight, 'F');

    // Org name (large) on the left
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(15);
    doc.setTextColor(255, 255, 255);
    doc.text(orgName, margin, 28);

    // App + ref on the right, smaller / lighter
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8.5);
    doc.setTextColor(255, 255, 255);
    doc.text(`${appName} · ${ref}`, pageWidth - margin, 22, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(generatedAt, pageWidth - margin, 35, { align: 'right' });
  };

  // ── Footer: thin top hairline + powered-by + page count. ────────
  const drawFooter = (pageNo: number, pageCount: number) => {
    const footerY = pageHeight - 22;
    doc.setDrawColor(subtle[0], subtle[1], subtle[2]);
    doc.setLineWidth(0.5);
    doc.line(margin, footerY - 10, pageWidth - margin, footerY - 10);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(`Powered by ${appName}`, margin, footerY);
    doc.text(
      `Page ${pageNo} of ${pageCount} · Ref ${ref}`,
      pageWidth - margin, footerY,
      { align: 'right' },
    );
  };

  // ── First-page header content ───────────────────────────────────
  drawBrandBand();

  // Title block sits 24pt below the band.
  let cursorY = 56 + 32;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(22);
  doc.setTextColor(ink[0], ink[1], ink[2]);
  doc.text(title, margin, cursorY);
  cursorY += 8;

  if (subtitle) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10.5);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(subtitle, margin, cursorY + 12);
    cursorY += 14;
  }

  // Meta strip — small label/value pairs in a soft tinted bar.
  // Reads like a statement header (Period · Records · Reference).
  cursorY += 14;
  const metaHeight = 36;
  doc.setFillColor(tintBg[0], tintBg[1], tintBg[2]);
  doc.roundedRect(margin, cursorY, pageWidth - margin * 2, metaHeight, 6, 6, 'F');

  const metaItems: Array<{ label: string; value: string }> = [
    { label: 'GENERATED', value: generatedAt },
    { label: 'RECORDS', value: String(rows.length) },
    { label: 'REFERENCE', value: ref },
  ];
  const colWidth = (pageWidth - margin * 2) / metaItems.length;
  metaItems.forEach((m, i) => {
    const x = margin + colWidth * i + 12;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(m.label, x, cursorY + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(ink[0], ink[1], ink[2]);
    doc.text(m.value, x, cursorY + 28);
  });
  cursorY += metaHeight + 18;

  // ── Table ───────────────────────────────────────────────────────
  // Statement-style: bold uppercase column headers in accent ink,
  // monospace-ish amounts (right-aligned), thin row separators.
  const head: string[][] = [columns.map(c => c.label.toUpperCase())];
  const body: string[][] = rows.map(row =>
    columns.map(col => {
      const raw = row[col.key];
      if (col.format) return col.format(raw, row);
      return raw == null ? '' : String(raw);
    }),
  );

  autoTable(doc, {
    head,
    body,
    startY: cursorY,
    margin: { left: margin, right: margin, top: 64 /* room for brand band on subsequent pages */ },
    theme: 'plain',
    styles: {
      font: 'helvetica',
      fontSize: 9.5,
      cellPadding: { top: 8, right: 8, bottom: 8, left: 8 },
      lineColor: subtle,
      lineWidth: 0.5,
      textColor: ink,
    },
    headStyles: {
      fillColor: [255, 255, 255],
      textColor: muted,
      fontStyle: 'bold',
      fontSize: 7.5,
      cellPadding: { top: 6, right: 8, bottom: 8, left: 8 },
      lineWidth: 0,
    },
    alternateRowStyles: {
      // Zebra: slightly off-white so the data still reads as the
      // hero. Saturation pulled WAY down from the previous
      // [248,248,248] which was visually distracting.
      fillColor: [252, 251, 249],
    },
    columnStyles: columns.reduce<Record<number, { halign?: 'left' | 'center' | 'right'; cellWidth?: number; fontStyle?: 'normal' | 'bold' }>>(
      (acc, col, idx) => {
        acc[idx] = {
          halign: col.align || 'left',
          // Amount columns get bold weight so they're the eye's
          // anchor point — a treasurer scans the right column first.
          ...(col.align === 'right' ? { fontStyle: 'bold' as const } : {}),
          ...(col.width ? { cellWidth: col.width } : {}),
        };
        return acc;
      },
      {},
    ),
    didDrawPage: (data) => {
      // Re-paint brand band + table on every page break.
      if (data.pageNumber > 1) drawBrandBand();
    },
  });

  const finalY = doc.lastAutoTable?.finalY ?? cursorY + 100;

  // ── Summary "totals card" — the financial-document flourish.
  // First summary entry rendered HUGE as the headline value (e.g.
  // "Total collected · ₦125,000"); subsequent entries stack
  // underneath in a smaller secondary row.
  if (summary && summary.length > 0) {
    const cardTop = finalY + 24;
    const cardH = 24 + (summary.length > 1 ? 22 : 0) + 56;

    // If the card won't fit on this page, push to next.
    if (cardTop + cardH > pageHeight - 50) {
      doc.addPage();
      drawBrandBand();
    }
    const y0 = doc.lastAutoTable?.finalY === finalY ? cardTop : (56 + 32);

    // Tinted card backdrop with rounded corners + accent border.
    doc.setFillColor(tintBg[0], tintBg[1], tintBg[2]);
    doc.setDrawColor(accent[0], accent[1], accent[2]);
    doc.setLineWidth(1);
    doc.roundedRect(margin, y0, pageWidth - margin * 2, cardH, 8, 8, 'FD');

    // Headline row — first summary entry rendered big.
    const headline = summary[0];
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(muted[0], muted[1], muted[2]);
    doc.text(headline.label.toUpperCase(), margin + 14, y0 + 22);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(20);
    doc.setTextColor(accent[0], accent[1], accent[2]);
    doc.text(headline.value, pageWidth - margin - 14, y0 + 36, { align: 'right' });

    // Hairline separator between headline + secondary rows.
    if (summary.length > 1) {
      doc.setDrawColor(accent[0], accent[1], accent[2]);
      doc.setLineWidth(0.5);
      doc.line(margin + 14, y0 + 48, pageWidth - margin - 14, y0 + 48);

      let sy = y0 + 64;
      for (let i = 1; i < summary.length; i++) {
        const s = summary[i];
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(9);
        doc.setTextColor(muted[0], muted[1], muted[2]);
        doc.text(s.label, margin + 14, sy);
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(10);
        doc.setTextColor(ink[0], ink[1], ink[2]);
        doc.text(s.value, pageWidth - margin - 14, sy, { align: 'right' });
        sy += 18;
      }
    }
  }

  // Footer on every page
  const pageCount = doc.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    drawFooter(i, pageCount);
  }

  const date = new Date().toISOString().slice(0, 10);
  const slugify = (s: string) => s.toLowerCase().replace(/[^a-z0-9_-]+/g, '-').replace(/(^-|-$)+/g, '');
  const slug = (filenameSlug || slugify(title) || 'export').slice(0, 60);
  const filename = `${slug}-${date}.pdf`;
  doc.save(filename);
  return filename;
}

export default {
  exportStudentsToPDF,
  exportPaymentsToPDF,
  exportExpensesToPDF,
  exportFinancialSummaryToPDF,
  exportCollectedPaymentsToPDF,
  generatePaymentReceiptPDF,
  exportTableToPDF,
};
