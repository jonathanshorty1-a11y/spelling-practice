/**
 * Parses pasted or typed weekly-word input. Accepts one word per line, comma
 * separated, or a reasonable mix of both. Cleans up leading/trailing
 * whitespace, empty lines, stray commas, and de-duplicates while preserving
 * first-seen order.
 */
export function parseWordsInput(raw: string): string[] {
  const rawTokens = raw
    .split(/[\n,]/)
    .map((token) => token.trim())
    .filter((token) => token.length > 0)

  const seen = new Set<string>()
  const result: string[] = []
  for (const token of rawTokens) {
    const key = token.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    result.push(token)
  }
  return result
}
