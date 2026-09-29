import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { isCloudConfigured, SUPABASE_ANON_KEY, SUPABASE_URL } from './env'

export const supabase: SupabaseClient | null = isCloudConfigured
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null
