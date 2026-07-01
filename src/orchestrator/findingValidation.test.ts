import { describe, expect, it } from 'vitest'
import { validateAndFingerprintFindings } from './findingValidation.js'
import type { AgentFinding } from '../agents/base.js'
import type { CodeChunk } from '../ingestion/types.js'

const chunks: CodeChunk[] = [
  {
    id: 'src/auth.ts:10-20',
    filePath: 'src/auth.ts',
    startLine: 10,
    endLine: 20,
    content: 'export function login() {\n  return true\n}',
    symbolName: 'login',
    tokenCount: 10,
    language: 'typescript',
  },
]

function finding(overrides: Partial<AgentFinding>): AgentFinding {
  return {
    id: 'id-1',
    agentName: 'security',
    severity: 'high',
    title: 'Missing auth check',
    description: 'The login path skips an authorization check.',
    filePath: 'src/auth.ts',
    lineStart: 12,
    lineEnd: 13,
    symbolName: 'login',
    tags: ['auth'],
    scorePenalty: 5,
    ...overrides,
  }
}

describe('orchestrator/findingValidation', () => {
  it('keeps findings whose file and lines are present in the reviewed chunks', () => {
    const [valid] = validateAndFingerprintFindings([finding({})], chunks)

    expect(valid.filePath).toBe('src/auth.ts')
    expect(valid.lineStart).toBe(12)
    expect(valid.findingFingerprint).toMatch(/^security:high:src\/auth\.ts:login:/)
  })

  it('drops findings that cite files outside the reviewed context', () => {
    const validated = validateAndFingerprintFindings(
      [finding({ filePath: 'src/not-reviewed.ts' })],
      chunks
    )

    expect(validated).toEqual([])
  })

  it('drops findings that cite impossible line ranges for the reviewed chunk', () => {
    const validated = validateAndFingerprintFindings([finding({ lineStart: 2 })], chunks)

    expect(validated).toEqual([])
  })

  it('normalizes fingerprints across title wording differences at the same location', () => {
    const [a, b] = validateAndFingerprintFindings(
      [
        finding({ id: 'a', title: 'Missing auth check' }),
        finding({ id: 'b', title: 'Authorization check missing' }),
      ],
      chunks
    )

    expect(a.findingFingerprint).toBe(b.findingFingerprint)
  })
})
