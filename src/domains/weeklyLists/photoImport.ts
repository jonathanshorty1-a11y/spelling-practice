/**
 * Photo → Words, via a Supabase Edge Function (`extract-spelling-list`) that
 * calls an OpenAI vision model server-side. The OpenAI API key never reaches
 * the browser — it's a Supabase secret the Edge Function reads from its own
 * environment. See supabase/functions/extract-spelling-list/index.ts for the
 * full server-side implementation, prompt, and response validation.
 *
 * One-time setup (Supabase CLI):
 *   supabase functions deploy extract-spelling-list
 *   supabase secrets set OPENAI_API_KEY=sk-...
 *   supabase secrets set OPENAI_VISION_MODEL=gpt-5.4-mini   # optional — this is already the default
 *
 * Photo Import is gated behind a trial/premium subscription (canUsePhotoImport
 * in entitlements.ts), which only exists in cloud mode — so `supabase` is
 * always configured by the time this runs for a real user.
 */

import { supabase } from '../../lib/supabaseClient'

export interface ExtractSpellingListResult {
  words: string[]
  detectedTitle: string | null
  /** ISO date string (yyyy-mm-dd), or null if no date was found on the sheet. */
  detectedTestDate: string | null
  /** 0-1 confidence from the vision model, or null if unavailable. */
  confidence: number | null
  /** Always false now that a real vision provider is connected. */
  isMock: boolean
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result as string
      const commaIndex = result.indexOf(',')
      resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result)
    }
    reader.onerror = () => reject(reader.error ?? new Error('Could not read the selected file.'))
    reader.readAsDataURL(file)
  })
}

/** Pulls the Edge Function's `{ error: "..." }` body out of a supabase-js FunctionsError, if present. */
async function extractErrorMessage(error: unknown): Promise<string> {
  const context = (error as { context?: Response } | null)?.context
  if (context && typeof context.json === 'function') {
    try {
      const body = await context.json()
      if (typeof body?.error === 'string') return body.error
    } catch {
      // fall through to the generic message below
    }
  }
  return 'Could not read that photo. Try again or paste the words instead.'
}

export async function extractSpellingListFromImage(file: File): Promise<ExtractSpellingListResult> {
  if (!supabase) {
    throw new Error('Photo Import requires a signed-in account.')
  }

  const imageBase64 = await fileToBase64(file)
  const { data, error } = await supabase.functions.invoke('extract-spelling-list', {
    body: { imageBase64, mimeType: file.type || 'image/jpeg' },
  })

  if (error) {
    throw new Error(await extractErrorMessage(error))
  }

  return {
    words: Array.isArray(data?.words) ? data.words : [],
    detectedTitle: typeof data?.detectedTitle === 'string' ? data.detectedTitle : null,
    detectedTestDate: typeof data?.detectedTestDate === 'string' ? data.detectedTestDate : null,
    confidence: typeof data?.confidence === 'number' ? data.confidence : null,
    isMock: false,
  }
}
