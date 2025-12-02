import { supabase, STORAGE_BUCKETS, getPublicUrl } from '../config/supabase'
import type { PostgrestError } from '@supabase/supabase-js'

export interface Expense {
  id: string
  payment_type_id: string | null
  title: string
  description: string | null
  category: string | null
  category_id: string | null
  funded_by: string | null
  amount: number
  expense_date: string
  recorded_by: string | null
  receipt_url: string | null
  status: 'pending' | 'approved' | 'rejected'
  approved_by: string | null
  approved_at: string | null
  rejection_reason: string | null
  created_at: string
  updated_at: string | null
}

export interface ExpenseCategory {
  id: string
  name: string
  description: string | null
  icon: string | null
  color: string | null
  is_active: boolean
  created_at: string
  created_by: string | null
}

export interface CreateExpensePayload {
  payment_type_id?: string
  title: string
  description?: string
  category?: string
  category_id?: string
  funded_by?: string
  amount: number
  expense_date?: string
  recorded_by?: string
  receiptFile?: File | null
}

export interface ApproveExpensePayload {
  expense_id: string
  approved: boolean
  reason?: string
}

export async function uploadExpenseReceipt(file: File, key: string) {
  const bucket = STORAGE_BUCKETS.EXPENSE_RECEIPTS

  const path = `${key}`
  try {
    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, file, { cacheControl: '3600', upsert: false })
      // If the initial upload failed, try uploading into an "expense-receipts" folder
      if (error) {
        try {
          const altPath = `expense-receipts/${path}`
          const { error: altError } = await supabase.storage
            .from(bucket)
            .upload(altPath, file, { cacheControl: '3600', upsert: false })

          if (!altError) {
            return getPublicUrl(bucket, altPath)
          }
        } catch {
          // ignore and fall through to throw the original error below
        }
      }
    if (error) throw error

    return getPublicUrl(bucket, path)
  } catch (err) {
    // Provide a clearer error with server details when possible. Common
    // causes: bucket missing, insufficient auth permissions for uploads,
    // file size/content-type issues, or duplicate file when upsert=false.
    type PostgrestLike = { message?: string; error?: string; status?: number; status_code?: number }
    const maybe = err as unknown as PostgrestLike
    const serverMessage = maybe?.message ?? maybe?.error ?? null
    const status = maybe?.status ?? maybe?.status_code ?? null

    if (typeof serverMessage === 'string') {
      const lower = serverMessage.toLowerCase()
      if (lower.includes('bucket') || lower.includes('no such bucket') || lower.includes('not found')) {
        throw new Error(`Storage bucket "${bucket}" not found. Create this bucket in Supabase storage or update STORAGE_BUCKETS.EXPENSE_RECEIPTS in src/config/supabase.ts`)
      }

      // Common RLS error when attempting to insert into storage.objects
      if (lower.includes('row-level') || lower.includes('row level') || lower.includes('violates row-level')) {
        // Do NOT fallback to the payment bucket automatically — fail loudly so
        // uploads end up in `expense-receipts` (your intended folder). The
        // recommended fixes are:
        // 1. Recreate/adjust storage policies for `expense-receipts` so the
        //    authenticated admin user can INSERT into bucket_id='expense-receipts'.
        // 2. Or enable server-side uploads (set SUPABASE_SERVICE_ROLE_KEY and
        //    VITE_USE_SERVER_UPLOAD=true) so uploads are performed by the
        //    server with the service role key and bypass RLS.
        throw new Error(`Storage upload blocked by RLS for bucket "${bucket}". Fix storage policies for bucket_id='${bucket}' or enable server uploads (SUPABASE_SERVICE_ROLE_KEY + VITE_USE_SERVER_UPLOAD=true). Original message: ${serverMessage}${status ? ` (status=${status})` : ''}`)
      }

      const composed = `Storage upload failed for bucket "${bucket}": ${serverMessage}${status ? ` (status=${status})` : ''}`
      throw new Error(composed)
    }

    // Fallback: stringify the full error object for debugging
    throw new Error(`Storage upload failed: ${JSON.stringify(err)}`)
  }
}

export async function createExpense(payload: CreateExpensePayload) {
  try {
    let receipt_url: string | null = null

    // If configured to use the server upload endpoint, POST to /api/create-expense
    // which uses the Supabase service_role key to perform storage uploads and
    // DB inserts (bypassing client-side RLS issues). This is recommended for
    // production to avoid exposing privileged operations to the client.
    const useServer = import.meta.env.VITE_USE_SERVER_UPLOAD === 'true'

    if (useServer) {
      // Convert file to base64 if present
      let receipt: { name: string; type: string; base64: string } | null = null
      if (payload.receiptFile) {
        receipt = {
          name: payload.receiptFile.name,
          type: payload.receiptFile.type || 'application/octet-stream',
          base64: await new Promise<string>((resolve, reject) => {
            const reader = new FileReader()
            reader.onload = () => {
              const result = reader.result as string
              // result is like 'data:<type>;base64,<data>' if using readAsDataURL,
              // but we'll use readAsArrayBuffer then convert to base64 for smaller memory
              try {
                // If readAsDataURL was used, strip prefix
                if (result.startsWith('data:')) {
                  const comma = result.indexOf(',')
                  resolve(result.slice(comma + 1))
                } else {
                  // Fallback
                  resolve(btoa(result))
                }
              } catch (e) {
                reject(e)
              }
            }
            reader.onerror = () => reject(reader.error)
            reader.readAsDataURL(payload.receiptFile as Blob)
          }),
        }
      }

      const body = {
        payment_type_id: payload.payment_type_id ?? null,
        title: payload.title,
        description: payload.description ?? null,
        category: payload.category ?? null,
        amount: payload.amount,
        expense_date: payload.expense_date ?? new Date().toISOString(),
        recorded_by: payload.recorded_by ?? null,
        receipt,
      }

      const res = await fetch('/api/create-expense', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })

      if (!res.ok) {
        const text = await res.text()
        throw new Error(`Server upload failed: ${res.status} ${text}`)
      }

      const data = await res.json()
      return data
    }

    // Default (client) flow: upload receipt directly from client then insert
    if (payload.receiptFile) {
      const key = `expense_${Date.now()}_${payload.receiptFile.name}`
      receipt_url = await uploadExpenseReceipt(payload.receiptFile, key)
    }

    type ExpenseInsert = {
      payment_type_id: string | null
      title: string
      description: string | null
      category: string | null
      category_id: string | null
      funded_by: string | null
      amount: number
      expense_date: string
      recorded_by: string | null
      receipt_url: string | null
      status: string
    }

    const insertPayload: ExpenseInsert = {
      payment_type_id: payload.payment_type_id ?? null,
      title: payload.title,
      description: payload.description ?? null,
      category: payload.category ?? null,
      category_id: payload.category_id ?? null,
      funded_by: payload.funded_by ?? null,
      amount: payload.amount,
      expense_date: payload.expense_date ?? new Date().toISOString(),
      recorded_by: payload.recorded_by ?? null,
      receipt_url,
      status: 'pending', // New expenses start as pending
    }

    const { data, error } = await supabase.from('expenses').insert([insertPayload]).select().single()

    if (error) throw error
    return data
  } catch (err) {
    const e = err as PostgrestError | Error
    throw e
  }
}

// Fetch expenses with optional status filter
export async function fetchExpenses(limit = 50, status?: 'pending' | 'approved' | 'rejected') {
  let query = supabase
    .from('expenses')
    .select(`
      *,
      category:expense_categories(id, name, icon, color)
    `)
    .order('expense_date', { ascending: false })
    .limit(limit)

  if (status) {
    query = query.eq('status', status)
  }

  const { data, error } = await query
  if (error) throw error
  return data
}

// Fetch expense categories
export async function fetchExpenseCategories(): Promise<ExpenseCategory[]> {
  const { data, error } = await supabase
    .from('expense_categories')
    .select('*')
    .eq('is_active', true)
    .order('name')

  if (error) throw error
  return data || []
}

// Approve or reject an expense
export async function approveExpense(payload: ApproveExpensePayload & { admin_id: string }) {
  const { data, error } = await supabase.rpc('approve_expense', {
    p_expense_id: payload.expense_id,
    p_approved: payload.approved,
    p_admin_id: payload.admin_id,
    p_reason: payload.reason || null,
  })

  if (error) throw error
  return data
}

// Update expense with audit trail
export async function updateExpense(
  expenseId: string,
  updates: {
    description: string
    amount: number
    category_id: string | null
    funded_by: string | null
    reason: string
  }
) {
  const { data, error } = await supabase.rpc('update_expense_with_audit', {
    p_expense_id: expenseId,
    p_description: updates.description,
    p_amount: updates.amount,
    p_category_id: updates.category_id,
    p_funded_by: updates.funded_by,
    p_reason: updates.reason,
  })

  if (error) throw error
  return data
}

// Get approved expenses summary (for student transparency)
export async function getApprovedExpensesSummary(startDate?: string, endDate?: string) {
  const { data, error } = await supabase.rpc('get_approved_expenses_summary', {
    p_start_date: startDate || null,
    p_end_date: endDate || null,
  })

  if (error) throw error
  return data?.[0] || { total_spent: 0, total_count: 0, by_category: [], by_month: [], recent_expenses: [] }
}

// Get budget health
export async function getBudgetHealth() {
  const { data, error } = await supabase.rpc('get_budget_health')

  if (error) throw error
  return data || []
}

// Get expense audit log
export async function getExpenseAuditLog(expenseId: string) {
  const { data, error } = await supabase
    .from('expense_audit_log')
    .select(`
      *,
      admin:admins!expense_audit_log_performed_by_fkey(id, name)
    `)
    .eq('expense_id', expenseId)
    .order('created_at', { ascending: false })

  if (error) throw error
  return data || []
}
