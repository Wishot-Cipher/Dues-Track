import React, { useState, useEffect } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import FileUploader from '@/components/ui/FileUploader'
import CustomButton from '@/components/ui/CustomButton'
import ConfirmDialog from '@/components/ui/ConfirmDialog'
import { colors } from '@/config/colors'
import { useExpenses } from '@/hooks/useExpenses'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'
import { fetchExpenseCategories, type ExpenseCategory } from '@/services/expenseService'
import * as LucideIcons from 'lucide-react'

interface PaymentType {
  id: string
  title: string
  amount: number
}

// Helper to render category icon (Lucide icon name or emoji)
function CategoryIcon({ iconName, className = 'w-4 h-4' }: { iconName: string | null; className?: string }) {
  if (!iconName) return <span>📦</span>
  
  // Check if it's a Lucide icon name
  const IconComponent = (LucideIcons as unknown as Record<string, React.ComponentType<{ className?: string }>>)[iconName]
  if (IconComponent) {
    return <IconComponent className={className} />
  }
  
  // Otherwise treat as emoji
  return <span>{iconName}</span>
}

export default function RecordExpense() {
  const { addExpense, loading } = useExpenses()
  const { hasPermission, user } = useAuth()
  const { success, error: showError } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [fundedBy, setFundedBy] = useState('')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [categories, setCategories] = useState<ExpenseCategory[]>([])
  const [paymentTypes, setPaymentTypes] = useState<PaymentType[]>([])
  const [loadingData, setLoadingData] = useState(true)
  const [availableBalance, setAvailableBalance] = useState<number | null>(null)
  const [paymentTypeBalances, setPaymentTypeBalances] = useState<Map<string, { collected: number; spent: number; available: number }>>(new Map())
  const [selectedCategoryBalance, setSelectedCategoryBalance] = useState<number>(0)
  const [warningMessage, setWarningMessage] = useState<string | null>(null)
  const [fileUploadKey, setFileUploadKey] = useState(0)
  const [confirmDialog, setConfirmDialog] = useState<{
    isOpen: boolean
    title: string
    message: string
    type: 'info' | 'warning' | 'danger' | 'success'
    onConfirm: () => void
  }>({ isOpen: false, title: '', message: '', type: 'info', onConfirm: () => {} })

  useEffect(() => {
    async function loadData() {
      try {
        const [cats, types] = await Promise.all([
          fetchExpenseCategories(),
          fetchPaymentTypes()
        ])
        setCategories(cats)
        setPaymentTypes(types)
        // Don't set defaults - let user choose explicitly
        
        // Fetch available balance
        await fetchAvailableBalance()
      } catch (err) {
        console.error('❌ Failed to load categories/payment types:', err)
        showError('Failed to load categories. Please check console.')
      } finally {
        setLoadingData(false)
      }
    }
    loadData()
  }, [showError])

  async function fetchAvailableBalance() {
    try {
      const { supabase } = await import('@/config/supabase')
      
      // Get payments with payment type details (approved only)
      const { data: paymentsData } = await supabase
        .from('payments')
        .select(`
          amount,
          payment_type_id,
          payment_types (
            id,
            title,
            category
          )
        `)
        .eq('status', 'approved')
        .not('transaction_ref', 'like', 'WAIVED-%')
      
      // Get expenses with payment type details (approved only)
      const { data: expensesData } = await supabase
        .from('expenses')
        .select(`
          amount,
          funded_by,
          payment_types:funded_by (
            id,
            title,
            category
          )
        `)
        .eq('status', 'approved')
      
      // Calculate category-specific balances
      const paymentTypeMap = new Map<string, { collected: number; spent: number; available: number }>()
      
      // Process payments
      paymentsData?.forEach((payment: { amount?: number | string; payment_type_id?: string; payment_types?: { id?: string; title?: string; category?: string }[] | { id?: string; title?: string; category?: string } | null }) => {
        const amount = Number(payment.amount) || 0
        const paymentType = Array.isArray(payment.payment_types) ? payment.payment_types[0] : payment.payment_types
        const paymentTypeId = paymentType?.id || payment.payment_type_id
        
        // Update payment type totals
        if (paymentTypeId) {
          if (!paymentTypeMap.has(paymentTypeId)) {
            paymentTypeMap.set(paymentTypeId, { collected: 0, spent: 0, available: 0 })
          }
          const ptData = paymentTypeMap.get(paymentTypeId)!
          ptData.collected += amount
        }
      })
      
      // Process expenses
      expensesData?.forEach((expense: { amount?: number | string; funded_by?: string; payment_types?: { id?: string; title?: string; category?: string }[] | { id?: string; title?: string; category?: string } | null }) => {
        const amount = Number(expense.amount) || 0
        const paymentType = Array.isArray(expense.payment_types) ? expense.payment_types[0] : expense.payment_types
        const paymentTypeId = paymentType?.id || expense.funded_by
        
        // Update payment type totals
        if (paymentTypeId) {
          if (!paymentTypeMap.has(paymentTypeId)) {
            paymentTypeMap.set(paymentTypeId, { collected: 0, spent: 0, available: 0 })
          }
          const ptData = paymentTypeMap.get(paymentTypeId)!
          ptData.spent += amount
        }
      })
      
      // Calculate available balances
      paymentTypeMap.forEach((value) => {
        value.available = value.collected - value.spent
      })
      
      setPaymentTypeBalances(paymentTypeMap)
      
      // Calculate total net balance
      const totalCollected = paymentsData?.reduce((sum, p) => sum + (Number(p.amount) || 0), 0) || 0
      const totalExpenses = expensesData?.reduce((sum, e) => sum + (Number(e.amount) || 0), 0) || 0
      const netBalance = totalCollected - totalExpenses
      setAvailableBalance(netBalance)
    } catch (err) {
      console.error('Failed to fetch available balance:', err)
      setAvailableBalance(null)
    }
  }

  // Update selected category balance when fundedBy changes (fundedBy is now required)
  useEffect(() => {
    if (fundedBy) {
      const balance = paymentTypeBalances.get(fundedBy)
      setSelectedCategoryBalance(balance?.available || 0)
    } else {
      setSelectedCategoryBalance(0)
    }
  }, [fundedBy, paymentTypeBalances])

  // Validate amount against available balance
  useEffect(() => {
    const parsed = Number(amount.toString().replace(/[^0-9.-]+/g, ''))
    if (parsed > 0 && selectedCategoryBalance !== null) {
      if (parsed > selectedCategoryBalance) {
        setWarningMessage(`⚠️ Warning: Amount exceeds available balance of ₦${selectedCategoryBalance.toLocaleString()}`)
      } else if (parsed > selectedCategoryBalance * 0.8) {
        setWarningMessage(`⚠️ Notice: This will use ${Math.round((parsed / selectedCategoryBalance) * 100)}% of available balance`)
      } else {
        setWarningMessage(null)
      }
    } else {
      setWarningMessage(null)
    }
  }, [amount, selectedCategoryBalance])

  async function handleSubmit(e: React.FormEvent, bypassConfirmation = false) {
    e.preventDefault()
    setMessage(null)

    const parsed = Number(amount.toString().replace(/[^0-9.-]+/g, ''))
    if (!hasPermission('can_manage_students') && !hasPermission('can_create_payments')) {
      setMessage('You do not have permission to record expenses')
      showError('Unauthorized — admin only')
      return
    }

    if (!title || isNaN(parsed) || parsed <= 0) {
      setMessage('Please provide valid title and amount')
      showError('Please provide valid title and amount')
      return
    }

    if (!fundedBy) {
      setMessage('Please select which payment type to deduct from')
      showError('Payment type is required')
      return
    }

    // Validate against available balance
    if (selectedCategoryBalance !== null && parsed > selectedCategoryBalance) {
      const fundSource = fundedBy ? paymentTypes.find(pt => pt.id === fundedBy)?.title : 'this category'
      setMessage(`Insufficient funds in ${fundSource}. Available: ₦${selectedCategoryBalance.toLocaleString()}`)
      showError(`Cannot exceed available balance of ₦${selectedCategoryBalance.toLocaleString()}`)
      return
    }

    // Show confirmation for large expenses (> 50% of available balance)
    if (selectedCategoryBalance !== null && parsed > selectedCategoryBalance * 0.5 && !bypassConfirmation) {
      const percent = Math.round((parsed / selectedCategoryBalance) * 100)
      const confirmMessage = `This expense (₦${parsed.toLocaleString()}) will use ${percent}% of the available balance.\n\nDo you want to continue?`
      
      setConfirmDialog({
        isOpen: true,
        title: 'Large Expense Warning',
        message: confirmMessage,
        type: 'warning',
        onConfirm: () => {
          // Continue with submission after user confirms
          setTimeout(() => handleSubmit(e, true), 100)
        }
      })
      return
    }

    try {
      const adminId = user?.admins && Array.isArray(user.admins) && user.admins.length > 0 ? user.admins[0].id : undefined

      if (!adminId) {
        const useServer = import.meta.env.VITE_USE_SERVER_UPLOAD === 'true'
        const serverHint = useServer ? 'Server uploads are enabled; ensure server env is configured.' : 'Enable server uploads by setting VITE_USE_SERVER_UPLOAD=true and configure SUPABASE_SERVICE_ROLE_KEY.'
        const msg = `No admin record found for the current user. Cannot set recorded_by. ${serverHint}`
        setMessage(msg)
        showError(msg)
        return
      }

      // Get category name for backward compatibility
      const selectedCategory = categories.find(c => c.id === categoryId)
      const categoryName = selectedCategory?.name || 'Miscellaneous'

      await addExpense({
        title,
        description,
        category: categoryName,
        category_id: categoryId || undefined,
        funded_by: fundedBy, // This is now the payment_type_id (required)
        amount: parsed,
        expense_date: date,
        receiptFile: file,
        recorded_by: adminId,
      })
      setMessage('Expense recorded successfully (pending approval)')
      success('Expense submitted for approval')
      setTitle('')
      setDescription('')
      setCategoryId('')
      setFundedBy('')
      setAmount('')
      setFile(null)
      setWarningMessage(null)
      setFileUploadKey(prev => prev + 1) // Force FileUploader to reset
      // Refresh balance - note: pending expenses don't affect balance until approved
      await fetchAvailableBalance()
    } catch (err) {
      console.error(err)
      const messageText = err instanceof Error ? err.message : 'Failed to record expense'
      setMessage(messageText)
      if (typeof messageText === 'string' && messageText.toLowerCase().includes('storage bucket')) {
        showError(messageText)
      } else {
        showError('Failed to record expense')
      }
    }
  }

  if (!hasPermission('can_manage_students') && !hasPermission('can_create_payments')) {
    return (
      <GlassCard>
        <div className="text-white">
          <h3 className="text-lg font-semibold">Record Expense</h3>
          <p className="text-sm mt-2" style={{ color: colors.textSecondary }}>You need admin permissions to record expenses.</p>
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard className="p-6">
      <div className="text-white">
        <h2 className="text-xl font-bold text-white mb-3">Record Expense</h2>
        <p className="text-sm mb-4" style={{ color: colors.textSecondary }}>
          Submit a new expense for approval. All expenses require senior admin approval before becoming final.
        </p>

        {/* Available Balance Display */}
        {availableBalance !== null && (
          <div className="mb-4 p-4 rounded-xl border" style={{ 
            background: availableBalance >= 0 ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)', 
            borderColor: availableBalance >= 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)' 
          }}>
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium" style={{ color: colors.textSecondary }}>Available Balance (Net)</span>
              <span className="text-lg font-bold" style={{ color: availableBalance >= 0 ? '#22C55E' : '#EF4444' }}>
                ₦{availableBalance.toLocaleString()}
              </span>
            </div>
            <p className="text-xs mt-1" style={{ color: colors.textSecondary }}>
              Collected - Approved Expenses
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Expense Title *" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Arduino Kits Purchase" required />

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: colors.textPrimary }}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Detailed description of the expense..." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-white mb-2">Deduct From (Payment Type) *</label>
              <div className="relative">
                <select 
                  value={fundedBy} 
                  onChange={(e) => setFundedBy(e.target.value)} 
                  className="w-full px-4 py-3 rounded-xl border text-white appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-500" 
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,104,3,0.2)' }}
                  required
                  disabled={loadingData}
                >
                  <option value="" style={{ background: '#1a1a1a', color: 'white' }}>-- Select Payment Type --</option>
                  {paymentTypes.map((pt) => {
                    const balance = paymentTypeBalances.get(pt.id)
                    const availableAmount = balance?.available || 0
                    return (
                      <option key={pt.id} value={pt.id} style={{ background: '#1a1a1a', color: 'white' }}>
                        {pt.title} (Available: ₦{availableAmount.toLocaleString()})
                      </option>
                    )
                  })}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="#FF6803" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              {fundedBy && (() => {
                const balance = paymentTypeBalances.get(fundedBy)
                const selectedPaymentType = paymentTypes.find(pt => pt.id === fundedBy)
                if (!balance) return null
                const percentUsed = balance.collected > 0 ? (balance.spent / balance.collected) * 100 : 0
                return (
                  <div className="mt-2 px-3 py-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.05)', borderLeft: `3px solid ${colors.accentMint}` }}>
                    <div className="flex items-center justify-between mb-2 pb-2 border-b" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                      <span className="text-xs font-semibold" style={{ color: colors.accentMint }}>
                        Deducting from: {selectedPaymentType?.title}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span style={{ color: colors.textSecondary }}>Collected:</span>
                      <span style={{ color: colors.textPrimary }}>₦{balance.collected.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1">
                      <span style={{ color: colors.textSecondary }}>Spent:</span>
                      <span style={{ color: colors.statusFailed }}>₦{balance.spent.toLocaleString()}</span>
                    </div>
                    <div className="flex items-center justify-between text-xs mt-1 pt-1 border-t" style={{ borderColor: 'rgba(255,255,255,0.1)' }}>
                      <span style={{ color: colors.textSecondary }}>Available:</span>
                      <span className="font-bold" style={{ color: balance.available >= 0 ? colors.statusPaid : colors.statusFailed }}>
                        ₦{balance.available.toLocaleString()}
                      </span>
                    </div>
                    <div className="mt-2">
                      <div className="h-1.5 rounded-full overflow-hidden" style={{ background: 'rgba(255,255,255,0.1)' }}>
                        <div 
                          className="h-full transition-all duration-300"
                          style={{ 
                            width: `${Math.min(percentUsed, 100)}%`, 
                            background: percentUsed > 80 ? '#EF4444' : percentUsed > 50 ? '#FBBF24' : '#22C55E'
                          }}
                        />
                      </div>
                      <p className="text-xs mt-1 text-center" style={{ color: colors.textSecondary }}>
                        {percentUsed.toFixed(1)}% used
                      </p>
                    </div>
                  </div>
                )
              })()}
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">Expense Category (Optional)</label>
              <div className="relative">
                <select 
                  value={categoryId} 
                  onChange={(e) => setCategoryId(e.target.value)} 
                  className="w-full px-4 py-3 rounded-xl border text-white appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-500" 
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,104,3,0.2)' }}
                  disabled={loadingData}
                >
                  <option value="" style={{ background: '#1a1a1a', color: 'white' }}>-- Select Category --</option>
                  {loadingData ? (
                    <option style={{ background: '#1a1a1a', color: 'white' }}>Loading...</option>
                  ) : (
                    categories.map(cat => (
                      <option key={cat.id} value={cat.id} style={{ background: '#1a1a1a', color: 'white' }}>
                        {cat.name}
                      </option>
                    ))
                  )}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="#FF6803" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
              {categoryId && categories.length > 0 && (() => {
                const selected = categories.find(c => c.id === categoryId)
                if (!selected) return null
                return (
                  <div className="mt-2 flex items-center gap-2 px-3 py-2 rounded-lg" style={{ background: `${selected.color || colors.primary}15`, borderLeft: `3px solid ${selected.color || colors.primary}` }}>
                    <CategoryIcon iconName={selected.icon} className="w-4 h-4" />
                    <span className="text-sm" style={{ color: colors.textSecondary }}>{selected.description || selected.name}</span>
                  </div>
                )
              })()}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <Input label="Amount (₦) *" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="3500" required />
            </div>

            <div>
              <Input label="Expense Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          </div>

          <div>
            <FileUploader
              key={fileUploadKey}
              onFileSelect={(f) => setFile((f as File) ?? null)}
              accept="image/*,application/pdf"
              maxSize={5 * 1024 * 1024}
              label="Upload Receipt (Optional)"
              description="JPG, PNG or PDF (Max 5MB)"
              showPreview={true}
            />
          </div>

          {/* Warning Message */}
          {warningMessage && (
            <div className="p-3 rounded-xl border" style={{ 
              background: warningMessage.includes('exceeds') ? 'rgba(239, 68, 68, 0.1)' : 'rgba(251, 191, 36, 0.1)', 
              borderColor: warningMessage.includes('exceeds') ? 'rgba(239, 68, 68, 0.3)' : 'rgba(251, 191, 36, 0.3)' 
            }}>
              <p className="text-sm font-medium" style={{ color: warningMessage.includes('exceeds') ? '#EF4444' : '#FBBF24' }}>
                {warningMessage}
              </p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <CustomButton 
              type="submit" 
              variant="primary" 
              loading={loading || loadingData}
              disabled={(() => {
                const parsed = Number(amount.toString().replace(/[^0-9.-]+/g, ''))
                return parsed > 0 && selectedCategoryBalance !== null && parsed > selectedCategoryBalance
              })()}
            >
              Submit for Approval
            </CustomButton>
            <CustomButton type="button" variant="secondary" onClick={() => { 
              setTitle(''); 
              setDescription(''); 
              setCategoryId('');
              setFundedBy('');
              setAmount(''); 
              setFile(null); 
              setWarningMessage(null);
              setFileUploadKey(prev => prev + 1);
            }}>
              Reset
            </CustomButton>
          </div>

          {message && <div className="mt-2 text-sm" style={{ color: colors.textSecondary }}>{message}</div>}
        </form>
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
    </GlassCard>
  )
}

// Helper function to fetch payment types
async function fetchPaymentTypes() {
  const { supabase } = await import('@/config/supabase')
  const { data, error } = await supabase.from('payment_types').select('id, title, amount').order('title')
  if (error) throw error
  return data || []
}
