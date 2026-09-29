import type { Session } from '@supabase/supabase-js'
import { supabase } from '../../lib/supabaseClient'
import { isCloudConfigured } from '../../lib/env'

export class AuthNotConfiguredError extends Error {
  constructor() {
    super('Sign-in is not available yet: this deployment has no Supabase project connected.')
    this.name = 'AuthNotConfiguredError'
  }
}

function requireSupabase() {
  if (!supabase) throw new AuthNotConfiguredError()
  return supabase
}

/** Sends a 6-digit OTP / magic link to the given email. User taps the link or types the code. */
export async function signInWithEmail(email: string): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  })
  if (error) throw error
}

export async function verifyEmailOtp(email: string, token: string): Promise<Session | null> {
  const client = requireSupabase()
  const { data, error } = await client.auth.verifyOtp({ email, token, type: 'email' })
  if (error) throw error
  return data.session
}

/**
 * Apple sign-in needs a Sign in with Apple Services ID + key configured in both
 * the Apple Developer portal and the Supabase Auth providers page before this
 * will work — see README "Configurar Apple" for the exact steps. Until then this
 * throws a clear, catchable error instead of silently failing.
 */
export async function signInWithApple(): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.auth.signInWithOAuth({ provider: 'apple' })
  if (error) throw error
}

/**
 * Google sign-in needs an OAuth Client ID/Secret from Google Cloud Console
 * configured in the Supabase Auth providers page — see README "Configurar
 * Google". Until then this throws a clear, catchable error.
 */
export async function signInWithGoogle(): Promise<void> {
  const client = requireSupabase()
  const { error } = await client.auth.signInWithOAuth({ provider: 'google' })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthStateChange(callback: (session: Session | null) => void): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session))
  return () => data.subscription.unsubscribe()
}

export { isCloudConfigured }
