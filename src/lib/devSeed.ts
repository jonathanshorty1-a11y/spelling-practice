import { loadLocalDb, newId, saveLocalDb } from './localDb'

const HILLARY_WORDS = [
  'climb', 'minding', 'pies', 'die', 'height', 'sigh', 'fright', 'slight', 'drive', 'file',
  'kite', 'prime', 'pride', 'slice', 'twice', 'wipe', 'pry', 'sly', 'shy', 'spy',
  'chief', 'zebra', 'sleek', 'highway', 'wildlife',
]
const JEIMY_WORDS = ['cat', 'dog', 'sun', 'fish', 'book', 'tree', 'milk', 'star', 'frog', 'home']

/**
 * Dev-only demo data: a guest family ("Jonathan Test") with Hillary and
 * Jeimy plus a starter weekly list each. Only wired up behind
 * import.meta.env.DEV (see main.tsx) — never runs in a production build.
 * Call from the browser console: `window.__loadDemoData()`.
 */
export function loadDemoGuestData(): void {
  const db = loadLocalDb()
  const now = new Date().toISOString()

  const family = db.family ?? {
    id: newId(),
    ownerUserId: null,
    email: null,
    parentPinHash: null,
    parentLanguage: 'en' as const,
    createdAt: now,
  }
  db.family = family

  const makeChild = (name: string, avatar: string, themeColor: string) => ({
    id: newId(),
    familyId: family.id,
    name,
    avatar,
    themeColor,
    grade: null,
    createdAt: now,
  })

  const hillary = makeChild('Hillary', '🦄', '#FF6B9D')
  const jeimy = makeChild('Jeimy', '🌈', '#33B7C4')
  db.children.push(hillary, jeimy)

  const makeList = (childId: string, words: string[]) => {
    const list = {
      id: newId(),
      childId,
      familyId: family.id,
      title: 'Week of September 28',
      weekStart: null,
      weekEnd: null,
      testDate: null,
      createdAt: now,
      archived: false,
    }
    db.lists.push(list)
    words.forEach((word, i) => db.words.push({ id: newId(), listId: list.id, word, orderIndex: i, exampleSentence: null }))
  }

  makeList(hillary.id, HILLARY_WORDS)
  makeList(jeimy.id, JEIMY_WORDS)

  saveLocalDb(db)
  console.info('[devSeed] Demo family loaded: Hillary + Jeimy. Reload the page to see it.')
}
