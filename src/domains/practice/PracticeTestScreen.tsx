import { useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useFamily } from '../family/FamilyContext'
import { getActiveListForChild } from '../weeklyLists/weeklyListsService'
import {
  applyHintUsed,
  applyRevealAnswer,
  applySubmission,
  firstLetterHint,
  initialAttemptState,
  showHelpMenu,
  summarizeResults,
  type WordAttemptState,
} from './practiceLogic'
import { completeSession, recordAnswer, startSession } from './practiceService'
import { consumeFreeAnswer } from '../subscription/subscriptionService'
import { trackEvent, type AnalyticsEventName } from '../analytics/analyticsService'
import { speakSequence, speakWord } from '../speech/speechService'
import { ProgressBar } from '../../components/ProgressBar'
import { ConfirmModal } from '../../components/ConfirmModal'
import { themeNameForColor } from '../../lib/theme'
import { getMasteryForList, applyMasteryEvent } from '../mastery/masteryService'
import { reinsertMissedWord, selectWordsForPracticeType, type QueueWordRef, type QueuePracticeType } from '../mastery/practiceQueue'
import { calculateReadiness } from '../mastery/readiness'
import type { PracticeMode, PracticeType, WordMasteryRecord } from '../shared/types'

interface LocationState {
  mistakeWords?: QueueWordRef[]
  listId?: string
  practiceType?: PracticeType
  onboarding?: boolean
}

const TITLES: Record<PracticeType, string> = {
  practice_test: 'Practice Test',
  smart_practice: 'Practice',
  weak_words: 'Weak Words',
  quick_practice: 'Quick Practice',
  final_review: 'Final Review',
  study: 'Study',
}

const START_EVENTS: Partial<Record<PracticeType, AnalyticsEventName>> = {
  smart_practice: 'smart_practice_started',
  weak_words: 'weak_words_started',
  final_review: 'final_review_started',
}

export function PracticeTestScreen() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const locationState = (location.state as LocationState | null) ?? {}
  const practiceType: PracticeType = locationState.practiceType ?? (locationState.mistakeWords ? 'weak_words' : 'practice_test')
  const legacyMode: PracticeMode = practiceType === 'weak_words' ? 'mistakes' : 'full'

  const { mode, family, children, refreshSubscription, entitlements } = useFamily()
  const child = children.find((c) => c.id === childId)

  const [queue, setQueue] = useState<QueueWordRef[] | null>(null)
  const [listId, setListId] = useState<string | null>(null)
  const [totalWordsInList, setTotalWordsInList] = useState(0)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [masteryMap, setMasteryMap] = useState<Map<string, WordMasteryRecord>>(new Map())
  const [readinessBefore, setReadinessBefore] = useState<ReturnType<typeof calculateReadiness> | null>(null)

  const [index, setIndex] = useState(0)
  const [attemptState, setAttemptState] = useState<WordAttemptState>(initialAttemptState())
  const [typed, setTyped] = useState('')
  const [feedback, setFeedback] = useState<'correct' | 'incorrect' | null>(null)
  const [revealedLetter, setRevealedLetter] = useState<string | null>(null)
  const [revealedWord, setRevealedWord] = useState<string | null>(null)
  const [showExitConfirm, setShowExitConfirm] = useState(false)

  const retriedWordIds = useRef(new Set<string>())
  const finalOutcomeByWordId = useRef(new Map<string, boolean>())
  const inputRef = useRef<HTMLInputElement>(null)

  // ---- Load words + mastery + start the session ----
  useEffect(() => {
    if (!childId || !family) return
    ;(async () => {
      const active = await getActiveListForChild(mode, childId)
      if (!active) return

      const targetListId = locationState.listId ?? active.list.id
      const mastery = await getMasteryForList(mode, childId, targetListId)
      setMasteryMap(mastery)
      setListId(targetListId)
      setTotalWordsInList(active.words.length)
      setReadinessBefore(calculateReadiness(Array.from(mastery.values()), active.words.length))

      const sourceWords: QueueWordRef[] =
        locationState.mistakeWords ?? active.words.map((w) => ({ id: w.id, word: w.word }))
      const initialQueue = selectWordsForPracticeType(sourceWords, mastery, practiceType as QueuePracticeType)
      setQueue(initialQueue)

      const session = await startSession(mode, {
        familyId: family.id,
        childId,
        listId: targetListId,
        mode: legacyMode,
        practiceType,
        totalWords: initialQueue.length,
      })
      setSessionId(session.id)

      trackEvent(mode, 'practice_started', { childId, practiceType }, family.id)
      const dedicatedEvent = START_EVENTS[practiceType]
      if (dedicatedEvent) trackEvent(mode, dedicatedEvent, { childId, count: initialQueue.length }, family.id)
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, family?.id])

  const currentWord = queue?.[index]

  // ---- Speak "Number X" + word twice whenever a fresh question loads ----
  useEffect(() => {
    if (!currentWord) return
    speakSequence([
      { text: `Number ${index + 1}`, rate: 0.85 },
      { text: currentWord.word, rate: 0.78 },
      { text: currentWord.word, rate: 0.78 },
    ])
    setTimeout(() => inputRef.current?.focus(), 50)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [index, currentWord?.id])

  async function finishWord(finalState: WordAttemptState) {
    if (!currentWord || !sessionId || !listId || !family || !childId) return

    await recordAnswer(mode, {
      sessionId,
      wordId: currentWord.id,
      word: currentWord.word,
      typedAnswer: typed,
      correct: finalState.correct,
      attempts: finalState.attempts,
      usedHint: finalState.usedHint,
      revealedAnswer: finalState.revealedAnswer,
    })

    finalOutcomeByWordId.current.set(currentWord.id, finalState.correct)

    const prevRecord = masteryMap.get(currentWord.id) ?? null
    const nextRecord = await applyMasteryEvent(mode, {
      familyId: family.id,
      childId,
      listId,
      wordId: currentWord.id,
      event: {
        sessionId,
        correct: finalState.correct,
        usedHint: finalState.usedHint,
        revealedAnswer: finalState.revealedAnswer,
        at: new Date().toISOString(),
      },
    })
    setMasteryMap((prev) => new Map(prev).set(currentWord.id, nextRecord))

    if (prevRecord?.status !== 'mastered' && nextRecord.status === 'mastered') {
      trackEvent(mode, 'word_mastered', { childId, wordId: currentWord.id }, family.id)
    } else if (prevRecord?.status === 'mastered' && nextRecord.status !== 'mastered') {
      trackEvent(mode, 'word_mastery_lost', { childId, wordId: currentWord.id }, family.id)
    }

    // Spaced reinsertion: a word only shown/revealed (not gotten right) gets
    // ONE fresh shot later in this same session, a few questions later —
    // never immediately next (spec §7-8).
    if (finalState.revealedAnswer && !retriedWordIds.current.has(currentWord.id)) {
      retriedWordIds.current.add(currentWord.id)
      setQueue((prev) => (prev ? reinsertMissedWord(prev, index, currentWord) : prev))
    }
  }

  async function handleCheck() {
    if (!currentWord || !family) return
    const credit = await consumeFreeAnswer(mode, family.id)
    await refreshSubscription()
    if (!credit.allowed) {
      await finishSessionEarly()
      navigate('/paywall')
      return
    }
    trackEvent(mode, 'practice_answer_submitted', { childId, word: currentWord.word }, family.id)

    const next = applySubmission(attemptState, typed, currentWord.word)
    setAttemptState(next)
    if (next.correct) {
      setFeedback('correct')
      await finishWord(next)
    } else {
      setFeedback('incorrect')
    }
  }

  function handleShowFirstLetter() {
    setAttemptState((s) => applyHintUsed(s))
    setRevealedLetter(currentWord ? firstLetterHint(currentWord.word) : null)
  }

  async function handleShowAnswer() {
    if (!currentWord) return
    const next = applyRevealAnswer(attemptState)
    setAttemptState(next)
    setRevealedWord(currentWord.word)
    setFeedback('incorrect')
    await finishWord(next)
  }

  function buildSummary() {
    const uniqueWords = Array.from(finalOutcomeByWordId.current.keys())
    const wordTextById = new Map((queue ?? []).map((w) => [w.id, w.word]))
    const words = uniqueWords.map((id) => wordTextById.get(id) ?? id)
    const states = uniqueWords.map((id) => ({
      ...initialAttemptState(),
      resolved: true,
      correct: finalOutcomeByWordId.current.get(id) ?? false,
    }))
    return { summary: summarizeResults(words, states), uniqueWords }
  }

  async function finishSessionEarly() {
    if (!sessionId) return
    const { summary } = buildSummary()
    await completeSession(mode, {
      sessionId,
      totalWords: finalOutcomeByWordId.current.size,
      correctWords: summary.correctWords,
      percentage: summary.percentage,
    })
  }

  async function checkReadinessTransition() {
    if (!childId || !family || !listId || !readinessBefore) return
    const after = calculateReadiness(Array.from(masteryMap.values()), totalWordsInList)
    if (after.status !== readinessBefore.status) {
      trackEvent(mode, 'readiness_changed', { childId, from: readinessBefore.status, to: after.status }, family.id)
      if (after.status === 'ready_for_test') {
        trackEvent(mode, 'ready_for_test_reached', { childId }, family.id)
      }
    }
    return after
  }

  async function handleNext() {
    if (!queue) return
    if (index >= queue.length - 1) {
      const { summary, uniqueWords } = buildSummary()
      if (sessionId) {
        await completeSession(mode, {
          sessionId,
          totalWords: uniqueWords.length,
          correctWords: summary.correctWords,
          percentage: summary.percentage,
        })
      }
      trackEvent(mode, 'practice_completed', { childId, practiceType, ...summary }, family?.id ?? null)
      if (practiceType === 'smart_practice') {
        trackEvent(mode, 'smart_practice_completed', { childId, ...summary }, family?.id ?? null)
      }
      const readinessAfter = await checkReadinessTransition()

      const wordTextById = new Map(queue.map((w) => [w.id, w.word]))
      navigate(`/child/${childId}/results`, {
        state: {
          justCompleted: true,
          practiceType,
          totalWords: summary.totalWords,
          correctWords: summary.correctWords,
          percentage: summary.percentage,
          readiness: readinessAfter,
          missedWordRefs: uniqueWords
            .filter((id) => !finalOutcomeByWordId.current.get(id))
            .map((id) => ({ id, word: wordTextById.get(id) ?? id })),
          listId,
        },
      })
      return
    }
    setIndex((i) => i + 1)
    setAttemptState(initialAttemptState())
    setTyped('')
    setFeedback(null)
    setRevealedLetter(null)
    setRevealedWord(null)
  }

  function requestExit() {
    setShowExitConfirm(true)
  }

  if (!child || !queue || !currentWord) {
    return (
      <div className="screen">
        <div className="content content-center grow">
          <p className="muted">Loading…</p>
        </div>
      </div>
    )
  }

  const needsHelp = showHelpMenu(attemptState) && !attemptState.resolved

  return (
    <div className="screen" data-theme={themeNameForColor(child.themeColor)}>
      <header className="screen-header">
        <button className="icon-btn" onClick={requestExit} aria-label="Exit">
          ←
        </button>
        <h2 className="screen-title">{TITLES[practiceType]}</h2>
        <span className="header-spacer" />
      </header>

      <div className="content">
        {entitlements.status === 'free' && entitlements.freeAnswersRemaining != null && (
          <p className="muted center" style={{ margin: 0 }}>
            {entitlements.freeAnswersRemaining} free {entitlements.freeAnswersRemaining === 1 ? 'answer' : 'answers'}{' '}
            remaining
          </p>
        )}

        <ProgressBar current={index + 1} total={queue.length} />

        <div className="card content-center" style={{ gap: 16 }}>
          <p style={{ fontSize: '1.6rem', fontWeight: 800, color: 'var(--accent-dark)', margin: 0 }}>
            Question {index + 1} of {queue.length}
          </p>

          {feedback && (
            <p style={{ fontSize: '1.2rem', fontWeight: 700, color: feedback === 'correct' ? 'var(--green)' : 'var(--red)', margin: 0 }}>
              {feedback === 'correct' ? '✅ Correct!' : '❌ Try Again'}
            </p>
          )}
          {revealedLetter && !attemptState.resolved && (
            <p className="muted" style={{ margin: 0 }}>
              First letter: <strong>{revealedLetter}</strong>
            </p>
          )}
          {revealedWord && <p style={{ margin: 0, fontWeight: 700 }}>The word was: {revealedWord}</p>}

          <input
            ref={inputRef}
            className={`text-input text-input-big ${feedback === 'correct' ? 'correct' : feedback === 'incorrect' ? 'incorrect' : ''}`}
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (attemptState.resolved) void handleNext()
                else void handleCheck()
              }
            }}
            placeholder="Type the word"
            disabled={attemptState.resolved}
            autoCapitalize="off"
            autoCorrect="off"
            autoComplete="off"
            spellCheck={false}
          />

          <button className="btn btn-secondary" style={{ width: '100%' }} onClick={() => speakWord(currentWord.word, { times: 2 })}>
            🔊 Listen Again
          </button>

          {needsHelp && (
            <div className="stack" style={{ width: '100%' }}>
              <p className="muted" style={{ margin: 0, fontWeight: 700 }}>
                Need help?
              </p>
              <div className="btn-row">
                <button className="btn btn-outline" onClick={() => speakWord(currentWord.word, { times: 2 })}>
                  Hear Again
                </button>
                <button className="btn btn-outline" onClick={handleShowFirstLetter}>
                  First Letter
                </button>
                <button className="btn btn-outline" onClick={handleShowAnswer}>
                  Show Answer
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="push-bottom">
          {attemptState.resolved ? (
            <button className="btn btn-primary btn-big" onClick={handleNext}>
              {index >= queue.length - 1 ? 'See Results' : 'Next Word ▶'}
            </button>
          ) : (
            <button className="btn btn-primary btn-big" onClick={handleCheck} disabled={!typed.trim()}>
              Check
            </button>
          )}
        </div>
      </div>

      {showExitConfirm && (
        <ConfirmModal
          message="Are you sure you want to leave this test? Your progress on this word will be lost."
          confirmLabel="Leave Test"
          cancelLabel="Stay"
          onCancel={() => setShowExitConfirm(false)}
          onConfirm={async () => {
            await finishSessionEarly()
            navigate(`/child/${childId}`)
          }}
        />
      )}
    </div>
  )
}
