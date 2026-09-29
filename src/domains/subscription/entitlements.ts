import type { Subscription } from '../shared/types'

export interface Entitlements {
  status: Subscription['status']
  /** Trial or premium: full access, nothing metered. */
  isPremiumLike: boolean
  /** False once a `free` family has used all lifetime free answers. */
  canSubmitPracticeAnswer: boolean
  /** Null when not metered (guest/trial/premium). */
  freeAnswersRemaining: number | null
  freeAnswersUsed: number
  freeAnswersLimit: number
  maxChildren: number
  canUsePhotoImport: boolean
  canPracticeMistakes: boolean
  canViewFullHistory: boolean
  /** Null when not in an active trial. */
  trialDaysRemaining: number | null
}

/**
 * Single source of truth for what a family can do at their current
 * subscription status. Screens should call this (or canUseFeature below)
 * instead of branching on `status` themselves.
 */
export function computeEntitlements(subscription: Subscription | null, now: Date = new Date()): Entitlements {
  const status = subscription?.status ?? 'guest'
  const isPremiumLike = status === 'trial' || status === 'premium'
  const freeAnswersUsed = subscription?.freeAnswersUsed ?? 0
  const freeAnswersLimit = subscription?.freeAnswersLimit ?? 25

  const freeAnswersRemaining = status === 'free' ? Math.max(0, freeAnswersLimit - freeAnswersUsed) : null

  const canSubmitPracticeAnswer = status === 'free' ? freeAnswersUsed < freeAnswersLimit : true

  let trialDaysRemaining: number | null = null
  if (status === 'trial' && subscription?.trialEndsAt) {
    const msRemaining = new Date(subscription.trialEndsAt).getTime() - now.getTime()
    trialDaysRemaining = Math.max(0, Math.ceil(msRemaining / (24 * 60 * 60 * 1000)))
  }

  return {
    status,
    isPremiumLike,
    canSubmitPracticeAnswer,
    freeAnswersRemaining,
    freeAnswersUsed,
    freeAnswersLimit,
    maxChildren: isPremiumLike ? Infinity : 1,
    canUsePhotoImport: isPremiumLike,
    canPracticeMistakes: true,
    canViewFullHistory: true,
    trialDaysRemaining,
  }
}

export type Feature = 'photoImport' | 'multipleChildren' | 'unlimitedWords' | 'submitPracticeAnswer'

export function canUseFeature(entitlements: Entitlements, feature: Feature, context?: { currentChildCount?: number }): boolean {
  switch (feature) {
    case 'photoImport':
      return entitlements.canUsePhotoImport
    case 'multipleChildren':
      return (context?.currentChildCount ?? 0) < entitlements.maxChildren
    case 'unlimitedWords':
      return entitlements.isPremiumLike
    case 'submitPracticeAnswer':
      return entitlements.canSubmitPracticeAnswer
    default:
      return false
  }
}

/** Has the trial's end date passed? Used to decide when to flip trial -> free. */
export function hasTrialExpired(subscription: Subscription, now: Date = new Date()): boolean {
  if (subscription.status !== 'trial' || !subscription.trialEndsAt) return false
  return new Date(subscription.trialEndsAt).getTime() <= now.getTime()
}
