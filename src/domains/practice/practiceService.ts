import type { DataMode } from '../../lib/dataMode'
import { loadLocalDb, newId, saveLocalDb } from '../../lib/localDb'
import { supabase } from '../../lib/supabaseClient'
import { answerFromRow, answerToRow, sessionFromRow, sessionToRow, type PracticeAnswerRow, type PracticeSessionRow } from '../../lib/supabaseRows'
import type { PracticeAnswer, PracticeMode, PracticeSession, PracticeType } from '../shared/types'

export interface StartSessionInput {
  familyId: string
  childId: string
  listId: string
  mode: PracticeMode
  practiceType: PracticeType
  totalWords: number
}

export async function startSession(mode: DataMode, input: StartSessionInput): Promise<PracticeSession> {
  const session: Omit<PracticeSession, 'id'> = {
    familyId: input.familyId,
    childId: input.childId,
    listId: input.listId,
    mode: input.mode,
    practiceType: input.practiceType,
    startedAt: new Date().toISOString(),
    completedAt: null,
    totalWords: input.totalWords,
    correctWords: 0,
    percentage: 0,
  }

  if (mode === 'local') {
    const db = loadLocalDb()
    const created: PracticeSession = { ...session, id: newId() }
    db.sessions.push(created)
    saveLocalDb(db)
    return created
  }

  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('practice_sessions').insert(sessionToRow(session)).select('*').single()
  if (error) throw error
  return sessionFromRow(data as PracticeSessionRow)
}

export interface RecordAnswerInput {
  sessionId: string
  wordId: string
  word: string
  typedAnswer: string
  correct: boolean
  attempts: number
  usedHint: boolean
  revealedAnswer: boolean
}

/** Persists one resolved word's final answer row (called once per word, when it's resolved). */
export async function recordAnswer(mode: DataMode, input: RecordAnswerInput): Promise<PracticeAnswer> {
  const answer: Omit<PracticeAnswer, 'id'> = { ...input }

  if (mode === 'local') {
    const db = loadLocalDb()
    const created: PracticeAnswer = { ...answer, id: newId() }
    db.answers.push(created)
    saveLocalDb(db)
    return created
  }

  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('practice_answers').insert(answerToRow(answer)).select('*').single()
  if (error) throw error
  return answerFromRow(data as PracticeAnswerRow)
}

export interface CompleteSessionInput {
  sessionId: string
  totalWords: number
  correctWords: number
  percentage: number
}

export async function completeSession(mode: DataMode, input: CompleteSessionInput): Promise<PracticeSession> {
  const patch = {
    completedAt: new Date().toISOString(),
    totalWords: input.totalWords,
    correctWords: input.correctWords,
    percentage: input.percentage,
  }

  if (mode === 'local') {
    const db = loadLocalDb()
    const idx = db.sessions.findIndex((s) => s.id === input.sessionId)
    if (idx === -1) throw new Error('Session not found')
    db.sessions[idx] = { ...db.sessions[idx], ...patch }
    saveLocalDb(db)
    return db.sessions[idx]
  }

  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('practice_sessions')
    .update({
      completed_at: patch.completedAt,
      total_words: patch.totalWords,
      correct_words: patch.correctWords,
      percentage: patch.percentage,
    })
    .eq('id', input.sessionId)
    .select('*')
    .single()
  if (error) throw error
  return sessionFromRow(data as PracticeSessionRow)
}

export async function getSessionHistory(mode: DataMode, childId: string): Promise<PracticeSession[]> {
  if (mode === 'local') {
    const db = loadLocalDb()
    return db.sessions
      .filter((s) => s.childId === childId && s.completedAt)
      .sort((a, b) => new Date(b.completedAt!).getTime() - new Date(a.completedAt!).getTime())
  }
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('practice_sessions')
    .select('*')
    .eq('child_id', childId)
    .not('completed_at', 'is', null)
    .order('completed_at', { ascending: false })
  if (error) throw error
  return (data as PracticeSessionRow[]).map(sessionFromRow)
}

export async function getSessionAnswers(mode: DataMode, sessionId: string): Promise<PracticeAnswer[]> {
  if (mode === 'local') {
    const db = loadLocalDb()
    return db.answers.filter((a) => a.sessionId === sessionId)
  }
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('practice_answers').select('*').eq('session_id', sessionId)
  if (error) throw error
  return (data as PracticeAnswerRow[]).map(answerFromRow)
}
