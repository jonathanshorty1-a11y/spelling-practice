import { describe, expect, it } from 'vitest'
import { getRecommendedPractice } from './recommendedPractice'
import type { ReadinessSummary } from '../shared/types'

function readiness(overrides: Partial<ReadinessSummary> = {}): ReadinessSummary {
  return {
    status: 'needs_practice',
    total: 10,
    masteredCount: 0,
    almostMasteredCount: 0,
    learningCount: 0,
    notPracticedCount: 10,
    masteredPercent: 0,
    recentCriticalErrors: 0,
    ...overrides,
  }
}

describe('getRecommendedPractice', () => {
  it('recommends start_basics when nothing has been practiced yet', () => {
    const r = getRecommendedPractice({ readiness: readiness({ notPracticedCount: 10 }), testDate: null })
    expect(r.type).toBe('start_basics')
  })

  it('recommends final_review when the test is tomorrow, even if otherwise needing practice', () => {
    const now = new Date('2026-01-10T00:00:00Z')
    const r = getRecommendedPractice({
      readiness: readiness({ notPracticedCount: 0, learningCount: 5, masteredCount: 5, status: 'almost_ready' }),
      testDate: '2026-01-11',
      now,
    })
    expect(r.type).toBe('final_review')
  })

  it('recommends final_review when the test is today', () => {
    const now = new Date('2026-01-10T08:00:00Z')
    const r = getRecommendedPractice({
      readiness: readiness({ notPracticedCount: 0, learningCount: 2, masteredCount: 8, status: 'almost_ready' }),
      testDate: '2026-01-10',
      now,
    })
    expect(r.type).toBe('final_review')
  })

  it('recommends light_review when already ready_for_test and no test date pressure', () => {
    const r = getRecommendedPractice({
      readiness: readiness({ notPracticedCount: 0, masteredCount: 10, status: 'ready_for_test', masteredPercent: 100 }),
      testDate: null,
    })
    expect(r.type).toBe('light_review')
  })

  it('recommends smart_practice as the default ongoing case', () => {
    const r = getRecommendedPractice({
      readiness: readiness({ notPracticedCount: 2, learningCount: 4, masteredCount: 4, status: 'almost_ready' }),
      testDate: '2026-02-01', // far away
      now: new Date('2026-01-10T00:00:00Z'),
    })
    expect(r.type).toBe('smart_practice')
  })

  it('keeps estimated minutes within the 3-10 minute band', () => {
    const r1 = getRecommendedPractice({ readiness: readiness({ total: 1, notPracticedCount: 1 }), testDate: null })
    expect(r1.estimatedMinutes).toBeGreaterThanOrEqual(3)
    const r2 = getRecommendedPractice({
      readiness: readiness({ total: 50, notPracticedCount: 0, learningCount: 50, status: 'needs_practice' }),
      testDate: null,
    })
    expect(r2.estimatedMinutes).toBeLessThanOrEqual(10)
  })
})
