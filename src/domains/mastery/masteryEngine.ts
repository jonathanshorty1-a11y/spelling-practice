import type { MasteryEvent, WordMasteryRecord, WordMasteryStatus } from '../shared/types'

/**
 * =============================================================================
 * MASTERY RULE — v1 (documented per spec, deliberately simple & transparent)
 * =============================================================================
 *
 * No ML, no hidden heuristics. Every input is a fact the app already has:
 * correct/incorrect counts, a consecutive-correct streak, how many distinct
 * sessions have seen the word, and whether a hint/reveal was used recently.
 *
 * NOT_PRACTICED
 *   — no attempts at all yet.
 *
 * MASTERED
 *   — consecutiveCorrect >= 3
 *   — AND sessionsSeen >= 2 (seen right at least once in more than one sitting —
 *     a single lucky session doesn't count as mastered, matching spec §10)
 *   — AND the last 2 recorded results were both correct
 *   — AND neither of those last 2 used "Show Answer" (a reveal can't count
 *     toward mastery, even if a later attempt in the same event was "correct")
 *
 * ALMOST_MASTERED
 *   — the most recent result is correct and wasn't a reveal
 *   — AND (consecutiveCorrect >= 2 OR correctAttempts >= 2)
 *   — but doesn't yet meet MASTERED
 *
 * LEARNING
 *   — has at least one attempt, doesn't qualify for the above. Covers: has
 *     incorrect attempts, or a lone correct answer, or a correct streak that
 *     was just broken by a wrong answer.
 *
 * REGRESSION (spec §30): status is recomputed from scratch on every event, it
 * is never "sticky" — a MASTERED word that's answered wrong drops
 * consecutiveCorrect to 0, which immediately drops it out of MASTERED and
 * ALMOST_MASTERED into LEARNING on the very next calculation.
 *
 * =============================================================================
 * MASTERY SCORE — v1 (0-100, feeds Smart Practice's priority weighting only —
 * not shown to the child, and not a substitute for `status` anywhere else)
 * =============================================================================
 *
 *   score = clamp(0..100,
 *     50                                   // neutral once first attempt happens
 *     + correctAttempts   * 8
 *     - incorrectAttempts * 10
 *     + consecutiveCorrect * 6
 *     + min(sessionsSeen, 3) * 8            // multi-session confidence bonus
 *     - hintsUsed  * 4
 *     - revealsUsed * 12                    // a reveal hurts confidence a lot
 *     - recencyPenalty                      // see below
 *   )
 *
 * recencyPenalty: 0 while lastPracticedAt is within 14 days; beyond that, 1
 * point per day over 14, capped at 20. A word that hasn't been touched in a
 * month shouldn't read as fully confident even if it once had a good streak.
 * =============================================================================
 */

const MASTERED_MIN_CONSECUTIVE = 3
const MASTERED_MIN_SESSIONS = 2
const ALMOST_MIN_CONSECUTIVE = 2
const ALMOST_MIN_CORRECT = 2
const RECENT_RESULTS_CAP = 5
const RECENCY_GRACE_DAYS = 14
const RECENCY_PENALTY_CAP = 20

export function emptyMasteryFields(): Pick<
  WordMasteryRecord,
  | 'status'
  | 'correctAttempts'
  | 'incorrectAttempts'
  | 'consecutiveCorrect'
  | 'sessionsSeen'
  | 'hintsUsed'
  | 'revealsUsed'
  | 'recentResults'
  | 'lastSessionId'
  | 'lastPracticedAt'
  | 'lastCorrectAt'
  | 'lastIncorrectAt'
  | 'masteryScore'
> {
  return {
    status: 'not_practiced',
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
  }
}

function daysBetween(fromIso: string, toIso: string): number {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime()
  return Math.max(0, ms / (1000 * 60 * 60 * 24))
}

function computeStatus(
  fields: Pick<WordMasteryRecord, 'correctAttempts' | 'incorrectAttempts' | 'consecutiveCorrect' | 'sessionsSeen' | 'recentResults'>,
): WordMasteryStatus {
  const { correctAttempts, incorrectAttempts, consecutiveCorrect, sessionsSeen, recentResults } = fields
  if (correctAttempts === 0 && incorrectAttempts === 0) return 'not_practiced'

  const lastTwo = recentResults.slice(-2)
  const lastTwoCleanCorrect = lastTwo.length === 2 && lastTwo.every((r) => r.correct && !r.revealed)
  const lastResult = recentResults[recentResults.length - 1]
  const lastCleanCorrect = Boolean(lastResult && lastResult.correct && !lastResult.revealed)

  if (
    consecutiveCorrect >= MASTERED_MIN_CONSECUTIVE &&
    sessionsSeen >= MASTERED_MIN_SESSIONS &&
    lastTwoCleanCorrect
  ) {
    return 'mastered'
  }

  if (lastCleanCorrect && (consecutiveCorrect >= ALMOST_MIN_CONSECUTIVE || correctAttempts >= ALMOST_MIN_CORRECT)) {
    return 'almost_mastered'
  }

  return 'learning'
}

function computeMasteryScore(
  fields: Pick<
    WordMasteryRecord,
    'correctAttempts' | 'incorrectAttempts' | 'consecutiveCorrect' | 'sessionsSeen' | 'hintsUsed' | 'revealsUsed' | 'lastPracticedAt'
  >,
  now: Date,
): number {
  const { correctAttempts, incorrectAttempts, consecutiveCorrect, sessionsSeen, hintsUsed, revealsUsed, lastPracticedAt } = fields
  if (correctAttempts === 0 && incorrectAttempts === 0) return 0

  let score =
    50 +
    correctAttempts * 8 -
    incorrectAttempts * 10 +
    consecutiveCorrect * 6 +
    Math.min(sessionsSeen, 3) * 8 -
    hintsUsed * 4 -
    revealsUsed * 12

  if (lastPracticedAt) {
    const daysSince = daysBetween(lastPracticedAt, now.toISOString())
    if (daysSince > RECENCY_GRACE_DAYS) {
      score -= Math.min(daysSince - RECENCY_GRACE_DAYS, RECENCY_PENALTY_CAP)
    }
  }

  return Math.max(0, Math.min(100, Math.round(score)))
}

/**
 * Pure state transition: folds one practice event into the existing record
 * (or a fresh `not_practiced` one) and returns the next record. Never
 * mutates its input. This is the ONLY place mastery math happens — see
 * spec §32 "una sola fuente de verdad".
 */
export function calculateWordMastery(
  current: WordMasteryRecord | null,
  base: Pick<WordMasteryRecord, 'id' | 'familyId' | 'childId' | 'listId' | 'wordId'>,
  event: MasteryEvent,
  now: Date = new Date(),
): WordMasteryRecord {
  const prev = current ?? { ...base, ...emptyMasteryFields(), updatedAt: event.at }

  const isNewSession = event.sessionId !== prev.lastSessionId
  const sessionsSeen = prev.sessionsSeen + (isNewSession ? 1 : 0)

  const recentResults = [...prev.recentResults, { correct: event.correct, revealed: event.revealedAnswer, sessionId: event.sessionId }].slice(
    -RECENT_RESULTS_CAP,
  )

  const next: WordMasteryRecord = {
    ...prev,
    correctAttempts: prev.correctAttempts + (event.correct ? 1 : 0),
    incorrectAttempts: prev.incorrectAttempts + (event.correct ? 0 : 1),
    consecutiveCorrect: event.correct && !event.revealedAnswer ? prev.consecutiveCorrect + 1 : 0,
    sessionsSeen,
    hintsUsed: prev.hintsUsed + (event.usedHint ? 1 : 0),
    revealsUsed: prev.revealsUsed + (event.revealedAnswer ? 1 : 0),
    recentResults,
    lastSessionId: event.sessionId,
    lastPracticedAt: event.at,
    lastCorrectAt: event.correct ? event.at : prev.lastCorrectAt,
    lastIncorrectAt: !event.correct ? event.at : prev.lastIncorrectAt,
    status: prev.status, // recomputed below
    masteryScore: prev.masteryScore, // recomputed below
    updatedAt: event.at,
  }

  next.status = computeStatus(next)
  next.masteryScore = computeMasteryScore(next, now)

  return next
}

export function isRecentlyIncorrect(record: WordMasteryRecord | undefined): boolean {
  if (!record) return false
  const last = record.recentResults[record.recentResults.length - 1]
  return Boolean(last && (!last.correct || last.revealed))
}
