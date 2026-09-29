import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getAdminFamilies,
  getAdminOverview,
  isCurrentUserAdmin,
  runAdminTestAction,
  type AdminFamilyRow,
  type AdminOverview,
} from './adminService'

export function AdminScreen() {
  const navigate = useNavigate()
  const [allowed, setAllowed] = useState<boolean | null>(null)
  const [overview, setOverview] = useState<AdminOverview | null>(null)
  const [families, setFamilies] = useState<AdminFamilyRow[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)

  async function load() {
    const [ov, fams] = await Promise.all([getAdminOverview(), getAdminFamilies()])
    setOverview(ov)
    setFamilies(fams)
  }

  useEffect(() => {
    isCurrentUserAdmin().then((ok) => {
      setAllowed(ok)
      if (ok) load()
    })
  }, [])

  async function handleAction(familyId: string, action: 'activate_premium' | 'set_free' | 'reset_trial') {
    setBusyId(familyId)
    try {
      await runAdminTestAction(familyId, action)
      await load()
    } finally {
      setBusyId(null)
    }
  }

  if (allowed === null) {
    return (
      <div className="screen">
        <div className="content content-center grow">
          <p className="muted">Checking access…</p>
        </div>
      </div>
    )
  }

  if (!allowed) {
    return (
      <div className="screen">
        <div className="content content-center grow">
          <p>You don't have access to this page.</p>
          <button className="btn btn-primary" onClick={() => navigate('/home')}>
            Back Home
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="screen" data-mode="parent">
      <header className="screen-header">
        <button className="icon-btn" onClick={() => navigate('/parent')} aria-label="Back">
          ←
        </button>
        <h2 className="screen-title">Admin</h2>
        <span className="header-spacer" />
      </header>

      <div className="content">
        <p className="pill" style={{ alignSelf: 'flex-start' }}>
          Testing tools — not visible to families
        </p>

        {overview && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
            <span className="pill">Families: {overview.totalFamilies}</span>
            <span className="pill">Active trials: {overview.activeTrials}</span>
            <span className="pill">Free: {overview.freeAccounts}</span>
            <span className="pill">Premium: {overview.premiumAccounts}</span>
            <span className="pill">Children: {overview.totalChildren}</span>
            <span className="pill">Sessions: {overview.totalSessions}</span>
            <span className="pill">Answers: {overview.totalAnswers}</span>
            <span className="pill">Words practiced: {overview.wordsPracticed}</span>
            <span className="pill">Words mastered: {overview.wordsMastered}</span>
            <span className="pill">Ready for test: {overview.familiesReadyForTest}</span>
            {overview.avgSessionsBeforeReady != null && (
              <span className="pill">Avg sessions/child: {overview.avgSessionsBeforeReady}</span>
            )}
          </div>
        )}

        <div className="stack">
          {families.map((f) => (
            <div key={f.familyId} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{f.email ?? '(no email)'}</div>
                  <div className="muted" style={{ fontSize: '0.85rem' }}>
                    {new Date(f.createdAt).toLocaleDateString()} · {f.childrenCount} children · {f.listsCount} lists ·{' '}
                    {f.sessionsCount} sessions · {f.freeAnswersUsed} answers used
                  </div>
                </div>
                <span className="pill" style={{ textTransform: 'capitalize' }}>
                  {f.status}
                </span>
              </div>
              <div className="btn-row" style={{ marginTop: 10 }}>
                <button
                  className="btn btn-outline"
                  disabled={busyId === f.familyId}
                  onClick={() => handleAction(f.familyId, 'activate_premium')}
                >
                  Activate Premium
                </button>
                <button className="btn btn-outline" disabled={busyId === f.familyId} onClick={() => handleAction(f.familyId, 'set_free')}>
                  Set Free
                </button>
                <button className="btn btn-outline" disabled={busyId === f.familyId} onClick={() => handleAction(f.familyId, 'reset_trial')}>
                  Reset Trial
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
