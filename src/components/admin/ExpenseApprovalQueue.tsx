/* eslint-disable @typescript-eslint/no-explicit-any */
import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import type { Variants } from 'framer-motion'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown'
import ProfessionalDateTimePicker from '@/components/ui/ProfessionalDateTimePicker'
import { useAppAuth as useAuth } from '@/hooks/useAppAuth'
import { useToast } from '@/hooks/useToast'
import {
  fetchExpenses,
  approveExpense,
  deleteExpense,
  updateExpenseFields,
  fetchExpenseCategories,
  type Expense,
  type ExpenseCategory,
} from '@/services/expenseService'
import { getPublicUrl, supabase } from '@/config/supabase'
import { getOrgScope } from '@/utils/orgScope'
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
  Sparkles,
  TrendingDown,
  Receipt,
  ShieldAlert,
  ArrowUpRight,
  FileText,
} from 'lucide-react'

// ── Design tokens ──────────────────────────────────────────────────────────
const tk = {
  primary:    '#FF6803',
  mint:       '#30FFAC',
  danger:     '#EF4444',
  warning:    '#FBBF24',
  success:    '#22C55E',
  bg:         '#0F0703',
  cardBg:     'rgba(255,255,255,0.03)',
  cardBorder: 'rgba(255,255,255,0.07)',
  hoverBorder:'rgba(255,104,3,0.28)',
  textSec:    'rgba(255,255,255,0.5)',
  textTer:    'rgba(255,255,255,0.28)',
}

// ── Util ───────────────────────────────────────────────────────────────────

function fmtAmount(n: number) {
  return `₦${n.toLocaleString()}`
}

function fmtDate(raw?: string) {
  if (!raw) return '—'
  return new Date(raw).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

function renderCategoryIcon(icon: any, name: string, color: string) {
  if (icon && typeof icon === 'object' && icon.$$typeof) return icon
  if (typeof icon === 'string' && /^(https?:)?\/\//.test(icon)) {
    return <img src={icon} alt={name} className="w-5 h-5 object-contain" />
  }
  if (typeof icon === 'string' && icon.trim().length <= 2) {
    return <span className="text-base leading-none">{icon}</span>
  }
  const initials = (name || '').split(' ').filter(Boolean).slice(0, 2).map(s => s[0]?.toUpperCase()).join('') || '📦'
  return <span className="text-xs font-bold" style={{ color }}>{initials}</span>
}

// ── Stagger variants ───────────────────────────────────────────────────────
const EASE = [0.22, 1, 0.36, 1] as const

const listVariants: Variants = {
  hidden: {},
  show: { transition: { staggerChildren: 0.06, delayChildren: 0.04 } },
}
const itemVariants: Variants = {
  hidden: { opacity: 0, y: 16 },
  show:   { opacity: 1, y: 0, transition: { duration: 0.38, ease: EASE } },
}

// ── Stat pill ──────────────────────────────────────────────────────────────
function StatPill({
  icon, label, value, color,
}: { icon: React.ReactNode; label: string; value: string; color: string }) {
  return (
    <div
      className="flex-1 min-w-[100px] rounded-2xl p-4 relative overflow-hidden"
      style={{ background: `${color}0d`, border: `1px solid ${color}22` }}
    >
      <div className="absolute top-0 left-0 right-0 h-[2px]" style={{ background: color }} />
      <div className="flex items-center gap-2 mb-1.5">
        <span style={{ color }}>{icon}</span>
        <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: tk.textTer }}>{label}</p>
      </div>
      <p className="text-xl font-black text-white tabular-nums truncate">{value}</p>
    </div>
  )
}

// ── Expense Card ───────────────────────────────────────────────────────────
function ExpenseCard({
  expense,
  balanceMap,
  approvalLoading,
  selectedExpense,
  onApprove,
  onRejectClick,
  onEditClick,
  onDeleteClick,
  onViewReceipt,
}: {
  expense: Expense
  balanceMap: Map<string, number>
  approvalLoading: boolean
  selectedExpense: Expense | null
  onApprove: (id: string) => void
  onRejectClick: (e: Expense) => void
  onEditClick: (e: Expense) => void
  onDeleteClick: (e: Expense) => void
  onViewReceipt: (url: string) => void
}) {
  const [hovered, setHovered] = useState(false)
  const categoryData = (expense as any).category as { name?: string; icon?: string; color?: string } | undefined
  const categoryName  = categoryData?.name  || 'Uncategorized'
  const categoryIcon  = categoryData?.icon  || '📦'
  const categoryColor = categoryData?.color || tk.primary
  const currentBalance = balanceMap.get(expense.funded_by || '') || 0
  const balanceAfter   = currentBalance - (expense.amount || 0)
  const isBeingLoaded  = approvalLoading && selectedExpense?.id === expense.id

  return (
    <motion.div
      variants={itemVariants}
      onHoverStart={() => setHovered(true)}
      onHoverEnd={() => setHovered(false)}
      className="rounded-[20px] overflow-hidden transition-shadow"
      style={{
        background: hovered ? 'rgba(255,255,255,0.04)' : tk.cardBg,
        border: `1px solid ${hovered ? tk.hoverBorder : tk.cardBorder}`,
        boxShadow: hovered ? '0 8px 32px rgba(0,0,0,0.3)' : 'none',
      }}
    >
      {/* Top accent strip by category color */}
      <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${categoryColor}60, transparent)` }} />

      <div className="p-5 sm:p-6">
        {/* ── Row 1: Category icon + title + amount ── */}
        <div className="flex items-start gap-4">
          {/* Category icon */}
          <div
            className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0"
            style={{ background: `${categoryColor}18`, border: `1px solid ${categoryColor}30` }}
          >
            {renderCategoryIcon(categoryIcon, categoryName, categoryColor)}
          </div>

          {/* Title block */}
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-white text-base leading-tight truncate">{expense.title}</h3>
            <div className="flex flex-wrap items-center gap-2 mt-1.5">
              <span
                className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold uppercase tracking-wide"
                style={{ background: `${categoryColor}15`, color: categoryColor }}
              >
                {categoryName}
              </span>
              <span className="inline-flex items-center gap-1 text-xs" style={{ color: tk.textTer }}>
                <Calendar className="w-3 h-3" />
                {fmtDate(expense.expense_date)}
              </span>
              {expense.funded_by && (
                <span className="inline-flex items-center gap-1 text-[10px] font-medium" style={{ color: tk.textTer }}>
                  <FileText className="w-3 h-3" /> {expense.funded_by}
                </span>
              )}
            </div>
            {expense.description && (
              <p className="mt-2 text-sm leading-5 line-clamp-2" style={{ color: tk.textSec }}>
                {expense.description}
              </p>
            )}
          </div>

          {/* Amount + balance */}
          <div className="text-right shrink-0 ml-2">
            <p className="text-2xl font-black tabular-nums" style={{ color: tk.danger }}>
              {fmtAmount(expense.amount || 0)}
            </p>
            <p className="text-[11px] mt-1" style={{ color: tk.textTer }}>
              After:{' '}
              <span
                className="font-semibold"
                style={{ color: balanceAfter < 0 ? tk.danger : tk.success }}
              >
                {fmtAmount(balanceAfter)}
              </span>
            </p>
          </div>
        </div>

        {/* ── Row 2: Actions ── */}
        <div
          className="mt-5 pt-4 flex flex-wrap items-center gap-2"
          style={{ borderTop: `1px solid ${hovered ? 'rgba(255,104,3,0.12)' : tk.cardBorder}` }}
        >
          {/* Approve */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onApprove(expense.id)}
            disabled={isBeingLoaded}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-bold text-white disabled:opacity-50 transition-all"
            style={{
              background: `linear-gradient(135deg, ${tk.success}, #16A34A)`,
              boxShadow: `0 4px 14px ${tk.success}30`,
            }}
          >
            {isBeingLoaded
              ? <motion.div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full" animate={{ rotate: 360 }} transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }} />
              : <CheckCircle className="w-3.5 h-3.5" />
            }
            Approve
          </motion.button>

          {/* Reject */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onRejectClick(expense)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold transition-all"
            style={{
              background: `${tk.danger}14`,
              color: tk.danger,
              border: `1px solid ${tk.danger}30`,
            }}
          >
            <XCircle className="w-3.5 h-3.5" /> Reject
          </motion.button>

          {/* Edit */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onEditClick(expense)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: 'rgba(255,255,255,0.04)',
              color: tk.textSec,
              border: `1px solid ${tk.cardBorder}`,
            }}
          >
            <Edit3 className="w-3.5 h-3.5" /> Edit
          </motion.button>

          {/* Delete */}
          <motion.button
            whileHover={{ scale: 1.03 }}
            whileTap={{ scale: 0.97 }}
            onClick={() => onDeleteClick(expense)}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all"
            style={{
              background: `${tk.danger}08`,
              color: `${tk.danger}aa`,
              border: `1px solid ${tk.danger}18`,
            }}
          >
            <Trash2 className="w-3.5 h-3.5" /> Delete
          </motion.button>

          {/* View receipt — right-aligned */}
          {expense.receipt_url ? (
            <motion.button
              whileHover={{ scale: 1.03, color: '#fff' }}
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                let path = expense.receipt_url!
                if (path.includes('expense-receipts/')) path = path.split('expense-receipts/').pop() || path
                else if (path.includes('/storage/v1/object/public/')) path = path.split('/').pop() || path
                try { path = decodeURIComponent(path) } catch { /* */ }
                onViewReceipt(getPublicUrl('expense-receipts', path))
              }}
              className="ml-auto inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition-all"
              style={{
                background: `${tk.primary}12`,
                color: tk.primary,
                border: `1px solid ${tk.primary}25`,
              }}
            >
              <Eye className="w-3.5 h-3.5" />
              Receipt
              <ArrowUpRight className="w-3 h-3 opacity-60" />
            </motion.button>
          ) : (
            <span className="ml-auto text-xs px-2" style={{ color: tk.textTer }}>No receipt</span>
          )}
        </div>
      </div>
    </motion.div>
  )
}

// ── Modal shell ────────────────────────────────────────────────────────────
function Modal({ open, onClose, children }: { open: boolean; onClose: () => void; children: React.ReactNode }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ backdropFilter: 'blur(18px)', background: 'rgba(0,0,0,0.75)' }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.22 }}
          onClick={onClose}
        >
          <motion.div
            onClick={e => e.stopPropagation()}
            initial={{ scale: 0.92, opacity: 0, y: 16 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.92, opacity: 0, y: 16 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="w-full max-w-md"
          >
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// ── Field label ────────────────────────────────────────────────────────────
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: tk.textTer }}>
      {children}
    </label>
  )
}

// ── Text input ─────────────────────────────────────────────────────────────
function TextInput({ value, onChange, placeholder, type = 'text' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; type?: string
}) {
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all placeholder-white/20 focus:ring-2 focus:ring-orange-500/30"
      style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${tk.cardBorder}` }}
    />
  )
}

// ── Textarea ───────────────────────────────────────────────────────────────
function TextArea({ value, onChange, placeholder, rows = 4 }: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none resize-none transition-all placeholder-white/20 focus:ring-2 focus:ring-orange-500/30"
      style={{ background: 'rgba(255,255,255,0.05)', border: `1px solid ${tk.cardBorder}` }}
    />
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function ExpenseApprovalQueue() {
  const { user } = useAuth()
  const { success, error: showError } = useToast()

  const [pendingExpenses, setPendingExpenses]   = useState<Expense[]>([])
  const [loading, setLoading]                   = useState(true)
  const [selectedExpense, setSelectedExpense]   = useState<Expense | null>(null)
  const [approvalLoading, setApprovalLoading]   = useState(false)
  const [rejectionReason, setRejectionReason]   = useState('')
  const [balanceMap, setBalanceMap]             = useState<Map<string, number>>(new Map())
  const [imageModal, setImageModal]             = useState<string | null>(null)
  const [showRejectModal, setShowRejectModal]   = useState(false)
  const [showEditModal, setShowEditModal]       = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [editingExpense, setEditingExpense]     = useState<Partial<Expense> | null>(null)
  const [categories, setCategories]             = useState<ExpenseCategory[]>([])
  const [paymentTypes, setPaymentTypes]         = useState<{ id: string; name: string }[]>([])
  const [confirmDialog, setConfirmDialog]       = useState<{
    isOpen: boolean; title: string; message: string
    type: 'info' | 'warning' | 'danger' | 'success'; onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', type: 'info', onConfirm: () => {} })

  useEffect(() => {
    loadPendingExpenses()
    loadCategories()
    loadPaymentTypes()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  async function loadCategories() {
    try { setCategories(await fetchExpenseCategories(true)) } catch { /* */ }
  }

  async function loadPaymentTypes() {
    try {
      const scope = getOrgScope()
      let q = supabase.from('payment_types').select('id, name').eq('is_active', true)
      if (scope) q = q.eq('organization_id', scope.orgId)
      const { data } = await q
      setPaymentTypes(data || [])
    } catch { /* */ }
  }

  async function loadPendingExpenses() {
    try {
      setLoading(true)
      const data = await fetchExpenses(100, 'pending')
      setPendingExpenses(data || [])
      await fetchAvailableBalances()
    } catch { showError('Failed to load pending expenses') }
    finally { setLoading(false) }
  }

  async function fetchAvailableBalances() {
    try {
      const scope = getOrgScope()
      let qPayments = supabase
        .from('payments').select('amount, payment_type_id, payment_types ( id, category )')
        .eq('status', 'approved').not('transaction_ref', 'like', 'WAIVED-%')
      if (scope) qPayments = qPayments.eq('organization_id', scope.orgId)
      const { data: paymentsData } = await qPayments

      let qExpenses = supabase
        .from('expenses').select('amount, category, category_id, payment_type_id, payment_types ( id, category )')
        .eq('status', 'approved')
      if (scope) qExpenses = qExpenses.eq('organization_id', scope.orgId)
      const { data: expensesData } = await qExpenses

      const balances = new Map<string, number>()
      paymentsData?.forEach((p: any) => {
        const cat = Array.isArray(p.payment_types) ? p.payment_types[0]?.category : p.payment_types?.category
        balances.set(cat || 'Other', (balances.get(cat || 'Other') || 0) + Number(p.amount || 0))
      })
      expensesData?.forEach((e: any) => {
        const catFromRel = Array.isArray(e.payment_types) ? e.payment_types[0]?.category : e.payment_types?.category
        const key = e.category || catFromRel || 'Other'
        balances.set(key, (balances.get(key) || 0) - Number(e.amount || 0))
      })
      setBalanceMap(balances)
    } catch { /* */ }
  }

  async function handleApprove(expenseId: string) {
    const expense = pendingExpenses.find(e => e.id === expenseId)
    if (!expense) return
    setSelectedExpense(expense)

    const expenseCategory = (expense as any).category?.name || (expense as any).category || (expense as any).payment_types?.[0]?.category || 'Other'
    const currentBalance  = balanceMap.get(expenseCategory) || 0
    const balanceAfter    = currentBalance - (expense.amount || 0)
    const LOW_THRESHOLD   = 15000

    const performApproval = async () => {
      try {
        setApprovalLoading(true)
        const adminId = user?.admins?.[0]?.id
        if (!adminId) { showError('Admin ID not found'); return }
        await approveExpense({ expense_id: expenseId, approved: true, admin_id: adminId })
        success('Expense approved')
        setPendingExpenses(prev => prev.filter(e => e.id !== expenseId))
        setSelectedExpense(null)
        await fetchAvailableBalances()
      } catch { showError('Failed to approve expense') }
      finally { setApprovalLoading(false) }
    }

    if (balanceAfter < 0) {
      setConfirmDialog({
        isOpen: true, type: 'danger',
        title: 'Critical: Negative Balance',
        message: `Approving this expense will result in a NEGATIVE balance of ${fmtAmount(balanceAfter)}. The funding source will be overdrawn. Proceed only if intentional.`,
        onConfirm: performApproval,
      }); return
    }
    if (balanceAfter < LOW_THRESHOLD) {
      setConfirmDialog({
        isOpen: true, type: 'warning',
        title: 'Low Balance Warning',
        message: `Approving this will bring the balance to ${fmtAmount(balanceAfter)}, below the ₦${LOW_THRESHOLD.toLocaleString()} threshold. Proceed if you're aware.`,
        onConfirm: performApproval,
      }); return
    }
    setConfirmDialog({
      isOpen: true, type: 'info',
      title: 'Approve Expense',
      message: `Approve "${expense.title}" for ${fmtAmount(expense.amount || 0)}? Balance after: ${fmtAmount(balanceAfter)}.`,
      onConfirm: performApproval,
    })
  }

  async function handleReject(expenseId: string) {
    if (!rejectionReason.trim()) { showError('Please provide a rejection reason'); return }
    try {
      setApprovalLoading(true)
      const adminId = user?.admins?.[0]?.id
      if (!adminId) { showError('Admin ID not found'); return }
      await approveExpense({ expense_id: expenseId, approved: false, admin_id: adminId, reason: rejectionReason })
      success('Expense rejected')
      setPendingExpenses(prev => prev.filter(e => e.id !== expenseId))
      setSelectedExpense(null); setShowRejectModal(false); setRejectionReason('')
    } catch { showError('Failed to reject expense') }
    finally { setApprovalLoading(false) }
  }

  async function handleDelete(expenseId: string) {
    try {
      setApprovalLoading(true)
      await deleteExpense(expenseId)
      success('Expense deleted')
      setPendingExpenses(prev => prev.filter(e => e.id !== expenseId))
      setShowDeleteConfirm(false); setSelectedExpense(null)
    } catch { showError('Failed to delete expense') }
    finally { setApprovalLoading(false) }
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
        expense_date: editingExpense.expense_date,
      })
      success('Expense updated')
      setShowEditModal(false); setEditingExpense(null)
      await loadPendingExpenses()
    } catch { showError('Failed to update expense') }
    finally { setApprovalLoading(false) }
  }

  const canApprove = user?.admins?.some((admin: any) =>
    ['class_rep', 'finsec', 'financial_secretary', 'admin'].includes(admin.role) || admin.can_approve_payments === true
  )

  if (!canApprove) {
    return (
      <div
        className="rounded-[24px] p-10 text-center"
        style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
      >
        <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: `${tk.warning}12` }}>
          <ShieldAlert className="w-8 h-8" style={{ color: tk.warning }} />
        </div>
        <h2 className="text-xl font-bold text-white">Access Restricted</h2>
        <p className="mt-2 text-sm" style={{ color: tk.textSec }}>
          Only Admins, Class Representatives, or Financial Secretaries can approve expenses.
        </p>
      </div>
    )
  }

  const totalAmount = pendingExpenses.reduce((s, e) => s + (e.amount || 0), 0)
  const avgAmount   = pendingExpenses.length > 0 ? Math.round(totalAmount / pendingExpenses.length) : 0

  return (
    <>
      <div
        className="rounded-[28px] overflow-hidden"
        style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
      >
        {/* Accent line */}
        <div
          className="h-[2px]"
          style={{ background: `linear-gradient(90deg, ${tk.warning}, ${tk.primary} 50%, ${tk.mint})` }}
        />

        {/* ── Panel Header ── */}
        <div className="p-6 sm:p-8">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
            {/* Title block */}
            <div className="flex items-center gap-4">
              <div className="relative shrink-0">
                <div
                  className="w-12 h-12 rounded-2xl flex items-center justify-center"
                  style={{
                    background: `linear-gradient(135deg, ${tk.warning}22, ${tk.warning}08)`,
                    border: `1px solid ${tk.warning}35`,
                    boxShadow: `0 4px 16px ${tk.warning}18`,
                  }}
                >
                  <Receipt className="w-6 h-6" style={{ color: tk.warning }} />
                </div>
                {pendingExpenses.length > 0 && (
                  <motion.div
                    animate={{ scale: [1, 1.25, 1] }}
                    transition={{ duration: 2, repeat: Infinity }}
                    className="absolute -top-1.5 -right-1.5 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black"
                    style={{ background: tk.warning, color: '#000' }}
                  >
                    {pendingExpenses.length}
                  </motion.div>
                )}
              </div>

              <div>
                <div className="flex items-center gap-2 mb-0.5">
                  <h2 className="text-xl font-black text-white">Approval Queue</h2>
                  <span
                    className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-widest"
                    style={{ background: `${tk.warning}14`, border: `1px solid ${tk.warning}30`, color: tk.warning }}
                  >
                    <Sparkles className="w-2.5 h-2.5" /> Admin Panel
                  </span>
                </div>
                <p className="text-sm" style={{ color: tk.textSec }}>
                  Review and action pending expense requests
                </p>
              </div>
            </div>

            {/* Refresh */}
            <motion.button
              whileHover={{ scale: 1.03 }}
              whileTap={{ scale: 0.97 }}
              onClick={loadPendingExpenses}
              disabled={loading}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold self-start transition-all"
              style={{
                background: `${tk.primary}12`,
                border: `1px solid ${tk.primary}28`,
                color: tk.primary,
              }}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </motion.button>
          </div>

          {/* ── Stat pills ── */}
          <div className="flex flex-wrap gap-3">
            <StatPill
              icon={<Clock className="w-4 h-4" />}
              label="Pending"
              value={String(pendingExpenses.length)}
              color={tk.warning}
            />
            <StatPill
              icon={<DollarSign className="w-4 h-4" />}
              label="Total value"
              value={fmtAmount(totalAmount)}
              color={tk.success}
            />
            <StatPill
              icon={<TrendingDown className="w-4 h-4" />}
              label="Average"
              value={fmtAmount(avgAmount)}
              color={tk.primary}
            />
          </div>
        </div>

        {/* ── Content ── */}
        <div className="px-6 sm:px-8 pb-8">
          {/* Loading */}
          {loading && (
            <div className="py-16 flex flex-col items-center gap-4">
              <motion.div
                className="w-10 h-10 border-2 rounded-full"
                style={{ borderColor: `${tk.warning}25`, borderTopColor: tk.warning }}
                animate={{ rotate: 360 }}
                transition={{ duration: 0.85, repeat: Infinity, ease: 'linear' }}
              />
              <p className="text-sm" style={{ color: tk.textTer }}>Loading pending expenses…</p>
            </div>
          )}

          {/* Empty */}
          {!loading && pendingExpenses.length === 0 && (
            <motion.div
              className="py-16 text-center"
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
            >
              <div
                className="w-20 h-20 mx-auto mb-5 rounded-3xl flex items-center justify-center"
                style={{ background: `${tk.success}10`, border: `1px solid ${tk.success}28` }}
              >
                <CheckCircle className="w-10 h-10" style={{ color: tk.success }} />
              </div>
              <h3 className="text-xl font-bold text-white">All clear!</h3>
              <p className="mt-1.5 text-sm max-w-xs mx-auto" style={{ color: tk.textSec }}>
                No expenses pending review. The queue is clean.
              </p>
            </motion.div>
          )}

          {/* Cards */}
          {!loading && pendingExpenses.length > 0 && (
            <motion.div
              className="space-y-3"
              variants={listVariants}
              initial="hidden"
              animate="show"
            >
              {pendingExpenses.map((expense) => (
                <ExpenseCard
                  key={expense.id}
                  expense={expense}
                  balanceMap={balanceMap}
                  approvalLoading={approvalLoading}
                  selectedExpense={selectedExpense}
                  onApprove={handleApprove}
                  onRejectClick={e => { setSelectedExpense(e); setShowRejectModal(true); setRejectionReason('') }}
                  onEditClick={e => { setEditingExpense({ ...e }); setShowEditModal(true) }}
                  onDeleteClick={e => { setSelectedExpense(e); setShowDeleteConfirm(true) }}
                  onViewReceipt={setImageModal}
                />
              ))}
            </motion.div>
          )}
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* REJECT MODAL                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Modal open={showRejectModal} onClose={() => setShowRejectModal(false)}>
        <div
          className="rounded-[24px] overflow-hidden"
          style={{ background: 'rgba(14,7,3,0.98)', border: `1px solid ${tk.danger}25`, boxShadow: `0 24px 64px rgba(0,0,0,0.7)` }}
        >
          <div className="h-[2px]" style={{ background: tk.danger }} />
          <div className="p-6 sm:p-8">
            <div className="flex items-center gap-3 mb-6">
              <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${tk.danger}15` }}>
                <XCircle className="w-6 h-6" style={{ color: tk.danger }} />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Reject Expense</h3>
                {selectedExpense && (
                  <p className="text-xs mt-0.5 truncate max-w-[240px]" style={{ color: tk.textTer }}>
                    "{selectedExpense.title}"
                  </p>
                )}
              </div>
            </div>

            <div className="mb-5">
              <FieldLabel>Reason for rejection <span style={{ color: tk.danger }}>*</span></FieldLabel>
              <TextArea
                value={rejectionReason}
                onChange={setRejectionReason}
                placeholder="Explain clearly why this expense is being rejected…"
                rows={4}
              />
            </div>

            <div className="flex gap-3">
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => setShowRejectModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.05)', color: tk.textSec }}
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => selectedExpense && handleReject(selectedExpense.id)}
                disabled={approvalLoading || !rejectionReason.trim()}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${tk.danger}, #DC2626)`, boxShadow: `0 4px 16px ${tk.danger}30` }}
              >
                {approvalLoading ? 'Rejecting…' : 'Confirm Rejection'}
              </motion.button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* EDIT MODAL                                                        */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Modal open={showEditModal} onClose={() => setShowEditModal(false)}>
        <div
          className="rounded-[24px] overflow-hidden max-h-[90vh] overflow-y-auto"
          style={{ background: 'rgba(14,7,3,0.98)', border: `1px solid ${tk.primary}25`, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}
        >
          <div className="h-[2px]" style={{ background: `linear-gradient(90deg, ${tk.primary}, ${tk.mint})` }} />
          <div className="p-6 sm:p-8">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${tk.primary}15` }}>
                  <Edit3 className="w-5 h-5" style={{ color: tk.primary }} />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-white">Edit Expense</h3>
                  <p className="text-xs" style={{ color: tk.textTer }}>Modify before approving</p>
                </div>
              </div>
              <button
                onClick={() => setShowEditModal(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center transition-colors hover:bg-white/10"
              >
                <X className="w-4 h-4" style={{ color: tk.textSec }} />
              </button>
            </div>

            {editingExpense && (
              <div className="space-y-4">
                <div>
                  <FieldLabel>Title</FieldLabel>
                  <TextInput value={editingExpense.title || ''} onChange={v => setEditingExpense({ ...editingExpense, title: v })} />
                </div>
                <div>
                  <FieldLabel>Description</FieldLabel>
                  <TextArea
                    value={editingExpense.description || ''}
                    onChange={v => setEditingExpense({ ...editingExpense, description: v })}
                    rows={3}
                    placeholder="Optional notes…"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <FieldLabel>Amount (₦)</FieldLabel>
                    <TextInput
                      type="number"
                      value={String(editingExpense.amount || '')}
                      onChange={v => setEditingExpense({ ...editingExpense, amount: parseFloat(v) || 0 })}
                    />
                  </div>
                  <div>
                    <ProfessionalDateTimePicker
                      label="Date"
                      value={editingExpense.expense_date?.split('T')[0] || ''}
                      onChange={(v: any) => setEditingExpense({ ...editingExpense, expense_date: v })}
                      // includeTime={false}
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>Category</FieldLabel>
                  <ProfessionalDropdown
                    options={categories.map(cat => ({
                      value: cat.id, label: cat.name,
                      icon: (() => {
                        const ic = cat.icon
                        if (!ic) return undefined
                        if (typeof ic === 'string') {
                          if (/^(https?:)?\/\//.test(ic)) return <img src={ic} alt={cat.name} className="w-4 h-4 object-contain" />
                          if (ic.trim().length <= 2) return ic
                        }
                        return undefined
                      })(),
                    }))}
                    value={editingExpense.category_id || ''}
                    onChange={val => setEditingExpense({ ...editingExpense, category_id: String(val) })}
                    placeholder="Select category"
                    searchable clearable
                  />
                </div>
                <div>
                  <FieldLabel>Funded by</FieldLabel>
                  <ProfessionalDropdown
                    options={paymentTypes.map(pt => ({ value: pt.id, label: pt.name }))}
                    value={editingExpense.funded_by || ''}
                    onChange={val => setEditingExpense({ ...editingExpense, funded_by: String(val) })}
                    placeholder="Select funding source"
                    searchable clearable
                  />
                </div>
              </div>
            )}

            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => setShowEditModal(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.05)', color: tk.textSec }}
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={handleEdit}
                disabled={approvalLoading}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${tk.primary}, #FFAC5F)`, boxShadow: `0 4px 16px ${tk.primary}30` }}
              >
                {approvalLoading ? 'Saving…' : 'Save Changes'}
              </motion.button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* DELETE MODAL                                                      */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <Modal open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)}>
        <div
          className="rounded-[24px] overflow-hidden"
          style={{ background: 'rgba(14,7,3,0.98)', border: `1px solid ${tk.danger}25`, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}
        >
          <div className="h-[2px]" style={{ background: tk.danger }} />
          <div className="p-6 sm:p-8 text-center">
            <div className="w-16 h-16 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: `${tk.danger}12` }}>
              <Trash2 className="w-8 h-8" style={{ color: tk.danger }} />
            </div>
            <h3 className="text-xl font-bold text-white">Delete Expense</h3>
            {selectedExpense && (
              <p className="mt-2 text-sm" style={{ color: tk.textSec }}>
                Delete <span className="text-white font-semibold">"{selectedExpense.title}"</span>?
                This cannot be undone.
              </p>
            )}
            <div
              className="mt-4 flex items-center gap-2 px-4 py-3 rounded-xl text-left"
              style={{ background: `${tk.danger}08`, border: `1px solid ${tk.danger}18` }}
            >
              <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: tk.danger }} />
              <span className="text-xs" style={{ color: `${tk.danger}cc` }}>
                This will permanently remove the expense record.
              </span>
            </div>
            <div className="flex gap-3 mt-6">
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 py-3 rounded-xl text-sm font-semibold"
                style={{ background: 'rgba(255,255,255,0.05)', color: tk.textSec }}
              >
                Cancel
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
                onClick={() => selectedExpense && handleDelete(selectedExpense.id)}
                disabled={approvalLoading}
                className="flex-1 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40"
                style={{ background: `linear-gradient(135deg, ${tk.danger}, #DC2626)`, boxShadow: `0 4px 16px ${tk.danger}30` }}
              >
                {approvalLoading ? 'Deleting…' : 'Delete Expense'}
              </motion.button>
            </div>
          </div>
        </div>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* CONFIRM DIALOG (balance warnings)                                 */}
      {/* ══════════════════════════════════════════════════════════════════ */}
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

      {/* ══════════════════════════════════════════════════════════════════ */}
      {/* IMAGE / RECEIPT MODAL                                             */}
      {/* ══════════════════════════════════════════════════════════════════ */}
      <AnimatePresence>
        {imageModal && (
          <motion.div
            className="fixed inset-0 z-[100] flex items-center justify-center p-4"
            style={{ background: 'rgba(0,0,0,0.95)', backdropFilter: 'blur(8px)' }}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setImageModal(null)}
          >
            <motion.button
              className="absolute top-5 right-5 w-10 h-10 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(255,255,255,0.08)', border: `1px solid ${tk.cardBorder}` }}
              whileHover={{ scale: 1.1, background: 'rgba(255,255,255,0.14)' }}
              onClick={() => setImageModal(null)}
            >
              <X className="w-5 h-5 text-white" />
            </motion.button>
            <motion.img
              initial={{ scale: 0.88, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.88, opacity: 0 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
              src={imageModal}
              alt="Receipt"
              className="max-w-full max-h-[85vh] object-contain rounded-2xl shadow-2xl"
              onClick={e => e.stopPropagation()}
              onError={e => {
                e.currentTarget.src = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280"><rect width="100%" height="100%" fill="%23111"/><text x="50%" y="50%" fill="%23555" font-size="14" text-anchor="middle" dominant-baseline="middle">Image unavailable</text></svg>`
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  )
}