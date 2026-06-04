/**
 * PDF Export Utility — Payvexo
 * Redesigned for a Stripe/Wise-grade fintech aesthetic:
 *   – Near-black ink (#111) on white, never competing gradients
 *   – Single accent (Payvexo orange #FF6803) used sparingly
 *   – Monospace for every reference, amount, and identifier
 *   – Generous whitespace, thin hairlines, no emoji (breaks Helvetica)
 *   – Receipt stays HTML-rendered for full typography fidelity
 *
 * All public function signatures are identical to the previous version —
 * drop-in replacement, nothing in callers needs changing.
 *
 * @author Dev_Wishot
 * @copyright Dev_Wishot — @wishotstudio
 * @license PROPRIETARY
 */

import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

declare module 'jspdf' {
  interface jsPDF {
    lastAutoTable: { finalY: number };
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// DESIGN TOKENS
// One place to change the whole system.
// ─────────────────────────────────────────────────────────────────────────────
const T = {
  // Ink scale — near-black first, then steps toward white
  ink900: [14, 11, 9] as RGB,     // primary text
  ink600: [90, 82, 76] as RGB,    // secondary / labels
  ink400: [160, 153, 147] as RGB, // tertiary / hairlines
  ink100: [242, 240, 237] as RGB, // very light tint for alternating rows
  white:  [255, 255, 255] as RGB,

  // Single brand accent
  accent: [255, 104, 3] as RGB,   // #FF6803

  // Semantic colours — used only for status badges, never for decoration
  green:  [5, 150, 105] as RGB,
  amber:  [217, 119, 6] as RGB,
  red:    [220, 38, 38] as RGB,
  violet: [99, 102, 241] as RGB,

  // Geometry
  margin: 44,          // page left/right margin in pt
  bandH:  3,           // brand stripe height (pt) — thin, not loud
  pageW:  595.28,      // A4 width
  pageH:  841.89,      // A4 height
} as const;

type RGB = [number, number, number];

// ─────────────────────────────────────────────────────────────────────────────
// TYPOGRAPHY HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function setInk(doc: jsPDF, scale: RGB) {
  doc.setTextColor(scale[0], scale[1], scale[2]);
}
function setFont(doc: jsPDF, weight: 'normal' | 'bold', size: number) {
  doc.setFont('helvetica', weight);
  doc.setFontSize(size);
}

// ─────────────────────────────────────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function fmtNaira(n: number): string {
  return 'NGN ' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
/** Use only for the HTML receipt where the ₦ glyph is supported */
function fmtNairaSymbol(n: number): string {
  return '₦' + Number(n).toLocaleString('en-NG', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}
function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
}
// function fmtDateTime(iso: string): string {
//   return new Date(iso).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
// }
function titleCase(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}
function docRef(seed: string): string {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return 'PVX-' + (h % 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE PRIMITIVES — drawn once per page
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Top brand stripe: a 3pt orange rule at the very top. Nothing more.
 * Below it: org name left, generated date right — all in ink600.
 */
function drawPageTop(doc: jsPDF, orgName: string, generated: string) {
  const { margin, pageW, bandH, accent, ink600 } = T;

  // 3pt accent rule
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(0, 0, pageW, bandH, 'F');

  // Org name + generated — small, not shouting
  setFont(doc, 'bold', 8);
  setInk(doc, ink600);
  doc.text(orgName.toUpperCase(), margin, bandH + 13);

  setFont(doc, 'normal', 7.5);
  doc.text(generated, pageW - margin, bandH + 13, { align: 'right' });
}

/**
 * Bottom footer: thin hairline, then "Powered by Payvexo" left,
 * page N of M right.
 */
function drawPageFooter(doc: jsPDF, pageNo: number, pageCount: number) {
  const { margin, pageW, pageH, ink400, ink600 } = T;
  const y = pageH - 22;

  doc.setDrawColor(ink400[0], ink400[1], ink400[2]);
  doc.setLineWidth(0.4);
  doc.line(margin, y - 7, pageW - margin, y - 7);

  setFont(doc, 'normal', 7.5);
  setInk(doc, ink600);
  doc.text('Payvexo — secure payment platform', margin, y);
  doc.text(`Page ${pageNo} of ${pageCount}`, pageW - margin, y, { align: 'right' });
}

// ─────────────────────────────────────────────────────────────────────────────
// SECTION HEADING
// A hairline above, bold label, horizontal rule — no filled box, no emoji.
// ─────────────────────────────────────────────────────────────────────────────
function drawSection(doc: jsPDF, label: string, y: number): number {
  const { margin, pageW, ink900, ink400, accent } = T;

  // Thin accent-coloured left tick
  doc.setFillColor(accent[0], accent[1], accent[2]);
  doc.rect(margin, y, 2.5, 10, 'F');

  setFont(doc, 'bold', 9);
  setInk(doc, ink900);
  doc.text(label.toUpperCase(), margin + 7, y + 7.5);

  // Full-width hairline
  doc.setDrawColor(ink400[0], ink400[1], ink400[2]);
  doc.setLineWidth(0.4);
  doc.line(margin, y + 13, pageW - margin, y + 13);

  return y + 20;
}

// ─────────────────────────────────────────────────────────────────────────────
// STAT ROW  — e.g. "NGN 125,000  ·  48 members  ·  12 payments"
// Three stats in a borderless row. Amount bold + large, label tiny above.
// ─────────────────────────────────────────────────────────────────────────────
interface StatItem { label: string; value: string; mono?: boolean }

function drawStatRow(doc: jsPDF, stats: StatItem[], y: number): number {
  const { margin, pageW, ink900, ink600, ink400, ink100 } = T;
  const W = pageW - margin * 2;
  const colW = W / stats.length;
  const rowH = 36;

  // Background tint
  doc.setFillColor(ink100[0], ink100[1], ink100[2]);
  doc.roundedRect(margin, y, W, rowH, 3, 3, 'F');

  // Vertical dividers between cells
  doc.setDrawColor(ink400[0], ink400[1], ink400[2]);
  doc.setLineWidth(0.4);
  for (let i = 1; i < stats.length; i++) {
    const x = margin + colW * i;
    doc.line(x, y + 6, x, y + rowH - 6);
  }

  stats.forEach((s, i) => {
    const x = margin + colW * i + 10;

    setFont(doc, 'normal', 7);
    setInk(doc, ink600);
    doc.text(s.label.toUpperCase(), x, y + 11);

    setFont(doc, 'bold', s.mono ? 10.5 : 12);
    setInk(doc, ink900);
    if (s.mono) doc.setFont('courier', 'bold');
    doc.text(s.value, x, y + 26);
    doc.setFont('helvetica', 'bold'); // reset from courier
  });

  return y + rowH + 12;
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED autoTable CONFIG
// ─────────────────────────────────────────────────────────────────────────────
function baseTableStyles() {
  return {
    theme: 'plain' as const,
    styles: {
      font: 'helvetica' as const,
      fontSize: 9,
      cellPadding: { top: 7, right: 8, bottom: 7, left: 8 },
      lineColor: T.ink400 as [number,number,number],
      lineWidth: 0.35,
      textColor: T.ink900 as [number,number,number],
    },
    headStyles: {
      fillColor: T.ink900 as [number,number,number],
      textColor: T.white as [number,number,number],
      fontStyle: 'bold' as const,
      fontSize: 7.5,
      cellPadding: { top: 7, right: 8, bottom: 7, left: 8 },
    },
    alternateRowStyles: {
      fillColor: T.ink100 as [number,number,number],
    },
    margin: { left: T.margin, right: T.margin },
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// STATUS BADGE — inline text tag, no box drawing (jsPDF has no CSS)
// Returns a short capitalised string with a leading bullet
// ─────────────────────────────────────────────────────────────────────────────
function statusLabel(status: string): string {
  const map: Record<string, string> = {
    approved: '+ Approved',
    pending:  '~ Pending',
    rejected: '- Rejected',
    failed:   '- Failed',
    waived:   '* Waived',
  };
  return map[status.toLowerCase()] ?? titleCase(status);
}

// ─────────────────────────────────────────────────────────────────────────────
// PAGE SETUP HELPER — creates doc, sets first-page chrome, returns cursor Y
// ─────────────────────────────────────────────────────────────────────────────
function newDoc(orgName: string, title: string, subtitle: string | undefined) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });
  const generated = new Date().toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  drawPageTop(doc, orgName, generated);

  let y = T.bandH + 30;

  // Document title — large, ink, tight tracking
  setFont(doc, 'bold', 22);
  setInk(doc, T.ink900);
  doc.text(title, T.margin, y);
  y += 8;

  if (subtitle) {
    setFont(doc, 'normal', 10);
    setInk(doc, T.ink600);
    doc.text(subtitle, T.margin, y + 11);
    y += 18;
  }

  y += 16; // breathing room before first section

  return { doc, y, generated };
}

/** Stamp footers on every page after all content is drawn */
function finaliseDoc(doc: jsPDF) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    drawPageFooter(doc, i, n);
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PUBLIC TYPES (unchanged from original)
// ─────────────────────────────────────────────────────────────────────────────
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
  payment_type?: { title: string; amount: number };
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
  filters?: { category?: string; status?: string; payment?: string; search?: string };
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT: STUDENTS LIST
// ─────────────────────────────────────────────────────────────────────────────
export function exportStudentsToPDF(
  students: Student[],
  filters?: { status?: string; role?: string },
): void {
  const active   = students.filter(s => s.is_active).length;
  const withRole = students.filter(s => s.is_admin || s.is_finsec || s.is_class_rep).length;

  const { doc, y: y0 } = newDoc('Payvexo', 'Student Directory', undefined);
  let y = y0;

  y = drawStatRow(doc, [
    { label: 'Total Students', value: students.length.toString() },
    { label: 'Active',         value: active.toString() },
    { label: 'Inactive',       value: (students.length - active).toString() },
    { label: 'With Roles',     value: withRole.toString() },
  ], y);

  if (filters?.status || filters?.role) {
    const parts = [
      filters.status ? `Status: ${filters.status}` : '',
      filters.role   ? `Role: ${filters.role}`     : '',
    ].filter(Boolean).join('  ·  ');
    setFont(doc, 'normal', 8);
    setInk(doc, T.ink600);
    doc.text(`Filters applied: ${parts}`, T.margin, y);
    y += 14;
  }

  y = drawSection(doc, 'Student List', y);

  const body = students.map((s, i) => [
    (i + 1).toString(),
    s.full_name,
    s.reg_number,
    s.level || '—',
    s.department || '—',
    s.is_active ? 'Active' : 'Inactive',
    [s.is_admin && 'Admin', s.is_finsec && 'FinSec', s.is_class_rep && 'Class Rep']
      .filter(Boolean).join(', ') || 'Member',
  ]);

  autoTable(doc, {
    ...baseTableStyles(),
    startY: y,
    head: [['#', 'Full Name', 'Reg Number', 'Level', 'Department', 'Status', 'Role']],
    body,
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 50, fontStyle: 'bold' },
      2: { cellWidth: 36, font: 'courier' },
      3: { cellWidth: 22, halign: 'center' },
      4: { cellWidth: 44 },
      5: { cellWidth: 28, halign: 'center' },
      6: { cellWidth: 36 },
    },
    didDrawPage: (d) => {
      if (d.pageNumber > 1) drawPageTop(doc, 'Payvexo', '');
    },
  });

  finaliseDoc(doc);
  doc.save(`students_directory_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT: PAYMENT HISTORY / STATEMENT
// ─────────────────────────────────────────────────────────────────────────────
export function exportPaymentsToPDF(
  payments: Payment[],
  student?: { full_name: string; reg_number: string; email?: string; level?: string; department?: string },
): void {
  const approved  = payments.filter(p => p.status === 'approved');
  const pending   = payments.filter(p => p.status === 'pending');
  const rejected  = payments.filter(p => p.status === 'rejected');
  const totalPaid = approved.reduce((s, p) => s + Number(p.amount), 0);

  const title    = student ? 'Payment Statement' : 'Payments Report';
  const subtitle = student ? `${student.full_name}  ·  ${student.reg_number}` : undefined;

  const { doc, y: y0 } = newDoc('Payvexo', title, subtitle);
  let y = y0;

  y = drawStatRow(doc, [
    { label: 'Net Paid',  value: fmtNaira(totalPaid), mono: true },
    { label: 'Approved',  value: approved.length.toString() },
    { label: 'Pending',   value: pending.length.toString() },
    { label: 'Rejected',  value: rejected.length.toString() },
  ], y);

  // Student detail block (if individual statement)
  if (student) {
    y = drawSection(doc, 'Member Information', y);
    const fields: Array<[string, string]> = [
      ['Full name',   student.full_name],
      ['Reg number',  student.reg_number],
      ['Email',       student.email || '—'],
      ['Level',       student.level || '—'],
      ['Department',  student.department || '—'],
      ['Session',     `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`],
    ];
    const colW = (T.pageW - T.margin * 2) / 3;
    fields.forEach(([label, value], i) => {
      const col = i % 3;
      const row = Math.floor(i / 3);
      const x   = T.margin + col * colW;
      const fy  = y + row * 24;
      setFont(doc, 'normal', 7.5);
      setInk(doc, T.ink600);
      doc.text(label.toUpperCase(), x, fy);
      setFont(doc, 'bold', 10);
      setInk(doc, T.ink900);
      doc.text(value, x, fy + 11);
    });
    y += Math.ceil(fields.length / 3) * 24 + 10;
  }

  // Breakdown by payment type
  const byType: Record<string, { paid: number; count: number; expected: number }> = {};
  approved.forEach(p => {
    if (!p.payment_type) return;
    const k = p.payment_type.title;
    if (!byType[k]) byType[k] = { paid: 0, count: 0, expected: p.payment_type.amount };
    byType[k].paid  += Number(p.amount);
    byType[k].count += 1;
  });

  if (Object.keys(byType).length) {
    y = drawSection(doc, 'Breakdown by Type (Approved)', y);
    autoTable(doc, {
      ...baseTableStyles(),
      startY: y,
      head: [['Payment Type', 'Count', 'Paid', 'Expected', 'Diff', 'Status']],
      body: Object.entries(byType).map(([type, d]) => [
        type,
        d.count.toString(),
        fmtNaira(d.paid),
        fmtNaira(d.expected),
        fmtNaira(d.paid - d.expected),
        d.paid >= d.expected ? 'Complete' : 'Partial',
      ]),
      columnStyles: {
        0: { cellWidth: 56, fontStyle: 'bold' },
        1: { cellWidth: 26, halign: 'center' },
        2: { cellWidth: 46, halign: 'right', font: 'courier' },
        3: { cellWidth: 46, halign: 'right', font: 'courier' },
        4: { cellWidth: 44, halign: 'right', font: 'courier' },
        5: { cellWidth: 32, halign: 'center' },
      },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  // Full transaction history
  y = drawSection(doc, 'Transaction History', y);
  autoTable(doc, {
    ...baseTableStyles(),
    startY: y,
    head: [['#', 'Date', 'Payment Type', 'Amount', 'Method', 'Reference', 'Status']],
    body: payments.map((p, i) => [
      (i + 1).toString(),
      fmtDate(p.created_at),
      p.payment_type?.title || '—',
      fmtNaira(Number(p.amount)),
      p.payment_method ? titleCase(p.payment_method) : '—',
      p.transaction_ref?.slice(0, 14) || '—',
      statusLabel(p.status),
    ]),
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      1: { cellWidth: 36 },
      2: { cellWidth: 50, fontStyle: 'bold' },
      3: { cellWidth: 50, halign: 'right', font: 'courier' },
      4: { cellWidth: 32 },
      5: { cellWidth: 44, font: 'courier' },
      6: { cellWidth: 36 },
    },
    didDrawPage: (d) => {
      if (d.pageNumber > 1) drawPageTop(doc, 'Payvexo', '');
    },
  });

  finaliseDoc(doc);
  const slug = student
    ? `payment_statement_${student.reg_number.replace(/\//g, '-')}`
    : 'payments_report';
  doc.save(`${slug}_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT: EXPENSES
// ─────────────────────────────────────────────────────────────────────────────
export function exportExpensesToPDF(
  expenses: Expense[],
  dateRange?: { from: string; to: string },
): void {
  const approved     = expenses.filter(e => e.status === 'approved');
  const totalApproved = approved.reduce((s, e) => s + Number(e.amount), 0);
  const totalPending  = expenses.filter(e => e.status === 'pending')
    .reduce((s, e) => s + Number(e.amount), 0);

  const { doc, y: y0 } = newDoc('Payvexo', 'Expense Report', dateRange
    ? `Period: ${dateRange.from} – ${dateRange.to}` : undefined);
  let y = y0;

  y = drawStatRow(doc, [
    { label: 'Total Spent',   value: fmtNaira(totalApproved), mono: true },
    { label: 'Pending',       value: fmtNaira(totalPending),  mono: true },
    { label: 'Approved',      value: approved.length.toString() },
    { label: 'Total Records', value: expenses.length.toString() },
  ], y);

  // By-category summary
  const byCat: Record<string, number> = {};
  approved.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });

  if (Object.keys(byCat).length) {
    y = drawSection(doc, 'By Category', y);
    autoTable(doc, {
      ...baseTableStyles(),
      startY: y,
      head: [['Category', 'Amount', 'Share']],
      body: Object.entries(byCat)
        .sort(([,a],[,b]) => b - a)
        .map(([cat, amt]) => [
          titleCase(cat),
          fmtNaira(amt),
          `${((amt / totalApproved) * 100).toFixed(1)}%`,
        ]),
      columnStyles: {
        0: { cellWidth: 90, fontStyle: 'bold' },
        1: { cellWidth: 70, halign: 'right', font: 'courier' },
        2: { cellWidth: 50, halign: 'right' },
      },
      tableWidth: 210,
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  y = drawSection(doc, 'Expense Records', y);
  autoTable(doc, {
    ...baseTableStyles(),
    startY: y,
    head: [['#', 'Title', 'Category', 'Amount', 'Status', 'Date']],
    body: expenses.map((e, i) => [
      (i + 1).toString(),
      e.title,
      titleCase(e.category),
      fmtNaira(Number(e.amount)),
      statusLabel(e.status),
      fmtDate(e.created_at),
    ]),
    columnStyles: {
      0: { cellWidth: 22, halign: 'center' },
      1: { cellWidth: 60, fontStyle: 'bold' },
      2: { cellWidth: 44 },
      3: { cellWidth: 50, halign: 'right', font: 'courier' },
      4: { cellWidth: 34, halign: 'center' },
      5: { cellWidth: 38 },
    },
    didDrawPage: (d) => {
      if (d.pageNumber > 1) drawPageTop(doc, 'Payvexo', '');
    },
  });

  finaliseDoc(doc);
  doc.save(`expense_report_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT: FINANCIAL SUMMARY
// ─────────────────────────────────────────────────────────────────────────────
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
  const { doc, y: y0 } = newDoc('Payvexo', 'Financial Summary', 'Class Fund Overview');
  let y = y0;

  y = drawStatRow(doc, [
    { label: 'Total Collected', value: fmtNaira(data.totalCollected), mono: true },
    { label: 'Total Expenses',  value: fmtNaira(data.totalExpenses),  mono: true },
    { label: 'Balance',         value: fmtNaira(data.balance),        mono: true },
  ], y);

  y = drawStatRow(doc, [
    { label: 'Students',  value: data.studentsCount.toString() },
    { label: 'Payments',  value: data.paymentsCount.toString() },
    { label: 'Expenses',  value: data.expensesCount.toString() },
  ], y);

  if (data.collectionsByType.length) {
    y = drawSection(doc, 'Collections by Payment Type', y);
    autoTable(doc, {
      ...baseTableStyles(),
      startY: y,
      head: [['Payment Type', 'Count', 'Total']],
      body: data.collectionsByType.map(c => [
        c.title,
        c.count.toString(),
        fmtNaira(c.amount),
      ]),
      columnStyles: {
        0: { cellWidth: 100, fontStyle: 'bold' },
        1: { cellWidth: 36, halign: 'center' },
        2: { cellWidth: 70, halign: 'right', font: 'courier' },
      },
      tableWidth: 206,
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  if (data.expensesByCategory.length) {
    y = drawSection(doc, 'Expenses by Category', y);
    autoTable(doc, {
      ...baseTableStyles(),
      startY: y,
      head: [['Category', 'Amount', 'Share']],
      body: data.expensesByCategory.map(e => [
        titleCase(e.category),
        fmtNaira(e.amount),
        `${((e.amount / data.totalExpenses) * 100).toFixed(1)}%`,
      ]),
      columnStyles: {
        0: { cellWidth: 100, fontStyle: 'bold' },
        1: { cellWidth: 70, halign: 'right', font: 'courier' },
        2: { cellWidth: 36, halign: 'right' },
      },
      tableWidth: 206,
    });
  }

  finaliseDoc(doc);
  doc.save(`financial_summary_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORT: COLLECTED PAYMENTS (admin overview)
// ─────────────────────────────────────────────────────────────────────────────
export function exportCollectedPaymentsToPDF(data: CollectedPaymentsExportData): void {
  const { doc, y: y0 } = newDoc('Payvexo', 'Payment Collection Report', 'Student Payment Breakdown');
  let y = y0;

  y = drawStatRow(doc, [
    { label: 'Total Collected', value: fmtNaira(data.totalCollected), mono: true },
    { label: 'Total Expenses',  value: fmtNaira(data.totalExpenses),  mono: true },
    { label: 'Net Balance',     value: fmtNaira(data.netBalance),     mono: true },
  ], y);

  y = drawStatRow(doc, [
    { label: 'Students Paid',    value: data.totalStudentsPaid.toString() },
    { label: 'Students Unpaid',  value: data.totalStudentsUnpaid.toString() },
    { label: 'Total Students',   value: (data.totalStudentsPaid + data.totalStudentsUnpaid).toString() },
  ], y);

  // Active filters
  if (data.filters) {
    const parts = [
      data.filters.category && data.filters.category !== 'all' ? `Category: ${data.filters.category}` : '',
      data.filters.status   && data.filters.status   !== 'all' ? `Status: ${data.filters.status}`     : '',
      data.filters.payment  && data.filters.payment  !== 'all' ? `Payment: ${data.filters.payment}`   : '',
      data.filters.search   ? `Search: "${data.filters.search}"` : '',
    ].filter(Boolean).join('  ·  ');
    if (parts) {
      setFont(doc, 'normal', 8);
      setInk(doc, T.ink600);
      doc.text(`Filters: ${parts}`, T.margin, y);
      y += 14;
    }
  }

  if (data.categoriesBreakdown.length) {
    y = drawSection(doc, 'Category Breakdown', y);
    autoTable(doc, {
      ...baseTableStyles(),
      startY: y,
      head: [['Category', 'Collected', 'Expenses', 'Net Balance', 'Payments']],
      body: data.categoriesBreakdown.map(c => [
        titleCase(c.category),
        fmtNaira(c.total_collected),
        fmtNaira(c.total_expenses),
        fmtNaira(c.net_balance),
        c.payment_count.toString(),
      ]),
      columnStyles: {
        0: { cellWidth: 50, fontStyle: 'bold' },
        1: { cellWidth: 52, halign: 'right', font: 'courier' },
        2: { cellWidth: 52, halign: 'right', font: 'courier' },
        3: { cellWidth: 52, halign: 'right', font: 'courier' },
        4: { cellWidth: 30, halign: 'center' },
      },
      didDrawPage: (d) => { if (d.pageNumber > 1) drawPageTop(doc, 'Payvexo', ''); },
    });
    y = doc.lastAutoTable.finalY + 14;
  }

  y = drawSection(doc, 'Student Payment Details', y);
  autoTable(doc, {
    ...baseTableStyles(),
    startY: y,
    head: [['#', 'Student Name', 'Reg Number', 'Status', 'Total Paid', 'Payments', 'Categories']],
    body: data.students.map((s, i) => [
      (i + 1).toString(),
      s.student_name,
      s.reg_number,
      s.is_active ? 'Active' : 'Inactive',
      fmtNaira(s.total_paid),
      s.payment_count.toString(),
      s.categories_paid.join(', ') || '—',
    ]),
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' },
      1: { cellWidth: 52, fontStyle: 'bold' },
      2: { cellWidth: 38, font: 'courier' },
      3: { cellWidth: 28, halign: 'center' },
      4: { cellWidth: 50, halign: 'right', font: 'courier' },
      5: { cellWidth: 24, halign: 'center' },
      6: { cellWidth: 50 },
    },
    didDrawPage: (d) => { if (d.pageNumber > 1) drawPageTop(doc, 'Payvexo', ''); },
  });

  finaliseDoc(doc);
  doc.save(`student_payments_${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────────────────
// GENERIC TABLE EXPORTER
// ─────────────────────────────────────────────────────────────────────────────
export interface PdfTableColumn<Row = Record<string, unknown>> {
  key: keyof Row & string;
  label: string;
  align?: 'left' | 'center' | 'right';
  width?: number;
  mono?: boolean;
  format?: (value: unknown, row: Row) => string;
}

export interface PdfTableExportInput<Row = Record<string, unknown>> {
  title: string;
  subtitle?: string;
  orgName: string;
  accentColor?: string;    // ignored — system uses Payvexo orange for consistency
  appName?: string;
  columns: PdfTableColumn<Row>[];
  rows: Row[];
  summary?: Array<{ label: string; value: string }>;
  filenameSlug?: string;
}

export function exportTableToPDF<Row extends Record<string, unknown>>(
  input: PdfTableExportInput<Row>,
): string {
  const { title, subtitle, orgName, columns, rows, summary, filenameSlug } = input;

  const { doc, y: y0 } = newDoc(orgName, title, subtitle);
  let y = y0;

  // Meta bar
  y = drawStatRow(doc, [
    { label: 'Records',   value: rows.length.toString() },
    { label: 'Reference', value: docRef(orgName + title), mono: true },
    { label: 'Generated', value: new Date().toLocaleDateString('en-NG') },
  ], y);

  y = drawSection(doc, title, y);

  const head = [columns.map(c => c.label.toUpperCase())];
  const body = rows.map(r =>
    columns.map(c => {
      const v = r[c.key];
      if (c.format) return c.format(v, r);
      return v == null ? '—' : String(v);
    }),
  );

  const colStyles = columns.reduce<Record<number, object>>((acc, col, i) => {
    acc[i] = {
      halign: col.align || 'left',
      ...(col.mono   ? { font: 'courier' as const } : {}),
      ...(col.align === 'right' ? { fontStyle: 'bold' as const } : {}),
      ...(col.width  ? { cellWidth: col.width } : {}),
    };
    return acc;
  }, {});

  autoTable(doc, {
    ...baseTableStyles(),
    startY: y,
    head,
    body,
    columnStyles: colStyles,
    didDrawPage: (d) => { if (d.pageNumber > 1) drawPageTop(doc, orgName, ''); },
  });

  // Summary totals card — clean borderless block, accent value
  if (summary?.length) {
    const fy = doc.lastAutoTable?.finalY ?? y + 100;
    let sy = fy + 24;

    // Hairline above totals
    doc.setDrawColor(T.ink400[0], T.ink400[1], T.ink400[2]);
    doc.setLineWidth(0.4);
    doc.line(T.margin, sy - 8, T.pageW - T.margin, sy - 8);

    summary.forEach((s, i) => {
      const isFirst = i === 0;
      setFont(doc, 'normal', isFirst ? 8 : 8);
      setInk(doc, T.ink600);
      doc.text(s.label.toUpperCase(), T.margin, sy);

      setFont(doc, 'bold', isFirst ? 16 : 11);
      setInk(doc, isFirst ? T.accent : T.ink900);
      if (isFirst) doc.setFont('courier', 'bold');
      doc.text(s.value, T.pageW - T.margin, sy, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      sy += isFirst ? 22 : 16;
    });
  }

  finaliseDoc(doc);

  const slug = (filenameSlug || title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).slice(0, 60);
  const filename = `${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}

// ─────────────────────────────────────────────────────────────────────────────
// RECEIPT — HTML print window (unchanged API, redesigned markup)
// Stripe-inspired: monospace refs, single orange strip, lots of air.
// ─────────────────────────────────────────────────────────────────────────────
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
  const isWaived   = payment.transaction_ref?.startsWith('WAIVED-');
  const isApproved = payment.status === 'approved';
  const isPending  = payment.status === 'pending';

  const ref = (() => {
    const raw = payment.id + payment.amount + payment.status;
    let h = 0;
    for (let i = 0; i < raw.length; i++) h = ((h << 5) - h) + raw.charCodeAt(i);
    return 'PVX-' + Math.abs(h).toString(16).toUpperCase().padStart(6, '0').slice(0, 6);
  })();

  const statusCfg = isWaived
    ? { bg: '#6366f1', text: '#4338ca', label: 'WAIVED',   light: '#eef2ff' }
    : isApproved
      ? { bg: '#059669', text: '#065f46', label: 'APPROVED', light: '#ecfdf5' }
      : isPending
        ? { bg: '#d97706', text: '#92400e', label: 'PENDING',  light: '#fffbeb' }
        : { bg: '#dc2626', text: '#991b1b', label: 'REJECTED', light: '#fef2f2' };

  const fmt = (d: string) =>
    new Date(d).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const fmtDT = (d: string) =>
    new Date(d).toLocaleString('en-US', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt · ${payment.student.full_name}</title>
<style>
  @import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;600&family=Sora:wght@400;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ink:    #0e0b09;
    --muted:  #5a524c;
    --faint:  #a09890;
    --rule:   #e2ddd8;
    --bg:     #f6f4f1;
    --white:  #ffffff;
    --accent: #FF6803;
    --status-bg: ${statusCfg.light};
    --status-fg: ${statusCfg.text};
    --status-dot: ${statusCfg.bg};
    --mono: 'IBM Plex Mono', 'Courier New', monospace;
    --sans: 'Sora', -apple-system, sans-serif;
  }
  body { font-family: var(--sans); background: var(--bg); color: var(--ink); -webkit-font-smoothing: antialiased; }

  /* ── Outer shell ── */
  .shell { max-width: 660px; margin: 32px auto; background: var(--white); }

  /* ── Top stripe ── */
  .stripe { height: 4px; background: var(--accent); }

  /* ── Header ── */
  .header { padding: 28px 36px 22px; display: flex; justify-content: space-between; align-items: flex-start; }
  .logo { display: flex; align-items: center; gap: 12px; }
  .logo-mark { width: 36px; height: 36px; }
  .brand { font-size: 17px; font-weight: 800; color: var(--ink); letter-spacing: -0.5px; }
  .brand span { color: var(--accent); }
  .brand-sub { font-size: 9px; color: var(--faint); text-transform: uppercase; letter-spacing: 2px; margin-top: 2px; }
  .header-right { text-align: right; }
  .doc-kind { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: var(--accent); margin-bottom: 8px; }
  .doc-meta { font-size: 10px; color: var(--muted); line-height: 1.9; font-family: var(--mono); }

  .rule { height: 1px; background: var(--rule); margin: 0 36px; }

  /* ── Body ── */
  .body { padding: 28px 36px 32px; }

  /* ── Hero: status + amount ── */
  .hero { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 28px; }
  .hero-cell { padding: 18px 20px; border-radius: 8px; }
  .hero-cell.status { background: var(--status-bg); }
  .hero-cell.amount { background: var(--ink); }
  .hero-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 2.5px; margin-bottom: 8px; }
  .hero-cell.status .hero-label { color: var(--status-fg); }
  .hero-cell.amount .hero-label { color: rgba(255,255,255,0.5); }
  .hero-val { font-size: 22px; font-weight: 800; line-height: 1.2; }
  .hero-cell.status .hero-val { color: var(--status-dot); }
  .hero-cell.amount .hero-val { color: #fff; font-family: var(--mono); letter-spacing: -0.5px; }
  .status-pip { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--status-dot); margin-right: 5px; vertical-align: middle; }

  /* ── Section label ── */
  .sec { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; color: var(--faint); margin-bottom: 12px; margin-top: 24px; padding-bottom: 6px; border-bottom: 1px solid var(--rule); }

  /* ── KV grid ── */
  .kv { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 0; border: 1px solid var(--rule); border-radius: 6px; overflow: hidden; }
  .kv-cell { padding: 10px 14px; border-bottom: 1px solid var(--rule); border-right: 1px solid var(--rule); }
  .kv-cell:nth-child(3n) { border-right: none; }
  .kv-cell:nth-last-child(-n+3) { border-bottom: none; }
  .kv-label { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--faint); margin-bottom: 3px; }
  .kv-val { font-size: 12px; font-weight: 600; color: var(--ink); }
  .kv-val.mono { font-family: var(--mono); font-size: 11px; }
  .kv-val.accent { color: var(--accent); }

  /* ── Transaction table ── */
  .tx-table { width: 100%; border-collapse: collapse; }
  .tx-table tr { border-bottom: 1px solid var(--rule); }
  .tx-table tr:last-child { border-bottom: none; }
  .tx-table td { padding: 9px 0; font-size: 12px; }
  .tx-table td:first-child { color: var(--muted); width: 42%; }
  .tx-table td:last-child { text-align: right; font-weight: 600; }
  .tx-table td.mono { font-family: var(--mono); font-size: 11px; color: var(--muted); }
  .badge { display: inline-block; padding: 2px 9px; border-radius: 20px; font-size: 9px; font-weight: 700; background: var(--status-bg); color: var(--status-fg); }

  /* ── Amount total strip ── */
  .total-strip { display: flex; justify-content: space-between; align-items: baseline; background: var(--bg); border-radius: 6px; padding: 14px 18px; margin-top: 14px; }
  .total-label { font-size: 11px; font-weight: 600; color: var(--muted); text-transform: uppercase; letter-spacing: 1px; }
  .total-val { font-size: 22px; font-weight: 800; color: var(--ink); font-family: var(--mono); }

  /* ── Verification strip ── */
  .verify { margin-top: 28px; padding-top: 18px; border-top: 2px dashed var(--rule); display: flex; justify-content: space-between; align-items: flex-end; }
  .verify-text { font-size: 9px; color: var(--faint); line-height: 2; }
  .verify-ref { font-family: var(--mono); font-size: 10px; color: var(--accent); font-weight: 600; }
  .sig { text-align: center; }
  .sig-line { border-top: 1px solid var(--ink); margin-bottom: 5px; width: 140px; margin-top: 32px; }
  .sig-label { font-size: 8px; text-transform: uppercase; letter-spacing: 1.5px; color: var(--faint); }

  /* ── Footer ── */
  .footer { background: var(--bg); border-top: 1px solid var(--rule); padding: 14px 36px; display: flex; justify-content: space-between; align-items: center; }
  .footer-left { font-size: 9px; color: var(--faint); line-height: 1.8; }
  .footer-left strong { color: var(--accent); font-size: 10px; }
  .footer-right { font-size: 8px; color: var(--faint); text-align: right; line-height: 1.8; }

  /* ── Print ── */
  .no-print { max-width: 660px; margin: 16px auto 40px; display: flex; justify-content: center; }
  .btn { padding: 12px 32px; border: none; border-radius: 6px; cursor: pointer; font-size: 13px; font-weight: 600; font-family: var(--sans); background: var(--ink); color: #fff; letter-spacing: 0.2px; }
  .btn:hover { background: #1e1814; }
  @media print { body { background: #fff; } .shell { box-shadow: none; } .no-print { display: none !important; } }
  @media (max-width: 600px) {
    .header, .body, .footer { padding-left: 20px; padding-right: 20px; }
    .rule { margin: 0 20px; }
    .kv { grid-template-columns: 1fr 1fr; }
    .kv-cell:nth-child(2n) { border-right: none; }
    .kv-cell:nth-child(3n) { border-right: 1px solid var(--rule); }
    .hero { grid-template-columns: 1fr; }
    .verify { flex-direction: column; gap: 16px; }
  }
</style>
</head>
<body>
<div class="shell">
  <div class="stripe"></div>

  <!-- Header -->
  <div class="header">
    <div class="logo">
      <svg class="logo-mark" viewBox="0 0 36 36" xmlns="http://www.w3.org/2000/svg">
        <rect width="36" height="36" rx="8" fill="#0e0b09"/>
        <rect x="7" y="20" width="5" height="10" rx="2" fill="#FF6803"/>
        <rect x="15.5" y="13" width="5" height="17" rx="2" fill="#FF6803"/>
        <rect x="24" y="7" width="5" height="23" rx="2" fill="#FF6803"/>
        <path d="M5 32 Q18 26 31 32" stroke="#30FFAC" stroke-width="1.8" fill="none" stroke-linecap="round"/>
      </svg>
      <div>
        <div class="brand">Pay<span>vexo</span></div>
        <div class="brand-sub">Secure Payments</div>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-kind">Official Receipt</div>
      <div class="doc-meta">
        ${fmt(payment.created_at)}<br>
        Ref: ${ref}<br>
        ID: ${payment.id.slice(0, 8).toUpperCase()}
      </div>
    </div>
  </div>
  <div class="rule"></div>

  <div class="body">
    <!-- Hero -->
    <div class="hero">
      <div class="hero-cell status">
        <div class="hero-label">Status</div>
        <div class="hero-val"><span class="status-pip"></span>${statusCfg.label}</div>
      </div>
      <div class="hero-cell amount">
        <div class="hero-label">${isWaived ? 'Amount Waived' : 'Amount Paid'}</div>
        <div class="hero-val">${fmtNairaSymbol(payment.amount)}</div>
      </div>
    </div>

    <!-- Member info -->
    <div class="sec">Member Information</div>
    <div class="kv">
      <div class="kv-cell"><div class="kv-label">Full Name</div><div class="kv-val">${payment.student.full_name}</div></div>
      <div class="kv-cell"><div class="kv-label">Reg Number</div><div class="kv-val mono accent">${payment.student.reg_number}</div></div>
      <div class="kv-cell"><div class="kv-label">Level</div><div class="kv-val">${payment.student.level || '—'}</div></div>
      <div class="kv-cell"><div class="kv-label">Email</div><div class="kv-val">${payment.student.email || '—'}</div></div>
      <div class="kv-cell"><div class="kv-label">Session</div><div class="kv-val">${new Date().getFullYear()}/${new Date().getFullYear() + 1}</div></div>
      <div class="kv-cell"><div class="kv-label">Department</div><div class="kv-val">ECE</div></div>
    </div>

    <!-- Transaction -->
    <div class="sec">Transaction Details</div>
    <table class="tx-table">
      <tr><td>Payment type</td><td style="font-weight:700">${payment.payment_type.title}</td></tr>
      <tr><td>Target amount</td><td style="font-family:var(--mono)">${fmtNairaSymbol(payment.payment_type.amount)}</td></tr>
      <tr><td>${isWaived ? 'Amount waived' : 'Amount paid'}</td><td style="font-family:var(--mono);color:var(--accent);font-weight:800">${fmtNairaSymbol(payment.amount)}</td></tr>
      <tr><td>Payment method</td><td>${payment.payment_method ? payment.payment_method.replace(/_/g,' ').replace(/\b\w/g,l=>l.toUpperCase()) : 'Bank Transfer'}</td></tr>
      <tr><td>Reference</td><td class="mono">${payment.transaction_ref || '—'}</td></tr>
      <tr><td>Submitted</td><td>${fmtDT(payment.created_at)}</td></tr>
      ${payment.approved_at ? `<tr><td>${isWaived ? 'Waived on' : 'Approved on'}</td><td>${fmtDT(payment.approved_at)}</td></tr>` : ''}
      <tr><td>Status</td><td><span class="badge">${statusCfg.label}</span></td></tr>
    </table>
    <div class="total-strip">
      <span class="total-label">${isWaived ? 'Total waived' : 'Total paid'}</span>
      <span class="total-val">${fmtNairaSymbol(payment.amount)}</span>
    </div>

    <!-- Verification -->
    <div class="verify">
      <div class="verify-text">
        Document ref: <span class="verify-ref">${ref}</span><br>
        Electronically generated — no signature required.<br>
        Issued by Payvexo on ${fmt(new Date().toISOString())}
      </div>
      <div class="sig">
        <div class="sig-line"></div>
        <div class="sig-label">Authorised Signatory</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div class="footer-left"><strong>Payvexo</strong><br>Smart Payment & Dues Platform<br>@wishotstudio</div>
    <div class="footer-right">Official Receipt<br>${new Date().toLocaleDateString('en-US',{year:'numeric',month:'short',day:'numeric'})}<br>Ref ${ref}</div>
  </div>
</div>

<div class="no-print">
  <button class="btn" onclick="window.print()">Print / Save as PDF</button>
</div>
</body>
</html>`;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    let frame = document.getElementById('receipt-print-frame') as HTMLIFrameElement;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'receipt-print-frame';
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none';
      document.body.appendChild(frame);
    }
    const fd = frame.contentDocument || frame.contentWindow?.document;
    if (fd) { fd.open(); fd.write(html); fd.close(); }
    setTimeout(() => { frame.contentWindow?.focus(); frame.contentWindow?.print(); }, 500);
  } else {
    const win = window.open('', '_blank');
    if (win) { win.document.write(html); win.document.close(); }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
export default {
  exportStudentsToPDF,
  exportPaymentsToPDF,
  exportExpensesToPDF,
  exportFinancialSummaryToPDF,
  exportCollectedPaymentsToPDF,
  generatePaymentReceiptPDF,
  exportTableToPDF,
};