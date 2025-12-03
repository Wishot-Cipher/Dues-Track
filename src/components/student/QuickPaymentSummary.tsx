import { useState } from 'react'
import { motion } from 'framer-motion'
import { Download, FileText, Printer, Share2, CheckCircle, Clock, XCircle } from 'lucide-react'
import { colors, gradients } from '@/config/colors'
import { supabase } from '@/config/supabase'
import { useAuth } from '@/hooks/useAuth'

export default function QuickPaymentSummary() {
  const { user } = useAuth()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function generatePaymentSummary() {
    if (!user) return

    try {
      setLoading(true)
      setError(null)

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
        // console.error('Error fetching payments:', fetchError)
        setError('Unable to fetch payment records. Please try again.')
        setLoading(false)
        return
      }

      if (!payments || payments.length === 0) {
        setError('No payment records found. You may not have made any payments yet.')
        setLoading(false)
        return
      }

      // Generate CSV
      const csvContent = generateCSV(student, payments)
      downloadCSV(csvContent, `Payment_Summary_${student.full_name.replace(/\s+/g, '_')}_${new Date().toISOString().split('T')[0]}.csv`)

    } catch (err) {
      // console.error('Failed to generate summary:', err)
      setError(err instanceof Error ? 'Failed to generate payment summary. Please try again.' : 'An unexpected error occurred.')
    } finally {
      setLoading(false)
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
      setError(null)

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
        // console.error('Error fetching payments for print:', fetchError)
        setError('Unable to fetch payment records for printing. Please try again.')
        setLoading(false)
        return
      }

      if (!payments || payments.length === 0) {
        setError('No payment records found to print. You may not have made any payments yet.')
        setLoading(false)
        return
      }

      // Generate printable HTML
      const printWindow = window.open('', '_blank')
      if (!printWindow) {
        setError('Please allow popups to print')
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
      const totalRejected = payments.filter(p => p.status === 'rejected').reduce((sum, p) => {
        const amount = p.amount != null ? Number(p.amount) : 0
        return sum + (isNaN(amount) ? 0 : amount)
      }, 0)
      const approvedCount = payments.filter(p => p.status === 'approved').length
      const pendingCount = payments.filter(p => p.status === 'pending').length
      const rejectedCount = payments.filter(p => p.status === 'rejected').length

      printWindow.document.write(`
        <!DOCTYPE html>
        <html>
        <head>
          <title>Payment Summary - ${student.full_name}</title>
          <style>
            body { font-family: Arial, sans-serif; padding: 40px; color: #333; }
            h1 { color: #6366f1; border-bottom: 3px solid #6366f1; padding-bottom: 10px; margin-bottom: 20px; }
            h2 { color: #4f46e5; margin-top: 30px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
            .header-info { background: #f8fafc; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
            .info-grid { display: grid; grid-template-columns: 150px 1fr; gap: 10px; margin: 20px 0; }
            .info-label { font-weight: bold; color: #6366f1; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th { background: #6366f1; color: white; padding: 12px; text-align: left; font-size: 13px; }
            td { padding: 10px; border-bottom: 1px solid #e5e7eb; font-size: 13px; }
            tr:hover { background: #f9fafb; }
            .status-approved { color: #22c55e; font-weight: bold; }
            .status-pending { color: #f59e0b; font-weight: bold; }
            .status-rejected { color: #ef4444; font-weight: bold; }
            .summary-box { background: #f8fafc; padding: 20px; border-radius: 8px; margin: 20px 0; border-left: 4px solid #6366f1; }
            .summary-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; }
            .summary-item { padding: 10px; background: white; border-radius: 6px; border: 1px solid #e5e7eb; }
            .summary-label { font-size: 12px; color: #6b7280; margin-bottom: 5px; }
            .summary-value { font-size: 20px; font-weight: bold; color: #1f2937; }
            .section-description { font-size: 13px; color: #6b7280; margin-bottom: 15px; font-style: italic; }
            .credit-box { margin-top: 30px; padding: 15px; background: #f8fafc; border-radius: 8px; border-left: 4px solid #6366f1; }
            @media print {
              body { padding: 20px; }
              .no-print { display: none; }
              tr:hover { background: none; }
            }
          </style>
        </head>
        <body>
          <h1>Class Dues Tracker - Official Payment Summary Report</h1>
          
          <div class="header-info">
            <strong>Report Generated:</strong> ${new Date().toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short' })}<br>
            <strong>Academic Session:</strong> ${new Date().getFullYear()}/${new Date().getFullYear() + 1}<br>
            <strong>Total Records:</strong> ${payments.length}
          </div>

          <h2>Student Information</h2>
          <div class="info-grid">
            <div class="info-label">Full Name:</div>
            <div>${student.full_name}</div>
            <div class="info-label">Email Address:</div>
            <div>${student.email}</div>
            <div class="info-label">Phone Number:</div>
            <div>${student.phone}</div>
            <div class="info-label">Department:</div>
            <div>${student.department || 'N/A'}</div>
            <div class="info-label">Current Level:</div>
            <div>${student.level || 'N/A'}</div>
          </div>

          <h2>Payment Summary Statistics</h2>
          <p class="section-description">Overview of all payment submissions and their current status</p>
          <div class="summary-box">
            <div class="summary-grid">
              <div class="summary-item">
                <div class="summary-label">Total Payments Submitted</div>
                <div class="summary-value">${payments.length}</div>
              </div>
              <div class="summary-item">
                <div class="summary-label">Total Amount Submitted</div>
                <div class="summary-value">₦${(totalPaid + totalPending + totalRejected).toLocaleString()}</div>
              </div>
              <div class="summary-item" style="border-left: 3px solid #22c55e;">
                <div class="summary-label">✓ Approved Payments</div>
                <div class="summary-value" style="color: #22c55e;">${approvedCount} (₦${totalPaid.toLocaleString()})</div>
              </div>
              <div class="summary-item" style="border-left: 3px solid #f59e0b;">
                <div class="summary-label">⏳ Pending Review</div>
                <div class="summary-value" style="color: #f59e0b;">${pendingCount} (₦${totalPending.toLocaleString()})</div>
              </div>
              <div class="summary-item" style="border-left: 3px solid #ef4444;">
                <div class="summary-label">✗ Rejected Payments</div>
                <div class="summary-value" style="color: #ef4444;">${rejectedCount} (₦${totalRejected.toLocaleString()})</div>
              </div>
              <div class="summary-item" style="border-left: 3px solid #6366f1;">
                <div class="summary-label">Net Amount Paid</div>
                <div class="summary-value" style="color: #6366f1;">₦${totalPaid.toLocaleString()}</div>
              </div>
            </div>
          </div>

          <h2>Complete Transaction History</h2>
          <p class="section-description">Detailed record of all payment submissions with dates, amounts, and verification status</p>
          <table>
            <thead>
              <tr>
                <th>No.</th>
                <th>Date & Time</th>
                <th>Payment Type</th>
                <th>Amount Paid</th>
                <th>Transaction Ref</th>
                <th>Status</th>
                <th>Verified By</th>
                <th>Notes</th>
              </tr>
            </thead>
            <tbody>
              ${payments.map((p, index) => {
                const amount = p.amount != null ? Number(p.amount) : 0
                const dateTime = new Date(p.created_at)
                const statusClass = p.status === 'approved' ? 'status-approved' : p.status === 'pending' ? 'status-pending' : 'status-rejected'
                const statusIcon = p.status === 'approved' ? '✓' : p.status === 'pending' ? '⏳' : '✗'
                return `
                <tr>
                  <td>${index + 1}</td>
                  <td>${dateTime.toLocaleDateString()}<br><small style="color: #6b7280;">${dateTime.toLocaleTimeString()}</small></td>
                  <td><strong>${p.payment_type?.title || 'Unknown'}</strong></td>
                  <td><strong>₦${(isNaN(amount) ? 0 : amount).toLocaleString()}</strong></td>
                  <td>${p.transaction_ref || 'N/A'}</td>
                  <td class="${statusClass}">${statusIcon} ${p.status.toUpperCase()}</td>
                  <td>${p.status === 'approved' || p.status === 'rejected' ? 'Admin' : 'Awaiting Review'}</td>
                  <td><small>${p.notes || 'None'}</small></td>
                </tr>
              `}).join('')}
            </tbody>
          </table>

          <div style="margin-top: 40px; padding: 15px; background: #fef3c7; border-left: 4px solid #f59e0b; border-radius: 8px;">
            <p style="margin: 0; font-size: 13px; color: #92400e;">
              <strong>Important Note:</strong> Only APPROVED payments count toward your total class dues paid. 
              PENDING payments are under admin review and do NOT yet count. 
              REJECTED payments do NOT count and may need to be resubmitted.
            </p>
          </div>

          <div class="credit-box">
            <p style="margin: 0; font-size: 12px; color: #666;">
              <strong style="color: #6366f1;">Powered By:</strong> Dev_Wishot - Professional Class Management Solutions
            </p>
            <p style="margin: 5px 0 0 0; font-size: 11px; color: #999;">
              Class Dues Tracker v2.0 | Developed by Dev_Wishot | This is an official record
            </p>
          </div>

          <button class="no-print" onclick="window.print()" style="
            background: #6366f1; 
            color: white; 
            padding: 12px 24px; 
            border: none; 
            border-radius: 8px; 
            cursor: pointer;
            font-size: 16px;
            margin-top: 20px;
            box-shadow: 0 2px 4px rgba(99, 102, 241, 0.2);
          ">🖨️ Print This Document</button>
        </body>
        </html>
      `)
      printWindow.document.close()

    } catch (err) {
      // console.error('Failed to print summary:', err)
      setError(err instanceof Error ? 'Failed to generate print view. Please try again.' : 'An unexpected error occurred.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-4 sm:p-6 rounded-xl border" style={{ 
      background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.1) 0%, rgba(168, 85, 247, 0.1) 100%)',
      borderColor: colors.borderLight 
    }}>
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center" style={{ background: gradients.primary }}>
          <FileText className="w-5 h-5 text-white" />
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Payment Summary</h3>
          <p className="text-xs" style={{ color: colors.textSecondary }}>
            Export or print your payment records
          </p>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-4 p-3 rounded-lg flex items-start gap-2"
          style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)' }}
        >
          <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          <p className="text-sm text-red-400">{error}</p>
        </motion.div>
      )}

      {/* Info Box */}
      <div className="mb-4 p-3 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
        <p className="text-sm text-white mb-2 font-medium">What's included:</p>
        <ul className="space-y-1 text-xs" style={{ color: colors.textSecondary }}>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Personal information and contact details
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Complete payment history with dates
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Summary statistics and breakdowns
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle className="w-3 h-3 text-green-400" />
            Transaction references and status
          </li>
        </ul>
      </div>

      {/* Action Buttons */}
      <div className="grid grid-cols-2 gap-3">
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={generatePaymentSummary}
          disabled={loading}
          className="p-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ 
            background: gradients.primary,
            color: 'white'
          }}
        >
          {loading ? (
            <>
              <Clock className="w-4 h-4 animate-spin" />
              <span className="text-sm">Generating...</span>
            </>
          ) : (
            <>
              <Download className="w-4 h-4" />
              <span className="text-sm">Download CSV</span>
            </>
          )}
        </motion.button>

        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          onClick={printSummary}
          disabled={loading}
          className="p-3 rounded-lg font-medium flex items-center justify-center gap-2 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
          style={{ 
            background: 'rgba(255,255,255,0.1)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.2)'
          }}
        >
          <Printer className="w-4 h-4" />
          <span className="text-sm">Print</span>
        </motion.button>
      </div>

      {/* Share Tip */}
      <div className="mt-4 p-3 rounded-lg flex items-start gap-2" style={{ background: 'rgba(59, 130, 246, 0.1)', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
        <Share2 className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
        <div>
          <p className="text-xs font-medium text-blue-400">Share with parents</p>
          <p className="text-xs mt-0.5" style={{ color: colors.textSecondary }}>
            Download and send to your parents as proof of payment
          </p>
        </div>
      </div>
    </div>
  )
}
