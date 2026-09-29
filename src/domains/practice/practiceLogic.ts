// Pure, framework-free logic for the Practice Test flow. Kept separate from
// PracticeTestScreen.tsx so it can be unit tested without React or a DOM.

export function shuffle<T>(items: T[]): T[] {
  const copy = items.slice()
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

export function normalizeAnswer(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, ' ')
}

export function isCorrectAnswer(typed: string, word: string): boolean {
  return normalizeAnswer(typed) === normalizeAnswer(word)
}

/** After this many wrong submissions on the same word, show the "Need help?" menu. */
export const ATTEMPTS_BEFORE_HELP_MENU = 2

export interface WordAttemptState {
  attempts: number
  usedHint: boolean
  revealedAnswer: boolean
  resolved: boolean
  correct: boolean
}

export function initialAttemptState(): WordAttemptState {
  return { attempts: 0, usedHint: false, revealedAnswer: false, resolved: false, correct: false }
}

export function showHelpMenu(state: WordAttemptState): boolean {
  return !state.resolved && state.attempts >= ATTEMPTS_BEFORE_HELP_MENU
}

/** Applies one submitted answer to the running per-word state. Pure — returns a new state. */
export function applySubmission(state: WordAttemptState, typed: string, word: string): WordAttemptState {
  if (state.resolved) return state
  const attempts = state.attempts + 1
  if (isCorrectAnswer(typed, word)) {
    return { ...state, attempts, resolved: true, correct: true }
  }
  return { ...state, attempts }
}

export function applyHintUsed(state: WordAttemptState): WordAttemptState {
  return { ...state, usedHint: true }
}

export function applyRevealAnswer(state: WordAttemptState): WordAttemptState {
  return { ...state, revealedAnswer: true, resolved: true, correct: false }
}

export function firstLetterHint(word: string): string {
  return word.trim().charAt(0).toUpperCase()
}

export function spellOutLoud(word: string): string {
  return word.toUpperCase().split('').join(' - ')
}

export interface ScoreSummary {
  totalWords: number
  correctWords: number
  percentage: number
  missedWords: string[]
}

export function summarizeResults(words: string[], perWord: WordAttemptState[]): ScoreSummary {
  const correctWords = perWord.filter((w) => w.correct).length
  const missedWords = words.filter((_, i) => !perWord[i]?.correct)
  const percentage = words.length === 0 ? 0 : Math.round((correctWords / words.length) * 100)
  return { totalWords: words.length, correctWords, percentage, missedWords }
}
