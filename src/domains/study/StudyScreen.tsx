import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFamily } from '../family/FamilyContext'
import { getActiveListForChild } from '../weeklyLists/weeklyListsService'
import { shuffle, spellOutLoud } from '../practice/practiceLogic'
import { speakLetters, speakWord } from '../speech/speechService'
import { ProgressBar } from '../../components/ProgressBar'
import { themeNameForColor } from '../../lib/theme'

export function StudyScreen() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const { mode, children } = useFamily()
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
