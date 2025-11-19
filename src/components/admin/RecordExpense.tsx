import React, { useState } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import Input from '@/components/ui/Input'
import FileUploader from '@/components/ui/FileUploader'
import CustomButton from '@/components/ui/CustomButton'
import { colors } from '@/config/colors'
import { useExpenses } from '@/hooks/useExpenses'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'

export default function RecordExpense() {
  const { addExpense, loading } = useExpenses()
  const { hasPermission, user } = useAuth()
  const { success, error: showError } = useToast()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('projects')
  const [amount, setAmount] = useState('')
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [file, setFile] = useState<File | null>(null)
  const [message, setMessage] = useState<string | null>(null)

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
      // When creating an expense, recorded_by must be the admins.id for the
      // current authenticated user so it satisfies the RLS policy defined
      // in the database. We read the admin row from `user.admins` which is
      // fetched during login.
      const adminId = user?.admins && Array.isArray(user.admins) && user.admins.length > 0 ? user.admins[0].id : undefined

      if (!adminId) {
        const useServer = import.meta.env.VITE_USE_SERVER_UPLOAD === 'true'
        const serverHint = useServer ? 'Server uploads are enabled; ensure server env is configured.' : 'Enable server uploads by setting VITE_USE_SERVER_UPLOAD=true and configure SUPABASE_SERVICE_ROLE_KEY.'
        const msg = `No admin record found for the current user. Cannot set recorded_by. ${serverHint}`
        setMessage(msg)
        showError(msg)
        return
      }

      await addExpense({
        title,
        description,
        category,
        amount: parsed,
        expense_date: date,
        receiptFile: file,
        recorded_by: adminId,
      })
      setMessage('Expense recorded successfully')
      success('Expense recorded')
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <Input label="Expense Title *" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="e.g., Arduino Kits Purchase" required />

          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: colors.textPrimary }}>Description</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="w-full px-4 py-3 rounded-xl bg-white/5 border border-white/10 text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-orange-500" />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-white mb-2">Category</label>
              <div className="relative">
                <select value={category} onChange={(e) => setCategory(e.target.value)} className="w-full px-4 py-3 rounded-xl border text-white appearance-none cursor-pointer transition-all focus:outline-none focus:ring-2 focus:ring-orange-500" style={{ background: 'rgba(255,255,255,0.05)', borderColor: 'rgba(255,104,3,0.2)' }}>
                  <option value="projects">📘 Projects</option>
                  <option value="semester_dues">🎓 Semester Dues</option>
                  <option value="books">📚 Books</option>
                  <option value="events">🎉 Events</option>
                  <option value="welfare">❤️ Welfare</option>
                  <option value="custom">📦 Custom</option>
                </select>
                <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
                    <path d="M5 7.5L10 12.5L15 7.5" stroke="#FF6803" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <Input label="Amount (₦) *" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="3500" required />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-center">
            <div>
              <Input label="Expense Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>

            <div>
              <FileUploader
                onFileSelect={(f) => setFile((f as File) ?? null)}
                accept="image/*,application/pdf"
                maxSize={5 * 1024 * 1024}
                label="Upload Receipt"
                description="JPG, PNG or PDF (Max 5MB)"
                showPreview={true}
              />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <CustomButton type="submit" variant="primary" loading={loading}>Record Expense</CustomButton>
            <CustomButton type="button" variant="secondary" onClick={() => { setTitle(''); setDescription(''); setAmount(''); setFile(null); }}>Reset</CustomButton>
          </div>

          {message && <div className="mt-2 text-sm" style={{ color: colors.textSecondary }}>{message}</div>}
        </form>
      </div>
    </GlassCard>
  )
}
