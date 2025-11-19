import { useState, useEffect, useCallback } from 'react'
import type { CreateExpensePayload } from '../services/expenseService'
import { createExpense, fetchExpenses } from '../services/expenseService'

export function useExpenses() {
  const [expenses, setExpenses] = useState<any[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const load = useCallback(async (limit = 50) => {
    setLoading(true)
    setError(null)
    try {
      const data = await fetchExpenses(limit)
      setExpenses(data ?? [])
    } catch (err) {
      setError(err as Error)
    } finally {
      setLoading(false)
    }
  }, [])

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
