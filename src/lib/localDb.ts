import type {
  AnalyticsEvent,
  Child,
  Family,
  PracticeAnswer,
  PracticeSession,
  Subscription,
  WeeklyList,
  WeeklyWord,
  WordMasteryRecord,
} from '../domains/shared/types'

// Guest/local mode persistence. Table shapes match Postgres 1:1 (see
// domains/shared/types.ts) so `migrateGuestToCloud` can copy rows verbatim.
// Everything lives under one localStorage key as a single JSON blob — simple,
// synchronous, and plenty fast for one family's worth of data.

const STORAGE_KEY = 'spelling_local_db_v3'

export interface LocalDbShape {
  family: Family | null
  subscription: Subscription | null
  children: Child[]
  lists: WeeklyList[]
  words: WeeklyWord[]
  sessions: PracticeSession[]
  answers: PracticeAnswer[]
  analytics: AnalyticsEvent[]
  wordMastery: WordMasteryRecord[]
}

function emptyDb(): LocalDbShape {
  return {
    family: null,
    subscription: null,
    children: [],
    lists: [],
    words: [],
    sessions: [],
    answers: [],
    analytics: [],
    wordMastery: [],
  }
}

export function loadLocalDb(): LocalDbShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return emptyDb()
    const parsed = JSON.parse(raw)
    return { ...emptyDb(), ...parsed }
  } catch (error) {
    console.warn('Could not read local data, starting fresh.', error)
    return emptyDb()
  }
}

export function saveLocalDb(db: LocalDbShape): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db))
  } catch (error) {
    console.error('Could not save local data', error)
  }
}

export function clearLocalDb(): void {
  localStorage.removeItem(STORAGE_KEY)
}

export function newId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID()
  return `id_${Date.now()}_${Math.random().toString(36).slice(2)}`
}

/** Convenience read-modify-write helper so callers don't repeat load/save boilerplate. */
export function updateLocalDb(mutator: (db: LocalDbShape) => void): LocalDbShape {
  const db = loadLocalDb()
  mutator(db)
  saveLocalDb(db)
  return db
}

export const LOCAL_PARENT_PIN_KEY = 'spelling_local_parent_pin'
