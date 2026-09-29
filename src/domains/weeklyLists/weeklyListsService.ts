import type { DataMode } from '../../lib/dataMode'
import { loadLocalDb, newId, saveLocalDb } from '../../lib/localDb'
import { supabase } from '../../lib/supabaseClient'
import {
  weeklyListFromRow,
  weeklyListToRow,
  weeklyWordFromRow,
  weeklyWordToRow,
  type WeeklyListRow,
  type WeeklyWordRow,
} from '../../lib/supabaseRows'
import type { WeeklyList, WeeklyWord } from '../shared/types'

export interface ListWithWords {
  list: WeeklyList
  words: WeeklyWord[]
}

/** The most recent, non-archived list for a child — what Study/Practice use by default. */
export async function getActiveListForChild(mode: DataMode, childId: string): Promise<ListWithWords | null> {
  if (mode === 'local') {
    const db = loadLocalDb()
    const active = db.lists
      .filter((l) => l.childId === childId && !l.archived)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0]
    if (!active) return null
    const words = db.words.filter((w) => w.listId === active.id).sort((a, b) => a.orderIndex - b.orderIndex)
    return { list: active, words }
  }

  if (!supabase) throw new Error('Supabase is not configured')
  const { data: lists, error } = await supabase
    .from('weekly_lists')
    .select('*')
    .eq('child_id', childId)
    .eq('archived', false)
    .order('created_at', { ascending: false })
    .limit(1)
  if (error) throw error
  if (!lists.length) return null
  const list = weeklyListFromRow(lists[0] as WeeklyListRow)
  const { data: words, error: wordsError } = await supabase
    .from('weekly_words')
    .select('*')
    .eq('list_id', list.id)
    .order('order_index', { ascending: true })
  if (wordsError) throw wordsError
  return { list, words: (words as WeeklyWordRow[]).map(weeklyWordFromRow) }
}

export async function getListHistory(mode: DataMode, childId: string): Promise<WeeklyList[]> {
  if (mode === 'local') {
    const db = loadLocalDb()
    return db.lists
      .filter((l) => l.childId === childId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
  }
  if (!supabase) throw new Error('Supabase is not configured')
  const { data, error } = await supabase
    .from('weekly_lists')
    .select('*')
    .eq('child_id', childId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as WeeklyListRow[]).map(weeklyListFromRow)
}

export interface CreateWeeklyListInput {
  familyId: string
  childId: string
  title: string
  words: string[]
  /** ISO date string (yyyy-mm-dd), or null if the parent didn't say when the test is. */
  testDate?: string | null
}

/** Archives any previous active list for this child, then creates the new one with its words. */
export async function createWeeklyList(mode: DataMode, input: CreateWeeklyListInput): Promise<ListWithWords> {
  const now = new Date().toISOString()

  if (mode === 'local') {
    const db = loadLocalDb()
    db.lists = db.lists.map((l) => (l.childId === input.childId && !l.archived ? { ...l, archived: true } : l))

    const list: WeeklyList = {
      id: newId(),
      childId: input.childId,
      familyId: input.familyId,
      title: input.title,
      weekStart: null,
      weekEnd: null,
      testDate: input.testDate ?? null,
      createdAt: now,
      archived: false,
    }
    const words: WeeklyWord[] = input.words.map((word, index) => ({
      id: newId(),
      listId: list.id,
      word,
      orderIndex: index,
      exampleSentence: null,
    }))
    db.lists.push(list)
    db.words.push(...words)
    saveLocalDb(db)
    return { list, words }
  }

  if (!supabase) throw new Error('Supabase is not configured')
  const { error: archiveError } = await supabase
    .from('weekly_lists')
    .update({ archived: true })
    .eq('child_id', input.childId)
    .eq('archived', false)
  if (archiveError) throw archiveError

  const { data: listRow, error: listError } = await supabase
    .from('weekly_lists')
    .insert(
      weeklyListToRow({
        childId: input.childId,
        familyId: input.familyId,
        title: input.title,
        weekStart: null,
        weekEnd: null,
        testDate: input.testDate ?? null,
        archived: false,
      }),
    )
    .select('*')
    .single()
  if (listError) throw listError
  const list = weeklyListFromRow(listRow as WeeklyListRow)

  const wordRows = input.words.map((word, index) =>
    weeklyWordToRow({ listId: list.id, word, orderIndex: index, exampleSentence: null }),
  )
  const { data: wordsData, error: wordsError } = await supabase.from('weekly_words').insert(wordRows).select('*')
  if (wordsError) throw wordsError

  return { list, words: (wordsData as WeeklyWordRow[]).map(weeklyWordFromRow) }
}
