import { describe, expect, it } from 'vitest'
import {
  applyHintUsed,
  applyRevealAnswer,
  applySubmission,
  firstLetterHint,
  initialAttemptState,
  isCorrectAnswer,
  normalizeAnswer,
  shuffle,
  showHelpMenu,
  spellOutLoud,
  summarizeResults,
} from './practiceLogic'

describe('normalizeAnswer / isCorrectAnswer', () => {
  it('ignores case and surrounding whitespace', () => {
    expect(normalizeAnswer('  TwIce  ')).toBe('twice')
    expect(isCorrectAnswer('  TwIce  ', 'twice')).toBe(true)
  })

  it('collapses internal double spaces but does not accept different words', () => {
    expect(normalizeAnswer('wild  life')).toBe('wild life')
    expect(isCorrectAnswer('wild life', 'wildlife')).toBe(false)
  })
})

describe('shuffle', () => {
  it('preserves all elements and does not mutate the input', () => {
    const original = ['a', 'b', 'c', 'd', 'e']
    const copy = [...original]
    const shuffled = shuffle(original)
    expect(original).toEqual(copy)
    expect(shuffled.sort()).toEqual(copy.sort())
  })
})

describe('word attempt state machine', () => {
  it('resolves correctly on a right answer and tracks attempts', () => {
    let state = initialAttemptState()
    state = applySubmission(state, 'clim', 'climb')
    expect(state.resolved).toBe(false)
    expect(state.attempts).toBe(1)

    state = applySubmission(state, 'climb', 'climb')
    expect(state.resolved).toBe(true)
    expect(state.correct).toBe(true)
    expect(state.attempts).toBe(2)
  })

  it('shows the help menu only after ATTEMPTS_BEFORE_HELP_MENU wrong tries', () => {
    let state = initialAttemptState()
    expect(showHelpMenu(state)).toBe(false)
    state = applySubmission(state, 'x', 'climb')
    expect(showHelpMenu(state)).toBe(false)
    state = applySubmission(state, 'y', 'climb')
    expect(showHelpMenu(state)).toBe(true)
  })

  it('ignores further submissions once resolved', () => {
    let state = initialAttemptState()
    state = applySubmission(state, 'climb', 'climb')
    const resolvedAttempts = state.attempts
    state = applySubmission(state, 'anything', 'climb')
    expect(state.attempts).toBe(resolvedAttempts)
  })

  it('marks usedHint without resolving the word', () => {
    let state = initialAttemptState()
    state = applyHintUsed(state)
    expect(state.usedHint).toBe(true)
    expect(state.resolved).toBe(false)
  })

  it('reveal answer resolves the word as incorrect', () => {
    let state = initialAttemptState()
    state = applyRevealAnswer(state)
    expect(state.resolved).toBe(true)
    expect(state.correct).toBe(false)
    expect(state.revealedAnswer).toBe(true)
  })
})

describe('hints', () => {
  it('firstLetterHint uppercases the first character', () => {
    expect(firstLetterHint('height')).toBe('H')
  })

  it('spellOutLoud produces dash-spaced uppercase letters', () => {
    expect(spellOutLoud('cat')).toBe('C - A - T')
  })
})

describe('summarizeResults', () => {
  it('computes score, percentage, and missed words', () => {
    const words = ['climb', 'height', 'chief']
    const perWord = [
      { ...initialAttemptState(), resolved: true, correct: true },
      { ...initialAttemptState(), resolved: true, correct: false, revealedAnswer: true },
      { ...initialAttemptState(), resolved: true, correct: true },
    ]
    const summary = summarizeResults(words, perWord)
    expect(summary.totalWords).toBe(3)
    expect(summary.correctWords).toBe(2)
    expect(summary.percentage).toBe(67)
    expect(summary.missedWords).toEqual(['height'])
  })

  it('handles an empty list without dividing by zero', () => {
    const summary = summarizeResults([], [])
    expect(summary.percentage).toBe(0)
  })
})
