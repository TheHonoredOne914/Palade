import { describe, it, expect } from 'vitest'
import { mergeFindings, groupBySeverity } from './merger.js'
import type { AgentFinding } from '../agents/base.js'

let counter = 0
function finding(overrides: Partial<AgentFinding> & Pick<AgentFinding, 'severity'>): AgentFinding {
  counter++
  return {
    id: `id-${counter}`,
    agentName: 'security',
    title: 'SQL injection',
    description: 'short',
    tags: [],
    scorePenalty: 0,
    ...overrides,
  }
}

describe('orchestrator/merger', () => {
  describe('mergeFindings', () => {
    it('merges same-file, same-line, similar-title findings', () => {
      const a = finding({
        severity: 'high',
        filePath: 'src/auth.ts',
        lineStart: 10,
        title: 'SQL injection risk',
      })
      const b = finding({
        severity: 'critical',
        filePath: 'src/auth.ts',
        lineStart: 10,
        title: 'SQL injection vector',
      })
      const merged = mergeFindings([a, b])
      // character overlap of the two titles is > 0.7 -> merged into one
      expect(merged).toHaveLength(1)
      // keeps the more severe (critical)
      expect(merged[0].severity).toBe('critical')
    })

    it('keeps findings on different files separate', () => {
      const out = mergeFindings([
        finding({ severity: 'high', filePath: 'src/a.ts', lineStart: 1 }),
        finding({ severity: 'high', filePath: 'src/b.ts', lineStart: 1 }),
      ])
      expect(out).toHaveLength(2)
    })

    it('sorts output by severity (critical first)', () => {
      const out = mergeFindings([
        finding({ severity: 'low' }),
        finding({ severity: 'critical' }),
        finding({ severity: 'medium' }),
      ])
      expect(out.map((f) => f.severity)).toEqual(['critical', 'medium', 'low'])
    })

    it('passes through an empty list', () => {
      expect(mergeFindings([])).toEqual([])
    })
  })

  describe('groupBySeverity', () => {
    it('buckets every severity including info', () => {
      const groups = groupBySeverity([
        finding({ severity: 'critical' }),
        finding({ severity: 'high' }),
        finding({ severity: 'medium' }),
        finding({ severity: 'low' }),
        finding({ severity: 'info' }),
      ])
      expect(groups.critical).toHaveLength(1)
      expect(groups.high).toHaveLength(1)
      expect(groups.medium).toHaveLength(1)
      expect(groups.low).toHaveLength(1)
      expect(groups.info).toHaveLength(1)
    })
  })
})
