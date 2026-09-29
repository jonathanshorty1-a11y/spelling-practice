import { useState } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useFamily } from '../family/FamilyContext'
import { trackEvent } from '../analytics/analyticsService'
import { extractSpellingListFromImage } from './photoImport'
import { parseWordsInput } from './wordParsing'
import { createWeeklyList } from './weeklyListsService'
import { useT } from '../../lib/i18n'

type Tab = 'photo' | 'paste'

function defaultWeekTitle(): string {
  const now = new Date()
  return `Week of ${now.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })}`
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

function nextFriday(): string {
  const d = new Date()
  const day = d.getDay() // 0 = Sun ... 5 = Fri
  const daysUntilFriday = (5 - day + 7) % 7
  d.setDate(d.getDate() + (daysUntilFriday === 0 ? 7 : daysUntilFriday))
  return toIsoDate(d)
}

function tomorrow(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return toIsoDate(d)
}

export function AddWeeklyWordsScreen() {
  const { childId } = useParams<{ childId: string }>()
  const navigate = useNavigate()
  const location = useLocation()
  const isOnboarding = Boolean((location.state as { onboarding?: boolean } | null)?.onboarding)
  const { mode, family, entitlements, children } = useFamily()
  const { t } = useT()
  const child = children.find((c) => c.id === childId)

  const [tab, setTab] = useState<Tab>('photo')
  const [title, setTitle] = useState(defaultWeekTitle())
  const [testDate, setTestDate] = useState<string | null>(null)
  const [rawText, setRawText] = useState('')
  const [reviewWords, setReviewWords] = useState<string[] | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const preview = reviewWords ?? parseWordsInput(rawText)

  async function handlePhotoSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setAnalyzing(true)
    setError(null)
    trackEvent(mode, 'photo_import_started', { childId }, family?.id ?? null)
    try {
      const result = await extractSpellingListFromImage(file)
      setReviewWords(result.words)
      if (result.detectedTitle) setTitle(result.detectedTitle)
      if (result.detectedTestDate) setTestDate(result.detectedTestDate)
      trackEvent(mode, 'photo_import_completed', { childId, wordCount: result.words.length }, family?.id ?? null)
    } catch {
      setError('Could not read that photo. Try again or paste the words instead.')
    } finally {
      setAnalyzing(false)
    }
  }

  function updateWord(index: number, value: string) {
    const next = [...preview]
    next[index] = value
    setReviewWords(next)
  }

  function removeWord(index: number) {
    setReviewWords(preview.filter((_, i) => i !== index))
  }

  function addBlankWord() {
    setReviewWords([...preview, ''])
  }

  async function handleSave() {
    if (!family || !child) return
    const words = preview.map((w) => w.trim()).filter(Boolean)
    if (words.length === 0) {
      setError('Add at least one word.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const { list } = await createWeeklyList(mode, { familyId: family.id, childId: child.id, title, words, testDate })
      trackEvent(mode, 'weekly_list_created', { listId: list.id, wordCount: words.length, hasTestDate: testDate != null }, family.id)
      if (isOnboarding) {
        navigate(`/child/${child.id}/practice`, { state: { onboarding: true, practiceType: 'smart_practice' } })
      } else {
        navigate(`/child/${child.id}`)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the list.')
    } finally {
      setSaving(false)
    }
  }

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

  return (
    <div className="screen" data-theme={undefined}>
      <header className="screen-header">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          ←
        </button>
        <h2 className="screen-title">Add This Week's Words</h2>
        <span className="header-spacer" />
      </header>

      <div className="content">
        <div className="field">
          <label htmlFor="week-title">Week Name</label>
          <input id="week-title" className="text-input" value={title} onChange={(e) => setTitle(e.target.value)} />
        </div>

        <div className="field">
          <label>{t('test.whenIsTest')}</label>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button
              className={testDate === nextFriday() ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ width: 'auto', flex: '1 1 auto' }}
              onClick={() => setTestDate(nextFriday())}
            >
              {t('test.friday')}
            </button>
            <button
              className={testDate === tomorrow() ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ width: 'auto', flex: '1 1 auto' }}
              onClick={() => setTestDate(tomorrow())}
            >
              {t('test.tomorrow')}
            </button>
            <button
              className={testDate === null ? 'btn btn-primary' : 'btn btn-secondary'}
              style={{ width: 'auto', flex: '1 1 auto' }}
              onClick={() => setTestDate(null)}
            >
              {t('test.notSure')}
            </button>
          </div>
          <input
            type="date"
            className="text-input"
            aria-label={t('test.chooseDate')}
            value={testDate ?? ''}
            onChange={(e) => setTestDate(e.target.value || null)}
          />
        </div>

        {!reviewWords && (
          <>
            <div className="btn-row">
              <button className={tab === 'photo' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('photo')}>
                Take a Photo
              </button>
              <button className={tab === 'paste' ? 'btn btn-primary' : 'btn btn-secondary'} onClick={() => setTab('paste')}>
                Paste / Type Words
              </button>
            </div>

            {tab === 'paste' && (
              <div className="field">
                <label htmlFor="words-textarea">One word per line, or separated by commas</label>
                <textarea
                  id="words-textarea"
                  className="textarea-input"
                  rows={8}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder={'climb\nheight\ndrive'}
                />
              </div>
            )}

            {tab === 'photo' &&
              (entitlements.canUsePhotoImport ? (
                <div className="card stack" style={{ textAlign: 'center' }}>
                  <p className="muted" style={{ margin: 0 }}>
                    Turn a spelling sheet into a practice list in seconds.
                  </p>
                  <label className="btn btn-primary btn-big" style={{ cursor: 'pointer' }}>
                    {analyzing ? 'Analyzing photo…' : '📷 Choose or Take a Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      capture="environment"
                      onChange={handlePhotoSelected}
                      disabled={analyzing}
                      style={{ display: 'none' }}
                    />
                  </label>
                </div>
              ) : (
                <div className="card stack" style={{ textAlign: 'center' }}>
                  <p style={{ fontWeight: 800, margin: 0 }}>Photo Import is a Premium feature</p>
                  <p className="muted" style={{ margin: 0 }}>
                    Turn a spelling sheet into a practice list in seconds.
                  </p>
                  <button className="btn btn-primary" onClick={() => navigate('/paywall')}>
                    Upgrade
                  </button>
                </div>
              ))}
          </>
        )}

        {reviewWords && (
          <div className="stack">
            <p className="pill" style={{ alignSelf: 'flex-start' }}>
              We found {reviewWords.length} words
            </p>
            <div className="card stack">
              {preview.map((word, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input className="text-input" value={word} onChange={(e) => updateWord(i, e.target.value)} />
                  <button className="icon-btn" onClick={() => removeWord(i)} aria-label="Remove word">
                    ✕
                  </button>
                </div>
              ))}
              <button className="btn btn-outline" onClick={addBlankWord}>
                + Add word
              </button>
            </div>
            <button className="btn btn-outline" onClick={() => setReviewWords(null)}>
              Start over
            </button>
          </div>
        )}

        {!reviewWords && tab === 'paste' && preview.length > 0 && (
          <div className="card">
            <p className="muted" style={{ margin: '0 0 8px 0' }}>
              Preview ({preview.length} words)
            </p>
            <p style={{ margin: 0, fontWeight: 700 }}>{preview.join(', ')}</p>
          </div>
        )}

        {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

        <button className="btn btn-primary btn-big push-bottom" onClick={handleSave} disabled={saving || preview.length === 0}>
          {saving ? 'Saving…' : 'Save & Continue'}
        </button>
      </div>
    </div>
  )
}
