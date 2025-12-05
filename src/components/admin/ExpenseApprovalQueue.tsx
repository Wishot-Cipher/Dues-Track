/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useEffect } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import CustomButton from '@/components/ui/CustomButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { colors } from '@/config/colors'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { fetchExpenses, approveExpense, type Expense } from '@/services/expenseService'
import { getPublicUrl } from '@/config/supabase'

export default function ExpenseApprovalQueue() {
  const { user } = useAuth()
  const { success, error: showError } = useToast()
  const [pendingExpenses, setPendingExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null)
  const [approvalLoading, setApprovalLoading] = useState(false)
  const [rejectionReason, setRejectionReason] = useState('')
  const [balanceMap, setBalanceMap] = useState<Map<string, number>>(new Map())
  const [imageModal, setImageModal] = useState<string | null>(null)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: 'info' | 'warning' | 'danger' | 'success'
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', type: 'info', onConfirm: () => {} })

  useEffect(() => {
    loadPendingExpenses()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadPendingExpenses() {
    try {
      setLoading(true)
      const data = await fetchExpenses(100, 'pending')
      setPendingExpenses(data || [])
      
      // Fetch available balances for all payment types
      await fetchAvailableBalances()
    } catch (err) {
      showError('Failed to load pending expenses')
    } finally {
      setLoading(false)
    }
  }

  async function fetchAvailableBalances() {
    try {
      const { supabase } = await import('@/config/supabase')
      
      // Get payments by payment type
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('amount, payment_type_id')
        .eq('status', 'approved')
        .not('transaction_ref', 'like', 'WAIVED-%')
      
      // Get approved expenses by funded_by
      const { data: expensesData } = await supabase
        .from('expenses')
        .select('amount, funded_by')
        .eq('status', 'approved')
      
      const balances = new Map<string, number>()
      
      // Calculate collected per payment type
      paymentsData?.forEach(p => {
        if (p.payment_type_id) {
          balances.set(p.payment_type_id, (balances.get(p.payment_type_id) || 0) + Number(p.amount))
        }
      })
      
      // Subtract expenses
      expensesData?.forEach(e => {
        if (e.funded_by) {
          balances.set(e.funded_by, (balances.get(e.funded_by) || 0) - Number(e.amount))
        }
      })
      
      setBalanceMap(balances)
    } catch (err) {
      console.error('Failed to fetch balances:', err)
    }
  }

  async function handleApprove(expenseId: string) {
    const expense = pendingExpenses.find(e => e.id === expenseId)
    if (!expense) return

    // Get current balance for this payment type
    const currentBalance = balanceMap.get(expense.funded_by || '') || 0
    const balanceAfterApproval = currentBalance - (expense.amount || 0)
    const LOW_BALANCE_THRESHOLD = 15000

    // Function to actually approve the expense
    const performApproval = async () => {
      try {
        setApprovalLoading(true)
        const adminId = user?.admins?.[0]?.id
        if (!adminId) {
          showError('Admin ID not found')
          return
        }
        await approveExpense({ expense_id: expenseId, approved: true, admin_id: adminId })
        success('Expense approved successfully')
        setPendingExpenses(prev => prev.filter(e => e.id !== expenseId))
        setSelectedExpense(null)
        // Refresh balances
        await fetchAvailableBalances()
      } catch (err) {
        showError('Failed to approve expense')
      } finally {
        setApprovalLoading(false)
      }
    }

    // Check for negative balance
    if (balanceAfterApproval < 0) {
      const negativeMessage = `🚫 CRITICAL: Negative Balance!\n\nApproving this expense will result in a NEGATIVE balance of ₦${balanceAfterApproval.toLocaleString()}.\n\nThis means you'll be overspending. Are you absolutely sure?`
      
      setConfirmDialog({
        isOpen: true,
        title: 'Critical: Negative Balance',
        message: negativeMessage,
        type: 'danger',
        onConfirm: performApproval
      })
      return
    }

    // Check for low balance warning
    if (balanceAfterApproval < LOW_BALANCE_THRESHOLD && balanceAfterApproval >= 0) {
      const warningMessage = `⚠️ WARNING: Low Balance Alert!\n\nApproving this expense will bring the balance down to ₦${balanceAfterApproval.toLocaleString()}, which is below ₦${LOW_BALANCE_THRESHOLD.toLocaleString()}.\n\nDo you still want to proceed?`
      
      setConfirmDialog({
        isOpen: true,
        title: 'Low Balance Warning',
        message: warningMessage,
        type: 'warning',
        onConfirm: performApproval
      })
      return
    }

    // Standard confirmation
    const confirmMessage = `Are you sure you want to approve this expense?\n\nExpense: ${expense.title}\nAmount: ₦${(expense.amount || 0).toLocaleString()}\nCurrent Balance: ₦${currentBalance.toLocaleString()}\nBalance After: ₦${balanceAfterApproval.toLocaleString()}`
    
    setConfirmDialog({
      isOpen: true,
      title: 'Approve Expense',
      message: confirmMessage,
      type: 'info',
      onConfirm: performApproval
    })
  }

  async function handleReject(expenseId: string) {
    if (!rejectionReason.trim()) {
      showError('Please provide a reason for rejection')
      return
    }

    try {
      setApprovalLoading(true)
      const adminId = user?.admins?.[0]?.id
      if (!adminId) {
        showError('Admin ID not found')
        return
      }
      await approveExpense({ 
        expense_id: expenseId, 
        approved: false,
        admin_id: adminId,
        reason: rejectionReason 
      })
      success('Expense rejected')
      setPendingExpenses(prev => prev.filter(e => e.id !== expenseId))
      setSelectedExpense(null)
      setRejectionReason('')
    } catch (err) {
      showError('Failed to reject expense')
    } finally {
      setApprovalLoading(false)
    }
  }

  // Only class_rep or financial_secretary can approve expenses
  const canApprove = user?.admins?.some((admin: { role: string }) => 
    admin.role === 'class_rep' || admin.role === 'financial_secretary'
  )

  if (!canApprove) {
    return (
      <GlassCard className="p-6">
        <div className="text-white">
          <h2 className="text-xl font-bold mb-2">Expense Approval Queue</h2>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            Only the Class Representative or Financial Secretary can approve expenses.
          </p>
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard className="p-6 relative overflow-hidden">
      {/* Decorative Top Border */}
      <div 
        className="absolute top-0 left-0 w-full h-1"
        style={{ background: `linear-gradient(90deg, ${colors.warning}, ${colors.primary}, transparent)` }}
      />
      
      <div className="text-white">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0 relative"
              style={{ 
                background: `linear-gradient(135deg, ${colors.warning}30, ${colors.warning}10)`,
                border: `1px solid ${colors.warning}40`
              }}
            >
              <svg className="w-6 h-6" style={{ color: colors.warning }} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {pendingExpenses.length > 0 && (
                <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full animate-pulse"
                     style={{ background: colors.warning, boxShadow: `0 0 8px ${colors.warning}` }} />
              )}
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Expense Approval Queue</h2>
              <p className="text-xs sm:text-sm" style={{ color: colors.textSecondary }}>
                {pendingExpenses.length} expense{pendingExpenses.length !== 1 ? 's' : ''} awaiting approval
              </p>
            </div>
          </div>
          <button
            onClick={loadPendingExpenses}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl transition-all hover:scale-105"
            style={{ 
              background: `linear-gradient(135deg, ${colors.primary}20, ${colors.primary}10)`,
              border: `1px solid ${colors.primary}40`,
              color: colors.primary
            }}
            disabled={loading}
          >
            🔄 <span className="font-medium">Refresh</span>
          </button>
        </div>

        {loading && (
          <div className="text-center py-8" style={{ color: colors.textSecondary }}>
            Loading pending expenses...
          </div>
        )}

        {!loading && pendingExpenses.length === 0 && (
          <div className="text-center py-12">
            <div className="text-6xl mb-4">✅</div>
            <p className="text-lg font-semibold mb-2">All Clear!</p>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              No expenses pending approval at the moment.
            </p>
          </div>
        )}

        {!loading && pendingExpenses.length > 0 && (
          <div className="space-y-3">
            {pendingExpenses.map((expense) => {
              const categoryData = (expense as unknown as Record<string, unknown>).category as { name?: string; icon?: string; color?: string } | undefined
              const categoryName = categoryData?.name || 'Uncategorized'
              const categoryIcon = categoryData?.icon || '📦'
              const categoryColor = categoryData?.color || colors.primary

              return (
                <div
                  key={expense.id}
                  className="border rounded-lg p-4 hover:border-orange-500/30 transition-all"
                  style={{ borderColor: colors.borderLight, background: 'rgba(255,255,255,0.02)' }}
                >
                  <div className="flex justify-between items-start">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <h3 className="font-semibold text-lg">{expense.title}</h3>
                        <span className="px-2 py-1 rounded-full text-xs font-medium" style={{ background: 'rgba(251, 191, 36, 0.1)', color: '#FBBF24', border: '1px solid rgba(251, 191, 36, 0.3)' }}>
                          ⏳ Pending
                        </span>
                      </div>
                      
                      <div className="flex items-center gap-3 text-sm mb-2" style={{ color: colors.textSecondary }}>
                        <span className="inline-flex items-center gap-1">
                          <span style={{ color: categoryColor }}>{categoryIcon}</span>
                          <span>{categoryName}</span>
                        </span>
                        <span>•</span>
                        <span>{expense.expense_date ? new Date(expense.expense_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                        <span>•</span>
                        <span className="font-bold" style={{ color: colors.primary }}>₦{Number(expense.amount || 0).toLocaleString()}</span>
                      </div>

                      {expense.description && (
                        <p className="text-sm line-clamp-2 mb-3" style={{ color: colors.textSecondary }}>
                          {expense.description}
                        </p>
                      )}

                      <div className="flex items-center gap-2">
                        <CustomButton
                          variant="primary"
                          onClick={() => handleApprove(expense.id)}
                          loading={approvalLoading && selectedExpense?.id === expense.id}
                          className="px-4 py-2"
                        >
                          ✓ Approve
                        </CustomButton>
                        <CustomButton
                          variant="secondary"
                          onClick={() => setSelectedExpense(expense)}
                          className="px-4 py-2"
                        >
                          ✗ Reject
                        </CustomButton>
                        {expense.receipt_url ? (
                          <button
                            onClick={() => {
                              if (expense.receipt_url) {
                                // Clean the path - remove any existing full URLs or bucket paths
                                let receiptPath = expense.receipt_url
                                
                                // If it's already a full URL, extract just the filename
                                if (receiptPath.includes('expense-receipts/')) {
                                  receiptPath = receiptPath.split('expense-receipts/').pop() || receiptPath
                                } else if (receiptPath.includes('/storage/v1/object/public/')) {
                                  receiptPath = receiptPath.split('/').pop() || receiptPath
                                }
                                
                                // Decode any URL encoding (handles %20, %2520, etc.)
                                try {
                                  receiptPath = decodeURIComponent(receiptPath)
                                } catch (e) {
                                  // Silently handle decode errors
                                }
                                
                                const fullUrl = getPublicUrl('expense-receipts', receiptPath)
                                setImageModal(fullUrl)
                              }
                            }}
                            className="px-4 py-2 rounded-lg transition-all hover:bg-white/10 text-sm"
                            style={{ border: `1px solid ${colors.borderLight}` }}
                          >
                            📄 View Receipt
                          </button>
                        ) : (
                          <span className="px-4 py-2 text-xs" style={{ color: colors.textSecondary }}>
                            No receipt uploaded
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Rejection Modal */}
        {selectedExpense && (
          <div className="fixed inset-0 z-50 flex items-start justify-center bg-black bg-opacity-70 p-4 overflow-y-auto">
            <div className="max-w-md w-full my-8">
              <GlassCard className="p-6">
                <h3 className="text-lg font-bold text-white mb-4">Reject Expense</h3>
                <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
                  You're about to reject <span className="font-semibold text-white">"{selectedExpense.title}"</span>
                </p>
                
                <div className="mb-4">
                  <label className="block text-sm font-medium text-white mb-2">
                    Rejection Reason *
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Please provide a clear reason for rejecting this expense..."
                    rows={4}
                    className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500"
                    required
                  />
                </div>

                <div className="flex items-center gap-3">
                  <CustomButton
                    variant="primary"
                    onClick={() => handleReject(selectedExpense.id)}
                    loading={approvalLoading}
                    className="flex-1 bg-red-500 hover:bg-red-600"
                  >
                    Confirm Rejection
                  </CustomButton>
                  <CustomButton
                    variant="secondary"
                    onClick={() => {
                      setSelectedExpense(null)
                      setRejectionReason('')
                    }}
                    className="flex-1"
                  >
                    Cancel
                  </CustomButton>
                </div>
              </GlassCard>
            </div>
          </div>
        )}

        {/* Confirmation Dialog */}
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
          onConfirm={confirmDialog.onConfirm}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type}
          confirmText="Yes, Approve"
          cancelText="Cancel"
        />

        {/* Image Modal */}
        {imageModal && (
          <div 
            className="fixed inset-0 z-100 flex items-center justify-center bg-black/90 p-4"
            onClick={() => setImageModal(null)}
          >
            <button
              onClick={() => setImageModal(null)}
              className="absolute top-4 right-4 text-white bg-black/50 hover:bg-black/70 rounded-full p-2 transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
            <img
              src={imageModal}
              alt="Receipt"
              className="max-w-full max-h-full object-contain rounded-lg"
              onClick={(e) => e.stopPropagation()}
              onError={(e) => {
                console.error('Failed to load image:', imageModal)
                e.currentTarget.src = 'data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="200" height="200"%3E%3Ctext x="50%25" y="50%25" font-size="16" text-anchor="middle" fill="white"%3EImage not found%3C/text%3E%3C/svg%3E'
              }}
            />
          </div>
        )}
      </div>
    </GlassCard>
  )
}
