import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './domains/auth/AuthContext'
import { FamilyProvider, useFamily } from './domains/family/FamilyContext'
import { WelcomeScreen } from './domains/onboarding/WelcomeScreen'
import { SignInScreen } from './domains/auth/SignInScreen'
import { AddChildScreen } from './domains/children/AddChildScreen'
import { AddWeeklyWordsScreen } from './domains/weeklyLists/AddWeeklyWordsScreen'
import { HomeScreen } from './domains/home/HomeScreen'
import { ChildMenuScreen } from './domains/home/ChildMenuScreen'
import { StudyScreen } from './domains/study/StudyScreen'
import { PracticeTestScreen } from './domains/practice/PracticeTestScreen'
import { ResultsScreen } from './domains/results/ResultsScreen'
import { ParentAreaScreen } from './domains/parentArea/ParentAreaScreen'
import { PaywallScreen } from './domains/subscription/PaywallScreen'
import { AdminScreen } from './domains/admin/AdminScreen'
import { OfflineBanner } from './components/OfflineBanner'
import { I18nProvider } from './lib/i18n'

function LocalizedApp({ children }: { children: ReactNode }) {
  const { family } = useFamily()
  return <I18nProvider language={family?.parentLanguage ?? 'en'}>{children}</I18nProvider>
}

function RootRoute() {
  const { loading, mode, children } = useFamily()
  if (loading) return null
  if (mode === 'cloud' || children.length > 0) return <Navigate to="/home" replace />
  return <WelcomeScreen />
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<RootRoute />} />
      <Route path="/sign-in" element={<SignInScreen />} />
      <Route path="/add-child" element={<AddChildScreen />} />
      <Route path="/home" element={<HomeScreen />} />
      <Route path="/child/:childId" element={<ChildMenuScreen />} />
      <Route path="/child/:childId/add-words" element={<AddWeeklyWordsScreen />} />
      <Route path="/child/:childId/study" element={<StudyScreen />} />
      <Route path="/child/:childId/practice" element={<PracticeTestScreen />} />
      <Route path="/child/:childId/results" element={<ResultsScreen />} />
      <Route path="/parent" element={<ParentAreaScreen />} />
      <Route path="/admin" element={<AdminScreen />} />
      <Route path="/paywall" element={<PaywallScreen />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

export default function App() {
  return (
    <AuthProvider>
      <FamilyProvider>
        <LocalizedApp>
          <OfflineBanner />
          <AppRoutes />
        </LocalizedApp>
      </FamilyProvider>
    </AuthProvider>
  )
}
