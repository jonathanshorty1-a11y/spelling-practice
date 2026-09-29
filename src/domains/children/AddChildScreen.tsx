import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFamily } from '../family/FamilyContext'
import { trackEvent } from '../analytics/analyticsService'
import { canUseFeature } from '../subscription/entitlements'
import { CHILD_AVATARS, CHILD_THEME_COLORS, createChild } from './childrenService'
import { themeNameForColor } from '../../lib/theme'

export function AddChildScreen() {
  const navigate = useNavigate()
  const { mode, family, children, entitlements, refreshChildren } = useFamily()
  const [name, setName] = useState('')
  const [avatar, setAvatar] = useState<(typeof CHILD_AVATARS)[number]>(CHILD_AVATARS[0])
  const [themeColor, setThemeColor] = useState<(typeof CHILD_THEME_COLORS)[number]>(CHILD_THEME_COLORS[0])
  const [grade, setGrade] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const atLimit = !canUseFeature(entitlements, 'multipleChildren', { currentChildCount: children.length })

  async function handleSave() {
    if (!family) return
    if (!name.trim()) {
      setError('Please enter a name.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      const child = await createChild(mode, family.id, {
        name: name.trim(),
        avatar,
        themeColor,
        grade: grade.trim() || null,
      })
      trackEvent(mode, 'child_created', { childId: child.id }, family.id)
      await refreshChildren()

      const isFirstChildEver = children.length === 0
      if (isFirstChildEver) {
        navigate(`/child/${child.id}/add-words`, { state: { onboarding: true } })
      } else {
        navigate('/home')
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          ←
        </button>
        <h2 className="screen-title">Add Child</h2>
        <span className="header-spacer" />
      </header>

      <div className="content">
        {atLimit && (
          <div className="card" style={{ background: 'var(--accent-bg)', color: 'var(--accent-dark)' }}>
            <p style={{ margin: 0 }}>
              Free accounts can have 1 child profile. <strong>Upgrade to Family Premium</strong> to add more.
            </p>
          </div>
        )}

        <div className="field">
          <label htmlFor="child-name">Child's name</label>
          <input
            id="child-name"
            className="text-input"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Hillary"
            disabled={atLimit}
          />
        </div>

        <div className="field">
          <label>Avatar</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {CHILD_AVATARS.map((a) => (
              <button
                key={a}
                onClick={() => setAvatar(a)}
                disabled={atLimit}
                className="icon-btn"
                aria-label={`Avatar ${a}`}
                aria-pressed={a === avatar}
                style={{
                  fontSize: '1.6rem',
                  border: a === avatar ? '3px solid var(--accent)' : '3px solid transparent',
                }}
              >
                {a}
              </button>
            ))}
          </div>
        </div>

        <div className="field">
          <label>Color</label>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {CHILD_THEME_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setThemeColor(c)}
                disabled={atLimit}
                aria-label={themeNameForColor(c)}
                aria-pressed={c === themeColor}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: '50%',
                  background: c,
                  border: c === themeColor ? '3px solid var(--ink)' : '3px solid transparent',
                }}
              />
            ))}
          </div>
        </div>

        <div className="field">
          <label htmlFor="child-grade">Grade (optional)</label>
          <input
            id="child-grade"
            className="text-input"
            value={grade}
            onChange={(e) => setGrade(e.target.value)}
            placeholder="e.g. 3rd grade"
            disabled={atLimit}
          />
        </div>

        {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

        <button className="btn btn-primary btn-big push-bottom" onClick={handleSave} disabled={saving || atLimit}>
          {saving ? 'Saving…' : 'Continue'}
        </button>
      </div>
    </div>
  )
}
