import React, { useState } from 'react'
import GlassCard from '@/components/ui/GlassCard'
import { colors, gradients } from '@/config/colors'
import { useExpenses } from '@/hooks/useExpenses'
import { useAuth } from '@/hooks/useAuth'
import { useToast } from '@/hooks/useToast'

interface Expense {
  id: string
  title: string
  description?: string
  category?: string
  amount?: number
  expense_date?: string
  receipt_url?: string
  status?: string
}

export default function ExpenseList() {
  const { expenses, loading, error } = useExpenses()
  const { hasPermission } = useAuth()
  const toast = useToast()
  const [selected, setSelected] = useState<Expense | null>(null)

  if (!hasPermission('can_manage_students') && !hasPermission('can_approve_payments')) {
    return (
      <GlassCard>
        <div className="text-white">
          <h2 className="text-lg font-semibold mb-2">Recent Expenses</h2>
          <p className="text-sm" style={{ color: colors.textSecondary }}>You do not have permission to view expenses.</p>
        </div>
      </GlassCard>
    )
  }

  return (
    <GlassCard className="p-4">
      <div className="text-white">
        <h2 className="text-lg font-semibold mb-3">Recent Expenses</h2>
        {loading && <div style={{ color: colors.textSecondary }}>Loading...</div>}
        {error && <div className="text-red-500">Failed to load expenses</div>}
        {!loading && expenses.length === 0 && <div className="text-sm" style={{ color: colors.textSecondary }}>No expenses recorded yet.</div>}

      <ul className="space-y-3 mt-3">
        {expenses.map((exp: Expense) => (
          <li key={exp.id} className="border rounded p-3" style={{ borderColor: colors.borderLight }}>
            <div className="flex justify-between items-start">
              <div>
                <div className="font-medium text-white">{exp.title}</div>
                <div className="text-sm" style={{ color: colors.textSecondary }}>{exp.category} • {exp.expense_date ? new Date(exp.expense_date).toLocaleDateString() : '—'}</div>
              </div>
              <div className="text-right flex flex-col items-end gap-2">
                <div className="font-semibold text-white">₦{Number(exp.amount || 0).toLocaleString()}</div>
                <div className="flex gap-2">
                  {exp.receipt_url && (
                    <a className="text-sm" style={{ color: colors.primary }} href={exp.receipt_url} target="_blank" rel="noreferrer">View</a>
                  )}
                  <button
                    onClick={() => setSelected(exp)}
                    className="text-sm px-2 py-1 rounded"
                    style={{ border: colors.borderLight, color: colors.textPrimary }}
                  >
                    Details
                  </button>
                </div>
              </div>
            </div>
            {exp.description && <div className="mt-2 text-sm" style={{ color: colors.textSecondary }}>{exp.description}</div>}
          </li>
        ))}
      </ul>

      {/* Expense Detail Modal */}
      {selected && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60 p-4">
          <div className="max-w-2xl w-full">
            <GlassCard>
              <div className="p-1">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-lg font-semibold text-white">{selected.title}</h3>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => { navigator.clipboard?.writeText(selected.receipt_url || ''); toast.success('Receipt URL copied'); }}
                      className="px-3 py-1 text-sm rounded"
                      style={{ border: colors.borderLight }}
                    >
                      Copy URL
                    </button>
                    <button onClick={() => setSelected(null)} className="px-3 py-1 text-sm rounded" style={{ border: colors.borderLight }}>Close</button>
                  </div>
                </div>

                <div className="p-3 bg-transparent">
                  <div className="grid grid-cols-2 gap-4 mb-3">
                    <div>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>Category</p>
                      <p className="font-medium text-white">{selected.category}</p>
                    </div>
                    <div>
                      <p className="text-sm" style={{ color: colors.textSecondary }}>Amount</p>
                      <p className="font-medium text-white">₦{Number(selected.amount || 0).toLocaleString()}</p>
                    </div>
                  </div>

                  <div className="mb-3">
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Date</p>
                    <p className="font-medium text-white">{selected.expense_date ? new Date(selected.expense_date).toLocaleString() : '—'}</p>
                  </div>

                  <div className="mb-3">
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Description</p>
                    <p className="font-medium text-white whitespace-pre-wrap">{selected.description || '—'}</p>
                  </div>

                  <div className="mb-3">
                    <p className="text-sm" style={{ color: colors.textSecondary }}>Approval Status</p>
                    <p className="font-medium text-white">{selected.status || 'unreviewed'}</p>
                  </div>

                  {selected.receipt_url && (
                    <div>
                      <p className="text-sm mb-2" style={{ color: colors.textSecondary }}>Receipt</p>
                      {selected.receipt_url.endsWith('.pdf') ? (
                        <a href={selected.receipt_url} target="_blank" rel="noreferrer" className="inline-block px-4 py-2" style={{ background: gradients.primary, color: 'white', borderRadius: 8 }}>Open PDF</a>
                      ) : (
                        <img src={selected.receipt_url} alt="receipt" className="max-h-96 w-full object-contain rounded" />
                      )}
                    </div>
                  )}
                </div>
              </div>
            </GlassCard>
          </div>
        </div>
      )}
      </div>
    </GlassCard>
  )
}
