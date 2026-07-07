import { describe, it, expect } from 'vitest'
import { mergeContexts, contextBlockKey } from './pipeline.js'
import { buildRetrievedContext } from '../ingestion/contextPacks.js'
import { buildKeywordIndex, getKeywordContext } from '../ingestion/keywordIndex.js'
import type { CodeChunk } from '../ingestion/types.js'

describe('orchestrator/pipeline contextBlockKey', () => {
  it('keys on filePath + line range, ignoring the rest of the header', () => {
    const retrievedHeader = '// --- src/db/user.ts (score 10, lines 1-5) ---'
    const keywordHeader = '// --- src/db/user.ts (lines 1-5, User) ---'
    expect(contextBlockKey(retrievedHeader)).toBe(contextBlockKey(keywordHeader))
  })

  it('does not collapse different line ranges in the same file', () => {
    const a = '// --- src/db/user.ts (score 10, lines 1-5) ---'
    const b = '// --- src/db/user.ts (lines 20-25, User) ---'
    expect(contextBlockKey(a)).not.toBe(contextBlockKey(b))
  })
})

describe('orchestrator/pipeline mergeContexts', () => {
  it('dedups a block that both sources return for the exact same chunk', () => {
    const retrieved =
      '\n\n/* [REPOSITORY CONTEXT] */\n// --- src/db/user.ts (score 10, lines 1-5) ---\nexport interface User {}\n/* [END REPOSITORY CONTEXT] */\n\n'
    const keyword =
      '\n\n/* [REPOSITORY CONTEXT (KEYWORD)] */\n// --- src/db/user.ts (lines 1-5, User) ---\nexport interface User {}\n/* [END REPOSITORY CONTEXT] */\n\n'

    const merged = mergeContexts(retrieved, keyword)
    const occurrences = merged.split('export interface User {}').length - 1
    expect(occurrences).toBe(1)
  })

  it('keeps blocks for different chunks', () => {
    const retrieved =
      '\n\n/* [REPOSITORY CONTEXT] */\n// --- src/db/user.ts (score 10, lines 1-5) ---\nexport interface User {}\n/* [END REPOSITORY CONTEXT] */\n\n'
    const keyword =
      '\n\n/* [REPOSITORY CONTEXT (KEYWORD)] */\n// --- src/auth/service.ts (lines 1-10, AuthService) ---\nexport class AuthService {}\n/* [END REPOSITORY CONTEXT] */\n\n'

    const merged = mergeContexts(retrieved, keyword)
    expect(merged).toContain('export interface User {}')
    expect(merged).toContain('export class AuthService {}')
  })

  it('reproduces the real dedup path end-to-end via the actual context builders', () => {
    // Same scenario as the diagnostic finding: a chunk that both
    // buildRetrievedContext (import-based) and getKeywordContext
    // (keyword-based) surface for the same subject chunk.
    const subject: CodeChunk = {
      id: 'a',
      filePath: 'src/auth/service.ts',
      startLine: 1,
      endLine: 2,
      content: "import { getUser } from '../db/user'\nexport function login() { return getUser() }",
      symbolName: 'login',
      tokenCount: 20,
      language: 'typescript',
    }
    const user: CodeChunk = {
      id: 'b',
      filePath: 'src/db/user.ts',
      startLine: 1,
      endLine: 1,
      content: 'export function getUser() { return { id: 1 } }',
      symbolName: 'getUser',
      tokenCount: 10,
      language: 'typescript',
    }
    const allChunks = [subject, user]

    const retrieved = buildRetrievedContext(subject, allChunks)
    const index = buildKeywordIndex(allChunks)
    const keyword = getKeywordContext(subject, index)

    expect(retrieved).toContain('src/db/user.ts')
    expect(keyword).toContain('src/db/user.ts')

    const merged = mergeContexts(retrieved, keyword)
    const occurrences = merged.split('export function getUser()').length - 1
    expect(occurrences).toBe(1)
  })
})
