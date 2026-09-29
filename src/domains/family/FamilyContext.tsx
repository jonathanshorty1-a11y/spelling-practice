import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { DataMode } from '../../lib/dataMode'
import { useAuth } from '../auth/AuthContext'
import { computeEntitlements, type Entitlements } from '../subscription/entitlements'
import { getSubscription } from '../subscription/subscriptionService'
import type { Child, Family, Subscription } from '../shared/types'
import { listChildren } from '../children/childrenService'
import { checkParentPin, getCloudFamilyForUser, getOrCreateGuestFamily, setParentPin as setParentPinService } from './familyService'

interface FamilyContextValue {
  loading: boolean
  mode: DataMode
  family: Family | null
  subscription: Subscription | null
  entitlements: Entitlements
  children: Child[]
  refreshChildren: () => Promise<void>
  refreshSubscription: () => Promise<void>
  refreshFamily: () => Promise<void>
  isParentUnlocked: boolean
  unlockParentArea: (pin: string) => Promise<boolean>
  lockParentArea: () => void
  hasParentPin: boolean
  setParentPin: (pin: string) => Promise<void>
}

const FamilyContext = createContext<FamilyContextValue | null>(null)

export function FamilyProvider({ children: reactChildren }: { children: ReactNode }) {
  const { session, loading: authLoading } = useAuth()
  const mode: DataMode = session ? 'cloud' : 'local'

  const [family, setFamily] = useState<Family | null>(null)
  const [subscription, setSubscription] = useState<Subscription | null>(null)
  const [children, setChildren] = useState<Child[]>([])
  const [loading, setLoading] = useState(true)
  const [isParentUnlocked, setIsParentUnlocked] = useState(false)

  const loadFamily = useCallback(async () => {
    if (mode === 'cloud' && session) {
      // Right after sign-up the DB trigger may need a beat to commit; retry briefly.
      for (let attempt = 0; attempt < 5; attempt++) {
        const f = await getCloudFamilyForUser(session.user.id)
        if (f) return f
        await new Promise((r) => setTimeout(r, 300))
      }
      return null
    }
    return getOrCreateGuestFamily()
  }, [mode, session])

  const refreshFamily = useCallback(async () => {
    const f = await loadFamily()
    setFamily(f)
  }, [loadFamily])

  const refreshSubscription = useCallback(async () => {
    if (!family) return
    const sub = await getSubscription(mode, family.id)
    setSubscription(sub)
  }, [mode, family])

  const refreshChildren = useCallback(async () => {
    if (!family) return
    const list = await listChildren(mode, family.id)
    setChildren(list)
  }, [mode, family])

  useEffect(() => {
    if (authLoading) return
    let active = true
    setLoading(true)
    setIsParentUnlocked(false)
    loadFamily().then((f) => {
      if (active) setFamily(f)
    })
    return () => {
      active = false
    }
    // Reload whenever auth/mode flips (guest -> signed in).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, mode, session?.user.id])

  useEffect(() => {
    if (!family) return
    let active = true
    Promise.all([getSubscription(mode, family.id), listChildren(mode, family.id)]).then(([sub, kids]) => {
      if (!active) return
      setSubscription(sub)
      setChildren(kids)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [mode, family])

  const entitlements = useMemo(() => computeEntitlements(subscription), [subscription])

  const unlockParentArea = useCallback(
    async (pin: string) => {
      const ok = await checkParentPin(family, pin)
      if (ok) setIsParentUnlocked(true)
      return ok
    },
    [family],
  )

  const lockParentArea = useCallback(() => setIsParentUnlocked(false), [])

  const setParentPin = useCallback(
    async (pin: string) => {
      if (!family) return
      await setParentPinService(mode, family.id, pin)
      await refreshFamily()
      // Whoever just set the PIN is, by definition, the parent — don't
      // immediately lock them out of the settings page they're standing on.
      setIsParentUnlocked(true)
    },
    [mode, family, refreshFamily],
  )

  const value: FamilyContextValue = {
    loading: loading || authLoading,
    mode,
    family,
    subscription,
    entitlements,
    children,
    refreshChildren,
    refreshSubscription,
    refreshFamily,
    isParentUnlocked,
    unlockParentArea,
    lockParentArea,
    hasParentPin: Boolean(family?.parentPinHash),
    setParentPin,
  }

  return <FamilyContext.Provider value={value}>{reactChildren}</FamilyContext.Provider>
}

export function useFamily() {
  const ctx = useContext(FamilyContext)
  if (!ctx) throw new Error('useFamily must be used within a FamilyProvider')
  return ctx
}
