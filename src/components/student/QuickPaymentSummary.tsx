import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { FileText, Printer, Share2, CheckCircle, Clock, XCircle, Sparkles, FileSpreadsheet, Eye } from 'lucide-react'
import { colors, gradients } from '@/config/colors'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'

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
      const { data: payments, error: fetchError } = await supabase
        .from('payments')
        .select(`
          *,
          payment_type:payment_types(title, amount)
        `)
        .eq('student_id', user.id)
        .order('created_at', { ascending: false })

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
    lines.push('CLASS DUES TRACKER - OFFICIAL PAYMENT SUMMARY REPORT')
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
    lines.push(`Net Amount Paid,${escapeCSV('₦' + totalPaid.toLocaleString())},${escapeCSV('Total approved payments that count toward your class dues')}`)
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
    lines.push(`Document Status,${escapeCSV('Official payment record from Class Dues Tracker System v2.0')}`)
    lines.push(`Approved Payments,${escapeCSV('Only APPROVED payments count toward your total class dues paid')}`)
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
    lines.push(`Report Generated By,Class Dues Tracker System v2.0`)
    lines.push(`Generation Timestamp,${escapeCSV(new Date().toISOString())}`)
    lines.push('')
    lines.push('DEVELOPER CREDITS')
    lines.push('Field,Value')
    lines.push('Developed By,Dev_Wishot')
    lines.push('System Name,Class Dues Tracker')
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

      const { data: payments, error: fetchError } = await supabase
        .from('payments')
        .select(`
          *,
          payment_type:payment_types(title, amount)
        `)
        .eq('student_id', user.id)
        .order('created_at', { ascending: false })

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

      // Generate printable HTML content with professional design
      const htmlContent = `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="UTF-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Payment Statement - ${student.full_name}</title>
          <style>
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
            .stat-value {
              font-size: 24px;
              font-weight: 700;
              margin-bottom: 4px;
            }
            .stat-value.approved { color: #22c55e; }
            .stat-value.pending { color: #f59e0b; }
            .stat-value.rejected { color: #ef4444; }
            .stat-value.total { color: #FF6B35; }
            .stat-value.net { color: #667eea; }
            .stat-label {
              font-size: 11px;
              color: #64748b;
              text-transform: uppercase;
              letter-spacing: 0.5px;
            }
            table {
              width: 100%;
              border-collapse: collapse;
              font-size: 13px;
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
            td {
              padding: 12px 10px;
              border-bottom: 1px solid #e2e8f0;
            }
            tr:last-child td { border-bottom: none; }
            tr:hover { background: #f8fafc; }
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
            .amount { font-weight: 600; color: #1e293b; }
            .note-box {
              background: linear-gradient(135deg, #fef3c7 0%, #fef9c3 100%);
              border-radius: 12px;
              padding: 16px;
              display: flex;
              align-items: flex-start;
              gap: 12px;
              border: 1px solid #fcd34d;
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
            .print-btn:active { transform: translateY(0); }
            @media print {
              body { background: white; padding: 0; }
              .container { padding: 0; }
              .card { box-shadow: none; border: 1px solid #e2e8f0; }
              .no-print { display: none !important; }
              .print-btn { display: none !important; }
              tr:hover { background: none; }
            }
            @media (max-width: 600px) {
              .stats-grid { grid-template-columns: repeat(2, 1fr); }
              .info-grid { grid-template-columns: 1fr; }
              table { font-size: 11px; }
              th, td { padding: 8px 6px; }
              .header { padding: 20px; }
              .header h1 { font-size: 20px; }
            }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="card">
              <div class="header">
                <h1>📄 Official Payment Statement</h1>
                <p>Class Dues Tracker - Student Payment Report</p>
                <div class="badge">Generated: ${new Date().toLocaleDateString('en-US', { dateStyle: 'medium' })}</div>
              </div>
              
              <div class="content">
                <div class="section">
                  <div class="section-title">👤 Student Information</div>
                  <div class="info-card">
                    <div class="info-grid">
                      <div class="info-item">
                        <span class="info-label">Full Name</span>
                        <span class="info-value">${student.full_name}</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Email</span>
                        <span class="info-value">${student.email}</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Phone</span>
                        <span class="info-value">${student.phone}</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Department</span>
                        <span class="info-value">${student.department || 'N/A'}</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Level</span>
                        <span class="info-value">${student.level || 'N/A'}</span>
                      </div>
                      <div class="info-item">
                        <span class="info-label">Session</span>
                        <span class="info-value">${new Date().getFullYear()}/${new Date().getFullYear() + 1}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div class="section">
                  <div class="section-title">📊 Payment Summary</div>
                  <div class="stats-grid">
                    <div class="stat-card total">
                      <div class="stat-value total">${payments.length}</div>
                      <div class="stat-label">Total Submitted</div>
                    </div>
                    <div class="stat-card approved">
                      <div class="stat-value approved">${approvedCount}</div>
                      <div class="stat-label">Approved</div>
                    </div>
                    <div class="stat-card pending">
                      <div class="stat-value pending">${pendingCount}</div>
                      <div class="stat-label">Pending</div>
                    </div>
                    <div class="stat-card rejected">
                      <div class="stat-value rejected">${rejectedCount}</div>
                      <div class="stat-label">Rejected</div>
                    </div>
                    <div class="stat-card net">
                      <div class="stat-value net">₦${totalPaid.toLocaleString()}</div>
                      <div class="stat-label">Net Paid</div>
                    </div>
                    <div class="stat-card total">
                      <div class="stat-value total">₦${(totalPaid + totalPending).toLocaleString()}</div>
                      <div class="stat-label">Total Amount</div>
                    </div>
                  </div>
                </div>

                <div class="section">
                  <div class="section-title">📋 Transaction History</div>
                  <table>
                    <thead>
                      <tr>
                        <th>#</th>
                        <th>Date</th>
                        <th>Payment Type</th>
                        <th>Amount</th>
                        <th>Reference</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      ${payments.map((p, index) => {
                        const amount = p.amount != null ? Number(p.amount) : 0
                        const dateTime = new Date(p.created_at)
                        return `
                        <tr>
                          <td>${index + 1}</td>
                          <td>${dateTime.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</td>
                          <td>${p.payment_type?.title || 'Unknown'}</td>
                          <td class="amount">₦${(isNaN(amount) ? 0 : amount).toLocaleString()}</td>
                          <td>${p.transaction_ref || 'N/A'}</td>
                          <td><span class="status ${p.status}">${p.status === 'approved' ? '✓' : p.status === 'pending' ? '⏳' : '✗'} ${p.status.charAt(0).toUpperCase() + p.status.slice(1)}</span></td>
                        </tr>
                      `}).join('')}
                    </tbody>
                  </table>
                </div>

                <div class="note-box">
                  <div class="note-icon">!</div>
                  <div class="note-text">
                    <strong>Important:</strong> Only APPROVED payments count toward your total class dues. 
                    PENDING payments are under review and REJECTED payments do not count.
                  </div>
                </div>
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
                  Generated: ${new Date().toLocaleString('en-US', { dateStyle: 'short', timeStyle: 'short' })}<br>
                  Document ID: ${Math.random().toString(36).substring(2, 10).toUpperCase()}
                </div>
              </div>
            </div>

            <button class="print-btn no-print" onclick="window.print()">
              🖨️ Print / Save as PDF
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
