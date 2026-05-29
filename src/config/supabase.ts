import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.')
}

// Custom-auth session token. Minted server-side at /api/auth/login and stored
// here; sent on every Supabase request so Postgres RLS sees auth.uid() =
// the member's id. Returns null (→ anon) when there is no valid session.
const JWT_STORAGE_KEY = 'pvx_jwt'

export function getStoredAccessToken(): string | null {
  try {
    const token = localStorage.getItem(JWT_STORAGE_KEY)
    if (!token) return null
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = JSON.parse(atob(parts[1].replace(/-/g, '+').replace(/_/g, '/')))
    // Treat an expired token as no session so requests fall back to anon
    if (typeof payload.exp === 'number' && payload.exp * 1000 <= Date.now()) return null
    return token
  } catch {
    return null
  }
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  // When accessToken is provided, supabase-js uses it for every request and
  // disables its own GoTrue session management (we run custom auth instead).
  accessToken: async () => getStoredAccessToken(),
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// Storage bucket names
export const STORAGE_BUCKETS = {
  RECEIPTS: 'payment-receipts',
  PROFILE_IMAGES: 'profile-images',
  EXPENSE_RECEIPTS: 'expense-receipts',
  EVENT_COVERS: 'event-covers',
}

// Helper to get public URL for uploaded files
export const getPublicUrl = (bucket: string, path: string) => {
  // Remove any existing full URLs or bucket paths from the path
  let cleanPath = path
    .replace(/^https?:\/\/[^/]+\/storage\/v1\/object\/public\/[^/]+\//, '')
    .replace(/^.*\/expense-receipts\//, '')
    .replace(/^.*\/receipts\//, '')
    .replace(/^.*\/profile-images\//, '')
  
  // Decode any URL encoding
  try {
    cleanPath = decodeURIComponent(cleanPath)
  } catch (e) {
    console.warn('Failed to decode path:', e)
  }
  
  const { data } = supabase.storage.from(bucket).getPublicUrl(cleanPath)
  return data.publicUrl
}
