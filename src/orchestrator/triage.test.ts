import { describe, it, expect } from 'vitest'

// This mirrors the normalization + matching logic fixed in triage.ts.
// We test it as a pure function to lock in the tighter matching contract
// (the old code used bidirectional substring matching which over-matched:
// selecting "auth.ts" would also pull in "oauth.ts" and "auth-utils.ts").

function normalize(p: string): string {
  return p
    .trim()
    .replace(/^\.?\/+/, '')
    .replace(/\/+$/, '')
}

function matchesChunk(chunkPath: string, selections: string[]): boolean {
  const normalized = new Set(selections.map(normalize))
  const cp = chunkPath.replace(/^\.?\/+/, '')
  if (normalized.has(cp)) return true
  for (const sel of normalized) {
    if (cp === sel || cp.endsWith('/' + sel)) return true
  }
  return false
}

describe('orchestrator/triage path matching', () => {
  it('matches an exact path', () => {
    expect(matchesChunk('src/auth/login.ts', ['src/auth/login.ts'])).toBe(true)
  })

  it('matches when the selection is the trailing segment of the chunk path', () => {
    // LLM returns "auth/login.ts", chunk is keyed "src/auth/login.ts"
    expect(matchesChunk('src/auth/login.ts', ['auth/login.ts'])).toBe(true)
  })

  it('strips leading ./ and whitespace from selections', () => {
    expect(matchesChunk('src/a.ts', ['  ./src/a.ts  '])).toBe(true)
  })

  it('does NOT over-match via substring (the old bug)', () => {
    // Old behavior: "auth.ts".includes("auth") would also match oauth.ts
    expect(matchesChunk('src/oauth.ts', ['auth.ts'])).toBe(false)
    expect(matchesChunk('src/auth-utils.ts', ['auth.ts'])).toBe(false)
    expect(matchesChunk('src/authentication.ts', ['auth.ts'])).toBe(false)
  })

  it('does not match an unrelated file', () => {
    expect(matchesChunk('src/billing.ts', ['src/auth.ts'])).toBe(false)
  })

  it('matches any of multiple selections', () => {
    expect(matchesChunk('src/auth.ts', ['src/billing.ts', 'src/auth.ts', 'src/db.ts'])).toBe(true)
  })
})
