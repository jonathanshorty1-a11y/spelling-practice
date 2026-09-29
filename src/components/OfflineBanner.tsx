import { useEffect, useState } from 'react'

/** Spec section 29: don't attempt complex offline sync — just say so clearly. */
export function OfflineBanner() {
  const [isOnline, setIsOnline] = useState(navigator.onLine)

  useEffect(() => {
    const goOnline = () => setIsOnline(true)
    const goOffline = () => setIsOnline(false)
    window.addEventListener('online', goOnline)
    window.addEventListener('offline', goOffline)
    return () => {
      window.removeEventListener('online', goOnline)
      window.removeEventListener('offline', goOffline)
    }
  }, [])

  if (isOnline) return null
  return <div className="offline-banner">You're offline — some features may not save until you're back online.</div>
}
