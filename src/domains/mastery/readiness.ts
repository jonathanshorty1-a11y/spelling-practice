import type { ReadinessStatus, ReadinessSummary, WordMasteryRecord, WordMasteryStatus } from '../shared/types'

/**
 * =============================================================================
 * READINESS RULE — v1
 * =============================================================================
 * Deliberately NOT "did the last test go well" (spec §10/§20 — a single test
 * can go well by luck or short-term memory). It's driven by the *aggregate*
 * per-word mastery for the child's current list, plus a check for recent
 * "critical" misses (a word that was mastered-ish but just failed again).
 *
 *   READY_FOR_TEST   masteredPercent >= 90  AND recentCriticalErrors === 0
 *   ALMOST_READY     masteredPercent >= 60  (includes the >=90% case that
 *                    still has a recent critical error — one bad recent miss
 *                    on an otherwise-strong list shouldn't silently read as
 *                    fully ready)
 *   NEEDS_PRACTICE   masteredPercent < 60
 *
 * A "recent critical error" = a word answered incorrectly or revealed within
 * the last CRITICAL_WINDOW_DAYS, regardless of its overall status — a fresh
 * slip is worth flagging even if the word's long-run record is good.
 * =============================================================================
 */

const READY_THRESHOLD = 90 // strict: mastered-only percent
const ALMOST_THRESHOLD = 60 // lenient: mastered + almost_mastered percent
const CRITICAL_WINDOW_DAYS = 2

function countByStatus(records: WordMasteryRecord[], status: WordMasteryStatus): number {
  return records.filter((r) => r.status === status).length
}

/**
 * `totalWordsInList` should be the current list's actual word count — pass it
 * separately because a word with NO mastery record yet (never practiced) has
 * no row to iterate, and must still count toward `notPracticedCount`/`total`.
 */
export function calculateReadiness(
  records: WordMasteryRecord[],
  totalWordsInList: number,
  now: Date = new Date(),
): ReadinessSummary {
  const total = Math.max(totalWordsInList, records.length)
  const masteredCount = countByStatus(records, 'mastered')
  const almostMasteredCount = countByStatus(records, 'almost_mastered')
  const learningCount = countByStatus(records, 'learning')
  const notPracticedCount = total - masteredCount - almostMasteredCount - learningCount

  const masteredPercent = total === 0 ? 0 : Math.round((masteredCount / total) * 100)
  // "On track" is more lenient than strictly-mastered — a list that's 100%
  // almost_mastered (correct last time, streak building, just not yet proven
  // across 2 sessions) should read as ALMOST_READY, not NEEDS_PRACTICE.
  const onTrackPercent = total === 0 ? 0 : Math.round(((masteredCount + almostMasteredCount) / total) * 100)

  const recentCriticalErrors = records.filter((r) => {
    if (!r.lastIncorrectAt) return false
    const daysSince = (now.getTime() - new Date(r.lastIncorrectAt).getTime()) / (1000 * 60 * 60 * 24)
    return daysSince <= CRITICAL_WINDOW_DAYS
  }).length

  let status: ReadinessStatus
  if (masteredPercent >= READY_THRESHOLD && recentCriticalErrors === 0) {
    status = 'ready_for_test'
  } else if (onTrackPercent >= ALMOST_THRESHOLD || (masteredPercent >= READY_THRESHOLD && recentCriticalErrors > 0)) {
    status = 'almost_ready'
  } else {
    status = 'needs_practice'
  }

  return {
    status,
    total,
    masteredCount,
    almostMasteredCount,
    learningCount,
    notPracticedCount,
    masteredPercent,
    recentCriticalErrors,
  }
}
