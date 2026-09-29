export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL ?? ''
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY ?? ''

/**
 * True once a Supabase project is wired up. When false, the whole app runs in
 * local "guest" mode against localStorage — see src/lib/localDb.ts. This lets
 * the UI be built, demoed, and tested without a backend, and lets a real
 * Supabase project be dropped in later without touching screen code (only the
 * adapters in each domain's service file change which backend they talk to).
 */
export const isCloudConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
