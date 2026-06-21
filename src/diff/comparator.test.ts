import { describe, it, expect } from 'vitest'
import { compareFindings, rankIntroducedFindings } from './comparator.js'
import type { AgentFinding } from '../agents/base.js'
import type { ChangedFile } from './types.js'

let counter = 0
function finding(
  overrides: Partial<AgentFinding> & Pick<AgentFinding, 'severity'>
): AgentFinding {
  counter++
  return {
    id: `id-${counter}`,
    agentName: 'security',
    title: 'SQL injection in login',
    description: '',
    tags: [],
    scorePenalty: 0,
    ...overrides,
  }
}

const changed: ChangedFile[] = [
  { path: 'src/auth.ts', status: 'modified', additions: 1, deletions: 0, diff: '' },
]

describe('diff/comparator', () => {
  describe('compareFindings', () => {
    it('marks a finding not present in base as introduced', () => {
      const diff = compareFindings(
        [finding({ severity: 'critical', filePath: 'src/auth.ts', lineStart: 10 })],
        [],
        changed
      )
      expect(diff.introduced).toHaveLength(1)
      expect(diff.resolved).toHaveLength(0)
      expect(diff.unchanged).toHaveLength(0)
    })

    it('treats an exact fingerprint match as unchanged', () => {
      const f = finding({ severity: 'high', filePath: 'src/auth.ts', lineStart: 10 })
      const diff = compareFindings([f], [f], changed)
      expect(diff.unchanged).toHaveLength(1)
      expect(diff.introduced).toHaveLength(0)
    })

    it('treats a line-shifted match (within tolerance) as unchanged', () => {
      const base = finding({
        severity: 'high',
        filePath: 'src/auth.ts',
        lineStart: 10,
        title: 'SQL injection in login',
      })
      const head = finding({
        severity: 'high',
        filePath: 'src/auth.ts',
        lineStart: 15, // 5 lines away, within tolerance of 10
        title: 'SQL injection in login',
      })
      const diff = compareFindings([head], [base], changed)
      expect(diff.unchanged).toHaveLength(1)
    })

    it('ignores findings outside changed files', () => {
      const diff = compareFindings(
        [finding({ severity: 'critical', filePath: 'src/other.ts', lineStart: 1 })],
        [],
        changed
      )
      expect(diff.introduced).toHaveLength(0)
    })

    it('marks a base finding absent in head as resolved', () => {
      const diff = compareFindings(
        [],
        [finding({ severity: 'high', filePath: 'src/auth.ts', lineStart: 10 })],
        changed
      )
      expect(diff.resolved).toHaveLength(1)
    })
  })

  describe('rankIntroducedFindings', () => {
    it('orders by severity then penalty', () => {
      const ranked = rankIntroducedFindings([
        finding({ severity: 'low', scorePenalty: 0.5 }),
        finding({ severity: 'critical', scorePenalty: 10 }),
        finding({ severity: 'critical', scorePenalty: 5 }),
      ])
      expect(ranked.map((f) => f.severity)).toEqual(['critical', 'critical', 'low'])
      expect(ranked[0].scorePenalty).toBe(10)
      expect(ranked[1].scorePenalty).toBe(5)
    })
  })
})
