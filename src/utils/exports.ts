/**
 * Export Utilities Index
 * Centralized exports for all print utilities
 * Uses beautiful HTML-based print layouts (QuickPaymentSummary style)
 * 
 * @author Dev_Wishot
 * @copyright Dev_Wishot - @wishotstudio
 */

// HTML-based print exports (QuickPaymentSummary style)
export {
  exportStudentsToPrint,
  exportPaymentsToPrint,
  exportExpensesToPrint,
  exportCollectedPaymentsToPrint,
  // Legacy aliases for backward compatibility
  exportStudentsToPDF,
  exportPaymentsToPDF,
  exportExpensesToPDF,
  exportCollectedPaymentsToPDF,
} from './htmlPrintExports';

// Print styles and utilities
export {
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
} from './printStyles';
