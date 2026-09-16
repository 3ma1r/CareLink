import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from './database.types'

const url = import.meta.env.VITE_SUPABASE_URL?.trim()
const publishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim()

export function validateSupabaseConfiguration(projectUrl?: string, key?: string) {
  return !projectUrl || !key
      ? 'CareLink is not configured. Add VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY to a local .env file, then restart the app.'
      : null
}

export const supabaseConfigurationError =
  validateSupabaseConfiguration(url, publishableKey)

export const supabase: SupabaseClient<Database> | null =
  url && publishableKey
    ? createClient<Database>(url, publishableKey, {
        auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
      })
    : null
