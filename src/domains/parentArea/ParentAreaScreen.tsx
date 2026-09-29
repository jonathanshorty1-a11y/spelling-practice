import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFamily } from '../family/FamilyContext'
import { isValidPinFormat } from './pinService'
import { deleteChild } from '../children/childrenService'
import { getActiveListForChild, getListHistory } from '../weeklyLists/weeklyListsService'
import { getSessionHistory } from '../practice/practiceService'
import { getMasteryForList } from '../mastery/masteryService'
import { calculateReadiness } from '../mastery/readiness'
import { getRecommendedPractice, type RecommendedPracticeType } from '../mastery/recommendedPractice'
import { signOut } from '../auth/authService'
import { isCurrentUserAdmin } from '../admin/adminService'
import { setParentLanguage as setParentLanguageService } from '../family/familyService'
import type { ParentLanguage, PracticeSession, ReadinessSummary, WeeklyList, WordMasteryRecord, WordMasteryStatus } from '../shared/types'
import { ConfirmModal } from '../../components/ConfirmModal'
import { useT } from '../../lib/i18n'

type Section = 'dashboard' | 'children' | 'lists' | 'progress' | 'account' | 'subscription' | 'settings'

function formatTestDate(iso: string): string {
  const date = new Date(`${iso}T00:00:00`)
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })
}

function PinGate({ onUnlocked }: { onUnlocked: () => void }) {
  const { unlockParentArea } = useFamily()
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit() {
    const ok = await unlockParentArea(pin)
    if (ok) onUnlocked()
    else setError('Incorrect PIN')
  }

  return (
    <div className="content content-center grow">
      <p style={{ fontWeight: 800, fontSize: '1.3rem' }}>Enter Parent PIN</p>
      <input
        className="text-input text-input-big"
        style={{ maxWidth: 200, textAlign: 'center', letterSpacing: 8 }}
        aria-label="Parent PIN"
        inputMode="numeric"
        maxLength={4}
        value={pin}
        onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
        autoFocus
      />
      {error && <p style={{ color: 'var(--red)' }}>{error}</p>}
      <button className="btn btn-primary" onClick={handleSubmit} disabled={pin.length !== 4}>
        Unlock
      </button>
    </div>
  )
}

interface DashboardChildData {
  hasList: boolean
  testDate: string | null
  readiness: ReadinessSummary | null
  weakWords: string[]
  recommendationType: RecommendedPracticeType | null
  estimatedMinutes: number | null
}

const RECOMMENDATION_KEY: Record<RecommendedPracticeType, string> = {
  start_basics: 'recommendation.start_basics',
  smart_practice: 'recommendation.smart_practice',
  final_review: 'recommendation.final_review',
  light_review: 'recommendation.light_review',
}

/**
 * The main view of Parent Area (spec: "convierte el dashboard de
 * mastery/readiness en la vista principal, no una pestaña secundaria").
 * One glanceable card per child: name, test date, readiness, X/Y mastered,
 * the words currently holding them back, the engine's current
 * recommendation, and two actions — Practice Weak Words (jumps straight
 * into practice) and View Details (drops into the full Progress
 * breakdown/session history below, unchanged).
 */
function DashboardSection({ onViewDetails }: { onViewDetails: () => void }) {
  const navigate = useNavigate()
  const { mode, children } = useFamily()
  const { t } = useT()
  const [dataByChild, setDataByChild] = useState<Record<string, DashboardChildData>>({})

  useEffect(() => {
    Promise.all(
      children.map(async (c) => {
        const activeList = await getActiveListForChild(mode, c.id)
        if (!activeList) {
          return [c.id, { hasList: false, testDate: null, readiness: null, weakWords: [], recommendationType: null, estimatedMinutes: null }] as const
        }
        const mastery = await getMasteryForList(mode, c.id, activeList.list.id)
        const readiness = calculateReadiness(Array.from(mastery.values()), activeList.words.length)
        const weakWords = activeList.words.filter((w) => mastery.get(w.id)?.status !== 'mastered').map((w) => w.word)
        const recommendation = getRecommendedPractice({ readiness, testDate: activeList.list.testDate })
        return [
          c.id,
          {
            hasList: true,
            testDate: activeList.list.testDate,
            readiness,
            weakWords,
            recommendationType: recommendation.type,
            estimatedMinutes: recommendation.estimatedMinutes,
          },
        ] as const
      }),
    ).then((entries) => setDataByChild(Object.fromEntries(entries)))
  }, [mode, children])

  return (
    <div className="stack">
      {children.map((c) => {
        const data = dataByChild[c.id]
        return (
          <div key={c.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: '1.1rem' }}>
                {c.avatar} {c.name}
              </strong>
              {data?.readiness && <span className="pill">{t(`readiness.${data.readiness.status}`)}</span>}
            </div>

            {!data ? (
              <p className="muted">…</p>
            ) : !data.hasList ? (
              <p className="muted">{t('dashboard.noListYet')}</p>
            ) : (
              <>
                {data.testDate && (
                  <p className="muted" style={{ margin: '6px 0 0 0' }}>{t('dashboard.testDate', { date: formatTestDate(data.testDate) })}</p>
                )}

                <p style={{ fontWeight: 700, margin: '10px 0 0 0' }}>
                  {t('dashboard.masteredOf', { mastered: data.readiness!.masteredCount, total: data.readiness!.total })}
                </p>

                {data.weakWords.length > 0 && (
                  <p className="muted" style={{ margin: '4px 0 0 0' }}>
                    {t('dashboard.weakWordsList', { words: data.weakWords.join(', ') })}
                  </p>
                )}

                {data.recommendationType && (
                  <p className="muted" style={{ margin: '10px 0 0 0' }}>
                    {t(RECOMMENDATION_KEY[data.recommendationType])} — {t('dashboard.estimatedMinutes', { minutes: data.estimatedMinutes ?? 0 })}
                  </p>
                )}

                <div className="btn-row" style={{ marginTop: 14 }}>
                  {data.weakWords.length > 0 && (
                    <button
                      className="btn btn-primary"
                      onClick={() => navigate(`/child/${c.id}/practice`, { state: { practiceType: 'weak_words' } })}
                    >
                      {t('dashboard.practiceWeakWords')}
                    </button>
                  )}
                  <button className="btn btn-outline" onClick={onViewDetails}>
                    {t('dashboard.viewDetails')}
                  </button>
                </div>
              </>
            )}
          </div>
        )
      })}

      {children.length === 0 && <p className="muted">Add a child to see their dashboard here.</p>}
    </div>
  )
}

function ChildrenSection() {
  const navigate = useNavigate()
  const { mode, children, refreshChildren } = useFamily()
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  return (
    <div className="stack">
      {children.map((c) => (
        <div key={c.id} className="card" style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: '1.8rem' }}>{c.avatar}</span>
          <div className="grow">
            <div style={{ fontWeight: 700 }}>{c.name}</div>
            {c.grade && <div className="muted" style={{ fontSize: '0.9rem' }}>{c.grade}</div>}
          </div>
          <button className="btn btn-danger" style={{ width: 'auto' }} onClick={() => setConfirmDeleteId(c.id)}>
            Delete
          </button>
        </div>
      ))}
      <button className="btn btn-primary" onClick={() => navigate('/add-child')}>
        + Add Child
      </button>

      {confirmDeleteId && (
        <ConfirmModal
          message="Delete this child profile? Their word lists and history will be removed. Your family's free-answer count is not affected."
          confirmLabel="Delete"
          onCancel={() => setConfirmDeleteId(null)}
          onConfirm={async () => {
            await deleteChild(mode, confirmDeleteId)
            setConfirmDeleteId(null)
            await refreshChildren()
          }}
        />
      )}
    </div>
  )
}

function ListsSection() {
  const navigate = useNavigate()
  const { mode, children } = useFamily()
  const [histories, setHistories] = useState<Record<string, WeeklyList[]>>({})

  useEffect(() => {
    Promise.all(children.map((c) => getListHistory(mode, c.id).then((h) => [c.id, h] as const))).then((entries) =>
      setHistories(Object.fromEntries(entries)),
    )
  }, [mode, children])

  return (
    <div className="stack">
      {children.map((c) => (
        <div key={c.id} className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <strong>{c.avatar} {c.name}</strong>
            <button className="btn btn-secondary" style={{ width: 'auto' }} onClick={() => navigate(`/child/${c.id}/add-words`)}>
              New List
            </button>
          </div>
          <div className="stack" style={{ marginTop: 12 }}>
            {(histories[c.id] ?? []).map((l) => (
              <div key={l.id} className="muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>{l.title}</span>
                <span>{l.archived ? 'archived' : 'active'}</span>
              </div>
            ))}
            {(histories[c.id] ?? []).length === 0 && <p className="muted">No lists yet.</p>}
          </div>
        </div>
      ))}
    </div>
  )
}

interface ChildProgressData {
  listId: string | null
  words: { id: string; word: string }[]
  mastery: Map<string, WordMasteryRecord>
  readiness: ReadinessSummary | null
  sessions: PracticeSession[]
}

const GROUP_ORDER: WordMasteryStatus[] = ['mastered', 'almost_mastered', 'learning', 'not_practiced']
const GROUP_LABEL_KEY: Record<WordMasteryStatus, string> = {
  mastered: 'progress.mastered',
  almost_mastered: 'progress.almostMastered',
  learning: 'progress.learning',
  not_practiced: 'progress.notPracticed',
}

function ProgressSection() {
  const navigate = useNavigate()
  const { mode, children } = useFamily()
  const { t } = useT()
  const [dataByChild, setDataByChild] = useState<Record<string, ChildProgressData>>({})
  const [expandedGroup, setExpandedGroup] = useState<{ childId: string; status: WordMasteryStatus } | null>(null)

  useEffect(() => {
    Promise.all(
      children.map(async (c) => {
        const [sessions, activeList] = await Promise.all([getSessionHistory(mode, c.id), getActiveListForChild(mode, c.id)])
        if (!activeList) return [c.id, { listId: null, words: [], mastery: new Map(), readiness: null, sessions }] as const
        const mastery = await getMasteryForList(mode, c.id, activeList.list.id)
        const readiness = calculateReadiness(Array.from(mastery.values()), activeList.words.length)
        return [
          c.id,
          { listId: activeList.list.id, words: activeList.words.map((w) => ({ id: w.id, word: w.word })), mastery, readiness, sessions },
        ] as const
      }),
    ).then((entries) => setDataByChild(Object.fromEntries(entries)))
  }, [mode, children])

  function wordsInGroup(data: ChildProgressData, status: WordMasteryStatus): string[] {
    if (status === 'not_practiced') {
      return data.words.filter((w) => (data.mastery.get(w.id)?.status ?? 'not_practiced') === 'not_practiced').map((w) => w.word)
    }
    return data.words.filter((w) => data.mastery.get(w.id)?.status === status).map((w) => w.word)
  }

  return (
    <div className="stack">
      {children.map((c) => {
        const data = dataByChild[c.id]
        const sessions = data?.sessions ?? []

        return (
          <div key={c.id} className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong>{c.avatar} {c.name}</strong>
              {data?.readiness && <span className="pill">{t(`readiness.${data.readiness.status}`)}</span>}
            </div>

            {data?.readiness ? (
              <>
                <div style={{ display: 'flex', gap: 8, margin: '12px 0', flexWrap: 'wrap' }}>
                  {GROUP_ORDER.map((status) => {
                    const count =
                      status === 'mastered'
                        ? data.readiness!.masteredCount
                        : status === 'almost_mastered'
                          ? data.readiness!.almostMasteredCount
                          : status === 'learning'
                            ? data.readiness!.learningCount
                            : data.readiness!.notPracticedCount
                    const isOpen = expandedGroup?.childId === c.id && expandedGroup.status === status
                    return (
                      <button
                        key={status}
                        className="btn btn-secondary"
                        style={{ width: 'auto' }}
                        onClick={() => setExpandedGroup(isOpen ? null : { childId: c.id, status })}
                      >
                        {t(GROUP_LABEL_KEY[status])} — {count}
                      </button>
                    )
                  })}
                </div>

                {expandedGroup?.childId === c.id && data && (
                  <p className="muted" style={{ margin: '0 0 12px 0' }}>
                    {wordsInGroup(data, expandedGroup.status).join(', ') || '—'}
                  </p>
                )}

                {(data.readiness.learningCount > 0 || data.readiness.almostMasteredCount > 0 || data.readiness.notPracticedCount > 0) && (
                  <button
                    className="btn btn-primary"
                    style={{ marginBottom: 12 }}
                    onClick={() => navigate(`/child/${c.id}/practice`, { state: { practiceType: 'weak_words' } })}
                  >
                    {t('dashboard.practiceWeakWords')}
                  </button>
                )}
              </>
            ) : (
              <p className="muted">{t('dashboard.noListYet')}</p>
            )}

            <div className="stack">
              {sessions.slice(0, 8).map((s) => (
                <div key={s.id} className="muted" style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span>{new Date(s.startedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  <span>
                    {s.correctWords}/{s.totalWords} ({s.percentage}%)
                  </span>
                </div>
              ))}
              {sessions.length === 0 && <p className="muted">No practice sessions yet.</p>}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function AccountSection() {
  const navigate = useNavigate()
  const { mode, family } = useFamily()
  return (
    <div className="stack">
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          Account
        </p>
        <p style={{ fontWeight: 700, fontSize: '1.1rem' }}>{family?.email ?? 'Guest (not signed in on this device)'}</p>
      </div>
      {mode === 'cloud' && (
        <button
          className="btn btn-outline"
          onClick={async () => {
            await signOut()
            navigate('/')
          }}
        >
          Sign Out
        </button>
      )}
    </div>
  )
}

function SubscriptionSection() {
  const navigate = useNavigate()
  const { entitlements } = useFamily()
  const { t } = useT()
  const [admin, setAdmin] = useState(false)

  useEffect(() => {
    isCurrentUserAdmin().then(setAdmin)
  }, [])

  return (
    <div className="stack">
      <div className="card">
        <p className="muted" style={{ margin: 0 }}>
          {t('subscription.statusLabel')}
        </p>
        <p style={{ fontWeight: 800, fontSize: '1.3rem', textTransform: 'capitalize' }}>{entitlements.status}</p>
        {entitlements.trialDaysRemaining != null && (
          <p className="muted">{t('subscription.trialDaysLeft', { days: entitlements.trialDaysRemaining })}</p>
        )}
        {entitlements.freeAnswersRemaining != null && (
          <p className="muted">
            {t('subscription.freeAnswers', { used: entitlements.freeAnswersUsed, limit: entitlements.freeAnswersLimit })}
          </p>
        )}
      </div>
      {!entitlements.isPremiumLike && (
        <button className="btn btn-primary" onClick={() => navigate('/paywall')}>
          {t('subscription.upgrade')}
        </button>
      )}
      {admin && (
        <button className="btn btn-outline" onClick={() => navigate('/admin')}>
          Admin Panel
        </button>
      )}
    </div>
  )
}

function SettingsSection() {
  const { mode, family, hasParentPin, setParentPin, refreshFamily } = useFamily()
  const { t } = useT()
  const [pin, setPin] = useState('')
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave() {
    if (!isValidPinFormat(pin)) {
      setError('PIN must be exactly 4 digits.')
      return
    }
    await setParentPin(pin)
    setSaved(true)
    setError(null)
  }

  async function handleLanguageChange(language: ParentLanguage) {
    if (!family) return
    await setParentLanguageService(mode, family.id, language)
    await refreshFamily()
  }

  return (
    <div className="stack">
      <div className="card">
        <p style={{ fontWeight: 700, marginTop: 0 }}>{t('settings.parentLanguage')}</p>
        <p className="muted" style={{ marginTop: 0, fontSize: '0.9rem' }}>
          {t('settings.parentLanguageHint')}
        </p>
        <div className="btn-row">
          <button
            className={family?.parentLanguage === 'en' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => handleLanguageChange('en')}
          >
            English
          </button>
          <button
            className={family?.parentLanguage === 'es' ? 'btn btn-primary' : 'btn btn-secondary'}
            onClick={() => handleLanguageChange('es')}
          >
            Español
          </button>
        </div>
      </div>

      <div className="card">
        <p style={{ fontWeight: 700 }}>{hasParentPin ? 'Change Parent PIN' : 'Set a Parent PIN'}</p>
        <p className="muted" style={{ marginTop: 0 }}>
          This is a local speed bump so kids don't wander into settings — not a security login.
        </p>
        <input
          className="text-input text-input-big"
          style={{ maxWidth: 200, textAlign: 'center' }}
          inputMode="numeric"
          maxLength={4}
          value={pin}
          onChange={(e) => {
            setPin(e.target.value.replace(/\D/g, ''))
            setSaved(false)
          }}
        />
        {error && <p style={{ color: 'var(--red)' }}>{error}</p>}
        {saved && <p style={{ color: 'var(--green)' }}>Saved!</p>}
        <button className="btn btn-primary" onClick={handleSave} style={{ marginTop: 12 }}>
          Save PIN
        </button>
      </div>
    </div>
  )
}

const SECTION_LABEL_KEY: Record<Section, string> = {
  dashboard: 'parentArea.dashboard',
  children: 'parentArea.children',
  lists: 'parentArea.lists',
  progress: 'parentArea.progress',
  account: 'parentArea.account',
  subscription: 'parentArea.subscription',
  settings: 'parentArea.settings',
}

export function ParentAreaScreen() {
  const navigate = useNavigate()
  const { hasParentPin, isParentUnlocked, lockParentArea } = useFamily()
  const { t } = useT()
  const [section, setSection] = useState<Section>('dashboard')
  const [unlockedThisVisit, setUnlockedThisVisit] = useState(isParentUnlocked)

  const locked = hasParentPin && !isParentUnlocked && !unlockedThisVisit

  return (
    <div className="screen" data-mode="parent">
      <header className="screen-header">
        <button
          className="icon-btn"
          onClick={() => {
            lockParentArea()
            navigate('/home')
          }}
          aria-label="Back"
        >
          ←
        </button>
        <h2 className="screen-title">{t('parentArea.title')}</h2>
        <span className="header-spacer" />
      </header>

      {locked ? (
        <PinGate onUnlocked={() => setUnlockedThisVisit(true)} />
      ) : (
        <div className="content">
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {(['dashboard', 'children', 'lists', 'progress', 'account', 'subscription', 'settings'] as Section[]).map((s) => (
              <button
                key={s}
                className={section === s ? 'btn btn-primary' : 'btn btn-secondary'}
                style={{ width: 'auto', flex: '1 1 auto' }}
                onClick={() => setSection(s)}
              >
                {t(SECTION_LABEL_KEY[s])}
              </button>
            ))}
          </div>

          {section === 'dashboard' && <DashboardSection onViewDetails={() => setSection('progress')} />}
          {section === 'children' && <ChildrenSection />}
          {section === 'lists' && <ListsSection />}
          {section === 'progress' && <ProgressSection />}
          {section === 'account' && <AccountSection />}
          {section === 'subscription' && <SubscriptionSection />}
          {section === 'settings' && <SettingsSection />}
        </div>
      )}
    </div>
  )
}
