import { describe, expect, it } from 'vitest'
import { buildRetrievedContext } from './contextPacks.js'
import type { CodeChunk } from './types.js'

function chunk(id: string, filePath: string, content: string): CodeChunk {
  return {
    id,
    filePath,
    startLine: 1,
    endLine: content.split('\n').length,
    content,
    tokenCount: Math.ceil(content.length / 4),
    language: 'typescript',
  }
}

describe('ingestion/contextPacks', () => {
  it('retrieves imported and matching test context without returning unrelated chunks', () => {
    const subject = chunk(
      'a',
      'src/auth/service.ts',
      "import { getUser } from '../db/user'\nexport function login() { return getUser() }"
    )
    const user = chunk('b', 'src/db/user.ts', 'export function getUser() { return { id: 1 } }')
    const test = chunk('c', 'src/auth/service.test.ts', 'import { login } from "./service"')
    const unrelated = chunk('d', 'src/ui/button.ts', 'export function Button() { return null }')

    const context = buildRetrievedContext(subject, [subject, user, test, unrelated])

    expect(context).toContain('[REPOSITORY CONTEXT]')
    expect(context).toContain('src/db/user.ts')
    expect(context).toContain('src/auth/service.test.ts')
    expect(context).not.toContain('src/ui/button.ts')
  })

  it('returns an empty string when there is no useful related context', () => {
    const subject = chunk('a', 'src/a.ts', 'export const a = 1')
    const unrelated = chunk('b', 'src/b.ts', 'export const b = 2')

    expect(buildRetrievedContext(subject, [subject, unrelated])).toBe('')
  })
})
