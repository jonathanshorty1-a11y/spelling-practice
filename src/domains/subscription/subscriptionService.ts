import type { DataMode } from '../../lib/dataMode'
import { loadLocalDb, newId, saveLocalDb } from '../../lib/localDb'
import { supabase } from '../../lib/supabaseClient'
import { subscriptionFromRow, type SubscriptionRow } from '../../lib/supabaseRows'
import { TRIAL_LENGTH_DAYS, type Subscription } from '../shared/types'
import { hasTrialExpired } from './entitlements'

function trialWindow(now = new Date()) {
  const start = now.toISOString()
  const end = new Date(now.getTime() + TRIAL_LENGTH_DAYS * 24 * 60 * 60 * 1000).toISOString()
  return { start, end }
}

/** Reads the subscription and, if a trial has silently expired, flips it to `free` first. */
export async function getSubscription(mode: DataMode, familyId: string): Promise<Subscription> {
  if (mode === 'local') {
    const db = loadLocalDb()
    let sub = db.subscription
    if (!sub) {
      sub = {
        id: newId(),
        familyId,
        status: 'guest',
        trialStartedAt: null,
        trialEndsAt: null,
        freeAnswersUsed: 0,
        freeAnswersLimit: 25,
        premiumStartedAt: null,
        premiumEndsAt: null,
        provider: null,
        providerCustomerId: null,
        providerSubscriptionId: null,
      }
      db.subscription = sub
      saveLocalDb(db)
    }
    if (hasTrialExpired(sub)) {
      sub = { ...sub, status: 'free' }
      db.subscription = sub
      saveLocalDb(db)
    }
    return sub
  }

  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('subscriptions').select('*').eq('family_id', familyId).single()
  if (error) throw error
  let sub = subscriptionFromRow(data as SubscriptionRow)
  if (hasTrialExpired(sub)) {
    const { data: updated, error: updateError } = await supabase
      .from('subscriptions')
      .update({ status: 'free' })
      .eq('family_id', familyId)
      .select('*')
      .single()
    if (updateError) throw updateError
    sub = subscriptionFromRow(updated as SubscriptionRow)
  }
  return sub
}

/** Called once, right after a guest migrates to a real account. */
export async function startTrial(mode: DataMode, familyId: string, now = new Date()): Promise<Subscription> {
  const { start, end } = trialWindow(now)

  if (mode === 'local') {
    const db = loadLocalDb()
    const sub: Subscription = {
      id: db.subscription?.id ?? newId(),
      familyId,
      status: 'trial',
      trialStartedAt: start,
      trialEndsAt: end,
      freeAnswersUsed: db.subscription?.freeAnswersUsed ?? 0,
      freeAnswersLimit: 25,
      premiumStartedAt: null,
      premiumEndsAt: null,
      provider: null,
      providerCustomerId: null,
      providerSubscriptionId: null,
    }
    db.subscription = sub
    saveLocalDb(db)
    return sub
  }

  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('subscriptions')
    .update({ status: 'trial', trial_started_at: start, trial_ends_at: end })
    .eq('family_id', familyId)
    .select('*')
    .single()
  if (error) throw error
  return subscriptionFromRow(data as SubscriptionRow)
}

export interface ConsumeResult {
  allowed: boolean
  remaining: number | null
  status: Subscription['status']
}

/**
 * Consumes one free-practice-answer credit. Trial and premium families are
 * never metered. This MUST be authoritative even in local mode (a family
 * could otherwise edit localStorage) — for cloud mode the real enforcement
 * lives in the `consume_free_answer` Postgres function (security definer),
 * not in this client code; see supabase/migrations/0001_init.sql.
 */
export async function consumeFreeAnswer(mode: DataMode, familyId: string): Promise<ConsumeResult> {
  if (mode === 'local') {
    const db = loadLocalDb()
    const sub = db.subscription
    if (!sub || sub.status === 'guest' || sub.status === 'trial' || sub.status === 'premium') {
      return { allowed: true, remaining: null, status: sub?.status ?? 'guest' }
    }
    if (sub.freeAnswersUsed >= sub.freeAnswersLimit) {
      return { allowed: false, remaining: 0, status: 'free' }
    }
    sub.freeAnswersUsed += 1
    db.subscription = sub
    saveLocalDb(db)
    return { allowed: true, remaining: sub.freeAnswersLimit - sub.freeAnswersUsed, status: 'free' }
  }

  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('consume_free_answer', { p_family_id: familyId })
  if (error) throw error
  const row = Array.isArray(data) ? data[0] : data
  return { allowed: row.allowed, remaining: row.remaining, status: row.status }
}

// ---- Admin/testing shortcuts (also mirrored server-side via an RPC guarded
// by the `admins` table for cloud mode — see adminService.ts) ----

export async function setSubscriptionStatusForTesting(
  mode: DataMode,
  familyId: string,
  status: Subscription['status'],
): Promise<Subscription> {
  if (mode === 'local') {
    const db = loadLocalDb()
    const now = new Date()
    const sub: Subscription = {
      id: db.subscription?.id ?? newId(),
      familyId,
      status,
      trialStartedAt: status === 'trial' ? trialWindow(now).start : (db.subscription?.trialStartedAt ?? null),
      trialEndsAt: status === 'trial' ? trialWindow(now).end : (db.subscription?.trialEndsAt ?? null),
      freeAnswersUsed: status === 'free' ? (db.subscription?.freeAnswersUsed ?? 0) : 0,
      freeAnswersLimit: 25,
      premiumStartedAt: status === 'premium' ? now.toISOString() : null,
      premiumEndsAt: null,
      provider: db.subscription?.provider ?? null,
      providerCustomerId: db.subscription?.providerCustomerId ?? null,
      providerSubscriptionId: db.subscription?.providerSubscriptionId ?? null,
    }
    db.subscription = sub
    saveLocalDb(db)
    return sub
  }

  if (!supabase) throw new Error('Supabase is not configured')
  const action = status === 'premium' ? 'activate_premium' : status === 'free' ? 'set_free' : 'reset_trial'
  const { data, error } = await supabase.rpc('admin_test_action', {
    p_family_id: familyId,
    p_action: action,
  })
  if (error) throw error
  return subscriptionFromRow(data as SubscriptionRow)
}
