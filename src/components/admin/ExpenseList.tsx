import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import GlassCard from '@/components/ui/GlassCard'
import { colors, gradients } from '@/config/colors'
import { useExpenses } from '@/hooks/useExpenses'
import { useAuth } from '@/hooks/useAuth'
import { getPublicUrl } from '@/config/supabase'
import type { Expense } from '@/services/expenseService'
import { CheckCircle, Clock, XCircle, Calendar, Tag, FileText, X, Download, Eye, User } from 'lucide-react'
import * as LucideIcons from 'lucide-react'

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
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-white">Recent Expenses</h2>
            <p className="text-sm mt-1" style={{ color: colors.textSecondary }}>
              {expenses.length} expense{expenses.length !== 1 ? 's' : ''} recorded
            </p>
          </div>
          {expenses.length > 0 && (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <FileText className="w-4 h-4" style={{ color: colors.textSecondary }} />
                <span className="text-xs font-medium" style={{ color: colors.textSecondary }}>
                  Total: ₦{expenses.reduce((sum, exp) => sum + (exp.amount || 0), 0).toLocaleString()}
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

        {!loading && expenses.length === 0 && (
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

        {!loading && expenses.length > 0 && (
          <div className="space-y-3">
            {expenses.map((exp, index) => {
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
                  onClick={() => setSelected(exp)}
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
                    </div>
                  </div>
                </motion.div>
              )
            })}
          </div>
        )}
      </GlassCard>

      {/* Enhanced Detail Modal */}
      <AnimatePresence>
        {selected && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setSelected(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 20 }}
              className="max-w-3xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <GlassCard className="p-8 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="flex items-start justify-between mb-8 sticky top-0 bg-inherit pb-4 border-b" style={{ borderColor: colors.borderLight }}>
                  <div className="flex-1">
                    <h2 className="text-2xl font-bold text-white mb-3">{selected.title}</h2>
                    <StatusBadge status={selected.status as 'pending' | 'approved' | 'rejected'} />
                  </div>
                  <button
                    onClick={() => setSelected(null)}
                    className="p-2 rounded-lg transition-all hover:bg-white/10"
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
                {selected.receipt_url && (
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
                        <div className="rounded-xl overflow-hidden border max-h-[400px] overflow-y-auto" style={{ borderColor: colors.borderLight, background: 'rgba(0,0,0,0.3)' }}>
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
                      )
                    })()}
                  </div>
                )}
              </GlassCard>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}
