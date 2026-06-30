import { describe, it, expect } from 'vitest'
import { buildRagIndex, getRagContext } from './rag.js'
import type { CodeChunk } from './types.js'

describe('ingestion/rag', () => {
  const chunks: CodeChunk[] = [
    {
      id: 'chunk1',
      filePath: 'src/auth/service.ts',
      startLine: 1,
      endLine: 10,
      content: 'export class AuthService { login(user: User) { return true } }',
      symbolName: 'AuthService',
      tokenCount: 15,
      language: 'typescript',
    },
    {
      id: 'chunk2',
      filePath: 'src/db/user.ts',
      startLine: 1,
      endLine: 5,
      content: 'export interface User { id: string; email: string; }',
      symbolName: 'User',
      tokenCount: 10,
      language: 'typescript',
    },
    {
      id: 'chunk3',
      filePath: 'src/utils/math.ts',
      startLine: 1,
      endLine: 5,
      content: 'export function add(a: number, b: number) { return a + b }',
      symbolName: 'add',
      tokenCount: 12,
      language: 'typescript',
    },
  ]

  it('builds index and finds semantically related chunks via keyword overlap', () => {
    const index = buildRagIndex(chunks)

    // chunk1 (AuthService) references "User", so it should match chunk2 (User)
    const context = getRagContext(chunks[0], index)

    expect(context).toContain('[REPOSITORY CONTEXT (RAG)]')
    expect(context).toContain('src/db/user.ts (User)') // the matching file and symbol
    expect(context).not.toContain('src/utils/math.ts') // irrelevant chunk should not be returned
    expect(context).not.toContain('src/auth/service.ts') // should not return itself
  })

  it('returns empty string if no relevant chunks are found', () => {
    const index = buildRagIndex([chunks[2]]) // only math chunk
    const context = getRagContext(chunks[2], index)

    // should not match anything (since it filters itself out)
    expect(context).toBe('')
  })
})
