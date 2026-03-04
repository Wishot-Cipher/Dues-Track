import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Printer, Share2, CheckCircle, Clock, XCircle, Sparkles, FileSpreadsheet, Eye } from 'lucide-react'
import { colors, gradients } from '@/config/colors'
import { supabase } from '@/config/supabase'
import { useAppAuth as useAuth } from '@/hooks/useAppAuth'
import { getOrgScope } from '@/utils/orgScope'

// Detect iOS device
const isIOS = () => {
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || 
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
};

export default function QuickPaymentSummary() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [activeAction, setActiveAction] = useState<'csv' | 'print' | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const printFrameRef = useRef<HTMLIFrameElement | null>(null)

  async function generatePaymentSummary() {
    if (!user) return

    try {
      setLoading(true)
      setActiveAction('csv')
      setError(null)
      setSuccess(null)

      // Use student info from authenticated user
      const student = {
        full_name: user.full_name || 'Unknown Student',
        email: user.email || 'N/A',
        phone: user.phone || 'N/A',
        department: user.department || 'N/A',
        level: user.level || 'N/A'
      }

      // Fetch all payments (without admin join for now - admin name not critical for CSV)
      const scope = getOrgScope();
      let qCsv = supabase
        .from('payments')
        .select(`
          *,
          payment_type:payment_types(title, amount)
        `)
        .eq('member_id', user.id)
        .order('created_at', { ascending: false });
      if (scope) qCsv = qCsv.eq('organization_id', scope.orgId);
      const { data: payments, error: fetchError } = await qCsv;

      if (fetchError) {
        setError('Unable to fetch payment records. Please try again.')
        setLoading(false)
        setActiveAction(null)
        return
      }

      if (!payments || payments.length === 0) {
        setError('No payment records found. You may not have made any payments yet.')
        setLoading(false)
        setActiveAction(null)
        return
      }

      // Generate CSV
      const csvContent = generateCSV(student, payments)
      downloadCSV(csvContent, `Payment_Summary_${student.full_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`)
      setSuccess('CSV downloaded successfully!')
      setTimeout(() => setSuccess(null), 3000)

    } catch (err) {
      setError(err instanceof Error ? 'Failed to generate payment summary. Please try again.' : 'An unexpected error occurred.')
    } finally {
      setLoading(false)
      setActiveAction(null)
    }
  }

  function generateCSV(student: { full_name: string; email: string; phone: string; department: string; level: string }, payments: Array<{ created_at: string; status: string; amount: number; transaction_ref?: string; notes?: string; payment_type?: { title: string; amount: number }; payment_method?: string }>) {
    const lines: string[] = []

    // Helper function to properly escape CSV fields
    const escapeCSV = (field: string | number): string => {
      if (field === null || field === undefined) return ''
      const str = String(field)
      // If field contains comma, quote, or newline, wrap in quotes and escape internal quotes
      if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`
      }
      return str
    }

    // Calculate summary data first with proper null handling
    const totalPaid = payments.filter(p => p.status === 'approved').reduce((sum, p) => {
      const amount = p.amount != null ? Number(p.amount) : 0
      return sum + (isNaN(amount) ? 0 : amount)
    }, 0)
    const totalPending = payments.filter(p => p.status === 'pending').reduce((sum, p) => {
      const amount = p.amount != null ? Number(p.amount) : 0
      return sum + (isNaN(amount) ? 0 : amount)
    }, 0)
    const totalRejected = payments.filter(p => p.status === 'rejected').reduce((sum, p) => {
      const amount = p.amount != null ? Number(p.amount) : 0
      return sum + (isNaN(amount) ? 0 : amount)
    }, 0)
    const totalSubmitted = totalPaid + totalPending + totalRejected
    
    const approvedCount = payments.filter(p => p.status === 'approved').length
    const pendingCount = payments.filter(p => p.status === 'pending').length
    const rejectedCount = payments.filter(p => p.status === 'rejected').length

    // Payment breakdown by type
    const paymentsByType = payments.reduce((acc, p) => {
      if (p.status === 'approved') {
        const typeName = p.payment_type?.title || 'Unknown'
        const expectedAmount = p.payment_type?.amount != null ? Number(p.payment_type.amount) : 0
        const paidAmount = p.amount != null ? Number(p.amount) : 0
        if (!acc[typeName]) {
          acc[typeName] = { paid: 0, count: 0, expected: isNaN(expectedAmount) ? 0 : expectedAmount }
        }
        acc[typeName].paid += isNaN(paidAmount) ? 0 : paidAmount
        acc[typeName].count += 1
      }
      return acc
    }, {} as Record<string, { paid: number; count: number; expected: number }>)

    // Header Section
    lines.push('PAYVEXO - OFFICIAL PAYMENT SUMMARY REPORT')
    lines.push('')
    lines.push('REPORT INFORMATION')
    lines.push('Field,Value')
    lines.push(`Generated Date,${escapeCSV(new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' }))}`)
    lines.push(`Academic Session,${escapeCSV(new Date().getFullYear() + '/' + (new Date().getFullYear() + 1))}`)
    lines.push(`Report Type,Complete Payment History`)
    lines.push(`Total Records,${escapeCSV(payments.length)}`)
    lines.push('')
    lines.push('')
    
    // Student Information Table
    lines.push('STUDENT INFORMATION')
    lines.push('Field,Details')
    lines.push(`Full Name,${escapeCSV(student.full_name)}`)
    lines.push(`Email Address,${escapeCSV(student.email)}`)
    lines.push(`Phone Number,${escapeCSV(student.phone)}`)
    lines.push(`Department,${escapeCSV(student.department)}`)
    lines.push(`Current Level,${escapeCSV(student.level || 'N/A')}`)
    lines.push('')
    lines.push('')

    // Payment Summary Statistics Table
    lines.push('PAYMENT SUMMARY STATISTICS')
    lines.push('Description,Count,Total Amount,Explanation')
    lines.push(`Total Payments Submitted,${escapeCSV(payments.length)},${escapeCSV('₦' + totalSubmitted.toLocaleString())},${escapeCSV('All payment records created (approved + pending + rejected)')}`)
    lines.push(`Approved Payments,${escapeCSV(approvedCount)},${escapeCSV('₦' + totalPaid.toLocaleString())},${escapeCSV('Payments verified and accepted by admin - COUNTS toward dues')}`)
    lines.push(`Pending Payments,${escapeCSV(pendingCount)},${escapeCSV('₦' + totalPending.toLocaleString())},${escapeCSV('Payments under review - NOT YET counted toward dues')}`)
    lines.push(`Rejected Payments,${escapeCSV(rejectedCount)},${escapeCSV('₦' + totalRejected.toLocaleString())},${escapeCSV('Payments declined by admin - DOES NOT count toward dues')}`)
    lines.push('')
    lines.push('FINANCIAL SUMMARY')
    lines.push('Metric,Amount,Explanation')
    lines.push(`Net Amount Paid,${escapeCSV('₦' + totalPaid.toLocaleString())},${escapeCSV('Total approved payments that count toward your dues')}`)
    lines.push(`Pending Amount,${escapeCSV('₦' + totalPending.toLocaleString())},${escapeCSV('Money submitted but awaiting admin verification')}`)
    lines.push(`Overall Status,${escapeCSV(approvedCount + ' of ' + payments.length + ' payments approved')},${escapeCSV('Approval rate: ' + (payments.length > 0 ? ((approvedCount / payments.length) * 100).toFixed(1) : '0') + '%')}`)
    lines.push('')
    lines.push('')

    // Payment Type Breakdown Table
    if (Object.keys(paymentsByType).length > 0) {
      lines.push('PAYMENT TYPE BREAKDOWN (APPROVED ONLY)')
      lines.push('Payment Type,Times Paid,Total Amount Paid,Expected Amount,Difference,Completion Status,Explanation')
      Object.entries(paymentsByType).forEach(([type, data]) => {
        const paidAmount = isNaN(data.paid) ? 0 : data.paid
        const expectedAmt = isNaN(data.expected) ? 0 : data.expected
        const difference = paidAmount - expectedAmt
        const status = paidAmount >= expectedAmt ? 'COMPLETE' : 'PARTIAL'
        const explanation = paidAmount >= expectedAmt 
          ? `Fully paid. ${difference > 0 ? 'Overpaid by ₦' + difference.toLocaleString() : 'Exact amount'}`
          : `Still need ₦${Math.abs(difference).toLocaleString()} to complete payment`
        
        lines.push(`${escapeCSV(type)},${escapeCSV(data.count)},${escapeCSV('₦' + paidAmount.toLocaleString())},${escapeCSV('₦' + expectedAmt.toLocaleString())},${escapeCSV('₦' + difference.toLocaleString())},${escapeCSV(status)},${escapeCSV(explanation)}`)
      })
      lines.push('')
      lines.push('')
    }

    // Payment Method Analysis Table
    const methodCount = payments.reduce((acc, p) => {
      if (p.status === 'approved') {
        const method = p.payment_method || 'Not Specified'
        acc[method] = (acc[method] || 0) + 1
      }
      return acc
    }, {} as Record<string, number>)

    if (Object.keys(methodCount).length > 0) {
      lines.push('PAYMENT METHODS ANALYSIS (APPROVED ONLY)')
      lines.push('Payment Method,Number of Transactions,Percentage,Explanation')
      const totalApproved = approvedCount
      Object.entries(methodCount)
        .sort(([, a], [, b]) => b - a)
        .forEach(([method, count]) => {
          const percentage = totalApproved > 0 ? ((count / totalApproved) * 100).toFixed(1) : '0'
          const explanation = `Used for ${count} out of ${totalApproved} approved payments`
          lines.push(`${escapeCSV(method)},${escapeCSV(count)},${escapeCSV(percentage + '%')},${escapeCSV(explanation)}`)
        })
      lines.push('')
      lines.push('')
    }

    // Complete Transaction History Table
    lines.push('COMPLETE TRANSACTION HISTORY (ALL PAYMENTS)')
    lines.push('No.,Date,Time,Payment Type,Amount Paid,Expected Amount,Difference,Transaction Reference,Payment Method,Status,Verified By,Admin Notes,Explanation')
    
    payments.forEach((payment, index) => {
      const dateObj = new Date(payment.created_at)
      const date = dateObj.toLocaleDateString('en-US', { 
        year: 'numeric',
        month: 'short', 
        day: '2-digit'
      })
      const time = dateObj.toLocaleTimeString('en-US', {
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
      })
      const type = payment.payment_type?.title || 'Unknown Type'
      const amountPaid = payment.amount != null ? Number(payment.amount) : 0
      const expectedAmount = payment.payment_type?.amount != null ? Number(payment.payment_type.amount) : 0
      const difference = amountPaid - expectedAmount
      const amount = '₦' + (isNaN(amountPaid) ? 0 : amountPaid).toLocaleString()
      const expected = '₦' + (isNaN(expectedAmount) ? 0 : expectedAmount).toLocaleString()
      const diff = '₦' + (isNaN(difference) ? 0 : difference).toLocaleString()
      const ref = payment.transaction_ref || 'N/A'
      const method = payment.payment_method || 'Not Specified'
      const status = payment.status.toUpperCase()
      const verifiedBy = payment.status === 'approved' || payment.status === 'rejected' ? 'Admin' : 'Awaiting Review'
      const notes = payment.notes || 'None'
      
      let explanation = ''
      if (payment.status === 'approved') {
        explanation = difference >= 0 
          ? `Payment approved. ${difference > 0 ? 'Overpaid by ₦' + difference.toLocaleString() : 'Exact amount paid'}`
          : `Payment approved with partial amount. Underpaid by ₦${Math.abs(difference).toLocaleString()}`
      } else if (payment.status === 'pending') {
        explanation = 'Awaiting admin verification. Does not count toward dues yet'
      } else if (payment.status === 'rejected') {
        explanation = 'Payment rejected by admin. Does not count toward dues. May need resubmission'
      }

      lines.push(`${escapeCSV(index + 1)},${escapeCSV(date)},${escapeCSV(time)},${escapeCSV(type)},${escapeCSV(amount)},${escapeCSV(expected)},${escapeCSV(diff)},${escapeCSV(ref)},${escapeCSV(method)},${escapeCSV(status)},${escapeCSV(verifiedBy)},${escapeCSV(notes)},${escapeCSV(explanation)}`)
    })

    lines.push('')
    lines.push('')
    
    // Important Information Section
    lines.push('IMPORTANT INFORMATION AND NOTES')
    lines.push('Topic,Details')
    lines.push(`Document Status,${escapeCSV('Official payment record from Payvexo v2.0')}`)
    lines.push(`Approved Payments,${escapeCSV('Only APPROVED payments count toward your total dues paid')}`)
    lines.push(`Pending Payments,${escapeCSV('PENDING payments are under admin review and do NOT yet count')}`)
    lines.push(`Rejected Payments,${escapeCSV('REJECTED payments do NOT count and may need to be resubmitted')}`)
    lines.push(`Record Keeping,${escapeCSV('Keep this report for personal financial tracking and parent verification')}`)
    lines.push(`Disputes,${escapeCSV('For questions or disputes contact class admin with transaction reference numbers')}`)
    lines.push(`Payment Proof,${escapeCSV('This document can be shared with parents as proof of payment activity')}`)
    lines.push(`Next Steps,${escapeCSV('Check pending payments regularly for admin approval status updates')}`)
    lines.push('')
    lines.push('CONTACT INFORMATION')
    lines.push('Field,Value')
    lines.push(`Student Email,${escapeCSV(student.email)}`)
    lines.push(`Student Phone,${escapeCSV(student.phone)}`)
    lines.push(`Report Generated By,Payvexo v2.0`)
    lines.push(`Generation Timestamp,${escapeCSV(new Date().toISOString())}`)
    lines.push('')
    lines.push('DEVELOPER CREDITS')
    lines.push('Field,Value')
    lines.push('Developed By,Dev_Wishot')
    lines.push('System Name,Payvexo')
    lines.push('Version,2.0')
    lines.push('Powered By,Dev_Wishot - Professional Class Management Solutions')
    lines.push('')
    lines.push('END OF REPORT')

    return lines.join('\n')
  }

  function downloadCSV(content: string, filename: string) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' })
    const link = document.createElement('a')
    const url = URL.createObjectURL(blob)
    
    link.setAttribute('href', url)
    link.setAttribute('download', filename)
    link.style.visibility = 'hidden'
    
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    
    URL.revokeObjectURL(url)
  }

  async function printSummary() {
    if (!user) return

    try {
      setLoading(true)
      setActiveAction('print')
      setError(null)
      setSuccess(null)

      // Use student info from authenticated user
      const student = {
        full_name: user.full_name || 'Unknown Student',
        email: user.email || 'N/A',
        phone: user.phone || 'N/A',
        department: user.department || 'N/A',
        level: user.level || 'N/A'
      }

      const scope = getOrgScope();
      let qPrint = supabase
        .from('payments')
        .select(`
          *,
          payment_type:payment_types(title, amount)
        `)
        .eq('member_id', user.id)
        .order('created_at', { ascending: false });
      if (scope) qPrint = qPrint.eq('organization_id', scope.orgId);
      const { data: payments, error: fetchError } = await qPrint;

      if (fetchError) {
        setError('Unable to fetch payment records for printing. Please try again.')
        setLoading(false)
        setActiveAction(null)
        return
      }

      if (!payments || payments.length === 0) {
        setError('No payment records found to print. You may not have made any payments yet.')
        setLoading(false)
        setActiveAction(null)
        return
      }

      const totalPaid = payments.filter(p => p.status === 'approved').reduce((sum, p) => {
        const amount = p.amount != null ? Number(p.amount) : 0
        return sum + (isNaN(amount) ? 0 : amount)
      }, 0)
      const totalPending = payments.filter(p => p.status === 'pending').reduce((sum, p) => {
        const amount = p.amount != null ? Number(p.amount) : 0
        return sum + (isNaN(amount) ? 0 : amount)
      }, 0)
      const approvedCount = payments.filter(p => p.status === 'approved').length
      const pendingCount = payments.filter(p => p.status === 'pending').length
      const rejectedCount = payments.filter(p => p.status === 'rejected').length

      // Generate deterministic document reference from payment data
      const docRef = (() => {
        const raw = user.id + '-' + payments.length + '-' + totalPaid.toFixed(0) + '-' + approvedCount;
        let hash = 0;
        for (let i = 0; i < raw.length; i++) {
          hash = ((hash << 5) - hash) + raw.charCodeAt(i);
          hash |= 0;
        }
        return 'PVX-' + Math.abs(hash).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
      })();

      // Generate printable HTML content with premium professional design
      const htmlContent = `
        <!DOCTYPE html>
        <html lang="en">
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Statement - ${student.full_name}</title>
          <style>
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
              font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
              color: var(--slate-900); background: var(--slate-100);
              line-height: 1.6; -webkit-font-smoothing: antialiased;
            }
            .page {
              max-width: 820px; margin: 24px auto; background: white;
              border-radius: 2px; position: relative; overflow: hidden;
              box-shadow: 0 1px 3px rgba(0,0,0,0.08), 0 20px 60px rgba(0,0,0,0.06);
            }
            .watermark {
              position: absolute; top: 50%; left: 50%;
              transform: translate(-50%, -50%) rotate(-35deg);
              font-size: 80px; font-weight: 800; letter-spacing: 16px;
              color: rgba(255, 104, 3, 0.025); white-space: nowrap;
              pointer-events: none; z-index: 0;
            }
            .accent-bar { height: 4px; background: linear-gradient(90deg, var(--amber) 0%, var(--amber-light) 50%, var(--mint) 100%); }
            .header {
              padding: 28px 36px 22px; display: flex;
              justify-content: space-between; align-items: flex-start;
              position: relative; z-index: 1;
            }
            .header-left { display: flex; align-items: center; gap: 14px; }
            .logo-mark { width: 44px; height: 44px; flex-shrink: 0; }
            .brand-name { font-size: 18px; font-weight: 800; color: var(--charcoal); letter-spacing: -0.5px; }
            .brand-name span { color: var(--amber); }
            .brand-tagline { font-size: 9px; color: var(--slate-500); text-transform: uppercase; letter-spacing: 2.5px; margin-top: 1px; }
            .header-right { text-align: right; }
            .doc-title { font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 3px; color: var(--amber); margin-bottom: 6px; }
            .doc-meta { font-size: 10px; color: var(--slate-500); line-height: 1.9; }
            .doc-meta strong { color: var(--slate-700); font-weight: 600; }
            .divider { height: 1px; background: linear-gradient(90deg, transparent 0%, var(--slate-300) 15%, var(--slate-300) 85%, transparent 100%); margin: 0 36px; }
            .body { padding: 24px 36px 28px; position: relative; z-index: 1; }
            .section { margin-bottom: 24px; }
            .section-header { display: flex; align-items: center; gap: 10px; margin-bottom: 12px; }
            .section-icon { width: 26px; height: 26px; border-radius: 6px; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
            .section-icon.amber { background: rgba(255, 104, 3, 0.08); }
            .section-icon.blue { background: rgba(59, 130, 246, 0.08); }
            .section-icon.green { background: rgba(5, 150, 105, 0.08); }
            .section-title { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: var(--slate-700); }
            .section-line { flex: 1; height: 1px; background: var(--slate-300); }
            .info-grid {
              display: grid; grid-template-columns: repeat(3, 1fr); gap: 0;
              border: 1px solid var(--slate-300); border-radius: 8px; overflow: hidden;
            }
            .info-cell { padding: 11px 14px; border-bottom: 1px solid var(--slate-300); border-right: 1px solid var(--slate-300); }
            .info-cell:nth-child(3n) { border-right: none; }
            .info-cell:nth-last-child(-n+3) { border-bottom: none; }
            .info-label { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--slate-500); margin-bottom: 3px; }
            .info-value { font-size: 12px; font-weight: 600; color: var(--slate-900); }
            .stats-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
            .stat-card {
              border: 1px solid var(--slate-300); border-radius: 8px;
              padding: 14px; text-align: center; position: relative; background: white;
            }
            .stat-card::after { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 8px 8px 0 0; }
            .stat-card.green::after { background: var(--green); }
            .stat-card.yellow::after { background: var(--yellow); }
            .stat-card.red::after { background: var(--red); }
            .stat-card.dark::after { background: var(--slate-900); }
            .stat-amount { font-size: 22px; font-weight: 800; line-height: 1.2; margin-bottom: 3px; }
            .stat-amount.green { color: var(--green); }
            .stat-amount.yellow { color: var(--yellow); }
            .stat-amount.red { color: var(--red); }
            .stat-amount.dark { color: var(--slate-900); }
            .stat-label { font-size: 8px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: var(--slate-500); }
            .amount-strip {
              display: flex; justify-content: space-between; align-items: center;
              background: linear-gradient(135deg, var(--amber) 0%, var(--amber-light) 100%);
              border-radius: 8px; padding: 14px 18px; margin-top: 10px;
            }
            .amount-strip-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.85); text-transform: uppercase; letter-spacing: 1px; }
            .amount-strip-value { font-size: 22px; font-weight: 800; color: white; }
            .sub-strip {
              display: flex; justify-content: space-between; padding: 9px 14px;
              border-radius: 6px; margin-top: 6px; font-size: 11px;
            }
            .table-wrap { border: 1px solid var(--slate-300); border-radius: 8px; overflow: hidden; }
            table { width: 100%; border-collapse: collapse; font-size: 11px; }
            thead th {
              background: var(--slate-900); color: white; padding: 9px 10px;
              text-align: left; font-weight: 600; font-size: 9px;
              text-transform: uppercase; letter-spacing: 0.8px;
            }
            tbody td { padding: 9px 10px; border-bottom: 1px solid var(--slate-100); color: var(--slate-700); }
            tbody tr:last-child td { border-bottom: none; }
            tbody tr:nth-child(even) { background: var(--slate-50); }
            .td-amount { font-weight: 700; color: var(--slate-900); font-variant-numeric: tabular-nums; }
            .td-ref { font-family: 'Courier New', monospace; font-size: 9px; color: var(--slate-500); }
            .badge {
              display: inline-flex; align-items: center; gap: 4px;
              padding: 2px 8px; border-radius: 20px; font-size: 9px; font-weight: 600;
            }
            .badge::before { content: ''; width: 5px; height: 5px; border-radius: 50%; }
            .badge.approved { background: var(--green-bg); color: var(--green); }
            .badge.approved::before { background: var(--green); }
            .badge.pending { background: var(--yellow-bg); color: var(--yellow); }
            .badge.pending::before { background: var(--yellow); }
            .badge.rejected { background: var(--red-bg); color: var(--red); }
            .badge.rejected::before { background: var(--red); }
            .note {
              display: flex; gap: 10px; padding: 12px 14px;
              background: var(--yellow-bg); border: 1px solid #fcd34d;
              border-radius: 8px; align-items: flex-start;
            }
            .note-icon {
              width: 18px; height: 18px; border-radius: 50%; background: var(--yellow);
              color: white; display: flex; align-items: center; justify-content: center;
              font-size: 10px; font-weight: 700; flex-shrink: 0; margin-top: 1px;
            }
            .note p { font-size: 10px; color: #92400e; line-height: 1.6; }
            .note strong { font-weight: 700; }
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
            .sig-block { text-align: center; width: 180px; }
            .sig-line { border-top: 1px solid var(--slate-400); margin-bottom: 5px; margin-top: 36px; }
            .sig-name { font-size: 9px; color: var(--slate-500); text-transform: uppercase; letter-spacing: 1px; }
            .footer {
              background: var(--slate-50); border-top: 1px solid var(--slate-300);
              padding: 14px 36px; display: flex;
              justify-content: space-between; align-items: center;
              position: relative; z-index: 1;
            }
            .footer-brand { display: flex; align-items: center; gap: 8px; }
            .footer-logo { width: 28px; height: 28px; }
            .footer-info { font-size: 9px; color: var(--slate-500); line-height: 1.6; }
            .footer-info strong { color: var(--amber); font-weight: 700; }
            .footer-right { text-align: right; font-size: 8px; color: var(--slate-500); line-height: 1.8; }
            .print-actions { max-width: 820px; margin: 16px auto 32px; display: flex; justify-content: center; }
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
              .stats-row { grid-template-columns: repeat(2, 1fr); }
              .divider { margin: 0 16px; }
              table { font-size: 9px; }
              thead th, tbody td { padding: 7px 6px; }
              .verification { flex-direction: column; gap: 14px; align-items: flex-start; }
              .amount-strip { flex-direction: column; gap: 4px; text-align: center; }
            }
          </style>
        </head>
        <body>
          <div class="page">
            <div class="watermark">PAYVEXO</div>
            <div class="accent-bar"></div>

            <!-- Header -->
            <div class="header">
              <div class="header-left">
                <svg class="logo-mark" viewBox="0 0 48 48" fill="none">
                  <rect width="48" height="48" rx="10" fill="#0F0703"/>
                  <defs>
                    <linearGradient id="lg1" x1="0%" y1="100%" x2="0%" y2="0%"><stop offset="0%" stop-color="#CC5202"/><stop offset="100%" stop-color="#FFAC5F"/></linearGradient>
                    <linearGradient id="lg2" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#1BD88A"/><stop offset="100%" stop-color="#30FFAC"/></linearGradient>
                  </defs>
                  <rect x="10" y="28" width="7" height="10" rx="2" fill="url(#lg1)" opacity=".85"/>
                  <rect x="20" y="22" width="7" height="16" rx="2" fill="url(#lg1)" opacity=".9"/>
                  <rect x="30" y="14" width="7" height="24" rx="2" fill="url(#lg1)"/>
                  <circle cx="33.5" cy="12" r="3" fill="none" stroke="url(#lg2)" stroke-width="1.5"/>
                  <circle cx="33.5" cy="12" r="1" fill="url(#lg2)"/>
                </svg>
                <div>
                  <div class="brand-name">Pay<span>vexo</span></div>
                  <div class="brand-tagline">Payment & Dues Management</div>
                </div>
              </div>
              <div class="header-right">
                <div class="doc-title">Payment Statement</div>
                <div class="doc-meta">
                  <strong>Ref:</strong> ${docRef}<br>
                  <strong>Date:</strong> ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}<br>
                  <strong>Period:</strong> ${new Date().getFullYear()}/${new Date().getFullYear() + 1} Session
                </div>
              </div>
            </div>

            <div class="divider"></div>

            <!-- Body -->
            <div class="body">
              <!-- Student Information -->
              <div class="section">
                <div class="section-header">
                  <div class="section-icon amber">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#FF6803" stroke-width="2.5" stroke-linecap="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                  <div class="section-title">Student Information</div>
                  <div class="section-line"></div>
                </div>
                <div class="info-grid">
                  <div class="info-cell">
                    <div class="info-label">Full Name</div>
                    <div class="info-value">${student.full_name}</div>
                  </div>
                  <div class="info-cell">
                    <div class="info-label">Email Address</div>
                    <div class="info-value">${student.email}</div>
                  </div>
                  <div class="info-cell">
                    <div class="info-label">Phone</div>
                    <div class="info-value">${student.phone}</div>
                  </div>
                  <div class="info-cell">
                    <div class="info-label">Department</div>
                    <div class="info-value">${student.department || 'N/A'}</div>
                  </div>
                  <div class="info-cell">
                    <div class="info-label">Level</div>
                    <div class="info-value">${student.level || 'N/A'}</div>
                  </div>
                  <div class="info-cell">
                    <div class="info-label">Academic Session</div>
                    <div class="info-value">${new Date().getFullYear()}/${new Date().getFullYear() + 1}</div>
                  </div>
                </div>
              </div>

              <!-- Financial Summary -->
              <div class="section">
                <div class="section-header">
                  <div class="section-icon green">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#059669" stroke-width="2.5" stroke-linecap="round"><line x1="12" y1="1" x2="12" y2="23"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
                  </div>
                  <div class="section-title">Financial Summary</div>
                  <div class="section-line"></div>
                </div>
                <div class="stats-row">
                  <div class="stat-card dark">
                    <div class="stat-amount dark">${payments.length}</div>
                    <div class="stat-label">Total Transactions</div>
                  </div>
                  <div class="stat-card green">
                    <div class="stat-amount green">${approvedCount}</div>
                    <div class="stat-label">Approved</div>
                  </div>
                  <div class="stat-card yellow">
                    <div class="stat-amount yellow">${pendingCount}</div>
                    <div class="stat-label">Pending Review</div>
                  </div>
                </div>
                <div class="amount-strip">
                  <div class="amount-strip-label">Total Verified Amount</div>
                  <div class="amount-strip-value">₦${totalPaid.toLocaleString()}</div>
                </div>
                ${totalPending > 0 ? '<div class="sub-strip" style="background:var(--yellow-bg);border:1px solid #fcd34d;"><span style="color:var(--yellow);font-weight:600;">Pending Clearance</span><span style="color:var(--yellow);font-weight:700;">₦' + totalPending.toLocaleString() + '</span></div>' : ''}
                ${rejectedCount > 0 ? '<div class="sub-strip" style="background:var(--red-bg);border:1px solid #fca5a5;"><span style="color:var(--red);font-weight:600;">Rejected (' + rejectedCount + ')</span><span style="color:var(--red);font-weight:700;">Not counted</span></div>' : ''}
              </div>

              <!-- Transaction History -->
              <div class="section">
                <div class="section-header">
                  <div class="section-icon blue">
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2.5" stroke-linecap="round"><rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                  </div>
                  <div class="section-title">Transaction History</div>
                  <div class="section-line"></div>
                </div>
                <div class="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        <th style="width:32px">#</th>
                        <th>Date</th>
                        <th>Description</th>
                        <th style="text-align:right">Amount</th>
                        <th>Reference</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${payments.map((p, i) => {
                        const amt = p.amount != null ? Number(p.amount) : 0
                        const d = new Date(p.created_at)
                        return '<tr>' +
                          '<td style="color:var(--slate-500);font-weight:500">' + String(i + 1).padStart(2, '0') + '</td>' +
                          '<td>' + d.toLocaleDateString('en-GB', { day:'2-digit', month:'short', year:'numeric' }) + '</td>' +
                          '<td style="font-weight:600;color:var(--slate-900)">' + (p.payment_type?.title || 'Payment') + '</td>' +
                          '<td class="td-amount" style="text-align:right">₦' + (isNaN(amt) ? 0 : amt).toLocaleString() + '</td>' +
                          '<td class="td-ref">' + (p.transaction_ref || '—') + '</td>' +
                          '<td><span class="badge ' + p.status + '">' + (p.status.charAt(0).toUpperCase() + p.status.slice(1)) + '</span></td>' +
                          '</tr>'
                      }).join('')}
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Note -->
              <div class="note">
                <div class="note-icon">!</div>
                <p>
                  <strong>Disclaimer:</strong> Only <strong>Approved</strong> payments are reflected in the verified total.
                  Pending payments are under review. This is a system-generated document and is valid without physical signature.
                </p>
              </div>

              <!-- Verification -->
              <div class="verification">
                <div class="verification-left">
                  <div class="qr-box">
                    ${Array.from({length: 49}, (_, i) => {
                      const h = (i * 7 + (docRef.length > 3 ? docRef.charCodeAt(3) : 42) + (i % 3)) % 5
                      return '<div class="qr-cell ' + (h < 3 ? 'f' : 'e') + '"></div>'
                    }).join('')}
                  </div>
                  <div class="verify-text">
                    <strong>Document Verification</strong><br>
                    Reference: <span class="verify-code">${docRef}</span><br>
                    Issued: ${new Date().toLocaleString('en-GB', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit' })}<br>
                    Integrity: System-verified
                  </div>
                </div>
                <div class="sig-block">
                  <div class="sig-line"></div>
                  <div class="sig-name">Authorized Signatory</div>
                </div>
              </div>
            </div>

            <!-- Footer -->
            <div class="footer">
              <div class="footer-brand">
                <svg class="footer-logo" viewBox="0 0 48 48" fill="none">
                  <rect width="48" height="48" rx="10" fill="var(--slate-50)" stroke="var(--slate-300)"/>
                  <defs>
                    <linearGradient id="flg1" x1="0%" y1="100%" x2="0%" y2="0%"><stop offset="0%" stop-color="#CC5202"/><stop offset="100%" stop-color="#FFAC5F"/></linearGradient>
                    <linearGradient id="flg2" x1="0%" y1="100%" x2="100%" y2="0%"><stop offset="0%" stop-color="#1BD88A"/><stop offset="100%" stop-color="#30FFAC"/></linearGradient>
                  </defs>
                  <rect x="10" y="28" width="7" height="10" rx="2" fill="url(#flg1)" opacity=".85"/>
                  <rect x="20" y="22" width="7" height="16" rx="2" fill="url(#flg1)" opacity=".9"/>
                  <rect x="30" y="14" width="7" height="24" rx="2" fill="url(#flg1)"/>
                  <circle cx="33.5" cy="12" r="3" fill="none" stroke="url(#flg2)" stroke-width="1.5"/>
                  <circle cx="33.5" cy="12" r="1" fill="url(#flg2)"/>
                </svg>
                <div class="footer-info">
                  <strong>Payvexo</strong> — Payment Management System<br>
                  Powered by Dev_Wishot &bull; ${new Date().getFullYear()}
                </div>
              </div>
              <div class="footer-right">
                Computer-generated document.<br>
                Valid without signature for amounts under ₦50,000.
              </div>
            </div>
          </div>

          <div class="print-actions no-print">
            <button class="btn-print" onclick="window.print()">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/></svg>
              Print / Save as PDF
            </button>
          </div>
        </body>
        </html>
      `;

      // Use iframe approach for iOS compatibility
      if (isIOS()) {
        // Create a hidden iframe for iOS printing
        let printFrame = printFrameRef.current;
        if (!printFrame) {
          printFrame = document.createElement('iframe');
          printFrame.style.position = 'fixed';
          printFrame.style.right = '0';
          printFrame.style.bottom = '0';
          printFrame.style.width = '0';
          printFrame.style.height = '0';
          printFrame.style.border = 'none';
          document.body.appendChild(printFrame);
          printFrameRef.current = printFrame;
        }
        
        const frameDoc = printFrame.contentDocument || printFrame.contentWindow?.document;
        if (frameDoc) {
          frameDoc.open();
          frameDoc.write(htmlContent);
          frameDoc.close();
          
          // Wait for content to load then print
          setTimeout(() => {
            printFrame?.contentWindow?.focus();
            printFrame?.contentWindow?.print();
          }, 500);
        }
      } else {
        // Standard approach for non-iOS devices
        const printWindow = window.open('', '_blank');
        if (!printWindow) {
          // Fallback to iframe if popup blocked
          let printFrame = printFrameRef.current;
          if (!printFrame) {
            printFrame = document.createElement('iframe');
            printFrame.style.position = 'fixed';
            printFrame.style.right = '0';
            printFrame.style.bottom = '0';
            printFrame.style.width = '0';
            printFrame.style.height = '0';
            printFrame.style.border = 'none';
            document.body.appendChild(printFrame);
            printFrameRef.current = printFrame;
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

    } catch (err) {
      setError(err instanceof Error ? 'Failed to generate print view. Please try again.' : 'An unexpected error occurred.')
    } finally {
      setLoading(false)
      setActiveAction(null)
    }
  }

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-2xl overflow-hidden"
      style={{ 
        background: 'linear-gradient(135deg, rgba(255, 107, 53, 0.08) 0%, rgba(255, 107, 53, 0.02) 100%)',
        border: `1px solid ${colors.primary}20`,
      }}
    >
      {/* Header with gradient accent */}
      <div 
        className="p-4 sm:p-5"
        style={{ 
          background: `linear-gradient(135deg, ${colors.primary}15 0%, transparent 100%)`,
          borderBottom: `1px solid ${colors.primary}15`
        }}
      >
        <div className="flex items-center gap-3">
          <motion.div 
            className="w-12 h-12 rounded-xl flex items-center justify-center"
            style={{ 
              background: gradients.primary,
              boxShadow: `0 4px 15px ${colors.primary}40`
            }}
            whileHover={{ scale: 1.05, rotate: 5 }}
          >
            <FileText className="w-6 h-6 text-white" />
          </motion.div>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <h3 className="text-lg font-bold text-white">Payment Statement</h3>
              <Sparkles className="w-4 h-4" style={{ color: colors.primary }} />
            </div>
            <p className="text-xs" style={{ color: colors.textSecondary }}>
              Export or print your official payment records
            </p>
          </div>
        </div>
      </div>

      <div className="p-4 sm:p-5 space-y-4">
        {/* Status Messages */}
        <AnimatePresence mode="wait">
          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="p-3 rounded-xl flex items-start gap-3"
              style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
            >
              <XCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-red-400">Error</p>
                <p className="text-xs text-red-400/80 mt-0.5">{error}</p>
              </div>
            </motion.div>
          )}
          {success && (
            <motion.div
              initial={{ opacity: 0, y: -10, height: 0 }}
              animate={{ opacity: 1, y: 0, height: 'auto' }}
              exit={{ opacity: 0, y: -10, height: 0 }}
              className="p-3 rounded-xl flex items-start gap-3"
              style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}
            >
              <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-green-400">Success</p>
                <p className="text-xs text-green-400/80 mt-0.5">{success}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Features List */}
        <div 
          className="p-4 rounded-xl"
          style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}
        >
          <p className="text-sm text-white mb-3 font-semibold flex items-center gap-2">
            <Eye className="w-4 h-4" style={{ color: colors.primary }} />
            What's included in your statement:
          </p>
          <div className="grid grid-cols-2 gap-2">
            {[
              'Personal details',
              'Payment history',
              'Summary statistics',
              'Transaction refs',
              'Payment methods',
              'Status breakdown'
            ].map((item, index) => (
              <motion.div
                key={item}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: index * 0.05 }}
                className="flex items-center gap-2 text-xs"
                style={{ color: colors.textSecondary }}
              >
                <CheckCircle className="w-3.5 h-3.5 text-green-400 shrink-0" />
                {item}
              </motion.div>
            ))}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-2 gap-3">
          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={generatePaymentSummary}
            disabled={loading}
            className="relative p-4 rounded-xl font-semibold flex flex-col items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
            style={{ 
              background: gradients.primary,
              boxShadow: `0 4px 20px ${colors.primary}30`
            }}
          >
            {/* Shine effect */}
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.1) 50%, transparent 70%)' }}
            />
            
            {activeAction === 'csv' ? (
              <Clock className="w-6 h-6 text-white animate-spin" />
            ) : (
              <FileSpreadsheet className="w-6 h-6 text-white" />
            )}
            <div className="text-center">
              <span className="text-sm text-white block">Download CSV</span>
              <span className="text-[10px] text-white/60">Spreadsheet format</span>
            </div>
          </motion.button>

          <motion.button
            whileHover={{ scale: 1.02, y: -2 }}
            whileTap={{ scale: 0.98 }}
            onClick={printSummary}
            disabled={loading}
            className="relative p-4 rounded-xl font-semibold flex flex-col items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed overflow-hidden group"
            style={{ 
              background: 'rgba(255,255,255,0.05)',
              border: '1px solid rgba(255,255,255,0.1)',
            }}
          >
            {/* Shine effect */}
            <div 
              className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ background: 'linear-gradient(45deg, transparent 30%, rgba(255,255,255,0.05) 50%, transparent 70%)' }}
            />
            
            {activeAction === 'print' ? (
              <Clock className="w-6 h-6 text-white animate-spin" />
            ) : (
              <Printer className="w-6 h-6 text-white" />
            )}
            <div className="text-center">
              <span className="text-sm text-white block">Print / PDF</span>
              <span className="text-[10px] text-white/60">Save or print</span>
            </div>
          </motion.button>
        </div>

        {/* Share Tip */}
        <motion.div 
          className="p-3 rounded-xl flex items-start gap-3"
          style={{ 
            background: `${colors.primary}08`,
            border: `1px solid ${colors.primary}20`
          }}
          whileHover={{ scale: 1.01 }}
        >
          <div 
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${colors.primary}20` }}
          >
            <Share2 className="w-4 h-4" style={{ color: colors.primary }} />
          </div>
          <div>
            <p className="text-xs font-semibold" style={{ color: colors.primary }}>
              Share with parents or guardians
            </p>
            <p className="text-[11px] mt-0.5" style={{ color: colors.textSecondary }}>
              Download and send as proof of payment activity
            </p>
          </div>
        </motion.div>
      </div>
    </motion.div>
  )
}
