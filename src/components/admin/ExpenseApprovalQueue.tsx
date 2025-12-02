/* eslint-disable @typescript-eslint/no-unused-vars */
import React, { useState, useEffect } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import CustomButton from '@/components/ui/CustomButton'
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

  useEffect(() => {
    loadPendingExpenses()
  }, [])

  async function loadPendingExpenses() {
    try {
      setLoading(true)
      const data = await fetchExpenses(100, 'pending')
      setPendingExpenses(data || [])
    } catch (err) {
      showError('Failed to load pending expenses')
    } finally {
      setLoading(false)
    }
  }

  async function handleApprove(expenseId: string) {
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
    } catch (err) {
      showError('Failed to approve expense')
    } finally {
      setApprovalLoading(false)
    }
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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
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
    <GlassCard className="p-6">
      <div className="text-white">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-xl font-bold">Expense Approval Queue</h2>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
              {pendingExpenses.length} expense{pendingExpenses.length !== 1 ? 's' : ''} awaiting approval
            </p>
          </div>
          <button
            onClick={loadPendingExpenses}
            className="px-4 py-2 rounded-lg transition-all hover:bg-white/10"
            style={{ border: `1px solid ${colors.borderLight}` }}
            disabled={loading}
          >
            🔄 Refresh
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
                        {expense.receipt_url && (
                          <a
                            href={getPublicUrl('expense-receipts', expense.receipt_url)}
                            target="_blank"
                            rel="noreferrer"
                            className="px-4 py-2 rounded-lg transition-all hover:bg-white/10 text-sm"
                            style={{ border: `1px solid ${colors.borderLight}` }}
                          >
                            📄 View Receipt
                          </a>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-70 p-4">
            <div className="max-w-md w-full">
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
      </div>
    </GlassCard>
  )
}
