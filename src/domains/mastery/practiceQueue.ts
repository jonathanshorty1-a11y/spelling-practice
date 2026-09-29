import type { WordMasteryRecord, WordMasteryStatus } from '../shared/types'
import { isRecentlyIncorrect } from './masteryEngine'

export interface QueueWordRef {
  id: string
  word: string
  /** Optional — carried through only so PracticeTestScreen can pass it to speakTestPrompt(). Not used for weighting/ordering. */
  exampleSentence?: string | null
}

/**
 * =============================================================================
 * SMART PRACTICE QUEUE — v1
 * =============================================================================
 * Not a shuffle. Every word gets a priority weight from its mastery status
 * (recently-incorrect words are treated as a tier above even "learning" —
 * spec §6's "1. palabras incorrectas recientemente"), then the queue is
 * built with weighted-random sampling (higher weight = more likely to sort
 * earlier), so order is prioritized but not perfectly predictable.
 *
 *   recently incorrect  weight 12   (very high — spec: "very high")
 *   learning             weight 8    (high)
 *   not_practiced         weight 6    (medium/high)
 *   almost_mastered       weight 4    (medium)
 *   mastered              weight 1    (low — rare, never zero: spec §8 "no
 *                                       quiero un algoritmo que las haga
 *                                       desaparecer completamente")
 *
 * With no `limit`, every word supplied is included (just reordered) — used
 * for practice_test/smart_practice "cover everything" sessions. With a
 * `limit`, only the top-weighted N make the cut — used for Weak
 * Words/Quick Practice/Final Review, where mastered words naturally drop out
 * most of the time simply because their weight is low, not because they're
 * hard-excluded.
 * =============================================================================
 */

const WEIGHTS: Record<'recently_incorrect' | WordMasteryStatus, number> = {
  recently_incorrect: 12,
  learning: 8,
  not_practiced: 6,
  almost_mastered: 4,
  mastered: 1,
}

function weightFor(word: QueueWordRef, mastery: Map<string, WordMasteryRecord>): number {
  const record = mastery.get(word.id)
  if (isRecentlyIncorrect(record)) return WEIGHTS.recently_incorrect
  return WEIGHTS[record?.status ?? 'not_practiced']
}

export interface GeneratePracticeQueueOptions {
  limit?: number
  /** Injectable for deterministic tests; defaults to Math.random. */
  random?: () => number
}

/**
 * Weighted shuffle via the "A-ES" trick: give each item a random key of
 * -ln(u)/weight (u ~ Uniform(0,1)) and sort ascending — items with higher
 * weight tend to get smaller keys (i.e. sort earlier), while still being
 * randomized rather than a strict sort. Higher weight = more likely first,
 * never guaranteed first, which is exactly "algo de aleatoriedad" (spec §6).
 */
export function generatePracticeQueue(
  words: QueueWordRef[],
  mastery: Map<string, WordMasteryRecord>,
  options: GeneratePracticeQueueOptions = {},
): QueueWordRef[] {
  const random = options.random ?? Math.random
  const keyed = words.map((word) => {
    const weight = weightFor(word, mastery)
    const u = Math.min(Math.max(random(), 1e-9), 1 - 1e-9) // avoid ln(0)/ln(1) edge cases
    return { word, key: -Math.log(u) / weight }
  })
  keyed.sort((a, b) => a.key - b.key)
  const ordered = keyed.map((k) => k.word)
  return options.limit != null ? ordered.slice(0, options.limit) : ordered
}

export type QueuePracticeType = 'practice_test' | 'smart_practice' | 'weak_words' | 'quick_practice' | 'final_review' | 'study'

/**
 * Single source of truth (spec §32) for "which words, in what order" a given
 * practice type gets. PracticeTestScreen, the Kid Home recommendation, and
 * Parent Area's "Practice Weak Words" button all call this instead of each
 * re-implementing their own filtering.
 */
export function selectWordsForPracticeType(
  words: QueueWordRef[],
  mastery: Map<string, WordMasteryRecord>,
  practiceType: QueuePracticeType,
  options: { random?: () => number } = {},
): QueueWordRef[] {
  const random = options.random ?? Math.random

  if (practiceType === 'weak_words') {
    const weak = words.filter((w) => {
      const record = mastery.get(w.id)
      return record?.status !== 'mastered' || isRecentlyIncorrect(record)
    })
    return generatePracticeQueue(weak.length > 0 ? weak : words, mastery, { random })
  }

  if (practiceType === 'quick_practice') {
    const limit = Math.min(10, Math.max(5, Math.round(words.length / 3)))
    return generatePracticeQueue(words, mastery, { limit, random })
  }

  return generatePracticeQueue(words, mastery, { random })
}

const MIN_GAP = 2
const MAX_GAP = 4

/**
 * Splices a missed word back into the remaining queue a few questions later
 * (spec §7: "height incorrect, then drive/kite/chief, then height again") —
 * never immediately next. If fewer than MIN_GAP questions remain, it's
 * appended at the end instead of not being reinserted at all.
 */
export function reinsertMissedWord(
  queue: QueueWordRef[],
  currentIndex: number,
  missedWord: QueueWordRef,
  random: () => number = Math.random,
): QueueWordRef[] {
  const remaining = queue.length - (currentIndex + 1)
  const gap = MIN_GAP + Math.floor(random() * (MAX_GAP - MIN_GAP + 1))
  const insertAt = remaining < MIN_GAP ? queue.length : Math.min(currentIndex + 1 + gap, queue.length)

  const next = queue.slice()
  next.splice(insertAt, 0, missedWord)
  return next
}
