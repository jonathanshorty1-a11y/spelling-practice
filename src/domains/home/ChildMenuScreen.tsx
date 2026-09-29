import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useFamily } from '../family/FamilyContext'
import { getActiveListForChild, type ListWithWords } from '../weeklyLists/weeklyListsService'
import { getMasteryForList } from '../mastery/masteryService'
import { calculateReadiness } from '../mastery/readiness'
import { getRecommendedPractice, type RecommendedPracticeType } from '../mastery/recommendedPractice'
import type { PracticeType, ReadinessSummary } from '../shared/types'
import { themeNameForColor } from '../../lib/theme'

const RECOMMENDATION_TO_PRACTICE_TYPE: Record<RecommendedPracticeType, PracticeType> = {
  start_basics: 'smart_practice',
  smart_practice: 'smart_practice',
  final_review: 'final_review',
  light_review: 'quick_practice',
}

const RECOMMENDATION_LABEL: Record<RecommendedPracticeType, string> = {
  start_basics: 'Start Practicing',
  smart_practice: 'Continue Practice',
  final_review: 'Final Review',
  light_review: 'Quick Review',
}

function formatTestDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  const today = new Date()
  const tomorrow = new Date(today)
  tomorrow.setDate(today.getDate() + 1)
  if (date.toDateString() === today.toDateString()) return 'today'
  if (date.toDateString() === tomorrow.toDateString()) return 'tomorrow'
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

export function ChildMenuScreen() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const { mode, children } = useFamily()
  const child = children.find((c) => c.id === childId)
  const [activeList, setActiveList] = useState<ListWithWords | null | undefined>(undefined)
  const [readiness, setReadiness] = useState<ReadinessSummary | null>(null)

  useEffect(() => {
    if (!childId) return
    let active = true
    getActiveListForChild(mode, childId).then(async (result) => {
      if (!active) return
      setActiveList(result)
      if (result) {
        const mastery = await getMasteryForList(mode, childId, result.list.id)
        if (!active) return
        setReadiness(calculateReadiness(Array.from(mastery.values()), result.words.length))
      }
    })
    return () => {
      active = false
    }
  }, [mode, childId])

  if (!child) {
    return (
      <div className="screen">
        <div className="content content-center grow">
          <p>Child not found.</p>
          <button className="btn btn-primary" onClick={() => navigate('/home')}>
            Back Home
          </button>
        </div>
      </div>
    )
  }

  const hasWords = activeList && activeList.words.length > 0
  const recommendation =
    hasWords && readiness
      ? getRecommendedPractice({ readiness, testDate: activeList.list.testDate })
      : null

  return (
    <div className="screen" data-theme={themeNameForColor(child.themeColor)}>
      <header className="screen-header">
        <button className="icon-btn" onClick={() => navigate('/home')} aria-label="Back">
          ←
        </button>
        <h2 className="screen-title">{child.name}</h2>
        <span className="header-spacer" />
      </header>

      {!hasWords && activeList !== undefined ? (
        <div className="content content-center grow">
          <p className="muted center">Add this week's spelling words to get started.</p>
          <button className="btn btn-primary btn-big" onClick={() => navigate(`/child/${child.id}/add-words`)}>
            Add This Week's Words
          </button>
        </div>
      ) : (
        <div className="content content-center">
          <h1 style={{ fontSize: '1.8rem', margin: '0 0 4px 0' }}>Hi {child.name} 👋</h1>

          {activeList?.list.testDate && (
            <p className="muted" style={{ margin: 0 }}>
              Your spelling test is {formatTestDate(activeList.list.testDate)}.
            </p>
          )}

          {readiness && (
            <p className="pill" style={{ marginTop: 8 }}>
              {readiness.masteredCount} / {readiness.total} words mastered
            </p>
          )}

          {recommendation && (
            <div className="stack" style={{ width: '100%', maxWidth: 360, marginTop: 24 }}>
              <button
                className="btn btn-primary btn-big"
                onClick={() =>
                  navigate(`/child/${child.id}/practice`, {
                    state: { practiceType: RECOMMENDATION_TO_PRACTICE_TYPE[recommendation.type] },
                  })
                }
              >
                {RECOMMENDATION_LABEL[recommendation.type]}
              </button>
              <p className="muted center" style={{ margin: 0, fontSize: '0.9rem' }}>
                About {recommendation.estimatedMinutes} minutes
              </p>
            </div>
          )}

          <div className="btn-row" style={{ maxWidth: 360, marginTop: 32 }}>
            <button className="btn btn-secondary" onClick={() => navigate(`/child/${child.id}/study`)}>
              📖 Study Words
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => navigate(`/child/${child.id}/practice`, { state: { practiceType: 'practice_test' } })}
            >
              ✏️ Practice Test
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
