import type { DataMode } from '../../lib/dataMode'
import { loadLocalDb, newId, saveLocalDb } from '../../lib/localDb'
import { supabase } from '../../lib/supabaseClient'
import { wordMasteryFromRow, wordMasteryToRow, type WordMasteryRow } from '../../lib/supabaseRows'
import type { MasteryEvent, WordMasteryRecord } from '../shared/types'
import { calculateWordMastery } from './masteryEngine'

/** All mastery rows for a child's given list — used to build the practice queue and readiness. */
export async function getMasteryForList(mode: DataMode, childId: string, listId: string): Promise<Map<string, WordMasteryRecord>> {
  if (mode === 'local') {
    const db = loadLocalDb()
    const rows = db.wordMastery.filter((m) => m.childId === childId && m.listId === listId)
    return new Map(rows.map((r) => [r.wordId, r]))
  }
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('word_mastery').select('*').eq('child_id', childId).eq('list_id', listId)
  if (error) throw error
  const rows = (data as WordMasteryRow[]).map(wordMasteryFromRow)
  return new Map(rows.map((r) => [r.wordId, r]))
}

export interface ApplyMasteryEventInput {
  familyId: string
  childId: string
  listId: string
  wordId: string
  event: MasteryEvent
}

/**
 * Loads (or default-creates) the mastery record for one word, folds in the
 * new event via calculateWordMastery, and persists the result. Called once
 * per resolved word during a practice session — see PracticeTestScreen.
 */
export async function applyMasteryEvent(mode: DataMode, input: ApplyMasteryEventInput): Promise<WordMasteryRecord> {
  const base = { id: newId(), familyId: input.familyId, childId: input.childId, listId: input.listId, wordId: input.wordId }

  if (mode === 'local') {
    const db = loadLocalDb()
    const idx = db.wordMastery.findIndex((m) => m.childId === input.childId && m.listId === input.listId && m.wordId === input.wordId)
    const current = idx === -1 ? null : db.wordMastery[idx]
    const next = calculateWordMastery(current, base, input.event)
    if (idx === -1) db.wordMastery.push(next)
    else db.wordMastery[idx] = next
    saveLocalDb(db)
    return next
  }

  if (!supabase) throw new Error('Supabase is not configured')
  const { data: existingRow, error: fetchError } = await supabase
    .from('word_mastery')
    .select('*')
    .eq('child_id', input.childId)
    .eq('list_id', input.listId)
    .eq('word_id', input.wordId)
    .maybeSingle()
  if (fetchError) throw fetchError

  const current = existingRow ? wordMasteryFromRow(existingRow as WordMasteryRow) : null
  const next = calculateWordMastery(current, base, input.event)
  const row = wordMasteryToRow(next)

  if (current) {
    const { data, error } = await supabase.from('word_mastery').update(row).eq('id', current.id).select('*').single()
    if (error) throw error
    return wordMasteryFromRow(data as WordMasteryRow)
  }

  const { data, error } = await supabase.from('word_mastery').insert(row).select('*').single()
  if (error) throw error
  return wordMasteryFromRow(data as WordMasteryRow)
}
