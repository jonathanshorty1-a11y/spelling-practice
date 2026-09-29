// Shared domain types. These mirror the Supabase table shapes 1:1 (see
// supabase/migrations/0001_init.sql) so that guest/local data created before
// sign-up can be migrated into Postgres by a straight field-for-field copy.

export type SubscriptionStatus = 'guest' | 'trial' | 'free' | 'premium'

export type ParentLanguage = 'en' | 'es'

export interface Family {
  id: string
  ownerUserId: string | null // null while still a local guest, set on sign-up
  email: string | null
  parentPinHash: string | null
  parentLanguage: ParentLanguage
  createdAt: string
}

export interface Child {
  id: string
  familyId: string
  name: string
  avatar: string
  themeColor: string
  grade: string | null
  createdAt: string
}

export interface WeeklyList {
  id: string
  childId: string
  familyId: string
  title: string
  weekStart: string | null
  weekEnd: string | null
  /** When the spelling test is — drives Final Review / "Ready for Friday" copy. Optional. */
  testDate: string | null
  createdAt: string
  archived: boolean
}

export interface WeeklyWord {
  id: string
  listId: string
  word: string
  orderIndex: number
  /** Optional context sentence for future "hear it in a sentence" support (spec §25) — not surfaced in UI yet. */
  exampleSentence: string | null
}

export type PracticeMode = 'full' | 'mistakes'

/** What the session was *for* — richer than `mode`, used for analytics and the Progress view. */
export type PracticeType =
  | 'practice_test'
  | 'smart_practice'
  | 'weak_words'
  | 'quick_practice'
  | 'final_review'
  | 'study'

export interface PracticeSession {
  id: string
  familyId: string
  childId: string
  listId: string
  mode: PracticeMode
  practiceType: PracticeType
  startedAt: string
  completedAt: string | null
  totalWords: number
  correctWords: number
  percentage: number
}

export interface PracticeAnswer {
  id: string
  sessionId: string
  wordId: string
  word: string
  typedAnswer: string
  correct: boolean
  attempts: number
  usedHint: boolean
  revealedAnswer: boolean
}

export interface Subscription {
  id: string
  familyId: string
  status: SubscriptionStatus
  trialStartedAt: string | null
  trialEndsAt: string | null
  freeAnswersUsed: number
  freeAnswersLimit: number
  premiumStartedAt: string | null
  premiumEndsAt: string | null
  provider: string | null
  providerCustomerId: string | null
  providerSubscriptionId: string | null
}

export interface AnalyticsEvent {
  id: string
  familyId: string | null
  eventName: string
  payload: Record<string, unknown>
  createdAt: string
}

export const FREE_ANSWERS_LIFETIME_LIMIT = 25
export const TRIAL_LENGTH_DAYS = 7

// ---------------------------------------------------------------------------
// Mastery / Smart Practice / Readiness
// ---------------------------------------------------------------------------

export type WordMasteryStatus = 'not_practiced' | 'learning' | 'almost_mastered' | 'mastered'

/** One outcome (a submitted answer, or a reveal) — the event calculateWordMastery folds in. */
export interface MasteryEvent {
  sessionId: string
  correct: boolean
  usedHint: boolean
  revealedAnswer: boolean
  at: string // ISO timestamp
}

/**
 * Per-family, per-child, per-list, per-word learning record. See
 * domains/mastery/masteryEngine.ts for how `status`/`masteryScore` are
 * computed from these fields — this type only holds the stored state.
 */
export interface WordMasteryRecord {
  id: string
  familyId: string
  childId: string
  listId: string
  wordId: string
  status: WordMasteryStatus
  correctAttempts: number
  incorrectAttempts: number
  consecutiveCorrect: number
  /** How many *distinct* sessions this word has been answered in (approximated — see masteryEngine.ts). */
  sessionsSeen: number
  hintsUsed: number
  revealsUsed: number
  /** Bounded rolling history (most recent last) used for the "last 2 clean" mastery check. Capped at 5. */
  recentResults: { correct: boolean; revealed: boolean; sessionId: string }[]
  lastSessionId: string | null
  lastPracticedAt: string | null
  lastCorrectAt: string | null
  lastIncorrectAt: string | null
  /** 0–100, see masteryEngine.ts's computeMasteryScore for the formula. */
  masteryScore: number
  updatedAt: string
}

export type ReadinessStatus = 'needs_practice' | 'almost_ready' | 'ready_for_test'

export interface ReadinessSummary {
  status: ReadinessStatus
  total: number
  masteredCount: number
  almostMasteredCount: number
  learningCount: number
  notPracticedCount: number
  masteredPercent: number // 0-100, rounded
  recentCriticalErrors: number
}
