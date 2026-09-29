/**
 * Photo → Words. No OCR/vision service is connected yet — this is a clearly
 * labeled mock so the UI/UX (review, edit, confirm, date suggestion) can be
 * fully built and tested today. To connect a real service later:
 *
 *   1. Send `file` to your OCR/vision endpoint (e.g. OpenAI's vision models,
 *      or Google Cloud Vision's text + document detection) from a small
 *      server function — never call a vision API with a secret key directly
 *      from the browser.
 *   2. Parse the returned text with `parseWordsInput` from ./wordParsing —
 *      it already handles one-word-per-line, commas, and duplicates.
 *   3. If the sheet has a visible title ("Week 4 Spelling List") or a date
 *      ("Test: Friday, Oct 3"), have the real service return those as
 *      `detectedTitle` / `detectedTestDate` (ISO yyyy-mm-dd) so
 *      AddWeeklyWordsScreen can pre-fill them — it already reads both.
 *   4. Replace the body of this function with that call. Nothing else in
 *      the app needs to change: AddWeeklyWordsScreen only depends on this
 *      function's return shape.
 *
 * No API key is invented or hardcoded here — do not add one without asking.
 */

export interface ExtractSpellingListResult {
  words: string[]
  detectedTitle: string | null
  /** ISO date string (yyyy-mm-dd), or null if no date was found on the sheet. */
  detectedTestDate: string | null
  /** 0-1, or null for the mock (which doesn't simulate confidence). */
  confidence: number | null
  /** True for the mock implementation — screens can show a small "demo" hint. */
  isMock: true
}

const MOCK_DETECTED_WORDS = ['climb', 'height', 'drive', 'wildlife', 'sigh', 'fright']

export async function extractSpellingListFromImage(_file: File): Promise<ExtractSpellingListResult> {
  // Simulate processing time so the loading state is testable.
  await new Promise((resolve) => setTimeout(resolve, 1200))
  return {
    words: MOCK_DETECTED_WORDS,
    detectedTitle: null,
    detectedTestDate: null,
    confidence: null,
    isMock: true,
  }
}
