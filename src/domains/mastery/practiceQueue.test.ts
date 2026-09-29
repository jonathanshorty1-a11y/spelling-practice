import { describe, expect, it, vi } from 'vitest'
import { generatePracticeQueue, reinsertMissedWord, selectWordsForPracticeType, type QueueWordRef } from './practiceQueue'
import type { WordMasteryRecord } from '../shared/types'

function record(status: WordMasteryRecord['status'], overrides: Partial<WordMasteryRecord> = {}): WordMasteryRecord {
  return {
    id: 'wm',
    familyId: 'f',
    childId: 'c',
    listId: 'l',
    wordId: 'w',
    status,
    correctAttempts: 0,
    incorrectAttempts: 0,
    consecutiveCorrect: 0,
    sessionsSeen: 0,
    hintsUsed: 0,
    revealsUsed: 0,
    recentResults: [],
    lastSessionId: null,
    lastPracticedAt: null,
    lastCorrectAt: null,
    lastIncorrectAt: null,
    masteryScore: 0,
    updatedAt: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

describe('generatePracticeQueue', () => {
  it('includes every word when no limit is given, and mutates nothing', () => {
    const words: QueueWordRef[] = [{ id: '1', word: 'a' }, { id: '2', word: 'b' }, { id: '3', word: 'c' }]
    const original = [...words]
    const queue = generatePracticeQueue(words, new Map())
    expect(queue).toHaveLength(3)
    expect(words).toEqual(original)
    expect(queue.map((w) => w.id).sort()).toEqual(['1', '2', '3'])
  })

  it('with a deterministic random source, prioritizes higher-weight (learning/recently-incorrect) words first', () => {
    const words: QueueWordRef[] = [
      { id: 'mastered', word: 'mastered' },
      { id: 'learning', word: 'learning' },
      { id: 'notpracticed', word: 'notpracticed' },
    ]
    const mastery = new Map<string, WordMasteryRecord>([
      ['mastered', record('mastered')],
      ['learning', record('learning')],
    ])
    // Fixed "random" value means only the weight differs between items, so
    // higher weight deterministically produces a smaller sort key (comes first).
    const fixedRandom = () => 0.5
    const queue = generatePracticeQueue(words, mastery, { random: fixedRandom })
    expect(queue[0].id).toBe('learning')
    expect(queue[queue.length - 1].id).toBe('mastered')
  })

  it('a word with a recent incorrect result outranks a plain "learning" word', () => {
    const words: QueueWordRef[] = [
      { id: 'learning', word: 'learning' },
      { id: 'recentlyWrong', word: 'recentlyWrong' },
    ]
    const mastery = new Map<string, WordMasteryRecord>([
      ['learning', record('learning')],
      ['recentlyWrong', record('almost_mastered', { recentResults: [{ correct: false, revealed: false, sessionId: 's1' }] })],
    ])
    const queue = generatePracticeQueue(words, mastery, { random: () => 0.5 })
    expect(queue[0].id).toBe('recentlyWrong')
  })

  it('respects `limit`, truncating to the top N by weight', () => {
    const words: QueueWordRef[] = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, word: `w${i}` }))
    const mastery = new Map<string, WordMasteryRecord>(words.map((w, i) => [w.id, record(i < 5 ? 'mastered' : 'learning')]))
    const queue = generatePracticeQueue(words, mastery, { limit: 5, random: () => 0.5 })
    expect(queue).toHaveLength(5)
    // learning words (higher weight) should dominate the truncated top-5
    const learningCount = queue.filter((w) => mastery.get(w.id)?.status === 'learning').length
    expect(learningCount).toBeGreaterThan(0)
  })

  it('never fully excludes mastered words from an unlimited queue', () => {
    const words: QueueWordRef[] = [
      { id: 'm1', word: 'm1' },
      { id: 'learn1', word: 'learn1' },
    ]
    const mastery = new Map<string, WordMasteryRecord>([
      ['m1', record('mastered')],
      ['learn1', record('learning')],
    ])
    const queue = generatePracticeQueue(words, mastery)
    expect(queue.map((w) => w.id).sort()).toEqual(['learn1', 'm1'])
  })

  it('uses actual randomness by default (two calls are not always identical for a large-ish set)', () => {
    const words: QueueWordRef[] = Array.from({ length: 20 }, (_, i) => ({ id: `w${i}`, word: `w${i}` }))
    const a = generatePracticeQueue(words, new Map()).map((w) => w.id)
    const b = generatePracticeQueue(words, new Map()).map((w) => w.id)
    expect(a).not.toEqual(b)
  })
})

describe('selectWordsForPracticeType', () => {
  const words: QueueWordRef[] = [
    { id: 'w1', word: 'w1' }, // mastered
    { id: 'w2', word: 'w2' }, // learning
    { id: 'w3', word: 'w3' }, // almost_mastered
    { id: 'w4', word: 'w4' }, // not_practiced (no record)
  ]
  const mastery = new Map<string, WordMasteryRecord>([
    ['w1', record('mastered')],
    ['w2', record('learning')],
    ['w3', record('almost_mastered')],
  ])

  it('weak_words excludes mastered words but keeps learning/almost/not_practiced', () => {
    const queue = selectWordsForPracticeType(words, mastery, 'weak_words', { random: () => 0.5 })
    const ids = queue.map((w) => w.id).sort()
    expect(ids).toEqual(['w2', 'w3', 'w4'])
  })

  it('weak_words falls back to the full list if literally everything is mastered', () => {
    const allMastered = new Map<string, WordMasteryRecord>(words.map((w) => [w.id, record('mastered')]))
    const queue = selectWordsForPracticeType(words, allMastered, 'weak_words', { random: () => 0.5 })
    expect(queue).toHaveLength(4)
  })

  it('quick_practice limits to a small clamp of 5-10 words', () => {
    const many: QueueWordRef[] = Array.from({ length: 30 }, (_, i) => ({ id: `w${i}`, word: `w${i}` }))
    const queue = selectWordsForPracticeType(many, new Map(), 'quick_practice', { random: () => 0.5 })
    expect(queue.length).toBeGreaterThanOrEqual(5)
    expect(queue.length).toBeLessThanOrEqual(10)
  })

  it('practice_test/smart_practice/final_review include every word, just reordered', () => {
    for (const type of ['practice_test', 'smart_practice', 'final_review'] as const) {
      const queue = selectWordsForPracticeType(words, mastery, type, { random: () => 0.5 })
      expect(queue).toHaveLength(4)
    }
  })
})

describe('reinsertMissedWord', () => {
  it('never places the missed word immediately next', () => {
    const queue: QueueWordRef[] = Array.from({ length: 10 }, (_, i) => ({ id: `w${i}`, word: `w${i}` }))
    const missed = { id: 'height', word: 'height' }
    const random = vi.fn(() => 0) // gap = MIN_GAP with random()=0
    const next = reinsertMissedWord(queue, 2, missed, random)
    const insertedAt = next.findIndex((w, i) => w.id === 'height' && i > 2)
    expect(insertedAt).toBeGreaterThan(3) // at least 2 words between position 2 and the reinsertion
  })

  it('appends at the end when too few questions remain for a proper gap', () => {
    const queue: QueueWordRef[] = Array.from({ length: 3 }, (_, i) => ({ id: `w${i}`, word: `w${i}` }))
    const missed = { id: 'height', word: 'height' }
    const next = reinsertMissedWord(queue, 1, missed, () => 0)
    expect(next[next.length - 1].id).toBe('height')
  })

  it('does not remove or duplicate any other word', () => {
    const queue: QueueWordRef[] = Array.from({ length: 6 }, (_, i) => ({ id: `w${i}`, word: `w${i}` }))
    const missed = { id: 'height', word: 'height' }
    const next = reinsertMissedWord(queue, 1, missed, () => 0.5)
    expect(next).toHaveLength(queue.length + 1)
    for (const w of queue) {
      expect(next.filter((n) => n.id === w.id)).toHaveLength(1)
    }
  })
})
