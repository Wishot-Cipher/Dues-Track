import React, { useState, useEffect } from 'react'
import FileUploader from '@/components/ui/FileUploader'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import ProfessionalDropdown from '@/components/ui/ProfessionalDropdown'
import ProfessionalDateTimePicker from '@/components/ui/ProfessionalDateTimePicker'
import { useExpenses } from '@/hooks/useExpenses'
import { useAppAuth as useAuth } from '@/hooks/useAppAuth'
import { useToast } from '@/hooks/useToast'
import { fetchExpenseCategories, type ExpenseCategory } from '@/services/expenseService'
import * as LucideIcons from 'lucide-react'
import {
  Wallet,
  Tag,
  Receipt,
  ShieldCheck,
  AlertTriangle,
  Info,
  CheckCircle,
  RotateCcw,
  Send,
  ShieldAlert,
} from 'lucide-react'
import { getOrgScope } from '@/utils/orgScope'
import { getOwnedTierScope, applyOwnedTierScope, type OwnedTierScope } from '@/utils/scopedGroups'
import { useActiveRole } from '@/hooks/useActiveRole'
import { useMultiTenantAuth } from '@/hooks/useMultiTenantAuth'
import { motion, AnimatePresence } from 'framer-motion'

// ── Design tokens ──────────────────────────────────────────────────────────
const tk = {
  primary:    '#FF6803',
  mint:       '#30FFAC',
  danger:     '#EF4444',
  warning:    '#FBBF24',
  success:    '#22C55E',
  cardBg:     'rgba(255,255,255,0.03)',
  cardBorder: 'rgba(255,255,255,0.07)',
  inputBg:    'rgba(255,255,255,0.05)',
  inputBorder:'rgba(255,255,255,0.1)',
  textSec:    'rgba(255,255,255,0.5)',
  textTer:    'rgba(255,255,255,0.28)',
}

interface PaymentType {
  id: string
  title: string
  amount: number
  late_fee_per_day?: number
}

// ── Category icon renderer ─────────────────────────────────────────────────
function CategoryIcon({ iconName, className = 'w-4 h-4' }: { iconName: string | null; className?: string }) {
  if (!iconName) return <span>📦</span>
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName]
  if (IconComponent) return <IconComponent className={className} />
  return <span>{iconName}</span>
}

// ── Field label ────────────────────────────────────────────────────────────
function FieldLabel({ children, required }: { children: React.ReactNode; required?: boolean }) {
  return (
    <label className="block text-[10px] font-bold uppercase tracking-widest mb-1.5" style={{ color: tk.textTer }}>
      {children}{required && <span className="ml-0.5" style={{ color: tk.danger }}>*</span>}
    </label>
  )
}

// ── Styled text input ──────────────────────────────────────────────────────
function StyledInput({
  value, onChange, placeholder, type = 'text', required, min,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string
  type?: string; required?: boolean; min?: string
}) {
  const [focused, setFocused] = useState(false)
  return (
    <input
      type={type}
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      required={required}
      min={min}
      className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none transition-all placeholder-white/20"
      style={{
        background: tk.inputBg,
        border: `1px solid ${focused ? tk.primary + '60' : tk.inputBorder}`,
        boxShadow: focused ? `0 0 0 3px ${tk.primary}14` : 'none',
      }}
    />
  )
}

// ── Styled textarea ────────────────────────────────────────────────────────
function StyledTextarea({
  value, onChange, placeholder, rows = 2,
}: {
  value: string; onChange: (v: string) => void; placeholder?: string; rows?: number
}) {
  const [focused, setFocused] = useState(false)
  return (
    <textarea
      value={value}
      onChange={e => onChange(e.target.value)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-4 py-3 rounded-xl text-white text-sm outline-none resize-none transition-all placeholder-white/20"
      style={{
        background: tk.inputBg,
        border: `1px solid ${focused ? tk.primary + '60' : tk.inputBorder}`,
        boxShadow: focused ? `0 0 0 3px ${tk.primary}14` : 'none',
      }}
    />
  )
}

// ── Balance mini-bar ───────────────────────────────────────────────────────
function BalanceBar({ percent, color }: { percent: number; color: string }) {
  return (
    <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.08)' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: color }}
        initial={{ width: 0 }}
        animate={{ width: `${Math.min(percent, 100)}%` }}
        transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      />
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────
export default function RecordExpense() {
  const { addExpense, loading } = useExpenses()
  const { hasPermission, user } = useAuth()
  const { success, error: showError } = useToast()
  // Tier-aware. The previous lookups for payments + expenses pinned
  // group_id to the caller's PRIMARY class, which meant a dept /
  // faculty exec saw zero numbers when funding an expense from a
  // dept/faculty-level due. Resolves the active role's full subtree
  // so the form's "available to fund" rollup matches what the exec
  // can actually see + waive against elsewhere in the admin chrome.
  const { user: mtUser, organization } = useMultiTenantAuth()
  const { activeRole } = useActiveRole({
    orgId: organization?.id,
    memberId: mtUser?.id,
  })

  const [title, setTitle]           = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [fundedBy, setFundedBy]     = useState('')
  const [amount, setAmount]         = useState('')
  const [date, setDate]             = useState<string>(new Date().toISOString().slice(0, 10))
  const [file, setFile]             = useState<File | null>(null)
  const [message, setMessage]       = useState<string | null>(null)
  const [messageType, setMessageType] = useState<'success' | 'error'>('error')
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [availableBalance, setAvailableBalance] = useState<number | null>(null)
  const [paymentTypeBalances, setPaymentTypeBalances] = useState<Map<string, { collected: number; spent: number; available: number }>>(new Map())
  const [selectedCategoryBalance, setSelectedCategoryBalance] = useState<number>(0)
  const [warningLevel, setWarningLevel] = useState<'none' | 'notice' | 'danger'>('none')
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [fileUploadKey, setFileUploadKey] = useState(0)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean; title: string; message: string
    type: 'info' | 'warning' | 'danger' | 'success'; onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', type: 'info', onConfirm: () => {} })

  useEffect(() => {
    async function loadData() {
      try {
        // Own-tier scope: this exec records expenses for THEIR tier
        // and funds them from THEIR tier's dues only — a dept exec
        // funds dept expenses from dept dues, never a class's money.
        const ownedScope = getOwnedTierScope({
          activeKind: activeRole?.kind ?? null,
          activeGroupId: activeRole?.groupId ?? null,
          activeScopeLevel: activeRole?.scopeLevel ?? null,
        })
        const [cats, types] = await Promise.all([
          fetchExpenseCategories(false, ownedScope),
          fetchPaymentTypes(ownedScope),
        ])
        setCategories(cats)
        setPaymentTypes(types)
        await fetchAvailableBalance()
      } catch (err) {
        console.error('Failed to load data:', err)
        showError('Failed to load categories. Please check console.')
      } finally {
        setLoadingData(false)
      }
    }
    loadData()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showError, activeRole?.groupId, activeRole?.scopeLevel])

  async function fetchAvailableBalance() {
    try {
      const { supabase } = await import('@/config/supabase')
      const scope = getOrgScope()
      // Own-tier balance: a tier's available funds are ITS OWN dues
      // minus ITS OWN expenses — never the classes' money below it.
      const ownedScope = getOwnedTierScope({
        activeKind: activeRole?.kind ?? null,
        activeGroupId: activeRole?.groupId ?? null,
        activeScopeLevel: activeRole?.scopeLevel ?? null,
      })

      let qPayments = supabase
        .from('payments')
        .select('amount, payment_type_id, payment_types ( id, title, category )')
        .eq('status', 'approved')
        .not('transaction_ref', 'like', 'WAIVED-%')
      if (scope) {
        qPayments = qPayments.eq('organization_id', scope.orgId)
        qPayments = applyOwnedTierScope(qPayments, ownedScope)
      }
      const { data: paymentsData } = await qPayments

      let qExpenses = supabase
        .from('expenses')
        .select('amount, funded_by, payment_types:funded_by ( id, title, category )')
        .eq('status', 'approved')
      if (scope) {
        qExpenses = qExpenses.eq('organization_id', scope.orgId)
        qExpenses = applyOwnedTierScope(qExpenses, ownedScope)
      }
      const { data: expensesData } = await qExpenses

      const paymentTypeMap = new Map<string, { collected: number; spent: number; available: number }>()

      paymentsData?.forEach((payment: any) => {
        const amt = Number(payment.amount) || 0
        const pt  = Array.isArray(payment.payment_types) ? payment.payment_types[0] : payment.payment_types
        const pid = pt?.id || payment.payment_type_id
        if (pid) {
          if (!paymentTypeMap.has(pid)) paymentTypeMap.set(pid, { collected: 0, spent: 0, available: 0 })
          paymentTypeMap.get(pid)!.collected += amt
        }
      })

      expensesData?.forEach((expense: any) => {
        const amt = Number(expense.amount) || 0
        const pt  = Array.isArray(expense.payment_types) ? expense.payment_types[0] : expense.payment_types
        const pid = pt?.id || expense.funded_by
        if (pid) {
          if (!paymentTypeMap.has(pid)) paymentTypeMap.set(pid, { collected: 0, spent: 0, available: 0 })
          paymentTypeMap.get(pid)!.spent += amt
        }
      })

      paymentTypeMap.forEach(v => { v.available = v.collected - v.spent })
      setPaymentTypeBalances(paymentTypeMap)

      const totalCollected = paymentsData?.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0) || 0
      const totalExpenses  = expensesData?.reduce((s: number, e: any) => s + (Number(e.amount) || 0), 0) || 0
      setAvailableBalance(totalCollected - totalExpenses)
    } catch (err) {
      console.error('Failed to fetch balance:', err)
      setAvailableBalance(null)
    }
  }

  useEffect(() => {
    if (fundedBy) {
      setSelectedCategoryBalance(paymentTypeBalances.get(fundedBy)?.available || 0)
    } else {
      setSelectedCategoryBalance(0)
    }
  }, [fundedBy, paymentTypeBalances])

  useEffect(() => {
    const parsed = Number(amount.replace(/[^0-9.-]+/g, ''))
    if (parsed > 0 && selectedCategoryBalance > 0) {
      if (parsed > selectedCategoryBalance) {
        setWarningLevel('danger')
        setWarningMessage(`Amount exceeds available balance of ₦${selectedCategoryBalance.toLocaleString()}`)
      } else if (parsed > selectedCategoryBalance * 0.8) {
        setWarningLevel('notice')
        setWarningMessage(`This uses ${Math.round((parsed / selectedCategoryBalance) * 100)}% of the available balance`)
      } else {
        setWarningLevel('none'); setWarningMessage(null)
      }
    } else {
      setWarningLevel('none'); setWarningMessage(null)
    }
  }, [amount, selectedCategoryBalance])

  async function handleSubmit(e: React.FormEvent, bypassConfirmation = false) {
    e.preventDefault()
    setMessage(null)

    const parsed = Number(amount.replace(/[^0-9.-]+/g, ''))
    if (!hasPermission('can_manage_students') && !hasPermission('can_create_payments')) {
      setMessage('You do not have permission to record expenses')
      setMessageType('error')
      showError('Unauthorized — admin only')
      return
    }
    if (!title || isNaN(parsed) || parsed <= 0) {
      setMessage('Please provide a valid title and amount')
      setMessageType('error')
      showError('Please provide valid title and amount')
      return
    }
    if (!fundedBy) {
      setMessage('Please select which payment type to deduct from')
      setMessageType('error')
      showError('Payment type is required')
      return
    }
    if (selectedCategoryBalance !== null && parsed > selectedCategoryBalance) {
      const source = paymentTypes.find(pt => pt.id === fundedBy)?.title || 'this category'
      setMessage(`Insufficient funds in ${source}. Available: ₦${selectedCategoryBalance.toLocaleString()}`)
      setMessageType('error')
      showError(`Cannot exceed available balance of ₦${selectedCategoryBalance.toLocaleString()}`)
      return
    }
    if (selectedCategoryBalance !== null && parsed > selectedCategoryBalance * 0.5 && !bypassConfirmation) {
      const percent = Math.round((parsed / selectedCategoryBalance) * 100)
      setConfirmDialog({
        isOpen: true, title: 'Large Expense Warning', type: 'warning',
        message: `This expense (₦${parsed.toLocaleString()}) will use ${percent}% of the available balance.\n\nDo you want to continue?`,
        onConfirm: () => setTimeout(() => handleSubmit(e, true), 100),
      })
      return
    }

    try {
      const adminId = user?.admins?.[0]?.id
      if (!adminId) {
        const msg = 'No admin record found. Cannot set recorded_by.'
        setMessage(msg); setMessageType('error'); showError(msg); return
      }
      const categoryName = categories.find(c => c.id === categoryId)?.name || 'Miscellaneous'
      await addExpense({
        title, description,
        category: categoryName,
        category_id: categoryId || undefined,
        funded_by: fundedBy,
        amount: parsed,
        expense_date: date,
        receiptFile: file,
        recorded_by: adminId,
      })
      setMessage('Expense submitted for approval')
      setMessageType('success')
      success('Expense submitted for approval')
      setTitle(''); setDescription(''); setCategoryId('')
      setFundedBy(''); setAmount(''); setFile(null)
      setWarningMessage(null); setWarningLevel('none')
      setFileUploadKey(prev => prev + 1)
      await fetchAvailableBalance()
    } catch (err) {
      console.error(err)
      const msg = err instanceof Error ? err.message : 'Failed to record expense'
      setMessage(msg); setMessageType('error')
      showError('Failed to record expense')
    }
  }

  function handleReset() {
    setTitle(''); setDescription(''); setCategoryId('')
    setFundedBy(''); setAmount(''); setFile(null)
    setMessage(null); setWarningMessage(null); setWarningLevel('none')
    setFileUploadKey(prev => prev + 1)
  }

  // ── Permission guard ───────────────────────────────────────────────────
  if (!hasPermission('can_manage_students') && !hasPermission('can_create_payments')) {
    return (
      <div
        className="rounded-[24px] p-8 text-center"
        style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
      >
        <div className="w-14 h-14 mx-auto mb-4 rounded-2xl flex items-center justify-center" style={{ background: `${tk.warning}12` }}>
          <ShieldAlert className="w-7 h-7" style={{ color: tk.warning }} />
        </div>
        <h3 className="text-base font-bold text-white">Access Restricted</h3>
        <p className="mt-1.5 text-sm" style={{ color: tk.textSec }}>
          You need admin permissions to record expenses.
        </p>
      </div>
    )
  }

  const selectedPT      = paymentTypes.find(pt => pt.id === fundedBy)
  const selectedBalance = fundedBy ? paymentTypeBalances.get(fundedBy) : null
  const percentUsed     = selectedBalance && selectedBalance.collected > 0
    ? (selectedBalance.spent / selectedBalance.collected) * 100 : 0
  const barColor = percentUsed > 80 ? tk.danger : percentUsed > 50 ? tk.warning : tk.success
  const parsedAmount = Number(amount.replace(/[^0-9.-]+/g, ''))
  const isOverBudget = parsedAmount > 0 && parsedAmount > selectedCategoryBalance

  return (
    <>
      <div
        className="rounded-[28px] overflow-hidden"
        style={{ background: tk.cardBg, border: `1px solid ${tk.cardBorder}` }}
      >
        {/* Accent line */}
        <div
          className="h-[2px]"
          style={{ background: `linear-gradient(90deg, ${tk.danger}, ${tk.primary} 55%, transparent)` }}
        />

        <div className="p-6 sm:p-7">

          {/* ── Header ── */}
          <div className="flex items-center gap-4 mb-6">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
              style={{
                background: `linear-gradient(135deg, ${tk.danger}22, ${tk.danger}08)`,
                border: `1px solid ${tk.danger}30`,
                boxShadow: `0 4px 16px ${tk.danger}18`,
              }}
            >
              <Receipt className="w-6 h-6" style={{ color: tk.danger }} />
            </div>
            <div>
              <h2 className="text-xl font-black text-white tracking-tight">Record Expense</h2>
              <p className="text-xs mt-0.5" style={{ color: tk.textTer }}>Submit for senior admin approval</p>
            </div>
          </div>

          {/* ── Approval notice ── */}
          <div
            className="flex items-start gap-2.5 px-4 py-3 rounded-xl mb-5"
            style={{ background: `${tk.mint}09`, border: `1px solid ${tk.mint}20` }}
          >
            <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tk.mint }} />
            <p className="text-xs leading-5" style={{ color: `${tk.mint}cc` }}>
              Expenses require senior admin approval before becoming final.
            </p>
          </div>

          {/* ── Net balance pill ── */}
          {availableBalance !== null && (
            <motion.div
              className="flex items-center justify-between px-4 py-3 rounded-xl mb-5"
              style={{
                background: availableBalance >= 0 ? `${tk.success}0d` : `${tk.danger}0d`,
                border: `1px solid ${availableBalance >= 0 ? tk.success : tk.danger}28`,
              }}
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35 }}
            >
              <div>
                <p className="text-[10px] uppercase tracking-widest font-semibold" style={{ color: tk.textTer }}>
                  Net Available Balance
                </p>
                <p className="text-[10px] mt-0.5" style={{ color: tk.textTer }}>
                  Total collected minus approved expenses
                </p>
              </div>
              <p
                className="text-2xl font-black tabular-nums"
                style={{ color: availableBalance >= 0 ? tk.success : tk.danger }}
              >
                ₦{availableBalance.toLocaleString()}
              </p>
            </motion.div>
          )}

          {/* ── Form ── */}
          <form onSubmit={handleSubmit} className="space-y-4">

            {/* Title */}
            <div>
              <FieldLabel required>Expense Title</FieldLabel>
              <StyledInput
                value={title}
                onChange={setTitle}
                placeholder="e.g. Office Supplies, Event Decorations"
                required
              />
            </div>

            {/* Description */}
            <div>
              <FieldLabel>Description</FieldLabel>
              <StyledTextarea
                value={description}
                onChange={setDescription}
                placeholder="Brief description of the expense…"
                rows={2}
              />
            </div>

            {/* Payment type + Category */}
            <div className="grid grid-cols-1 gap-4">

              {/* Deduct from */}
              <div>
                <FieldLabel required>Deduct From (Payment Type)</FieldLabel>
                <ProfessionalDropdown
                  placeholder="Select payment type"
                  icon={<Wallet className="w-4 h-4" />}
                  value={fundedBy}
                  onChange={val => setFundedBy(val as string)}
                  disabled={loadingData}
                  options={paymentTypes.map(pt => {
                    const bal = paymentTypeBalances.get(pt.id)
                    return {
                      value: pt.id,
                      label: pt.title,
                      description: `Available: ₦${(bal?.available || 0).toLocaleString()}`,
                    }
                  })}
                  searchable={paymentTypes.length > 5}
                />

                {/* Inline balance breakdown */}
                <AnimatePresence>
                  {selectedBalance && selectedPT && (
                    <motion.div
                      className="mt-2.5 rounded-xl px-4 py-3 space-y-2"
                      style={{
                        background: 'rgba(255,255,255,0.03)',
                        border: `1px solid ${tk.mint}20`,
                        borderLeft: `3px solid ${tk.mint}`,
                      }}
                      initial={{ opacity: 0, y: -6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -6 }}
                      transition={{ duration: 0.25 }}
                    >
                      <p className="text-[10px] font-bold uppercase tracking-widest" style={{ color: tk.mint }}>
                        {selectedPT.title}
                      </p>

                      <div className="grid grid-cols-3 gap-2 text-xs">
                        <div>
                          <p style={{ color: tk.textTer }}>Collected</p>
                          <p className="font-semibold text-white">₦{selectedBalance.collected.toLocaleString()}</p>
                        </div>
                        <div>
                          <p style={{ color: tk.textTer }}>Spent</p>
                          <p className="font-semibold" style={{ color: tk.danger }}>₦{selectedBalance.spent.toLocaleString()}</p>
                        </div>
                        <div>
                          <p style={{ color: tk.textTer }}>Available</p>
                          <p className="font-bold" style={{ color: selectedBalance.available >= 0 ? tk.success : tk.danger }}>
                            ₦{selectedBalance.available.toLocaleString()}
                          </p>
                        </div>
                      </div>

                      <BalanceBar percent={percentUsed} color={barColor} />
                      <p className="text-[10px] text-right" style={{ color: tk.textTer }}>
                        {percentUsed.toFixed(1)}% of collected used
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Category */}
              <div>
                <FieldLabel>Expense Category</FieldLabel>
                <ProfessionalDropdown
                  placeholder="Select category (optional)"
                  icon={<Tag className="w-4 h-4" />}
                  value={categoryId}
                  onChange={val => setCategoryId(val as string)}
                  disabled={loadingData}
                  clearable
                  options={categories.map(cat => ({
                    value: cat.id,
                    label: cat.name,
                    description: cat.description || undefined,
                    icon: <CategoryIcon iconName={cat.icon} className="w-4 h-4" />,
                  }))}
                  searchable={categories.length > 5}
                />

                <AnimatePresence>
                  {categoryId && (() => {
                    const sel = categories.find(c => c.id === categoryId)
                    if (!sel) return null
                    return (
                      <motion.div
                        className="mt-2 flex items-center gap-2.5 px-3 py-2 rounded-xl"
                        style={{
                          background: `${sel.color || tk.primary}10`,
                          borderLeft: `3px solid ${sel.color || tk.primary}`,
                        }}
                        initial={{ opacity: 0, y: -4 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.2 }}
                      >
                        <CategoryIcon iconName={sel.icon} className="w-4 h-4" />
                        <span className="text-xs" style={{ color: tk.textSec }}>
                          {sel.description || sel.name}
                        </span>
                      </motion.div>
                    )
                  })()}
                </AnimatePresence>
              </div>
            </div>

            {/* Amount + Date */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel required>Amount (₦)</FieldLabel>
                <StyledInput
                  type="number"
                  value={amount}
                  onChange={setAmount}
                  placeholder="0.00"
                  required
                  min="1"
                />
              </div>
              <div>
                <ProfessionalDateTimePicker
                  label="Expense Date"
                  value={date}
                  onChange={setDate}
                  // includeTime={false}
                />
              </div>
            </div>

            {/* Receipt upload */}
            <div>
              <FieldLabel>Receipt</FieldLabel>
              <FileUploader
                key={fileUploadKey}
                onFileSelect={f => setFile((f as File) ?? null)}
                accept="image/*,application/pdf"
                maxSize={5 * 1024 * 1024}
                label="Upload Receipt (Optional)"
                description="JPG, PNG or PDF · Max 5MB"
                showPreview
              />
            </div>

            {/* Amount warning */}
            <AnimatePresence>
              {warningMessage && (
                <motion.div
                  className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
                  style={{
                    background: warningLevel === 'danger' ? `${tk.danger}0e` : `${tk.warning}0e`,
                    border: `1px solid ${warningLevel === 'danger' ? tk.danger : tk.warning}30`,
                  }}
                  initial={{ opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: warningLevel === 'danger' ? tk.danger : tk.warning }} />
                  <p className="text-xs leading-5" style={{ color: warningLevel === 'danger' ? tk.danger : tk.warning }}>
                    {warningMessage}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Feedback message */}
            <AnimatePresence>
              {message && (
                <motion.div
                  className="flex items-start gap-2.5 px-4 py-3 rounded-xl"
                  style={{
                    background: messageType === 'success' ? `${tk.success}0d` : `${tk.danger}0d`,
                    border: `1px solid ${messageType === 'success' ? tk.success : tk.danger}28`,
                  }}
                  initial={{ opacity: 0, scale: 0.98 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22 }}
                >
                  {messageType === 'success'
                    ? <CheckCircle className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tk.success }} />
                    : <Info className="w-4 h-4 shrink-0 mt-0.5" style={{ color: tk.danger }} />
                  }
                  <p className="text-xs leading-5" style={{ color: messageType === 'success' ? tk.success : tk.danger }}>
                    {message}
                  </p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Actions */}
            <div className="flex items-center gap-3 pt-1">
              {/* Submit */}
              <motion.button
                type="submit"
                disabled={loading || loadingData || isOverBudget}
                className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-bold text-white disabled:opacity-40 relative overflow-hidden"
                style={{
                  background: `linear-gradient(135deg, ${tk.primary} 0%, #FFAC5F 100%)`,
                  boxShadow: `0 6px 24px ${tk.primary}30`,
                }}
                whileHover={{ scale: loading || isOverBudget ? 1 : 1.02 }}
                whileTap={{ scale: loading || isOverBudget ? 1 : 0.98 }}
              >
                {/* Shimmer */}
                {!loading && !isOverBudget && (
                  <motion.div
                    className="absolute inset-0 pointer-events-none"
                    style={{ background: 'linear-gradient(105deg, transparent 35%, rgba(255,255,255,0.14) 50%, transparent 65%)' }}
                    initial={{ x: '-100%' }}
                    whileHover={{ x: '100%' }}
                    transition={{ duration: 0.5 }}
                  />
                )}
                <span className="relative flex items-center gap-2">
                  {loading
                    ? <>
                        <motion.div
                          className="w-4 h-4 border-2 rounded-full"
                          style={{ borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }}
                          animate={{ rotate: 360 }}
                          transition={{ duration: 0.7, repeat: Infinity, ease: 'linear' }}
                        />
                        Submitting…
                      </>
                    : <><Send className="w-4 h-4" /> Submit for Approval</>
                  }
                </span>
              </motion.button>

              {/* Reset */}
              <motion.button
                type="button"
                onClick={handleReset}
                className="flex items-center gap-1.5 px-4 py-3 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: 'rgba(255,255,255,0.04)',
                  color: tk.textSec,
                  border: `1px solid ${tk.cardBorder}`,
                }}
                whileHover={{ scale: 1.02, color: '#fff' }}
                whileTap={{ scale: 0.98 }}
              >
                <RotateCcw className="w-4 h-4" /> Reset
              </motion.button>
            </div>
          </form>
        </div>
      </div>

      {/* Confirmation Dialog */}
      <ConfirmDialog
        isOpen={confirmDialog.isOpen}
        onClose={() => setConfirmDialog({ ...confirmDialog, isOpen: false })}
        onConfirm={confirmDialog.onConfirm}
        title={confirmDialog.title}
        message={confirmDialog.message}
        type={confirmDialog.type}
        confirmText="Yes, Continue"
        cancelText="Cancel"
      />
    </>
  )
}

// ── Payment types fetcher ──────────────────────────────────────────────────
// Tier-aware. Accepts an optional `scopedIds` set so a dept/faculty
// exec sees every payment type in their subtree (not just their
// primary class). Caller passes `null` to skip the group filter
// entirely (org-tier scanner). When `scopedIds` is undefined we fall
// back to the legacy "current class only" behavior so old call sites
// keep working — but in this file the new in-component caller always
// supplies the set.
async function fetchPaymentTypes(ownedScope?: OwnedTierScope) {
  const { supabase } = await import('@/config/supabase')
  const scope = getOrgScope()
  let q = supabase.from('payment_types').select('id, title, amount').order('title')
  if (scope) {
    q = q.eq('organization_id', scope.orgId)
    if (ownedScope === undefined) {
      // Legacy path — pin to caller's primary class.
      q = q.eq('group_id', scope.groupId)
    } else {
      // Own-tier path — only the dues this exact tier created, so a
      // dept exec funds dept expenses from dept dues, never a class's.
      q = applyOwnedTierScope(q, ownedScope)
    }
  }
  const { data, error } = await q
  if (error) throw error
  return data || []
}