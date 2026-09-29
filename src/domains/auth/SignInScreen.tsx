import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { signInWithApple, signInWithEmail, signInWithGoogle, verifyEmailOtp } from './authService'
import { loadLocalDb } from '../../lib/localDb'
import { migrateGuestToCloud } from '../family/familyService'
import { trackEvent } from '../analytics/analyticsService'

type Step = 'options' | 'email' | 'code'

export function SignInScreen() {
  const navigate = useNavigate()
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

      const hasLocalGuestData = Boolean(loadLocalDb().family)
      if (hasLocalGuestData) {
        await migrateGuestToCloud(session.user.id, session.user.email ?? email.trim())
        trackEvent('cloud', 'account_created', {}, null)
      }
      navigate('/home')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That code did not work. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen-header">
        <button className="icon-btn" onClick={() => navigate('/')} aria-label="Back">
          ←
        </button>
        <h2 className="screen-title">Sign In</h2>
        <span className="header-spacer" />
      </header>

      <div className="content content-center grow">
        <div className="stack" style={{ width: '100%', maxWidth: 380 }}>
          {error && <p style={{ color: 'var(--red)' }}>{error}</p>}

          {step === 'options' && (
            <>
              <button className="btn btn-primary btn-big" onClick={() => handleProviderClick('apple')}>
                Continue with Apple
              </button>
              <button className="btn btn-secondary btn-big" onClick={() => handleProviderClick('google')}>
                Continue with Google
              </button>
              <button className="btn btn-outline btn-big" onClick={() => setStep('email')}>
                Continue with Email
              </button>
            </>
          )}

          {step === 'email' && (
            <>
              <input
                className="text-input"
                type="email"
                placeholder="parent@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
              />
              <button className="btn btn-primary btn-big" onClick={handleSendCode} disabled={busy || !email.trim()}>
                {busy ? 'Sending…' : 'Send Code'}
              </button>
            </>
          )}

          {step === 'code' && (
            <>
              <p className="muted center">We sent a 6-digit code to {email}.</p>
              <input
                className="text-input text-input-big"
                inputMode="numeric"
                maxLength={6}
                placeholder="000000"
                value={code}
                onChange={(e) => setCode(e.target.value)}
              />
              <button className="btn btn-primary btn-big" onClick={handleVerifyCode} disabled={busy || !code.trim()}>
                {busy ? 'Verifying…' : 'Verify & Continue'}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
