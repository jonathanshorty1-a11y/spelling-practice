import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFamily } from '../family/FamilyContext'
import { getActiveListForChild } from '../weeklyLists/weeklyListsService'
import { shuffle, spellOutLoud } from '../practice/practiceLogic'
import { speakLetters, speakWord } from '../speech/speechService'
import { startSession, completeSession } from '../practice/practiceService'
import { ProgressBar } from '../../components/ProgressBar'
import { themeNameForColor } from '../../lib/theme'

export function StudyScreen() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const { mode, family, children } = useFamily()
  const child = children.find((c) => c.id === childId)

  const [words, setWords] = useState<string[] | null>(null)
  const [index, setIndex] = useState(0)
  const [showWord, setShowWord] = useState(false)
  const [showSlow, setShowSlow] = useState(false)

  useEffect(() => {
    if (!childId) return
    getActiveListForChild(mode, childId).then((result) => {
      setWords(result ? result.words.map((w) => w.word) : [])
    })
  }, [mode, childId])

  // Log that a study session happened (practice_type: 'study') — not
  // scored (no correct/incorrect concept in Study Mode), so it's logged as
  // a single completed session the moment the child opens this screen with
  // words to browse, rather than instrumenting every Listen/Next tap.
  useEffect(() => {
    if (!childId || !family || !words || words.length === 0) return
    let cancelled = false
    ;(async () => {
      const active = await getActiveListForChild(mode, childId)
      if (!active || cancelled) return
      const session = await startSession(mode, {
        familyId: family.id,
        childId,
        listId: active.list.id,
        mode: 'full',
        practiceType: 'study',
        totalWords: active.words.length,
      })
      if (cancelled) return
      await completeSession(mode, { sessionId: session.id, totalWords: active.words.length, correctWords: 0, percentage: 0 })
    })()
    return () => {
      cancelled = true
    }
    // Only once per mount for this child/list — not on every word navigation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [childId, family?.id, words !== null])

  const word = words?.[index] ?? ''

  function goNext() {
    if (!words) return
    setIndex(words.length - 1 === index ? 0 : index + 1)
    setShowWord(false)
    setShowSlow(false)
  }
  function goPrev() {
    setIndex(Math.max(0, index - 1))
    setShowWord(false)
    setShowSlow(false)
  }
  function doShuffle() {
    if (!words) return
    setWords(shuffle(words))
    setIndex(0)
    setShowWord(false)
    setShowSlow(false)
  }

  if (!child || !words) {
    return (
      <div className="screen">
        <div className="content content-center grow">
          <p className="muted">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen" data-theme={themeNameForColor(child.themeColor)}>
      <header className="screen-header">
        <button className="icon-btn" onClick={() => navigate(`/child/${child.id}`)} aria-label="Back">
          ←
        </button>
        <h2 className="screen-title">Study</h2>
        <button className="icon-btn" onClick={doShuffle} aria-label="Shuffle">
          🔀
        </button>
      </header>

      <div className="content">
        <ProgressBar current={index + 1} total={words.length} />

        <div className="card content-center" style={{ minHeight: 160 }}>
          {showWord ? (
            <span style={{ fontSize: '2.6rem', fontWeight: 800 }}>{word}</span>
          ) : (
            <span className="muted">Tap "Listen" to hear the word</span>
          )}
          {showSlow && (
            <p style={{ fontSize: '1.5rem', fontWeight: 700, letterSpacing: 2, color: 'var(--accent-dark)' }}>
              {spellOutLoud(word)}
            </p>
          )}
        </div>

        <div className="btn-row">
          <button className="btn btn-primary btn-big" style={{ flex: 2 }} onClick={() => speakWord(word)}>
            🔊 Listen
          </button>
          <button className="btn btn-secondary" onClick={() => speakWord(word)}>
            🔁 Repeat
          </button>
        </div>

        <div className="btn-row">
          <button className="btn btn-outline" onClick={() => setShowWord((v) => !v)}>
            👁️ Show Word
          </button>
          <button
            className="btn btn-outline"
            onClick={() => {
              setShowSlow(true)
              speakLetters(word)
            }}
          >
            🐢 Spell It
          </button>
        </div>

        <div className="btn-row push-bottom">
          <button className="btn" onClick={goPrev} disabled={index === 0}>
            ◀ Previous
          </button>
          <button className="btn btn-primary" onClick={goNext}>
            Next ▶
          </button>
        </div>
      </div>
    </div>
  )
}
