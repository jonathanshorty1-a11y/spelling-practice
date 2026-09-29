import { describe, expect, it } from 'vitest'
import { parseWordsInput } from './wordParsing'

describe('parseWordsInput', () => {
  it('splits one word per line', () => {
    expect(parseWordsInput('climb\nheight\ndrive')).toEqual(['climb', 'height', 'drive'])
  })

  it('splits comma-separated words', () => {
    expect(parseWordsInput('climb, height, drive')).toEqual(['climb', 'height', 'drive'])
  })

  it('handles a mix of newlines and commas', () => {
    expect(parseWordsInput('climb, height\ndrive,\nwildlife')).toEqual(['climb', 'height', 'drive', 'wildlife'])
  })

  it('trims whitespace and drops empty lines', () => {
    expect(parseWordsInput('  climb  \n\n  height \n')).toEqual(['climb', 'height'])
  })

  it('de-duplicates case-insensitively, keeping first occurrence', () => {
    expect(parseWordsInput('climb\nClimb\nCLIMB\nheight')).toEqual(['climb', 'height'])
  })

  it('returns an empty array for blank input', () => {
    expect(parseWordsInput('   \n\n  ')).toEqual([])
  })
})
