import type { DataMode } from '../../lib/dataMode'
import { loadLocalDb, newId, saveLocalDb } from '../../lib/localDb'
import { supabase } from '../../lib/supabaseClient'
import { childFromRow, childToRow, type ChildRow } from '../../lib/supabaseRows'
import type { Child } from '../shared/types'

export const CHILD_AVATARS = ['🦄', '🌈', '🐯', '🐼', '🦊', '🐨', '🦁', '🐸', '🐙', '🦋'] as const
export const CHILD_THEME_COLORS = ['#FF6B9D', '#33B7C4', '#8A6BE0', '#F5A623', '#4CAF7D', '#E8585A'] as const

export async function listChildren(mode: DataMode, familyId: string): Promise<Child[]> {
  if (mode === 'local') {
    return loadLocalDb().children.filter((c) => c.familyId === familyId)
  }
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('children')
    .select('*')
    .eq('family_id', familyId)
    .order('created_at', { ascending: true })
  if (error) throw error
  return (data as ChildRow[]).map(childFromRow)
}

export interface CreateChildInput {
  name: string
  avatar: string
  themeColor: string
  grade?: string | null
}

export async function createChild(mode: DataMode, familyId: string, input: CreateChildInput): Promise<Child> {
  const child: Omit<Child, 'id' | 'createdAt'> = {
    familyId,
    name: input.name.trim(),
    avatar: input.avatar,
    themeColor: input.themeColor,
    grade: input.grade ?? null,
  }

  if (mode === 'local') {
    const db = loadLocalDb()
    const created: Child = { ...child, id: newId(), createdAt: new Date().toISOString() }
    db.children.push(created)
    saveLocalDb(db)
    return created
  }

  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('children').insert(childToRow(child)).select('*').single()
  if (error) throw error
  return childFromRow(data as ChildRow)
}

export async function deleteChild(mode: DataMode, childId: string): Promise<void> {
  if (mode === 'local') {
    const db = loadLocalDb()
    db.children = db.children.filter((c) => c.id !== childId)
    // Deliberately NOT touching db.subscription here — deleting a child must
    // never reset the family's lifetime free-answer count.
    saveLocalDb(db)
    return
  }
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('children').delete().eq('id', childId)
  if (error) throw error
}

/** Powers the "Last score: 90%" line on the child's Home card. */
export async function getLastScorePercentage(mode: DataMode, childId: string): Promise<number | null> {
  if (mode === 'local') {
    const db = loadLocalDb()
    const sessions = db.sessions
      .filter((s) => s.childId === childId && s.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
    return sessions[0]?.percentage ?? null
  }
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('practice_sessions')
    .select('percentage')
    .eq('child_id', childId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
    .limit(1)
  if (error) throw error
  return data[0]?.percentage ?? null
}
