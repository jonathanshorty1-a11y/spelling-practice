import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useFamily } from '../family/FamilyContext'
import { trackEvent } from '../analytics/analyticsService'
import { startCheckout } from './subscriptionServiceClient'

const BENEFITS = [
  'Unlimited practice',
  'Unlimited weekly words',
  'Multiple children',
  'Photo to words',
  'Practice mistakes',
  'Full progress history',
  'Saved weekly lists',
]

export function PaywallScreen() {
  const navigate = useNavigate()
  const { mode, family } = useFamily()
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    trackEvent(mode, 'paywall_viewed', {}, family?.id ?? null)
  }, [mode, family?.id])

  async function handleUpgrade(plan: 'yearly' | 'monthly') {
    trackEvent(mode, 'upgrade_clicked', { plan }, family?.id ?? null)
    try {
      await startCheckout(plan)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Payments coming soon.')
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="icon-btn" onClick={() => navigate(-1)} aria-label="Back">
          ←
        </button>
        <h2 className="screen-title">Family Premium</h2>
        <span className="header-spacer" />
      </header>

      <div className="content content-center">
        <h1 style={{ fontSize: '1.8rem', margin: 0 }}>Keep the practice going 🌟</h1>
        <p className="muted" style={{ maxWidth: 420 }}>
          Your free practice is complete. Upgrade to Family Premium for unlimited spelling practice.
        </p>

        <div className="card" style={{ width: '100%', maxWidth: 420, textAlign: 'left' }}>
          {BENEFITS.map((b) => (
            <p key={b} style={{ margin: '8px 0' }}>
              ✅ {b}
            </p>
          ))}
        </div>

        <div className="stack" style={{ width: '100%', maxWidth: 420 }}>
          <button className="btn btn-primary btn-big" onClick={() => handleUpgrade('yearly')}>
            $39.99 / year — Best Value
          </button>
          <button className="btn btn-secondary btn-big" onClick={() => handleUpgrade('monthly')}>
            $4.99 / month
          </button>
          {message && <p className="muted center">{message}</p>}
        </div>
      </div>
    </div>
  )
}
