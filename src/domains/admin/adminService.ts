import { supabase } from '../../lib/supabaseClient'

export interface AdminFamilyRow {
  familyId: string
  email: string | null
  createdAt: string
  status: string
  trialEndsAt: string | null
  childrenCount: number
  listsCount: number
  sessionsCount: number
  freeAnswersUsed: number
  lastActivityAt: string | null
}

export interface AdminOverview {
  totalFamilies: number
  activeTrials: number
  freeAccounts: number
  premiumAccounts: number
  totalChildren: number
  totalSessions: number
  totalAnswers: number
  wordsPracticed: number
  wordsMastered: number
  familiesReadyForTest: number
  avgSessionsBeforeReady: number | null
}

/** True only if the signed-in user is a row in the `admins` table (checked server-side, not by role name). */
export async function isCurrentUserAdmin(): Promise<boolean> {
  if (!supabase) return false
  const { data, error } = await supabase.rpc('is_admin')
  if (error) return false
  return Boolean(data)
}

interface AdminOverviewRow {
  total_families: number
  active_trials: number
  free_accounts: number
  premium_accounts: number
  total_children: number
  total_sessions: number
  total_answers: number
  words_practiced: number
  words_mastered: number
  families_ready_for_test: number
  avg_sessions_before_ready: number | null
}

export async function getAdminOverview(): Promise<AdminOverview> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('admin_overview')
  if (error) throw error
  const row = (Array.isArray(data) ? data[0] : data) as AdminOverviewRow
  return {
    totalFamilies: row.total_families,
    activeTrials: row.active_trials,
    freeAccounts: row.free_accounts,
    premiumAccounts: row.premium_accounts,
    totalChildren: row.total_children,
    totalSessions: row.total_sessions,
    totalAnswers: row.total_answers,
    wordsPracticed: row.words_practiced,
    wordsMastered: row.words_mastered,
    familiesReadyForTest: row.families_ready_for_test,
    avgSessionsBeforeReady: row.avg_sessions_before_ready,
  }
}

interface AdminFamilyDbRow {
  family_id: string
  email: string | null
  created_at: string
  status: string
  trial_ends_at: string | null
  children_count: number
  lists_count: number
  sessions_count: number
  free_answers_used: number
  last_activity_at: string | null
}

export async function getAdminFamilies(): Promise<AdminFamilyRow[]> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.rpc('admin_list_families')
  if (error) throw error
  return (data as AdminFamilyDbRow[]).map((r) => ({
    familyId: r.family_id,
    email: r.email,
    createdAt: r.created_at,
    status: r.status,
    trialEndsAt: r.trial_ends_at,
    childrenCount: r.children_count,
    listsCount: r.lists_count,
    sessionsCount: r.sessions_count,
    freeAnswersUsed: r.free_answers_used,
    lastActivityAt: r.last_activity_at,
  }))
}

export type AdminTestAction = 'activate_premium' | 'set_free' | 'reset_trial'

/** Clearly-labeled testing-only shortcuts — see AdminScreen.tsx for the UI warning shown next to these. */
export async function runAdminTestAction(familyId: string, action: AdminTestAction): Promise<void> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.rpc('admin_test_action', { p_family_id: familyId, p_action: action })
  if (error) throw error
}
