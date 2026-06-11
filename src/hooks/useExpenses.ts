import { useState, useEffect, useCallback } from 'react'
import type { CreateExpensePayload, Expense } from '../services/expenseService'
import { createExpense, fetchExpenses } from '../services/expenseService'
import type { OwnedTierScope } from '../utils/scopedGroups'

export function useExpenses(
  status?: 'pending' | 'approved' | 'rejected',
  ownedScope?: OwnedTierScope,
) {
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  // Serialize the own-tier scope so the load callback only re-fires
  // when the tier actually changes, not on every render.
  const scopeKey = ownedScope
    ? ownedScope.mode === 'group' ? `group:${ownedScope.groupId}` : ownedScope.mode
    : 'undefined'

  const load = useCallback(async (limit = 50) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchExpenses(limit, status, ownedScope)
      setExpenses(data ?? [])
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, scopeKey])

  useEffect(() => {
    load()
  }, [load])

  
  const addExpense = useCallback(async (payload: CreateExpensePayload) => {
    setLoading(true)
    setError(null)
    try {
      const created = await createExpense(payload)
      setExpenses((prev) => [created, ...prev])
      return created
    } catch (err) {
      setError(err as Error)
      throw err
    } finally {
      setLoading(false)
    }
  }, [])

  return { expenses, loading, error, reload: load, addExpense }
}
