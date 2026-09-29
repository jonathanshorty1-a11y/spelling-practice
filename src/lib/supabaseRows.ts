// Maps between Postgres row shapes (snake_case, as defined in
// supabase/migrations/0001_init.sql) and the camelCase domain types the rest
// of the app uses. Keeping this mapping in one place means a column rename
// only ever needs to change here.

import type {
  Child,
  Family,
  PracticeAnswer,
  PracticeSession,
  Subscription,
  WeeklyList,
  WeeklyWord,
  WordMasteryRecord,
} from '../domains/shared/types'

export interface FamilyRow {
  id: string
  owner_user_id: string | null
  email: string | null
  parent_pin_hash: string | null
  parent_language: string | null
  created_at: string
}
export const familyFromRow = (r: FamilyRow): Family => ({
  id: r.id,
  ownerUserId: r.owner_user_id,
  email: r.email,
  parentPinHash: r.parent_pin_hash,
  parentLanguage: r.parent_language === 'es' ? 'es' : 'en',
  createdAt: r.created_at,
})

export interface ChildRow {
  id: string
  family_id: string
  name: string
  avatar: string
  theme_color: string
  grade: string | null
  created_at: string
}
export const childFromRow = (r: ChildRow): Child => ({
  id: r.id,
  familyId: r.family_id,
  name: r.name,
  avatar: r.avatar,
  themeColor: r.theme_color,
  grade: r.grade,
  createdAt: r.created_at,
})
export const childToRow = (c: Omit<Child, 'id' | 'createdAt'>) => ({
  family_id: c.familyId,
  name: c.name,
  avatar: c.avatar,
  theme_color: c.themeColor,
  grade: c.grade,
})

export interface WeeklyListRow {
  id: string
  child_id: string
  family_id: string
  title: string
  week_start: string | null
  week_end: string | null
  test_date: string | null
  created_at: string
  archived: boolean
}
export const weeklyListFromRow = (r: WeeklyListRow): WeeklyList => ({
  id: r.id,
  childId: r.child_id,
  familyId: r.family_id,
  title: r.title,
  weekStart: r.week_start,
  weekEnd: r.week_end,
  testDate: r.test_date,
  createdAt: r.created_at,
  archived: r.archived,
})
export const weeklyListToRow = (l: Omit<WeeklyList, 'id' | 'createdAt'>) => ({
  child_id: l.childId,
  family_id: l.familyId,
  title: l.title,
  week_start: l.weekStart,
  week_end: l.weekEnd,
  test_date: l.testDate,
  archived: l.archived,
})

export interface WeeklyWordRow {
  id: string
  list_id: string
  word: string
  order_index: number
  example_sentence: string | null
}
export const weeklyWordFromRow = (r: WeeklyWordRow): WeeklyWord => ({
  id: r.id,
  listId: r.list_id,
  word: r.word,
  orderIndex: r.order_index,
  exampleSentence: r.example_sentence,
})
export const weeklyWordToRow = (w: Omit<WeeklyWord, 'id'>) => ({
  list_id: w.listId,
  word: w.word,
  order_index: w.orderIndex,
  example_sentence: w.exampleSentence,
})

export interface PracticeSessionRow {
  id: string
  family_id: string
  child_id: string
  list_id: string
  mode: 'full' | 'mistakes'
  practice_type: PracticeSession['practiceType']
  started_at: string
  completed_at: string | null
  total_words: number
  correct_words: number
  percentage: number
}
export const sessionFromRow = (r: PracticeSessionRow): PracticeSession => ({
  id: r.id,
  familyId: r.family_id,
  childId: r.child_id,
  listId: r.list_id,
  mode: r.mode,
  practiceType: r.practice_type ?? 'practice_test',
  startedAt: r.started_at,
  completedAt: r.completed_at,
  totalWords: r.total_words,
  correctWords: r.correct_words,
  percentage: r.percentage,
})
export const sessionToRow = (s: Omit<PracticeSession, 'id'>) => ({
  family_id: s.familyId,
  child_id: s.childId,
  list_id: s.listId,
  mode: s.mode,
  practice_type: s.practiceType,
  started_at: s.startedAt,
  completed_at: s.completedAt,
  total_words: s.totalWords,
  correct_words: s.correctWords,
  percentage: s.percentage,
})

export interface PracticeAnswerRow {
  id: string
  session_id: string
  word_id: string
  word: string
  typed_answer: string
  correct: boolean
  attempts: number
  used_hint: boolean
  revealed_answer: boolean
}
export const answerFromRow = (r: PracticeAnswerRow): PracticeAnswer => ({
  id: r.id,
  sessionId: r.session_id,
  wordId: r.word_id,
  word: r.word,
  typedAnswer: r.typed_answer,
  correct: r.correct,
  attempts: r.attempts,
  usedHint: r.used_hint,
  revealedAnswer: r.revealed_answer,
})
export const answerToRow = (a: Omit<PracticeAnswer, 'id'>) => ({
  session_id: a.sessionId,
  word_id: a.wordId,
  word: a.word,
  typed_answer: a.typedAnswer,
  correct: a.correct,
  attempts: a.attempts,
  used_hint: a.usedHint,
  revealed_answer: a.revealedAnswer,
})

export interface SubscriptionRow {
  id: string
  family_id: string
  status: Subscription['status']
  trial_started_at: string | null
  trial_ends_at: string | null
  free_answers_used: number
  free_answers_limit: number
  premium_started_at: string | null
  premium_ends_at: string | null
  provider: string | null
  provider_customer_id: string | null
  provider_subscription_id: string | null
}
export const subscriptionFromRow = (r: SubscriptionRow): Subscription => ({
  id: r.id,
  familyId: r.family_id,
  status: r.status,
  trialStartedAt: r.trial_started_at,
  trialEndsAt: r.trial_ends_at,
  freeAnswersUsed: r.free_answers_used,
  freeAnswersLimit: r.free_answers_limit,
  premiumStartedAt: r.premium_started_at,
  premiumEndsAt: r.premium_ends_at,
  provider: r.provider,
  providerCustomerId: r.provider_customer_id,
  providerSubscriptionId: r.provider_subscription_id,
})

export interface WordMasteryRow {
  id: string
  family_id: string
  child_id: string
  list_id: string
  word_id: string
  status: WordMasteryRecord['status']
  correct_attempts: number
  incorrect_attempts: number
  consecutive_correct: number
  sessions_seen: number
  hints_used: number
  reveals_used: number
  recent_results: WordMasteryRecord['recentResults']
  last_session_id: string | null
  last_practiced_at: string | null
  last_correct_at: string | null
  last_incorrect_at: string | null
  mastery_score: number
  updated_at: string
}
export const wordMasteryFromRow = (r: WordMasteryRow): WordMasteryRecord => ({
  id: r.id,
  familyId: r.family_id,
  childId: r.child_id,
  listId: r.list_id,
  wordId: r.word_id,
  status: r.status,
  correctAttempts: r.correct_attempts,
  incorrectAttempts: r.incorrect_attempts,
  consecutiveCorrect: r.consecutive_correct,
  sessionsSeen: r.sessions_seen,
  hintsUsed: r.hints_used,
  revealsUsed: r.reveals_used,
  recentResults: r.recent_results ?? [],
  lastSessionId: r.last_session_id,
  lastPracticedAt: r.last_practiced_at,
  lastCorrectAt: r.last_correct_at,
  lastIncorrectAt: r.last_incorrect_at,
  masteryScore: r.mastery_score,
  updatedAt: r.updated_at,
})
export const wordMasteryToRow = (m: Omit<WordMasteryRecord, 'id'>) => ({
  family_id: m.familyId,
  child_id: m.childId,
  list_id: m.listId,
  word_id: m.wordId,
  status: m.status,
  correct_attempts: m.correctAttempts,
  incorrect_attempts: m.incorrectAttempts,
  consecutive_correct: m.consecutiveCorrect,
  sessions_seen: m.sessionsSeen,
  hints_used: m.hintsUsed,
  reveals_used: m.revealsUsed,
  recent_results: m.recentResults,
  last_session_id: m.lastSessionId,
  last_practiced_at: m.lastPracticedAt,
  last_correct_at: m.lastCorrectAt,
  last_incorrect_at: m.lastIncorrectAt,
  mastery_score: m.masteryScore,
  updated_at: m.updatedAt,
})
