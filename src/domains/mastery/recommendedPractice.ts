import type { ReadinessSummary } from '../shared/types'

export type RecommendedPracticeType = 'start_basics' | 'smart_practice' | 'final_review' | 'light_review'

export interface RecommendedPractice {
  type: RecommendedPracticeType
  estimatedMinutes: number
  /** How many words this recommendation is expected to touch — drives the queue's `limit`. */
  wordCount: number
}

const MIN_MINUTES = 3
const MAX_MINUTES = 10
const SECONDS_PER_WORD = 25

function estimateMinutes(wordCount: number): number {
  const minutes = Math.round((wordCount * SECONDS_PER_WORD) / 60)
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, minutes))
}

export interface GetRecommendedPracticeInput {
  readiness: ReadinessSummary
  /** ISO date string (yyyy-mm-dd) or null if no test date was set. */
  testDate: string | null
  now?: Date
}

/**
 * =============================================================================
 * RECOMMENDED PRACTICE — v1 (spec §18)
 * =============================================================================
 * Priority order (first match wins):
 *   1. Nothing practiced yet at all           -> start_basics
 *   2. A test date exists and is <= 1 day out -> final_review
 *   3. Already ready_for_test                  -> light_review
 *   4. Otherwise                                -> smart_practice
 * =============================================================================
 */
export function getRecommendedPractice(input: GetRecommendedPracticeInput): RecommendedPractice {
  const now = input.now ?? new Date()
  const { readiness } = input

  const nothingPracticedYet = readiness.total > 0 && readiness.notPracticedCount === readiness.total
  if (nothingPracticedYet) {
    const wordCount = Math.min(readiness.total, 10)
    return { type: 'start_basics', wordCount, estimatedMinutes: estimateMinutes(wordCount) }
  }

  const daysUntilTest = input.testDate != null ? daysBetween(now, new Date(input.testDate)) : null
  if (daysUntilTest != null && daysUntilTest <= 1) {
    const wordCount = readiness.learningCount + readiness.almostMasteredCount + Math.min(readiness.masteredCount, 3)
    return { type: 'final_review', wordCount: Math.max(wordCount, 1), estimatedMinutes: estimateMinutes(wordCount) }
  }

  if (readiness.status === 'ready_for_test') {
    const wordCount = Math.max(3, Math.min(readiness.total, 5))
    return { type: 'light_review', wordCount, estimatedMinutes: estimateMinutes(wordCount) }
  }

  const wordCount = readiness.total
  return { type: 'smart_practice', wordCount, estimatedMinutes: estimateMinutes(wordCount) }
}

function daysBetween(from: Date, to: Date): number {
  const ms = to.getTime() - from.getTime()
  return ms / (1000 * 60 * 60 * 24)
}
