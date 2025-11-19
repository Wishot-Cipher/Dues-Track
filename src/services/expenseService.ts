import { supabase, STORAGE_BUCKETS, getPublicUrl } from '../config/supabase'
import type { PostgrestError } from '@supabase/supabase-js'

export interface CreateExpensePayload {
  payment_type_id?: string
  title: string
  description?: string
  category?: string
  amount: number
  expense_date?: string
  recorded_by?: string
  receiptFile?: File | null
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
      amount: number
      expense_date: string
      recorded_by: string | null
      receipt_url: string | null
    }

    const insertPayload: ExpenseInsert = {
      payment_type_id: payload.payment_type_id ?? null,
      title: payload.title,
      description: payload.description ?? null,
      category: payload.category ?? null,
      amount: payload.amount,
      expense_date: payload.expense_date ?? new Date().toISOString(),
      recorded_by: payload.recorded_by ?? null,
      receipt_url,
    }

    const { data, error } = await supabase.from('expenses').insert([insertPayload]).select().single()

    if (error) throw error
    return data
  } catch (err) {
    const e = err as PostgrestError | Error
    throw e
  }
}

export async function fetchExpenses(limit = 50) {
  const { data, error } = await supabase.from('expenses').select('*').order('expense_date', { ascending: false }).limit(limit)
  if (error) throw error
  return data
}
