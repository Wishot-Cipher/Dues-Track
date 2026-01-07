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
 * Generate document ID
 */
export function generateDocId(): string {
  return Math.random().toString(36).substring(2, 10).toUpperCase();
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
 * This is the exact styling from QuickPaymentSummary
 */
export const PRINT_STYLES = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { 
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; 
    padding: 0; 
    color: #1a1a2e; 
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    min-height: 100vh;
  }
  .container {
    max-width: 800px;
    margin: 0 auto;
    padding: 20px;
  }
  .card {
    background: white;
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    overflow: hidden;
    margin-bottom: 20px;
  }
  .header {
    background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%);
    color: white;
    padding: 30px;
    text-align: center;
  }
  .header h1 {
    font-size: 24px;
    font-weight: 700;
    margin-bottom: 8px;
    letter-spacing: -0.5px;
  }
  .header p {
    opacity: 0.9;
    font-size: 14px;
  }
  .badge {
    display: inline-block;
    background: rgba(255,255,255,0.2);
    padding: 6px 16px;
    border-radius: 20px;
    font-size: 12px;
    margin-top: 12px;
    backdrop-filter: blur(10px);
  }
  .content { padding: 24px; }
  .section { margin-bottom: 24px; }
  .section-title {
    font-size: 14px;
    font-weight: 600;
    color: #FF6B35;
    text-transform: uppercase;
    letter-spacing: 1px;
    margin-bottom: 16px;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .section-title::after {
    content: '';
    flex: 1;
    height: 1px;
    background: linear-gradient(90deg, #FF6B35 0%, transparent 100%);
  }
  .info-card {
    background: #f8fafc;
    border-radius: 12px;
    padding: 16px;
    border-left: 4px solid #FF6B35;
  }
  .info-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 12px;
  }
  .info-grid-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .info-item {
    display: flex;
    flex-direction: column;
  }
  .info-label {
    font-size: 11px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 4px;
  }
  .info-value {
    font-size: 14px;
    font-weight: 600;
    color: #1e293b;
  }
  .stats-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  .stats-grid-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 12px;
  }
  .stats-grid-6 {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }
  .stat-card {
    background: #f8fafc;
    border-radius: 12px;
    padding: 16px;
    text-align: center;
    position: relative;
    overflow: hidden;
  }
  .stat-card::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 3px;
  }
  .stat-card.approved::before { background: #22c55e; }
  .stat-card.pending::before { background: #f59e0b; }
  .stat-card.rejected::before { background: #ef4444; }
  .stat-card.total::before { background: #FF6B35; }
  .stat-card.net::before { background: linear-gradient(90deg, #667eea, #764ba2); }
  .stat-card.balance::before { background: linear-gradient(90deg, #22c55e, #10b981); }
  .stat-card.expense::before { background: #ef4444; }
  .stat-card.info::before { background: #3b82f6; }
  .stat-value {
    font-size: 20px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .stat-value.approved { color: #22c55e; }
  .stat-value.pending { color: #f59e0b; }
  .stat-value.rejected { color: #ef4444; }
  .stat-value.total { color: #FF6B35; }
  .stat-value.net { color: #667eea; }
  .stat-value.balance { color: #22c55e; }
  .stat-value.expense { color: #ef4444; }
  .stat-value.info { color: #3b82f6; }
  .stat-label {
    font-size: 10px;
    color: #64748b;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
    font-size: 12px;
  }
  th {
    background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%);
    color: white;
    padding: 12px 10px;
    text-align: left;
    font-weight: 600;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  th:first-child { border-radius: 8px 0 0 0; }
  th:last-child { border-radius: 0 8px 0 0; }
  th.green {
    background: linear-gradient(135deg, #22c55e 0%, #16a34a 100%);
  }
  td {
    padding: 10px;
    border-bottom: 1px solid #e2e8f0;
  }
  tr:last-child td { border-bottom: none; }
  tr:nth-child(even) { background: #f8fafc; }
  tr:hover { background: #f1f5f9; }
  .status {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 10px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
  }
  .status.approved { background: #dcfce7; color: #166534; }
  .status.pending { background: #fef3c7; color: #92400e; }
  .status.rejected { background: #fee2e2; color: #991b1b; }
  .status.waived { background: #e0e7ff; color: #4338ca; }
  .status.active { background: #dcfce7; color: #166534; }
  .status.inactive { background: #fee2e2; color: #991b1b; }
  .status.complete { background: #dcfce7; color: #166534; }
  .status.partial { background: #fef3c7; color: #92400e; }
  .amount { font-weight: 600; color: #1e293b; }
  .amount.positive { color: #22c55e; }
  .amount.negative { color: #ef4444; }
  .note-box {
    background: linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%);
    border-radius: 12px;
    padding: 16px;
    display: flex;
    align-items: flex-start;
    gap: 12px;
    border: 1px solid #fcd34d;
    margin-top: 16px;
  }
  .note-icon {
    width: 24px;
    height: 24px;
    background: #f59e0b;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-size: 14px;
    flex-shrink: 0;
  }
  .note-text {
    font-size: 12px;
    color: #92400e;
    line-height: 1.5;
  }
  .note-text strong { font-weight: 600; }
  .footer {
    background: #f8fafc;
    padding: 20px 24px;
    border-top: 1px solid #e2e8f0;
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
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: white;
    font-weight: bold;
    font-size: 14px;
  }
  .footer-text {
    font-size: 11px;
    color: #64748b;
  }
  .footer-text strong { color: #FF6B35; }
  .print-btn {
    background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%);
    color: white;
    padding: 14px 32px;
    border: none;
    border-radius: 12px;
    cursor: pointer;
    font-size: 16px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin: 20px auto;
    box-shadow: 0 4px 15px rgba(255, 107, 53, 0.3);
    transition: transform 0.2s, box-shadow 0.2s;
  }
  .print-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 6px 20px rgba(255, 107, 53, 0.4);
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
    border-radius: 16px;
    box-shadow: 0 20px 60px rgba(0,0,0,0.15);
    overflow: hidden;
    margin-bottom: 30px;
    page-break-after: always;
    break-after: page;
  }
  .page:last-child {
    page-break-after: avoid;
    break-after: avoid;
  }
  .page-header {
    background: linear-gradient(135deg, #FF6B35 0%, #F7931E 100%);
    color: white;
    padding: 20px 24px;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .page-header-left h2 {
    font-size: 18px;
    font-weight: 700;
    margin-bottom: 4px;
  }
  .page-header-left p {
    font-size: 12px;
    opacity: 0.9;
  }
  .page-number {
    background: rgba(255,255,255,0.2);
    padding: 8px 16px;
    border-radius: 20px;
    font-size: 12px;
    font-weight: 600;
  }
  .page-content {
    padding: 20px 24px;
    min-height: 600px;
  }
  .page-footer {
    background: #f8fafc;
    padding: 16px 24px;
    border-top: 1px solid #e2e8f0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-size: 10px;
    color: #64748b;
  }
  .continuation-note {
    background: linear-gradient(135deg, #f0f9ff 0%, #e0f2fe 100%);
    border: 1px solid #0ea5e9;
    border-radius: 8px;
    padding: 12px 16px;
    margin-top: 16px;
    font-size: 12px;
    color: #0369a1;
    display: flex;
    align-items: center;
    gap: 8px;
  }
  
  @media print {
    body { background: white; padding: 0; }
    .container { padding: 0; max-width: 100%; }
    .card { box-shadow: none; border: 1px solid #e2e8f0; }
    .page { 
      box-shadow: none; 
      border: 1px solid #e2e8f0;
      margin-bottom: 0;
      border-radius: 0;
    }
    .no-print { display: none !important; }
    .print-btn { display: none !important; }
    tr:hover { background: none; }
    tr:nth-child(even) { background: #f8fafc; }
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
    table { font-size: 10px; }
    th, td { padding: 8px 6px; }
    .header { padding: 20px; }
    .header h1 { font-size: 20px; }
  }
`;

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
      <title>${title}</title>
      <style>${PRINT_STYLES}</style>
    </head>
    <body>
      <div class="container">
        ${content}
        <button class="print-btn no-print" onclick="window.print()">
          🖨️ Print / Save as PDF
        </button>
      </div>
    </body>
    </html>
  `;
}

/**
 * Generate header section
 */
export function generateHeader(title: string, subtitle: string, badgeText?: string): string {
  return `
    <div class="header">
      <h1>📄 ${title}</h1>
      <p>${subtitle}</p>
      <div class="badge">${badgeText || `Generated: ${new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}`}</div>
    </div>
  `;
}

/**
 * Generate footer section
 */
export function generateFooter(): string {
  return `
    <div class="footer">
      <div class="footer-brand">
        <div class="footer-logo">DT</div>
        <div class="footer-text">
          <strong>Class Dues Tracker</strong><br>
          Powered by Dev_Wishot
        </div>
      </div>
      <div class="footer-text" style="text-align: right;">
        Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}<br>
        Document ID: ${generateDocId()}
      </div>
    </div>
  `;
}

/**
 * Generate info card section
 */
export function generateInfoCard(items: Array<{ label: string; value: string }>, columns: 2 | 3 = 2): string {
  const gridClass = columns === 3 ? 'info-grid-3' : 'info-grid';
  return `
    <div class="info-card">
      <div class="${gridClass}">
        ${items.map(item => `
          <div class="info-item">
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
 * Generate paginated content with multiple pages
 * @param title - Report title
 * @param subtitle - Report subtitle
 * @param summaryContent - Content for the first page (stats, summaries)
 * @param tableHeaders - Table column headers
 * @param tableRows - All table rows
 * @param rowsPerPage - Number of rows per page (default 25)
 * @param options - Additional options
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
  }
): string {
  const totalRows = tableRows.length;
  const totalPages = Math.ceil(totalRows / rowsPerPage) + 1; // +1 for summary page
  const docId = generateDocId();
  const generatedDate = new Date().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' });
  
  let pages = '';
  
  // Page 1: Summary page
  pages += `
    <div class="page">
      <div class="header">
        <h1>📄 ${title}</h1>
        <p>${subtitle}</p>
        <div class="badge">Page 1 of ${totalPages} • ${totalRows} Records</div>
      </div>
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
        <div><strong>Class Dues Tracker</strong> • Powered by Dev_Wishot</div>
        <div>Generated: ${generatedDate} • Doc ID: ${docId}</div>
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
        <div class="page-header">
          <div class="page-header-left">
            <h2>${options?.tableTitle || title}</h2>
            <p>Records ${startIndex + 1} - ${endIndex} of ${totalRows}</p>
          </div>
          <div class="page-number">Page ${pageNum} of ${totalPages}</div>
        </div>
        <div class="page-content">
          ${generateTable(tableHeaders, pageRows, { headerClass: options?.headerClass })}
          ${isLastPage && options?.notesContent ? options.notesContent : ''}
        </div>
        <div class="page-footer">
          <div><strong>Class Dues Tracker</strong> • Powered by Dev_Wishot</div>
          <div>Generated: ${generatedDate} • Doc ID: ${docId} • Page ${pageNum}/${totalPages}</div>
        </div>
      </div>
    `;
  }
  
  // If only summary page and no data pages needed (few records)
  if (totalPages === 1) {
    // Re-generate with table included on summary page
    return `
      <div class="page">
        <div class="header">
          <h1>📄 ${title}</h1>
          <p>${subtitle}</p>
          <div class="badge">${totalRows} Records</div>
        </div>
        <div class="content">
          ${summaryContent}
          ${tableRows.length > 0 ? `
            <div class="section">
              <div class="section-title">📜 ${options?.tableTitle || 'Records'}</div>
              ${generateTable(tableHeaders, tableRows, { headerClass: options?.headerClass })}
            </div>
          ` : ''}
          ${options?.notesContent || ''}
        </div>
        <div class="footer">
          <div class="footer-brand">
            <div class="footer-logo">DT</div>
            <div class="footer-text">
              <strong>Class Dues Tracker</strong><br>
              Powered by Dev_Wishot
            </div>
          </div>
          <div class="footer-text" style="text-align: right;">
            Generated: ${generatedDate}<br>
            Document ID: ${docId}
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
