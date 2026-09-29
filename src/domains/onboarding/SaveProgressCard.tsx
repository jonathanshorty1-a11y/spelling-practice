import { useState } from 'react'
import { signInWithApple, signInWithEmail, signInWithGoogle, verifyEmailOtp } from '../auth/authService'
import { migrateGuestToCloud } from '../family/familyService'
import { trackEvent } from '../analytics/analyticsService'
import { useFamily } from '../family/FamilyContext'

type Step = 'options' | 'email' | 'code' | 'dismissed' | 'migrating'

export function SaveProgressCard() {
  const { family, refreshFamily } = useFamily()
  const [step, setStep] = useState<Step>('options')
  const [email, setEmail] = useState('')
  const [code, setCode] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleProviderClick(provider: 'apple' | 'google') {
    setError(null)
    try {
      if (provider === 'apple') await signInWithApple()
      else await signInWithGoogle()
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : `${provider === 'apple' ? 'Apple' : 'Google'} sign-in isn't set up yet — try email instead.`,
      )
    }
  }

  async function handleSendCode() {
    if (!email.trim()) return
    setBusy(true)
    setError(null)
    try {
      await signInWithEmail(email.trim())
      setStep('code')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send the code. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  async function handleVerifyCode() {
    if (!code.trim()) return
    setBusy(true)
    setError(null)
    try {
      const session = await verifyEmailOtp(email.trim(), code.trim())
      if (!session) throw new Error('That code did not work. Please try again.')
      setStep('migrating')
      await migrateGuestToCloud(session.user.id, session.user.email ?? email.trim())
      trackEvent('cloud', 'account_created', {}, family?.id ?? null)
      trackEvent('cloud', 'trial_started', {}, family?.id ?? null)
      await refreshFamily()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work. Please try again.')
      setStep('code')
    } finally {
      setBusy(false)
    }
  }

  if (step === 'dismissed') return null

  return (
    <div className="card stack" style={{ width: '100%', maxWidth: 420, marginTop: 8 }}>
      <p style={{ fontWeight: 800, margin: 0 }}>Don't lose your child's progress</p>
      <p className="muted" style={{ margin: 0 }}>
        Create a free family account to keep this history and get 7 days of Premium, free.
      </p>

      {error && <p style={{ color: 'var(--red)', margin: 0 }}>{error}</p>}

      {step === 'options' && (
        <div className="stack">
          <button className="btn btn-primary" onClick={() => handleProviderClick('apple')}>
            Continue with Apple
          </button>
          <button className="btn btn-secondary" onClick={() => handleProviderClick('google')}>
            Continue with Google
          </button>
          <button className="btn btn-outline" onClick={() => setStep('email')}>
            Continue with Email
          </button>
          <button className="btn" style={{ color: 'var(--ink-soft)' }} onClick={() => setStep('dismissed')}>
            Maybe Later
          </button>
        </div>
      )}

      {step === 'email' && (
        <div className="stack">
          <input
            className="text-input"
            type="email"
            placeholder="parent@email.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoCapitalize="off"
            autoCorrect="off"
          />
          <button className="btn btn-primary" onClick={handleSendCode} disabled={busy || !email.trim()}>
            {busy ? 'Sending…' : 'Send Code'}
          </button>
        </div>
      )}

      {step === 'code' && (
        <div className="stack">
          <p className="muted" style={{ margin: 0 }}>
            We sent a 6-digit code to {email}. Enter it below.
          </p>
          <input
            className="text-input text-input-big"
            inputMode="numeric"
            maxLength={6}
            placeholder="000000"
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
          <button className="btn btn-primary" onClick={handleVerifyCode} disabled={busy || !code.trim()}>
            {busy ? 'Verifying…' : 'Verify & Continue'}
          </button>
        </div>
      )}

      {step === 'migrating' && <p className="muted center">Saving your child's progress…</p>}
    </div>
  )
}
