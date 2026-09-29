/**
 * Every domain service is called with an explicit DataMode instead of reaching
 * into global state — 'local' reads/writes localStorage (guest mode, no
 * account yet), 'cloud' reads/writes Supabase (signed-in family). Exactly one
 * is active per browser session; FamilyContext decides which and passes it
 * down via useFamily().
 */
export type DataMode = 'local' | 'cloud'
