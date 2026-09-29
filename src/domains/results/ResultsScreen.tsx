import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useFamily } from '../family/FamilyContext'
import { SaveProgressCard } from '../onboarding/SaveProgressCard'
import { themeNameForColor } from '../../lib/theme'
import { useT } from '../../lib/i18n'
import type { PracticeType, ReadinessStatus } from '../shared/types'

interface ResultsLocationState {
  justCompleted?: boolean
  practiceType?: PracticeType
  totalWords: number
  correctWords: number
  percentage: number
  readiness?: { status: ReadinessStatus } | null
  missedWordRefs: { id: string; word: string }[]
  listId: string | null
}

export function ResultsScreen() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const { mode, children, family } = useFamily()
  const { t } = useT()
  const child = children.find((c) => c.id === childId)
  const state = location.state as ResultsLocationState | null

  if (!child) {
    return (
      <div className="screen">
        <div className="content content-center grow">
          <p>Child not found.</p>
        </div>
      </div>
    )
  }

  if (!state?.justCompleted) {
    return (
      <div className="screen" data-theme={themeNameForColor(child.themeColor)}>
        <header className="screen-header">
          <button className="icon-btn" onClick={() => navigate(`/child/${child.id}`)} aria-label="Back">
            ←
          </button>
          <h2 className="screen-title">Great Job!</h2>
          <span className="header-spacer" />
        </header>
        <div className="content content-center grow">
          <p className="muted">Finish a Practice Test to see your results here.</p>
          <button className="btn btn-primary" onClick={() => navigate(`/child/${child.id}/practice`)}>
            Start Practice Test
          </button>
        </div>
      </div>
    )
  }

  const isGuest = mode === 'local'
  const hasMissed = state.missedWordRefs.length > 0
  const stillNeeded = state.totalWords - state.correctWords

  return (
    <div className="screen" data-theme={themeNameForColor(child.themeColor)}>
      <header className="screen-header">
        <span className="header-spacer" />
        <h2 className="screen-title">Great job, {child.name}!</h2>
        <span className="header-spacer" />
      </header>

      <div className="content content-center">
        <div
          style={{
            width: 180,
            height: 180,
            borderRadius: '50%',
            background: 'var(--accent-bg)',
            border: '8px solid var(--accent)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 4,
          }}
        >
          <span style={{ fontWeight: 800, color: 'var(--accent-dark)' }}>
            {state.correctWords} / {state.totalWords}
          </span>
          <span style={{ fontSize: '2rem', fontWeight: 900, color: 'var(--accent-dark)' }}>{state.percentage}%</span>
        </div>

        <div className="stack" style={{ textAlign: 'center', gap: 4 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{t('practiceComplete.title')}</p>
          {state.correctWords > 0 && <p className="muted" style={{ margin: 0 }}>{t('practiceComplete.improved', { count: state.correctWords })}</p>}
          {stillNeeded > 0 && <p className="muted" style={{ margin: 0 }}>{t('practiceComplete.stillNeeded', { count: stillNeeded })}</p>}
          {state.readiness && (
            <p className="pill" style={{ marginTop: 8 }}>
              {t('practiceComplete.readiness', { status: t(`readiness.${state.readiness.status}`) })}
            </p>
          )}
        </div>

        {hasMissed ? (
          <div className="card" style={{ width: '100%', maxWidth: 500 }}>
            <h3 className="muted" style={{ marginTop: 0 }}>
              Words to Practice
            </h3>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {state.missedWordRefs.map((w) => (
                <span
                  key={w.id}
                  style={{ background: 'var(--red-bg)', color: 'var(--red)', fontWeight: 700, padding: '6px 12px', borderRadius: 999 }}
                >
                  {w.word}
                </span>
              ))}
            </div>
          </div>
        ) : (
          <p style={{ fontWeight: 700, color: 'var(--green)' }}>Perfect score! ✨</p>
        )}

        <div className="stack" style={{ width: '100%', maxWidth: 360 }}>
          {hasMissed && (
            <button
              className="btn btn-primary btn-big"
              onClick={() =>
                navigate(`/child/${child.id}/practice`, {
                  state: { mistakeWords: state.missedWordRefs, listId: state.listId, practiceType: 'weak_words' },
                })
              }
            >
              Practice These Words
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => navigate(`/child/${child.id}/practice`)}>
            Try Again
          </button>
          <button className="btn btn-outline" onClick={() => navigate(`/child/${child.id}`)}>
            Done
          </button>
        </div>

        {isGuest && !family?.email && <SaveProgressCard />}
      </div>
    </div>
  )
}
