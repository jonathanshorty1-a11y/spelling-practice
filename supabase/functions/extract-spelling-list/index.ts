// Turns a photo of a spelling word list into structured data: words,
// detected title, detected test date, and a confidence score. Runs
// server-side (Supabase Edge Function, Deno) so the OpenAI API key never
// reaches the browser.
//
// Deploy:
//   supabase functions deploy extract-spelling-list
//
// Secrets (supabase secrets set ...):
//   OPENAI_API_KEY        - required. From platform.openai.com/api-keys.
//   OPENAI_VISION_MODEL   - optional, defaults to DEFAULT_MODEL below. Kept
//                            configurable so the model can be swapped later
//                            without redeploying code.
//
// SUPABASE_URL / SUPABASE_ANON_KEY are injected automatically by the
// platform into every Edge Function - nothing to set for those.
//
// Auth: this function is deployed WITH JWT verification on (the platform
// default - no --no-verify-jwt flag), so a request with no valid Supabase
// session is rejected before this code ever runs. On top of that, it
// re-checks the caller's own subscription status server-side (trial/premium
// only) so the Photo Import paywall can't be bypassed by calling this
// endpoint directly instead of going through the app's UI gate.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const DEFAULT_MODEL = 'gpt-5.4-mini'
const MAX_IMAGE_BYTES = 8 * 1024 * 1024 // 8MB - generous for a phone photo, caps cost/abuse
const MAX_WORDS = 40 // sanity cap - no real weekly spelling list is longer than this
const MAX_WORD_LENGTH = 40
const MAX_TITLE_LENGTH = 120

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ExtractRequestBody {
  imageBase64?: unknown
  mimeType?: unknown
}

interface ExtractResult {
  words: string[]
  detectedTitle: string | null
  detectedTestDate: string | null
  confidence: number | null
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}

/**
 * Never trust the model's JSON blindly - coerce/clamp every field into the
 * exact shape the client expects, dropping anything malformed rather than
 * letting it flow through.
 */
function sanitizeResult(raw: unknown): ExtractResult {
  const obj = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>

  const words = Array.isArray(obj.words)
    ? Array.from(
        new Set(
          obj.words
            .filter((w): w is string => typeof w === 'string')
            .map((w) => w.trim())
            .filter((w) => w.length > 0 && w.length <= MAX_WORD_LENGTH),
        ),
      ).slice(0, MAX_WORDS)
    : []

  const detectedTitle =
    typeof obj.detectedTitle === 'string' && obj.detectedTitle.trim().length > 0
      ? obj.detectedTitle.trim().slice(0, MAX_TITLE_LENGTH)
      : null

  const detectedTestDate =
    typeof obj.detectedTestDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(obj.detectedTestDate)
      ? obj.detectedTestDate
      : null

  const confidence =
    typeof obj.confidence === 'number' && Number.isFinite(obj.confidence) && obj.confidence >= 0 && obj.confidence <= 1
      ? obj.confidence
      : null

  return { words, detectedTitle, detectedTestDate, confidence }
}

function buildSystemPrompt(today: string): string {
  return `You read photos of children's weekly spelling word lists (handwritten or printed school worksheets). Extract:
- words: every spelling word on the sheet, one entry each, in the order they appear top to bottom. Do not include instructions, headers, numbers, or bullet characters - only the actual spelling words. Do not invent or guess words you cannot read with reasonable confidence; skip them instead.
- detectedTitle: a short title if one is visibly written on the sheet (e.g. "Week 4 Spelling List", "Unit 3 Words"), else null.
- detectedTestDate: only if an explicit test/quiz date is visible AND you can convert it to an unambiguous calendar date, return it as ISO 8601 (YYYY-MM-DD). Today's date is ${today} - use it to resolve relative dates like "this Friday" or "next Tuesday". If there is no date on the sheet, or you are not confident of the exact date, return null. Never guess a date.
- confidence: your overall confidence in this whole extraction, from 0 to 1.

Respond with ONLY a JSON object with exactly these four keys: words (array of strings), detectedTitle (string or null), detectedTestDate (string or null), confidence (number).`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Method not allowed' }, 405)
  }

  const authHeader = req.headers.get('Authorization')
  if (!authHeader) {
    return jsonResponse({ error: 'Missing Authorization header' }, 401)
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const openaiApiKey = Deno.env.get('OPENAI_API_KEY')

  if (!supabaseUrl || !supabaseAnonKey) {
    console.error('Missing SUPABASE_URL/SUPABASE_ANON_KEY in function environment')
    return jsonResponse({ error: 'Server misconfigured' }, 500)
  }
  if (!openaiApiKey) {
    console.error('Missing OPENAI_API_KEY secret')
    return jsonResponse({ error: 'Server misconfigured' }, 500)
  }

  // Scoped to the CALLER's own JWT - every query below is subject to that
  // user's RLS policies, so this can only ever see their own family's data.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  })

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()
  if (userError || !user) {
    return jsonResponse({ error: 'Invalid or expired session' }, 401)
  }

  // Re-check the Photo Import entitlement server-side - the client already
  // gates this button behind canUsePhotoImport (trial/premium only), but a
  // direct call to this endpoint must not be able to bypass that paywall.
  const { data: family } = await supabase.from('families').select('id').eq('owner_user_id', user.id).maybeSingle()
  if (!family) {
    return jsonResponse({ error: 'No family found for this account' }, 403)
  }
  const { data: subscription } = await supabase
    .from('subscriptions')
    .select('status')
    .eq('family_id', family.id)
    .maybeSingle()
  const status = subscription?.status ?? 'guest'
  if (status !== 'trial' && status !== 'premium') {
    return jsonResponse({ error: 'Photo Import is a Premium feature' }, 403)
  }

  let body: ExtractRequestBody
  try {
    body = await req.json()
  } catch {
    return jsonResponse({ error: 'Invalid JSON body' }, 400)
  }

  const imageBase64 = body.imageBase64
  const mimeType = body.mimeType
  if (typeof imageBase64 !== 'string' || imageBase64.length === 0) {
    return jsonResponse({ error: 'Missing imageBase64' }, 400)
  }
  if (typeof mimeType !== 'string' || !mimeType.startsWith('image/')) {
    return jsonResponse({ error: 'Missing or invalid mimeType' }, 400)
  }
  // Rough size check on the base64 payload (base64 is ~4/3 the size of the raw bytes).
  if (imageBase64.length > MAX_IMAGE_BYTES * 1.4) {
    return jsonResponse({ error: 'Image too large' }, 400)
  }

  const model = Deno.env.get('OPENAI_VISION_MODEL') || DEFAULT_MODEL
  const today = new Date().toISOString().slice(0, 10)

  let openaiRes: Response
  try {
    openaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${openaiApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        response_format: { type: 'json_object' },
        temperature: 0,
        messages: [
          { role: 'system', content: buildSystemPrompt(today) },
          {
            role: 'user',
            content: [
              { type: 'text', text: 'Extract the spelling word list from this photo.' },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${imageBase64}` } },
            ],
          },
        ],
      }),
    })
  } catch (err) {
    console.error('OpenAI request failed:', err)
    return jsonResponse({ error: 'Vision provider unreachable' }, 502)
  }

  if (!openaiRes.ok) {
    console.error('OpenAI error:', openaiRes.status, await openaiRes.text())
    return jsonResponse({ error: 'Vision provider error' }, 502)
  }

  const completion = await openaiRes.json()
  const content = completion?.choices?.[0]?.message?.content
  if (typeof content !== 'string') {
    console.error('Unexpected OpenAI response shape:', JSON.stringify(completion))
    return jsonResponse({ error: 'Vision provider returned an unexpected response' }, 502)
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(content)
  } catch {
    console.error('Could not parse model output as JSON:', content)
    return jsonResponse({ error: 'Could not parse vision provider output' }, 502)
  }

  const result = sanitizeResult(parsed)
  if (result.words.length === 0) {
    return jsonResponse({ error: 'No words could be read from that photo' }, 422)
  }

  return jsonResponse(result, 200)
})
