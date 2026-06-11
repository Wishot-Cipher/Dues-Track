/**
 * PDF Export Utility — Payvexo
 *
 * Design direction: editorial fintech — the visual language of
 * Bloomberg Terminal meets Stripe's documentation. Dense, precise,
 * monospaced numbers, near-black ink, single orange accent used
 * only for structural anchors (never decoration), and generous
 * but deliberate whitespace.
 *
 * Signature element: every document opens with a full-width
 * "ledger band" — a ruled block that shows the document's financial
 * heartbeat (key amounts) in large monospaced figures before any
 * prose or tables appear. This is the one thing no other fintech PDF
 * does. Everything else is quiet around it.
 *
 * Fixed from previous version:
 *   - orgName was hardcoded 'Payvexo' everywhere — now passed through
 *   - fmtNaira inconsistency (NGN vs ₦) — unified to ISO "NGN" for PDF,
 *     symbol only in the HTML receipt where font support is guaranteed
 *   - docRef was non-deterministic — now a stable slug from content
 *   - Courier reset after inline monospace was fragile — helper now handles it
 *   - Google Fonts in receipt HTML fails offline — replaced with system stack
 *   - Waived check p.waived doesn't exist — uses transaction_ref prefix instead
 *   - drawStatRow label truncation on narrow columns — clamp added
 *
 * All public function signatures are drop-in compatible with the
 * previous version. Nothing in callers needs changing.
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

// ─────────────────────────────────────────────────────────────────
// DESIGN TOKENS — single source of truth
// ─────────────────────────────────────────────────────────────────
type RGB = [number, number, number];

const T = {
  // Ink scale
  ink950: [8,   6,   4  ] as RGB,   // near-black — titles only
  ink800: [28,  22,  18 ] as RGB,   // primary body text
  ink500: [100, 90,  83 ] as RGB,   // labels, secondary
  ink300: [168, 158, 150] as RGB,   // hairlines, tertiary
  ink100: [244, 241, 238] as RGB,   // alternating row tint
  white:  [255, 255, 255] as RGB,

  // Brand
  accent: [255, 104, 3  ] as RGB,   // #FF6803 — used sparingly

  // Semantic (status only)
  green:  [5,   150, 105] as RGB,
  amber:  [180, 100, 10 ] as RGB,
  red:    [200, 38,  38 ] as RGB,
  violet: [99,  102, 241] as RGB,
  teal:   [20,  140, 160] as RGB,

  // Page geometry (A4 portrait, pt)
  pageW:   595.28,
  pageH:   841.89,
  margin:  42,
  gutter:  10,

  // Structural
  stripeH: 4,     // top accent stripe height
  footerY: 819,   // baseline of footer text
} as const;

// ─────────────────────────────────────────────────────────────────
// TYPOGRAPHY — always go through these, never set font inline
// ─────────────────────────────────────────────────────────────────
type FontWeight = 'normal' | 'bold';
type FontFamily = 'helvetica' | 'courier';

function font(doc: jsPDF, family: FontFamily, weight: FontWeight, size: number) {
  doc.setFont(family, weight);
  doc.setFontSize(size);
}
function ink(doc: jsPDF, color: RGB) {
  doc.setTextColor(color[0], color[1], color[2]);
}
function fill(doc: jsPDF, color: RGB) {
  doc.setFillColor(color[0], color[1], color[2]);
}
function stroke(doc: jsPDF, color: RGB, width = 0.4) {
  doc.setDrawColor(color[0], color[1], color[2]);
  doc.setLineWidth(width);
}

// Reset to body defaults after any one-off style
function resetFont(doc: jsPDF) {
  font(doc, 'helvetica', 'normal', 9);
  ink(doc, T.ink800);
}

// ─────────────────────────────────────────────────────────────────
// FORMAT HELPERS
// ─────────────────────────────────────────────────────────────────
function naira(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return 'NGN\u00A0' + v.toLocaleString('en-NG', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

/** Symbol version — HTML receipt only, where font coverage is guaranteed */
function nairaSymbol(n: number): string {
  return '\u20A6' + Number(n).toLocaleString('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-NG', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return iso; }
}

function fmtDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-NG', {
      year: 'numeric', month: 'short', day: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch { return iso; }
}

function titleCase(s: string): string {
  return (s || '').replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());
}

/**
 * Stable document reference — deterministic from content,
 * not from Math.random() or Date.now() so it doesn't change
 * between renders of the same document.
 */
function stableRef(seed: string): string {
  let h = 5381;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) + h) ^ seed.charCodeAt(i);
    h = h >>> 0;
  }
  return 'PVX-' + h.toString(16).toUpperCase().padStart(8, '0').slice(0, 8);
}

function statusLabel(status: string): string {
  const map: Record<string, string> = {
    approved: 'Approved', paid: 'Paid', active: 'Active',
    pending:  'Pending',  failed: 'Failed',
    rejected: 'Rejected', waived: 'Waived',
    inactive: 'Inactive', partial: 'Partial',
  };
  return map[(status || '').toLowerCase()] ?? titleCase(status);
}

// ─────────────────────────────────────────────────────────────────
// PAGE CHROME — top stripe + header row + footer
// These are called once per page.
// ─────────────────────────────────────────────────────────────────
function drawTopStripe(doc: jsPDF) {
  fill(doc, T.accent);
  doc.rect(0, 0, T.pageW, T.stripeH, 'F');
}

function drawPageHeader(doc: jsPDF, orgName: string, docTitle: string, generated: string) {
  const { margin, pageW, stripeH } = T;
  const topY = stripeH + 11;

  // Left: org name
  font(doc, 'helvetica', 'bold', 7.5);
  ink(doc, T.ink500);
  doc.text(orgName.toUpperCase(), margin, topY);

  // Centre: document title
  font(doc, 'helvetica', 'bold', 7.5);
  ink(doc, T.ink800);
  doc.text(docTitle.toUpperCase(), pageW / 2, topY, { align: 'center' });

  // Right: generated timestamp
  font(doc, 'helvetica', 'normal', 7);
  ink(doc, T.ink300);
  doc.text(generated, pageW - margin, topY, { align: 'right' });

  // Hairline below header
  stroke(doc, T.ink300, 0.35);
  doc.line(margin, topY + 5, pageW - margin, topY + 5);
}

function drawPageFooter(doc: jsPDF, pageNo: number, pageCount: number, ref: string) {
  const { margin, pageW, footerY } = T;

  stroke(doc, T.ink300, 0.35);
  doc.line(margin, footerY - 8, pageW - margin, footerY - 8);

  font(doc, 'helvetica', 'normal', 7);
  ink(doc, T.ink500);
  doc.text('Payvexo — secure payment & dues platform', margin, footerY);

  font(doc, 'courier', 'normal', 7);
  ink(doc, T.ink300);
  doc.text(ref, pageW / 2, footerY, { align: 'center' });

  font(doc, 'helvetica', 'normal', 7);
  ink(doc, T.ink500);
  doc.text(`Page ${pageNo} of ${pageCount}`, pageW - margin, footerY, { align: 'right' });
}

// ─────────────────────────────────────────────────────────────────
// LEDGER BAND — the signature element
// Full-width ruled block, large monospaced figures.
// Appears once at the top of every document.
// ─────────────────────────────────────────────────────────────────
interface LedgerEntry {
  label: string;
  value: string;
  /** If true, renders in accent colour — use for the primary figure only */
  primary?: boolean;
  /** 'positive' | 'negative' | 'neutral' for semantic colour */
  sentiment?: 'positive' | 'negative' | 'neutral';
}

function drawLedgerBand(doc: jsPDF, entries: LedgerEntry[], y: number): number {
  const { margin, pageW } = T;
  const W       = pageW - margin * 2;
  const cols    = entries.length;
  const colW    = W / cols;
  const bandH   = 44;
  const padLeft = 11;

  // Band background
  fill(doc, T.ink100);
  doc.roundedRect(margin, y, W, bandH, 2, 2, 'F');

  // Left accent border
  fill(doc, T.accent);
  doc.rect(margin, y, 2.5, bandH, 'F');

  // Vertical dividers
  stroke(doc, T.ink300, 0.3);
  for (let i = 1; i < cols; i++) {
    const x = margin + colW * i;
    doc.line(x, y + 8, x, y + bandH - 8);
  }

  entries.forEach((e, i) => {
    const x = margin + colW * i + padLeft;

    // Label
    font(doc, 'helvetica', 'normal', 6.5);
    ink(doc, T.ink500);
    doc.text(e.label.toUpperCase(), x, y + 12);

    // Value — large monospaced
    const valueColor: RGB =
      e.primary              ? T.accent  :
      e.sentiment === 'positive' ? T.green  :
      e.sentiment === 'negative' ? T.red    :
                                   T.ink950;

    font(doc, 'courier', 'bold', 13);
    ink(doc, valueColor);

    // Clamp value width to column
    const maxW = colW - padLeft - 8;
    const text = doc.splitTextToSize(e.value, maxW)[0] ?? e.value;
    doc.text(text, x, y + 30);
  });

  resetFont(doc);
  return y + bandH + 14;
}

// ─────────────────────────────────────────────────────────────────
// SECTION HEADING
// Left orange tick + bold uppercase label + full hairline
// ─────────────────────────────────────────────────────────────────
function drawSection(doc: jsPDF, label: string, y: number): number {
  const { margin, pageW } = T;

  fill(doc, T.accent);
  doc.rect(margin, y + 1, 2.5, 9, 'F');

  font(doc, 'helvetica', 'bold', 8.5);
  ink(doc, T.ink950);
  doc.text(label.toUpperCase(), margin + 8, y + 8);

  stroke(doc, T.ink300, 0.35);
  doc.line(margin, y + 13, pageW - margin, y + 13);

  return y + 20;
}

// ─────────────────────────────────────────────────────────────────
// KEY-VALUE DETAIL BLOCK
// Used for member info, report metadata — 3 columns
// ─────────────────────────────────────────────────────────────────
interface KVPair { label: string; value: string; mono?: boolean }

function drawKVBlock(doc: jsPDF, pairs: KVPair[], y: number, cols = 3): number {
  const { margin, pageW } = T;
  const W    = pageW - margin * 2;
  const colW = W / cols;
  const rowH = 22;
  const rows = Math.ceil(pairs.length / cols);

  pairs.forEach((p, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x   = margin + col * colW;
    const fy  = y + row * rowH;

    font(doc, 'helvetica', 'normal', 6.5);
    ink(doc, T.ink500);
    doc.text(p.label.toUpperCase(), x, fy);

    if (p.mono) {
      font(doc, 'courier', 'bold', 9.5);
      ink(doc, T.ink800);
    } else {
      font(doc, 'helvetica', 'bold', 9.5);
      ink(doc, T.ink950);
    }
    doc.text(p.value || '\u2014', x, fy + 10);
  });

  resetFont(doc);
  return y + rows * rowH + 8;
}

// ─────────────────────────────────────────────────────────────────
// TABLE CONFIG — shared autoTable base
// ─────────────────────────────────────────────────────────────────
function tableBase() {
  return {
    theme: 'plain' as const,
    styles: {
      font: 'helvetica' as const,
      fontSize: 8.5,
      cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
      lineColor: T.ink300 as [number, number, number],
      lineWidth: 0.3,
      textColor: T.ink800 as [number, number, number],
      overflow: 'linebreak' as const,
    },
    headStyles: {
      fillColor: T.ink950 as [number, number, number],
      textColor: T.white  as [number, number, number],
      fontStyle:  'bold'  as const,
      fontSize:   7.5,
      cellPadding: { top: 6, right: 8, bottom: 6, left: 8 },
    },
    alternateRowStyles: {
      fillColor: T.ink100 as [number, number, number],
    },
    margin: { left: T.margin, right: T.margin },
  };
}

// ─────────────────────────────────────────────────────────────────
// STATUS CELL — coloured dot + label, used inside table cells
// ─────────────────────────────────────────────────────────────────
function statusText(status: string): string {
  // Plain text — no emoji, no box drawing
  const s = (status || '').toLowerCase();
  if (s === 'approved' || s === 'paid' || s === 'active') return `+ ${statusLabel(status)}`;
  if (s === 'pending')                                     return `~ ${statusLabel(status)}`;
  if (s === 'rejected' || s === 'failed')                  return `- ${statusLabel(status)}`;
  if (s === 'waived')                                      return `* ${statusLabel(status)}`;
  return statusLabel(status);
}

// ─────────────────────────────────────────────────────────────────
// DOCUMENT BOOTSTRAP — creates doc, draws first-page chrome
// Returns { doc, y, generated, ref }
// ─────────────────────────────────────────────────────────────────
interface DocSetup {
  doc:       jsPDF;
  y:         number;
  generated: string;
  ref:       string;
}

function bootstrap(
  orgName:   string,
  docTitle:  string,
  subtitle?: string,
  refSeed?:  string,
): DocSetup {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'a4' });

  const generated = new Date().toLocaleString('en-NG', {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const ref = stableRef(refSeed ?? orgName + docTitle + new Date().toISOString().slice(0, 10));

  drawTopStripe(doc);
  drawPageHeader(doc, orgName, docTitle, generated);

  let y = T.stripeH + 28;

  // Document title block
  font(doc, 'helvetica', 'bold', 20);
  ink(doc, T.ink950);
  doc.text(docTitle, T.margin, y);
  y += 6;

  if (subtitle) {
    font(doc, 'helvetica', 'normal', 9.5);
    ink(doc, T.ink500);
    doc.text(subtitle, T.margin, y + 10);
    y += 18;
  }

  y += 14;
  return { doc, y, generated, ref };
}

/** Stamp footer on every page once all content is placed */
function finalise(doc: jsPDF, ref: string) {
  const n = doc.getNumberOfPages();
  for (let i = 1; i <= n; i++) {
    doc.setPage(i);
    drawPageFooter(doc, i, n, ref);
  }
}

/** Called in didDrawPage to re-draw header on continuation pages */
function onNewPage(doc: jsPDF, orgName: string, docTitle: string, generated: string) {
  drawTopStripe(doc);
  drawPageHeader(doc, orgName, docTitle, generated);
}

// ─────────────────────────────────────────────────────────────────
// PUBLIC TYPES (unchanged API)
// ─────────────────────────────────────────────────────────────────
export interface Student {
  id:            string;
  full_name:     string;
  reg_number:    string;
  email?:        string;
  phone?:        string;
  level?:        string;
  department?:   string;
  section?:      string;
  is_active:     boolean;
  is_admin?:     boolean;
  is_finsec?:    boolean;
  is_class_rep?: boolean;
  created_at?:   string;
}

export interface Payment {
  id:              string;
  member_id:       string;
  amount:          number;
  status:          string;
  payment_method?: string;
  transaction_ref?:string;
  created_at:      string;
  approved_at?:    string;
  notes?:          string;
  payment_type?:   { title: string; amount: number };
}

export interface Expense {
  id:           string;
  title:        string;
  description?: string;
  amount:       number;
  category:     string;
  status:       string;
  created_at:   string;
  approved_at?: string;
}

export interface StudentPaymentData {
  id:              string;
  student_name:    string;
  reg_number:      string;
  is_active:       boolean;
  total_paid:      number;
  payment_count:   number;
  categories_paid: string[];
  payments: {
    id:              string;
    amount:          number;
    category:        string;
    payment_type:    string;
    transaction_ref: string;
    status:          string;
    created_at:      string;
  }[];
}

export interface CollectedPaymentsExportData {
  students:            StudentPaymentData[];
  totalCollected:      number;
  totalExpenses:       number;
  netBalance:          number;
  totalStudentsPaid:   number;
  totalStudentsUnpaid: number;
  categoriesBreakdown: {
    category:        string;
    total_collected: number;
    total_expenses:  number;
    net_balance:     number;
    payment_count:   number;
  }[];
  orgName?:  string;
  filters?:  { category?: string; status?: string; payment?: string; search?: string };
}

// ─────────────────────────────────────────────────────────────────
// EXPORT: STUDENTS LIST
// ─────────────────────────────────────────────────────────────────
export function exportStudentsToPDF(
  students: Student[],
  filters?: { status?: string; role?: string },
  orgName = 'Payvexo',
): void {
  const active   = students.filter(s => s.is_active).length;
  const withRole = students.filter(s => s.is_admin || s.is_finsec || s.is_class_rep).length;

  const { doc, y: y0, generated, ref } = bootstrap(
    orgName,
    'Student Directory',
    undefined,
    orgName + 'students' + students.length,
  );
  let y = y0;

  y = drawLedgerBand(doc, [
    { label: 'Total Students', value: students.length.toString() },
    { label: 'Active',         value: active.toString(), sentiment: 'positive' },
    { label: 'Inactive',       value: (students.length - active).toString(), sentiment: 'negative' },
    { label: 'With Roles',     value: withRole.toString(), primary: true },
  ], y);

  if (filters?.status || filters?.role) {
    const parts = [
      filters.status ? `Status: ${filters.status}` : '',
      filters.role   ? `Role: ${filters.role}`     : '',
    ].filter(Boolean).join('  /  ');
    font(doc, 'helvetica', 'normal', 7.5);
    ink(doc, T.ink500);
    doc.text(`Filtered: ${parts}`, T.margin, y);
    y += 14;
  }

  y = drawSection(doc, 'Student Records', y);

  const body = students.map((s, i) => [
    (i + 1).toString(),
    s.full_name,
    s.reg_number,
    s.level      || '\u2014',
    s.department || '\u2014',
    s.is_active ? '+ Active' : '- Inactive',
    [s.is_admin && 'Admin', s.is_finsec && 'FinSec', s.is_class_rep && 'Rep']
      .filter(Boolean).join(', ') || 'Member',
  ]);

  autoTable(doc, {
    ...tableBase(),
    startY: y,
    head: [['#', 'Full Name', 'Reg Number', 'Level', 'Department', 'Status', 'Role']],
    body,
    columnStyles: {
      0: { cellWidth: 20, halign: 'center' as const },
      1: { cellWidth: 70, fontStyle: 'bold' as const },
      2: { cellWidth: 52, font: 'courier' as const },
      3: { cellWidth: 26, halign: 'center' as const },
      4: { cellWidth: 56 },
      5: { cellWidth: 36 },
      6: { cellWidth: 42 },
    },
    didDrawPage: (d) => {
      if (d.pageNumber > 1) onNewPage(doc, orgName, 'Student Directory', generated);
    },
  });

  finalise(doc, ref);
  doc.save(`student-directory-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────
// EXPORT: PAYMENT HISTORY / STATEMENT
// ─────────────────────────────────────────────────────────────────
export function exportPaymentsToPDF(
  payments: Payment[],
  student?: {
    full_name:  string;
    reg_number: string;
    email?:     string;
    level?:     string;
    department?:string;
  },
  orgName = 'Payvexo',
): void {
  const approved  = payments.filter(p => p.status === 'approved');
  const pending   = payments.filter(p => p.status === 'pending');
  const rejected  = payments.filter(p => p.status === 'rejected');
  const totalPaid = approved.reduce((s, p) => s + Number(p.amount), 0);

  const title    = student ? 'Payment Statement' : 'Payments Report';
  const subtitle = student
    ? `${student.full_name}  \u00B7  ${student.reg_number}`
    : `All payments \u00B7 ${payments.length} records`;

  const { doc, y: y0, generated, ref } = bootstrap(
    orgName,
    title,
    subtitle,
    orgName + (student?.reg_number ?? 'all') + 'payments',
  );
  let y = y0;

  y = drawLedgerBand(doc, [
    { label: 'Net Paid',    value: naira(totalPaid), primary: true },
    { label: 'Approved',    value: approved.length.toString(), sentiment: 'positive' },
    { label: 'Pending',     value: pending.length.toString(), sentiment: 'neutral' },
    { label: 'Rejected',    value: rejected.length.toString(), sentiment: 'negative' },
  ], y);

  // Member details block (individual statement only)
  if (student) {
    y = drawSection(doc, 'Member Information', y);
    y = drawKVBlock(doc, [
      { label: 'Full Name',   value: student.full_name },
      { label: 'Reg Number',  value: student.reg_number, mono: true },
      { label: 'Email',       value: student.email       || '\u2014' },
      { label: 'Level',       value: student.level       || '\u2014' },
      { label: 'Department',  value: student.department  || '\u2014' },
      { label: 'Session',     value: `${new Date().getFullYear()}/${new Date().getFullYear() + 1}` },
    ], y, 3);
  }

  // Breakdown by payment type (approved only)
  const byType: Record<string, { paid: number; count: number; expected: number }> = {};
  approved.forEach(p => {
    if (!p.payment_type) return;
    const k = p.payment_type.title;
    byType[k] ??= { paid: 0, count: 0, expected: p.payment_type.amount };
    byType[k].paid  += Number(p.amount);
    byType[k].count += 1;
  });

  const typeEntries = Object.entries(byType);
  if (typeEntries.length > 0) {
    y = drawSection(doc, 'Breakdown by Payment Type', y);
    autoTable(doc, {
      ...tableBase(),
      startY: y,
      head: [['Payment Type', 'Payments', 'Paid', 'Expected', 'Difference']],
      body: typeEntries.map(([type, d]) => [
        type,
        d.count.toString(),
        naira(d.paid),
        naira(d.expected),
        naira(d.paid - d.expected),
      ]),
      columnStyles: {
        0: { cellWidth: 90,  fontStyle: 'bold' as const },
        1: { cellWidth: 36,  halign: 'center' as const },
        2: { cellWidth: 72,  halign: 'right' as const, font: 'courier' as const },
        3: { cellWidth: 72,  halign: 'right' as const, font: 'courier' as const },
        4: { cellWidth: 72,  halign: 'right' as const, font: 'courier' as const },
      },
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  // Full transaction history
  y = drawSection(doc, 'Transaction History', y);
  autoTable(doc, {
    ...tableBase(),
    startY: y,
    head: [['#', 'Date', 'Payment Type', 'Amount', 'Method', 'Reference', 'Status']],
    body: payments.map((p, i) => [
      (i + 1).toString(),
      fmtDate(p.created_at),
      p.payment_type?.title || '\u2014',
      naira(Number(p.amount)),
      p.payment_method ? titleCase(p.payment_method) : '\u2014',
      p.transaction_ref?.slice(0, 16) || '\u2014',
      statusText(p.status),
    ]),
    columnStyles: {
      0: { cellWidth: 20,  halign: 'center' as const },
      1: { cellWidth: 48 },
      2: { cellWidth: 70,  fontStyle: 'bold' as const },
      3: { cellWidth: 68,  halign: 'right' as const, font: 'courier' as const },
      4: { cellWidth: 44 },
      5: { cellWidth: 60,  font: 'courier' as const },
      6: { cellWidth: 46 },
    },
    didDrawPage: (d) => {
      if (d.pageNumber > 1) onNewPage(doc, orgName, title, generated);
    },
  });

  finalise(doc, ref);
  const slug = student
    ? `payment-statement-${student.reg_number.replace(/\//g, '-')}`
    : 'payments-report';
  doc.save(`${slug}-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────
// EXPORT: EXPENSES
// ─────────────────────────────────────────────────────────────────
export function exportExpensesToPDF(
  expenses: Expense[],
  dateRange?: { from: string; to: string },
  orgName = 'Payvexo',
): void {
  const approved      = expenses.filter(e => e.status === 'approved');
  const pending       = expenses.filter(e => e.status === 'pending');
  const totalApproved = approved.reduce((s, e) => s + Number(e.amount), 0);
  const totalPending  = pending.reduce((s, e) => s + Number(e.amount), 0);

  const subtitle = dateRange
    ? `Period: ${dateRange.from} \u2013 ${dateRange.to}`
    : undefined;

  const { doc, y: y0, generated, ref } = bootstrap(
    orgName, 'Expense Report', subtitle, orgName + 'expenses',
  );
  let y = y0;

  y = drawLedgerBand(doc, [
    { label: 'Total Approved', value: naira(totalApproved), primary: true },
    { label: 'Pending',        value: naira(totalPending), sentiment: 'neutral' },
    { label: 'Approved',       value: approved.length.toString(), sentiment: 'positive' },
    { label: 'Total Records',  value: expenses.length.toString() },
  ], y);

  // Category summary
  const byCat: Record<string, number> = {};
  approved.forEach(e => { byCat[e.category] = (byCat[e.category] || 0) + Number(e.amount); });
  const catEntries = Object.entries(byCat).sort(([,a],[,b]) => b - a);

  if (catEntries.length > 0) {
    y = drawSection(doc, 'Breakdown by Category', y);
    autoTable(doc, {
      ...tableBase(),
      startY: y,
      tableWidth: 260,
      head: [['Category', 'Amount (NGN)', 'Share']],
      body: catEntries.map(([cat, amt]) => [
        titleCase(cat),
        naira(amt),
        `${((amt / totalApproved) * 100).toFixed(1)}%`,
      ]),
      columnStyles: {
        0: { cellWidth: 110, fontStyle: 'bold' as const },
        1: { cellWidth: 90,  halign: 'right' as const, font: 'courier' as const },
        2: { cellWidth: 60,  halign: 'right' as const },
      },
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  y = drawSection(doc, 'Expense Records', y);
  autoTable(doc, {
    ...tableBase(),
    startY: y,
    head: [['#', 'Title', 'Category', 'Amount', 'Status', 'Date']],
    body: expenses.map((e, i) => [
      (i + 1).toString(),
      e.title,
      titleCase(e.category),
      naira(Number(e.amount)),
      statusText(e.status),
      fmtDate(e.created_at),
    ]),
    columnStyles: {
      0: { cellWidth: 22,  halign: 'center' as const },
      1: { cellWidth: 110, fontStyle: 'bold' as const },
      2: { cellWidth: 70 },
      3: { cellWidth: 80,  halign: 'right' as const, font: 'courier' as const },
      4: { cellWidth: 50 },
      5: { cellWidth: 50 },
    },
    didDrawPage: (d) => {
      if (d.pageNumber > 1) onNewPage(doc, orgName, 'Expense Report', generated);
    },
  });

  finalise(doc, ref);
  doc.save(`expense-report-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────
// EXPORT: FINANCIAL SUMMARY
// ─────────────────────────────────────────────────────────────────
export function exportFinancialSummaryToPDF(data: {
  totalCollected:    number;
  totalExpenses:     number;
  balance:           number;
  studentsCount:     number;
  paymentsCount:     number;
  expensesCount:     number;
  collectionsByType: Array<{ title: string; amount: number; count: number }>;
  expensesByCategory:Array<{ category: string; amount: number }>;
  orgName?:          string;
}): void {
  const org = data.orgName ?? 'Payvexo';

  const { doc, y: y0, ref } = bootstrap(
    org, 'Financial Summary', 'Class Fund Overview', org + 'summary',
  );
  let y = y0;

  y = drawLedgerBand(doc, [
    { label: 'Total Collected', value: naira(data.totalCollected), primary: true },
    { label: 'Total Expenses',  value: naira(data.totalExpenses), sentiment: 'negative' },
    { label: 'Balance',         value: naira(data.balance), sentiment: data.balance >= 0 ? 'positive' : 'negative' },
  ], y);

  y = drawLedgerBand(doc, [
    { label: 'Members',  value: data.studentsCount.toString() },
    { label: 'Payments', value: data.paymentsCount.toString() },
    { label: 'Expenses', value: data.expensesCount.toString() },
  ], y);

  if (data.collectionsByType.length) {
    y = drawSection(doc, 'Collections by Payment Type', y);
    autoTable(doc, {
      ...tableBase(),
      startY: y,
      tableWidth: 280,
      head: [['Payment Type', 'Count', 'Total (NGN)']],
      body: data.collectionsByType.map(c => [c.title, c.count.toString(), naira(c.amount)]),
      columnStyles: {
        0: { cellWidth: 120, fontStyle: 'bold' as const },
        1: { cellWidth: 40,  halign: 'center' as const },
        2: { cellWidth: 120, halign: 'right' as const, font: 'courier' as const },
      },
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  if (data.expensesByCategory.length) {
    y = drawSection(doc, 'Expenses by Category', y);
    const total = data.expensesByCategory.reduce((s, e) => s + e.amount, 0);
    autoTable(doc, {
      ...tableBase(),
      startY: y,
      tableWidth: 280,
      head: [['Category', 'Amount (NGN)', 'Share']],
      body: data.expensesByCategory.map(e => [
        titleCase(e.category),
        naira(e.amount),
        `${total > 0 ? ((e.amount / total) * 100).toFixed(1) : '0.0'}%`,
      ]),
      columnStyles: {
        0: { cellWidth: 120, fontStyle: 'bold' as const },
        1: { cellWidth: 100, halign: 'right' as const, font: 'courier' as const },
        2: { cellWidth: 60,  halign: 'right' as const },
      },
    });
  }

  finalise(doc, ref);
  doc.save(`financial-summary-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────
// EXPORT: COLLECTED PAYMENTS (admin overview)
// ─────────────────────────────────────────────────────────────────
export function exportCollectedPaymentsToPDF(data: CollectedPaymentsExportData): void {
  const org = data.orgName ?? 'Payvexo';

  const { doc, y: y0, generated, ref } = bootstrap(
    org, 'Payment Collection Report', 'Student Payment Breakdown', org + 'collection',
  );
  let y = y0;

  y = drawLedgerBand(doc, [
    { label: 'Total Collected', value: naira(data.totalCollected), primary: true },
    { label: 'Total Expenses',  value: naira(data.totalExpenses), sentiment: 'negative' },
    { label: 'Net Balance',     value: naira(data.netBalance), sentiment: data.netBalance >= 0 ? 'positive' : 'negative' },
  ], y);

  y = drawLedgerBand(doc, [
    { label: 'Paid',    value: data.totalStudentsPaid.toString(), sentiment: 'positive' },
    { label: 'Unpaid',  value: data.totalStudentsUnpaid.toString(), sentiment: 'negative' },
    { label: 'Total',   value: (data.totalStudentsPaid + data.totalStudentsUnpaid).toString() },
  ], y);

  // Active filters strip
  if (data.filters) {
    const parts = [
      data.filters.category && data.filters.category !== 'all' ? `Category: ${data.filters.category}` : '',
      data.filters.status   && data.filters.status   !== 'all' ? `Status: ${data.filters.status}`     : '',
      data.filters.payment  && data.filters.payment  !== 'all' ? `Payment: ${data.filters.payment}`   : '',
      data.filters.search   ? `Search: "${data.filters.search}"` : '',
    ].filter(Boolean).join('  /  ');

    if (parts) {
      font(doc, 'helvetica', 'normal', 7.5);
      ink(doc, T.ink500);
      doc.text(`Applied filters: ${parts}`, T.margin, y);
      y += 14;
    }
  }

  // Category breakdown
  if (data.categoriesBreakdown.length > 0) {
    y = drawSection(doc, 'Category Breakdown', y);
    autoTable(doc, {
      ...tableBase(),
      startY: y,
      head: [['Category', 'Payments', 'Collected', 'Expenses', 'Net Balance']],
      body: data.categoriesBreakdown.map(c => [
        titleCase(c.category),
        c.payment_count.toString(),
        naira(c.total_collected),
        naira(c.total_expenses),
        naira(c.net_balance),
      ]),
      columnStyles: {
        0: { cellWidth: 80,  fontStyle: 'bold' as const },
        1: { cellWidth: 38,  halign: 'center' as const },
        2: { cellWidth: 82,  halign: 'right' as const, font: 'courier' as const },
        3: { cellWidth: 82,  halign: 'right' as const, font: 'courier' as const },
        4: { cellWidth: 82,  halign: 'right' as const, font: 'courier' as const },
      },
      didDrawPage: (d) => {
        if (d.pageNumber > 1) onNewPage(doc, org, 'Payment Collection Report', generated);
      },
    });
    y = doc.lastAutoTable.finalY + 16;
  }

  y = drawSection(doc, 'Student Payment Details', y);
  autoTable(doc, {
    ...tableBase(),
    startY: y,
    head: [['#', 'Student Name', 'Reg Number', 'Status', 'Total Paid', 'Payments', 'Categories']],
    body: data.students.map((s, i) => [
      (i + 1).toString(),
      s.student_name,
      s.reg_number,
      s.is_active ? '+ Active' : '- Inactive',
      naira(s.total_paid),
      s.payment_count.toString(),
      s.categories_paid.map(c => titleCase(c)).join(', ') || '\u2014',
    ]),
    columnStyles: {
      0: { cellWidth: 20,  halign: 'center' as const },
      1: { cellWidth: 80,  fontStyle: 'bold' as const },
      2: { cellWidth: 58,  font: 'courier' as const },
      3: { cellWidth: 40 },
      4: { cellWidth: 72,  halign: 'right' as const, font: 'courier' as const },
      5: { cellWidth: 30,  halign: 'center' as const },
      6: { cellWidth: 80 },
    },
    didDrawPage: (d) => {
      if (d.pageNumber > 1) onNewPage(doc, org, 'Payment Collection Report', generated);
    },
  });

  finalise(doc, ref);
  doc.save(`student-payments-${new Date().toISOString().slice(0, 10)}.pdf`);
}

// ─────────────────────────────────────────────────────────────────
// GENERIC TABLE EXPORTER — unchanged public API
// ─────────────────────────────────────────────────────────────────
export interface PdfTableColumn<Row = Record<string, unknown>> {
  key:     keyof Row & string;
  label:   string;
  align?:  'left' | 'center' | 'right';
  width?:  number;
  mono?:   boolean;
  format?: (value: unknown, row: Row) => string;
}

export interface PdfTableExportInput<Row = Record<string, unknown>> {
  title:         string;
  subtitle?:     string;
  orgName:       string;
  accentColor?:  string;
  appName?:      string;
  columns:       PdfTableColumn<Row>[];
  rows:          Row[];
  summary?:      Array<{ label: string; value: string }>;
  filenameSlug?: string;
}

export function exportTableToPDF<Row extends Record<string, unknown>>(
  input: PdfTableExportInput<Row>,
): string {
  const { title, subtitle, orgName, columns, rows, summary, filenameSlug } = input;

  const { doc, y: y0, generated, ref } = bootstrap(
    orgName, title, subtitle, orgName + title,
  );
  let y = y0;

  y = drawLedgerBand(doc, [
    { label: 'Records',   value: rows.length.toString() },
    { label: 'Reference', value: ref, primary: true },
    { label: 'Generated', value: new Date().toLocaleDateString('en-NG') },
  ], y);

  y = drawSection(doc, title, y);

  const head = [columns.map(c => c.label.toUpperCase())];
  const body = rows.map(r =>
    columns.map(c => {
      const v = r[c.key];
      if (c.format) return c.format(v, r);
      return v == null ? '\u2014' : String(v);
    }),
  );

  const colStyles = columns.reduce<Record<number, object>>((acc, col, i) => {
    acc[i] = {
      halign: col.align ?? 'left',
      ...(col.mono  ? { font: 'courier' as const }   : {}),
      ...(col.width ? { cellWidth: col.width }        : {}),
    };
    return acc;
  }, {});

  autoTable(doc, {
    ...tableBase(),
    startY: y,
    head,
    body,
    columnStyles: colStyles,
    didDrawPage: (d) => {
      if (d.pageNumber > 1) onNewPage(doc, orgName, title, generated);
    },
  });

  // Summary totals below table
  if (summary?.length) {
    const fy = doc.lastAutoTable?.finalY ?? y + 100;
    let sy = fy + 20;

    stroke(doc, T.ink300, 0.35);
    doc.line(T.margin, sy - 6, T.pageW - T.margin, sy - 6);

    summary.forEach((s, i) => {
      font(doc, 'helvetica', 'normal', 7.5);
      ink(doc, T.ink500);
      doc.text(s.label.toUpperCase(), T.margin, sy);

      if (i === 0) {
        font(doc, 'courier', 'bold', 15);
        ink(doc, T.accent);
      } else {
        font(doc, 'courier', 'bold', 10);
        ink(doc, T.ink950);
      }
      doc.text(s.value, T.pageW - T.margin, sy, { align: 'right' });
      resetFont(doc);
      sy += i === 0 ? 22 : 15;
    });
  }

  finalise(doc, ref);
  const slug = (filenameSlug ?? title.toLowerCase().replace(/[^a-z0-9]+/g, '-')).slice(0, 60);
  const filename = `${slug}-${new Date().toISOString().slice(0, 10)}.pdf`;
  doc.save(filename);
  return filename;
}

// ─────────────────────────────────────────────────────────────────
// RECEIPT — HTML print window
// System font stack — no Google Fonts, works fully offline.
// Stripe-inspired: monospaced refs, single orange strip, clean air.
// ─────────────────────────────────────────────────────────────────
export function generatePaymentReceiptPDF(payment: {
  id:              string;
  amount:          number;
  status:          string;
  payment_method:  string;
  transaction_ref: string;
  created_at:      string;
  approved_at?:    string;
  payment_type:    { title: string; amount: number };
  student:         { full_name: string; reg_number: string; email?: string; level?: string };
  orgName?:        string;
}): void {
  // Use transaction_ref prefix to detect waived — not a .waived field
  const isWaived   = (payment.transaction_ref ?? '').startsWith('WAIVED-');
  const isApproved = payment.status === 'approved';
  const isPending  = payment.status === 'pending';

  const ref = stableRef(payment.id + payment.amount + payment.status);

  const statusCfg = isWaived
    ? { bg: '#eef2ff', fg: '#4338ca', dot: '#6366f1', label: 'WAIVED'   }
    : isApproved
    ? { bg: '#ecfdf5', fg: '#065f46', dot: '#059669', label: 'APPROVED' }
    : isPending
    ? { bg: '#fffbeb', fg: '#92400e', dot: '#d97706', label: 'PENDING'  }
    : { bg: '#fef2f2', fg: '#991b1b', dot: '#dc2626', label: 'REJECTED' };

  const orgName = payment.orgName ?? 'Payvexo';

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Receipt \u00B7 ${payment.student.full_name}</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --ink:    #0e0b09;
    --muted:  #5a524c;
    --faint:  #a09890;
    --rule:   #e5e0db;
    --bg:     #f5f3f0;
    --white:  #ffffff;
    --orange: #FF6803;
    --s-bg:   ${statusCfg.bg};
    --s-fg:   ${statusCfg.fg};
    --s-dot:  ${statusCfg.dot};
    /* System font stack — no external requests, works offline */
    --mono: ui-monospace, 'Cascadia Code', 'Source Code Pro', Menlo, Consolas, 'Courier New', monospace;
    --sans: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
  }
  body {
    font-family: var(--sans);
    background: var(--bg);
    color: var(--ink);
    -webkit-font-smoothing: antialiased;
    font-size: 13px;
    line-height: 1.5;
  }

  .shell {
    max-width: 640px;
    margin: 32px auto 48px;
    background: var(--white);
    box-shadow: 0 2px 24px rgba(0,0,0,0.08);
  }

  .top-stripe { height: 4px; background: var(--orange); }

  .header {
    padding: 24px 32px 20px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    border-bottom: 1px solid var(--rule);
  }
  .brand-wrap { display: flex; align-items: center; gap: 10px; }
  .brand-mark {
    width: 34px; height: 34px;
    background: #0e0b09;
    border-radius: 7px;
    display: flex; align-items: center; justify-content: center;
    flex-shrink: 0;
  }
  .brand-mark-bars {
    display: flex; align-items: flex-end; gap: 3px; height: 18px;
  }
  .bar { width: 4px; border-radius: 1px; background: var(--orange); }
  .brand-name { font-size: 15px; font-weight: 800; letter-spacing: -0.4px; }
  .brand-name span { color: var(--orange); }
  .brand-sub { font-size: 9px; color: var(--faint); text-transform: uppercase; letter-spacing: 2px; }

  .header-right { text-align: right; }
  .doc-label { font-size: 9px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: var(--orange); margin-bottom: 8px; }
  .doc-meta { font-size: 10.5px; color: var(--muted); line-height: 1.9; font-family: var(--mono); }

  .body { padding: 24px 32px 28px; }

  /* Hero: status + amount in a 2-up block */
  .hero { display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-bottom: 24px; }
  .hero-cell { padding: 16px 18px; border-radius: 6px; }
  .hero-cell.status-cell { background: var(--s-bg); }
  .hero-cell.amount-cell { background: var(--ink); }
  .h-label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; margin-bottom: 8px; }
  .hero-cell.status-cell .h-label { color: var(--s-fg); }
  .hero-cell.amount-cell .h-label { color: rgba(255,255,255,0.45); }
  .h-value { font-size: 22px; font-weight: 800; line-height: 1; }
  .hero-cell.status-cell .h-value { color: var(--s-dot); }
  .hero-cell.amount-cell .h-value { color: #fff; font-family: var(--mono); letter-spacing: -0.5px; }
  .status-pip { display: inline-block; width: 7px; height: 7px; border-radius: 50%; background: var(--s-dot); margin-right: 5px; vertical-align: middle; position: relative; top: -1px; }

  .section-rule {
    font-size: 8.5px; font-weight: 700; text-transform: uppercase;
    letter-spacing: 2px; color: var(--faint);
    border-bottom: 1px solid var(--rule);
    padding-bottom: 5px; margin: 20px 0 12px;
  }

  /* KV grid: 3 columns, bordered cells */
  .kv { display: grid; grid-template-columns: 1fr 1fr 1fr; border: 1px solid var(--rule); border-radius: 5px; overflow: hidden; }
  .kv-cell { padding: 9px 13px; border-right: 1px solid var(--rule); border-bottom: 1px solid var(--rule); }
  .kv-cell:nth-child(3n) { border-right: none; }
  .kv-cell:nth-last-child(-n+3) { border-bottom: none; }
  .kv-label { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--faint); margin-bottom: 3px; }
  .kv-value { font-size: 12px; font-weight: 600; color: var(--ink); }
  .kv-value.mono { font-family: var(--mono); font-size: 11px; }
  .kv-value.accent { color: var(--orange); }

  /* Transaction lines */
  .tx { width: 100%; border-collapse: collapse; }
  .tx tr { border-bottom: 1px solid var(--rule); }
  .tx tr:last-child { border-bottom: none; }
  .tx td { padding: 8px 0; font-size: 12.5px; vertical-align: middle; }
  .tx td:first-child { color: var(--muted); width: 44%; }
  .tx td:last-child { text-align: right; font-weight: 600; font-family: var(--mono); }
  .tx-badge { display: inline-block; padding: 2px 8px; border-radius: 20px; font-size: 9px; font-weight: 700; background: var(--s-bg); color: var(--s-fg); font-family: var(--sans); }

  /* Total */
  .total-row {
    display: flex; justify-content: space-between; align-items: baseline;
    background: var(--bg); border-radius: 5px; padding: 12px 16px; margin-top: 12px;
  }
  .total-label { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: var(--muted); }
  .total-amount { font-size: 22px; font-weight: 800; font-family: var(--mono); color: var(--ink); }

  /* Verification */
  .verify {
    margin-top: 24px; padding-top: 16px;
    border-top: 2px dashed var(--rule);
    display: flex; justify-content: space-between; align-items: flex-end;
    gap: 16px;
  }
  .verify-text { font-size: 9px; color: var(--faint); line-height: 2; }
  .verify-ref { font-family: var(--mono); font-size: 10px; color: var(--orange); font-weight: 600; }
  .sig-block { text-align: center; flex-shrink: 0; }
  .sig-line { border-top: 1px solid var(--ink); margin-bottom: 5px; width: 130px; margin-top: 30px; }
  .sig-label { font-size: 7.5px; text-transform: uppercase; letter-spacing: 2px; color: var(--faint); }

  .footer {
    background: var(--bg); border-top: 1px solid var(--rule);
    padding: 12px 32px;
    display: flex; justify-content: space-between; align-items: center;
    font-size: 9px; color: var(--faint); line-height: 1.8;
  }
  .footer strong { color: var(--orange); font-size: 10px; }
  .footer-right { text-align: right; }

  .print-btn-wrap { max-width: 640px; margin: 0 auto 40px; display: flex; justify-content: center; gap: 10px; }
  .btn {
    padding: 11px 28px; border: none; border-radius: 5px; cursor: pointer;
    font-size: 13px; font-weight: 600; font-family: var(--sans);
  }
  .btn-primary { background: var(--ink); color: #fff; }
  .btn-primary:hover { background: #1e1814; }

  @media print {
    body { background: #fff; }
    .shell { box-shadow: none; margin: 0; }
    .print-btn-wrap { display: none !important; }
  }
  @media (max-width: 560px) {
    .header, .body, .footer { padding-left: 18px; padding-right: 18px; }
    .hero { grid-template-columns: 1fr; }
    .kv { grid-template-columns: 1fr 1fr; }
    .kv-cell:nth-child(2n) { border-right: none; }
    .kv-cell:nth-child(3n) { border-right: 1px solid var(--rule); }
    .verify { flex-direction: column; }
  }
</style>
</head>
<body>
<div class="shell">
  <div class="top-stripe"></div>

  <div class="header">
    <div class="brand-wrap">
      <div class="brand-mark">
        <div class="brand-mark-bars">
          <div class="bar" style="height:8px"></div>
          <div class="bar" style="height:13px"></div>
          <div class="bar" style="height:18px"></div>
        </div>
      </div>
      <div>
        <div class="brand-name">Pay<span>vexo</span></div>
        <div class="brand-sub">Official Receipt</div>
      </div>
    </div>
    <div class="header-right">
      <div class="doc-label">Payment Receipt</div>
      <div class="doc-meta">
        ${fmtDate(payment.created_at)}<br>
        Ref: ${ref}<br>
        Org: ${orgName}
      </div>
    </div>
  </div>

  <div class="body">
    <div class="hero">
      <div class="hero-cell status-cell">
        <div class="h-label">Status</div>
        <div class="h-value"><span class="status-pip"></span>${statusCfg.label}</div>
      </div>
      <div class="hero-cell amount-cell">
        <div class="h-label">${isWaived ? 'Amount Waived' : 'Amount Paid'}</div>
        <div class="h-value">${nairaSymbol(payment.amount)}</div>
      </div>
    </div>

    <div class="section-rule">Member Information</div>
    <div class="kv">
      <div class="kv-cell"><div class="kv-label">Full Name</div><div class="kv-value">${payment.student.full_name}</div></div>
      <div class="kv-cell"><div class="kv-label">Reg / Member ID</div><div class="kv-value mono accent">${payment.student.reg_number}</div></div>
      <div class="kv-cell"><div class="kv-label">Level</div><div class="kv-value">${payment.student.level || '\u2014'}</div></div>
      <div class="kv-cell"><div class="kv-label">Email</div><div class="kv-value">${payment.student.email || '\u2014'}</div></div>
      <div class="kv-cell"><div class="kv-label">Organization</div><div class="kv-value">${orgName}</div></div>
      <div class="kv-cell"><div class="kv-label">Session</div><div class="kv-value">${new Date().getFullYear()}/${new Date().getFullYear() + 1}</div></div>
    </div>

    <div class="section-rule">Transaction Details</div>
    <table class="tx">
      <tr><td>Payment type</td><td>${payment.payment_type.title}</td></tr>
      <tr><td>Target amount</td><td>${nairaSymbol(payment.payment_type.amount)}</td></tr>
      <tr><td>${isWaived ? 'Amount waived' : 'Amount paid'}</td><td style="color:var(--orange)">${nairaSymbol(payment.amount)}</td></tr>
      <tr><td>Payment method</td><td style="font-family:var(--sans);font-size:12px">${payment.payment_method ? titleCase(payment.payment_method) : 'Bank Transfer'}</td></tr>
      <tr><td>Reference</td><td>${payment.transaction_ref || '\u2014'}</td></tr>
      <tr><td>Submitted</td><td style="font-family:var(--sans);font-size:12px">${fmtDateTime(payment.created_at)}</td></tr>
      ${payment.approved_at ? `<tr><td>${isWaived ? 'Waived on' : 'Approved on'}</td><td style="font-family:var(--sans);font-size:12px">${fmtDateTime(payment.approved_at)}</td></tr>` : ''}
      <tr><td>Status</td><td><span class="tx-badge">${statusCfg.label}</span></td></tr>
    </table>

    <div class="total-row">
      <span class="total-label">${isWaived ? 'Total waived' : 'Total paid'}</span>
      <span class="total-amount">${nairaSymbol(payment.amount)}</span>
    </div>

    <div class="verify">
      <div class="verify-text">
        Document reference: <span class="verify-ref">${ref}</span><br>
        Electronically generated \u2014 no physical signature required.<br>
        Issued by Payvexo on ${fmtDate(new Date().toISOString())}
      </div>
      <div class="sig-block">
        <div class="sig-line"></div>
        <div class="sig-label">Authorised Signatory</div>
      </div>
    </div>
  </div>

  <div class="footer">
    <div><strong>Payvexo</strong><br>Secure Payment & Dues Platform<br>@wishotstudio</div>
    <div class="footer-right">Official Receipt<br>${fmtDate(new Date().toISOString())}<br>${ref}</div>
  </div>
</div>

<div class="print-btn-wrap">
  <button class="btn btn-primary" onclick="window.print()">Print / Save as PDF</button>
</div>
</body>
</html>`;

  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);

  if (isIOS) {
    let frame = document.getElementById('pvx-receipt-frame') as HTMLIFrameElement;
    if (!frame) {
      frame = document.createElement('iframe');
      frame.id = 'pvx-receipt-frame';
      frame.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:none;';
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

// ─────────────────────────────────────────────────────────────────
export default {
  exportStudentsToPDF,
  exportPaymentsToPDF,
  exportExpensesToPDF,
  exportFinancialSummaryToPDF,
  exportCollectedPaymentsToPDF,
  generatePaymentReceiptPDF,
  exportTableToPDF,
};