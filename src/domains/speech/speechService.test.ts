import { describe, expect, it } from 'vitest'
import { pickBestVoice } from './speechService'

function voice(name: string, lang: string): SpeechSynthesisVoice {
  return { name, lang, default: false, localService: true, voiceURI: name } as SpeechSynthesisVoice
}

describe('pickBestVoice', () => {
  it('returns null when there are no voices', () => {
    expect(pickBestVoice([])).toBeNull()
  })

  it('prefers Samantha when available among en-US voices', () => {
    const voices = [voice('Bad News', 'en-US'), voice('Samantha', 'en-US'), voice('Albert', 'en-US')]
    expect(pickBestVoice(voices)?.name).toBe('Samantha')
  })

  it('falls back to another preferred name in priority order', () => {
    const voices = [voice('Fred', 'en-US'), voice('Nicky', 'en-US')]
    expect(pickBestVoice(voices)?.name).toBe('Nicky')
  })

  it('prefers en-US over other English locales', () => {
    const voices = [voice('Daniel', 'en-GB'), voice('Samantha', 'en-US')]
    expect(pickBestVoice(voices)?.name).toBe('Samantha')
  })

  it('falls back to any English voice if no en-US voice exists', () => {
    const voices = [voice('Daniel', 'en-GB'), voice('Amelie', 'fr-FR')]
    expect(pickBestVoice(voices)?.name).toBe('Daniel')
  })

  it('falls back to the first voice if nothing else matches', () => {
    const voices = [voice('Amelie', 'fr-FR'), voice('Marie', 'fr-FR')]
    expect(pickBestVoice(voices)?.name).toBe('Amelie')
  })
})
