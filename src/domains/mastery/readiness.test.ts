import { describe, expect, it } from 'vitest'
import { calculateReadiness } from './readiness'
import type { WordMasteryRecord } from '../shared/types'

function record(overrides: Partial<WordMasteryRecord> = {}): WordMasteryRecord {
  return {
    id: 'wm',
    familyId: 'f',
    childId: 'c',
    listId: 'l',
    wordId: 'w',
    status: 'mastered',
    correctAttempts: 3,
    incorrectAttempts: 0,
    consecutiveCorrect: 3,
    sessionsSeen: 2,
    hintsUsed: 0,
    revealsUsed: 0,
    recentResults: [],
    lastSessionId: 's2',
    lastPracticedAt: '2026-01-01T00:00:00Z',
    lastCorrectAt: '2026-01-01T00:00:00Z',
    lastIncorrectAt: null,
    masteryScore: 90,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('calculateReadiness', () => {
  it('is needs_practice when almost nothing is mastered', () => {
    // Only 1 word has an actual "learning" record; the rest of the list
    // (9 words) has never been touched at all, so notPracticedCount is
    // derived from `total`, not from how many mastery rows happen to exist.
    const records = [record({ status: 'learning' }), record({ status: 'not_practiced' })]
    const r = calculateReadiness(records, 10)
    expect(r.status).toBe('needs_practice')
    expect(r.notPracticedCount).toBe(9)
  })

  it('is almost_ready in the 60-89% mastered band', () => {
    const records = Array.from({ length: 10 }, (_, i) => record({ wordId: `w${i}`, status: i < 7 ? 'mastered' : 'learning' }))
    const r = calculateReadiness(records, 10)
    expect(r.masteredPercent).toBe(70)
    expect(r.status).toBe('almost_ready')
  })

  it('is ready_for_test at 90%+ mastered with no recent critical errors', () => {
    const records = Array.from({ length: 10 }, (_, i) => record({ wordId: `w${i}`, status: i < 9 ? 'mastered' : 'almost_mastered' }))
    const r = calculateReadiness(records, 10)
    expect(r.masteredPercent).toBe(90)
    expect(r.status).toBe('ready_for_test')
  })

  it('is NOT ready_for_test — even at 90%+ mastered — if there was a recent critical error', () => {
    const now = new Date('2026-01-10T00:00:00Z')
    const records = Array.from({ length: 10 }, (_, i) =>
      record({
        wordId: `w${i}`,
        status: i < 9 ? 'mastered' : 'almost_mastered',
        lastIncorrectAt: i === 0 ? '2026-01-09T00:00:00Z' : null, // 1 day ago
      }),
    )
    const r = calculateReadiness(records, 10, now)
    expect(r.masteredPercent).toBe(90)
    expect(r.recentCriticalErrors).toBe(1)
    expect(r.status).toBe('almost_ready')
  })

  it('is not driven by a single perfect test alone — readiness is aggregate, not last-score', () => {
    // A child could ace one session (10/10) but if those words were only seen
    // once (sessionsSeen=1), calculateWordMastery would cap them at
    // almost_mastered, not mastered — so readiness here reflects that they
    // are not yet "proven" across sessions.
    const records = Array.from({ length: 10 }, (_, i) => record({ wordId: `w${i}`, status: 'almost_mastered' }))
    const r = calculateReadiness(records, 10)
    expect(r.status).not.toBe('ready_for_test')
    expect(r.status).toBe('almost_ready')
  })

  it('treats words with no mastery record yet as not_practiced via totalWordsInList', () => {
    const records = [record({ wordId: 'w0' })] // only one word has ever been touched
    const r = calculateReadiness(records, 5)
    expect(r.total).toBe(5)
    expect(r.notPracticedCount).toBe(4)
  })
})
