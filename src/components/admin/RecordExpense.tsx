import React, { useState, useEffect } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import FileUploader from '@/components/ui/FileUploader'
import CustomButton from '@/components/ui/CustomButton'
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

  useEffect(() => {
    async function loadData() {
      try {
        const [cats, types] = await Promise.all([
          fetchExpenseCategories(),
          fetchPaymentTypes()
        ])
        console.log('📦 Loaded categories:', cats)
        console.log('💰 Loaded payment types:', types)
        setCategories(cats)
        setPaymentTypes(types)
        if (cats.length > 0) setCategoryId(cats[0].id)
      } catch (err) {
        console.error('❌ Failed to load categories/payment types:', err)
        showError('Failed to load categories. Please check console.')
      } finally {
        setLoadingData(false)
      }
    }
    loadData()
  }, [showError])

  async function handleSubmit(e: React.FormEvent) {
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
        funded_by: fundedBy || undefined,
        amount: parsed,
        expense_date: date,
        receiptFile: file,
        recorded_by: adminId,
      })
      setMessage('Expense recorded successfully (pending approval)')
      success('Expense submitted for approval')
      setTitle('')
      setDescription('')
      setAmount('')
      setFile(null)
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Expense Title *" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Arduino Kits Purchase" required />

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: colors.textPrimary }}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500" placeholder="Detailed description of the expense..." />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-white mb-2">Category *</label>
              <div className="relative">
                <select 
                  value={categoryId} 
                  onChange={(e) => setCategoryId(e.target.value)} 
                  className="w-full px-4 py-3 rounded-xl border text-white appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-500" 
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,104,3,0.2)' }}
                  required
                  disabled={loadingData}
                >
                  {loadingData ? (
                    <option style={{ background: '#1a1a1a', color: 'white' }}>Loading categories...</option>
                  ) : categories.length === 0 ? (
                    <option style={{ background: '#1a1a1a', color: 'white' }}>No categories available</option>
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

            <div>
              <label className="block text-sm font-medium text-white mb-2">Funded By (Optional)</label>
              <div className="relative">
                <select 
                  value={fundedBy} 
                  onChange={(e) => setFundedBy(e.target.value)} 
                  className="w-full px-4 py-3 rounded-xl border text-white appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-500" 
                  style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,104,3,0.2)' }}
                  disabled={loadingData}
                >
                  <option value="" style={{ background: '#1a1a1a', color: 'white' }}>-- Select Fund Source --</option>
                  {paymentTypes.map((pt) => (
                    <option key={pt.id} value={pt.id} style={{ background: '#1a1a1a', color: 'white' }}>
                      {pt.title} (₦{pt.amount})
                    </option>
                  ))}
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="#FF6803" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
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
              onFileSelect={(f) => setFile((f as File) ?? null)}
              accept="image/*,application/pdf"
              maxSize={5 * 1024 * 1024}
              label="Upload Receipt (Optional)"
              description="JPG, PNG or PDF (Max 5MB)"
              showPreview={true}
            />
          </div>

          <div className="flex items-center gap-3">
            <CustomButton type="submit" variant="primary" loading={loading || loadingData}>
              Submit for Approval
            </CustomButton>
            <CustomButton type="button" variant="secondary" onClick={() => { setTitle(''); setDescription(''); setAmount(''); setFile(null); }}>
              Reset
            </CustomButton>
          </div>

          {message && <div className="mt-2 text-sm" style={{ color: colors.textSecondary }}>{message}</div>}
        </form>
      </div>
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
