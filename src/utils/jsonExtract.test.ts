import { describe, it, expect } from 'vitest'
import { extractBalancedJson, salvageJsonStringArray } from './jsonExtract.js'

describe('salvageJsonStringArray', () => {
  it('recovers complete elements from an array truncated mid-element', () => {
    const truncated = '["src/a.ts", "src/b.ts", "src/c'
    expect(salvageJsonStringArray(truncated)).toEqual(['src/a.ts', 'src/b.ts'])
  })

  it('recovers elements when the array is preceded by prose', () => {
    const text = 'Here is the ranking:\n["src/auth.ts", "src/api.ts"'
    expect(salvageJsonStringArray(text)).toEqual(['src/auth.ts', 'src/api.ts'])
  })

  it('unescapes JSON string escapes', () => {
    const text = '["src\\\\win\\\\path.ts", "b.ts'
    expect(salvageJsonStringArray(text)).toEqual(['src\\win\\path.ts'])
  })

  it('returns null when there is no array or no complete string', () => {
    expect(salvageJsonStringArray('no array here')).toBeNull()
    expect(salvageJsonStringArray('["truncated-mid-first')).toBeNull()
  })
})

describe('extractBalancedJson', () => {
  it('extracts a balanced array ignoring brackets inside strings', () => {
    const text = 'note [see] here: ["a[0].ts", "b.ts"] trailing'
    // first balanced bracket region is the stray "[see]"
    expect(extractBalancedJson(text, '[', ']')).toBe('[see]')
  })

  it('returns null on unbalanced input', () => {
    expect(extractBalancedJson('["a.ts", "b.ts"', '[', ']')).toBeNull()
  })
})
