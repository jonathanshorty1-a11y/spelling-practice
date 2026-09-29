import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFamily } from '../family/FamilyContext'
import { getLastScorePercentage } from '../children/childrenService'
import { getActiveListForChild } from '../weeklyLists/weeklyListsService'
import { getMasteryForList } from '../mastery/masteryService'
import { themeNameForColor } from '../../lib/theme'

interface ChildSummary {
  masteredCount: number | null
  total: number | null
  lastScore: number | null
}

export function HomeScreen() {
  const navigate = useNavigate()
  const { mode, children, loading } = useFamily()
  const [summaries, setSummaries] = useState<Record<string, ChildSummary>>({})

  useEffect(() => {
    let active = true
    Promise.all(
      children.map(async (c) => {
        const [lastScore, activeList] = await Promise.all([
          getLastScorePercentage(mode, c.id),
          getActiveListForChild(mode, c.id),
        ])
        if (!activeList) return [c.id, { masteredCount: null, total: null, lastScore }] as const
        const mastery = await getMasteryForList(mode, c.id, activeList.list.id)
        const masteredCount = Array.from(mastery.values()).filter((m) => m.status === 'mastered').length
        return [c.id, { masteredCount, total: activeList.words.length, lastScore }] as const
      }),
    ).then((entries) => {
      if (!active) return
      setSummaries(Object.fromEntries(entries))
    })
    return () => {
      active = false
    }
  }, [mode, children])

  if (loading) {
    return (
      <div className="screen">
        <div className="content content-center grow">
          <p className="muted">Loading…</p>
        </div>
      </div>
    )
  }

  return (
    <div className="screen">
      <button className="icon-btn top-right" onClick={() => navigate('/parent')} aria-label="Parent Area">
        ⚙️
      </button>

      <div className="content content-center grow">
        <h1 style={{ fontSize: '2rem', margin: 0 }}>Who's practicing today?</h1>

        <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', marginTop: 24 }}>
          {children.map((child) => (
            <button
              key={child.id}
              className="card"
              data-theme={themeNameForColor(child.themeColor)}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 10,
                minWidth: 180,
                border: '4px solid var(--accent-bg)',
              }}
              onClick={() => navigate(`/child/${child.id}`)}
            >
              <span style={{ fontSize: '3.2rem' }}>{child.avatar}</span>
              <span style={{ fontSize: '1.3rem', fontWeight: 800 }}>{child.name}</span>
              {summaries[child.id]?.total != null ? (
                <span className="pill">
                  {summaries[child.id].masteredCount} / {summaries[child.id].total} mastered
                </span>
              ) : summaries[child.id]?.lastScore != null ? (
                <span className="pill">Last score: {summaries[child.id].lastScore}%</span>
              ) : null}
            </button>
          ))}

          <button
            className="card"
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 10,
              minWidth: 180,
              border: '3px dashed var(--border)',
              boxShadow: 'none',
            }}
            onClick={() => navigate('/add-child')}
          >
            <span style={{ fontSize: '2rem' }}>➕</span>
            <span style={{ fontWeight: 700 }}>Add Child</span>
          </button>
        </div>
      </div>
    </div>
  )
}
