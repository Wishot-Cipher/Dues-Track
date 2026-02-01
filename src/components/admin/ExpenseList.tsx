/* eslint-disable @typescript-eslint/no-unused-vars */
import { useState, useMemo, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import Modal from '@/components/ui/Modal'
import { colors, gradients } from '@/config/colors'
import { useExpenses } from '@/hooks/useExpenses'
import { useAuth } from '@/hooks/useAuth'
import { getPublicUrl, supabase } from '@/config/supabase'
import { useToast } from '@/hooks/useToast'
import { deleteExpense, updateExpenseFields, fetchExpenseCategories, type ExpenseCategory } from '@/services/expenseService'
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown'
import type { Expense } from '@/services/expenseService'
import { CheckCircle, Clock, XCircle, Calendar, Tag, FileText, X, Download, Eye, User, ChevronLeft, ChevronRight, ChevronDown, FileSpreadsheet, Trash2, Edit3, Save, Loader2 } from 'lucide-react'
import * as LucideIcons from 'lucide-react'
import { exportExpensesToPDF } from '@/utils/htmlPrintExports'

const ITEMS_PER_PAGE = 10

// Helper to render category icon
function CategoryIcon({ iconName, className = 'w-5 h-5' }: { iconName: string | null; className?: string }) {
  if (!iconName) return <span>📦</span>
  
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName]
  if (IconComponent) {
    return <IconComponent className={className} />
  }
  
  return <span>{iconName}</span>
}

// Enhanced Status badge component
function StatusBadge({ status }: { status: 'pending' | 'approved' | 'rejected' }) {
  const configs = {
    pending: { 
      bg: 'rgba(251, 191, 36, 0.15)', 
      text: '#FBBF24', 
      border: 'rgba(251, 191, 36, 0.4)',
      Icon: Clock,
      label: 'Pending Review'
    },
    approved: { 
      bg: 'rgba(34, 197, 94, 0.15)', 
      text: '#22C55E', 
      border: 'rgba(34, 197, 94, 0.4)',
      Icon: CheckCircle,
      label: 'Approved'
    },
    rejected: { 
      bg: 'rgba(239, 68, 68, 0.15)', 
      text: '#EF4444', 
      border: 'rgba(239, 68, 68, 0.4)',
      Icon: XCircle,
      label: 'Rejected'
    }
  }
  const config = configs[status] || configs.pending
  const Icon = config.Icon
  
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all"
      style={{ background: config.bg, color: config.text, border: `1px solid ${config.border}` }}
    >
      <Icon className="w-3.5 h-3.5" />
      {config.label}
    </span>
  )
}

export default function ExpenseList({ categoryFilter = 'all' }: { categoryFilter?: string }) {
  const { expenses, loading, error, reload } = useExpenses()
  const [paymentTypes, setPaymentTypes] = useState<{ id: string; title: string }[]>([])
  const [paymentFilter, setPaymentFilter] = useState<string>('all')

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        const { data } = await supabase.from('payment_types').select('id, title').eq('is_active', true).order('title')
        if (mounted) setPaymentTypes(data || [])
      } catch (err) {
        console.error('Failed to load payment types:', err)
      }
    })()
    return () => { mounted = false }
  }, [])
  // Collected totals for selected payment type (exclude waived)
  const [collectedAmount, setCollectedAmount] = useState<number>(0)

  useEffect(() => {
    let mounted = true
    ;(async () => {
      try {
        // Fetch approved payments; if paymentFilter != 'all', filter by payment_type_id
        let query = supabase
          .from('payments')
          .select('amount, transaction_ref, status, payment_type_id')
          .eq('status', 'approved')
          .limit(2000)

        if (paymentFilter && paymentFilter !== 'all') {
          query = query.eq('payment_type_id', paymentFilter)
        }

        // Exclude waived transaction refs
        query = query.not('transaction_ref', 'like', 'WAIVED-%')

        const { data } = await query
        if (!mounted) return
        const payments = data || []
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const total = payments.reduce((s: number, p: any) => s + Number(p.amount || 0), 0)
        setCollectedAmount(total)
      } catch (err) {
        console.error('Failed to fetch collected totals:', err)
        if (mounted) {
          setCollectedAmount(0)
        }
      }
    })()
    return () => { mounted = false }
  }, [paymentFilter])
  const { hasPermission } = useAuth()
  const { success: showSuccess, error: showError } = useToast()
  const [selected, setSelected] = useState<Expense | null>(null)
  const [imageModal, setImageModal] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)
  const [showExportMenu, setShowExportMenu] = useState(false)
  const [exporting, setExporting] = useState(false)
  
  // Edit/Delete state
  const [showEditModal, setShowEditModal] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingExpense, setEditingExpense] = useState<Partial<Expense> | null>(null)
  const [editLoading, setEditLoading] = useState(false)
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  

  // Load categories and payment types for edit modal
  useMemo(() => {
    const loadData = async () => {
      try {
        const cats = await fetchExpenseCategories()
        setCategories(cats)
        const { data } = await supabase.from('payment_types').select('id, title').eq('is_active', true)
        setPaymentTypes(data || [])
      } catch (err) {
        console.error('Failed to load categories/payment types:', err)
      }
    }
    loadData()
  }, [])

  // Filter by funding/payment type if set
  const filteredExpenses = useMemo(() => {
    if (!expenses) return []
    // First apply optional paymentType filter from this component
    let list = expenses
    if (paymentFilter && paymentFilter !== 'all') {
      list = list.filter(e => (e.funded_by === paymentFilter) || (e.payment_type_id === paymentFilter))
    }
    // Then apply any external categoryFilter (legacy) if provided
    if (categoryFilter && categoryFilter !== 'all') {
      list = list.filter(e => e.category_id === categoryFilter || e.category === categoryFilter)
    }
    return list
  }, [expenses, paymentFilter, categoryFilter])

  // Sort filtered expenses by newest first
  const sortedExpenses = useMemo(() => {
    return [...filteredExpenses].sort((a, b) => {
      const dateA = new Date(a.expense_date || a.created_at).getTime()
      const dateB = new Date(b.expense_date || b.created_at).getTime()
      return dateB - dateA // Newest first
    })
  }, [filteredExpenses])

  // Pre-calculate expense stats to avoid repeated filter/reduce in render
  const expenseStats = useMemo(() => {
    const approved = sortedExpenses.filter(e => e.status === 'approved')
    const pending = sortedExpenses.filter(e => e.status === 'pending')
    const totalApproved = approved.reduce((sum, e) => sum + (e.amount || 0), 0)
    const totalPending = pending.reduce((sum, e) => sum + (e.amount || 0), 0)
    const netBalance = collectedAmount - totalApproved
    return { approved, pending, totalApproved, totalPending, netBalance }
  }, [sortedExpenses, collectedAmount])

  // Pagination
  const totalPages = Math.ceil(sortedExpenses.length / ITEMS_PER_PAGE)
  const paginatedExpenses = useMemo(() => {
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE
    const endIndex = startIndex + ITEMS_PER_PAGE
    return sortedExpenses.slice(startIndex, endIndex)
  }, [sortedExpenses, currentPage])

  // Reset to page 1 when expenses change
  useMemo(() => {
    if (currentPage > totalPages && totalPages > 0) {
      setCurrentPage(1)
    }
  }, [totalPages, currentPage])

  function exportToCSV() {
    setExporting(true)
    try {
      // Create detailed CSV with proper formatting
      const csvRows = []
      
      // Add title and metadata
      csvRows.push('EXPENSE REPORT')
      csvRows.push(`Generated on: ${new Date().toLocaleString()}`)
      csvRows.push('Developed by Dev_Wishot | @wishotstudio')
      csvRows.push('') // Empty line
      
      // Add headers
      csvRows.push('Date,Title,Description,Category,Funded By,Amount (₦),Status,Recorded By,Approved/Rejected By,Notes')
      
      // Add data rows - use sortedExpenses to maintain newest first order
      sortedExpenses.forEach(exp => {
        const date = new Date(exp.expense_date || exp.created_at).toLocaleDateString()
        const title = (exp.title || '').replace(/"/g, '""')
        const description = (exp.description || 'N/A').replace(/"/g, '""')
        const category = ((exp as unknown as { category?: { name?: string } }).category?.name || exp.category || 'N/A').replace(/"/g, '""')
        const fundedBy = ((exp as unknown as { payment_types?: { title?: string } }).payment_types?.title || 'N/A').replace(/"/g, '""')
        const amount = `₦${(exp.amount || 0).toLocaleString()}`
        const status = exp.status?.toUpperCase() || 'PENDING'
        const recordedBy = ((exp as unknown as { admins?: { full_name?: string } }).admins?.full_name || 'N/A').replace(/"/g, '""')
        const approvedBy = ((exp as unknown as { approved_by?: { full_name?: string } }).approved_by?.full_name || 'N/A').replace(/"/g, '""')
        const notes = (exp.rejection_reason || '').replace(/"/g, '""')
        
        csvRows.push(`"${date}","${title}","${description}","${category}","${fundedBy}","${amount}","${status}","${recordedBy}","${approvedBy}","${notes}"`)
      })
      
      // Add summary at the bottom
      csvRows.push('') // Empty line
      csvRows.push('SUMMARY')
      const approvedExpenses = sortedExpenses.filter(e => e.status === 'approved')
      const totalApproved = approvedExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
      const pendingExpenses = sortedExpenses.filter(e => e.status === 'pending')
      const totalPending = pendingExpenses.reduce((sum, e) => sum + (e.amount || 0), 0)
      const rejectedExpenses = sortedExpenses.filter(e => e.status === 'rejected')
      
      csvRows.push(`Total Expenses,${sortedExpenses.length}`)
      csvRows.push(`Approved Expenses,${approvedExpenses.length},"₦${totalApproved.toLocaleString()}"`)
      csvRows.push(`Pending Expenses,${pendingExpenses.length},"₦${totalPending.toLocaleString()}"`)
      csvRows.push(`Rejected Expenses,${rejectedExpenses.length}`)
      
      const csvContent = csvRows.join('\n')
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' })
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `expense-report-${new Date().toISOString().split('T')[0]}.csv`
      a.click()
      window.URL.revokeObjectURL(url)
      showSuccess('Expenses exported to CSV!')
    } catch (err) {
      console.error('Export error:', err)
      showError('Failed to export expenses')
    } finally {
      setExporting(false)
    }
  }

  function exportToPDF() {
    setExporting(true)
    try {
      // Transform expenses data for PDF export
      const expenseData = sortedExpenses.map(exp => ({
        id: exp.id,
        title: exp.title || 'Untitled',
        description: exp.description || undefined,
        amount: exp.amount || 0,
        category: ((exp as unknown as { category?: { name?: string } }).category?.name || exp.category || 'Uncategorized'),
        status: exp.status || 'pending',
        created_at: exp.expense_date || exp.created_at,
        approved_at: exp.approved_at || undefined,
      }))

      // Determine payment source title for header (if any)
      const paymentSourceTitle = paymentFilter && paymentFilter !== 'all'
        ? (paymentTypes.find(pt => pt.id === paymentFilter)?.title || undefined)
        : undefined

      exportExpensesToPDF(expenseData, { paymentSource: paymentSourceTitle })
      showSuccess('Expenses exported to PDF!')
    } catch (err) {
      console.error('Export error:', err)
      showError('Failed to export expenses')
    } finally {
      setExporting(false)
    }
  }

  // Handle edit expense
  async function handleEditExpense() {
    if (!editingExpense || !editingExpense.id) return
    
    setEditLoading(true)
    try {
      await updateExpenseFields(editingExpense.id, {
        title: editingExpense.title,
        description: editingExpense.description || undefined,
        amount: editingExpense.amount,
        category_id: editingExpense.category_id || undefined,
        funded_by: editingExpense.funded_by || undefined,
        expense_date: editingExpense.expense_date,
      })
      showSuccess('Expense updated successfully!')
      setShowEditModal(false)
      setEditingExpense(null)
      reload()
    } catch (err) {
      console.error('Failed to update expense:', err)
      showError('Failed to update expense')
    } finally {
      setEditLoading(false)
    }
  }

  // Handle delete expense
  async function handleDeleteExpense() {
    if (!selected) return
    
    try {
      await deleteExpense(selected.id)
      showSuccess('Expense deleted successfully!')
      setShowDeleteConfirm(false)
      setSelected(null)
      reload()
    } catch (err) {
      console.error('Failed to delete expense:', err)
      showError('Failed to delete expense')
    }
  }

  // Open edit modal
  function openEditModal(exp: Expense, e: React.MouseEvent) {
    e.stopPropagation()
    setEditingExpense({
      id: exp.id,
      title: exp.title,
      description: exp.description,
      amount: exp.amount,
      category_id: exp.category_id,
      funded_by: exp.funded_by,
      expense_date: exp.expense_date,
    })
    setShowEditModal(true)
  }

  // Open delete confirmation
  function openDeleteConfirm(exp: Expense, e: React.MouseEvent) {
    e.stopPropagation()
    setSelected(exp)
    setShowDeleteConfirm(true)
  }

  if (!hasPermission('can_manage_students') && !hasPermission('can_approve_payments')) {
    return (
      <GlassCard className="p-6">
        <div className="text-center py-8">
          <div className="w-16 h-16 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: 'rgba(239, 68, 68, 0.1)' }}>
            <XCircle className="w-8 h-8" style={{ color: '#EF4444' }} />
          </div>
          <h3 className="text-lg font-semibold text-white mb-2">Access Restricted</h3>
          <p className="text-sm" style={{ color: colors.textSecondary }}>
            You need admin permissions to view expenses.
          </p>
        </div>
      </GlassCard>
    )
  }

  return (
    <>
      <GlassCard className="p-6 relative overflow-hidden">
        {/* Decorative Top Border */}
        <div 
          className="absolute top-0 left-0 w-full h-1"
          style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accentMint}, transparent)` }}
        />
        
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-3">
            <div 
              className="w-12 h-12 rounded-xl flex items-center justify-center shrink-0"
              style={{ 
                background: `linear-gradient(135deg, ${colors.primary}30, ${colors.primary}10)`,
                border: `1px solid ${colors.primary}40`
              }}
            >
              <FileText className="w-6 h-6" style={{ color: colors.primary }} />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white">Recent Expenses</h2>
              <p className="text-xs sm:text-sm" style={{ color: colors.textSecondary }}>
                {sortedExpenses.length} expense{sortedExpenses.length !== 1 ? 's' : ''} recorded
              </p>
            </div>
          </div>
          {sortedExpenses.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              {/* Payment source filter (funding/payment type) */}
              <div className="mr-2 w-full sm:w-auto">
                <ProfessionalDropdown
                  options={[{ value: 'all', label: 'All Funding Sources' }, ...paymentTypes.map(pt => ({ value: pt.id, label: pt.title }))]}
                  value={paymentFilter}
                  onChange={(v) => setPaymentFilter(v as string)}
                  placeholder="Filter by funding source"
                  className="w-full sm:w-56"
                  clearable
                />
              </div>
              {/* Collected / Expenses / Net Balance for selected funding source */}
              <div className="flex flex-wrap items-center gap-2 mt-2 sm:mt-0">
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.04)` }}>
                  <div className="text-xs" style={{ color: colors.textSecondary }}>Collected</div>
                  <div className="font-semibold ml-2 whitespace-nowrap" style={{ color: colors.statusPaid }}>₦{collectedAmount.toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid rgba(255,255,255,0.04)` }}>
                  <div className="text-xs" style={{ color: colors.textSecondary }}>Spent</div>
                  <div className="font-semibold ml-2 whitespace-nowrap" style={{ color: colors.statusFailed }}>₦{expenseStats.totalApproved.toLocaleString()}</div>
                </div>
                <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ background: expenseStats.netBalance >= 0 ? 'rgba(34, 197, 94, 0.08)' : 'rgba(239, 68, 68, 0.08)', border: `1px solid ${expenseStats.netBalance >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)'}` }}>
                  <div className="text-xs" style={{ color: colors.textSecondary }}>Available</div>
                  <div className="font-semibold ml-2 whitespace-nowrap" style={{ color: expenseStats.netBalance >= 0 ? colors.statusPaid : colors.statusFailed }}>₦{expenseStats.netBalance.toLocaleString()}</div>
                </div>
                {expenseStats.pending.length > 0 && (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-xl" style={{ background: 'rgba(251, 191, 36, 0.08)', border: '1px solid rgba(251, 191, 36, 0.2)' }}>
                    <Clock className="w-3.5 h-3.5" style={{ color: '#FBBF24' }} />
                    <div className="text-xs whitespace-nowrap" style={{ color: '#FBBF24' }}>{expenseStats.pending.length} pending (₦{expenseStats.totalPending.toLocaleString()})</div>
                  </div>
                )}
              </div>

              {/* Export Dropdown */}
              <div className="relative">
                <button
                  onClick={() => setShowExportMenu(!showExportMenu)}
                  disabled={exporting}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl transition-all hover:scale-105 disabled:opacity-50"
                  style={{ 
                    background: `linear-gradient(135deg, ${colors.accentMint}20, ${colors.accentMint}10)`,
                    border: `1px solid ${colors.accentMint}40`,
                    color: colors.accentMint
                  }}
                  title="Export Options"
                >
                  {exporting ? (
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Download className="w-4 h-4" />
                  )}
                  <span className="text-sm font-medium">Export</span>
                  <ChevronDown className={`w-3 h-3 transition-transform ${showExportMenu ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showExportMenu && (
                    <>
                      {/* Backdrop */}
                      <div className="fixed inset-0 z-40" onClick={() => setShowExportMenu(false)} />
                      
                      {/* Dropdown Menu */}
                      <motion.div
                        initial={{ opacity: 0, y: -10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -10, scale: 0.95 }}
                        className="absolute right-0 top-full mt-2 w-48 rounded-xl overflow-hidden shadow-2xl z-50"
                        style={{
                          background: 'linear-gradient(135deg, rgba(30, 20, 15, 0.98), rgba(20, 12, 8, 0.98))',
                          border: '1px solid rgba(255, 255, 255, 0.1)',
                          backdropFilter: 'blur(20px)',
                        }}
                      >
                        <div className="p-2">
                          <motion.button
                            whileHover={{ x: 4 }}
                            onClick={() => {
                              setShowExportMenu(false)
                              exportToPDF()
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5"
                          >
                            <FileText className="w-4 h-4" style={{ color: colors.statusUnpaid }} />
                            <span className="text-sm text-white">PDF Report</span>
                          </motion.button>
                          <motion.button
                            whileHover={{ x: 4 }}
                            onClick={() => {
                              setShowExportMenu(false)
                              exportToCSV()
                            }}
                            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5"
                          >
                            <FileSpreadsheet className="w-4 h-4" style={{ color: colors.accentMint }} />
                            <span className="text-sm text-white">CSV Spreadsheet</span>
                          </motion.button>
                        </div>
                      </motion.div>
                    </>
                  )}
                </AnimatePresence>
              </div>
            </div>
          )}
        </div>

        {loading && (
          <div className="text-center py-12">
            <div className="w-12 h-12 border-4 border-t-transparent rounded-full animate-spin mx-auto mb-4" style={{ borderColor: `${colors.primary}40`, borderTopColor: colors.primary }} />
            <p style={{ color: colors.textSecondary }}>Loading expenses...</p>
          </div>
        )}

        {error && (
          <div className="text-center py-12">
            <XCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
            <p className="text-red-400">Failed to load expenses</p>
          </div>
        )}

        {!loading && sortedExpenses.length === 0 && (
          <div className="text-center py-12">
            <div className="w-20 h-20 rounded-full mx-auto mb-4 flex items-center justify-center" style={{ background: `${colors.primary}10` }}>
              <FileText className="w-10 h-10" style={{ color: colors.primary }} />
            </div>
            <h3 className="text-lg font-semibold text-white mb-2">No Expenses Yet</h3>
            <p className="text-sm" style={{ color: colors.textSecondary }}>
              Expenses recorded will appear here
            </p>
          </div>
        )}

        {!loading && paginatedExpenses.length > 0 && (
          <>
            <div className="space-y-3">
              {paginatedExpenses.map((exp, index) => {
                const categoryData = (exp as unknown as Record<string, unknown>).category as { name?: string; icon?: string; color?: string } | undefined
                const categoryName = categoryData?.name || (exp.category as string) || 'Uncategorized'
                const categoryIcon = categoryData?.icon || '📦'
                const categoryColor = categoryData?.color || colors.primary
                const expStatus = exp.status as 'pending' | 'approved' | 'rejected'
                
                return (
                  <motion.div
                    key={exp.id}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className="group border rounded-xl p-5 hover:border-orange-500/50 transition-all cursor-pointer"
                    style={{ 
                      borderColor: colors.borderLight, 
                      background: 'linear-gradient(135deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.01) 100%)',
                      backdropFilter: 'blur(10px)'
                    }}
                    onClick={() => {
                      if (hasPermission('can_manage_students') || exp.status === 'approved') {
                        setSelected(exp)
                      }
                    }}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {/* Title and Status */}
                        <div className="flex items-start gap-3 mb-3">
                          <div className="flex-1">
                            <h3 className="font-semibold text-white text-base mb-1.5 group-hover:text-orange-400 transition-colors">
                              {exp.title}
                            </h3>
                            <div className="flex items-center gap-2 flex-wrap">
                              <StatusBadge status={expStatus} />
                            </div>
                          </div>
                        </div>

                        {/* Metadata */}
                        <div className="flex items-center gap-4 flex-wrap text-sm" style={{ color: colors.textSecondary }}>
                          <div className="flex items-center gap-1.5">
                            <Tag className="w-4 h-4" style={{ color: categoryColor }} />
                            <span>{categoryIcon} {categoryName}</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Calendar className="w-4 h-4" />
                            <span>{exp.expense_date ? new Date(exp.expense_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}</span>
                          </div>
                          {exp.receipt_url && (
                            <div className="flex items-center gap-1.5 text-orange-400">
                              <FileText className="w-4 h-4" />
                              <span>Receipt attached</span>
                            </div>
                          )}
                        </div>

                        {/* Description Preview */}
                        {exp.description && (
                          <p className="mt-3 text-sm line-clamp-1" style={{ color: colors.textSecondary }}>
                            {exp.description}
                          </p>
                        )}
                      </div>

                      {/* Amount and Actions */}
                      <div className="text-right flex flex-col items-end gap-2">
                        <div className="font-bold text-2xl" style={{ 
                          background: gradients.primary,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text'
                        }}>
                          ₦{Number(exp.amount || 0).toLocaleString()}
                        </div>
                        
                        {/* Action Buttons */}
                        {hasPermission('can_manage_students') && (
                          <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-all">
                            <button
                              className="p-2 rounded-lg transition-all hover:scale-105"
                              style={{ background: 'rgba(255,104,3,0.1)', color: colors.primary }}
                              onClick={(e) => openEditModal(exp, e)}
                              title="Edit expense"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="p-2 rounded-lg transition-all hover:scale-105"
                              style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#EF4444' }}
                              onClick={(e) => openDeleteConfirm(exp, e)}
                              title="Delete expense"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="p-2 rounded-lg transition-all hover:scale-105"
                              style={{ background: 'rgba(34, 197, 94, 0.1)', color: '#22C55E' }}
                              onClick={(e) => {
                                e.stopPropagation()
                                setSelected(exp)
                              }}
                              title="View details"
                            >
                              <Eye className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                        {!hasPermission('can_manage_students') && expStatus === 'approved' && (
                          <button
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all opacity-0 group-hover:opacity-100"
                            style={{ background: 'rgba(255,104,3,0.1)', color: colors.primary }}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelected(exp)
                            }}
                          >
                            <Eye className="w-3.5 h-3.5" />
                            View Details
                          </button>
                        )}
                      </div>
                    </div>
                  </motion.div>
                )
              })}
            </div>

            {/* Pagination Controls */}
            {totalPages > 1 && (
              <motion.div
                className="mt-6 flex items-center justify-center gap-2"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3 }}
              >
                <button
                  onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                  disabled={currentPage === 1}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ 
                    background: currentPage === 1 ? 'rgba(255,255,255,0.03)' : 'rgba(255,104,3,0.1)',
                    border: `1px solid ${currentPage === 1 ? colors.borderLight : colors.primary}`,
                    color: currentPage === 1 ? colors.textSecondary : colors.primary
                  }}
                >
                  <ChevronLeft className="w-4 h-4" />
                  <span className="hidden sm:inline">Previous</span>
                </button>

                <div className="flex items-center gap-1">
                  {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
                    // Show first page, last page, current page, and pages around current
                    const showPage = page === 1 || 
                                    page === totalPages || 
                                    (page >= currentPage - 1 && page <= currentPage + 1)
                    
                    // Show ellipsis
                    const showEllipsisBefore = page === currentPage - 2 && currentPage > 3
                    const showEllipsisAfter = page === currentPage + 2 && currentPage < totalPages - 2

                    if (showEllipsisBefore || showEllipsisAfter) {
                      return (
                        <span key={page} className="px-2 text-sm" style={{ color: colors.textSecondary }}>
                          ...
                        </span>
                      )
                    }

                    if (!showPage) return null

                    return (
                      <button
                        key={page}
                        onClick={() => setCurrentPage(page)}
                        className="w-10 h-10 rounded-lg font-medium transition-all"
                        style={{
                          background: currentPage === page ? gradients.primary : 'rgba(255,255,255,0.05)',
                          border: `1px solid ${currentPage === page ? colors.primary : colors.borderLight}`,
                          color: currentPage === page ? 'white' : colors.textSecondary
                        }}
                      >
                        {page}
                      </button>
                    )
                  })}
                </div>

                <button
                  onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                  disabled={currentPage === totalPages}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-all disabled:opacity-30 disabled:cursor-not-allowed"
                  style={{ 
                    background: currentPage === totalPages ? 'rgba(255,255,255,0.03)' : 'rgba(255,104,3,0.1)',
                    border: `1px solid ${currentPage === totalPages ? colors.borderLight : colors.primary}`,
                    color: currentPage === totalPages ? colors.textSecondary : colors.primary
                  }}
                >
                  <span className="hidden sm:inline">Next</span>
                  <ChevronRight className="w-4 h-4" />
                </button>
              </motion.div>
            )}
          </>
        )}
      </GlassCard>

      {/* Enhanced Detail Modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 backdrop-blur-sm p-4 overflow-y-auto"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 20 }}
              className="max-w-3xl w-full my-8"
              onClick={(e) => e.stopPropagation()}
            >
              <GlassCard className="p-6 sm:p-8">
                {/* Header */}
                <div className="relative flex items-start justify-between mb-6 pb-4 border-b" style={{ borderColor: colors.borderLight }}>
                  <div 
                    className="absolute top-0 left-0 w-full h-1 -mt-6 sm:-mt-8"
                    style={{ background: `linear-gradient(90deg, ${colors.primary}, ${colors.accentMint}, transparent)` }}
                  />
                  <div className="flex-1 pr-10">
                    <h2 className="text-xl sm:text-2xl font-bold text-white mb-3 wrap-break-word">{selected.title}</h2>
                    <StatusBadge status={selected.status as 'pending' | 'approved' | 'rejected'} />
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="absolute top-0 right-0 p-2 rounded-lg transition-all hover:bg-white/10"
                    style={{ color: colors.textSecondary }}
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                {/* Amount - Prominent Display */}
                <div className="mb-8 p-6 rounded-xl text-center" style={{ background: 'linear-gradient(135deg, rgba(255,104,3,0.1) 0%, rgba(255,104,3,0.05) 100%)' }}>
                  <label className="text-xs font-semibold uppercase tracking-wider mb-2 block" style={{ color: colors.textSecondary }}>
                    Amount
                  </label>
                  <div className="font-bold text-5xl" style={{ 
                    background: gradients.primary,
                    WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                    backgroundClip: 'text'
                  }}>
                    ₦{Number(selected.amount || 0).toLocaleString()}
                  </div>
                </div>

                {/* Info Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                  {/* Category */}
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: colors.textSecondary }}>
                      Category
                    </label>
                    <div className="flex items-center gap-3">
                      {(() => {
                        const catData = (selected as unknown as Record<string, unknown>).category as { name?: string; icon?: string; color?: string } | undefined
                        return (
                          <>
                            <div className="w-12 h-12 rounded-lg flex items-center justify-center" style={{ background: `${catData?.color || colors.primary}20` }}>
                              <CategoryIcon iconName={catData?.icon || null} className="w-6 h-6" />
                            </div>
                            <span className="font-semibold text-white">{catData?.name || (selected.category as string) || 'Uncategorized'}</span>
                          </>
                        )
                      })()}
                    </div>
                  </div>

                  {/* Date */}
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: colors.textSecondary }}>
                      Expense Date
                    </label>
                    <div className="flex items-center gap-2">
                      <Calendar className="w-5 h-5" style={{ color: colors.primary }} />
                      <span className="font-medium text-white">
                        {selected.expense_date ? new Date(selected.expense_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                      </span>
                    </div>
                  </div>

                  {/* Recorded By */}
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: colors.textSecondary }}>
                      Recorded By
                    </label>
                    <div className="flex items-center gap-2">
                      <User className="w-5 h-5" style={{ color: colors.textSecondary }} />
                      <span className="text-white">Admin</span>
                    </div>
                  </div>

                  {/* Status */}
                  <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)' }}>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: colors.textSecondary }}>
                      Status
                    </label>
                    {selected.status === 'approved' && (() => {
                      const approverData = (selected as unknown as Record<string, unknown>).approved_by_admin as { name?: string } | undefined
                      return (
                        <div className="flex items-center gap-2">
                          <CheckCircle className="w-5 h-5" style={{ color: '#22C55E' }} />
                          <div>
                            <p className="text-white font-medium">Approved</p>
                            {approverData?.name && (
                              <p className="text-xs" style={{ color: colors.textSecondary }}>
                                by {approverData.name}
                                {selected.approved_at && ` • ${new Date(selected.approved_at).toLocaleDateString()}`}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })()}
                    {selected.status === 'rejected' && (
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <XCircle className="w-5 h-5 text-red-400" />
                          <p className="text-white font-medium">Rejected</p>
                        </div>
                        {selected.rejection_reason && (
                          <div className="mt-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)' }}>
                            <p className="text-xs uppercase tracking-wider mb-1" style={{ color: '#EF4444' }}>Reason:</p>
                            <p className="text-sm text-red-300">{selected.rejection_reason}</p>
                          </div>
                        )}
                        <p className="text-xs mt-2" style={{ color: colors.textSecondary }}>
                          ℹ️ Rejected expenses are kept for record-keeping and audit purposes
                        </p>
                      </div>
                    )}
                    {selected.status === 'pending' && (
                      <div className="flex items-center gap-2">
                        <Clock className="w-5 h-5 text-yellow-500" />
                        <div>
                          <p className="text-white font-medium">Pending Review</p>
                          <p className="text-xs" style={{ color: colors.textSecondary }}>Awaiting approval</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Description */}
                {selected.description && (
                  <div className="mb-8 p-5 rounded-xl" style={{ background: 'rgba(255,255,255,0.03)', border: `1px solid ${colors.borderLight}` }}>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: colors.textSecondary }}>
                      Description
                    </label>
                    <p className="text-white whitespace-pre-wrap leading-relaxed">{selected.description}</p>
                  </div>
                )}

                {/* Receipt */}
                {selected.receipt_url && (hasPermission('can_manage_students') || selected.status === 'approved') && (
                  <div>
                    <label className="text-xs font-semibold uppercase tracking-wider mb-3 block" style={{ color: colors.textSecondary }}>
                      Receipt
                    </label>
                    {(() => {
                      // Handle both full URLs and file paths
                      const receiptUrl = selected.receipt_url.startsWith('http') 
                        ? selected.receipt_url 
                        : getPublicUrl('expense-receipts', selected.receipt_url)
                      
                      const isPdf = selected.receipt_url.toLowerCase().endsWith('.pdf')
                      
                      return isPdf ? (
                        <div className="flex gap-3">
                          <a 
                            href={receiptUrl} 
                            target="_blank" 
                            rel="noreferrer" 
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all hover:opacity-90"
                            style={{ background: gradients.primary, color: 'white' }}
                          >
                            <Eye className="w-4 h-4" />
                            Open PDF Receipt
                          </a>
                          <a 
                            href={receiptUrl} 
                            download
                            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg font-semibold transition-all hover:bg-white/10"
                            style={{ border: `1px solid ${colors.borderLight}`, color: colors.textPrimary }}
                          >
                            <Download className="w-4 h-4" />
                            Download
                          </a>
                        </div>
                      ) : (
                        <div>
                          <div 
                            className="rounded-xl overflow-hidden border cursor-pointer transition-all hover:border-orange-500"
                            style={{ borderColor: colors.borderLight, background: 'rgba(0,0,0,0.3)' }}
                            onClick={() => setImageModal(receiptUrl)}
                          >
                            <img 
                              src={receiptUrl} 
                              alt="expense receipt" 
                              className="w-full h-auto object-contain"
                              style={{ maxHeight: '400px' }}
                              onError={(e) => {
                                const target = e.target as HTMLImageElement
                                target.style.display = 'none'
                                const errorDiv = document.createElement('div')
                                errorDiv.className = 'p-8 text-center'
                                errorDiv.style.color = colors.textSecondary
                                // Safely create text content to prevent XSS
                                const errorText = document.createElement('p')
                                errorText.textContent = '❌ Failed to load receipt image'
                                const urlText = document.createElement('p')
                                urlText.className = 'text-xs mt-2'
                                urlText.textContent = receiptUrl
                                errorDiv.appendChild(errorText)
                                errorDiv.appendChild(urlText)
                                target.parentElement?.appendChild(errorDiv)
                              }}
                            />
                          </div>
                          <p className="text-xs mt-2 text-center" style={{ color: colors.textSecondary }}>
                            👆 Click image to view full size
                          </p>
                        </div>
                      )
                    })()}
                  </div>
                )}
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Image Modal */}
      {imageModal && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(0, 0, 0, 0.9)' }}
          onClick={() => setImageModal(null)}
        >
          <button
            onClick={() => setImageModal(null)}
            className="absolute top-4 right-4 w-10 h-10 rounded-full flex items-center justify-center transition-all hover:bg-white/20"
            style={{ background: 'rgba(255, 255, 255, 0.1)' }}
          >
            <X className="w-6 h-6 text-white" />
          </button>
          <img
            src={imageModal}
            alt="Receipt Full View"
            className="max-w-full max-h-[90vh] object-contain rounded-lg"
            onClick={(e) => e.stopPropagation()}
          />
        </motion.div>
      )}

      {/* Edit Expense Modal */}
      <Modal
        isOpen={showEditModal}
        onClose={() => {
          setShowEditModal(false)
          setEditingExpense(null)
        }}
        title="Edit Expense"
      >
        {editingExpense && (
          <div className="space-y-4">
            {/* Title */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                Title *
              </label>
              <input
                type="text"
                value={editingExpense.title || ''}
                onChange={(e) => setEditingExpense({ ...editingExpense, title: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg text-white"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${colors.borderLight}`,
                }}
                placeholder="Enter expense title"
              />
            </div>

            {/* Amount */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                Amount (₦) *
              </label>
              <input
                type="number"
                value={editingExpense.amount || ''}
                onChange={(e) => setEditingExpense({ ...editingExpense, amount: Number(e.target.value) })}
                className="w-full px-4 py-2.5 rounded-lg text-white"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${colors.borderLight}`,
                }}
                placeholder="Enter amount"
                min="0"
              />
            </div>

            {/* Category */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                Category
              </label>
              <select
                value={editingExpense.category_id || ''}
                onChange={(e) => setEditingExpense({ ...editingExpense, category_id: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg text-white"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${colors.borderLight}`,
                }}
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat.id} value={cat.id}>
                    {cat.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Funded By */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                Funded By
              </label>
              <select
                value={editingExpense.funded_by || ''}
                onChange={(e) => setEditingExpense({ ...editingExpense, funded_by: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg text-white"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${colors.borderLight}`,
                }}
              >
                <option value="">Select payment type</option>
                {paymentTypes.map((pt) => (
                  <option key={pt.id} value={pt.id}>
                    {pt.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Date */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                Expense Date
              </label>
              <input
                type="date"
                value={editingExpense.expense_date ? new Date(editingExpense.expense_date).toISOString().split('T')[0] : ''}
                onChange={(e) => setEditingExpense({ ...editingExpense, expense_date: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg text-white"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${colors.borderLight}`,
                }}
              />
            </div>

            {/* Description */}
            <div>
              <label className="block text-xs font-medium mb-1.5" style={{ color: colors.textSecondary }}>
                Description
              </label>
              <textarea
                value={editingExpense.description || ''}
                onChange={(e) => setEditingExpense({ ...editingExpense, description: e.target.value })}
                className="w-full px-4 py-2.5 rounded-lg text-white resize-none"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${colors.borderLight}`,
                }}
                rows={3}
                placeholder="Enter description"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => {
                  setShowEditModal(false)
                  setEditingExpense(null)
                }}
                className="flex-1 px-4 py-2.5 rounded-lg font-medium transition-all"
                style={{
                  background: 'rgba(255, 255, 255, 0.05)',
                  border: `1px solid ${colors.borderLight}`,
                  color: colors.textSecondary,
                }}
              >
                Cancel
              </button>
              <button
                onClick={handleEditExpense}
                disabled={editLoading || !editingExpense.title || !editingExpense.amount}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg font-medium transition-all disabled:opacity-50"
                style={{
                  background: gradients.primary,
                  color: 'white',
                }}
              >
                {editLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save Changes
              </button>
            </div>
          </div>
        )}
      </Modal>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showDeleteConfirm}
        onClose={() => {
          setShowDeleteConfirm(false)
          setSelected(null)
        }}
        onConfirm={handleDeleteExpense}
        title="Delete Expense"
        message={`Are you sure you want to delete "${selected?.title}"? This action cannot be undone.`}
        type="danger"
      />
    </>
  )
}
