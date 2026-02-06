/**
 * Shared Print Styles Utility
 * Beautiful, professional HTML-based print layouts for all exports
 * Uses the same styling as QuickPaymentSummary for consistency
 * 
 * @author Dev_Wishot
 * @copyright Dev_Wishot - @wishotstudio
 */

// Detect iOS device
export const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

/**
 * Format currency with Naira symbol
 */
export function formatNaira(amount: number): string {
  const num = Number(amount);
  return `₦${(isNaN(num) ? 0 : num).toLocaleString()}`;
}

/**
 * Format date nicely
 */
export function formatDate(dateString: string, options?: Intl.DateTimeFormatOptions): string {
  return new Date(dateString).toLocaleDateString('en-US', options || { 
    month: 'short', 
    day: 'numeric', 
    year: 'numeric' 
  });
}

/**
 * Generate document ID — deterministic when seed provided
 */
export function generateDocId(seed?: string): string {
  if (seed) {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      hash = ((hash << 5) - hash) + seed.charCodeAt(i);
      hash |= 0;
    }
    return 'DT-' + Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
  }
  return 'DT-' + Math.random().toString(36).substring(2, 8).toUpperCase();
}

/**
 * Get current academic session
 */
export function getAcademicSession(): string {
  const year = new Date().getFullYear();
  return `${year}/${year + 1}`;
}

/**
 * Shared CSS styles for all print documents
 * Premium document-style design matching the QuickPaymentSummary receipt
 */
export const PRINT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap');
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --amber: #FF6803; --amber-light: #FFAC5F; --amber-dark: #CC5202;
    --mint: #30FFAC; --charcoal: #0F0703;
    --slate-900: #0f172a; --slate-700: #334155; --slate-500: #64748b;
    --slate-300: #cbd5e1; --slate-100: #f1f5f9; --slate-50: #f8fafc;
    --green: #059669; --green-bg: #ecfdf5;
    --yellow: #d97706; --yellow-bg: #fffbeb;
    --red: #dc2626; --red-bg: #fef2f2;
  }
  body {
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
    padding: 0;
    color: var(--slate-900);
    background: var(--slate-100);
    line-height: 1.6;
    -webkit-font-smoothing: antialiased;
  }
  .container {
    max-width: 820px;
    margin: 0 auto;
    padding: 20px;
  }
  .card {
    background: white;
    border-radius: 2px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 20px 60px rgba(0,0,0,0.06);
    overflow: hidden;
    margin-bottom: 20px;
    position: relative;
  }
  .accent-bar {
    height: 4px;
    background: linear-gradient(90deg, var(--amber) 0%, var(--amber-light) 50%, var(--mint) 100%);
  }
  .header {
    padding: 28px 36px 22px;
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .header-left { display: flex; align-items: center; gap: 14px; }
  .header h1 {
    font-size: 18px;
    font-weight: 800;
    letter-spacing: -0.5px;
    color: var(--charcoal);
  }
  .header h1 span { color: var(--amber); }
  .header-tagline {
    font-size: 9px; color: var(--slate-500);
    text-transform: uppercase; letter-spacing: 2.5px; margin-top: 1px;
  }
  .header-right { text-align: right; }
  .doc-title {
    font-size: 10px; font-weight: 700;
    text-transform: uppercase; letter-spacing: 3px; color: var(--amber); margin-bottom: 6px;
  }
  .doc-meta { font-size: 10px; color: var(--slate-500); line-height: 1.9; }
  .doc-meta strong { color: var(--slate-700); font-weight: 600; }
  .header p {
    font-size: 10px;
    color: var(--slate-500);
    line-height: 1.9;
  }
  .badge {
    display: inline-block;
    background: rgba(255, 104, 3, 0.08);
    color: var(--amber);
    padding: 4px 12px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 600;
    margin-top: 8px;
    letter-spacing: 0.5px;
  }
  .divider {
    height: 1px;
    background: linear-gradient(90deg, transparent 0%, var(--slate-300) 15%, var(--slate-300) 85%, transparent 100%);
    margin: 0 36px;
  }
  .content { padding: 24px 36px 28px; }
  .section { margin-bottom: 22px; }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    color: var(--slate-700);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    margin-bottom: 12px;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--slate-300);
  }
  .section-icon {
    width: 26px; height: 26px; border-radius: 6px;
    display: inline-flex; align-items: center; justify-content: center;
    font-size: 13px; flex-shrink: 0;
    background: rgba(255, 104, 3, 0.08);
  }
  .info-card {
    border: 1px solid var(--slate-300);
    border-radius: 8px;
    overflow: hidden;
  }
  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0;
  }
  .info-grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0;
  }
  .info-grid .info-cell,
  .info-grid-3 .info-cell {
    padding: 11px 14px;
    border-bottom: 1px solid var(--slate-300);
    border-right: 1px solid var(--slate-300);
  }
  .info-grid .info-cell:nth-child(2n) { border-right: none; }
  .info-grid-3 .info-cell:nth-child(3n) { border-right: none; }
  .info-item,
  .info-cell { display: flex; flex-direction: column; }
  .info-label {
    font-size: 8px;
    font-weight: 600;
    color: var(--slate-500);
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 3px;
  }
  .info-value {
    font-size: 12px;
    font-weight: 600;
    color: var(--slate-900);
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
  }
  .stats-grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
  }
  .stats-grid-6 {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  .stat-card {
    border: 1px solid var(--slate-300);
    border-radius: 8px;
    padding: 14px;
    text-align: center;
    position: relative;
    overflow: hidden;
    background: white;
  }
  .stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
  }
  .stat-card.approved::before { background: var(--green); }
  .stat-card.pending::before { background: var(--yellow); }
  .stat-card.rejected::before { background: var(--red); }
  .stat-card.total::before { background: var(--amber); }
  .stat-card.net::before { background: linear-gradient(90deg, #667eea, #764ba2); }
  .stat-card.balance::before { background: linear-gradient(90deg, var(--green), #10b981); }
  .stat-card.expense::before { background: var(--red); }
  .stat-card.info::before { background: #3b82f6; }
  .stat-value {
    font-size: 22px;
    font-weight: 800;
    margin-bottom: 3px;
    line-height: 1.2;
  }
  .stat-value.approved { color: var(--green); }
  .stat-value.pending { color: var(--yellow); }
  .stat-value.rejected { color: var(--red); }
  .stat-value.total { color: var(--amber); }
  .stat-value.net { color: #667eea; }
  .stat-value.balance { color: var(--green); }
  .stat-value.expense { color: var(--red); }
  .stat-value.info { color: #3b82f6; }
  .stat-label {
    font-size: 8px;
    font-weight: 600;
    color: var(--slate-500);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  .amount-strip {
    display: flex; justify-content: space-between; align-items: center;
    background: linear-gradient(135deg, var(--amber) 0%, var(--amber-light) 100%);
    border-radius: 8px; padding: 14px 18px; margin-top: 10px;
  }
  .amount-strip-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.85); text-transform: uppercase; letter-spacing: 1px; }
  .amount-strip-value { font-size: 22px; font-weight: 800; color: white; }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }
  thead th {
    background: var(--slate-900);
    color: white;
    padding: 9px 10px;
    text-align: left;
    font-weight: 600;
    font-size: 9px;
    text-transform: uppercase;
    letter-spacing: 0.8px;
  }
  thead th:first-child { border-radius: 8px 0 0 0; }
  thead th:last-child { border-radius: 0 8px 0 0; }
  th.green {
    background: var(--green);
  }
  td {
    padding: 9px 10px;
    border-bottom: 1px solid var(--slate-100);
    color: var(--slate-700);
  }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) { background: var(--slate-50); }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 2px 8px;
    border-radius: 20px;
    font-size: 9px;
    font-weight: 600;
  }
  .status::before { content: ''; width: 5px; height: 5px; border-radius: 50%; }
  .status.approved { background: var(--green-bg); color: #065f46; }
  .status.approved::before { background: var(--green); }
  .status.pending { background: var(--yellow-bg); color: #92400e; }
  .status.pending::before { background: var(--yellow); }
  .status.rejected { background: var(--red-bg); color: #991b1b; }
  .status.rejected::before { background: var(--red); }
  .status.waived { background: #eef2ff; color: #4338ca; }
  .status.waived::before { background: #6366f1; }
  .status.active { background: var(--green-bg); color: #065f46; }
  .status.active::before { background: var(--green); }
  .status.inactive { background: var(--red-bg); color: #991b1b; }
  .status.inactive::before { background: var(--red); }
  .status.complete { background: var(--green-bg); color: #065f46; }
  .status.complete::before { background: var(--green); }
  .status.partial { background: var(--yellow-bg); color: #92400e; }
  .status.partial::before { background: var(--yellow); }
  .amount { font-weight: 700; color: var(--slate-900); font-variant-numeric: tabular-nums; }
  .amount.positive { color: var(--green); }
  .amount.negative { color: var(--red); }
  .amount.waived { color: #4338ca; }
  .note-box {
    background: var(--yellow-bg);
    border-radius: 8px;
    padding: 12px 14px;
    display: flex;
    align-items: flex-start;
    gap: 10px;
    border: 1px solid #fcd34d;
    margin-top: 16px;
  }
  .note-icon {
    width: 18px;
    height: 18px;
    background: var(--yellow);
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 10px;
    font-weight: 700;
    flex-shrink: 0;
  }
  .note-text {
    font-size: 10px;
    color: #92400e;
    line-height: 1.6;
  }
  .note-text strong { font-weight: 700; }
  .footer {
    background: var(--slate-50);
    padding: 14px 36px;
    border-top: 1px solid var(--slate-300);
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .footer-brand {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .footer-logo {
    width: 28px;
    height: 28px;
  }
  .footer-text {
    font-size: 9px;
    color: var(--slate-500);
    line-height: 1.6;
  }
  .footer-text strong { color: var(--amber); font-weight: 700; }
  .btn-print {
    padding: 12px 32px; border: none; border-radius: 8px; cursor: pointer;
    font-size: 14px; font-weight: 600; font-family: 'Inter', sans-serif;
    display: flex; align-items: center; justify-content: center;
    gap: 8px; margin: 16px auto 32px; transition: all 0.2s;
    background: linear-gradient(135deg, var(--amber) 0%, var(--amber-light) 100%);
    color: white; box-shadow: 0 4px 14px rgba(255, 104, 3, 0.3);
  }
  .btn-print:hover {
    transform: translateY(-1px);
    box-shadow: 0 6px 20px rgba(255, 104, 3, 0.4);
  }
  .text-right { text-align: right; }
  .text-center { text-align: center; }
  .font-bold { font-weight: 600; }
  .text-sm { font-size: 12px; }
  .text-xs { font-size: 11px; }
  .mt-2 { margin-top: 8px; }
  .mb-2 { margin-bottom: 8px; }

  /* Page Break Support */
  .page {
    background: white;
    border-radius: 2px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 20px 60px rgba(0,0,0,0.06);
    overflow: hidden;
    margin-bottom: 30px;
    page-break-after: always;
    break-after: page;
    position: relative;
  }
  .page:last-child {
    page-break-after: avoid;
    break-after: avoid;
  }
  .page-header {
    padding: 20px 36px;
    display: flex;
    justify-content: space-between;
    align-items: center;
    border-bottom: 1px solid var(--slate-300);
  }
  .page-header-left h2 {
    font-size: 16px;
    font-weight: 800;
    color: var(--charcoal);
    margin-bottom: 2px;
  }
  .page-header-left p {
    font-size: 10px;
    color: var(--slate-500);
  }
  .page-number {
    background: rgba(255, 104, 3, 0.08);
    color: var(--amber);
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
  }
  .page-content {
    padding: 20px 36px;
    min-height: 600px;
  }
  .page-footer {
    background: var(--slate-50);
    padding: 12px 36px;
    border-top: 1px solid var(--slate-300);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 9px;
    color: var(--slate-500);
  }
  .page-footer strong { color: var(--amber); }
  .continuation-note {
    background: rgba(59, 130, 246, 0.05);
    border: 1px solid rgba(59, 130, 246, 0.2);
    border-radius: 8px;
    padding: 12px 16px;
    margin-top: 16px;
    font-size: 11px;
    color: #1e40af;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  @media print {
    body { background: white; padding: 0; }
    .container { padding: 0; max-width: 100%; }
    .card { box-shadow: none; border: 1px solid var(--slate-300); }
    .page {
      box-shadow: none;
      border: 1px solid var(--slate-300);
      margin-bottom: 0;
      border-radius: 0;
    }
    .no-print { display: none !important; }
    .btn-print { display: none !important; }
    tr:hover { background: none; }
    tr:nth-child(even) { background: var(--slate-50); }
    .page-break { page-break-before: always; break-before: page; }
    thead { display: table-header-group; }
    tfoot { display: table-footer-group; }
    tr { page-break-inside: avoid; break-inside: avoid; }
  }
  @media (max-width: 600px) {
    .stats-grid { grid-template-columns: repeat(2, 1fr); }
    .stats-grid-4 { grid-template-columns: repeat(2, 1fr); }
    .stats-grid-6 { grid-template-columns: repeat(3, 1fr); }
    .info-grid { grid-template-columns: 1fr; }
    .info-grid-3 { grid-template-columns: 1fr; }
    table { font-size: 9px; }
    th, td { padding: 7px 6px; }
    .header { padding: 20px; flex-direction: column; gap: 14px; }
    .header h1 { font-size: 16px; }
    .header-right { text-align: left; }
    .content { padding: 16px; }
    .page-content { padding: 16px; }
    .footer { padding: 12px 16px; flex-direction: column; gap: 8px; text-align: center; }
    .divider { margin: 0 16px; }
  }
`;

/**
 * Inline SVG logo — same 3 data pillars + sweep curve used in QuickPaymentSummary
 */
const BRAND_SVG = `<svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="36" height="36" rx="8" fill="#0F0703"/>
  <rect x="8" y="18" width="5" height="12" rx="2" fill="#FF6803"/>
  <rect x="15.5" y="12" width="5" height="18" rx="2" fill="#FFAC5F"/>
  <rect x="23" y="8" width="5" height="22" rx="2" fill="#30FFAC"/>
  <path d="M6 28 Q18 20 30 26" stroke="#FF6803" stroke-width="1.5" fill="none" opacity="0.5"/>
</svg>`;

/**
 * Smaller SVG logo for footers
 */
const BRAND_SVG_SM = `<svg width="28" height="28" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
  <rect width="36" height="36" rx="8" fill="#0F0703"/>
  <rect x="8" y="18" width="5" height="12" rx="2" fill="#FF6803"/>
  <rect x="15.5" y="12" width="5" height="18" rx="2" fill="#FFAC5F"/>
  <rect x="23" y="8" width="5" height="22" rx="2" fill="#30FFAC"/>
  <path d="M6 28 Q18 20 30 26" stroke="#FF6803" stroke-width="1.5" fill="none" opacity="0.5"/>
</svg>`;

/**
 * Generate the HTML document wrapper with styles
 */
export function generatePrintHTML(title: string, content: string): string {
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>${title} — DuesTracker</title>
      <style>${PRINT_STYLES}</style>
    </head>
    <body>
      <div class="container">
        ${content}
        <button class="btn-print no-print" onclick="window.print()">
          🖨️ Print / Save as PDF
        </button>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate premium header section — accent bar + branded logo + doc metadata
 */
export function generateHeader(title: string, subtitle: string, badgeText?: string, docType?: string): string {
  const docId = generateDocId();
  const now = new Date().toLocaleDateString('en-US', { dateStyle: 'medium' });
  return `
    <div class="accent-bar"></div>
    <div class="header">
      <div class="header-left">
        ${BRAND_SVG}
        <div>
          <h1>Dues<span>Tracker</span></h1>
          <div class="header-tagline">Class Financial Management</div>
        </div>
      </div>
      <div class="header-right">
        <div class="doc-title">${docType || title}</div>
        <div class="doc-meta">
          ${subtitle ? `<div class="doc-subtitle">${subtitle}</div>` : ''}
          <strong>Date:</strong> ${now}<br>
          <strong>Ref:</strong> ${docId}
        </div>
        ${badgeText ? `<div class="badge">${badgeText}</div>` : ''}
      </div>
    </div>
    <div class="divider"></div>
  `;
}

/**
 * Generate premium footer section
 */
export function generateFooter(docSeed?: string): string {
  const docId = generateDocId(docSeed);
  return `
    <div class="footer">
      <div class="footer-brand">
        ${BRAND_SVG_SM}
        <div class="footer-text">
          <strong>DuesTracker</strong> — Class Financial Management<br>
          Powered by Dev_Wishot • @wishotstudio
        </div>
      </div>
      <div class="footer-text" style="text-align: right;">
        Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}<br>
        Document Ref: ${docId}
      </div>
    </div>
  `;
}

/**
 * Generate info card with bordered cells
 */
export function generateInfoCard(items: Array<{ label: string; value: string }>, columns: 2 | 3 = 2): string {
  const gridClass = columns === 3 ? 'info-grid-3' : 'info-grid';
  return `
    <div class="info-card">
      <div class="${gridClass}">
        ${items.map(item => `
          <div class="info-cell">
            <span class="info-label">${item.label}</span>
            <span class="info-value">${item.value}</span>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Generate stats grid
 */
export function generateStatsGrid(stats: Array<{ value: string; label: string; type: string }>, columns: 3 | 4 | 6 = 3): string {
  const gridClass = columns === 4 ? 'stats-grid-4' : columns === 6 ? 'stats-grid-6' : 'stats-grid';
  return `
    <div class="${gridClass}">
      ${stats.map(stat => `
        <div class="stat-card ${stat.type}">
          <div class="stat-value ${stat.type}">${stat.value}</div>
          <div class="stat-label">${stat.label}</div>
        </div>
      `).join('')}
    </div>
  `;
}

/**
 * Generate section with title
 */
export function generateSection(icon: string, title: string, content: string): string {
  return `
    <div class="section">
      <div class="section-title">${icon} ${title}</div>
      ${content}
    </div>
  `;
}

/**
 * Generate important notes box
 */
export function generateNoteBox(notes: string[]): string {
  return `
    <div class="note-box">
      <div class="note-icon">!</div>
      <div class="note-text">
        <strong>Important:</strong> ${notes.join(' ')}
      </div>
    </div>
  `;
}

/**
 * Generate table
 */
export function generateTable(
  headers: string[], 
  rows: string[][], 
  options?: { 
    headerClass?: string;
    columnClasses?: string[];
  }
): string {
  const headerClass = options?.headerClass || '';
  return `
    <table>
      <thead>
        <tr>
          ${headers.map(h => `<th class="${headerClass}">${h}</th>`).join('')}
        </tr>
      </thead>
      <tbody>
        ${rows.map(row => `
          <tr>
            ${row.map((cell, i) => {
              const colClass = options?.columnClasses?.[i] || '';
              return `<td class="${colClass}">${cell}</td>`;
            }).join('')}
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
}

/**
 * Generate status badge HTML
 */
export function generateStatusBadge(status: string): string {
  const icon = status === 'approved' ? '✓' : status === 'pending' ? '⏳' : '✗';
  const label = status.charAt(0).toUpperCase() + status.slice(1);
  return `<span class="status ${status}">${icon} ${label}</span>`;
}

/**
 * Generate paginated content with multiple pages — premium design
 */
export function generatePaginatedReport(
  title: string,
  subtitle: string,
  summaryContent: string,
  tableHeaders: string[],
  tableRows: string[][],
  rowsPerPage: number = 25,
  options?: {
    tableTitle?: string;
    headerClass?: string;
    notesContent?: string;
    columnClasses?: string[];
  }
): string {
  const totalRows = tableRows.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage) + 1;
  const docId = generateDocId(title + totalRows);
  const generatedDate = new Date().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  
  let pages = '';
  
  // Page 1: Summary page
  pages += `
    <div class="page">
      <div class="accent-bar"></div>
      <div class="header">
        <div class="header-left">
          ${BRAND_SVG}
          <div>
            <h1>Dues<span>Tracker</span></h1>
            <div class="header-tagline">Class Financial Management</div>
          </div>
        </div>
        <div class="header-right">
          <div class="doc-title">${title}</div>
          <div class="doc-meta">
            ${subtitle}<br>
            <strong>Page 1 of ${totalPages}</strong> • ${totalRows} Records
          </div>
        </div>
      </div>
      <div class="divider"></div>
      <div class="content">
        ${summaryContent}
        ${totalRows > rowsPerPage ? `
          <div class="continuation-note">
            📋 <strong>Note:</strong> This report contains ${totalRows} records spread across ${totalPages} pages. 
            Detailed records continue on the following pages.
          </div>
        ` : ''}
      </div>
      <div class="page-footer">
        <div><strong style="color:#FF6803;">DuesTracker</strong> • Powered by Dev_Wishot</div>
        <div>Generated: ${generatedDate} • Ref: ${docId}</div>
      </div>
    </div>
  `;
  
  // Subsequent pages: Table data
  for (let pageNum = 2; pageNum <= totalPages; pageNum++) {
    const startIndex = (pageNum - 2) * rowsPerPage;
    const endIndex = Math.min(startIndex + rowsPerPage, totalRows);
    const pageRows = tableRows.slice(startIndex, endIndex);
    const isLastPage = pageNum === totalPages;
    
    pages += `
      <div class="page">
        <div class="accent-bar"></div>
        <div class="page-header">
          <div class="page-header-left">
            <h2>${options?.tableTitle || title}</h2>
            <p>Records ${startIndex + 1} – ${endIndex} of ${totalRows}</p>
          </div>
          <div class="page-number">Page ${pageNum} of ${totalPages}</div>
        </div>
        <div class="page-content">
          ${generateTable(tableHeaders, pageRows, { headerClass: options?.headerClass, columnClasses: options?.columnClasses })}
          ${isLastPage && options?.notesContent ? options.notesContent : ''}
        </div>
        <div class="page-footer">
          <div><strong style="color:#FF6803;">DuesTracker</strong> • Powered by Dev_Wishot</div>
          <div>Generated: ${generatedDate} • Ref: ${docId} • Page ${pageNum}/${totalPages}</div>
        </div>
      </div>
    `;
  }
  
  // If only summary page and few records — include table on summary page
  if (totalPages === 1) {
    return `
      <div class="page">
        <div class="accent-bar"></div>
        <div class="header">
          <div class="header-left">
            ${BRAND_SVG}
            <div>
              <h1>Dues<span>Tracker</span></h1>
              <div class="header-tagline">Class Financial Management</div>
            </div>
          </div>
          <div class="header-right">
            <div class="doc-title">${title}</div>
            <div class="doc-meta">
              ${subtitle}<br>
              <strong>${totalRows} Records</strong>
            </div>
          </div>
        </div>
        <div class="divider"></div>
        <div class="content">
          ${summaryContent}
          ${tableRows.length > 0 ? `
            <div class="section">
              <div class="section-title">
                <span class="section-icon">📜</span>
                ${options?.tableTitle || 'Records'}
              </div>
              ${generateTable(tableHeaders, tableRows, { headerClass: options?.headerClass, columnClasses: options?.columnClasses })}
            </div>
          ` : ''}
          ${options?.notesContent || ''}
        </div>
        <div class="footer">
          <div class="footer-brand">
            ${BRAND_SVG_SM}
            <div class="footer-text">
              <strong>DuesTracker</strong> — Class Financial Management<br>
              Powered by Dev_Wishot • @wishotstudio
            </div>
          </div>
          <div class="footer-text" style="text-align: right;">
            Generated: ${generatedDate}<br>
            Document Ref: ${docId}
          </div>
        </div>
      </div>
    `;
  }
  
  return pages;
}

/**
 * Open print window with HTML content
 */
export function openPrintWindow(htmlContent: string, onError?: (error: Error) => void): void {
  try {
    if (isIOS()) {
      // Create a hidden iframe for iOS printing
      let printFrame = document.getElementById('print-frame') as HTMLIFrameElement;
      if (!printFrame) {
        printFrame = document.createElement('iframe');
        printFrame.id = 'print-frame';
        printFrame.style.position = 'fixed';
        printFrame.style.right = '0';
        printFrame.style.bottom = '0';
        printFrame.style.width = '0';
        printFrame.style.height = '0';
        printFrame.style.border = 'none';
        document.body.appendChild(printFrame);
      }
      
      const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
      if (frameDoc) {
        frameDoc.open();
        frameDoc.write(htmlContent);
        frameDoc.close();
        
        setTimeout(() => {
          printFrame?.contentWindow?.focus();
          printFrame?.contentWindow?.print();
        }, 500);
      }
    } else {
      const printWindow = window.open('', '_blank');
      if (!printWindow) {
        // Fallback to iframe if popup blocked
        let printFrame = document.getElementById('print-frame') as HTMLIFrameElement;
        if (!printFrame) {
          printFrame = document.createElement('iframe');
          printFrame.id = 'print-frame';
          printFrame.style.position = 'fixed';
          printFrame.style.right = '0';
          printFrame.style.bottom = '0';
          printFrame.style.width = '0';
          printFrame.style.height = '0';
          printFrame.style.border = 'none';
          document.body.appendChild(printFrame);
        }
        
        const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
        if (frameDoc) {
          frameDoc.open();
          frameDoc.write(htmlContent);
          frameDoc.close();
          
          setTimeout(() => {
            printFrame?.contentWindow?.focus();
            printFrame?.contentWindow?.print();
          }, 500);
        }
        return;
      }

      printWindow.document.write(htmlContent);
      printWindow.document.close();
    }
  } catch (error) {
    if (onError && error instanceof Error) {
      onError(error);
    }
  }
}

export default {
  PRINT_STYLES,
  formatNaira,
  formatDate,
  generateDocId,
  getAcademicSession,
  generatePrintHTML,
  generateHeader,
  generateFooter,
  generateInfoCard,
  generateStatsGrid,
  generateSection,
  generateNoteBox,
  generateTable,
  generateStatusBadge,
  generatePaginatedReport,
  openPrintWindow,
  isIOS,
};
