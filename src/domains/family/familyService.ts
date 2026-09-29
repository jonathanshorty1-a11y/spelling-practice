import type { DataMode } from '../../lib/dataMode'
import { loadLocalDb, newId, saveLocalDb } from '../../lib/localDb'
import { supabase } from '../../lib/supabaseClient'
import { familyFromRow, type FamilyRow } from '../../lib/supabaseRows'
import type { Family, ParentLanguage } from '../shared/types'
import { hashPin, verifyPin } from '../parentArea/pinService'

/** Lazily creates the one local guest family the first time it's needed. */
export function getOrCreateGuestFamily(): Family {
  const db = loadLocalDb()
  if (db.family) return db.family
  const family: Family = {
    id: newId(),
    ownerUserId: null,
    email: null,
    parentPinHash: null,
    parentLanguage: 'en',
    createdAt: new Date().toISOString(),
  }
  db.family = family
  saveLocalDb(db)
  return family
}

export async function setParentLanguage(mode: DataMode, familyId: string, language: ParentLanguage): Promise<void> {
  if (mode === 'local') {
    const db = loadLocalDb()
    if (db.family) {
      db.family = { ...db.family, parentLanguage: language }
      saveLocalDb(db)
    }
    return
  }
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('families').update({ parent_language: language }).eq('id', familyId)
  if (error) throw error
}

export async function getCloudFamilyForUser(userId: string): Promise<Family | null> {
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase.from('families').select('*').eq('owner_user_id', userId).maybeSingle()
  if (error) throw error
  return data ? familyFromRow(data as FamilyRow) : null
}

export async function setParentPin(mode: DataMode, familyId: string, pin: string): Promise<void> {
  const hash = await hashPin(pin)
  if (mode === 'local') {
    const db = loadLocalDb()
    if (db.family) {
      db.family = { ...db.family, parentPinHash: hash }
      saveLocalDb(db)
    }
    return
  }
  if (!supabase) throw new Error('Supabase is not configured')
  const { error } = await supabase.from('families').update({ parent_pin_hash: hash }).eq('id', familyId)
  if (error) throw error
}

export async function checkParentPin(family: Family | null, pin: string): Promise<boolean> {
  if (!family?.parentPinHash) return false
  return verifyPin(pin, family.parentPinHash)
}

export interface MigrationResult {
  family: Family
  childCount: number
  listCount: number
  sessionCount: number
}

/**
 * The guest -> account bridge described in spec section 5: takes whatever a
 * guest built locally (one child, a word list, practice results) and copies
 * it verbatim into Supabase under the newly signed-in user, then clears
 * localStorage. Nothing is lost; nothing is duplicated (call this once, right
 * after sign-up, before the app re-reads local data).
 *
 * The family row itself (and its 7-day-trial subscription) is created by the
 * `handle_new_user` DB trigger the instant auth.users gets a new row — NOT
 * by this function — so that a family always exists exactly once even if a
 * user is created outside the guest-migration flow. This function fetches
 * that trigger-created family and hangs everything else off of it.
 */
export async function migrateGuestToCloud(userId: string, email: string | null): Promise<MigrationResult> {
  if (!supabase) throw new Error('Supabase is not configured')
  const localDb = loadLocalDb()

  let family = await getCloudFamilyForUser(userId)
  if (!family) {
    // Fallback for the unlikely case the trigger hasn't run yet (or was
    // removed/renamed in a later migration): create the family ourselves.
    const { data: familyRow, error: familyError } = await supabase
      .from('families')
      .insert({ owner_user_id: userId, email })
      .select('*')
      .single()
    if (familyError) throw familyError
    family = familyFromRow(familyRow as FamilyRow)
    await supabase.from('subscriptions').insert({ family_id: family.id, status: 'guest' }).select().maybeSingle()
  }

  if (localDb.family?.parentPinHash || email) {
    const { data: updatedRow, error: updateError } = await supabase
      .from('families')
      .update({ email: email ?? family.email, parent_pin_hash: localDb.family?.parentPinHash ?? family.parentPinHash })
      .eq('id', family.id)
      .select('*')
      .single()
    if (updateError) throw updateError
    family = familyFromRow(updatedRow as FamilyRow)
  }

  const childIdMap = new Map<string, string>()
  for (const child of localDb.children) {
    const { data, error } = await supabase
      .from('children')
      .insert({
        family_id: family.id,
        name: child.name,
        avatar: child.avatar,
        theme_color: child.themeColor,
        grade: child.grade,
      })
      .select('id')
      .single()
    if (error) throw error
    childIdMap.set(child.id, data.id as string)
  }

  const listIdMap = new Map<string, string>()
  for (const list of localDb.lists) {
    const newChildId = childIdMap.get(list.childId)
    if (!newChildId) continue
    const { data, error } = await supabase
      .from('weekly_lists')
      .insert({
        child_id: newChildId,
        family_id: family.id,
        title: list.title,
        week_start: list.weekStart,
        week_end: list.weekEnd,
        test_date: list.testDate,
        archived: list.archived,
      })
      .select('id')
      .single()
    if (error) throw error
    listIdMap.set(list.id, data.id as string)
  }

  const wordIdMap = new Map<string, string>()
  for (const word of localDb.words) {
    const newListId = listIdMap.get(word.listId)
    if (!newListId) continue
    const { data, error } = await supabase
      .from('weekly_words')
      .insert({ list_id: newListId, word: word.word, order_index: word.orderIndex, example_sentence: word.exampleSentence })
      .select('id')
      .single()
    if (error) throw error
    wordIdMap.set(word.id, data.id as string)
  }

  const sessionIdMap = new Map<string, string>()
  for (const session of localDb.sessions) {
    const newChildId = childIdMap.get(session.childId)
    const newListId = listIdMap.get(session.listId)
    if (!newChildId || !newListId) continue
    const { data, error } = await supabase
      .from('practice_sessions')
      .insert({
        family_id: family.id,
        child_id: newChildId,
        list_id: newListId,
        mode: session.mode,
        practice_type: session.practiceType,
        started_at: session.startedAt,
        completed_at: session.completedAt,
        total_words: session.totalWords,
        correct_words: session.correctWords,
        percentage: session.percentage,
      })
      .select('id')
      .single()
    if (error) throw error
    sessionIdMap.set(session.id, data.id as string)
  }

  for (const answer of localDb.answers) {
    const newSessionId = sessionIdMap.get(answer.sessionId)
    if (!newSessionId) continue
    const newWordId = wordIdMap.get(answer.wordId) ?? answer.wordId
    const { error } = await supabase.from('practice_answers').insert({
      session_id: newSessionId,
      word_id: newWordId,
      word: answer.word,
      typed_answer: answer.typedAnswer,
      correct: answer.correct,
      attempts: answer.attempts,
      used_hint: answer.usedHint,
      revealed_answer: answer.revealedAnswer,
    })
    if (error) throw error
  }

  for (const mastery of localDb.wordMastery) {
    const newChildId = childIdMap.get(mastery.childId)
    const newListId = listIdMap.get(mastery.listId)
    const newWordId = wordIdMap.get(mastery.wordId)
    if (!newChildId || !newListId || !newWordId) continue
    const { error } = await supabase.from('word_mastery').insert({
      family_id: family.id,
      child_id: newChildId,
      list_id: newListId,
      word_id: newWordId,
      status: mastery.status,
      correct_attempts: mastery.correctAttempts,
      incorrect_attempts: mastery.incorrectAttempts,
      consecutive_correct: mastery.consecutiveCorrect,
      sessions_seen: mastery.sessionsSeen,
      hints_used: mastery.hintsUsed,
      reveals_used: mastery.revealsUsed,
      recent_results: mastery.recentResults,
      last_session_id: mastery.lastSessionId ? (sessionIdMap.get(mastery.lastSessionId) ?? null) : null,
      last_practiced_at: mastery.lastPracticedAt,
      last_correct_at: mastery.lastCorrectAt,
      last_incorrect_at: mastery.lastIncorrectAt,
      mastery_score: mastery.masteryScore,
    })
    if (error) throw error
  }

  saveLocalDb({
    family: null,
    subscription: null,
    children: [],
    lists: [],
    words: [],
    sessions: [],
    answers: [],
    wordMastery: [],
    analytics: localDb.analytics, // kept only in memory for this session's own trackEvent calls
  })

  return {
    family,
    childCount: childIdMap.size,
    listCount: listIdMap.size,
    sessionCount: sessionIdMap.size,
  }
}
