import { useState, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import { colors, gradients } from '@/config/colors'
import { useExpenses } from '@/hooks/useExpenses'
import { useAuth } from '@/hooks/useAuth'
import { getPublicUrl } from '@/config/supabase'
import type { Expense } from '@/services/expenseService'
import { CheckCircle, Clock, XCircle, Calendar, Tag, FileText, X, Download, Eye, User, ChevronLeft, ChevronRight } from 'lucide-react'
import * as LucideIcons from 'lucide-react'

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

export default function ExpenseList() {
  const { expenses, loading, error } = useExpenses()
  const { hasPermission } = useAuth()
  const [selected, setSelected] = useState<Expense | null>(null)
  const [imageModal, setImageModal] = useState<string | null>(null)
  const [currentPage, setCurrentPage] = useState(1)

  // Sort expenses by newest first (created_at or expense_date)
  const sortedExpenses = useMemo(() => {
    return [...expenses].sort((a, b) => {
      const dateA = new Date(a.expense_date || a.created_at).getTime()
      const dateB = new Date(b.expense_date || b.created_at).getTime()
      return dateB - dateA // Newest first
    })
  }, [expenses])

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
    // Create detailed CSV with proper formatting
    const csvRows = []
    
    // Add title and metadata
    csvRows.push('EXPENSE REPORT')
    csvRows.push(`Generated on: ${new Date().toLocaleString()}`)
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
      const amount = exp.amount || 0
      const status = exp.status?.toUpperCase() || 'PENDING'
      const recordedBy = ((exp as unknown as { admins?: { full_name?: string } }).admins?.full_name || 'N/A').replace(/"/g, '""')
      const approvedBy = ((exp as unknown as { approved_by?: { full_name?: string } }).approved_by?.full_name || 'N/A').replace(/"/g, '""')
      const notes = (exp.rejection_reason || '').replace(/"/g, '""')
      
      csvRows.push(`"${date}","${title}","${description}","${category}","${fundedBy}",${amount},"${status}","${recordedBy}","${approvedBy}","${notes}"`)
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
              <button
                onClick={exportToCSV}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl transition-all hover:scale-105"
                style={{ 
                  background: `linear-gradient(135deg, ${colors.accentMint}20, ${colors.accentMint}10)`,
                  border: `1px solid ${colors.accentMint}40`,
                  color: colors.accentMint
                }}
                title="Export to CSV"
              >
                <Download className="w-4 h-4" />
                <span className="text-sm font-medium">Export</span>
              </button>
              <div className="flex items-center gap-2 px-4 py-2 rounded-xl" style={{ 
                background: `${colors.statusPaid}10`, 
                border: `1px solid ${colors.statusPaid}20` 
              }}>
                <CheckCircle className="w-4 h-4" style={{ color: colors.statusPaid }} />
                <span className="text-sm font-medium" style={{ color: colors.statusPaid }}>
                  ₦{sortedExpenses.filter(exp => exp.status === 'approved').reduce((sum, exp) => sum + (exp.amount || 0), 0).toLocaleString()}
                </span>
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

                      {/* Amount */}
                      <div className="text-right">
                        <div className="font-bold text-2xl mb-1" style={{ 
                          background: gradients.primary,
                          WebkitBackgroundClip: 'text',
                          WebkitTextFillColor: 'transparent',
                          backgroundClip: 'text'
                        }}>
                          ₦{Number(exp.amount || 0).toLocaleString()}
                        </div>
                        {(hasPermission('can_manage_students') || expStatus === 'approved') && (
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
                                console.error('Failed to load receipt image:', receiptUrl)
                                const target = e.target as HTMLImageElement
                                target.style.display = 'none'
                                const errorDiv = document.createElement('div')
                                errorDiv.className = 'p-8 text-center'
                                errorDiv.style.color = colors.textSecondary
                                errorDiv.innerHTML = `<p>❌ Failed to load receipt image</p><p class="text-xs mt-2">${receiptUrl}</p>`
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
    </>
  )
}
