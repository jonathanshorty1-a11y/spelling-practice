import type { DataMode } from '../../lib/dataMode'
import { loadLocalDb, newId, saveLocalDb } from '../../lib/localDb'
import { supabase } from '../../lib/supabaseClient'

export type AnalyticsEventName =
  | 'account_created'
  | 'child_created'
  | 'weekly_list_created'
  | 'practice_started'
  | 'practice_completed'
  | 'practice_answer_submitted'
  | 'mistake_practice_started'
  | 'trial_started'
  | 'trial_expired'
  | 'paywall_viewed'
  | 'upgrade_clicked'
  | 'smart_practice_started'
  | 'smart_practice_completed'
  | 'word_mastered'
  | 'word_mastery_lost'
  | 'readiness_changed'
  | 'ready_for_test_reached'
  | 'weak_words_started'
  | 'final_review_started'
  | 'photo_import_started'
  | 'photo_import_completed'

/**
 * Fire-and-forget event log. No external analytics platform yet (Mixpanel etc.)
 * — just an `analytics_events` table so basic funnels can be queried in SQL.
 * Never throws: a tracking failure must never break the user's flow.
 */
export function trackEvent(
  mode: DataMode,
  eventName: AnalyticsEventName,
  payload: Record<string, unknown> = {},
  familyId: string | null = null,
): void {
  try {
    if (mode === 'local') {
      const db = loadLocalDb()
      db.analytics.push({ id: newId(), familyId, eventName, payload, createdAt: new Date().toISOString() })
      // Keep local analytics from growing unbounded.
      if (db.analytics.length > 500) db.analytics = db.analytics.slice(-500)
      saveLocalDb(db)
      return
    }
    if (!supabase) return
    void supabase.from('analytics_events').insert({ family_id: familyId, event_name: eventName, payload })
  } catch (error) {
    console.warn('trackEvent failed (ignored):', error)
  }
}
