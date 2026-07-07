import { describe, it, expect } from 'vitest'
import { applyLineIgnores } from './annotationParser.js'
import type { AgentFinding } from '../agents/base.js'

function finding(overrides: Partial<AgentFinding> = {}): AgentFinding {
  return {
    id: 'f1',
    agentName: 'security',
    title: 'Test finding',
    description: 'desc',
    severity: 'medium',
    tags: [],
    scorePenalty: 5,
    filePath: 'src/a.ts',
    lineStart: 10,
    lineEnd: 10,
    ...overrides,
  }
}

describe('ingestion/annotationParser applyLineIgnores', () => {
  it('is a no-op when there are no ignored lines', () => {
    const findings = [finding()]
    expect(applyLineIgnores(findings, [])).toBe(findings)
  })

  it('drops a finding whose line matches an ignored line in the same file', () => {
    const findings = [finding({ filePath: 'src/a.ts', lineStart: 10, lineEnd: 10 })]
    const result = applyLineIgnores(findings, [{ filePath: 'src/a.ts', startLine: 10 }])
    expect(result).toEqual([])
  })

  it('keeps a finding in a different file at the same line number', () => {
    const findings = [finding({ filePath: 'src/b.ts', lineStart: 10, lineEnd: 10 })]
    const result = applyLineIgnores(findings, [{ filePath: 'src/a.ts', startLine: 10 }])
    expect(result).toEqual(findings)
  })

  it('keeps a finding whose range does not overlap the ignored line', () => {
    const findings = [finding({ filePath: 'src/a.ts', lineStart: 20, lineEnd: 25 })]
    const result = applyLineIgnores(findings, [{ filePath: 'src/a.ts', startLine: 10 }])
    expect(result).toEqual(findings)
  })

  it('drops a multi-line finding whose range spans the ignored line', () => {
    const findings = [finding({ filePath: 'src/a.ts', lineStart: 5, lineEnd: 15 })]
    const result = applyLineIgnores(findings, [{ filePath: 'src/a.ts', startLine: 10 }])
    expect(result).toEqual([])
  })

  it('keeps findings with no filePath or lineStart (nothing to match against)', () => {
    const findings = [finding({ filePath: undefined, lineStart: undefined })]
    const result = applyLineIgnores(findings, [{ filePath: 'src/a.ts', startLine: 10 }])
    expect(result).toEqual(findings)
  })

  it('normalizes leading ./ when comparing file paths', () => {
    const findings = [finding({ filePath: './src/a.ts', lineStart: 10, lineEnd: 10 })]
    const result = applyLineIgnores(findings, [{ filePath: 'src/a.ts', startLine: 10 }])
    expect(result).toEqual([])
  })
})
