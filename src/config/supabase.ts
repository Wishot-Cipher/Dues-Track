import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables. Please check your .env.local file.')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
  realtime: {
    params: {
      eventsPerSecond: 10,
    },
  },
})

// Storage bucket names
export const STORAGE_BUCKETS = {
  RECEIPTS: 'receipts',
  PROFILE_IMAGES: 'profile-images',
  EXPENSE_RECEIPTS: 'expense-receipts',
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
