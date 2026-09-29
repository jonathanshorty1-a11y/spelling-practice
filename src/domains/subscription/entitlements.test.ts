import { describe, expect, it } from 'vitest'
import { canUseFeature, computeEntitlements, hasTrialExpired } from './entitlements'
import type { Subscription } from '../shared/types'

function makeSub(overrides: Partial<Subscription> = {}): Subscription {
  return {
    id: 'sub_1',
    familyId: 'fam_1',
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
    ...overrides,
  }
}

describe('computeEntitlements', () => {
  it('gives guests full access without metering', () => {
    const e = computeEntitlements(null)
    expect(e.status).toBe('guest')
    expect(e.canSubmitPracticeAnswer).toBe(true)
    expect(e.freeAnswersRemaining).toBeNull()
    expect(e.maxChildren).toBe(1)
  })

  it('gives trial families unlimited everything and counts days remaining', () => {
    const now = new Date('2026-01-10T00:00:00Z')
    const sub = makeSub({
      status: 'trial',
      trialStartedAt: '2026-01-03T00:00:00Z',
      trialEndsAt: '2026-01-13T00:00:00Z',
    })
    const e = computeEntitlements(sub, now)
    expect(e.isPremiumLike).toBe(true)
    expect(e.canSubmitPracticeAnswer).toBe(true)
    expect(e.maxChildren).toBe(Infinity)
    expect(e.canUsePhotoImport).toBe(true)
    expect(e.trialDaysRemaining).toBe(3)
  })

  it('does NOT meter free answers during trial, even if the field has a value', () => {
    const sub = makeSub({ status: 'trial', freeAnswersUsed: 999, trialEndsAt: '2099-01-01T00:00:00Z' })
    const e = computeEntitlements(sub)
    expect(e.canSubmitPracticeAnswer).toBe(true)
    expect(e.freeAnswersRemaining).toBeNull()
  })

  it('meters a free-tier family down to 0 remaining and blocks at the limit', () => {
    const sub = makeSub({ status: 'free', freeAnswersUsed: 25, freeAnswersLimit: 25 })
    const e = computeEntitlements(sub)
    expect(e.canSubmitPracticeAnswer).toBe(false)
    expect(e.freeAnswersRemaining).toBe(0)
    expect(e.maxChildren).toBe(1)
    expect(e.canUsePhotoImport).toBe(false)
  })

  it('free tier with answers left can still submit', () => {
    const sub = makeSub({ status: 'free', freeAnswersUsed: 18, freeAnswersLimit: 25 })
    const e = computeEntitlements(sub)
    expect(e.canSubmitPracticeAnswer).toBe(true)
    expect(e.freeAnswersRemaining).toBe(7)
  })

  it('premium is always unlimited and never meters, regardless of freeAnswersUsed', () => {
    const sub = makeSub({ status: 'premium', freeAnswersUsed: 500 })
    const e = computeEntitlements(sub)
    expect(e.isPremiumLike).toBe(true)
    expect(e.canSubmitPracticeAnswer).toBe(true)
    expect(e.freeAnswersRemaining).toBeNull()
    expect(e.maxChildren).toBe(Infinity)
  })
})

describe('canUseFeature', () => {
  it('gates multipleChildren on current count vs maxChildren', () => {
    const freeEntitlements = computeEntitlements(makeSub({ status: 'free', freeAnswersUsed: 0 }))
    expect(canUseFeature(freeEntitlements, 'multipleChildren', { currentChildCount: 1 })).toBe(false)
    expect(canUseFeature(freeEntitlements, 'multipleChildren', { currentChildCount: 0 })).toBe(true)

    const premiumEntitlements = computeEntitlements(makeSub({ status: 'premium' }))
    expect(canUseFeature(premiumEntitlements, 'multipleChildren', { currentChildCount: 10 })).toBe(true)
  })

  it('blocks submitPracticeAnswer once free answers are exhausted', () => {
    const e = computeEntitlements(makeSub({ status: 'free', freeAnswersUsed: 25 }))
    expect(canUseFeature(e, 'submitPracticeAnswer')).toBe(false)
  })
})

describe('hasTrialExpired', () => {
  it('is false for non-trial statuses', () => {
    expect(hasTrialExpired(makeSub({ status: 'free' }))).toBe(false)
    expect(hasTrialExpired(makeSub({ status: 'premium' }))).toBe(false)
  })

  it('is true once trialEndsAt has passed', () => {
    const sub = makeSub({ status: 'trial', trialEndsAt: '2020-01-01T00:00:00Z' })
    expect(hasTrialExpired(sub, new Date('2020-01-02T00:00:00Z'))).toBe(true)
  })

  it('is false before trialEndsAt', () => {
    const sub = makeSub({ status: 'trial', trialEndsAt: '2099-01-01T00:00:00Z' })
    expect(hasTrialExpired(sub, new Date('2026-01-01T00:00:00Z'))).toBe(false)
  })
})
