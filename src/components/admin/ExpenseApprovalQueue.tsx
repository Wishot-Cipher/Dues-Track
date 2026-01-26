/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown'
import { colors } from '@/config/colors'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { fetchExpenses, approveExpense, deleteExpense, updateExpenseFields, fetchExpenseCategories, type Expense, type ExpenseCategory } from '@/services/expenseService'
import { getPublicUrl, supabase } from '@/config/supabase'
import { 
  CheckCircle, 
  XCircle, 
  Clock, 
  Trash2, 
  Edit3, 
  Eye, 
  X, 
  AlertTriangle,
  DollarSign,
  Calendar,
  RefreshCw,
  ChevronRight,
  Sparkles,
  TrendingDown,
  Receipt
} from 'lucide-react'

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
  const [showRejectModal, setShowRejectModal] = useState(false)
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Partial<Expense> | null>(null)
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [paymentTypes, setPaymentTypes] = useState<{ id: string; name: string }[]>([])
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: 'info' | 'warning' | 'danger' | 'success'
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', type: 'info', onConfirm: () => {} })

  useEffect(() => {
    loadPendingExpenses()
    loadCategories()
    loadPaymentTypes()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function renderCategoryIcon(icon: any, name: string, color: string) {
    // If it's a valid React element, render it directly
    if (icon && typeof icon === 'object' && icon.$$typeof) return icon

    // If icon is a URL, render an image
    if (typeof icon === 'string' && /^(https?:)?\/\//.test(icon)) {
      return (
        <img
          src={icon}
          alt={name}
          className="w-6 h-6 sm:w-8 sm:h-8 object-contain"
          style={{ display: 'block' }}
        />
      )
    }

    // If icon is a short string (emoji or 1-2 chars), render it large
    if (typeof icon === 'string' && icon.trim().length <= 2) {
      return (
        <span className="text-lg sm:text-xl" style={{ lineHeight: 1 }}>
          {icon}
        </span>
      )
    }

    // Otherwise, fallback to initials from the category name
    const initials = (name || '')
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map(s => s[0]?.toUpperCase())
      .join('') || '📦'

    return (
      <span className="text-sm sm:text-base font-semibold" style={{ color }}>
        {initials}
      </span>
    )
  }

  async function loadCategories() {
    try {
      // Include inactive categories so admins can reassign expenses to them
      const data = await fetchExpenseCategories(true)
      setCategories(data)
    } catch (err) {
      console.error('Failed to load categories:', err)
    }
  }

  async function loadPaymentTypes() {
    try {
      const { data } = await supabase.from('payment_types').select('id, name').eq('is_active', true)
      setPaymentTypes(data || [])
    } catch (err) {
      console.error('Failed to load payment types:', err)
    }
  }

  async function loadPendingExpenses() {
    try {
      setLoading(true)
      const data = await fetchExpenses(100, 'pending')
      setPendingExpenses(data || [])
      await fetchAvailableBalances()
    } catch (err) {
      showError('Failed to load pending expenses')
    } finally {
      setLoading(false)
    }
  }

  async function fetchAvailableBalances() {
    try {
      // Compute balances per category (collected - expenses)
      const { data: paymentsData } = await supabase
        .from('payments')
        .select('amount, payment_type_id, payment_types ( id, category )')
        .eq('status', 'approved')
        .not('transaction_ref', 'like', 'WAIVED-%')

      const { data: expensesData } = await supabase
        .from('expenses')
        .select('amount, category, category_id, payment_type_id, payment_types ( id, category )')
        .eq('status', 'approved')

      const balances = new Map<string, number>()

      // Add collected payments to their payment type's category
      paymentsData?.forEach((p: any) => {
        const cat = Array.isArray(p.payment_types) ? p.payment_types[0]?.category : p.payment_types?.category
        const categoryKey = cat || 'Other'
        balances.set(categoryKey, (balances.get(categoryKey) || 0) + Number(p.amount || 0))
      })

      // Subtract approved expenses from their category
      expensesData?.forEach((e: any) => {
        // expense may have relation or a raw category field
        const catFromRel = Array.isArray(e.payment_types) ? e.payment_types[0]?.category : e.payment_types?.category
        const categoryKey = e.category || catFromRel || 'Other'
        balances.set(categoryKey, (balances.get(categoryKey) || 0) - Number(e.amount || 0))
      })

      setBalanceMap(balances)
    } catch (err) {
      console.error('Failed to fetch balances:', err)
    }
  }

  async function handleApprove(expenseId: string) {
    const expense = pendingExpenses.find(e => e.id === expenseId)
    if (!expense) return

    // mark selected so loading state can be shown per-item
    setSelectedExpense(expense)

    // Determine expense category (support relation or plain string)
    const expenseCategory = (expense as any).category?.name || (expense as any).category || (expense as any).payment_types?.[0]?.category || 'Other'
    const currentBalance = balanceMap.get(expenseCategory) || 0
    const balanceAfterApproval = currentBalance - (expense.amount || 0)
    const LOW_BALANCE_THRESHOLD = 15000

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
        await fetchAvailableBalances()
      } catch (err) {
        showError('Failed to approve expense')
      } finally {
        setApprovalLoading(false)
      }
    }

    if (balanceAfterApproval < 0) {
      const negativeMessage = `CRITICAL: Negative Balance!

Approving this expense will result in a NEGATIVE balance of N${balanceAfterApproval.toLocaleString()}.

This means the associated funding source will be overdrawn. If this is intended, confirm below to proceed. Otherwise, cancel and review funding allocations or request additional funds.`

      setConfirmDialog({
        isOpen: true,
        title: 'Critical: Negative Balance',
        message: negativeMessage,
        type: 'danger',
        onConfirm: performApproval
      })
      return
    }

    if (balanceAfterApproval < LOW_BALANCE_THRESHOLD && balanceAfterApproval >= 0) {
      const warningMessage = `WARNING: Low Balance Alert!

Approving this expense will bring the balance down to N${balanceAfterApproval.toLocaleString()}, which is below the recommended threshold of N${LOW_BALANCE_THRESHOLD.toLocaleString()}.

Proceed only if you are aware of the implications.`

      setConfirmDialog({
        isOpen: true,
        title: 'Low Balance Warning',
        message: warningMessage,
        type: 'warning',
        onConfirm: performApproval
      })
      return
    }

    const confirmMessage = `Are you sure you want to approve this expense?

Expense: ${expense.title}
Amount: N${(expense.amount || 0).toLocaleString()}
Current Balance: N${currentBalance.toLocaleString()}
Balance After Approval: N${balanceAfterApproval.toLocaleString()}`

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
      setShowRejectModal(false)
      setRejectionReason('')
    } catch (err) {
      showError('Failed to reject expense')
    } finally {
      setApprovalLoading(false)
    }
  }

  async function handleDelete(expenseId: string) {
    try {
      setApprovalLoading(true)
      await deleteExpense(expenseId)
      success('Expense deleted successfully')
      setPendingExpenses(prev => prev.filter(e => e.id !== expenseId))
      setShowDeleteConfirm(false)
      setSelectedExpense(null)
    } catch (err) {
      showError('Failed to delete expense')
    } finally {
      setApprovalLoading(false)
    }
  }

  async function handleEdit() {
    if (!editingExpense?.id) return

    try {
      setApprovalLoading(true)
      await updateExpenseFields(editingExpense.id, {
        title: editingExpense.title,
        description: editingExpense.description || undefined,
        amount: editingExpense.amount,
        category_id: editingExpense.category_id || undefined,
        funded_by: editingExpense.funded_by || undefined,
        expense_date: editingExpense.expense_date
      })
      success('Expense updated successfully')
      setShowEditModal(false)
      setEditingExpense(null)
      await loadPendingExpenses()
    } catch (err) {
      showError('Failed to update expense')
    } finally {
      setApprovalLoading(false)
    }
  }

  // Only admins, class_reps, financial secretaries (finsec) can approve expenses
  // Admin and Class Rep can do everything, Finsec can approve expenses but NOT manage students
  const canApprove = user?.admins?.some((admin: { role?: string; can_approve_payments?: boolean }) => 
    admin.role === 'class_rep' ||
    admin.role === 'finsec' ||
    admin.role === 'financial_secretary' ||
    admin.role === 'admin' ||
    admin.can_approve_payments === true
  )

  if (!canApprove) {
    return (
      <GlassCard className="p-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: `${colors.warning}15` }}>
            <AlertTriangle className="w-8 h-8" style={{ color: colors.warning }} />
          </div>
          <h2 className="text-xl font-bold text-white mb-2">Access Restricted</h2>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            Only Admins, Class Representatives, or Financial Secretaries can approve expenses.
          </p>
        </div>
      </GlassCard>
    )
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
    >
      <GlassCard className="relative overflow-hidden">
        {/* Gradient Header Line */}
        <div
          className="absolute top-0 left-0 w-full h-1"
          style={{ background: `linear-gradient(90deg, ${colors.warning}, ${colors.primary}, ${colors.accentMint})` }}
        />

        {/* Header Section */}
        <div className="p-6 pb-4">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <motion.div
                initial={{ scale: 0.8 }}
                animate={{ scale: 1 }}
                className="relative"
              >
                <div
                  className="w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg"
                  style={{
                    background: `linear-gradient(135deg, ${colors.warning}30, ${colors.warning}10)`,
                    border: `1px solid ${colors.warning}40`,
                    boxShadow: `0 4px 20px ${colors.warning}20`
                  }}
                >
                  <Receipt className="w-7 h-7" style={{ color: colors.warning }} />
                </div>
                {pendingExpenses.length > 0 && (
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold"
                    style={{ background: colors.warning, color: '#000' }}
                  >
                    {pendingExpenses.length}
                  </motion.div>
                )}
              </motion.div>
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <h2 className="text-xl lg:text-2xl font-bold text-white">Expense Approval Queue</h2>
                  <motion.span
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold"
                    style={{ 
                      background: `linear-gradient(135deg, ${colors.warning}30, ${colors.warning}10)`,
                      border: `1px solid ${colors.warning}40`,
                      color: colors.warning
                    }}
                  >
                    <Sparkles className="w-3 h-3" />
                    ADMIN PANEL
                  </motion.span>
                </div>
                <p className="text-sm" style={{ color: colors.textSecondary }}>
                  Review and manage pending expense requests
                </p>
              </div>
            </div>
            
            <motion.button
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={loadPendingExpenses}
              disabled={loading}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl font-medium transition-all self-start lg:self-auto"
              style={{
                background: `linear-gradient(135deg, ${colors.primary}25, ${colors.primary}10)`,
                border: `1px solid ${colors.primary}40`,
                color: colors.primary
              }}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              <span>Refresh</span>
            </motion.button>
          </div>

          {/* Stats Row */}
          <div className="grid grid-cols-3 gap-2 sm:gap-3 mt-6">
            <div className="p-2 sm:p-3 rounded-xl text-center overflow-hidden" style={{ background: 'rgba(251, 191, 36, 0.1)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
              <div className="flex flex-col items-center justify-center mb-0.5 sm:mb-1">
                <Clock className="w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5" style={{ color: colors.warning }} />
                <span className="text-[11px] sm:text-base font-bold leading-tight" style={{ color: colors.warning }}>{pendingExpenses.length}</span>
              </div>
              <p className="text-[9px] sm:text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Pending</p>
            </div>
            <div className="p-2 sm:p-3 rounded-xl text-center overflow-hidden" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.2)' }}>
              <div className="flex flex-col items-center justify-center mb-0.5 sm:mb-1">
                <DollarSign className="w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5" style={{ color: '#22C55E' }} />
                <span className="text-[11px] sm:text-base font-bold leading-tight truncate w-full" style={{ color: '#22C55E' }}>
                  ₦{pendingExpenses.reduce((sum, e) => sum + (e.amount || 0), 0).toLocaleString()}
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Total</p>
            </div>
            <div className="p-2 sm:p-3 rounded-xl text-center overflow-hidden" style={{ background: `${colors.primary}10`, border: `1px solid ${colors.primary}20` }}>
              <div className="flex flex-col items-center justify-center mb-0.5 sm:mb-1">
                <TrendingDown className="w-3.5 h-3.5 sm:w-4 sm:h-4 mb-0.5" style={{ color: colors.primary }} />
                <span className="text-[11px] sm:text-base font-bold leading-tight truncate w-full" style={{ color: colors.primary }}>
                  ₦{pendingExpenses.length > 0 ? Math.round(pendingExpenses.reduce((sum, e) => sum + (e.amount || 0), 0) / pendingExpenses.length).toLocaleString() : 0}
                </span>
              </div>
              <p className="text-[9px] sm:text-[10px] uppercase tracking-wider" style={{ color: colors.textSecondary }}>Average</p>
            </div>
          </div>
        </div>

        {/* Content Section */}
        <div className="px-6 pb-6">
          {loading && (
            <div className="text-center py-12">
              <div className="w-12 h-12 mx-auto border-4 border-t-transparent rounded-full animate-spin mb-4"
                   style={{ borderColor: `${colors.warning}30`, borderTopColor: 'transparent' }} />
              <p style={{ color: colors.textSecondary }}>Loading pending expenses...</p>
            </div>
          )}

          {!loading && pendingExpenses.length === 0 && (
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              className="text-center py-16"
            >
              <div className="w-20 h-20 mx-auto mb-6 rounded-3xl flex items-center justify-center"
                   style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                <CheckCircle className="w-10 h-10" style={{ color: '#22C55E' }} />
              </div>
              <h3 className="text-xl font-bold text-white mb-2">All Clear!</h3>
              <p className="text-sm max-w-sm mx-auto" style={{ color: colors.textSecondary }}>
                No expenses pending approval. Great job keeping up with the queue!
              </p>
            </motion.div>
          )}

          {!loading && pendingExpenses.length > 0 && (
            <div className="space-y-4">
              {pendingExpenses.map((expense, index) => {
                const categoryData = (expense as unknown as Record<string, unknown>).category as { name?: string; icon?: string; color?: string } | undefined
                const categoryName = categoryData?.name || 'Uncategorized'
                const categoryIcon = categoryData?.icon || '📦'
                const categoryColor = categoryData?.color || colors.primary
                const currentBalance = balanceMap.get(expense.funded_by || '') || 0
                const balanceAfter = currentBalance - (expense.amount || 0)

                return (
                  <motion.div
                    key={expense.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group rounded-2xl overflow-hidden transition-all hover:shadow-lg"
                    style={{ 
                      background: 'rgba(255, 255, 255, 0.03)',
                      border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                  >
                    {/* Card Content */}
                    <div className="p-4 sm:p-5">
                      {/* Mobile: Stack vertically, Desktop: Row layout */}
                      <div className="space-y-4 sm:space-y-0 sm:flex sm:items-start sm:justify-between sm:gap-4">
                        {/* Left Section - Expense Info */}
                        <div className="flex items-start gap-3 sm:gap-4 flex-1 min-w-0">
                          <div
                            className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl flex items-center justify-center shrink-0 text-lg sm:text-xl"
                            style={{ 
                              background: `${categoryColor}20`,
                              border: `1px solid ${categoryColor}40`
                            }}
                          >
                            {renderCategoryIcon(categoryIcon, categoryName, categoryColor)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <h3 className="font-semibold text-white text-base sm:text-lg leading-tight mb-1">{expense.title}</h3>
                            <div className="flex flex-wrap items-center gap-1.5 sm:gap-2 text-xs sm:text-sm" style={{ color: colors.textSecondary }}>
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md"
                                    style={{ background: `${categoryColor}15`, color: categoryColor }}>
                                {categoryName}
                              </span>
                              <span className="inline-flex items-center gap-1">
                                <Calendar className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                                {expense.expense_date ? new Date(expense.expense_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—'}
                              </span>
                            </div>
                            {expense.description && (
                              <p className="text-xs sm:text-sm mt-2 line-clamp-2" style={{ color: colors.textSecondary }}>
                                {expense.description}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Right Section - Amount & Status */}
                        <div className="flex items-center justify-between sm:flex-col sm:items-end gap-2 sm:shrink-0 pl-13 sm:pl-0">
                          <div className="text-left sm:text-right">
                            <p className="text-xl sm:text-2xl font-bold" style={{ color: colors.primary }}>
                              ₦{(expense.amount || 0).toLocaleString()}
                            </p>
                            <p className="text-[10px] sm:text-xs" style={{ color: colors.textSecondary }}>
                              After: <span style={{ color: balanceAfter < 0 ? '#EF4444' : '#22C55E' }}>₦{balanceAfter.toLocaleString()}</span>
                            </p>
                          </div>
                          <span
                            className="inline-flex items-center gap-1 px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[10px] sm:text-xs font-semibold whitespace-nowrap"
                            style={{ 
                              background: 'rgba(251, 191, 36, 0.15)', 
                              color: '#FBBF24',
                              border: '1px solid rgba(251, 191, 36, 0.3)'
                            }}
                          >
                            <Clock className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                            Pending
                          </span>
                        </div>
                      </div>

                      {/* Action Buttons - Responsive grid on mobile */}
                      <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2 mt-4 pt-4" style={{ borderTop: '1px solid rgba(255, 255, 255, 0.06)' }}>
                        {/* Approve Button */}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => handleApprove(expense.id)}
                          disabled={approvalLoading && selectedExpense?.id === expense.id}
                          className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all disabled:opacity-50"
                          style={{
                            background: 'linear-gradient(135deg, #22C55E, #16A34A)',
                            color: 'white',
                            boxShadow: '0 4px 12px rgba(34, 197, 94, 0.3)'
                          }}
                        >
                          {approvalLoading && selectedExpense?.id === expense.id ? (
                            <div className="w-3.5 h-3.5 sm:w-4 sm:h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                          ) : (
                            <CheckCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          )}
                          <span>Approve</span>
                        </motion.button>

                        {/* Reject Button */}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            setSelectedExpense(expense)
                            setShowRejectModal(true)
                            setRejectionReason('')
                          }}
                          className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-semibold transition-all"
                          style={{
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#EF4444',
                            border: '1px solid rgba(239, 68, 68, 0.3)'
                          }}
                        >
                          <XCircle className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span>Reject</span>
                        </motion.button>

                        {/* Edit Button */}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            setEditingExpense({ ...expense })
                            setShowEditModal(true)
                          }}
                          className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all"
                          style={{
                            background: 'rgba(255, 255, 255, 0.05)',
                            color: colors.textSecondary,
                            border: '1px solid rgba(255, 255, 255, 0.1)'
                          }}
                        >
                          <Edit3 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span>Edit</span>
                        </motion.button>

                        {/* Delete Button */}
                        <motion.button
                          whileHover={{ scale: 1.02 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={() => {
                            setSelectedExpense(expense)
                            setShowDeleteConfirm(true)
                          }}
                          className="flex items-center justify-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-2 sm:py-2.5 rounded-xl text-xs sm:text-sm font-medium transition-all"
                          style={{
                            background: 'rgba(239, 68, 68, 0.08)',
                            color: '#EF4444',
                            border: '1px solid rgba(239, 68, 68, 0.15)'
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                          <span>Delete</span>
                        </motion.button>

                        {/* View Receipt Button */}
                        {expense.receipt_url ? (
                          <motion.button
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={() => {
                              if (expense.receipt_url) {
                                let receiptPath = expense.receipt_url
                                if (receiptPath.includes('expense-receipts/')) {
                                  receiptPath = receiptPath.split('expense-receipts/').pop() || receiptPath
                                } else if (receiptPath.includes('/storage/v1/object/public/')) {
                                  receiptPath = receiptPath.split('/').pop() || receiptPath
                                }
                                try {
                                  receiptPath = decodeURIComponent(receiptPath)
                                } catch {
                                  // ignore decode errors
                                }
                                const fullUrl = getPublicUrl('expense-receipts', receiptPath)
                                setImageModal(fullUrl)
                              }
                            }}
                            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium transition-all ml-auto"
                            style={{
                              background: `${colors.primary}15`,
                              color: colors.primary,
                              border: `1px solid ${colors.primary}30`
                            }}
                          >
                            <Eye className="w-4 h-4" />
                            <span>View Receipt</span>
                            <ChevronRight className="w-4 h-4" />
                          </motion.button>
                        ) : (
                          <span className="text-xs ml-auto px-3 py-2" style={{ color: colors.textSecondary }}>
                            No receipt attached
                          </span>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>
          )}
        </div>

        {/* Reject Modal */}
        <AnimatePresence>
          {showRejectModal && selectedExpense && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
              onClick={() => setShowRejectModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md"
              >
                <GlassCard className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1" style={{ background: '#EF4444' }} />
                  <div className="p-6">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                        <XCircle className="w-6 h-6" style={{ color: '#EF4444' }} />
                      </div>
                      <div>
                        <h3 className="text-lg font-bold text-white">Reject Expense</h3>
                        <p className="text-sm" style={{ color: colors.textSecondary }}>
                          Rejecting "{selectedExpense.title}"
                        </p>
                      </div>
                    </div>

                    <div className="mb-6">
                      <label className="block text-sm font-medium text-white mb-2">
                        Reason for Rejection <span className="text-red-400">*</span>
                      </label>
                      <textarea
                        value={rejectionReason}
                        onChange={(e) => setRejectionReason(e.target.value)}
                        placeholder="Please provide a clear reason for rejection..."
                        rows={4}
                        className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                        style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                      />
                    </div>

                    <div className="flex gap-3">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowRejectModal(false)}
                        className="flex-1 px-4 py-3 rounded-xl font-medium"
                        style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textSecondary }}
                      >
                        Cancel
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleReject(selectedExpense.id)}
                        disabled={approvalLoading || !rejectionReason.trim()}
                        className="flex-1 px-4 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}
                      >
                        {approvalLoading ? 'Rejecting...' : 'Confirm Rejection'}
                      </motion.button>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Edit Modal */}
        <AnimatePresence>
          {showEditModal && editingExpense && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto"
              onClick={() => setShowEditModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-lg my-8"
              >
                <GlassCard className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1" style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accentMint})` }} />
                  <div className="p-6">
                    <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                        <div className="w-12 h-12 rounded-xl flex items-center justify-center" style={{ background: `${colors.primary}20` }}>
                          <Edit3 className="w-6 h-6" style={{ color: colors.primary }} />
                        </div>
                        <div>
                          <h3 className="text-lg font-bold text-white">Edit Expense</h3>
                          <p className="text-sm" style={{ color: colors.textSecondary }}>
                            Modify expense details
                          </p>
                        </div>
                      </div>
                      <button onClick={() => setShowEditModal(false)} className="p-2 rounded-lg hover:bg-white/10">
                        <X className="w-5 h-5" style={{ color: colors.textSecondary }} />
                      </button>
                    </div>

                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Title</label>
                        <input
                          type="text"
                          value={editingExpense.title || ''}
                          onChange={(e) => setEditingExpense({ ...editingExpense, title: e.target.value })}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2"
                          style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Description</label>
                        <textarea
                          value={editingExpense.description || ''}
                          onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
                          rows={3}
                          className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2 resize-none"
                          style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <label className="block text-sm font-medium text-white mb-2">Amount (₦)</label>
                          <input
                            type="number"
                            value={editingExpense.amount || ''}
                            onChange={(e) => setEditingExpense({ ...editingExpense, amount: parseFloat(e.target.value) || 0 })}
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2"
                            style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                          />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-white mb-2">Date</label>
                          <input
                            type="date"
                            value={editingExpense.expense_date?.split('T')[0] || ''}
                            onChange={(e) => setEditingExpense({ ...editingExpense, expense_date: e.target.value })}
                            className="w-full px-4 py-3 rounded-xl bg-white/5 border text-white focus:outline-none focus:ring-2"
                            style={{ borderColor: 'rgba(255, 255, 255, 0.1)' }}
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Category</label>
                        <ProfessionalDropdown
                          options={categories.map(cat => ({
                            value: cat.id,
                            label: cat.name,
                            icon: (() => {
                              const ic = cat.icon
                              if (!ic) return undefined
                              if (typeof ic === 'string') {
                                if (/^(https?:)?\/\//.test(ic)) {
                                  return <img src={ic} alt={cat.name} className="w-4 h-4 object-contain" />
                                }
                                // only use short strings (emoji/1-2 chars) as icons
                                if (ic.trim().length <= 2) return ic
                                return undefined
                              }
                              return ic
                            })(),
                          }))}
                          value={editingExpense.category_id || ''}
                          onChange={(val) => setEditingExpense({ ...editingExpense, category_id: String(val) })}
                          placeholder="Select category"
                          searchable
                          clearable
                        />
                      </div>

                      <div>
                        <label className="block text-sm font-medium text-white mb-2">Funded By</label>
                        <ProfessionalDropdown
                          options={paymentTypes.map(pt => ({ value: pt.id, label: pt.name }))}
                          value={editingExpense.funded_by || ''}
                          onChange={(val) => setEditingExpense({ ...editingExpense, funded_by: String(val) })}
                          placeholder="Select funding source"
                          searchable
                          clearable
                        />
                      </div>
                    </div>

                    <div className="flex gap-3 mt-6">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowEditModal(false)}
                        className="flex-1 px-4 py-3 rounded-xl font-medium"
                        style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textSecondary }}
                      >
                        Cancel
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleEdit}
                        disabled={approvalLoading}
                        className="flex-1 px-4 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
                        style={{ background: `linear-gradient(135deg, ${colors.primary}, ${colors.accentMint})` }}
                      >
                        {approvalLoading ? 'Saving...' : 'Save Changes'}
                      </motion.button>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Delete Confirmation Modal */}
        <AnimatePresence>
          {showDeleteConfirm && selectedExpense && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
              onClick={() => setShowDeleteConfirm(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.9, opacity: 0 }}
                onClick={(e) => e.stopPropagation()}
                className="w-full max-w-md"
              >
                <GlassCard className="relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-1" style={{ background: '#EF4444' }} />
                  <div className="p-6">
                    <div className="text-center mb-6">
                      <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.15)' }}>
                        <Trash2 className="w-8 h-8" style={{ color: '#EF4444' }} />
                      </div>
                      <h3 className="text-xl font-bold text-white mb-2">Delete Expense</h3>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>
                        Are you sure you want to delete "{selectedExpense.title}"? This action cannot be undone.
                      </p>
                    </div>

                    <div className="p-4 rounded-xl mb-6" style={{ background: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.2)' }}>
                      <div className="flex items-center gap-2 text-sm">
                        <AlertTriangle className="w-4 h-4" style={{ color: '#EF4444' }} />
                        <span style={{ color: '#EF4444' }}>This will permanently remove the expense record.</span>
                      </div>
                    </div>

                    <div className="flex gap-3">
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => setShowDeleteConfirm(false)}
                        className="flex-1 px-4 py-3 rounded-xl font-medium"
                        style={{ background: 'rgba(255, 255, 255, 0.05)', color: colors.textSecondary }}
                      >
                        Cancel
                      </motion.button>
                      <motion.button
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={() => handleDelete(selectedExpense.id)}
                        disabled={approvalLoading}
                        className="flex-1 px-4 py-3 rounded-xl font-semibold text-white disabled:opacity-50"
                        style={{ background: 'linear-gradient(135deg, #EF4444, #DC2626)' }}
                      >
                        {approvalLoading ? 'Deleting...' : 'Delete Expense'}
                      </motion.button>
                    </div>
                  </div>
                </GlassCard>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Confirm Dialog */}
        <ConfirmDialog
          isOpen={confirmDialog.isOpen}
          onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
          onConfirm={() => {
            setConfirmDialog({ ...confirmDialog, isOpen: false })
            confirmDialog.onConfirm()
          }}
          title={confirmDialog.title}
          message={confirmDialog.message}
          type={confirmDialog.type}
          confirmText="Yes, Approve"
          cancelText="Cancel"
        />

        {/* Image Modal */}
        <AnimatePresence>
          {imageModal && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-100 flex items-center justify-center bg-black/95 p-4"
              onClick={() => setImageModal(null)}
            >
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setImageModal(null)}
                className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center"
                style={{ background: 'rgba(255, 255, 255, 0.1)' }}
              >
                <X className="w-6 h-6 text-white" />
              </motion.button>
              <motion.img
                initial={{ scale: 0.9 }}
                animate={{ scale: 1 }}
                src={imageModal}
                alt="Receipt"
                className="max-w-full max-h-[85vh] object-contain rounded-lg shadow-2xl"
                onClick={(e) => e.stopPropagation()}
                onError={(e) => {
                  e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><rect width="100%" height="100%" fill="%23222"/><text x="50%" y="50%" fill="white" font-size="16" text-anchor="middle" dominant-baseline="middle">Image not available</text></svg>'
                }}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </GlassCard>
    </motion.div>
  )
}