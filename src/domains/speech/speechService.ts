// Centralized speech synthesis. Every screen that needs to say a word calls
// speakWord() from here rather than touching window.speechSynthesis directly,
// so the underlying engine can be swapped for higher-quality generated audio
// later without touching Study/Practice screens.

export interface SpeakOptions {
  /** How many times to say the word back-to-back (Practice Test says it twice). */
  times?: number
  /** 0.75–0.85 reads clearly for kids without sounding robotic. */
  rate?: number
  onEnd?: () => void
}

let cachedVoices: SpeechSynthesisVoice[] = []
let selectedVoice: SpeechSynthesisVoice | null = null
let voicesReady = false

const PREFERRED_VOICE_NAMES = [
  'Samantha',
  'Ava',
  'Allison',
  'Susan',
  'Nicky',
  'Zoe',
  'Evan',
  'Google US English',
  'Microsoft Zira',
  'Microsoft David',
  'Microsoft Aria',
]

/** Pure so it can be unit tested with a fake voice list — no browser needed. */
export function pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  if (voices.length === 0) return null

  const enUS = voices.filter((v) => v.lang === 'en-US' || v.lang === 'en_US')
  let pool = enUS.length ? enUS : voices.filter((v) => /^en/i.test(v.lang))
  if (pool.length === 0) pool = voices

  for (const name of PREFERRED_VOICE_NAMES) {
    const match = pool.find((v) => v.name.includes(name))
    if (match) return match
  }

  const enhanced = pool.find((v) => /enhanced|premium/i.test(v.name))
  if (enhanced) return enhanced

  return pool[0]
}

function refreshVoices() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  const voices = window.speechSynthesis.getVoices()
  if (voices.length > 0) {
    cachedVoices = voices
    selectedVoice = pickBestVoice(voices)
    voicesReady = true
  }
}

export function initSpeechService() {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return
  refreshVoices()
  window.speechSynthesis.onvoiceschanged = refreshVoices
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

/**
 * Speaks a word (optionally repeated). Cancels any in-flight utterance first
 * so voices never overlap. Must be called from within a user gesture handler
 * on iOS Safari — never call this on page load.
 */
export function speakWord(word: string, options: SpeakOptions = {}): void {
  if (!isSpeechSupported()) {
    options.onEnd?.()
    return
  }
  if (!voicesReady) refreshVoices()

  window.speechSynthesis.cancel()

  const times = options.times ?? 1
  const rate = options.rate ?? 0.78
  let remaining = times

  const speakOnce = () => {
    if (remaining <= 0) {
      options.onEnd?.()
      return
    }
    remaining -= 1
    const utterance = new SpeechSynthesisUtterance(word)
    utterance.lang = 'en-US'
    utterance.rate = rate
    utterance.pitch = 1
    if (selectedVoice) utterance.voice = selectedVoice
    utterance.onend = speakOnce
    utterance.onerror = speakOnce
    window.speechSynthesis.speak(utterance)
  }

  speakOnce()
}

export interface SpeechStep {
  text: string
  rate?: number
}

/**
 * Not wired into any screen yet (spec §26/§25 — no example sentences are
 * generated in this iteration). Prepared so a future "hear it in a sentence"
 * feature can call one function instead of re-composing this sequence:
 * "Your word is {word}." → optional "{sentence}" → "{word}." once more.
 */
export function speakTestPrompt(word: string, sentence?: string | null, onEnd?: () => void): void {
  const steps: SpeechStep[] = [{ text: `Your word is ${word}.`, rate: 0.8 }]
  if (sentence) steps.push({ text: sentence, rate: 0.85 })
  steps.push({ text: `${word}.`, rate: 0.78 })
  speakSequence(steps, onEnd)
}

/** Speaks an arbitrary sequence of different phrases back-to-back, e.g. "Number 4", then the word twice. */
export function speakSequence(steps: SpeechStep[], onEnd?: () => void): void {
  if (!isSpeechSupported()) {
    onEnd?.()
    return
  }
  if (!voicesReady) refreshVoices()
  window.speechSynthesis.cancel()

  let i = 0
  const speakNext = () => {
    if (i >= steps.length) {
      onEnd?.()
      return
    }
    const step = steps[i++]
    const utterance = new SpeechSynthesisUtterance(step.text)
    utterance.lang = 'en-US'
    utterance.rate = step.rate ?? 0.78
    if (selectedVoice) utterance.voice = selectedVoice
    utterance.onend = speakNext
    utterance.onerror = speakNext
    window.speechSynthesis.speak(utterance)
  }
  speakNext()
}

/** Speaks a word letter by letter, slowly, e.g. for "Spell It". */
export function speakLetters(word: string, onEnd?: () => void): void {
  if (!isSpeechSupported()) {
    onEnd?.()
    return
  }
  if (!voicesReady) refreshVoices()
  window.speechSynthesis.cancel()

  const letters = word.split('')
  let index = 0

  const speakNext = () => {
    if (index >= letters.length) {
      onEnd?.()
      return
    }
    const utterance = new SpeechSynthesisUtterance(letters[index].toUpperCase())
    index += 1
    utterance.lang = 'en-US'
    utterance.rate = 0.65
    if (selectedVoice) utterance.voice = selectedVoice
    utterance.onend = speakNext
    utterance.onerror = speakNext
    window.speechSynthesis.speak(utterance)
  }

  speakNext()
}

export function cancelSpeech(): void {
  if (isSpeechSupported()) window.speechSynthesis.cancel()
}

export function getCachedVoices(): SpeechSynthesisVoice[] {
  return cachedVoices
}
